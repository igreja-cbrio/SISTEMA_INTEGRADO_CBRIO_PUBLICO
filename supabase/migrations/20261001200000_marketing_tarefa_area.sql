





















ALTER TABLE public.marketing_kanban_cards
  ADD COLUMN IF NOT EXISTS area text;



DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'chk_marketing_cards_area'
       AND conrelid = 'public.marketing_kanban_cards'::regclass
  ) THEN
    ALTER TABLE public.marketing_kanban_cards
      ADD CONSTRAINT chk_marketing_cards_area
      CHECK (area IS NULL OR area IN ('redes'));
  END IF;
END $$;

COMMENT ON COLUMN public.marketing_kanban_cards.area IS
  'Área do Marketing dona da TAREFA (01/10/2026): NULL = sem área (evento → Calendário, o resto → Requisições) · redes = quadro Redes · Produção (só tarefa interna). Lista espelhada em backend/utils/marketingLinha.js (AREAS_TAREFA).';






