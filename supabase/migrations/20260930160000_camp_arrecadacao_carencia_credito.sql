








































CREATE OR REPLACE FUNCTION public.camp_carencia_credito_dias()
RETURNS integer
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$ SELECT 3 $$;

COMMENT ON FUNCTION public.camp_carencia_credito_dias() IS
  'Carência de crédito das campanhas (dias após data_fim em que o crédito com o dígito ainda conta). '
  'O Pix do último domingo é creditado na segunda (terça se feriado). '
  'ESPELHO: backend/utils/digitoCampanha.js CARENCIA_CREDITO_DIAS — mudou aqui, muda lá.';

GRANT EXECUTE ON FUNCTION public.camp_carencia_credito_dias() TO service_role;

DO $patch$
DECLARE
  v_def   text := pg_get_viewdef('public.vw_camp_arrecadacao'::regclass, true);
  v_novo  text;
  v_opts  text[];
  a_t constant text := '(c_1.data_fim IS NULL OR t.data_competencia <= c_1.data_fim)';
  n_t constant text := '(c_1.data_fim IS NULL OR t.data_competencia <= (c_1.data_fim + camp_carencia_credito_dias()))';
  a_b constant text := '(c_1.data_fim IS NULL OR b.data_lancamento <= c_1.data_fim)';
  n_b constant text := '(c_1.data_fim IS NULL OR b.data_lancamento <= (c_1.data_fim + camp_carencia_credito_dias()))';
  q_t int;
  q_b int;
  q_final int;
BEGIN
  IF position('camp_carencia_credito_dias' IN v_def) > 0 THEN
    RAISE NOTICE 'vw_camp_arrecadacao já tem a carência de crédito · nada a fazer';
    RETURN;
  END IF;

  q_t := (length(v_def) - length(replace(v_def, a_t, ''))) / length(a_t);
  q_b := (length(v_def) - length(replace(v_def, a_b, ''))) / length(a_b);
  IF q_t <> 2 OR q_b <> 1 THEN
    RAISE EXCEPTION 'vw_camp_arrecadacao divergiu do esperado: âncora de transação % vez(es) (esperado 2: conf + lancado), de bruto % vez(es) (esperado 1: concil). Conferir a definição viva antes de reaplicar.', q_t, q_b;
  END IF;

  v_novo := replace(replace(v_def, a_t, n_t), a_b, n_b);
  v_novo := regexp_replace(v_novo, ';\s*$', '');

  SELECT c.reloptions INTO v_opts FROM pg_class c WHERE c.oid = 'public.vw_camp_arrecadacao'::regclass;

  
  
  EXECUTE 'CREATE OR REPLACE VIEW public.vw_camp_arrecadacao'
    || CASE WHEN v_opts IS NOT NULL THEN ' WITH (' || array_to_string(v_opts, ', ') || ')' ELSE '' END
    || ' AS ' || v_novo;

  v_def := pg_get_viewdef('public.vw_camp_arrecadacao'::regclass, true);
  q_final := (length(v_def) - length(replace(v_def, 'camp_carencia_credito_dias()', ''))) / length('camp_carencia_credito_dias()');
  IF q_final <> 3 THEN
    RAISE EXCEPTION 'Depois do patch a carência aparece % vez(es) na view (esperado 3) · abortando', q_final;
  END IF;
END
$patch$;

COMMENT ON VIEW public.vw_camp_arrecadacao IS
  'Arrecadação por campanha: caixa confirmado (fin_transacoes) + conciliando (brutos que o balanço ainda não alcançou) + online (pag_cobrancas). '
  'No caminho do DÍGITO, o crédito conta de data_inicio até data_fim + camp_carencia_credito_dias() (3 dias): '
  'o Pix do último domingo é creditado na segunda (terça se feriado). Inclusão manual (camp_vinculos.incluir) ignora a janela. '
  'Espelho JS: backend/utils/digitoCampanha.js (fimJanelaCredito / montarExtratoCaixa).';
