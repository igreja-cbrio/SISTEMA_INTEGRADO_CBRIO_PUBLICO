









































BEGIN;








DO $patch$
DECLARE
  v_def   text;
  v_velho text;
  v_novo  text;
  v_ocorr int;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = '_kpi_agregar_dado';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'ABORTADO: _kpi_agregar_dado não existe';
  END IF;

  
  IF position('vol_teams t ON t.id = s.team_id' in v_def) > 0 THEN
    RAISE NOTICE 'voluntarios_checkin já filtra por área — nada a fazer';
    RETURN;
  END IF;

  v_velho :=
    '        FROM public.vol_schedules s' || E'\n' ||
    '        JOIN public.vol_services sv ON sv.id = s.service_id' || E'\n' ||
    '        LEFT JOIN public.vol_check_ins ci ON ci.schedule_id = s.id' || E'\n' ||
    '       WHERE sv.scheduled_at::date BETWEEN p_data_inicio AND p_data_fim;';

  
  
  v_ocorr := (length(v_def) - length(replace(v_def, v_velho, ''))) / length(v_velho);
  IF v_ocorr <> 1 THEN
    RAISE EXCEPTION 'ABORTADO: âncora do ramo voluntarios_checkin não é única (% ocorrências)', v_ocorr;
  END IF;

  
  
  
  
  
  
  v_novo :=
    '        FROM public.vol_schedules s' || E'\n' ||
    '        JOIN public.vol_services sv ON sv.id = s.service_id' || E'\n' ||
    '        LEFT JOIN public.vol_teams t ON t.id = s.team_id' || E'\n' ||
    '        LEFT JOIN public.vol_check_ins ci ON ci.schedule_id = s.id' || E'\n' ||
    '       WHERE sv.scheduled_at::date BETWEEN p_data_inicio AND p_data_fim' || E'\n' ||
    '         AND (NOT v_filtra_area OR lower(t.area) = v_area_lower);';

  EXECUTE replace(v_def, v_velho, v_novo);
  RAISE NOTICE 'voluntarios_checkin passou a filtrar por área';
END;
$patch$;


DO $conf$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = '_kpi_agregar_dado'
       AND position('vol_teams t ON t.id = s.team_id' in pg_get_functiondef(p.oid)) > 0
  ) THEN
    RAISE EXCEPTION 'ABORTADO: o patch de área não pegou';
  END IF;
END;
$conf$;









UPDATE public.kpi_indicadores_taticos
   SET ativo = false,
       observacoes = coalesce(observacoes || E'\n', '') ||
         '[2026-09-21] Desativado: `voluntarios_checkin` passou a filtrar por área ' ||
         '(antes publicava o número da IGREJA INTEIRA — os 5 KPIs mostravam 30,43 idêntico). ' ||
         'Não existe equipe com esta área em vol_teams (só KIDS e Online casam), ' ||
         'então este recorte devolveria NULL para sempre. Reativar quando as equipes ' ||
         'de voluntariado tiverem a área preenchida.'
 WHERE ativo
   AND deleted_at IS NULL
   AND formula_config->>'dado_tipo' = 'voluntarios_checkin'
   AND lower(area) IN ('ami', 'bridge', 'sede');
















UPDATE public.kpi_indicadores_taticos
   SET ativo = false,
       observacoes = coalesce(observacoes || E'\n', '') ||
         '[2026-09-21] Desativado: a fórmula é `voluntarios_recuperados / voluntarios_inativos_3m` ' ||
         '= taxa de RECUPERAÇÃO, não de saída — e com menor_melhor + meta 5 o farol pedia que ' ||
         'recuperar voluntário fosse raro. Além disso os dois lados leem mem_voluntarios.ate, ' ||
         'NULL em 635 de 635 linhas (não existe fluxo de baixa), então o resultado é 0/0 = NULL. ' ||
         'Medir saída exige primeiro decidir de quem é a rotina de dar baixa.'
 WHERE ativo
   AND deleted_at IS NULL
   AND formula_config->>'numerador' = 'voluntarios_recuperados'
   AND formula_config->>'denominador' = 'voluntarios_inativos_3m';











UPDATE public.kpi_indicadores_taticos
   SET indicador = '% de solicitações de servir que foram alocadas',
       observacoes = coalesce(observacoes || E'\n', '') ||
         '[2026-09-21] Renomeado: o texto dizia "check-in corretamente" (idêntico ao KPI de ' ||
         'voluntarios_checkin), mas a fórmula sempre foi solicitacoes_servir_alocadas / ' ||
         'solicitacoes_servir_recebidas. Só o rótulo estava errado — a série continua válida.'
 WHERE ativo AND deleted_at IS NULL
   AND formula_config->>'numerador' = 'solicitacoes_servir_alocadas'
   AND indicador ILIKE '%check-in%';


UPDATE public.kpi_indicadores_taticos
   SET indicador = '% de crescimento de devocionais',
       observacoes = coalesce(observacoes || E'\n', '') ||
         '[2026-09-21] Renomeado: o texto era só "% de crescimento", idêntico ao KPI de ' ||
         'frequencia_grupos na mesma área. Fórmula intocada.'
 WHERE ativo AND deleted_at IS NULL
   AND formula_config->>'dado_tipo' = 'devocionais'
   AND btrim(indicador) = '% de crescimento';

UPDATE public.kpi_indicadores_taticos
   SET indicador = '% de crescimento da frequência em grupos',
       observacoes = coalesce(observacoes || E'\n', '') ||
         '[2026-09-21] Renomeado: o texto era só "% de crescimento", idêntico ao KPI de ' ||
         'devocionais na mesma área. Fórmula intocada.'
 WHERE ativo AND deleted_at IS NULL
   AND formula_config->>'dado_tipo' = 'frequencia_grupos'
   AND btrim(indicador) = '% de crescimento';














INSERT INTO public.tipos_dado_bruto
  (id, nome, descricao, unidade, agregacao, granularidade, origem_tabela, entrada_manual, ordem)
VALUES
  ('atend_capelania_recebidas',
   'Capelania · solicitações recebidas',
   'Quantas pessoas PEDIRAM capelania no período. Lançado à mão pela liderança da área quando o atendimento acontece fora do sistema. Use a data do ATENDIMENTO, nunca a do lançamento.',
   'solicitações', 'sum', 'mensal', NULL, true, 90),
  ('atend_capelania_atendidas',
   'Capelania · atendimentos realizados',
   'Quantos desses pedidos foram DE FATO atendidos no período. Não deve passar do número de recebidas.',
   'atendimentos', 'sum', 'mensal', NULL, true, 91),
  ('atend_aconselh_recebidas',
   'Aconselhamento · solicitações recebidas',
   'Quantas pessoas PEDIRAM aconselhamento no período. Lançado à mão pela liderança da área. Use a data do ATENDIMENTO.',
   'solicitações', 'sum', 'mensal', NULL, true, 92),
  ('atend_aconselh_atendidas',
   'Aconselhamento · atendimentos realizados',
   'Quantos desses pedidos foram DE FATO atendidos no período.',
   'atendimentos', 'sum', 'mensal', NULL, true, 93)
ON CONFLICT (id) DO UPDATE
  SET nome = EXCLUDED.nome,
      descricao = EXCLUDED.descricao,
      entrada_manual = true,
      ativo = true;



DO $guarda$
DECLARE v_def text; v_id text;
BEGIN
  SELECT regexp_replace(pg_get_functiondef(p.oid), '--[^\n]*', '', 'g') INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = '_kpi_agregar_dado';

  FOREACH v_id IN ARRAY ARRAY['atend_capelania_recebidas', 'atend_capelania_atendidas',
                              'atend_aconselh_recebidas', 'atend_aconselh_atendidas'] LOOP
    IF position(v_id in v_def) > 0 THEN
      RAISE EXCEPTION 'ABORTADO: % ganhou ramo nativo em _kpi_agregar_dado — a entrada manual seria ignorada em silêncio', v_id;
    END IF;
  END LOOP;
END;
$guarda$;








UPDATE public.kpi_indicadores_taticos
   SET formula_config = jsonb_set(
         jsonb_set(formula_config, '{numerador}', '"atend_capelania_atendidas"'),
         '{denominador}', '"atend_capelania_recebidas"'),
       indicador = '% de solicitações de capelania atendidas',
       observacoes = coalesce(observacoes || E'\n', '') ||
         '[2026-09-21] Repontado para entrada MANUAL (atend_capelania_*). Motivo: o tipo antigo ' ||
         '`solicitacoes_capelania` lia cui_acompanhamentos (vazia) e tinha RETURN incondicional ' ||
         'na função — o fallback para dados_brutos era INALCANÇÁVEL, então lançar à mão não ' ||
         'movia o número e ninguém recebia erro. Sem série a preservar (0 valores calculados). ' ||
         'Lançar em /dados-brutos.'
 WHERE ativo AND deleted_at IS NULL
   AND formula_config->>'numerador' = 'solicitacoes_capelania'
   AND formula_config->>'denominador' = 'solicitacoes_capelania_recebidas';

UPDATE public.kpi_indicadores_taticos
   SET formula_config = jsonb_set(
         jsonb_set(formula_config, '{numerador}', '"atend_aconselh_atendidas"'),
         '{denominador}', '"atend_aconselh_recebidas"'),
       indicador = '% de solicitações de aconselhamento atendidas',
       observacoes = coalesce(observacoes || E'\n', '') ||
         '[2026-09-21] Repontado para entrada MANUAL (atend_aconselh_*). Mesmo motivo da ' ||
         'capelania: RETURN incondicional tornava o fallback de dados_brutos inalcançável. ' ||
         'Lançar em /dados-brutos.'
 WHERE ativo AND deleted_at IS NULL
   AND formula_config->>'numerador' = 'solicitacoes_aconselh'
   AND formula_config->>'denominador' = 'solicitacoes_aconselhamento_recebidas';














CREATE TABLE IF NOT EXISTS public.online_canal_views_dia (
  data           DATE PRIMARY KEY,
  views          INTEGER NOT NULL CHECK (views >= 0),
  watch_minutos  INTEGER CHECK (watch_minutos >= 0),
  coletado_em    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.online_canal_views_dia IS
  'Views do canal POR DIA, da YouTube Analytics API. ⚠️ NÃO derivar de '
  'online_canal_snapshot: aquele é acumulado e o YouTube o revisa para baixo '
  '(9 quedas em 126 dias medidas em 21/09/2026), então a subtração subestima '
  'a semana em até 45%. ⚠️ O coletor faz UPSERT dos últimos dias de propósito: '
  'o YouTube ainda ajusta D-1 e D-2, e é o upsert que deixa o número se '
  'corrigir sozinho.';

ALTER TABLE public.online_canal_views_dia ENABLE ROW LEVEL SECURITY;



DROP POLICY IF EXISTS online_canal_views_dia_select ON public.online_canal_views_dia;
CREATE POLICY online_canal_views_dia_select ON public.online_canal_views_dia
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS online_canal_views_dia_service ON public.online_canal_views_dia;
CREATE POLICY online_canal_views_dia_service ON public.online_canal_views_dia
  FOR ALL TO service_role USING (true) WITH CHECK (true);





























UPDATE public.tipos_dado_bruto
   SET entrada_manual = false,
       descricao = coalesce(descricao, nome) ||
         ' ⚠️ [2026-09-21] Deixou de aceitar lançamento manual: este tipo tem ramo nativo em '
         '_kpi_agregar_dado com RETURN incondicional, então o fallback para dados_brutos é '
         'inalcançável e o que se lança aqui NUNCA é lido (47 e 37 lançamentos de servir foram '
         'desperdiçados assim). Os lançamentos antigos foram preservados como registro.'
 WHERE ativo
   AND entrada_manual = true
   AND id IN ('solicitacoes_servir_recebidas', 'solicitacoes_servir_alocadas',
              'solicitacoes_capelania_recebidas', 'solicitacoes_aconselhamento_recebidas');





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
    RAISE EXCEPTION 'ABORTADO: tipos manuais com ramo nativo (o lançamento seria ignorado em silêncio): %', v_ruins;
  END IF;
END;
$inv$;
COMMIT;
