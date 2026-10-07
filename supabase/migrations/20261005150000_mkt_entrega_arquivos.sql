



























CREATE TABLE IF NOT EXISTS public.marketing_entrega_arquivos (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origem             text NOT NULL,
  
  
  checklist_item_id  uuid REFERENCES public.marketing_card_checklist(id) ON DELETE SET NULL,
  card_id            uuid REFERENCES public.marketing_kanban_cards(id) ON DELETE SET NULL,
  event_id           uuid,
  event_phase_id     uuid,
  
  
  compromisso_id     uuid REFERENCES public.marketing_compromissos_recorrentes(id) ON DELETE SET NULL,
  membro_id          uuid REFERENCES public.marketing_membros(id) ON DELETE SET NULL,
  semana_inicio      date,
  
  nome_arquivo       text NOT NULL,
  tipo_mime          text,
  tamanho_bytes      bigint,
  drive_id           text NOT NULL,
  sharepoint_item_id text NOT NULL,
  web_url            text NOT NULL,
  pasta              text NOT NULL,
  enviado_por        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  enviado_em         timestamptz NOT NULL DEFAULT now(),
  removido_por       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  deleted_at         timestamptz
);



DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_mkt_entrega_arquivos_origem'
                   AND conrelid = 'public.marketing_entrega_arquivos'::regclass) THEN
    ALTER TABLE public.marketing_entrega_arquivos ADD CONSTRAINT chk_mkt_entrega_arquivos_origem
      CHECK (origem IN ('ciclo', 'rotina'));
  END IF;
  
  
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_mkt_entrega_arquivos_alvo'
                   AND conrelid = 'public.marketing_entrega_arquivos'::regclass) THEN
    ALTER TABLE public.marketing_entrega_arquivos ADD CONSTRAINT chk_mkt_entrega_arquivos_alvo
      CHECK (
        (origem = 'ciclo'  AND compromisso_id IS NULL AND semana_inicio IS NULL)
     OR (origem = 'rotina' AND checklist_item_id IS NULL AND card_id IS NULL AND semana_inicio IS NOT NULL)
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_mkt_entrega_arquivos_tamanho'
                   AND conrelid = 'public.marketing_entrega_arquivos'::regclass) THEN
    ALTER TABLE public.marketing_entrega_arquivos ADD CONSTRAINT chk_mkt_entrega_arquivos_tamanho
      CHECK (tamanho_bytes IS NULL OR tamanho_bytes >= 0);
  END IF;
END $$;



CREATE UNIQUE INDEX IF NOT EXISTS uq_mkt_entrega_arquivos_item_sp
  ON public.marketing_entrega_arquivos (drive_id, sharepoint_item_id)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_mkt_entrega_arquivos_item
  ON public.marketing_entrega_arquivos (checklist_item_id)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_mkt_entrega_arquivos_rotina
  ON public.marketing_entrega_arquivos (compromisso_id, membro_id, semana_inicio)
  WHERE deleted_at IS NULL;

ALTER TABLE public.marketing_entrega_arquivos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny_all_frontend_marketing_entrega_arquivos" ON public.marketing_entrega_arquivos;
CREATE POLICY "deny_all_frontend_marketing_entrega_arquivos" ON public.marketing_entrega_arquivos
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE public.marketing_entrega_arquivos IS
  'Arquivos entregues pelas Demandas do Marketing (05/10/2026): subtarefa de ciclo (pasta do evento no SharePoint · Planejamento) ou compromisso de rotina com exige_arquivo (Criativo · Marketing/Rotina). Enviar o arquivo dá o check; tirar o último reabre. Só o backend lê e grava.';


ALTER TABLE public.marketing_compromissos_recorrentes
  ADD COLUMN IF NOT EXISTS exige_arquivo boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.marketing_compromissos_recorrentes.exige_arquivo IS
  'O compromisso só fica feito na semana com um arquivo entregue (05/10/2026 · o líder liga em Configurar → Rotina).';








