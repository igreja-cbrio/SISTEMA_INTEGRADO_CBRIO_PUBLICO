













































DO $$
BEGIN
  IF to_regprocedure('public.fn_doador_chave(text)') IS NULL THEN
    RAISE EXCEPTION 'aplique antes a migration 20261002190000 (fn_doador_chave)';
  END IF;
END $$;




CREATE OR REPLACE FUNCTION public.fn_doacao_tipo(p_codigo text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE
    WHEN p_codigo = '3.01.01'    OR p_codigo LIKE '3.01.01.%'    THEN 'dizimo'
    WHEN p_codigo = '3.01.02'    OR p_codigo LIKE '3.01.02.%'    THEN 'oferta'
    WHEN p_codigo = '3.02.01'    OR p_codigo LIKE '3.02.01.%'    THEN 'campanha'
    WHEN p_codigo = '3.02.03.03' OR p_codigo LIKE '3.02.03.03.%' THEN 'extraordinaria'
    WHEN p_codigo = '3.02.03.05' OR p_codigo LIKE '3.02.03.05.%' THEN 'missoes'
    WHEN p_codigo = '3.02.03.01' OR p_codigo LIKE '3.02.03.01.%' THEN 'acao_social'
    WHEN p_codigo = '3.02.05.05' OR p_codigo LIKE '3.02.05.05.%' THEN 'outras'
  END
$$;

COMMENT ON FUNCTION public.fn_doacao_tipo(text) IS
  'Tipo de doação pelo código do plano de contas (NULL = não é doação). Espelho de '
  'PLANOS_DOACAO em backend/utils/doacoesDoador.js — src/test/doacoesRazaoMigration.test.ts confere.';






CREATE OR REPLACE FUNCTION public.fn_doador_ref_valida(p text)
RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT p IS NOT NULL
     AND p !~ '\*'
     AND p ~ '[A-Za-zÀ-ÿ]'
     AND lower(btrim(p)) NOT IN ('(sem descricao)', 'sem descricao', '(sem descrição)', 'sem descrição')
$$;

CREATE OR REPLACE FUNCTION public.fn_doador_chave_valida(p_chave text)
RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT p_chave IS NOT NULL
     AND p_chave NOT IN ('(sem descricao)', 'sem descricao')
     AND p_chave !~ '\*'
     AND p_chave ~ '[a-z]'
$$;




DROP TABLE IF EXISTS _antes_kpi;
CREATE TEMP TABLE _antes_kpi AS
SELECT date_trunc('month', data)::date AS mes, round(sum(valor), 2) AS total
  FROM public.vw_doacoes_unificada
 WHERE fonte = 'fin_transacoes'
   AND data >= (date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo')::date) - interval '11 months')::date
 GROUP BY 1;


DO $$
DECLARE
  v_def text := pg_get_viewdef('public.vw_doacoes_unificada'::regclass, true);
  n_mc  int := (length(v_def) - length(replace(v_def, 'FROM mem_contribuicoes', ''))) / length('FROM mem_contribuicoes');
  n_pix int := (length(v_def) - length(replace(v_def, 'FROM fin_pix_detalhe', ''))) / length('FROM fin_pix_detalhe');
  n_301 int := (length(v_def) - length(replace(v_def, '''3.01%''', ''))) / length('''3.01%''');
BEGIN
  IF n_mc <> 1 OR n_pix <> 1 OR n_301 <> 1 THEN
    RAISE EXCEPTION 'definição viva de vw_doacoes_unificada não é a esperada (mc=% pix=% 3.01=%) · abortado', n_mc, n_pix, n_301;
  END IF;
END $$;



CREATE OR REPLACE VIEW public.vw_doacoes_unificada AS
WITH membros_unicos AS (
  
  
  
  SELECT public.fn_doador_chave(m.nome) AS chave, (array_agg(m.id))[1] AS membro_id
    FROM public.mem_membros m
   WHERE m.deleted_at IS NULL
     AND public.fn_doador_chave_valida(public.fn_doador_chave(m.nome))
   GROUP BY 1
  HAVING count(*) = 1
)
SELECT ft.id,
       ft.data_competencia AS data,
       
       
       ft.valor::numeric AS valor,
       public.fn_doacao_tipo(pc.codigo) AS tipo,
       ft.forma_pagamento,
       COALESCE(ft.membro_id, mu.membro_id) AS membro_id,
       CASE WHEN public.fn_doador_ref_valida(ft.referencia) THEN NULLIF(btrim(ft.referencia), '') END AS pagador_nome,
       NULL::text AS pagador_documento,
       CASE WHEN public.fn_doacao_tipo(pc.codigo) = 'campanha' THEN pc.nome END AS campanha,
       'fin_transacoes'::text AS origem,
       'fin_transacoes'::text AS fonte,
       pc.codigo AS plano_codigo,
       ft.classe_movimento AS classe,
       CASE WHEN public.fn_doador_ref_valida(ft.referencia) THEN public.fn_doador_chave(ft.referencia) END AS doador_chave,
       CASE WHEN ft.membro_id IS NOT NULL THEN 'cpf'
            WHEN mu.membro_id IS NOT NULL THEN 'nome' END AS atribuicao_origem
  FROM public.fin_transacoes ft
  JOIN public.fin_plano_contas pc ON pc.id = ft.plano_contas_id
  LEFT JOIN membros_unicos mu
    ON ft.membro_id IS NULL
   AND public.fn_doador_chave(ft.referencia) = mu.chave
 WHERE ft.tipo = 'receita'
   AND ft.status <> 'cancelado'
   AND ft.classe_movimento IN ('ordinaria', 'extraordinaria')
   AND public.fn_doacao_tipo(pc.codigo) IS NOT NULL;

COMMENT ON VIEW public.vw_doacoes_unificada IS
  'Doações = lançamentos do RAZÃO (fin_transacoes), uma linha por lançamento, nos 7 planos de doação '
  '(fn_doacao_tipo) com classe ordinaria|extraordinaria. mem_contribuicoes NÃO entra (é o mesmo dinheiro). '
  'membro_id = CPF do OFX, senão nome do extrato com 1 só cadastro vivo (atribuicao_origem). '
  'KPIs que somam dízimo+oferta filtram tipo IN (dizimo, oferta). Migration 20261002200000.';





CREATE OR REPLACE VIEW public.vw_doacoes_mensal AS
WITH meses AS (
  SELECT (date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo')::date) - (n || ' month')::interval)::date AS mes
    FROM generate_series(0, 11) n
),



d AS (
  SELECT u.id, u.data, u.valor, u.tipo, u.membro_id, u.doador_chave,
         date_trunc('month', u.data)::date AS mes
    FROM public.vw_doacoes_unificada u
   WHERE u.data >= (date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo')::date) - interval '11 months')::date
),
agg AS (
  SELECT d.mes,
         sum(d.valor) AS total,
         sum(d.valor) FILTER (WHERE d.tipo = 'dizimo') AS dizimo,
         sum(d.valor) FILTER (WHERE d.tipo = 'oferta') AS oferta,
         sum(d.valor) FILTER (WHERE d.tipo <> ALL (ARRAY['dizimo', 'oferta'])) AS outras,
         count(DISTINCT d.id) AS qtd_doacoes,
         count(DISTINCT COALESCE(d.membro_id::text, d.doador_chave)) AS qtd_doadores_unicos,
         sum(d.valor) FILTER (WHERE d.tipo = 'extraordinaria') AS extraordinaria,
         count(DISTINCT d.membro_id) AS qtd_membros_doadores,
         sum(d.valor) FILTER (WHERE d.membro_id IS NOT NULL) AS total_atribuido,
         count(DISTINCT d.membro_id) FILTER (WHERE mm.status = 'membro_ativo') AS qtd_membros_ativos_doadores,
         count(DISTINCT COALESCE(d.membro_id::text, d.doador_chave)) FILTER (WHERE d.tipo = 'dizimo') AS qtd_dizimistas
    FROM d
    LEFT JOIN public.mem_membros mm ON mm.id = d.membro_id AND mm.deleted_at IS NULL
   GROUP BY d.mes
)
SELECT m.mes,
       to_char(m.mes::timestamptz, 'TMMon/YY') AS mes_label,
       COALESCE(a.total, 0) AS total,
       COALESCE(a.dizimo, 0) AS dizimo,
       COALESCE(a.oferta, 0) AS oferta,
       COALESCE(a.outras, 0) AS outras,
       COALESCE(a.qtd_doacoes, 0) AS qtd_doacoes,
       COALESCE(a.qtd_doadores_unicos, 0) AS qtd_doadores_unicos,
       COALESCE(a.extraordinaria, 0) AS extraordinaria,
       COALESCE(a.qtd_membros_doadores, 0) AS qtd_membros_doadores,
       COALESCE(a.total_atribuido, 0) AS total_atribuido,
       COALESCE(a.qtd_membros_ativos_doadores, 0) AS qtd_membros_ativos_doadores,
       COALESCE(a.qtd_dizimistas, 0) AS qtd_dizimistas
  FROM meses m
  LEFT JOIN agg a ON a.mes = m.mes
 ORDER BY m.mes;



DO $$
DECLARE
  v_def  text := pg_get_functiondef('public._kpi_agregar_dado(text,text,date,date)'::regprocedure);
  v_ancora text := 'fonte = ''fin_transacoes''';
  v_novo text := 'fonte = ''fin_transacoes'' AND tipo IN (''dizimo'', ''oferta'')';
  n int;
BEGIN
  IF position(v_novo IN v_def) > 0 THEN
    RAISE NOTICE '_kpi_agregar_dado já filtra dízimo+oferta · nada a fazer';
    RETURN;
  END IF;
  n := (length(v_def) - length(replace(v_def, v_ancora, ''))) / length(v_ancora);
  IF n <> 2 THEN
    RAISE EXCEPTION '_kpi_agregar_dado: esperava 2 âncoras "%", achei % · abortado', v_ancora, n;
  END IF;
  EXECUTE replace(v_def, v_ancora, v_novo);
END $$;




CREATE OR REPLACE FUNCTION public.fn_generosidade_top(
  p_desde date, p_ate date, p_limite int DEFAULT 20, p_ordem text DEFAULT 'desc'
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_limite int := LEAST(GREATEST(coalesce(p_limite, 20), 1), 100);
  v_res jsonb;
BEGIN
  WITH base AS (
    
    SELECT d.membro_id, d.valor, d.data, d.atribuicao_origem
      FROM public.vw_doacoes_unificada d
     WHERE (p_desde IS NULL OR d.data >= p_desde)
       AND (p_ate IS NULL OR d.data < p_ate)
  ),
  por_membro AS (
    SELECT membro_id, count(*) AS qtd_doacoes, sum(valor) AS total,
           min(data) AS primeira_doacao, max(data) AS ultima_doacao,
           count(*) FILTER (WHERE atribuicao_origem = 'cpf') AS por_cpf,
           count(*) FILTER (WHERE atribuicao_origem = 'nome') AS por_nome
      FROM base WHERE membro_id IS NOT NULL GROUP BY membro_id
  ),
  top AS (
    SELECT * FROM por_membro
     ORDER BY CASE WHEN p_ordem = 'asc' THEN total END ASC NULLS LAST,
              CASE WHEN p_ordem <> 'asc' THEN total END DESC NULLS LAST,
              membro_id
     LIMIT v_limite
  )
  SELECT jsonb_build_object(
    'top', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'membro_id', t.membro_id, 'nome', m.nome, 'qtd_doacoes', t.qtd_doacoes, 'total', t.total,
               'primeira_doacao', t.primeira_doacao, 'ultima_doacao', t.ultima_doacao,
               'por_cpf', t.por_cpf, 'por_nome', t.por_nome)
             ORDER BY CASE WHEN p_ordem = 'asc' THEN t.total END ASC NULLS LAST,
                      CASE WHEN p_ordem <> 'asc' THEN t.total END DESC NULLS LAST, t.membro_id)
        FROM top t LEFT JOIN public.mem_membros m ON m.id = t.membro_id
    ), '[]'::jsonb),
    'pessoas_no_periodo', (SELECT count(*) FROM por_membro),
    'base', (SELECT jsonb_build_object(
               'total_periodo', coalesce(sum(valor), 0),
               'total_atribuido', coalesce(sum(valor) FILTER (WHERE membro_id IS NOT NULL), 0),
               'linhas_periodo', count(*),
               'linhas_atribuidas', count(*) FILTER (WHERE membro_id IS NOT NULL),
               'linhas_por_cpf', count(*) FILTER (WHERE atribuicao_origem = 'cpf'),
               'linhas_por_nome', count(*) FILTER (WHERE atribuicao_origem = 'nome'))
             FROM base)
  ) INTO v_res;
  RETURN v_res;
END $$;


CREATE OR REPLACE FUNCTION public.fn_generosidade_pararam(p_dias_min int DEFAULT 60, p_limite int DEFAULT 100)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_min int := LEAST(GREATEST(coalesce(p_dias_min, 60), 1), 365);
  v_limite int := LEAST(GREATEST(coalesce(p_limite, 100), 1), 500);
  v_res jsonb;
BEGIN
  WITH por_membro AS (
    SELECT membro_id, count(*) AS qtd, sum(valor) AS total, max(data) AS ultima
      FROM (SELECT u.membro_id, u.valor, u.data FROM public.vw_doacoes_unificada u) x
     WHERE membro_id IS NOT NULL
     GROUP BY membro_id
    HAVING count(*) >= 3
  ),
  candidatos AS (
    SELECT p.*, (v_hoje - p.ultima) AS dias_inativo, count(*) OVER () AS total_candidatos
      FROM por_membro p
     WHERE (v_hoje - p.ultima) BETWEEN v_min AND 365
     ORDER BY p.ultima DESC, p.membro_id
     LIMIT v_limite
  )
  SELECT jsonb_build_object(
    'itens', coalesce(jsonb_agg(jsonb_build_object(
               'membro_id', c.membro_id, 'nome', m.nome, 'telefone', m.telefone, 'email', m.email,
               'doacoes_total', c.qtd, 'valor_total', c.total, 'ultima_doacao', c.ultima,
               'dias_inativo', c.dias_inativo)
             ORDER BY c.ultima DESC, c.membro_id) FILTER (WHERE m.id IS NOT NULL), '[]'::jsonb),
    'total_candidatos', coalesce(max(c.total_candidatos), 0),
    'limite', v_limite
  ) INTO v_res
    FROM candidatos c
    LEFT JOIN public.mem_membros m ON m.id = c.membro_id AND m.deleted_at IS NULL;
  RETURN v_res;
END $$;




CREATE OR REPLACE FUNCTION public.fn_generosidade_historico_membro(p_membro uuid, p_desde date, p_ate date)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_chave text;
  v_res jsonb;
BEGIN
  SELECT public.fn_doador_chave(m.nome) INTO v_chave FROM public.mem_membros m WHERE m.id = p_membro;
  WITH candidatas AS (
    SELECT t.id FROM public.fin_transacoes t
     WHERE t.tipo = 'receita' AND t.membro_id = p_membro
    UNION
    SELECT t.id FROM public.fin_transacoes t
     WHERE v_chave IS NOT NULL AND t.tipo = 'receita' AND t.membro_id IS NULL
       AND public.fn_doador_chave(t.referencia) = v_chave
  ),
  linhas AS (
    SELECT u.id, u.data, u.valor, u.tipo, u.forma_pagamento, u.campanha, u.origem, u.fonte,
           u.atribuicao_origem, u.plano_codigo
      FROM public.vw_doacoes_unificada u
     WHERE u.id IN (SELECT id FROM candidatas)
       AND u.membro_id = p_membro
       AND (p_desde IS NULL OR u.data >= p_desde)
       AND (p_ate IS NULL OR u.data < p_ate)
  )
  SELECT jsonb_build_object(
    'linhas', coalesce(jsonb_agg(to_jsonb(l) ORDER BY l.data DESC, l.id), '[]'::jsonb),
    'total', coalesce(sum(l.valor), 0),
    'qtd', count(*),
    'primeira', min(l.data),
    'ultima', max(l.data)
  ) INTO v_res FROM linhas l;
  RETURN v_res;
END $$;

REVOKE ALL ON FUNCTION public.fn_generosidade_historico_membro(uuid, date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_generosidade_historico_membro(uuid, date, date) TO service_role;

REVOKE ALL ON FUNCTION public.fn_generosidade_top(date, date, int, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_generosidade_top(date, date, int, text) TO service_role;
REVOKE ALL ON FUNCTION public.fn_generosidade_pararam(int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_generosidade_pararam(int, int) TO service_role;


DO $$
DECLARE
  r record;
  v_dif int;
BEGIN
  
  SELECT count(*) INTO v_dif FROM (
    SELECT extract(year FROM v.data) AS ano, round(sum(v.valor), 2) AS s FROM public.vw_doacoes_unificada v GROUP BY 1
  ) a FULL JOIN (
    SELECT extract(year FROM t.data_competencia) AS ano, round(sum(t.valor), 2) AS s
      FROM public.fin_transacoes t JOIN public.fin_plano_contas pc ON pc.id = t.plano_contas_id
     WHERE t.tipo = 'receita' AND t.status <> 'cancelado'
       AND t.classe_movimento IN ('ordinaria', 'extraordinaria')
       AND public.fn_doacao_tipo(pc.codigo) IS NOT NULL
     GROUP BY 1
  ) b USING (ano)
  WHERE a.s IS DISTINCT FROM b.s;
  IF v_dif > 0 THEN RAISE EXCEPTION 'trava 7.1: soma por ano da view difere do razão em % ano(s)', v_dif; END IF;

  
  IF EXISTS (SELECT 1 FROM public.vw_doacoes_unificada WHERE fonte <> 'fin_transacoes') THEN
    RAISE EXCEPTION 'trava 7.2: sobrou linha que não é do razão';
  END IF;

  
  FOR r IN
    SELECT a.mes, a.total AS antes, coalesce(d.total, 0) AS depois
      FROM _antes_kpi a
      LEFT JOIN (
        SELECT date_trunc('month', data)::date AS mes, round(sum(valor), 2) AS total
          FROM public.vw_doacoes_unificada
         WHERE fonte = 'fin_transacoes' AND tipo IN ('dizimo', 'oferta')
         GROUP BY 1
      ) d USING (mes)
     WHERE a.total IS DISTINCT FROM coalesce(d.total, 0)
  LOOP
    RAISE EXCEPTION 'trava 7.3: KPI de % mudaria de % para %', r.mes, r.antes, r.depois;
  END LOOP;
END $$;

DROP TABLE IF EXISTS _antes_kpi;







UPDATE public.fin_alertas a
   SET atendido_em = now(),
       comentario_atendimento = 'Fechado automaticamente em 05/10/2026: falso positivo. A visão de doações lia só a importação nominal parada em 16/06; pelo razão, a pessoa doou nos últimos 60 dias. Migration 20261002200000.'
 WHERE a.tipo = 'doador_parou'
   AND a.atendido_em IS NULL
   AND a.membro_id IS NOT NULL
   AND EXISTS (
     SELECT 1 FROM public.vw_doacoes_unificada d
      WHERE d.membro_id = a.membro_id
        AND d.data > (now() AT TIME ZONE 'America/Sao_Paulo')::date - 60
   );

UPDATE public.fin_alertas a
   SET atendido_em = now(),
       comentario_atendimento = 'Fechado automaticamente em 05/10/2026: a pessoa não tem doação identificável no razão (o histórico vinha só da importação nominal parada em 16/06), então o sistema não sabe se ela parou. Migration 20261002200000.'
 WHERE a.tipo = 'doador_parou'
   AND a.atendido_em IS NULL
   AND a.membro_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.vw_doacoes_unificada d WHERE d.membro_id = a.membro_id);
