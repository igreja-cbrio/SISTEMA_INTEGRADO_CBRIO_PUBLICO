
























ALTER TABLE public.marketing_compromissos_recorrentes
  ADD COLUMN IF NOT EXISTS area text NOT NULL DEFAULT 'institucional';



DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'chk_marketing_recorrentes_area'
       AND conrelid = 'public.marketing_compromissos_recorrentes'::regclass
  ) THEN
    ALTER TABLE public.marketing_compromissos_recorrentes
      ADD CONSTRAINT chk_marketing_recorrentes_area
      CHECK (area IN ('institucional', 'redes'));
  END IF;
END $$;

COMMENT ON COLUMN public.marketing_compromissos_recorrentes.area IS
  'Área do Marketing dona do compromisso (01/10/2026): institucional = quadrado "Institucionais" das Demandas · redes = quadrado "Redes". Lista espelhada em backend/utils/marketingLinha.js (AREAS_ROTINA).';




UPDATE public.marketing_compromissos_recorrentes
   SET area = 'redes'
 WHERE deleted_at IS NULL
   AND area = 'institucional'
   AND descricao ILIKE '%redes sociais%';






