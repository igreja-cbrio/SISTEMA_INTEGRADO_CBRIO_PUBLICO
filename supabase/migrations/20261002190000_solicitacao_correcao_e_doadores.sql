





















ALTER TABLE public.solicitacao_ajustes
  ADD COLUMN IF NOT EXISTS alteracoes jsonb;

COMMENT ON COLUMN public.solicitacao_ajustes.alteracoes IS
  'Correção depois do pagamento: {campo: {antes, depois}} só dos campos que mudaram. '
  'Gravado por fn_solicitacao_corrigir na MESMA transação da correção.';










CREATE OR REPLACE FUNCTION public.fn_solicitacao_corrigir(
  p_id uuid,
  p_esperado timestamptz,
  p_campos jsonb,
  p_alteracoes jsonb,
  p_autor uuid,
  p_motivo text,
  p_arquivo jsonb,
  p_observacao text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sol     public.solicitacoes%ROWTYPE;
  v_ajuste  uuid;
  v_comp    uuid;
  v_antigo  record;
  v_antigos text[] := ARRAY[]::text[];
  v_campos  jsonb := coalesce(p_campos, '{}'::jsonb);
BEGIN
  IF p_autor IS NULL THEN
    RAISE EXCEPTION 'autor obrigatório' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(p_motivo, ''))) < 10 THEN
    RAISE EXCEPTION 'motivo obrigatório' USING ERRCODE = '22023';
  END IF;
  IF v_campos = '{}'::jsonb AND p_arquivo IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'nada_mudou');
  END IF;

  SELECT * INTO v_sol FROM public.solicitacoes
   WHERE id = p_id AND deleted_at IS NULL
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'nao_encontrada');
  END IF;
  IF p_esperado IS NOT NULL AND v_sol.updated_at IS DISTINCT FROM p_esperado THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'conflito');
  END IF;
  
  IF v_sol.pago_em IS NULL
     OR v_sol.status NOT IN ('concluido', 'avaliado', 'aguardando_entrega')
     OR v_sol.categoria NOT IN ('reembolso', 'pagamento', 'compras', 'servico') THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'nao_elegivel');
  END IF;
  
  IF v_sol.fin_transacao_id IS NOT NULL AND (v_campos ? 'pago_valor' OR v_campos ? 'pagamento_data') THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'lancada');
  END IF;

  UPDATE public.solicitacoes SET
    titulo           = CASE WHEN v_campos ? 'titulo'           THEN v_campos->>'titulo'                ELSE titulo END,
    descricao        = CASE WHEN v_campos ? 'descricao'        THEN v_campos->>'descricao'             ELSE descricao END,
    justificativa    = CASE WHEN v_campos ? 'justificativa'    THEN v_campos->>'justificativa'         ELSE justificativa END,
    motivo_reembolso = CASE WHEN v_campos ? 'motivo_reembolso' THEN v_campos->>'motivo_reembolso'      ELSE motivo_reembolso END,
    pagamento_forma  = CASE WHEN v_campos ? 'pagamento_forma'  THEN v_campos->>'pagamento_forma'       ELSE pagamento_forma END,
    pagamento_data   = CASE WHEN v_campos ? 'pagamento_data'   THEN (v_campos->>'pagamento_data')::date ELSE pagamento_data END,
    pago_valor       = CASE WHEN v_campos ? 'pago_valor'       THEN (v_campos->>'pago_valor')::numeric ELSE pago_valor END,
    pago_observacao  = CASE WHEN v_campos ? 'pago_observacao'  THEN NULLIF(btrim(coalesce(v_campos->>'pago_observacao', '')), '') ELSE pago_observacao END
  WHERE id = p_id;

  IF p_arquivo IS NOT NULL THEN
    FOR v_antigo IN
      SELECT id, nome FROM public.fin_comprovantes
       WHERE origem_tipo = 'solicitacao' AND origem_id = p_id
         AND pasta = p_arquivo->>'pasta' AND deleted_at IS NULL
    LOOP
      PERFORM public.app_soft_delete('fin_comprovantes', v_antigo.id::text, p_autor);
      v_antigos := v_antigos || (v_antigo.id::text || ' · ' || coalesce(v_antigo.nome, 'sem nome'));
    END LOOP;
    INSERT INTO public.fin_comprovantes
      (origem_tipo, origem_id, pasta, storage_path, nome, mime, tamanho, sha256, criado_por)
    VALUES
      ('solicitacao', p_id, p_arquivo->>'pasta', p_arquivo->>'storage_path',
       p_arquivo->>'nome', p_arquivo->>'mime', NULLIF(p_arquivo->>'tamanho', '')::int,
       p_arquivo->>'sha256', p_autor)
    RETURNING id INTO v_comp;
  END IF;

  INSERT INTO public.solicitacao_ajustes (solicitacao_id, autor_id, lado, motivo, comentario, alteracoes)
  VALUES (p_id, p_autor, 'responsavel', 'edicao', btrim(p_motivo),
          coalesce(p_alteracoes, '{}'::jsonb)
            || CASE WHEN p_arquivo IS NOT NULL
                    THEN jsonb_build_object('comprovante', jsonb_build_object(
                           'antes', CASE WHEN cardinality(v_antigos) > 0 THEN array_to_string(v_antigos, ', ') END,
                           'depois', p_arquivo->>'nome'))
                    ELSE '{}'::jsonb END)
  RETURNING id INTO v_ajuste;

  
  INSERT INTO public.solicitacoes_eventos (solicitacao_id, status_anterior, status_novo, ator_id, observacao)
  VALUES (p_id, v_sol.status, v_sol.status, p_autor,
          coalesce(NULLIF(btrim(coalesce(p_observacao, '')), ''), 'Correção depois do pagamento'));

  RETURN jsonb_build_object('ok', true, 'ajuste_id', v_ajuste, 'comprovante_id', v_comp);
END $$;

REVOKE ALL ON FUNCTION public.fn_solicitacao_corrigir(uuid, timestamptz, jsonb, jsonb, uuid, text, jsonb, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_solicitacao_corrigir(uuid, timestamptz, jsonb, jsonb, uuid, text, jsonb, text)
  TO service_role;

COMMENT ON FUNCTION public.fn_solicitacao_corrigir(uuid, timestamptz, jsonb, jsonb, uuid, text, jsonb, text) IS
  'Correção de solicitação JÁ PAGA (concluido · avaliado · aguardando_entrega). Grava a correção, '
  'o antes/depois com autor (solicitacao_ajustes.alteracoes) e o evento na mesma transação: sem '
  'registro, não há correção. Não muda status, concluido_em nem pago_em. Só o backend chama; a régua '
  'é backend/utils/correcaoSolicitacao.js.';




DO $$
DECLARE
  v_def    text;
  v_arg    text;
  v_cols   text[];
  v_novas  text[] := ARRAY['titulo', 'descricao', 'justificativa', 'motivo_reembolso', 'pago_observacao'];
  v_c      text;
  v_novo   text;
BEGIN
  SELECT pg_get_triggerdef(t.oid), split_part(encode(t.tgargs, 'escape'), '\000', 1)
    INTO v_def, v_arg
    FROM pg_trigger t
   WHERE t.tgrelid = 'public.solicitacoes'::regclass AND t.tgname = 'trg_audit_solicitacoes';
  IF v_def IS NULL THEN
    RAISE NOTICE 'trg_audit_solicitacoes ausente · nada a ampliar';
    RETURN;
  END IF;
  IF v_arg IS NULL OR v_arg = '' THEN
    RAISE NOTICE 'trg_audit_solicitacoes audita todas as colunas · nada a ampliar';
    RETURN;
  END IF;
  v_cols := string_to_array(v_arg, ',');
  FOREACH v_c IN ARRAY v_novas LOOP
    IF NOT (v_c = ANY (v_cols)) THEN v_cols := v_cols || v_c; END IF;
  END LOOP;
  v_novo := array_to_string(v_cols, ',');
  IF v_novo = v_arg THEN RETURN; END IF;
  IF (length(v_def) - length(replace(v_def, quote_literal(v_arg), ''))) / length(quote_literal(v_arg)) <> 1 THEN
    RAISE EXCEPTION 'âncora da lista de colunas não casou exatamente uma vez · abortado';
  END IF;
  EXECUTE 'DROP TRIGGER trg_audit_solicitacoes ON public.solicitacoes';
  EXECUTE replace(v_def, quote_literal(v_arg), quote_literal(v_novo));
END $$;





CREATE OR REPLACE FUNCTION public.fn_doador_chave(p text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path TO 'public', 'extensions' AS $$
  
  
  
  SELECT NULLIF(btrim(regexp_replace(public.fn_nome_norm(coalesce(p, '')), '\s+', ' ', 'g')), '')
$$;

COMMENT ON FUNCTION public.fn_doador_chave(text) IS
  'Chave do doador = nome do extrato (fin_transacoes.referencia) normalizado. Agrupa por NOME, '
  'não por pessoa: homônimos caem juntos e variações do mesmo nome ficam separadas (a tela deixa '
  'juntar à mão e o relatório lista os nomes incluídos).';

CREATE INDEX IF NOT EXISTS idx_fin_transacoes_doador_chave_trgm
  ON public.fin_transacoes USING gin (public.fn_doador_chave(referencia) gin_trgm_ops)
  WHERE tipo = 'receita';
CREATE INDEX IF NOT EXISTS idx_fin_transacoes_doador_chave
  ON public.fin_transacoes (public.fn_doador_chave(referencia), data_competencia)
  WHERE tipo = 'receita';







CREATE OR REPLACE FUNCTION public.fn_fin_doadores_buscar(
  p_q text,
  p_prefixos text[],
  p_classes text[],
  p_limite int DEFAULT 30
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_q       text := public.fn_doador_chave(p_q);
  v_tokens  text[];
  v_maior   text;
  v_limite  int := LEAST(GREATEST(coalesce(p_limite, 30), 1), 100);
  v_res     jsonb;
BEGIN
  
  IF v_q IS NULL OR length(replace(v_q, ' ', '')) < 3 THEN
    RAISE EXCEPTION 'busca curta' USING ERRCODE = '22023';
  END IF;
  IF p_prefixos IS NULL OR cardinality(p_prefixos) = 0 THEN
    RAISE EXCEPTION 'lista de planos vazia' USING ERRCODE = '22023';
  END IF;
  IF p_classes IS NULL OR cardinality(p_classes) = 0 THEN
    RAISE EXCEPTION 'lista de classes vazia' USING ERRCODE = '22023';
  END IF;
  
  
  SELECT array_agg(replace(replace(replace(tk, '\', '\\'), '%', '\%'), '_', '\_'))
    INTO v_tokens
    FROM unnest(string_to_array(v_q, ' ')) tk WHERE tk <> '';
  SELECT tk INTO v_maior FROM unnest(v_tokens) tk ORDER BY length(tk) DESC LIMIT 1;

  WITH planos AS (
    SELECT p.id FROM public.fin_plano_contas p
     WHERE EXISTS (SELECT 1 FROM unnest(p_prefixos) x WHERE p.codigo = x OR p.codigo LIKE x || '.%')
  ),
  base AS (
    SELECT public.fn_doador_chave(t.referencia) AS chave,
           btrim(t.referencia) AS nome,
           t.valor, t.data_competencia AS data, t.membro_id,
           NULLIF(t.conciliacao_ofx->>'cpf', '') AS cpf
      FROM public.fin_transacoes t
     WHERE t.tipo = 'receita'
       AND t.status <> 'cancelado'
       AND t.classe_movimento = ANY (p_classes)
       
       AND t.classe_movimento NOT IN ('emprestimo', 'transferencia', 'estorno')
       AND t.plano_contas_id IN (SELECT id FROM planos)
       AND public.fn_doador_chave(t.referencia) LIKE '%' || v_maior || '%'
       AND NOT EXISTS (
         SELECT 1 FROM unnest(v_tokens) tk
          WHERE public.fn_doador_chave(t.referencia) NOT LIKE '%' || tk || '%'
       )
  ),
  validos AS (
    
    SELECT * FROM base
     WHERE chave NOT IN ('(sem descricao)', 'sem descricao')
       AND chave !~ '\*'
       AND chave ~ '[a-z]'
  ),
  grupos AS (
    SELECT chave,
           mode() WITHIN GROUP (ORDER BY nome) AS nome,
           count(*) AS qtd,
           sum(valor) AS total,
           min(data) AS primeira,
           max(data) AS ultima,
           array_agg(DISTINCT membro_id) FILTER (WHERE membro_id IS NOT NULL) AS membros,
           array_agg(DISTINCT cpf) FILTER (WHERE cpf ~ '^\d{11}$') AS cpfs
      FROM validos
     GROUP BY chave
  ),
  ordenados AS (
    SELECT g.*, count(*) OVER () AS total_nomes
      FROM grupos g
     ORDER BY (g.chave = v_q) DESC, (g.chave LIKE v_q || '%') DESC, g.total DESC
     LIMIT v_limite
  )
  SELECT jsonb_build_object(
           'limite', v_limite,
           'total_nomes', coalesce(max(o.total_nomes), 0),
           'itens', coalesce(jsonb_agg(jsonb_build_object(
              'chave', o.chave,
              'nome', o.nome,
              'qtd', o.qtd,
              'total', o.total,
              'primeira', o.primeira,
              'ultima', o.ultima,
              'qtd_cpfs', coalesce(cardinality(o.cpfs), 0),
              'cpf_mascarado', CASE WHEN cardinality(o.cpfs) = 1
                                    THEN '***.' || substr(o.cpfs[1], 4, 3) || '.' || substr(o.cpfs[1], 7, 3) || '-**'
                                    END,
              'membros', coalesce((
                 SELECT jsonb_agg(jsonb_build_object('id', m.id, 'nome', m.nome) ORDER BY m.nome)
                   FROM public.mem_membros m
                  WHERE m.id = ANY (o.membros) AND m.deleted_at IS NULL
              ), '[]'::jsonb)
            ) ORDER BY (o.chave = v_q) DESC, (o.chave LIKE v_q || '%') DESC, o.total DESC), '[]'::jsonb)
         )
    INTO v_res
    FROM ordenados o;
  RETURN v_res;
END $$;

REVOKE ALL ON FUNCTION public.fn_fin_doadores_buscar(text, text[], text[], int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_fin_doadores_buscar(text, text[], text[], int) TO service_role;





CREATE OR REPLACE FUNCTION public.fn_fin_doador_historico(
  p_chaves text[],
  p_prefixos text[],
  p_classes text[],
  p_inicio date DEFAULT NULL,
  p_fim date DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_limite int := 5000;
  v_res    jsonb;
BEGIN
  IF p_chaves IS NULL OR cardinality(p_chaves) = 0 OR cardinality(p_chaves) > 20 THEN
    RAISE EXCEPTION 'informe de 1 a 20 nomes' USING ERRCODE = '22023';
  END IF;
  IF p_prefixos IS NULL OR cardinality(p_prefixos) = 0 THEN
    RAISE EXCEPTION 'lista de planos vazia' USING ERRCODE = '22023';
  END IF;
  IF p_classes IS NULL OR cardinality(p_classes) = 0 THEN
    RAISE EXCEPTION 'lista de classes vazia' USING ERRCODE = '22023';
  END IF;

  WITH planos AS (
    SELECT p.id, p.codigo, p.nome FROM public.fin_plano_contas p
     WHERE EXISTS (SELECT 1 FROM unnest(p_prefixos) x WHERE p.codigo = x OR p.codigo LIKE x || '.%')
  ),
  linhas AS (
    SELECT t.id, t.data_competencia AS data, t.valor, pl.codigo AS plano_codigo, pl.nome AS plano_nome,
           t.classe_movimento AS classe, t.forma_pagamento, btrim(t.referencia) AS nome,
           public.fn_doador_chave(t.referencia) AS chave, t.membro_id,
           CASE WHEN t.conciliacao_ofx->>'cpf' ~ '^\d{11}$'
                THEN '***.' || substr(t.conciliacao_ofx->>'cpf', 4, 3) || '.' || substr(t.conciliacao_ofx->>'cpf', 7, 3) || '-**'
                END AS cpf_mascarado
      FROM public.fin_transacoes t
      JOIN planos pl ON pl.id = t.plano_contas_id
     WHERE t.tipo = 'receita'
       AND t.status <> 'cancelado'
       AND t.classe_movimento = ANY (p_classes)
       
       AND t.classe_movimento NOT IN ('emprestimo', 'transferencia', 'estorno')
       AND public.fn_doador_chave(t.referencia) = ANY (p_chaves)
       AND (p_inicio IS NULL OR t.data_competencia >= p_inicio)
       AND (p_fim IS NULL OR t.data_competencia <= p_fim)
  ),
  contadas AS (
    SELECT l.*, count(*) OVER () AS qtd_total
      FROM linhas l
     ORDER BY l.data DESC, l.valor DESC, l.id
     LIMIT v_limite
  )
  SELECT jsonb_build_object(
           'limite', v_limite,
           'qtd_total', coalesce(max(c.qtd_total), 0),
           'truncado', coalesce(max(c.qtd_total), 0) > v_limite,
           'linhas', coalesce(jsonb_agg(jsonb_build_object(
              'id', c.id, 'data', c.data, 'valor', c.valor,
              'plano_codigo', c.plano_codigo, 'plano_nome', c.plano_nome,
              'classe', c.classe, 'forma_pagamento', c.forma_pagamento,
              'nome', c.nome, 'chave', c.chave, 'membro_id', c.membro_id,
              'cpf_mascarado', c.cpf_mascarado
            ) ORDER BY c.data DESC, c.valor DESC, c.id), '[]'::jsonb),
           'membros', coalesce((
              SELECT jsonb_agg(DISTINCT jsonb_build_object('id', m.id, 'nome', m.nome))
                FROM public.mem_membros m
               WHERE m.deleted_at IS NULL
                 AND m.id IN (SELECT membro_id FROM contadas WHERE membro_id IS NOT NULL)
           ), '[]'::jsonb)
         )
    INTO v_res
    FROM contadas c;
  RETURN v_res;
END $$;

REVOKE ALL ON FUNCTION public.fn_fin_doador_historico(text[], text[], text[], date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_fin_doador_historico(text[], text[], text[], date, date) TO service_role;

COMMENT ON FUNCTION public.fn_fin_doadores_buscar(text, text[], text[], int) IS
  'Busca de doador por trecho do nome do extrato (fin_transacoes.referencia), agrupada por fn_doador_chave. '
  'Só receitas de doação (planos e classes por parâmetro, vindos de utils/doacoesDoador.js). Só o backend chama.';
COMMENT ON FUNCTION public.fn_fin_doador_historico(text[], text[], text[], date, date) IS
  'Linhas de doação de 1 a 20 chaves de doador no período. Teto de 5000 linhas com a base declarada '
  '(qtd_total · truncado). Só o backend chama; o acesso fica registrado em app_audit_log pela rota.';
