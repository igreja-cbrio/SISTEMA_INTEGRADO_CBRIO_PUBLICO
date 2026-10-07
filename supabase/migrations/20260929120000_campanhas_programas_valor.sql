



















CREATE TABLE IF NOT EXISTS public.camp_programas (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome         text NOT NULL,
  valor        text NOT NULL,
  template     text NOT NULL DEFAULT 'legado',
  descricao    text,
  recorrente   boolean NOT NULL DEFAULT true,
  created_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz,
  CONSTRAINT camp_programas_valor_chk CHECK (valor IN ('generosidade','voluntarios','grupos','decisoes','investir','seguir')),
  CONSTRAINT camp_programas_template_chk CHECK (template ~ '^[a-z][a-z0-9_]{1,39}$'),
  CONSTRAINT camp_programas_nome_chk CHECK (length(btrim(nome)) BETWEEN 2 AND 120)
);
COMMENT ON TABLE public.camp_programas IS
  'Campanha como PROGRAMA (objetivo + valor da mandala + template). Cada camp_campanhas é uma EDIÇÃO dele (programa_id). Mesmo objetivo e mesmos indicadores = mesma campanha, mesmo com nomes diferentes por ano (Marcos · 29/09/2026).';

CREATE INDEX IF NOT EXISTS idx_camp_programas_valor ON public.camp_programas (valor) WHERE deleted_at IS NULL;

ALTER TABLE public.camp_programas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS camp_programas_select ON public.camp_programas;
CREATE POLICY camp_programas_select ON public.camp_programas
  FOR SELECT TO authenticated
  USING (public.current_user_module_level('campanhas') >= 1);
DROP POLICY IF EXISTS camp_programas_service ON public.camp_programas;
CREATE POLICY camp_programas_service ON public.camp_programas
  FOR ALL TO service_role USING (true) WITH CHECK (true);
GRANT SELECT ON public.camp_programas TO authenticated;
GRANT ALL ON public.camp_programas TO service_role;


ALTER TABLE public.camp_campanhas ADD COLUMN IF NOT EXISTS programa_id uuid;
ALTER TABLE public.camp_campanhas ADD COLUMN IF NOT EXISTS valor text;


DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'camp_campanhas_programa_fk') THEN
    ALTER TABLE public.camp_campanhas
      ADD CONSTRAINT camp_campanhas_programa_fk FOREIGN KEY (programa_id)
      REFERENCES public.camp_programas(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'camp_campanhas_valor_chk') THEN
    ALTER TABLE public.camp_campanhas
      ADD CONSTRAINT camp_campanhas_valor_chk
      CHECK (valor IS NULL OR valor IN ('generosidade','voluntarios','grupos','decisoes','investir','seguir')) NOT VALID;
    ALTER TABLE public.camp_campanhas VALIDATE CONSTRAINT camp_campanhas_valor_chk;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_camp_campanhas_programa ON public.camp_campanhas (programa_id) WHERE deleted_at IS NULL;
COMMENT ON COLUMN public.camp_campanhas.programa_id IS 'A campanha (programa) da qual esta linha é uma EDIÇÃO. Edições do mesmo programa se comparam na página por valor.';
COMMENT ON COLUMN public.camp_campanhas.valor IS 'Valor da mandala que esta edição incentiva (espelha o programa; a régua do template vale por cima).';



INSERT INTO public.camp_programas (id, nome, valor, template, descricao, recorrente, created_by, created_at)
SELECT c.id, c.nome,
       CASE WHEN c.template IN ('voluntariado') THEN 'voluntarios'
            WHEN c.template IN ('grupos') THEN 'grupos'
            WHEN c.template IN ('seguir') THEN 'seguir'
            WHEN c.template IN ('investir') THEN 'investir'
            ELSE 'generosidade' END,
       COALESCE(c.template, 'legado'), c.descricao_curta,
       (COALESCE(c.template, 'legado') <> 'legado'),
       c.created_by, c.created_at
  FROM public.camp_campanhas c
 WHERE c.deleted_at IS NULL AND c.programa_id IS NULL
ON CONFLICT (id) DO NOTHING;

UPDATE public.camp_campanhas c
   SET programa_id = p.id, valor = COALESCE(c.valor, p.valor)
  FROM public.camp_programas p
 WHERE c.programa_id IS NULL AND p.id = c.id;


ALTER TABLE public.mem_grupo_pedidos ADD COLUMN IF NOT EXISTS qr_slug text;
CREATE INDEX IF NOT EXISTS idx_mem_grupo_pedidos_qr ON public.mem_grupo_pedidos (qr_slug) WHERE qr_slug IS NOT NULL;
COMMENT ON COLUMN public.mem_grupo_pedidos.qr_slug IS 'Slug do link curto (?qr=) pelo qual o pedido chegou — ativação de campanha. NULL = link direto.';

ALTER TABLE public.batismo_inscricoes ADD COLUMN IF NOT EXISTS qr_slug text;
CREATE INDEX IF NOT EXISTS idx_batismo_inscricoes_qr ON public.batismo_inscricoes (qr_slug) WHERE qr_slug IS NOT NULL;
COMMENT ON COLUMN public.batismo_inscricoes.qr_slug IS 'Slug do link curto (?qr=) pelo qual a inscrição chegou — ativação de campanha. NULL = link direto.';


DO $$
DECLARE v_sem_programa int; v_programas int;
BEGIN
  SELECT count(*) INTO v_sem_programa FROM public.camp_campanhas WHERE deleted_at IS NULL AND programa_id IS NULL;
  SELECT count(*) INTO v_programas FROM public.camp_programas WHERE deleted_at IS NULL;
  IF v_sem_programa > 0 THEN
    RAISE EXCEPTION 'camp_campanhas sem programa depois do backfill: %', v_sem_programa;
  END IF;
  RAISE NOTICE 'campanhas_programas_valor: % programas · 0 edições órfãs', v_programas;
END $$;
