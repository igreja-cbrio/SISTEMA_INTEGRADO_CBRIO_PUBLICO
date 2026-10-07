





















BEGIN;


CREATE TABLE IF NOT EXISTS public.rh_aval360_pergunta (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ciclo_id        UUID NOT NULL REFERENCES public.rh_aval360_ciclo(id) ON DELETE RESTRICT,
  competencia_id  UUID NOT NULL REFERENCES public.rh_aval360_competencia(id) ON DELETE RESTRICT,
  texto           TEXT NOT NULL CHECK (length(btrim(texto)) BETWEEN 3 AND 500),
  ajuda           TEXT CHECK (ajuda IS NULL OR length(ajuda) <= 1000),
  ordem           INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_aval360_pergunta_ciclo
  ON public.rh_aval360_pergunta (ciclo_id, ordem) WHERE deleted_at IS NULL;

ALTER TABLE public.rh_aval360_pergunta ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aval360_pergunta_service ON public.rh_aval360_pergunta;
CREATE POLICY aval360_pergunta_service ON public.rh_aval360_pergunta
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.rh_aval360_pergunta IS
  'Pergunta do formulário 360. Cada uma responde a UM critério (rh_aval360_competencia = etiqueta, com eixo da 9box).';




ALTER TABLE public.rh_aval360_nota ADD COLUMN IF NOT EXISTS pergunta_id UUID
  REFERENCES public.rh_aval360_pergunta(id) ON DELETE RESTRICT;
ALTER TABLE public.rh_aval360_nota DROP CONSTRAINT IF EXISTS rh_aval360_nota_resposta_id_competencia_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_aval360_nota_resposta_pergunta
  ON public.rh_aval360_nota (resposta_id, pergunta_id);


ALTER TABLE public.rh_aval360_ciclo_competencia
  ADD COLUMN IF NOT EXISTS visivel BOOLEAN NOT NULL DEFAULT true;
COMMENT ON COLUMN public.rh_aval360_ciclo_competencia.visivel IS
  'Falso = o critério NÃO aparece no resultado mostrado ao avaliado (conta igual na nota). É o "Ocultar critérios" do Feedz.';







ALTER TABLE public.rh_aval360_ciclo
  ADD COLUMN IF NOT EXISTS config JSONB NOT NULL DEFAULT '{}'::jsonb;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rh_aval360_ciclo_config_ck') THEN
    ALTER TABLE public.rh_aval360_ciclo ADD CONSTRAINT rh_aval360_ciclo_config_ck CHECK (jsonb_typeof(config) = 'object');
  END IF;
END $$;




UPDATE public.rh_aval360_competencia SET ativo = false
  WHERE codigo IN ('combinado','informacao','atravessa_area','sob_pressao','aceita_correcao',
                   'prioridade','acessivel','desenvolve','autoridade');



INSERT INTO public.rh_aval360_pergunta (ciclo_id, competencia_id, texto, ordem)
  SELECT cc.ciclo_id, cc.competencia_id, cp.nome, cc.ordem
  FROM public.rh_aval360_ciclo_competencia cc
  JOIN public.rh_aval360_competencia cp ON cp.id = cc.competencia_id
  JOIN public.rh_aval360_ciclo c ON c.id = cc.ciclo_id
  WHERE cc.deleted_at IS NULL AND c.deleted_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.rh_aval360_pergunta p WHERE p.ciclo_id = cc.ciclo_id AND p.deleted_at IS NULL);





DROP FUNCTION IF EXISTS public.fn_aval360_definir_competencias(uuid, jsonb);

CREATE OR REPLACE FUNCTION public.fn_aval360_salvar_perguntas(p_ciclo_id uuid, p_itens jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status text;
  v_n int;
BEGIN
  SELECT status INTO v_status FROM rh_aval360_ciclo WHERE id = p_ciclo_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ciclo não encontrado.' USING ERRCODE = 'P0403'; END IF;
  IF v_status <> 'rascunho' THEN
    RAISE EXCEPTION 'As perguntas só mudam antes de enviar o ciclo.' USING ERRCODE = 'P0409';
  END IF;
  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) = 0
     OR jsonb_array_length(p_itens) > 60 THEN
    RAISE EXCEPTION 'Escreva de 1 a 60 perguntas.' USING ERRCODE = 'P0400';
  END IF;
  SELECT count(*) INTO v_n FROM jsonb_array_elements(p_itens) i
    JOIN rh_aval360_competencia c ON c.id::text = i->>'competencia_id' AND c.deleted_at IS NULL AND c.ativo
    WHERE jsonb_typeof(i->'texto') = 'string' AND length(btrim(i->>'texto')) BETWEEN 3 AND 500
      AND (i->'ajuda' IS NULL OR i->'ajuda' = 'null'::jsonb
           OR (jsonb_typeof(i->'ajuda') = 'string' AND length(i->>'ajuda') <= 1000));
  IF v_n <> jsonb_array_length(p_itens) THEN
    RAISE EXCEPTION 'Toda pergunta precisa de texto (3 a 500 caracteres) e de um critério ativo.' USING ERRCODE = 'P0400';
  END IF;

  
  DELETE FROM rh_aval360_pergunta WHERE ciclo_id = p_ciclo_id;
  INSERT INTO rh_aval360_pergunta (ciclo_id, competencia_id, texto, ajuda, ordem)
    SELECT p_ciclo_id, (i->>'competencia_id')::uuid, btrim(i->>'texto'),
           NULLIF(btrim(COALESCE(i->>'ajuda', '')), ''), (o - 1)::int
    FROM jsonb_array_elements(p_itens) WITH ORDINALITY AS t(i, o);

  
  DELETE FROM rh_aval360_ciclo_competencia cc WHERE cc.ciclo_id = p_ciclo_id
    AND NOT EXISTS (SELECT 1 FROM rh_aval360_pergunta p WHERE p.ciclo_id = p_ciclo_id
      AND p.competencia_id = cc.competencia_id AND p.deleted_at IS NULL);
  INSERT INTO rh_aval360_ciclo_competencia (ciclo_id, competencia_id, peso, ordem)
    SELECT p_ciclo_id, competencia_id, 1, min(ordem) FROM rh_aval360_pergunta
    WHERE ciclo_id = p_ciclo_id AND deleted_at IS NULL GROUP BY competencia_id
    ON CONFLICT (ciclo_id, competencia_id) DO UPDATE SET ordem = EXCLUDED.ordem, deleted_at = NULL;
  RETURN jsonb_build_object('ok', true, 'perguntas', jsonb_array_length(p_itens));
END;
$$;




CREATE OR REPLACE FUNCTION public.fn_aval360_config_criterio(
  p_ciclo_id uuid, p_competencia_id uuid, p_peso numeric, p_visivel boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status text;
  v_n int;
BEGIN
  SELECT status INTO v_status FROM rh_aval360_ciclo WHERE id = p_ciclo_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ciclo não encontrado.' USING ERRCODE = 'P0403'; END IF;
  IF v_status = 'encerrado' THEN RAISE EXCEPTION 'Ciclo encerrado não muda.' USING ERRCODE = 'P0409'; END IF;
  IF p_peso IS NOT NULL THEN
    IF v_status <> 'rascunho' THEN RAISE EXCEPTION 'O peso do critério só muda antes de enviar.' USING ERRCODE = 'P0409'; END IF;
    IF p_peso <= 0 OR p_peso > 9.999 THEN RAISE EXCEPTION 'Peso do critério de 0,5 a 9,9.' USING ERRCODE = 'P0400'; END IF;
  END IF;
  UPDATE rh_aval360_ciclo_competencia
    SET peso = COALESCE(p_peso, peso), visivel = COALESCE(p_visivel, visivel)
    WHERE ciclo_id = p_ciclo_id AND competencia_id = p_competencia_id AND deleted_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN RAISE EXCEPTION 'Este critério não está no ciclo (escreva uma pergunta com ele).' USING ERRCODE = 'P0400'; END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;


CREATE OR REPLACE FUNCTION public.fn_aval360_formulario(p_convite_id uuid, p_avaliador_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_convite rh_aval360_convite%ROWTYPE;
  v_ciclo rh_aval360_ciclo%ROWTYPE;
  v_avaliado rh_funcionarios%ROWTYPE;
  v_perguntas jsonb;
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
  IF v_convite.papel IN ('par', 'liderado') AND (SELECT count(DISTINCT c.avaliador_id)
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

  RETURN jsonb_build_object('convite', jsonb_build_object('id', v_convite.id,
    'papel', v_convite.papel, 'avaliado_id', v_convite.avaliado_id, 'ciclo_id', v_convite.ciclo_id,
    'respondido_em', v_convite.respondido_em,
    'ciclo', jsonb_build_object('id', v_ciclo.id, 'nome', v_ciclo.nome, 'status', v_ciclo.status,
      'escala_max', v_ciclo.escala_max, 'descricao', v_ciclo.descricao),
    'avaliado', jsonb_build_object('id', v_avaliado.id, 'nome', v_avaliado.nome, 'cargo', v_avaliado.cargo, 'area', v_avaliado.area)),
    'perguntas', v_perguntas, 'escala_max', v_ciclo.escala_max, 'escala_rotulos', v_ciclo.escala_rotulos,
    'comentario_obrigatorio', CASE WHEN v_convite.papel = 'auto'
      THEN COALESCE((v_ciclo.config->>'exigir_comentario_auto')::boolean, false)
      ELSE COALESCE((v_ciclo.config->>'exigir_comentario_avaliadores')::boolean, false) END);
END;
$$;


CREATE OR REPLACE FUNCTION public.fn_aval360_responder(p_convite_id uuid, p_avaliador_id uuid, p_notas jsonb)
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
  IF v_convite.respondido_em IS NOT NULL OR EXISTS (SELECT 1 FROM rh_aval360_resposta WHERE convite_id = p_convite_id) THEN
    RAISE EXCEPTION 'Esta avaliação já possui uma resposta. Se houve falha anterior, solicite revisão ao RH.' USING ERRCODE = 'P0409';
  END IF;
  IF p_notas IS NULL OR jsonb_typeof(p_notas) <> 'array' THEN
    RAISE EXCEPTION 'Envie a lista de notas.' USING ERRCODE = 'P0400';
  END IF;
  IF jsonb_array_length(p_notas) = 0 OR jsonb_array_length(p_notas) > 500 THEN
    RAISE EXCEPTION 'Quantidade de notas inválida.' USING ERRCODE = 'P0400';
  END IF;
  SELECT array_agg(c->>'id' ORDER BY c->>'id') INTO v_esperadas FROM jsonb_array_elements(v_form->'perguntas') c;
  SELECT array_agg(n->>'pergunta_id' ORDER BY n->>'pergunta_id') INTO v_recebidas FROM jsonb_array_elements(p_notas) n;
  IF v_esperadas IS NULL OR v_recebidas IS DISTINCT FROM v_esperadas THEN
    RAISE EXCEPTION 'Responda exatamente as perguntas deste formulário, sem repetições.' USING ERRCODE = 'P0400';
  END IF;
  FOR v_nota IN SELECT value FROM jsonb_array_elements(p_notas) LOOP
    IF jsonb_typeof(v_nota->'nota') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'Nota inválida.' USING ERRCODE = 'P0400';
    END IF;
    IF (v_nota->>'nota')::numeric <> trunc((v_nota->>'nota')::numeric)
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
  INSERT INTO rh_aval360_resposta(ciclo_id, avaliado_id, papel, convite_id)
    VALUES (v_convite.ciclo_id, v_convite.avaliado_id, v_convite.papel, v_convite.id) RETURNING id INTO v_resposta;
  INSERT INTO rh_aval360_nota(resposta_id, pergunta_id, competencia_id, nota, comentario)
    SELECT v_resposta, p.id, p.competencia_id, (n->>'nota')::numeric::int, NULLIF(btrim(n->>'comentario'), '')
    FROM jsonb_array_elements(p_notas) n JOIN rh_aval360_pergunta p ON p.id = (n->>'pergunta_id')::uuid;
  UPDATE rh_aval360_convite SET respondido_em = now() WHERE id = p_convite_id;
  RETURN jsonb_build_object('ok', true, 'respostas', jsonb_array_length(p_notas));
END;
$$;





CREATE OR REPLACE FUNCTION public.fn_aval360_definir_avaliadores(p_ciclo_id uuid, p_avaliado_id uuid, p_itens jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status text;
  v_n int;
BEGIN
  SELECT status INTO v_status FROM rh_aval360_ciclo WHERE id = p_ciclo_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ciclo não encontrado.' USING ERRCODE = 'P0403'; END IF;
  IF v_status <> 'rascunho' THEN
    RAISE EXCEPTION 'Quem avalia quem só muda antes de enviar o ciclo.' USING ERRCODE = 'P0409';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM rh_funcionarios WHERE id = p_avaliado_id AND status = 'ativo' AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Esta pessoa não está ativa no RH e não pode ser avaliada.' USING ERRCODE = 'P0400';
  END IF;
  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) > 80 THEN
    RAISE EXCEPTION 'Lista de avaliadores inválida.' USING ERRCODE = 'P0400';
  END IF;
  IF (SELECT count(DISTINCT i->>'avaliador_id') FROM jsonb_array_elements(p_itens) i) <> jsonb_array_length(p_itens) THEN
    RAISE EXCEPTION 'Uma pessoa avalia outra em um papel só.' USING ERRCODE = 'P0400';
  END IF;
  SELECT count(*) INTO v_n FROM jsonb_array_elements(p_itens) i
    JOIN rh_funcionarios f ON f.id::text = i->>'avaliador_id' AND f.status = 'ativo' AND f.deleted_at IS NULL
    WHERE i->>'papel' IN ('gestor', 'par', 'liderado') AND f.id <> p_avaliado_id;
  IF v_n <> jsonb_array_length(p_itens) THEN
    RAISE EXCEPTION 'Avaliador inválido: precisa estar ativo, ser outra pessoa e ter papel gestor, par ou liderado.' USING ERRCODE = 'P0400';
  END IF;

  UPDATE rh_aval360_convite c SET suprimido_em = now(), suprimido_motivo = 'removido_pelo_rh'
    WHERE c.ciclo_id = p_ciclo_id AND c.avaliado_id = p_avaliado_id AND c.papel <> 'auto'
      AND c.deleted_at IS NULL AND c.suprimido_em IS NULL
      AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_itens) i
        WHERE i->>'avaliador_id' = c.avaliador_id::text AND i->>'papel' = c.papel);

  INSERT INTO rh_aval360_convite (ciclo_id, avaliado_id, avaliador_id, papel, origem, aprovado_em)
    SELECT p_ciclo_id, p_avaliado_id, p_avaliado_id, 'auto', 'rh', now()
    UNION ALL
    SELECT p_ciclo_id, p_avaliado_id, (i->>'avaliador_id')::uuid, i->>'papel',
           CASE WHEN EXISTS (SELECT 1 FROM fn_aval360_hierarquia() h WHERE h.avaliado_id = p_avaliado_id
             AND h.avaliador_id::text = i->>'avaliador_id' AND h.papel = i->>'papel') THEN 'automatico' ELSE 'rh' END,
           now()
    FROM jsonb_array_elements(p_itens) i
    ON CONFLICT (ciclo_id, avaliado_id, avaliador_id, papel) DO UPDATE
      SET suprimido_em = NULL, suprimido_motivo = NULL, deleted_at = NULL,
          aprovado_em = COALESCE(rh_aval360_convite.aprovado_em, now());
  RETURN jsonb_build_object('ok', true, 'avaliadores', jsonb_array_length(p_itens));
END;
$$;


CREATE OR REPLACE FUNCTION public.fn_aval360_remover_avaliado(p_ciclo_id uuid, p_avaliado_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status text;
  v_n int;
BEGIN
  SELECT status INTO v_status FROM rh_aval360_ciclo WHERE id = p_ciclo_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ciclo não encontrado.' USING ERRCODE = 'P0403'; END IF;
  IF v_status <> 'rascunho' THEN
    RAISE EXCEPTION 'Quem avalia quem só muda antes de enviar o ciclo.' USING ERRCODE = 'P0409';
  END IF;
  UPDATE rh_aval360_convite SET suprimido_em = now(), suprimido_motivo = 'removido_pelo_rh'
    WHERE ciclo_id = p_ciclo_id AND avaliado_id = p_avaliado_id AND deleted_at IS NULL AND suprimido_em IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'removidos', v_n);
END;
$$;




CREATE OR REPLACE FUNCTION public.fn_aval360_incluir_padrao(p_ciclo_id uuid, p_avaliados uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status text;
  v_novos uuid[];
BEGIN
  SELECT status INTO v_status FROM rh_aval360_ciclo WHERE id = p_ciclo_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ciclo não encontrado.' USING ERRCODE = 'P0403'; END IF;
  IF v_status <> 'rascunho' THEN
    RAISE EXCEPTION 'Quem avalia quem só muda antes de enviar o ciclo.' USING ERRCODE = 'P0409';
  END IF;
  SELECT array_agg(DISTINCT f.id) INTO v_novos FROM rh_funcionarios f
    WHERE f.id = ANY(COALESCE(p_avaliados, '{}')) AND f.status = 'ativo' AND f.deleted_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM rh_aval360_convite c WHERE c.ciclo_id = p_ciclo_id AND c.avaliado_id = f.id
        AND c.deleted_at IS NULL AND c.suprimido_em IS NULL);
  IF v_novos IS NULL THEN RETURN jsonb_build_object('ok', true, 'incluidos', 0); END IF;

  INSERT INTO rh_aval360_convite (ciclo_id, avaliado_id, avaliador_id, papel, origem, aprovado_em)
    SELECT p_ciclo_id, h.avaliado_id, h.avaliador_id, h.papel, 'automatico', now()
    FROM fn_aval360_hierarquia() h WHERE h.avaliado_id = ANY(v_novos)
    ON CONFLICT (ciclo_id, avaliado_id, avaliador_id, papel) DO UPDATE
      SET suprimido_em = NULL, suprimido_motivo = NULL, deleted_at = NULL,
          aprovado_em = COALESCE(rh_aval360_convite.aprovado_em, now());
  RETURN jsonb_build_object('ok', true, 'incluidos', cardinality(v_novos));
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
           'devolutiva_obs', e.devolutiva_obs)
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
       OR (v_ciclo.status = 'coleta'    AND p_para = 'apuracao')
       OR (v_ciclo.status = 'apuracao'  AND p_para = 'publicado')
       OR (v_ciclo.status = 'publicado' AND p_para = 'encerrado')) THEN
    RAISE EXCEPTION 'Não é possível ir de % para %.', v_ciclo.status, p_para USING ERRCODE = 'P0409';
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
      WHERE c.ciclo_id = p_ciclo_id AND c.papel IN ('par', 'liderado')
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

REVOKE ALL ON FUNCTION public.fn_aval360_salvar_perguntas(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_aval360_config_criterio(uuid, uuid, numeric, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_aval360_config_criterio(uuid, uuid, numeric, boolean) TO service_role;
REVOKE ALL ON FUNCTION public.fn_aval360_formulario(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_aval360_responder(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_aval360_definir_avaliadores(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_aval360_remover_avaliado(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_aval360_incluir_padrao(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_aval360_resultado(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_aval360_mudar_status(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_aval360_salvar_perguntas(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_aval360_formulario(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_aval360_responder(uuid, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_aval360_definir_avaliadores(uuid, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_aval360_remover_avaliado(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_aval360_incluir_padrao(uuid, uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_aval360_resultado(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_aval360_mudar_status(uuid, text) TO service_role;


NOTIFY pgrst, 'reload schema';

COMMIT;
