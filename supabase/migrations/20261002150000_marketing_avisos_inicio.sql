




















CREATE TABLE IF NOT EXISTS public.marketing_avisos_inicio (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  texto       text NOT NULL,
  inicio      date NOT NULL,
  fim         date NOT NULL,
  created_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);



DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'chk_marketing_avisos_inicio_texto'
       AND conrelid = 'public.marketing_avisos_inicio'::regclass
  ) THEN
    ALTER TABLE public.marketing_avisos_inicio
      ADD CONSTRAINT chk_marketing_avisos_inicio_texto
      CHECK (char_length(btrim(texto)) BETWEEN 1 AND 600);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'chk_marketing_avisos_inicio_periodo'
       AND conrelid = 'public.marketing_avisos_inicio'::regclass
  ) THEN
    ALTER TABLE public.marketing_avisos_inicio
      ADD CONSTRAINT chk_marketing_avisos_inicio_periodo
      CHECK (fim >= inicio);
  END IF;
END $$;


CREATE INDEX IF NOT EXISTS idx_marketing_avisos_inicio_fim
  ON public.marketing_avisos_inicio (fim)
  WHERE deleted_at IS NULL;

ALTER TABLE public.marketing_avisos_inicio ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deny_all_frontend_marketing_avisos_inicio" ON public.marketing_avisos_inicio;
CREATE POLICY "deny_all_frontend_marketing_avisos_inicio" ON public.marketing_avisos_inicio
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE public.marketing_avisos_inicio IS
  'Avisos que o líder do Marketing publica no Início do módulo (/marketing), com período: aparecem de `inicio` a `fim` (inclusive, dia de São Paulo). Recado interno da equipe — não é o mural do app (comunicados). Só o backend lê e grava (routes/marketingAvisosInicio.js).';







