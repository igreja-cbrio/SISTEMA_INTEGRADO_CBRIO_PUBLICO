
















BEGIN;

CREATE TABLE IF NOT EXISTS public.rh_aval360_calibragem (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ciclo_id        UUID NOT NULL REFERENCES public.rh_aval360_ciclo(id) ON DELETE RESTRICT,
  avaliado_id     UUID NOT NULL REFERENCES public.rh_funcionarios(id) ON DELETE RESTRICT,
  competencia_id  UUID NOT NULL REFERENCES public.rh_aval360_competencia(id) ON DELETE RESTRICT,
  nota            NUMERIC(4,2) NOT NULL CHECK (nota >= 1),
  justificativa   TEXT NOT NULL CHECK (length(btrim(justificativa)) >= 10 AND length(justificativa) <= 2000),
  calibrado_por   UUID REFERENCES public.rh_funcionarios(id) ON DELETE RESTRICT,
  calibrado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ,
  UNIQUE (ciclo_id, avaliado_id, competencia_id)
);
CREATE INDEX IF NOT EXISTS idx_aval360_calibragem_ativa
  ON public.rh_aval360_calibragem (ciclo_id, avaliado_id) WHERE deleted_at IS NULL;

ALTER TABLE public.rh_aval360_calibragem ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aval360_calibragem_service ON public.rh_aval360_calibragem;
CREATE POLICY aval360_calibragem_service ON public.rh_aval360_calibragem
  FOR ALL TO service_role USING (true) WITH CHECK (true);


COMMENT ON TABLE public.rh_aval360_calibragem IS
  'Nota FINAL de um critério ajustada pelo RH na apuração (substitui a calculada). Justificativa obrigatória.';

DO $$
DECLARE v_lista TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'app_soft_deletable_tables') THEN
    SELECT string_agg(quote_literal(t), ', ' ORDER BY t) INTO v_lista
    FROM (SELECT unnest(public.app_soft_deletable_tables()) AS t UNION SELECT 'rh_aval360_calibragem') s;
    EXECUTE format($f$
      CREATE OR REPLACE FUNCTION public.app_soft_deletable_tables()
      RETURNS TEXT[] LANGUAGE sql IMMUTABLE AS $body$
        SELECT ARRAY[%s]::TEXT[]
      $body$;
    $f$, v_lista);
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'audit_log_changes') THEN
    DROP TRIGGER IF EXISTS trg_audit_rh_aval360_calibragem ON public.rh_aval360_calibragem;
    CREATE TRIGGER trg_audit_rh_aval360_calibragem
      AFTER INSERT OR UPDATE OR DELETE ON public.rh_aval360_calibragem
      FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes('nota,justificativa,calibrado_por,deleted_at');
  END IF;
END $$;



CREATE OR REPLACE FUNCTION public.fn_aval360_calibrar(
  p_ciclo_id uuid, p_avaliado_id uuid, p_competencia_id uuid, p_nota numeric, p_justificativa text, p_por uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ciclo rh_aval360_ciclo%ROWTYPE;
  v_n int;
BEGIN
  SELECT * INTO v_ciclo FROM rh_aval360_ciclo WHERE id = p_ciclo_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ciclo não encontrado.' USING ERRCODE = 'P0403'; END IF;
  IF v_ciclo.status <> 'apuracao' THEN
    RAISE EXCEPTION 'A calibragem acontece na apuração, antes de publicar.' USING ERRCODE = 'P0409';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM rh_aval360_ciclo_competencia
    WHERE ciclo_id = p_ciclo_id AND competencia_id = p_competencia_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Este critério não faz parte do ciclo.' USING ERRCODE = 'P0400';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM rh_aval360_convite
    WHERE ciclo_id = p_ciclo_id AND avaliado_id = p_avaliado_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Esta pessoa não participa do ciclo.' USING ERRCODE = 'P0400';
  END IF;

  IF p_nota IS NULL THEN
    UPDATE rh_aval360_calibragem SET deleted_at = now()
      WHERE ciclo_id = p_ciclo_id AND avaliado_id = p_avaliado_id AND competencia_id = p_competencia_id AND deleted_at IS NULL;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n = 0 THEN RAISE EXCEPTION 'Este critério não estava calibrado.' USING ERRCODE = 'P0409'; END IF;
    RETURN jsonb_build_object('ok', true, 'calibrado', false);
  END IF;

  IF p_nota < 1 OR p_nota > v_ciclo.escala_max OR round(p_nota, 2) <> p_nota THEN
    RAISE EXCEPTION 'A nota calibrada vai de 1 a %, com até 2 casas.', v_ciclo.escala_max USING ERRCODE = 'P0400';
  END IF;
  IF p_justificativa IS NULL OR length(btrim(p_justificativa)) < 10 OR length(p_justificativa) > 2000 THEN
    RAISE EXCEPTION 'Escreva a justificativa da calibragem (de 10 a 2.000 caracteres).' USING ERRCODE = 'P0400';
  END IF;

  INSERT INTO rh_aval360_calibragem(ciclo_id, avaliado_id, competencia_id, nota, justificativa, calibrado_por)
    VALUES (p_ciclo_id, p_avaliado_id, p_competencia_id, p_nota, btrim(p_justificativa), p_por)
    ON CONFLICT (ciclo_id, avaliado_id, competencia_id) DO UPDATE
      SET nota = EXCLUDED.nota, justificativa = EXCLUDED.justificativa, calibrado_por = EXCLUDED.calibrado_por,
          calibrado_em = now(), deleted_at = NULL;
  RETURN jsonb_build_object('ok', true, 'calibrado', true);
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
           'visivel', papel IN ('auto', 'gestor') OR n >= v_piso)), '{}'::jsonb)
    INTO v_papeis FROM resp;

  WITH vis AS (
    SELECT key AS papel FROM jsonb_each(v_papeis) WHERE (value->>'visivel')::boolean),
  notas AS (
    SELECT r.papel, nt.id, nt.competencia_id, nt.nota, nt.comentario
    FROM rh_aval360_resposta r JOIN rh_aval360_nota nt ON nt.resposta_id = r.id
    WHERE r.ciclo_id = p_ciclo_id AND r.avaliado_id = p_avaliado_id AND r.deleted_at IS NULL
      AND r.papel IN (SELECT papel FROM vis)),
  comps AS (
    SELECT cp.id, cp.nome, cp.descricao, cp.eixo, cc.peso, cc.ordem
    FROM rh_aval360_ciclo_competencia cc JOIN rh_aval360_competencia cp ON cp.id = cc.competencia_id
    WHERE cc.ciclo_id = p_ciclo_id AND cc.deleted_at IS NULL),
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
      'auto', round(f.auto, 2), 'gestor', round(f.gestor, 2), 'par', round(f.par, 2),
      'liderado', round(f.liderado, 2), 'outros', round(f.outros, 2), 'final', round(f.final, 2),
      'calculado', round(f.calculado, 2), 'calibrado', f.calibrada IS NOT NULL, 'justificativa', f.justificativa,
      'comentarios', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('papel', n.papel, 'texto', n.comentario)
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
           'devolutiva_obs', e.devolutiva_obs)
    INTO v_entrega FROM rh_aval360_entrega e
    WHERE e.ciclo_id = p_ciclo_id AND e.avaliado_id = p_avaliado_id AND e.deleted_at IS NULL;

  RETURN jsonb_build_object(
    'ciclo', jsonb_build_object('id', v_ciclo.id, 'nome', v_ciclo.nome, 'status', v_ciclo.status,
      'escala_max', v_ciclo.escala_max, 'escala_rotulos', v_ciclo.escala_rotulos,
      'peso_auto', v_ciclo.peso_auto, 'peso_gestor', v_ciclo.peso_gestor, 'peso_outros', v_ciclo.peso_outros,
      'piso', v_piso, 'corte_baixo', v_baixo, 'corte_alto', v_alto),
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
      
      'criterios', (SELECT COALESCE(jsonb_agg(jsonb_build_object('competencia_id', e->'competencia_id',
        'nome', e->'nome', 'eixo', e->'eixo', 'final', e->'final', 'calibrado', e->'calibrado')), '[]'::jsonb)
        FROM jsonb_array_elements(v_r->'criterios') e)));
  END LOOP;
  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_aval360_calibrar(uuid, uuid, uuid, numeric, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_aval360_calibrar(uuid, uuid, uuid, numeric, text, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.fn_aval360_resultado(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_aval360_resultados_ciclo(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_aval360_resultado(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_aval360_resultados_ciclo(uuid) TO service_role;

COMMIT;
