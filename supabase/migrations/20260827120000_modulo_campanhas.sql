





























BEGIN;












ALTER TABLE public.mem_membros
  ADD COLUMN IF NOT EXISTS email_optout    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_optout_em TIMESTAMPTZ;

COMMENT ON COLUMN public.mem_membros.email_optout IS
  'Pessoa pediu para não receber e-mail de campanha/marketing. NÃO bloqueia '
  'e-mail transacional (comprovante de inscrição, recuperação de senha) — '
  'quem se inscreve num evento precisa receber o comprovante.';




CREATE TABLE IF NOT EXISTS public.camp_campanhas (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              TEXT NOT NULL,
  nome              TEXT NOT NULL,
  descricao_curta   TEXT,
  descricao         TEXT,

  
  
  
  meta_centavos     BIGINT NOT NULL CHECK (meta_centavos > 0),
  meta_minima_centavos BIGINT CHECK (meta_minima_centavos IS NULL OR meta_minima_centavos > 0),

  
  
  
  digito            CHAR(2) CHECK (digito IS NULL OR (digito ~ '^[0-9]{2}$' AND digito <> '00')),

  
  
  plano_contas_id   UUID REFERENCES public.fin_plano_contas(id) ON DELETE SET NULL,
  centro_custo_id   UUID REFERENCES public.fin_centros_custo(id) ON DELETE SET NULL,

  
  
  
  
  data_inicio       DATE,
  data_lancamento   DATE,
  data_fim          DATE,

  status            TEXT NOT NULL DEFAULT 'rascunho'
                      CHECK (status IN ('rascunho','ativa','pausada','encerrada','cancelada')),

  
  publica           BOOLEAN NOT NULL DEFAULT false,
  
  
  
  mostrar_valor     BOOLEAN NOT NULL DEFAULT true,

  
  
  
  
  aceita_online     BOOLEAN NOT NULL DEFAULT true,

  video_url         TEXT,
  imagem_url        TEXT,
  cor_destaque      TEXT,

  observacao        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by        UUID,
  deleted_at        TIMESTAMPTZ
);





CREATE UNIQUE INDEX IF NOT EXISTS camp_campanhas_digito_unq
  ON public.camp_campanhas (digito)
  WHERE deleted_at IS NULL AND digito IS NOT NULL
    AND status IN ('rascunho','ativa','pausada');

CREATE UNIQUE INDEX IF NOT EXISTS camp_campanhas_slug_unq
  ON public.camp_campanhas (slug) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS camp_campanhas_ativa_idx
  ON public.camp_campanhas (status, data_inicio) WHERE deleted_at IS NULL;











CREATE TABLE IF NOT EXISTS public.camp_marcos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campanha_id   UUID NOT NULL REFERENCES public.camp_campanhas(id) ON DELETE CASCADE,
  titulo        TEXT NOT NULL,
  descricao     TEXT,
  tipo          TEXT NOT NULL DEFAULT 'tarefa'
                  CHECK (tipo IN ('marco','tarefa','obra','comunicacao','financeiro')),
  responsavel_id UUID,
  responsavel_nome TEXT,
  data_prevista DATE,
  data_conclusao DATE,
  status        TEXT NOT NULL DEFAULT 'pendente'
                  CHECK (status IN ('pendente','em_andamento','concluido','cancelado','bloqueado')),
  ordem         INTEGER NOT NULL DEFAULT 0,
  marketing_card_id UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID,
  deleted_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS camp_marcos_campanha_idx
  ON public.camp_marcos (campanha_id, ordem, data_prevista) WHERE deleted_at IS NULL;











CREATE TABLE IF NOT EXISTS public.camp_disparos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campanha_id   UUID NOT NULL REFERENCES public.camp_campanhas(id) ON DELETE CASCADE,
  nome          TEXT NOT NULL,
  canal         TEXT NOT NULL CHECK (canal IN ('email','whatsapp','app_push')),
  segmento      TEXT NOT NULL DEFAULT 'todos'
                  CHECK (segmento IN ('todos','membros','voluntarios','pais_kids','doadores_campanha')),

  assunto       TEXT,
  corpo_texto   TEXT,
  corpo_html    TEXT,
  
  
  
  wa_template   TEXT,

  agendado_para TIMESTAMPTZ,
  
  
  recorrencia   TEXT NOT NULL DEFAULT 'unico'
                  CHECK (recorrencia IN ('unico','semanal_segunda')),

  status        TEXT NOT NULL DEFAULT 'rascunho'
                  CHECK (status IN ('rascunho','agendado','enviando','enviado','cancelado','falhou')),
  total_alvo    INTEGER NOT NULL DEFAULT 0,
  total_enviado INTEGER NOT NULL DEFAULT 0,
  total_falha   INTEGER NOT NULL DEFAULT 0,
  total_pulado  INTEGER NOT NULL DEFAULT 0,
  motivos_fora  JSONB,
  erro          TEXT,

  iniciado_em   TIMESTAMPTZ,
  concluido_em  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID,
  deleted_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS camp_disparos_fila_idx
  ON public.camp_disparos (status, agendado_para) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS camp_disparos_campanha_idx
  ON public.camp_disparos (campanha_id, created_at DESC) WHERE deleted_at IS NULL;





CREATE TABLE IF NOT EXISTS public.camp_disparo_envios (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  disparo_id  UUID NOT NULL REFERENCES public.camp_disparos(id) ON DELETE CASCADE,
  membro_id   UUID REFERENCES public.mem_membros(id) ON DELETE SET NULL,
  canal       TEXT NOT NULL,
  destino     TEXT,
  status      TEXT NOT NULL DEFAULT 'pendente'
                CHECK (status IN ('pendente','enviado','falhou','pulado')),
  motivo      TEXT,
  enviado_em  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);



CREATE UNIQUE INDEX IF NOT EXISTS camp_disparo_envios_destino_unq
  ON public.camp_disparo_envios (disparo_id, destino) WHERE destino IS NOT NULL;
CREATE INDEX IF NOT EXISTS camp_disparo_envios_pendente_idx
  ON public.camp_disparo_envios (disparo_id, status);









CREATE TABLE IF NOT EXISTS public.camp_agradecimentos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campanha_id   UUID NOT NULL REFERENCES public.camp_campanhas(id) ON DELETE CASCADE,
  
  
  transacao_id  UUID REFERENCES public.fin_transacoes(id) ON DELETE SET NULL,
  cobranca_id   UUID REFERENCES public.pag_cobrancas(id) ON DELETE SET NULL,
  membro_id     UUID REFERENCES public.mem_membros(id) ON DELETE SET NULL,
  canal         TEXT NOT NULL CHECK (canal IN ('email','whatsapp')),
  destino       TEXT,
  status        TEXT NOT NULL DEFAULT 'pendente'
                  CHECK (status IN ('pendente','enviado','falhou','pulado')),
  motivo        TEXT,
  enviado_em    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);



CREATE UNIQUE INDEX IF NOT EXISTS camp_agradecimentos_transacao_unq
  ON public.camp_agradecimentos (transacao_id) WHERE transacao_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS camp_agradecimentos_cobranca_unq
  ON public.camp_agradecimentos (cobranca_id) WHERE cobranca_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS camp_agradecimentos_membro_idx
  ON public.camp_agradecimentos (membro_id, enviado_em DESC);












CREATE TABLE IF NOT EXISTS public.camp_vinculos (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campanha_id         UUID NOT NULL REFERENCES public.camp_campanhas(id) ON DELETE CASCADE,
  lancamento_bruto_id UUID REFERENCES public.fin_lancamentos_brutos(id) ON DELETE CASCADE,
  transacao_id        UUID REFERENCES public.fin_transacoes(id) ON DELETE CASCADE,
  
  
  incluir             BOOLEAN NOT NULL,
  motivo              TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          UUID,
  CHECK (lancamento_bruto_id IS NOT NULL OR transacao_id IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS camp_vinculos_bruto_unq
  ON public.camp_vinculos (campanha_id, lancamento_bruto_id) WHERE lancamento_bruto_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS camp_vinculos_transacao_unq
  ON public.camp_vinculos (campanha_id, transacao_id) WHERE transacao_id IS NOT NULL;









CREATE OR REPLACE FUNCTION public.camp_digitos_ativos()
RETURNS TABLE (digito CHAR(2), descricao TEXT, plano_contas_id UUID,
               centro_custo_id UUID, campanha_id UUID)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT c.digito, c.nome, c.plano_contas_id, c.centro_custo_id, c.id
    FROM camp_campanhas c
   WHERE c.deleted_at IS NULL
     AND c.digito IS NOT NULL
     AND c.status IN ('ativa','pausada')
  UNION ALL
  
  
  
  
  SELECT i.centavo::CHAR(2), i.descricao, i.plano_contas_id, i.centro_custo_id, NULL::UUID
    FROM fin_identificadores_centavo i
   WHERE i.ativo = true
     AND i.centavo <> '00'
     AND NOT EXISTS (
       SELECT 1 FROM camp_campanhas c
        WHERE c.deleted_at IS NULL AND c.digito = i.centavo
          AND c.status IN ('ativa','pausada')
     );
$$;
























CREATE OR REPLACE FUNCTION public.aplicar_classificacao_lancamento(p_bruto_id uuid)
RETURNS TABLE (plano_contas_id uuid, centro_custo_id uuid, membro_id uuid,
               confianca numeric, origem text, explicacao text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $function$
DECLARE
  b RECORD;
  r RECORD;
  m RECORD;
  d RECORD;
  v_digito CHAR(2);
BEGIN
  SELECT * INTO b FROM fin_lancamentos_brutos WHERE id = p_bruto_id;
  IF NOT FOUND THEN RETURN; END IF;

  
  
  
  IF (b.tipo_trn = 'CREDIT' OR (b.tipo_trn IS DISTINCT FROM 'DEBIT' AND b.valor > 0)) THEN
    v_digito := lpad((round(abs(b.valor) * 100) % 100)::TEXT, 2, '0');

    IF v_digito IS NOT NULL AND v_digito <> '00' THEN
      SELECT * INTO d FROM camp_digitos_ativos() a WHERE a.digito = v_digito LIMIT 1;
      IF FOUND THEN
        plano_contas_id := d.plano_contas_id;
        centro_custo_id := d.centro_custo_id;
        membro_id := NULL;
        origem := 'centavo';
        
        
        IF d.plano_contas_id IS NOT NULL THEN
          confianca := 1.0;
          explicacao := format('Dígito %s · %s', v_digito, d.descricao);
        ELSE
          confianca := 0.5;
          explicacao := format('Dígito %s · %s (escolher a conta)', v_digito, d.descricao);
        END IF;
        RETURN NEXT;
        RETURN;
      END IF;
    END IF;
  END IF;

  
  
  IF b.documento_contraparte IS NOT NULL AND length(trim(b.documento_contraparte)) > 0 THEN
    SELECT * INTO m FROM fin_memoria_classificacao
     WHERE tipo_chave = 'documento'
       AND chave_contraparte = b.documento_contraparte
     ORDER BY ocorrencias DESC, ultimo_uso DESC NULLS LAST
     LIMIT 1;
    IF FOUND THEN
      plano_contas_id := m.plano_contas_id;
      centro_custo_id := m.centro_custo_id;
      membro_id := NULL;
      
      confianca := LEAST(0.95, 0.7 + (LEAST(m.ocorrencias, 10) * 0.025));
      origem := 'memoria_documento';
      explicacao := format('Memoria · documento %s ja foi classificado %s vez(es) na mesma categoria',
                           b.documento_contraparte, m.ocorrencias);
      RETURN NEXT;
      RETURN;
    END IF;
  END IF;

  
  IF b.nome_contraparte IS NOT NULL AND length(trim(b.nome_contraparte)) > 2 THEN
    SELECT * INTO m FROM fin_memoria_classificacao
     WHERE tipo_chave = 'nome'
       AND chave_contraparte = LOWER(TRIM(b.nome_contraparte))
     ORDER BY ocorrencias DESC, ultimo_uso DESC NULLS LAST
     LIMIT 1;
    IF FOUND THEN
      plano_contas_id := m.plano_contas_id;
      centro_custo_id := m.centro_custo_id;
      membro_id := NULL;
      confianca := LEAST(0.90, 0.6 + (LEAST(m.ocorrencias, 10) * 0.03));
      origem := 'memoria_nome';
      explicacao := format('Memoria · "%s" ja foi classificado %s vez(es)',
                           b.nome_contraparte, m.ocorrencias);
      RETURN NEXT;
      RETURN;
    END IF;
  END IF;

  
  FOR r IN
    SELECT * FROM fin_regras_classificacao
    WHERE ativo = true
      AND (aplica_a IS NULL
           OR aplica_a = 'ambos'
           OR (aplica_a = 'credito' AND b.tipo_trn = 'CREDIT')
           OR (aplica_a = 'debito'  AND b.tipo_trn = 'DEBIT'))
    ORDER BY prioridade DESC, created_at ASC
  LOOP
    IF r.tipo_regra = 'regex_memo' AND b.memo IS NOT NULL THEN
      IF (r.case_insensitive AND b.memo ~* r.pattern)
         OR (NOT r.case_insensitive AND b.memo ~ r.pattern) THEN
        plano_contas_id := r.plano_contas_id;
        centro_custo_id := r.centro_custo_id;
        membro_id := r.membro_id;
        confianca := 0.85;
        origem := 'regra';
        explicacao := format('Regra: %s · pattern em memo', r.nome);
        RETURN NEXT;
        RETURN;
      END IF;
    ELSIF r.tipo_regra = 'regex_nome' AND b.nome_contraparte IS NOT NULL THEN
      IF (r.case_insensitive AND b.nome_contraparte ~* r.pattern)
         OR (NOT r.case_insensitive AND b.nome_contraparte ~ r.pattern) THEN
        plano_contas_id := r.plano_contas_id;
        centro_custo_id := r.centro_custo_id;
        membro_id := r.membro_id;
        confianca := 0.85;
        origem := 'regra';
        explicacao := format('Regra: %s · pattern em nome', r.nome);
        RETURN NEXT;
        RETURN;
      END IF;
    END IF;
  END LOOP;

  
  
  plano_contas_id := NULL;
  centro_custo_id := NULL;
  membro_id := NULL;
  confianca := 0.0;
  origem := 'sem_sugestao';
  explicacao := 'Nenhuma regra ou memoria bateu';
  RETURN NEXT;
END;
$function$;
























CREATE OR REPLACE VIEW public.vw_camp_arrecadacao AS
WITH conf AS (
  SELECT c.id AS campanha_id,
         COALESCE(SUM(ROUND(ABS(t.valor) * 100))::BIGINT, 0) AS centavos,
         COUNT(*)::INT AS lancamentos,
         COUNT(DISTINCT t.membro_id)::INT AS doadores
    FROM camp_campanhas c
    JOIN fin_transacoes t
      ON t.tipo = 'receita'
     AND (
           
           (t.identificador_centavo = c.digito
            AND NOT EXISTS (SELECT 1 FROM camp_vinculos v
                             WHERE v.campanha_id = c.id AND v.transacao_id = t.id
                               AND v.incluir = false))
           
           OR EXISTS (SELECT 1 FROM camp_vinculos v
                       WHERE v.campanha_id = c.id AND v.transacao_id = t.id
                         AND v.incluir = true)
         )
     AND (c.data_inicio IS NULL OR t.data_competencia >= c.data_inicio)
     AND (c.data_fim   IS NULL OR t.data_competencia <= c.data_fim)
   WHERE c.deleted_at IS NULL
   GROUP BY c.id
),
concil AS (
  SELECT c.id AS campanha_id,
         COALESCE(SUM(ROUND(ABS(b.valor) * 100))::BIGINT, 0) AS centavos,
         COUNT(*)::INT AS lancamentos
    FROM camp_campanhas c
    JOIN fin_lancamentos_brutos b
      ON (b.tipo_trn = 'CREDIT' OR (b.tipo_trn IS DISTINCT FROM 'DEBIT' AND b.valor > 0))
     AND lpad((ROUND(ABS(b.valor) * 100) % 100)::TEXT, 2, '0') = c.digito
     
     
     AND NOT EXISTS (SELECT 1 FROM fin_transacoes t WHERE t.lancamento_bruto_id = b.id)
     AND NOT EXISTS (SELECT 1 FROM camp_vinculos v
                      WHERE v.campanha_id = c.id AND v.lancamento_bruto_id = b.id
                        AND v.incluir = false)
     AND (c.data_inicio IS NULL OR b.data_lancamento >= c.data_inicio)
     AND (c.data_fim   IS NULL OR b.data_lancamento <= c.data_fim)
   WHERE c.deleted_at IS NULL AND c.digito IS NOT NULL
   GROUP BY c.id
),
onl AS (
  SELECT c.id AS campanha_id,
         COALESCE(SUM(COALESCE(p.valor_pago_centavos, p.valor_centavos))::BIGINT, 0) AS centavos,
         COUNT(*)::INT AS lancamentos,
         COUNT(DISTINCT p.membro_id)::INT AS doadores
    FROM camp_campanhas c
    JOIN pag_cobrancas p
      ON p.origem_tipo = 'generosidade'
     AND p.status = 'pago'
     AND p.deleted_at IS NULL
     AND p.metadata ->> 'campanha_id' = c.id::TEXT
   WHERE c.deleted_at IS NULL
   GROUP BY c.id
)
SELECT c.id AS campanha_id,
       c.slug, c.nome, c.digito, c.status, c.publica, c.mostrar_valor,
       c.meta_centavos, c.data_inicio, c.data_lancamento, c.data_fim,
       COALESCE(conf.centavos, 0)   AS caixa_confirmado_centavos,
       COALESCE(concil.centavos, 0) AS caixa_conciliando_centavos,
       COALESCE(onl.centavos, 0)    AS online_pago_centavos,
       COALESCE(conf.centavos, 0) + COALESCE(concil.centavos, 0)
         + COALESCE(onl.centavos, 0) AS total_centavos,
       COALESCE(conf.lancamentos, 0) + COALESCE(concil.lancamentos, 0)
         + COALESCE(onl.lancamentos, 0) AS total_lancamentos,
       COALESCE(concil.lancamentos, 0) AS lancamentos_em_conciliacao,
       
       
       
       GREATEST(COALESCE(conf.doadores, 0), COALESCE(onl.doadores, 0)) AS doadores_aprox
  FROM camp_campanhas c
  LEFT JOIN conf   ON conf.campanha_id = c.id
  LEFT JOIN concil ON concil.campanha_id = c.id
  LEFT JOIN onl    ON onl.campanha_id = c.id
 WHERE c.deleted_at IS NULL;














DO $$
DECLARE v_lista TEXT[];
BEGIN
  SELECT array_agg(DISTINCT t ORDER BY t) INTO v_lista
    FROM (
      SELECT unnest(public.app_soft_deletable_tables()) AS t
      UNION SELECT 'camp_campanhas'
      UNION SELECT 'camp_marcos'
      UNION SELECT 'camp_disparos'
    ) x;

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.app_soft_deletable_tables() '
    'RETURNS TEXT[] LANGUAGE sql IMMUTABLE AS $f$ SELECT %L::TEXT[] $f$',
    v_lista
  );
END $$;








ALTER TABLE public.camp_campanhas       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.camp_marcos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.camp_disparos        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.camp_disparo_envios  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.camp_agradecimentos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.camp_vinculos        ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['camp_campanhas','camp_marcos','camp_disparos',
                           'camp_disparo_envios','camp_agradecimentos','camp_vinculos']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON public.%I', t, t);
    EXECUTE format($p$CREATE POLICY %I_select ON public.%I FOR SELECT TO authenticated
                      USING (public.current_user_module_level('campanhas') >= 1)$p$, t, t);

    EXECUTE format('DROP POLICY IF EXISTS %I_insert ON public.%I', t, t);
    EXECUTE format($p$CREATE POLICY %I_insert ON public.%I FOR INSERT TO authenticated
                      WITH CHECK (public.current_user_module_level('campanhas') >= 3)$p$, t, t);

    EXECUTE format('DROP POLICY IF EXISTS %I_update ON public.%I', t, t);
    EXECUTE format($p$CREATE POLICY %I_update ON public.%I FOR UPDATE TO authenticated
                      USING (public.current_user_module_level('campanhas') >= 3)
                      WITH CHECK (public.current_user_module_level('campanhas') >= 3)$p$, t, t);

    EXECUTE format('DROP POLICY IF EXISTS %I_delete ON public.%I', t, t);
    EXECUTE format($p$CREATE POLICY %I_delete ON public.%I FOR DELETE TO authenticated
                      USING (public.is_super_admin())$p$, t, t);

    EXECUTE format('DROP POLICY IF EXISTS %I_service ON public.%I', t, t);
    EXECUTE format($p$CREATE POLICY %I_service ON public.%I FOR ALL TO service_role
                      USING (true) WITH CHECK (true)$p$, t, t);
  END LOOP;
END $$;










INSERT INTO public.modulos (slug, nome, rota, categoria, ordem, descricao, ativo)
SELECT 'campanhas', 'Campanhas', '/campanhas', 'operacional', 265,
       'Campanhas de arrecadação · meta, dígito verificador, cronograma e disparos', true
WHERE NOT EXISTS (SELECT 1 FROM public.modulos WHERE slug = 'campanhas');

DO $$
DECLARE base_id INT;
BEGIN
  SELECT id INTO base_id FROM public.modulos WHERE slug = 'financeiro';
  IF base_id IS NULL THEN RETURN; END IF;

  INSERT INTO public.cargo_modulo_permissao
    (cargo_id, modulo_id, nivel, pode_exportar, pode_aprovar, escopo_proprio)
  SELECT cmp.cargo_id, novo.id, cmp.nivel, cmp.pode_exportar, cmp.pode_aprovar, cmp.escopo_proprio
    FROM public.cargo_modulo_permissao cmp
    CROSS JOIN public.modulos novo
   WHERE cmp.modulo_id = base_id AND novo.slug = 'campanhas'
  ON CONFLICT (cargo_id, modulo_id) DO NOTHING;
END $$;



















INSERT INTO public.camp_campanhas (
  slug, nome, descricao_curta, descricao,
  meta_centavos, meta_minima_centavos, digito,
  data_inicio, data_lancamento, data_fim,
  status, publica, mostrar_valor, aceita_online, observacao
)
SELECT
  'reforma-kids',
  'Reforma do Espaço Kids',
  'transformar o espaço onde as nossas crianças são cuidadas e ensinadas',
  'Reforma completa do Espaço Kids: obra civil, mobiliário, decoração, papel de '
    || 'parede e ambientação. O escopo foi tratado como valor GLOBAL — não só a '
    || 'construção — para entregar o espaço funcional e acolhedor. Execução faseada '
    || 'para o Kids não parar por completo, com o telhado antes do piso.',
  50000000, 40000000, '07',
  '2026-09-01', '2026-09-06', '2026-10-31',
  'rascunho', false, true, true,
  'Dígito 07 conferido livre em 26/08/2026. Compromisso de ~R$ 170 mil da campanha '
    || 'de obras de 2025 segue pendente e concorre por recurso — considerar na '
    || 'priorização. Censo deslocado para o final do culto (QR) para não competir.'
WHERE NOT EXISTS (SELECT 1 FROM public.camp_campanhas WHERE slug = 'reforma-kids');




INSERT INTO public.camp_marcos (campanha_id, titulo, descricao, tipo, data_prevista, ordem)
SELECT c.id, m.titulo, m.descricao, m.tipo, m.data_prevista, m.ordem
  FROM public.camp_campanhas c
  CROSS JOIN (VALUES
    ('Finalizar as imagens do projeto', 'Renders do "hoje e depois" para o lançamento.', 'comunicacao', DATE '2026-08-30', 10),
    ('Entregar o vídeo principal', 'Peça de 1min30 a 3min, emocional e objetiva, com a necessidade, a visão e o chamado.', 'comunicacao', DATE '2026-09-04', 20),
    ('Consolidar os orçamentos', 'Obra + mobiliário + decoração + elementos decorativos, fechando o valor global.', 'financeiro', DATE '2026-09-05', 30),
    ('Validar o faseamento com o empreiteiro', 'Cronograma de interdição das salas para o Kids seguir parcialmente operacional.', 'obra', DATE '2026-09-05', 40),
    ('Lançamento oficial no culto', 'Vídeo no culto, crianças na recepção, barrinha de progresso nas telas.', 'marco', DATE '2026-09-06', 50),
    ('Reforma do telhado', 'Prioridade técnica: o telhado vem ANTES de qualquer obra de piso/chão, para evitar retrabalho.', 'obra', DATE '2026-09-30', 60),
    ('Prestação de contas semanal', 'E-mail de segunda com resumo, link do vídeo e CTA; barrinha atualizada.', 'comunicacao', NULL, 70),
    ('Alinhar Censo e voluntariado', 'Integrar os cronogramas para não competir por atenção, recursos e energia da comunidade.', 'marco', DATE '2026-09-01', 80)
  ) AS m(titulo, descricao, tipo, data_prevista, ordem)
 WHERE c.slug = 'reforma-kids'
   AND NOT EXISTS (SELECT 1 FROM public.camp_marcos x WHERE x.campanha_id = c.id);

COMMIT;
