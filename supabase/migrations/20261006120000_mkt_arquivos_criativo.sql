

































ALTER TABLE public.marketing_entrega_arquivos ADD COLUMN IF NOT EXISTS categoria text;
ALTER TABLE public.marketing_entrega_arquivos ADD COLUMN IF NOT EXISTS plano_id uuid;



DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_mkt_entrega_arquivos_plano'
                   AND conrelid = 'public.marketing_entrega_arquivos'::regclass) THEN
    ALTER TABLE public.marketing_entrega_arquivos ADD CONSTRAINT fk_mkt_entrega_arquivos_plano
      FOREIGN KEY (plano_id) REFERENCES public.marketing_redes_planos(id) ON DELETE SET NULL;
  END IF;
END $$;


ALTER TABLE public.marketing_entrega_arquivos DROP CONSTRAINT IF EXISTS chk_mkt_entrega_arquivos_origem;
ALTER TABLE public.marketing_entrega_arquivos ADD CONSTRAINT chk_mkt_entrega_arquivos_origem
  CHECK (origem IN ('ciclo', 'rotina', 'tarefa', 'planejamento'));



ALTER TABLE public.marketing_entrega_arquivos DROP CONSTRAINT IF EXISTS chk_mkt_entrega_arquivos_alvo;
ALTER TABLE public.marketing_entrega_arquivos ADD CONSTRAINT chk_mkt_entrega_arquivos_alvo
  CHECK (
    (origem = 'ciclo'        AND compromisso_id IS NULL AND semana_inicio IS NULL AND plano_id IS NULL)
 OR (origem = 'rotina'       AND checklist_item_id IS NULL AND card_id IS NULL AND semana_inicio IS NOT NULL AND plano_id IS NULL)
 OR (origem = 'tarefa'       AND compromisso_id IS NULL AND semana_inicio IS NULL AND plano_id IS NULL)
 OR (origem = 'planejamento' AND checklist_item_id IS NULL AND card_id IS NULL AND compromisso_id IS NULL AND semana_inicio IS NULL)
  );


ALTER TABLE public.marketing_entrega_arquivos DROP CONSTRAINT IF EXISTS chk_mkt_entrega_arquivos_categoria;
ALTER TABLE public.marketing_entrega_arquivos ADD CONSTRAINT chk_mkt_entrega_arquivos_categoria
  CHECK (
    (categoria IS NULL AND origem IN ('ciclo', 'rotina', 'planejamento'))
 OR (origem = 'ciclo'        AND categoria IS NOT NULL AND categoria = 'ciclo')
 OR (origem = 'rotina'       AND categoria IS NOT NULL AND categoria = 'rotina')
 OR (origem = 'planejamento' AND categoria IS NOT NULL AND categoria = 'redes')
 OR (origem = 'tarefa'       AND categoria IS NOT NULL AND categoria IN ('requisicoes', 'redes'))
  );


CREATE INDEX IF NOT EXISTS idx_mkt_entrega_arquivos_card
  ON public.marketing_entrega_arquivos (card_id)
  WHERE deleted_at IS NULL;

COMMENT ON TABLE public.marketing_entrega_arquivos IS
  'Arquivos das Demandas do Marketing no SharePoint (05/10/2026 · site Criativo desde 06/10): entrega de ciclo e de rotina com exige_arquivo (enviar dá o check; tirar o último reabre), anexo de subtarefa de Requisições e de Redes · Produção (origem tarefa · não marca nada) e referência do planejamento de postagens. Árvore Demandas/<ano>/… · regra em backend/utils/marketingEntregaArquivo.js. Só o backend lê e grava.';
COMMENT ON COLUMN public.marketing_entrega_arquivos.categoria IS
  'Pasta de 1º nível da árvore: ciclo | rotina | requisicoes | redes. Obrigatória na origem tarefa; nas outras, NULL = a da origem (06/10/2026).';
COMMENT ON COLUMN public.marketing_entrega_arquivos.plano_id IS
  'O planejamento de postagens da referência (origem planejamento · 06/10/2026).';







