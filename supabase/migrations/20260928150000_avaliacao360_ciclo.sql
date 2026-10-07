


























BEGIN;


ALTER TABLE public.rh_aval360_ciclo
  ADD COLUMN IF NOT EXISTS peso_auto      NUMERIC(4,3) NOT NULL DEFAULT 0.150,
  ADD COLUMN IF NOT EXISTS peso_gestor    NUMERIC(4,3) NOT NULL DEFAULT 0.700,
  ADD COLUMN IF NOT EXISTS peso_outros    NUMERIC(4,3) NOT NULL DEFAULT 0.150,
  
  ADD COLUMN IF NOT EXISTS escala_rotulos JSONB;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rh_aval360_ciclo_pesos_ck') THEN
    ALTER TABLE public.rh_aval360_ciclo ADD CONSTRAINT rh_aval360_ciclo_pesos_ck
      CHECK (peso_auto >= 0 AND peso_gestor >= 0 AND peso_outros >= 0
             AND peso_auto + peso_gestor + peso_outros = 1);
  END IF;
  
  
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rh_aval360_ciclo_rotulos_ck') THEN
    ALTER TABLE public.rh_aval360_ciclo ADD CONSTRAINT rh_aval360_ciclo_rotulos_ck
      CHECK (escala_rotulos IS NULL OR (jsonb_typeof(escala_rotulos) = 'array'
             AND jsonb_array_length(escala_rotulos) = escala_max));
  END IF;
END $$;

COMMENT ON COLUMN public.rh_aval360_ciclo.peso_outros IS
  'Peso de par + liderado JUNTOS (o "Outros avaliadores" do Feedz). Soma dos 3 pesos = 1.';
COMMENT ON COLUMN public.rh_aval360_ciclo.escala_rotulos IS
  'Nome de cada ponto da escala (array com escala_max textos, do 1 ao máximo). NULL = só números.';



INSERT INTO public.rh_aval360_competencia (codigo, nome, eixo, aplica_a, ordem)
VALUES
  ('fz_relacionamento',         'Relacionamento interpessoal',     'resultado',     'todos', 101),
  ('fz_postura_pessoal',        'Postura Pessoal',                 'resultado',     'todos', 102),
  ('fz_postura_profissional',   'Postura Profissional',            'resultado',     'todos', 103),
  ('fz_postura_espiritual',     'Postura Espiritual',              'resultado',     'todos', 104),
  ('fz_grandes_desafios',       'Assume grandes desafios?',        'comportamento', 'todos', 105),
  ('fz_perseveranca',           'Perseverança',                    'comportamento', 'todos', 106),
  ('fz_desenvolvimento',        'Desenvolvimento e Excelência',    'comportamento', 'todos', 107),
  ('fz_compreende_ama',         'Compreende, internaliza e ama?',  'comportamento', 'todos', 108)
ON CONFLICT (codigo) DO NOTHING;



CREATE OR REPLACE FUNCTION public.fn_aval360_formulario(p_convite_id uuid, p_avaliador_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_convite rh_aval360_convite%ROWTYPE;
  v_ciclo rh_aval360_ciclo%ROWTYPE;
  v_avaliado rh_funcionarios%ROWTYPE;
  v_competencias jsonb;
BEGIN
  SELECT * INTO v_convite FROM rh_aval360_convite
    WHERE id = p_convite_id AND avaliador_id = p_avaliador_id
      AND deleted_at IS NULL AND suprimido_em IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Convite indisponível para este colaborador.' USING ERRCODE = 'P0403'; END IF;
  IF v_convite.papel = 'par' AND v_convite.aprovado_em IS NULL THEN
    RAISE EXCEPTION 'A indicação de par ainda não foi aprovada.' USING ERRCODE = 'P0409';
  END IF;
  SELECT * INTO v_ciclo FROM rh_aval360_ciclo WHERE id = v_convite.ciclo_id AND deleted_at IS NULL;
  IF NOT FOUND OR v_ciclo.status <> 'coleta' OR
    v_ciclo.coleta_ate < (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date THEN
    RAISE EXCEPTION 'A janela de respostas deste ciclo não está aberta.' USING ERRCODE = 'P0409';
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
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', cp.id, 'codigo', cp.codigo,
    'nome', cp.nome, 'descricao', cp.descricao, 'aplica_a', cp.aplica_a, 'eixo', cp.eixo)
    ORDER BY cc.ordem, cp.id), '[]'::jsonb) INTO v_competencias
  FROM rh_aval360_ciclo_competencia cc JOIN rh_aval360_competencia cp ON cp.id = cc.competencia_id
  WHERE cc.ciclo_id = v_ciclo.id AND cc.deleted_at IS NULL AND cp.deleted_at IS NULL AND cp.ativo
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
    'competencias', v_competencias, 'escala_max', v_ciclo.escala_max,
    'escala_rotulos', v_ciclo.escala_rotulos);
END;
$$;












DROP FUNCTION IF EXISTS public.fn_aval360_gerar_convites(uuid, jsonb);


CREATE OR REPLACE FUNCTION public.fn_aval360_hierarquia()
RETURNS TABLE (avaliado_id uuid, avaliador_id uuid, papel text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH ativos AS (SELECT id, gestor_id FROM rh_funcionarios WHERE status = 'ativo' AND deleted_at IS NULL)
  SELECT id, id, 'auto'::text FROM ativos
  UNION
  SELECT f.id, g.id, 'gestor' FROM ativos f JOIN ativos g ON g.id = f.gestor_id AND g.id <> f.id
  UNION
  SELECT g.id, f.id, 'liderado' FROM ativos g JOIN ativos f ON f.gestor_id = g.id AND f.id <> g.id
  UNION
  SELECT a.id, b.id, 'par' FROM ativos a JOIN ativos b
    ON b.gestor_id = a.gestor_id AND b.id <> a.id
    WHERE a.gestor_id IS NOT NULL AND a.gestor_id <> a.id AND b.gestor_id <> b.id
$$;

CREATE OR REPLACE FUNCTION public.fn_aval360_sugerir_avaliadores(p_ciclo_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status text;
  v_gravados int;
  v_obsoletos int;
BEGIN
  SELECT status INTO v_status FROM rh_aval360_ciclo WHERE id = p_ciclo_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ciclo não encontrado.' USING ERRCODE = 'P0403'; END IF;
  IF v_status <> 'rascunho' THEN
    RAISE EXCEPTION 'A lista de avaliadores só muda com o ciclo em rascunho.' USING ERRCODE = 'P0409';
  END IF;

  UPDATE rh_aval360_convite c SET suprimido_em = now(), suprimido_motivo = 'hierarquia_mudou'
    WHERE c.ciclo_id = p_ciclo_id AND c.origem = 'automatico'
      AND c.deleted_at IS NULL AND c.suprimido_em IS NULL
      AND NOT EXISTS (SELECT 1 FROM fn_aval360_hierarquia() s WHERE s.avaliado_id = c.avaliado_id
        AND s.avaliador_id = c.avaliador_id AND s.papel = c.papel);
  GET DIAGNOSTICS v_obsoletos = ROW_COUNT;

  INSERT INTO rh_aval360_convite(ciclo_id, avaliado_id, avaliador_id, papel, origem, aprovado_em)
    SELECT p_ciclo_id, s.avaliado_id, s.avaliador_id, s.papel, 'automatico',
           CASE WHEN s.papel = 'par' THEN now() END
    FROM fn_aval360_hierarquia() s
    ON CONFLICT (ciclo_id, avaliado_id, avaliador_id, papel) DO NOTHING;
  GET DIAGNOSTICS v_gravados = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'gravados', v_gravados, 'obsoletos', v_obsoletos);
END;
$$;





CREATE OR REPLACE FUNCTION public.fn_aval360_editar_avaliador(
  p_ciclo_id uuid, p_avaliado_id uuid, p_avaliador_id uuid, p_papel text, p_incluir boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status text;
  v_outro text;
  v_n int;
BEGIN
  SELECT status INTO v_status FROM rh_aval360_ciclo WHERE id = p_ciclo_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ciclo não encontrado.' USING ERRCODE = 'P0403'; END IF;
  IF v_status <> 'rascunho' THEN
    RAISE EXCEPTION 'A lista de avaliadores só muda com o ciclo em rascunho.' USING ERRCODE = 'P0409';
  END IF;
  IF p_papel IS NULL OR p_papel NOT IN ('auto', 'gestor', 'par', 'liderado') THEN
    RAISE EXCEPTION 'Papel inválido.' USING ERRCODE = 'P0400';
  END IF;
  IF (p_papel = 'auto') <> (p_avaliado_id = p_avaliador_id) THEN
    RAISE EXCEPTION 'Autoavaliação é a pessoa sobre ela mesma; nos outros papéis, avaliador e avaliado são pessoas diferentes.'
      USING ERRCODE = 'P0400';
  END IF;

  IF NOT p_incluir THEN
    UPDATE rh_aval360_convite SET suprimido_em = now(), suprimido_motivo = 'removido_pelo_rh'
      WHERE ciclo_id = p_ciclo_id AND avaliado_id = p_avaliado_id AND avaliador_id = p_avaliador_id
        AND papel = p_papel AND deleted_at IS NULL AND suprimido_em IS NULL;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n = 0 THEN RAISE EXCEPTION 'Este avaliador não está na lista.' USING ERRCODE = 'P0409'; END IF;
    RETURN jsonb_build_object('ok', true, 'incluido', false);
  END IF;

  SELECT count(*) INTO v_n FROM rh_funcionarios
    WHERE id IN (p_avaliado_id, p_avaliador_id) AND status = 'ativo' AND deleted_at IS NULL;
  IF v_n <> (CASE WHEN p_avaliado_id = p_avaliador_id THEN 1 ELSE 2 END) THEN
    RAISE EXCEPTION 'Avaliado ou avaliador inativo.' USING ERRCODE = 'P0400';
  END IF;
  SELECT papel INTO v_outro FROM rh_aval360_convite
    WHERE ciclo_id = p_ciclo_id AND avaliado_id = p_avaliado_id AND avaliador_id = p_avaliador_id
      AND papel <> p_papel AND deleted_at IS NULL AND suprimido_em IS NULL LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Esta pessoa já avalia como %. Remova de lá antes.', v_outro USING ERRCODE = 'P0409';
  END IF;

  INSERT INTO rh_aval360_convite(ciclo_id, avaliado_id, avaliador_id, papel, origem, aprovado_em)
    VALUES (p_ciclo_id, p_avaliado_id, p_avaliador_id, p_papel, 'rh', now())
    ON CONFLICT (ciclo_id, avaliado_id, avaliador_id, papel) DO UPDATE
      SET suprimido_em = NULL, suprimido_motivo = NULL, deleted_at = NULL,
          aprovado_em = COALESCE(rh_aval360_convite.aprovado_em, now());
  RETURN jsonb_build_object('ok', true, 'incluido', true);
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
    IF NOT EXISTS (SELECT 1 FROM rh_aval360_ciclo_competencia WHERE ciclo_id = p_ciclo_id AND deleted_at IS NULL) THEN
      RAISE EXCEPTION 'Escolha os critérios do ciclo antes de enviar.' USING ERRCODE = 'P0409';
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




CREATE OR REPLACE FUNCTION public.fn_aval360_definir_competencias(p_ciclo_id uuid, p_itens jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status text;
  v_n int;
BEGIN
  SELECT status INTO v_status FROM rh_aval360_ciclo WHERE id = p_ciclo_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ciclo não encontrado.' USING ERRCODE = 'P0403'; END IF;
  IF v_status <> 'rascunho' THEN
    RAISE EXCEPTION 'Os critérios só mudam com o ciclo em rascunho.' USING ERRCODE = 'P0409';
  END IF;
  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) = 0
     OR jsonb_array_length(p_itens) > 30 THEN
    RAISE EXCEPTION 'Escolha de 1 a 30 critérios.' USING ERRCODE = 'P0400';
  END IF;
  IF (SELECT count(DISTINCT i->>'competencia_id') FROM jsonb_array_elements(p_itens) i) <> jsonb_array_length(p_itens) THEN
    RAISE EXCEPTION 'Critério repetido.' USING ERRCODE = 'P0400';
  END IF;
  SELECT count(*) INTO v_n FROM jsonb_array_elements(p_itens) i
    JOIN rh_aval360_competencia c ON c.id::text = i->>'competencia_id' AND c.deleted_at IS NULL AND c.ativo
    WHERE COALESCE(jsonb_typeof(i->'peso'), 'null') IN ('null', 'number')
      AND COALESCE((i->>'peso')::numeric, 1) > 0 AND COALESCE((i->>'peso')::numeric, 1) < 10;
  IF v_n <> jsonb_array_length(p_itens) THEN
    RAISE EXCEPTION 'Critério inexistente, inativo ou com peso inválido.' USING ERRCODE = 'P0400';
  END IF;

  
  DELETE FROM rh_aval360_ciclo_competencia WHERE ciclo_id = p_ciclo_id;
  INSERT INTO rh_aval360_ciclo_competencia(ciclo_id, competencia_id, peso, ordem)
    SELECT p_ciclo_id, (i->>'competencia_id')::uuid, COALESCE((i->>'peso')::numeric, 1), (o - 1)::int
    FROM jsonb_array_elements(p_itens) WITH ORDINALITY AS t(i, o);
  RETURN jsonb_build_object('ok', true, 'competencias', jsonb_array_length(p_itens));
END;
$$;

REVOKE ALL ON FUNCTION public.fn_aval360_formulario(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_aval360_hierarquia() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_aval360_sugerir_avaliadores(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_aval360_editar_avaliador(uuid, uuid, uuid, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_aval360_mudar_status(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_aval360_definir_competencias(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_aval360_formulario(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_aval360_hierarquia() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_aval360_sugerir_avaliadores(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_aval360_editar_avaliador(uuid, uuid, uuid, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_aval360_mudar_status(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_aval360_definir_competencias(uuid, jsonb) TO service_role;

COMMIT;
