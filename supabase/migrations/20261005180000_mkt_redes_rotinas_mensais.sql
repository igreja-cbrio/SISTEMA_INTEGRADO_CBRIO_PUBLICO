































BEGIN;


ALTER TABLE public.marketing_compromissos_recorrentes
  ADD COLUMN IF NOT EXISTS frequencia text NOT NULL DEFAULT 'semanal';
ALTER TABLE public.marketing_compromissos_recorrentes
  ADD COLUMN IF NOT EXISTS semana_do_mes smallint;
ALTER TABLE public.marketing_compromissos_recorrentes
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'comum';
ALTER TABLE public.marketing_compromissos_recorrentes
  ADD COLUMN IF NOT EXISTS responsavel_execucao_membro_id uuid;



DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_mkt_recorrentes_frequencia'
                   AND conrelid = 'public.marketing_compromissos_recorrentes'::regclass) THEN
    ALTER TABLE public.marketing_compromissos_recorrentes ADD CONSTRAINT chk_mkt_recorrentes_frequencia
      CHECK (frequencia IN ('semanal', 'mensal'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_mkt_recorrentes_semana_do_mes'
                   AND conrelid = 'public.marketing_compromissos_recorrentes'::regclass) THEN
    ALTER TABLE public.marketing_compromissos_recorrentes ADD CONSTRAINT chk_mkt_recorrentes_semana_do_mes
      CHECK ((frequencia = 'semanal' AND semana_do_mes IS NULL)
          OR (frequencia = 'mensal' AND semana_do_mes IS NOT NULL
              AND semana_do_mes IN (1, 2, 3, 4, 5, -1, -2, -3)));
    
    
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_mkt_recorrentes_tipo'
                   AND conrelid = 'public.marketing_compromissos_recorrentes'::regclass) THEN
    ALTER TABLE public.marketing_compromissos_recorrentes ADD CONSTRAINT chk_mkt_recorrentes_tipo
      CHECK (tipo IN ('comum', 'planejamento_postagens'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_mkt_recorrentes_responsavel_execucao'
                   AND conrelid = 'public.marketing_compromissos_recorrentes'::regclass) THEN
    ALTER TABLE public.marketing_compromissos_recorrentes ADD CONSTRAINT fk_mkt_recorrentes_responsavel_execucao
      FOREIGN KEY (responsavel_execucao_membro_id) REFERENCES public.marketing_membros(id) ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.marketing_compromissos_recorrentes.frequencia IS
  'semanal (toda semana · o de sempre) ou mensal (só na semana do mês de semana_do_mes · 05/10/2026).';
COMMENT ON COLUMN public.marketing_compromissos_recorrentes.semana_do_mes IS
  'Na rotina mensal: 1–5 = a Nª semana do mês · -1 última · -2 penúltima · -3 antepenúltima. A semana (dom→sáb) é do mês em que cai a QUARTA-FEIRA.';
COMMENT ON COLUMN public.marketing_compromissos_recorrentes.tipo IS
  'comum · planejamento_postagens (o card abre o planejamento do mês seguinte e fica feito ao salvá-lo).';
COMMENT ON COLUMN public.marketing_compromissos_recorrentes.responsavel_execucao_membro_id IS
  'No planejamento de postagens: quem produz e posta (o padrão do editor · os cards de Produção nascem para essa pessoa).';


CREATE TABLE IF NOT EXISTS public.marketing_redes_planos (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mes                    date NOT NULL,          
  compromisso_id         uuid REFERENCES public.marketing_compromissos_recorrentes(id) ON DELETE SET NULL,
  responsavel_membro_id  uuid REFERENCES public.marketing_membros(id) ON DELETE SET NULL,
  gerado_em              timestamptz,
  created_by             uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by             uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  deleted_at             timestamptz
);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_mkt_redes_planos_mes'
                   AND conrelid = 'public.marketing_redes_planos'::regclass) THEN
    ALTER TABLE public.marketing_redes_planos ADD CONSTRAINT chk_mkt_redes_planos_mes
      CHECK (extract(day FROM mes) = 1);
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS uq_mkt_redes_planos_mes
  ON public.marketing_redes_planos (mes) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.marketing_redes_plano_posts (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plano_id               uuid NOT NULL REFERENCES public.marketing_redes_planos(id) ON DELETE CASCADE,
  semana                 smallint NOT NULL,
  ordem                  int NOT NULL DEFAULT 1,
  dia_provavel           date NOT NULL,
  nome                   text NOT NULL,
  ref_url                text,
  ref_arquivos           jsonb NOT NULL DEFAULT '[]'::jsonb,   
  descricao              text,
  responsavel_membro_id  uuid REFERENCES public.marketing_membros(id) ON DELETE SET NULL,
  subtarefa_producao_id  uuid REFERENCES public.marketing_card_checklist(id) ON DELETE SET NULL,
  subtarefa_postagem_id  uuid REFERENCES public.marketing_card_checklist(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_mkt_redes_posts_campos'
                   AND conrelid = 'public.marketing_redes_plano_posts'::regclass) THEN
    ALTER TABLE public.marketing_redes_plano_posts ADD CONSTRAINT chk_mkt_redes_posts_campos
      CHECK (semana BETWEEN 1 AND 6
         AND char_length(btrim(nome)) BETWEEN 1 AND 200
         AND (descricao IS NULL OR char_length(descricao) <= 2000)
         AND (ref_url IS NULL OR char_length(ref_url) <= 1000)
         AND jsonb_typeof(ref_arquivos) = 'array');
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_mkt_redes_posts_plano ON public.marketing_redes_plano_posts (plano_id, semana, ordem);
CREATE INDEX IF NOT EXISTS idx_mkt_redes_posts_sub_prod ON public.marketing_redes_plano_posts (subtarefa_producao_id);
CREATE INDEX IF NOT EXISTS idx_mkt_redes_posts_sub_post ON public.marketing_redes_plano_posts (subtarefa_postagem_id);


CREATE TABLE IF NOT EXISTS public.marketing_redes_plano_cards (
  plano_id  uuid NOT NULL REFERENCES public.marketing_redes_planos(id) ON DELETE CASCADE,
  semana    smallint NOT NULL,
  etapa     text NOT NULL,
  card_id   uuid NOT NULL REFERENCES public.marketing_kanban_cards(id) ON DELETE CASCADE,
  PRIMARY KEY (plano_id, semana, etapa)
);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_mkt_redes_plano_cards_etapa'
                   AND conrelid = 'public.marketing_redes_plano_cards'::regclass) THEN
    ALTER TABLE public.marketing_redes_plano_cards ADD CONSTRAINT chk_mkt_redes_plano_cards_etapa
      CHECK (etapa IN ('producao', 'postagem'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_mkt_redes_plano_cards_card ON public.marketing_redes_plano_cards (card_id);

ALTER TABLE public.marketing_redes_planos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_redes_plano_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_redes_plano_cards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny_all_frontend_marketing_redes_planos" ON public.marketing_redes_planos;
CREATE POLICY "deny_all_frontend_marketing_redes_planos" ON public.marketing_redes_planos
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "deny_all_frontend_marketing_redes_plano_posts" ON public.marketing_redes_plano_posts;
CREATE POLICY "deny_all_frontend_marketing_redes_plano_posts" ON public.marketing_redes_plano_posts
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "deny_all_frontend_marketing_redes_plano_cards" ON public.marketing_redes_plano_cards;
CREATE POLICY "deny_all_frontend_marketing_redes_plano_cards" ON public.marketing_redes_plano_cards
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

COMMENT ON TABLE public.marketing_redes_planos IS
  'Planejamento de postagens de um mês (05/10/2026): feito na penúltima semana do mês anterior; ao salvar, gera em Redes · Produção os cards de produzir e postar de cada semana. Só o backend lê e grava.';
COMMENT ON TABLE public.marketing_redes_plano_posts IS
  'As postagens do planejamento: semana do mês, dia provável, nome, referência (link ou arquivos do SharePoint), descrição e responsável · com as subtarefas que geraram.';
COMMENT ON TABLE public.marketing_redes_plano_cards IS
  'Os cards de Redes · Produção que o planejamento gerou (um por semana e etapa: producao | postagem).';


COMMIT;
