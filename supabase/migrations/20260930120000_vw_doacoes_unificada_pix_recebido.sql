














DO $$
DECLARE
  v_def text;
  v_n   int;
  v_novo text;
BEGIN
  SELECT pg_get_viewdef('public.vw_doacoes_unificada'::regclass, true) INTO v_def;
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'vw_doacoes_unificada não existe';
  END IF;

  
  IF v_def ~ 'pd\.tipo = ''recebido''::text' THEN
    RAISE NOTICE 'vw_doacoes_unificada já lê PIX recebido — nada a fazer';
    RETURN;
  END IF;

  v_n := (SELECT count(*) FROM regexp_matches(v_def, 'pd\.tipo = ''credit''::text', 'g'));
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'âncora "pd.tipo = ''credit''::text" encontrada % vez(es) na definição viva (esperado 1) — patch ABORTADO, conferir a view à mão', v_n;
  END IF;

  v_novo := replace(v_def,
    'pd.tipo = ''credit''::text',
    'pd.tipo = ''recebido''::text AND NOT EXISTS (SELECT 1 FROM public.fin_transacoes ft2 WHERE ft2.lancamento_bruto_id IS NOT NULL AND ft2.lancamento_bruto_id = pd.lancamento_bruto_id)');

  
  EXECUTE 'CREATE OR REPLACE VIEW public.vw_doacoes_unificada AS ' || v_novo;

  
  SELECT pg_get_viewdef('public.vw_doacoes_unificada'::regclass, true) INTO v_def;
  IF v_def !~ 'pd\.tipo = ''recebido''::text' OR v_def ~ '''credit''' THEN
    RAISE EXCEPTION 'patch não pegou: a definição viva ainda não filtra recebido';
  END IF;
  SELECT count(*) INTO v_n FROM public.vw_doacoes_unificada WHERE fonte = 'fin_pix_detalhe';
  RAISE NOTICE 'vw_doacoes_unificada: % PIX recebido(s) ainda não conciliado(s) passam a aparecer', v_n;
END $$;

COMMENT ON VIEW public.vw_doacoes_unificada IS
  'Doações de 3 fontes. Ramo PIX = fin_pix_detalhe tipo recebido SEM lançamento em fin_transacoes (LEI Nº 6: PIX que já virou lançamento conta só uma vez). Patch dinâmico 2026-09-30.';
