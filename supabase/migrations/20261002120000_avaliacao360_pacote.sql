

















BEGIN;


CREATE TABLE IF NOT EXISTS public.rh_aval360_aviso (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ciclo_id    UUID NOT NULL REFERENCES public.rh_aval360_ciclo(id) ON DELETE RESTRICT,
  tipo        TEXT NOT NULL CHECK (tipo IN ('abertura', 'lembrete_3', 'lembrete_1')),
  enviados    INT NOT NULL DEFAULT 0,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ciclo_id, tipo)
);
ALTER TABLE public.rh_aval360_aviso ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aval360_aviso_service ON public.rh_aval360_aviso;
CREATE POLICY aval360_aviso_service ON public.rh_aval360_aviso FOR ALL TO service_role USING (true) WITH CHECK (true);


ALTER TABLE public.rh_aval360_entrega ADD COLUMN IF NOT EXISTS plano JSONB;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rh_aval360_entrega_plano_ck') THEN
    ALTER TABLE public.rh_aval360_entrega ADD CONSTRAINT rh_aval360_entrega_plano_ck
      CHECK (plano IS NULL OR (jsonb_typeof(plano) = 'array' AND jsonb_array_length(plano) <= 5));
  END IF;
END $$;
COMMENT ON COLUMN public.rh_aval360_entrega.plano IS
  'Plano de ação combinado na devolutiva: [{texto, prazo}] (até 5). A pessoa avaliada também vê.';

CREATE OR REPLACE FUNCTION public.fn_aval360_mudar_status(p_ciclo_id uuid, p_para text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ciclo rh_aval360_ciclo%ROWTYPE;
  v_hoje date := (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date;
  v_abaixo int := 0;
BEGIN
  SELECT * INTO v_ciclo FROM rh_aval360_ciclo WHERE id = p_ciclo_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ciclo não encontrado.' USING ERRCODE = 'P0403'; END IF;
  IF NOT ((v_ciclo.status = 'rascunho'  AND p_para = 'coleta')
       OR (v_ciclo.status = 'apuracao'  AND p_para = 'coleta')   
       OR (v_ciclo.status = 'coleta'    AND p_para = 'apuracao')
       OR (v_ciclo.status = 'apuracao'  AND p_para = 'publicado')
       OR (v_ciclo.status = 'publicado' AND p_para = 'encerrado')) THEN
    RAISE EXCEPTION 'Não é possível ir de % para %.', v_ciclo.status, p_para USING ERRCODE = 'P0409';
  END IF;

  
  IF v_ciclo.status = 'apuracao' AND p_para = 'coleta' THEN
    IF v_ciclo.coleta_ate IS NULL OR v_ciclo.coleta_ate < v_hoje THEN
      RAISE EXCEPTION 'Para reabrir, defina um novo prazo de respostas a partir de hoje.' USING ERRCODE = 'P0409';
    END IF;
    UPDATE rh_aval360_ciclo SET status = 'coleta' WHERE id = p_ciclo_id;
    RETURN jsonb_build_object('ok', true, 'de', 'apuracao', 'para', 'coleta', 'reaberto', true);
  END IF;

  IF p_para = 'coleta' THEN
    IF NOT EXISTS (SELECT 1 FROM rh_aval360_pergunta WHERE ciclo_id = p_ciclo_id AND deleted_at IS NULL) THEN
      RAISE EXCEPTION 'Escreva as perguntas do ciclo antes de enviar.' USING ERRCODE = 'P0409';
    END IF;
    IF v_ciclo.coleta_ate IS NULL OR v_ciclo.coleta_ate < v_hoje THEN
      RAISE EXCEPTION 'Defina um prazo de respostas a partir de hoje.' USING ERRCODE = 'P0409';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM rh_aval360_convite
      WHERE ciclo_id = p_ciclo_id AND deleted_at IS NULL AND suprimido_em IS NULL) THEN
      RAISE EXCEPTION 'Monte a lista de avaliadores antes de enviar.' USING ERRCODE = 'P0409';
    END IF;
    
    UPDATE rh_aval360_convite c SET suprimido_em = now(), suprimido_motivo = 'abaixo_do_piso'
      WHERE NOT COALESCE((v_ciclo.config->>'mostrar_abaixo_do_piso')::boolean, false)
        AND c.ciclo_id = p_ciclo_id AND c.papel IN ('par', 'liderado')
        AND c.deleted_at IS NULL AND c.suprimido_em IS NULL
        AND (SELECT count(DISTINCT o.avaliador_id) FROM rh_aval360_convite o
             WHERE o.ciclo_id = c.ciclo_id AND o.avaliado_id = c.avaliado_id AND o.papel = c.papel
               AND o.deleted_at IS NULL AND o.suprimido_em IS NULL) < v_ciclo.piso_respondentes;
    GET DIAGNOSTICS v_abaixo = ROW_COUNT;
  END IF;

  UPDATE rh_aval360_ciclo SET status = p_para WHERE id = p_ciclo_id;
  RETURN jsonb_build_object('ok', true, 'de', v_ciclo.status, 'para', p_para, 'suprimidos_abaixo_do_piso', v_abaixo);
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_aval360_formulario(p_convite_id uuid, p_avaliador_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_convite rh_aval360_convite%ROWTYPE;
  v_ciclo rh_aval360_ciclo%ROWTYPE;
  v_avaliado rh_funcionarios%ROWTYPE;
  v_perguntas jsonb;
  v_minhas jsonb;
  v_hoje date := (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  SELECT * INTO v_convite FROM rh_aval360_convite
    WHERE id = p_convite_id AND avaliador_id = p_avaliador_id
      AND deleted_at IS NULL AND suprimido_em IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Convite indisponível para este colaborador.' USING ERRCODE = 'P0403'; END IF;
  IF v_convite.papel = 'par' AND v_convite.aprovado_em IS NULL THEN
    RAISE EXCEPTION 'A indicação de par ainda não foi aprovada.' USING ERRCODE = 'P0409';
  END IF;
  SELECT * INTO v_ciclo FROM rh_aval360_ciclo WHERE id = v_convite.ciclo_id AND deleted_at IS NULL;
  IF NOT FOUND OR v_ciclo.status <> 'coleta' OR v_ciclo.coleta_ate < v_hoje THEN
    RAISE EXCEPTION 'A janela de respostas deste ciclo não está aberta.' USING ERRCODE = 'P0409';
  END IF;
  IF v_ciclo.periodo_inicio > v_hoje THEN
    RAISE EXCEPTION 'Esta avaliação abre em %.', to_char(v_ciclo.periodo_inicio, 'DD/MM/YYYY') USING ERRCODE = 'P0409';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM rh_funcionarios WHERE id = p_avaliador_id AND status = 'ativo' AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Colaborador indisponível.' USING ERRCODE = 'P0403';
  END IF;
  IF v_convite.papel IN ('par', 'liderado')
    AND NOT COALESCE((v_ciclo.config->>'mostrar_abaixo_do_piso')::boolean, false)
    AND (SELECT count(DISTINCT c.avaliador_id)
    FROM rh_aval360_convite c JOIN rh_funcionarios f ON f.id = c.avaliador_id
    WHERE c.ciclo_id = v_ciclo.id AND c.avaliado_id = v_convite.avaliado_id AND c.papel = v_convite.papel
      AND c.deleted_at IS NULL AND c.suprimido_em IS NULL AND f.deleted_at IS NULL AND f.status = 'ativo'
      AND (c.papel <> 'par' OR c.aprovado_em IS NOT NULL)) < v_ciclo.piso_respondentes THEN
    RAISE EXCEPTION 'Este papel não atingiu o piso de participantes para coleta.' USING ERRCODE = 'P0409';
  END IF;
  SELECT * INTO v_avaliado FROM rh_funcionarios WHERE id = v_convite.avaliado_id AND status = 'ativo' AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Avaliado indisponível.' USING ERRCODE = 'P0409'; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', p.id, 'texto', p.texto, 'ajuda', p.ajuda,
    'competencia_id', cp.id, 'criterio', cp.nome, 'eixo', cp.eixo) ORDER BY p.ordem, p.id), '[]'::jsonb)
    INTO v_perguntas
  FROM rh_aval360_pergunta p JOIN rh_aval360_competencia cp ON cp.id = p.competencia_id
  WHERE p.ciclo_id = v_ciclo.id AND p.deleted_at IS NULL AND cp.deleted_at IS NULL
    AND (cp.aplica_a = 'todos'
      OR (cp.aplica_a = 'area' AND cp.area = v_avaliado.area)
      OR (cp.aplica_a = 'gestores' AND EXISTS (SELECT 1 FROM rh_funcionarios f
        WHERE f.gestor_id = v_avaliado.id AND f.id <> v_avaliado.id AND f.status = 'ativo' AND f.deleted_at IS NULL)));

  
  
  
  IF v_convite.respondido_em IS NOT NULL AND COALESCE((v_ciclo.config->>'permitir_edicao')::boolean, false) THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object('pergunta_id', n.pergunta_id, 'nota', n.nota, 'comentario', n.comentario)), '[]'::jsonb)
      INTO v_minhas
    FROM rh_aval360_resposta r JOIN rh_aval360_nota n ON n.resposta_id = r.id
    WHERE r.convite_id = v_convite.id AND r.deleted_at IS NULL;
  END IF;

  RETURN jsonb_build_object('convite', jsonb_build_object('id', v_convite.id,
    'papel', v_convite.papel, 'avaliado_id', v_convite.avaliado_id, 'ciclo_id', v_convite.ciclo_id,
    'respondido_em', v_convite.respondido_em,
    'ciclo', jsonb_build_object('id', v_ciclo.id, 'nome', v_ciclo.nome, 'status', v_ciclo.status,
      'escala_max', v_ciclo.escala_max, 'descricao', v_ciclo.descricao),
    'avaliado', jsonb_build_object('id', v_avaliado.id, 'nome', v_avaliado.nome, 'cargo', v_avaliado.cargo, 'area', v_avaliado.area)),
    'perguntas', v_perguntas, 'escala_max', v_ciclo.escala_max, 'escala_rotulos', v_ciclo.escala_rotulos,
    'pode_editar', v_convite.respondido_em IS NOT NULL AND COALESCE((v_ciclo.config->>'permitir_edicao')::boolean, false),
    'minhas_notas', v_minhas,
    'comentario_obrigatorio', CASE WHEN v_convite.papel = 'auto'
      THEN COALESCE((v_ciclo.config->>'exigir_comentario_auto')::boolean, false)
      ELSE COALESCE((v_ciclo.config->>'exigir_comentario_avaliadores')::boolean, false) END);
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_aval360_resultado(p_ciclo_id uuid, p_avaliado_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ciclo rh_aval360_ciclo%ROWTYPE;
  v_piso int;
  v_baixo numeric;
  v_alto numeric;
  v_papeis jsonb;
  v_criterios jsonb;
  v_eixo_res numeric;
  v_eixo_comp numeric;
  v_geral numeric;
  v_nivel_res text;
  v_nivel_comp text;
  v_entrega jsonb;
BEGIN
  SELECT * INTO v_ciclo FROM rh_aval360_ciclo WHERE id = p_ciclo_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ciclo não encontrado.' USING ERRCODE = 'P0403'; END IF;
  IF v_ciclo.status NOT IN ('apuracao', 'publicado', 'encerrado') THEN
    RAISE EXCEPTION 'O resultado só existe depois que as respostas são encerradas.' USING ERRCODE = 'P0409';
  END IF;
  v_piso := GREATEST(v_ciclo.piso_respondentes, 3);
  v_baixo := COALESCE(v_ciclo.corte_baixo, round(1 + (v_ciclo.escala_max - 1) * 0.26, 2));
  v_alto  := COALESCE(v_ciclo.corte_alto,  round(1 + (v_ciclo.escala_max - 1) * 0.76, 2));

  
  WITH resp AS (
    SELECT r.papel, count(*)::int AS n FROM rh_aval360_resposta r
    WHERE r.ciclo_id = p_ciclo_id AND r.avaliado_id = p_avaliado_id AND r.deleted_at IS NULL
    GROUP BY r.papel)
  SELECT COALESCE(jsonb_object_agg(papel, jsonb_build_object('respondentes', n,
           'visivel', papel IN ('auto', 'gestor') OR n >= v_piso
             OR COALESCE((v_ciclo.config->>'mostrar_abaixo_do_piso')::boolean, false))), '{}'::jsonb)
    INTO v_papeis FROM resp;

  WITH vis AS (
    SELECT key AS papel FROM jsonb_each(v_papeis) WHERE (value->>'visivel')::boolean),
  notas AS (
    SELECT r.papel, nt.id, nt.competencia_id, nt.pergunta_id, pg.texto AS pergunta, nt.nota, nt.comentario
    FROM rh_aval360_resposta r JOIN rh_aval360_nota nt ON nt.resposta_id = r.id
    LEFT JOIN rh_aval360_pergunta pg ON pg.id = nt.pergunta_id
    WHERE r.ciclo_id = p_ciclo_id AND r.avaliado_id = p_avaliado_id AND r.deleted_at IS NULL
      AND r.papel IN (SELECT papel FROM vis)),
  comps AS (
    SELECT cp.id, cp.nome, cp.descricao, cp.eixo, cc.peso, cc.ordem, cc.visivel
    FROM rh_aval360_ciclo_competencia cc JOIN rh_aval360_competencia cp ON cp.id = cc.competencia_id
    WHERE cc.ciclo_id = p_ciclo_id AND cc.deleted_at IS NULL),
  
  por_pergunta AS (
    SELECT pg.id, pg.competencia_id, pg.texto, pg.ordem,
      avg(n.nota) FILTER (WHERE n.papel = 'auto')               AS auto,
      avg(n.nota) FILTER (WHERE n.papel = 'gestor')             AS gestor,
      avg(n.nota) FILTER (WHERE n.papel IN ('par', 'liderado')) AS outros
    FROM rh_aval360_pergunta pg LEFT JOIN notas n ON n.pergunta_id = pg.id
    WHERE pg.ciclo_id = p_ciclo_id AND pg.deleted_at IS NULL
    GROUP BY pg.id, pg.competencia_id, pg.texto, pg.ordem),
  medias AS (
    SELECT c.id,
      avg(n.nota) FILTER (WHERE n.papel = 'auto')                   AS auto,
      avg(n.nota) FILTER (WHERE n.papel = 'gestor')                 AS gestor,
      avg(n.nota) FILTER (WHERE n.papel = 'par')                    AS par,
      avg(n.nota) FILTER (WHERE n.papel = 'liderado')               AS liderado,
      avg(n.nota) FILTER (WHERE n.papel IN ('par', 'liderado'))     AS outros
    FROM comps c LEFT JOIN notas n ON n.competencia_id = c.id GROUP BY c.id),
  fc AS (
    
    SELECT m.*, (
      COALESCE(v_ciclo.peso_auto * m.auto, 0) + COALESCE(v_ciclo.peso_gestor * m.gestor, 0)
      + COALESCE(v_ciclo.peso_outros * m.outros, 0))
      / NULLIF((CASE WHEN m.auto IS NULL THEN 0 ELSE v_ciclo.peso_auto END)
             + (CASE WHEN m.gestor IS NULL THEN 0 ELSE v_ciclo.peso_gestor END)
             + (CASE WHEN m.outros IS NULL THEN 0 ELSE v_ciclo.peso_outros END), 0) AS calculado
    FROM medias m),
  finais AS (
    
    
    
    SELECT fc.*, cal.nota AS calibrada, cal.justificativa, COALESCE(cal.nota, fc.calculado) AS final
    FROM fc LEFT JOIN rh_aval360_calibragem cal
      ON cal.ciclo_id = p_ciclo_id AND cal.avaliado_id = p_avaliado_id
     AND cal.competencia_id = fc.id AND cal.deleted_at IS NULL)
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'competencia_id', c.id, 'nome', c.nome, 'descricao', c.descricao, 'eixo', c.eixo,
      'peso', c.peso, 'visivel', c.visivel,
      'auto', round(f.auto, 2), 'gestor', round(f.gestor, 2), 'par', round(f.par, 2),
      'liderado', round(f.liderado, 2), 'outros', round(f.outros, 2), 'final', round(f.final, 2),
      'calculado', round(f.calculado, 2), 'calibrado', f.calibrada IS NOT NULL, 'justificativa', f.justificativa,
      'perguntas', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('pergunta_id', pp.id, 'texto', pp.texto,
          'auto', round(pp.auto, 2), 'gestor', round(pp.gestor, 2), 'outros', round(pp.outros, 2),
          'final', round((COALESCE(v_ciclo.peso_auto * pp.auto, 0) + COALESCE(v_ciclo.peso_gestor * pp.gestor, 0)
            + COALESCE(v_ciclo.peso_outros * pp.outros, 0))
            / NULLIF((CASE WHEN pp.auto IS NULL THEN 0 ELSE v_ciclo.peso_auto END)
                   + (CASE WHEN pp.gestor IS NULL THEN 0 ELSE v_ciclo.peso_gestor END)
                   + (CASE WHEN pp.outros IS NULL THEN 0 ELSE v_ciclo.peso_outros END), 0), 2))
          ORDER BY pp.ordem, pp.id)
        FROM por_pergunta pp WHERE pp.competencia_id = c.id), '[]'::jsonb),
      'comentarios', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('papel', n.papel, 'texto', n.comentario, 'pergunta', n.pergunta)
                 ORDER BY md5(n.id::text || p_ciclo_id::text))
        FROM notas n WHERE n.competencia_id = c.id AND n.comentario IS NOT NULL AND btrim(n.comentario) <> ''),
        '[]'::jsonb)
    ) ORDER BY c.ordem, c.id), '[]'::jsonb),
    sum(f.final * c.peso) FILTER (WHERE c.eixo = 'resultado' AND f.final IS NOT NULL)
      / NULLIF(sum(c.peso) FILTER (WHERE c.eixo = 'resultado' AND f.final IS NOT NULL), 0),
    sum(f.final * c.peso) FILTER (WHERE c.eixo = 'comportamento' AND f.final IS NOT NULL)
      / NULLIF(sum(c.peso) FILTER (WHERE c.eixo = 'comportamento' AND f.final IS NOT NULL), 0),
    sum(f.final * c.peso) FILTER (WHERE f.final IS NOT NULL)
      / NULLIF(sum(c.peso) FILTER (WHERE f.final IS NOT NULL), 0)
  INTO v_criterios, v_eixo_res, v_eixo_comp, v_geral
  FROM comps c JOIN finais f ON f.id = c.id;

  v_nivel_res  := CASE WHEN v_eixo_res  IS NULL THEN NULL WHEN v_eixo_res  <= v_baixo THEN 'baixo'
                       WHEN v_eixo_res  >= v_alto THEN 'alto' ELSE 'medio' END;
  v_nivel_comp := CASE WHEN v_eixo_comp IS NULL THEN NULL WHEN v_eixo_comp <= v_baixo THEN 'baixo'
                       WHEN v_eixo_comp >= v_alto THEN 'alto' ELSE 'medio' END;

  SELECT jsonb_build_object('liberado_em', e.liberado_em, 'devolutiva_dia', e.devolutiva_dia,
           'devolutiva_obs', e.devolutiva_obs, 'plano', COALESCE(e.plano, '[]'::jsonb))
    INTO v_entrega FROM rh_aval360_entrega e
    WHERE e.ciclo_id = p_ciclo_id AND e.avaliado_id = p_avaliado_id AND e.deleted_at IS NULL;

  RETURN jsonb_build_object(
    'ciclo', jsonb_build_object('id', v_ciclo.id, 'nome', v_ciclo.nome, 'status', v_ciclo.status,
      'escala_max', v_ciclo.escala_max, 'escala_rotulos', v_ciclo.escala_rotulos,
      'peso_auto', v_ciclo.peso_auto, 'peso_gestor', v_ciclo.peso_gestor, 'peso_outros', v_ciclo.peso_outros,
      'piso', v_piso, 'corte_baixo', v_baixo, 'corte_alto', v_alto, 'config', v_ciclo.config),
    'avaliado', (SELECT jsonb_build_object('id', f.id, 'nome', f.nome, 'cargo', f.cargo, 'area', f.area)
                 FROM rh_funcionarios f WHERE f.id = p_avaliado_id),
    'papeis', v_papeis,
    'criterios', v_criterios,
    'eixo_resultado', round(v_eixo_res, 2),
    'eixo_comportamento', round(v_eixo_comp, 2),
    'final', round(v_geral, 2),
    'nivel_resultado', v_nivel_res,
    'nivel_comportamento', v_nivel_comp,
    'quadrante', CASE v_nivel_comp || '/' || v_nivel_res
      WHEN 'alto/baixo'  THEN 'Diamante bruto'   WHEN 'alto/medio'  THEN 'Forte desempenho'
      WHEN 'alto/alto'   THEN 'Estrela'
      WHEN 'medio/baixo' THEN 'Questionável'     WHEN 'medio/medio' THEN 'Mantenedor'
      WHEN 'medio/alto'  THEN 'Forte desempenho'
      WHEN 'baixo/baixo' THEN 'Insuficiente'     WHEN 'baixo/medio' THEN 'Eficaz'
      WHEN 'baixo/alto'  THEN 'Comprometido' END,
    'calibrado', EXISTS (SELECT 1 FROM jsonb_array_elements(v_criterios) e WHERE (e->>'calibrado')::boolean),
    'entrega', COALESCE(v_entrega, '{}'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_aval360_resultados_ciclo(p_ciclo_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_out jsonb := '[]'::jsonb;
  v_r jsonb;
  v_id uuid;
BEGIN
  FOR v_id IN
    SELECT DISTINCT c.avaliado_id FROM rh_aval360_convite c
    WHERE c.ciclo_id = p_ciclo_id AND c.deleted_at IS NULL
  LOOP
    v_r := fn_aval360_resultado(p_ciclo_id, v_id);
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'avaliado', v_r->'avaliado', 'papeis', v_r->'papeis', 'final', v_r->'final',
      'eixo_resultado', v_r->'eixo_resultado', 'eixo_comportamento', v_r->'eixo_comportamento',
      'nivel_resultado', v_r->'nivel_resultado', 'nivel_comportamento', v_r->'nivel_comportamento',
      'quadrante', v_r->'quadrante', 'entrega', v_r->'entrega', 'calibrado', v_r->'calibrado',
      
      'auto',     (SELECT round(avg((e->>'auto')::numeric), 2)     FROM jsonb_array_elements(v_r->'criterios') e),
      'gestor',   (SELECT round(avg((e->>'gestor')::numeric), 2)   FROM jsonb_array_elements(v_r->'criterios') e),
      'outros',   (SELECT round(avg((e->>'outros')::numeric), 2)   FROM jsonb_array_elements(v_r->'criterios') e),
      'par',      (SELECT round(avg((e->>'par')::numeric), 2)      FROM jsonb_array_elements(v_r->'criterios') e),
      'liderado', (SELECT round(avg((e->>'liderado')::numeric), 2) FROM jsonb_array_elements(v_r->'criterios') e),
      
      'criterios', (SELECT COALESCE(jsonb_agg(jsonb_build_object('competencia_id', e->'competencia_id',
        'nome', e->'nome', 'eixo', e->'eixo', 'final', e->'final', 'calibrado', e->'calibrado')), '[]'::jsonb)
        FROM jsonb_array_elements(v_r->'criterios') e)));
  END LOOP;
  RETURN v_out;
END;
$$;


CREATE OR REPLACE FUNCTION public.fn_aval360_reativar_abaixo_piso(p_ciclo_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status text;
  v_n int;
BEGIN
  SELECT status INTO v_status FROM rh_aval360_ciclo WHERE id = p_ciclo_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ciclo não encontrado.' USING ERRCODE = 'P0403'; END IF;
  IF v_status NOT IN ('rascunho', 'coleta') THEN RETURN jsonb_build_object('ok', true, 'reativados', 0); END IF;
  UPDATE rh_aval360_convite SET suprimido_em = NULL, suprimido_motivo = NULL
    WHERE ciclo_id = p_ciclo_id AND suprimido_motivo = 'abaixo_do_piso' AND deleted_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'reativados', v_n);
END;
$$;


CREATE OR REPLACE FUNCTION public.fn_aval360_editar_resposta(p_convite_id uuid, p_avaliador_id uuid, p_notas jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ciclo_id uuid;
  v_convite rh_aval360_convite%ROWTYPE;
  v_form jsonb;
  v_nota jsonb;
  v_resposta uuid;
  v_esperadas text[];
  v_recebidas text[];
BEGIN
  SELECT ciclo_id INTO v_ciclo_id FROM rh_aval360_convite
    WHERE id = p_convite_id AND avaliador_id = p_avaliador_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Convite indisponível para este colaborador.' USING ERRCODE = 'P0403'; END IF;
  PERFORM 1 FROM rh_aval360_ciclo WHERE id = v_ciclo_id FOR UPDATE;
  SELECT * INTO v_convite FROM rh_aval360_convite WHERE id = p_convite_id FOR UPDATE;
  v_form := fn_aval360_formulario(p_convite_id, p_avaliador_id);   
  IF NOT COALESCE((v_form->>'pode_editar')::boolean, false) THEN
    RAISE EXCEPTION 'A edição de respostas não está liberada nesta avaliação.' USING ERRCODE = 'P0409';
  END IF;
  SELECT id INTO v_resposta FROM rh_aval360_resposta WHERE convite_id = p_convite_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Não há resposta para editar.' USING ERRCODE = 'P0409'; END IF;

  IF p_notas IS NULL OR jsonb_typeof(p_notas) <> 'array' OR jsonb_array_length(p_notas) = 0 OR jsonb_array_length(p_notas) > 500 THEN
    RAISE EXCEPTION 'Envie a lista de notas.' USING ERRCODE = 'P0400';
  END IF;
  SELECT array_agg(c->>'id' ORDER BY c->>'id') INTO v_esperadas FROM jsonb_array_elements(v_form->'perguntas') c;
  SELECT array_agg(n->>'pergunta_id' ORDER BY n->>'pergunta_id') INTO v_recebidas FROM jsonb_array_elements(p_notas) n;
  IF v_esperadas IS NULL OR v_recebidas IS DISTINCT FROM v_esperadas THEN
    RAISE EXCEPTION 'Responda exatamente as perguntas deste formulário, sem repetições.' USING ERRCODE = 'P0400';
  END IF;
  FOR v_nota IN SELECT value FROM jsonb_array_elements(p_notas) LOOP
    IF jsonb_typeof(v_nota->'nota') IS DISTINCT FROM 'number'
      OR (v_nota->>'nota')::numeric <> trunc((v_nota->>'nota')::numeric)
      OR (v_nota->>'nota')::numeric < 1 OR (v_nota->>'nota')::numeric > (v_form->>'escala_max')::int THEN
      RAISE EXCEPTION 'Nota fora da escala do ciclo.' USING ERRCODE = 'P0400';
    END IF;
    IF v_nota ? 'comentario' AND v_nota->'comentario' <> 'null'::jsonb AND
      (jsonb_typeof(v_nota->'comentario') <> 'string' OR length(v_nota->>'comentario') > 5000) THEN
      RAISE EXCEPTION 'O comentário deve ser um texto de até 5.000 caracteres.' USING ERRCODE = 'P0400';
    END IF;
    IF (v_form->>'comentario_obrigatorio')::boolean AND length(btrim(COALESCE(v_nota->>'comentario', ''))) < 3 THEN
      RAISE EXCEPTION 'Nesta avaliação o comentário é obrigatório em todas as perguntas.' USING ERRCODE = 'P0400';
    END IF;
  END LOOP;

  
  DELETE FROM rh_aval360_nota WHERE resposta_id = v_resposta;
  INSERT INTO rh_aval360_nota(resposta_id, pergunta_id, competencia_id, nota, comentario)
    SELECT v_resposta, p.id, p.competencia_id, (n->>'nota')::numeric::int, NULLIF(btrim(n->>'comentario'), '')
    FROM jsonb_array_elements(p_notas) n JOIN rh_aval360_pergunta p ON p.id = (n->>'pergunta_id')::uuid;
  RETURN jsonb_build_object('ok', true, 'editado', true);
END;
$$;


CREATE OR REPLACE FUNCTION public.fn_aval360_plano(
  p_ciclo_id uuid, p_avaliado_id uuid, p_por uuid, p_eh_rh boolean, p_plano jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status text;
  v_n int;
BEGIN
  SELECT status INTO v_status FROM rh_aval360_ciclo WHERE id = p_ciclo_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ciclo não encontrado.' USING ERRCODE = 'P0403'; END IF;
  IF v_status NOT IN ('publicado', 'encerrado') THEN
    RAISE EXCEPTION 'O plano de ação é combinado depois de publicar os resultados.' USING ERRCODE = 'P0409';
  END IF;
  IF NOT COALESCE(p_eh_rh, false) AND NOT fn_aval360_eh_gestor(p_ciclo_id, p_avaliado_id, p_por) THEN
    RAISE EXCEPTION 'Só o gestor desta pessoa no ciclo, ou o RH, registra o plano.' USING ERRCODE = 'P0403';
  END IF;
  IF p_plano IS NULL OR jsonb_typeof(p_plano) <> 'array' OR jsonb_array_length(p_plano) > 5 THEN
    RAISE EXCEPTION 'O plano tem de 0 a 5 ações.' USING ERRCODE = 'P0400';
  END IF;
  SELECT count(*) INTO v_n FROM jsonb_array_elements(p_plano) a
    WHERE jsonb_typeof(a->'texto') = 'string' AND length(btrim(a->>'texto')) BETWEEN 3 AND 300
      AND (a->'prazo' IS NULL OR a->'prazo' = 'null'::jsonb OR (a->>'prazo') ~ '^\d{4}-\d{2}-\d{2}$');
  IF v_n <> jsonb_array_length(p_plano) THEN
    RAISE EXCEPTION 'Cada ação precisa de um texto (3 a 300 caracteres) e, se tiver, um prazo válido.' USING ERRCODE = 'P0400';
  END IF;
  INSERT INTO rh_aval360_entrega(ciclo_id, avaliado_id) VALUES (p_ciclo_id, p_avaliado_id)
    ON CONFLICT (ciclo_id, avaliado_id) DO NOTHING;
  UPDATE rh_aval360_entrega SET plano = (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('texto', btrim(a->>'texto'), 'prazo', NULLIF(a->>'prazo', ''))), '[]'::jsonb)
      FROM jsonb_array_elements(p_plano) a),
    updated_at = now()
    WHERE ciclo_id = p_ciclo_id AND avaliado_id = p_avaliado_id;
  RETURN jsonb_build_object('ok', true, 'acoes', jsonb_array_length(p_plano));
END;
$$;

REVOKE ALL ON FUNCTION public.fn_aval360_mudar_status(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_aval360_formulario(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_aval360_resultado(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_aval360_resultados_ciclo(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_aval360_reativar_abaixo_piso(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_aval360_editar_resposta(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_aval360_plano(uuid, uuid, uuid, boolean, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_aval360_mudar_status(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_aval360_formulario(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_aval360_resultado(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_aval360_resultados_ciclo(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_aval360_reativar_abaixo_piso(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_aval360_editar_resposta(uuid, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_aval360_plano(uuid, uuid, uuid, boolean, jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
