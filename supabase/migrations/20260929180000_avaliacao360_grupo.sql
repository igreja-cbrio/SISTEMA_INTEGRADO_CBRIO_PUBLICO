












BEGIN;

ALTER TABLE public.rh_aval360_ciclo ADD COLUMN IF NOT EXISTS participantes UUID[];

COMMENT ON COLUMN public.rh_aval360_ciclo.participantes IS
  'Grupo do ciclo (ex.: piloto). NULL = todos os ativos. A sugestão pela hierarquia só monta dentro do grupo.';




CREATE OR REPLACE FUNCTION public.fn_aval360_sugerir_avaliadores(p_ciclo_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status text;
  v_grupo uuid[];
  v_gravados int;
  v_obsoletos int;
  v_fora int;
BEGIN
  SELECT status, participantes INTO v_status, v_grupo
    FROM rh_aval360_ciclo WHERE id = p_ciclo_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ciclo não encontrado.' USING ERRCODE = 'P0403'; END IF;
  IF v_status <> 'rascunho' THEN
    RAISE EXCEPTION 'A lista de avaliadores só muda com o ciclo em rascunho.' USING ERRCODE = 'P0409';
  END IF;
  IF v_grupo IS NOT NULL AND cardinality(v_grupo) = 0 THEN
    RAISE EXCEPTION 'O grupo do ciclo está vazio.' USING ERRCODE = 'P0400';
  END IF;

  UPDATE rh_aval360_convite c SET suprimido_em = now(), suprimido_motivo = 'hierarquia_mudou'
    WHERE c.ciclo_id = p_ciclo_id AND c.origem = 'automatico'
      AND c.deleted_at IS NULL AND c.suprimido_em IS NULL
      AND NOT EXISTS (SELECT 1 FROM fn_aval360_hierarquia() s WHERE s.avaliado_id = c.avaliado_id
        AND s.avaliador_id = c.avaliador_id AND s.papel = c.papel);
  GET DIAGNOSTICS v_obsoletos = ROW_COUNT;

  UPDATE rh_aval360_convite c SET suprimido_em = now(), suprimido_motivo = 'fora_do_grupo'
    WHERE v_grupo IS NOT NULL AND c.ciclo_id = p_ciclo_id AND c.origem = 'automatico'
      AND c.deleted_at IS NULL AND c.suprimido_em IS NULL
      AND NOT (c.avaliado_id = ANY(v_grupo) AND c.avaliador_id = ANY(v_grupo));
  GET DIAGNOSTICS v_fora = ROW_COUNT;

  
  
  UPDATE rh_aval360_convite c SET suprimido_em = NULL, suprimido_motivo = NULL,
      aprovado_em = CASE WHEN c.papel = 'par' THEN COALESCE(c.aprovado_em, now()) ELSE c.aprovado_em END
    WHERE c.ciclo_id = p_ciclo_id AND c.origem = 'automatico' AND c.deleted_at IS NULL
      AND c.suprimido_motivo IN ('hierarquia_mudou', 'fora_do_grupo')
      AND EXISTS (SELECT 1 FROM fn_aval360_hierarquia() s WHERE s.avaliado_id = c.avaliado_id
        AND s.avaliador_id = c.avaliador_id AND s.papel = c.papel)
      AND (v_grupo IS NULL OR (c.avaliado_id = ANY(v_grupo) AND c.avaliador_id = ANY(v_grupo)));

  INSERT INTO rh_aval360_convite(ciclo_id, avaliado_id, avaliador_id, papel, origem, aprovado_em)
    SELECT p_ciclo_id, s.avaliado_id, s.avaliador_id, s.papel, 'automatico',
           CASE WHEN s.papel = 'par' THEN now() END
    FROM fn_aval360_hierarquia() s
    WHERE v_grupo IS NULL OR (s.avaliado_id = ANY(v_grupo) AND s.avaliador_id = ANY(v_grupo))
    ON CONFLICT (ciclo_id, avaliado_id, avaliador_id, papel) DO NOTHING;
  GET DIAGNOSTICS v_gravados = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'gravados', v_gravados, 'obsoletos', v_obsoletos, 'fora_do_grupo', v_fora);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_aval360_sugerir_avaliadores(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_aval360_sugerir_avaliadores(uuid) TO service_role;

COMMIT;
