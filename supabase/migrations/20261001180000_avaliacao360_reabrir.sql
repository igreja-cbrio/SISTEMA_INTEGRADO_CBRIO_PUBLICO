











BEGIN;

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

REVOKE ALL ON FUNCTION public.fn_aval360_mudar_status(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_aval360_mudar_status(uuid, text) TO service_role;

COMMIT;
