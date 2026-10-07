






































BEGIN;







INSERT INTO public.tipos_dado_bruto
  (id, nome, descricao, unidade, agregacao, granularidade, origem_tabela, entrada_manual, ordem)
VALUES
  ('grupos_ativos_declarado',
   'Grupos ativos (declarado)',
   'Quantos grupos a área tinha ATIVOS no fim do período. Lançado à mão porque o automático conta sempre o número de HOJE — ele não sabe responder "quantos havia em março". Use a data do FIM do período que está declarando.',
   'grupos', 'last', 'mensal', NULL, true, 94),
  ('lideres_treinamento_declarado',
   'Líderes em treinamento (declarado)',
   'Quantos líderes estavam em treinamento no fim do período. Mesmo motivo do anterior: o automático é um retrato de hoje e não reconstrói o passado.',
   'líderes', 'last', 'mensal', NULL, true, 95),
  ('doacoes_valor_declarado',
   'Generosidade · valor arrecadado (declarado)',
   'Valor que a área arrecadou no período, em reais. Lançado à mão enquanto a base nominal de contribuições não é atualizada.',
   'R$', 'sum', 'mensal', NULL, true, 96),
  ('doadores_count_declarado',
   'Generosidade · doadores (declarado)',
   'Quantas PESSOAS diferentes doaram no período. ⚠️ Não somar entre meses: quem doa todo mês é uma pessoa só.',
   'pessoas', 'last', 'mensal', NULL, true, 97),
  ('doadores_recorrentes_declarado',
   'Generosidade · doadores recorrentes (declarado)',
   'Quantos desses doadores doaram em 3 meses seguidos ou mais. Não deve passar do total de doadores.',
   'pessoas', 'last', 'mensal', NULL, true, 98)
ON CONFLICT (id) DO UPDATE
  SET nome = EXCLUDED.nome,
      descricao = EXCLUDED.descricao,
      agregacao = EXCLUDED.agregacao,
      entrada_manual = true,
      ativo = true;



DO $guarda$
DECLARE v_def text; v_id text;
BEGIN
  SELECT regexp_replace(pg_get_functiondef(p.oid), '--[^\n]*', '', 'g') INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = '_kpi_agregar_dado';

  FOREACH v_id IN ARRAY ARRAY['grupos_ativos_declarado', 'lideres_treinamento_declarado',
                              'doacoes_valor_declarado', 'doadores_count_declarado',
                              'doadores_recorrentes_declarado'] LOOP
    IF position(v_id in v_def) > 0 THEN
      RAISE EXCEPTION 'ABORTADO: % ganhou ramo nativo — a entrada manual seria ignorada em silêncio', v_id;
    END IF;
  END LOOP;
END;
$guarda$;







UPDATE public.kpi_indicadores_taticos
   SET formula_config = jsonb_set(formula_config, '{dado_tipo}', '"grupos_ativos_declarado"'),
       observacoes = coalesce(observacoes || E'\n', '') ||
         '[2026-09-21] Repontado para entrada MANUAL (grupos_ativos_declarado). Motivo: o ramo ' ||
         'nativo `grupos_ativos` conta WHERE ativo=true SEM filtro de periodo, entao devolve o ' ||
         'numero de HOJE para qualquer data — o delta_pct comparava hoje com hoje e dava 0% para ' ||
         'sempre. Medido: online = 22 em setembro E 22 em marco. Alem disso os 22 grupos online ' ||
         'tem created_at de uma carga em massa (19/06 a 22/07) e sao todos da temporada T2-2026, ' ||
         'entao nao existe ciclo anterior no banco para comparar. Lancar em /dados-brutos.'
 WHERE ativo AND deleted_at IS NULL
   AND formula_config->>'dado_tipo' = 'grupos_ativos'
   AND lower(area) = 'online';

UPDATE public.kpi_indicadores_taticos
   SET formula_config = jsonb_set(formula_config, '{dado_tipo}', '"lideres_treinamento_declarado"'),
       observacoes = coalesce(observacoes || E'\n', '') ||
         '[2026-09-21] Repontado para entrada MANUAL (lideres_treinamento_declarado). Mesmo ' ||
         'motivo dos grupos: o ramo nativo filtra `saiu_em IS NULL`, que é o estado de HOJE, ' ||
         'entao o delta compara o mesmo retrato consigo mesmo. Medido: online = 2 nos dois lados.'
 WHERE ativo AND deleted_at IS NULL
   AND formula_config->>'dado_tipo' = 'lideres_treinados'
   AND lower(area) = 'online';



























UPDATE public.kpi_indicadores_taticos
   SET formula_config = jsonb_set(formula_config, '{dado_tipo}', '"doacoes_valor_declarado"'),
       observacoes = coalesce(observacoes || E'\n', '') ||
         '[2026-09-21] Repontado para entrada MANUAL (doacoes_valor_declarado). Motivo: o tipo ' ||
         'automatico nao e segmentado por area (decisao de 14/08) e publicava o mesmo 36,7 nas 5 ' ||
         'areas; e a base nominal parou (mem_contribuicoes: 1 linha desde julho, 0 em setembro). ' ||
         'Voltar ao automatico e decisao de gente quando a base for atualizada.'
 WHERE ativo AND deleted_at IS NULL
   AND formula_config->>'dado_tipo' = 'doacoes_valor'
   AND lower(area) = 'online';

UPDATE public.kpi_indicadores_taticos
   SET formula_config = jsonb_set(formula_config, '{dado_tipo}', '"doadores_count_declarado"'),
       observacoes = coalesce(observacoes || E'\n', '') ||
         '[2026-09-21] Repontado para entrada MANUAL (doadores_count_declarado). O -99,7% que ' ||
         'este KPI publicava NAO era queda de doacao: era a base nominal parada desde junho.'
 WHERE ativo AND deleted_at IS NULL
   AND formula_config->>'dado_tipo' = 'doadores_count'
   AND lower(area) = 'online';

UPDATE public.kpi_indicadores_taticos
   SET formula_config = jsonb_set(
         jsonb_set(formula_config, '{numerador}', '"doadores_recorrentes_declarado"'),
         '{denominador}', '"doadores_count_declarado"'),
       observacoes = coalesce(observacoes || E'\n', '') ||
         '[2026-09-21] Repontado para entrada MANUAL (doadores_*_declarado). Mesmo motivo: fonte ' ||
         'nominal parada e numero identico nas 5 areas.'
 WHERE ativo AND deleted_at IS NULL
   AND formula_config->>'numerador' = 'doadores_recorrentes'
   AND lower(area) = 'online';











DO $inv$
DECLARE v_def text; v_ruins text;
BEGIN
  SELECT regexp_replace(pg_get_functiondef(p.oid), '--[^\n]*', '', 'g') INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = '_kpi_agregar_dado';

  SELECT string_agg(id, ', ') INTO v_ruins
    FROM public.tipos_dado_bruto
   WHERE ativo AND entrada_manual = true
     AND position('p_dado_tipo = ''' || id || '''' in v_def) > 0;

  IF v_ruins IS NOT NULL THEN
    RAISE EXCEPTION 'ABORTADO: tipos manuais com ramo nativo: %', v_ruins;
  END IF;
END;
$inv$;

COMMIT;
