















DO $$
DECLARE v_cat uuid;
BEGIN
  SELECT id INTO v_cat FROM public.event_categories WHERE lower(name) IN ('campanhas', 'campanha') ORDER BY active DESC LIMIT 1;
  IF v_cat IS NULL THEN
    INSERT INTO public.event_categories (id, name, color, active, sort_order)
    VALUES ('a0000000-0000-0000-0000-0000000000c1', 'Campanhas', '#00B39D', true, 50)
    RETURNING id INTO v_cat;
  ELSE
    UPDATE public.event_categories SET active = true WHERE id = v_cat AND active IS DISTINCT FROM true;
  END IF;
  INSERT INTO public.marketing_categoria_cultos (category_id, culto) VALUES (v_cat, 'cbrio') ON CONFLICT DO NOTHING;
  RAISE NOTICE 'categoria Campanhas = %', v_cat;
END $$;

ALTER TABLE public.camp_campanhas ADD COLUMN IF NOT EXISTS evento_id uuid;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'camp_campanhas_evento_fk') THEN
    ALTER TABLE public.camp_campanhas
      ADD CONSTRAINT camp_campanhas_evento_fk FOREIGN KEY (evento_id)
      REFERENCES public.events(id) ON DELETE SET NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_camp_campanhas_evento ON public.camp_campanhas (evento_id) WHERE evento_id IS NOT NULL;
COMMENT ON COLUMN public.camp_campanhas.evento_id IS 'Evento (categoria Campanhas) que carrega o ciclo criativo desta edição. NULL = ciclo não criado.';


DO $$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM public.marketing_categoria_cultos mc JOIN public.event_categories c ON c.id = mc.category_id WHERE lower(c.name) IN ('campanhas','campanha');
  IF v_n < 1 THEN RAISE EXCEPTION 'categoria Campanhas sem culto em marketing_categoria_cultos'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'camp_campanhas_evento_fk') THEN RAISE EXCEPTION 'FK camp_campanhas_evento_fk não existe'; END IF;
  RAISE NOTICE 'campanhas_ciclo_criativo ok';
END $$;
