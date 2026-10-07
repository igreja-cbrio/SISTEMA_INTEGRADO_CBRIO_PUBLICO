





















ALTER TABLE public.camp_campanhas
  ADD COLUMN IF NOT EXISTS template          TEXT NOT NULL DEFAULT 'legado',
  ADD COLUMN IF NOT EXISTS edicao_rotulo     TEXT,
  ADD COLUMN IF NOT EXISTS meta_pessoas      INTEGER,
  ADD COLUMN IF NOT EXISTS evento_adesao_id  UUID REFERENCES public.insc_eventos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS mostrar_adesoes   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS faixas            JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS meses             INTEGER,
  ADD COLUMN IF NOT EXISTS alvo_definido_em  TIMESTAMPTZ;


ALTER TABLE public.camp_campanhas ALTER COLUMN meta_centavos DROP NOT NULL;

ALTER TABLE public.camp_campanhas DROP CONSTRAINT IF EXISTS camp_campanhas_template_chk;
ALTER TABLE public.camp_campanhas ADD CONSTRAINT camp_campanhas_template_chk
  CHECK (template ~ '^[a-z][a-z0-9_]{1,39}$');
ALTER TABLE public.camp_campanhas DROP CONSTRAINT IF EXISTS camp_campanhas_meta_pessoas_chk;
ALTER TABLE public.camp_campanhas ADD CONSTRAINT camp_campanhas_meta_pessoas_chk
  CHECK (meta_pessoas IS NULL OR meta_pessoas > 0);
ALTER TABLE public.camp_campanhas DROP CONSTRAINT IF EXISTS camp_campanhas_meses_chk;
ALTER TABLE public.camp_campanhas ADD CONSTRAINT camp_campanhas_meses_chk
  CHECK (meses IS NULL OR (meses BETWEEN 1 AND 60));
ALTER TABLE public.camp_campanhas DROP CONSTRAINT IF EXISTS camp_campanhas_faixas_chk;
ALTER TABLE public.camp_campanhas ADD CONSTRAINT camp_campanhas_faixas_chk
  CHECK (jsonb_typeof(faixas) = 'array');

ALTER TABLE public.camp_campanhas DROP CONSTRAINT IF EXISTS camp_campanhas_alvo_chk;
ALTER TABLE public.camp_campanhas ADD CONSTRAINT camp_campanhas_alvo_chk
  CHECK (meta_centavos IS NOT NULL OR meta_pessoas IS NOT NULL);

UPDATE public.camp_campanhas SET alvo_definido_em = created_at WHERE alvo_definido_em IS NULL;

CREATE INDEX IF NOT EXISTS camp_campanhas_template_idx
  ON public.camp_campanhas (template) WHERE deleted_at IS NULL;

COMMENT ON COLUMN public.camp_campanhas.template IS
  'Template do catálogo em código (backend/utils/campanhaTemplates.js): legado · generosidade · voluntariado …';
COMMENT ON COLUMN public.camp_campanhas.meta_pessoas IS
  'Alvo em PESSOAS (campanhas de voluntariado, grupos…). Campanha de dinheiro usa meta_centavos.';
COMMENT ON COLUMN public.camp_campanhas.evento_adesao_id IS
  'Evento de inscrição (insc_eventos, tipo adesao, contrato minimo) que recebe as adesões desta campanha.';
COMMENT ON COLUMN public.camp_campanhas.faixas IS
  'Faixas de compromisso mensal: [{"rotulo":"R$ 100 por mês","centavos":10000}, {"rotulo":"Outro valor","outro":true}].';
COMMENT ON COLUMN public.camp_campanhas.meses IS
  'Duração do compromisso mensal (projeção = compromisso × meses).';
COMMENT ON COLUMN public.camp_campanhas.edicao_rotulo IS
  'Edição da campanha recorrente ("2026", "2027-1") — a página por valor compara edições.';




CREATE TABLE IF NOT EXISTS public.camp_alvo_historico (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campanha_id            UUID NOT NULL REFERENCES public.camp_campanhas(id) ON DELETE CASCADE,
  meta_centavos_anterior BIGINT,
  meta_centavos_novo     BIGINT,
  meta_pessoas_anterior  INTEGER,
  meta_pessoas_novo      INTEGER,
  motivo                 TEXT NOT NULL,
  alterado_por           UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  alterado_em            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS camp_alvo_historico_campanha_idx
  ON public.camp_alvo_historico (campanha_id, alterado_em DESC);
ALTER TABLE public.camp_alvo_historico ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS camp_alvo_historico_sel ON public.camp_alvo_historico;
CREATE POLICY camp_alvo_historico_sel ON public.camp_alvo_historico FOR SELECT TO authenticated
  USING (public.current_user_module_level('campanhas') >= 1);
DROP POLICY IF EXISTS camp_alvo_historico_svc ON public.camp_alvo_historico;
CREATE POLICY camp_alvo_historico_svc ON public.camp_alvo_historico FOR ALL TO service_role
  USING (true) WITH CHECK (true);
GRANT SELECT ON public.camp_alvo_historico TO authenticated;
GRANT ALL ON public.camp_alvo_historico TO service_role;






ALTER TABLE public.link_curto
  ADD COLUMN IF NOT EXISTS campanha_id UUID REFERENCES public.camp_campanhas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS canal       TEXT,
  ADD COLUMN IF NOT EXISTS area_id     INTEGER REFERENCES public.areas(id) ON DELETE SET NULL;
ALTER TABLE public.link_curto DROP CONSTRAINT IF EXISTS link_curto_canal_chk;
ALTER TABLE public.link_curto ADD CONSTRAINT link_curto_canal_chk
  CHECK (canal IS NULL OR canal IN ('fisico', 'digital', 'culto'));
CREATE INDEX IF NOT EXISTS link_curto_campanha_idx
  ON public.link_curto (campanha_id) WHERE deleted_at IS NULL AND campanha_id IS NOT NULL;
COMMENT ON COLUMN public.link_curto.campanha_id IS
  'Ativação de campanha: este QR/link pertence à campanha e o destino leva ?qr=<slug> para etiquetar a inscrição.';




ALTER TABLE public.insc_eventos
  ADD COLUMN IF NOT EXISTS contrato    TEXT NOT NULL DEFAULT 'completo',
  ADD COLUMN IF NOT EXISTS campanha_id UUID REFERENCES public.camp_campanhas(id) ON DELETE SET NULL;
ALTER TABLE public.insc_eventos DROP CONSTRAINT IF EXISTS insc_eventos_contrato_chk;
ALTER TABLE public.insc_eventos ADD CONSTRAINT insc_eventos_contrato_chk
  CHECK (contrato IN ('completo', 'minimo'));
CREATE INDEX IF NOT EXISTS insc_eventos_campanha_idx
  ON public.insc_eventos (campanha_id) WHERE deleted_at IS NULL AND campanha_id IS NOT NULL;




DO $do$
DECLARE r RECORD; def TEXT;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.insc_eventos'::regclass AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%tipo%'
       AND pg_get_constraintdef(oid) ILIKE '%retiro%'
  LOOP
    EXECUTE format('ALTER TABLE public.insc_eventos DROP CONSTRAINT %I', r.conname);
  END LOOP;
  ALTER TABLE public.insc_eventos ADD CONSTRAINT insc_eventos_tipo_check
    CHECK (tipo IN ('evento', 'retiro', 'adesao'));
  SELECT pg_get_constraintdef(oid) INTO def FROM pg_constraint
   WHERE conrelid = 'public.insc_eventos'::regclass AND conname = 'insc_eventos_tipo_check';
  IF def !~ 'evento' OR def !~ 'retiro' OR def !~ 'adesao' THEN
    RAISE EXCEPTION 'insc_eventos_tipo_check não ficou com os 3 tipos: %', def;
  END IF;
END
$do$;
COMMENT ON COLUMN public.insc_eventos.contrato IS
  'completo = contrato de inscrição pleno (D1–D9) · minimo = só nome, celular e CPF (adesão de campanha, porta rápida).';




ALTER TABLE public.inscricoes
  ADD COLUMN IF NOT EXISTS qr_slug             TEXT,
  ADD COLUMN IF NOT EXISTS compromisso_centavos BIGINT,
  ADD COLUMN IF NOT EXISTS contrato_minimo     BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.inscricoes DROP CONSTRAINT IF EXISTS inscricoes_compromisso_chk;
ALTER TABLE public.inscricoes ADD CONSTRAINT inscricoes_compromisso_chk
  CHECK (compromisso_centavos IS NULL OR compromisso_centavos > 0);
CREATE INDEX IF NOT EXISTS inscricoes_qr_slug_idx
  ON public.inscricoes (qr_slug) WHERE deleted_at IS NULL AND qr_slug IS NOT NULL;




ALTER TABLE public.inscricoes DROP CONSTRAINT IF EXISTS chk_inscricoes_contrato;
ALTER TABLE public.inscricoes ADD CONSTRAINT chk_inscricoes_contrato CHECK (
  legado_fonte IS NOT NULL
  OR (contrato_minimo AND telefone IS NOT NULL AND cpf IS NOT NULL)
  OR (
    telefone IS NOT NULL AND cpf IS NOT NULL AND email IS NOT NULL
    AND data_nascimento IS NOT NULL AND sexo IS NOT NULL
  )
) NOT VALID;
ALTER TABLE public.inscricoes VALIDATE CONSTRAINT chk_inscricoes_contrato;





CREATE OR REPLACE FUNCTION public.fn_inscricoes_contrato_minimo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_contrato TEXT;
  v_camp     UUID;
  v_faixas   JSONB;
  v_rotulo   TEXT;
  v_cent     BIGINT;
  v_outro    BOOLEAN;
  v_txt      TEXT;
BEGIN
  SELECT e.contrato, e.campanha_id INTO v_contrato, v_camp
    FROM public.insc_eventos e WHERE e.id = NEW.evento_id;
  IF TG_OP = 'INSERT' AND v_contrato = 'minimo' THEN
    NEW.contrato_minimo := true;
  END IF;
  IF v_camp IS NOT NULL THEN
    SELECT faixas INTO v_faixas FROM public.camp_campanhas WHERE id = v_camp;
    v_rotulo := NEW.dados ->> 'faixa';
    IF v_rotulo IS NOT NULL THEN
      SELECT (f ->> 'centavos')::bigint, COALESCE((f ->> 'outro')::boolean, false)
        INTO v_cent, v_outro
        FROM jsonb_array_elements(COALESCE(v_faixas, '[]'::jsonb)) f
       WHERE f ->> 'rotulo' = v_rotulo
       LIMIT 1;
      IF v_outro THEN
        
        v_txt := regexp_replace(COALESCE(NEW.dados ->> 'valor_outro', ''), '[^0-9,\.]', '', 'g');
        v_txt := replace(v_txt, '.', '');
        v_txt := replace(v_txt, ',', '.');
        BEGIN
          v_cent := round(v_txt::numeric * 100)::bigint;
        EXCEPTION WHEN OTHERS THEN
          v_cent := NULL;
        END;
      END IF;
      IF v_cent IS NOT NULL AND v_cent > 0 THEN
        NEW.compromisso_centavos := v_cent;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END
$fn$;
DROP TRIGGER IF EXISTS trg_inscricoes_contrato_minimo ON public.inscricoes;
CREATE TRIGGER trg_inscricoes_contrato_minimo
  BEFORE INSERT OR UPDATE OF dados ON public.inscricoes
  FOR EACH ROW EXECUTE FUNCTION public.fn_inscricoes_contrato_minimo();

COMMENT ON COLUMN public.inscricoes.qr_slug IS
  'Slug do link curto (ativação) por onde a pessoa chegou (?qr=). Primeiro toque vence; nunca sobrescrito.';
COMMENT ON COLUMN public.inscricoes.compromisso_centavos IS
  'Compromisso MENSAL prometido na adesão, derivado da faixa (trigger). Régua "inscritos" das campanhas de dinheiro.';





ALTER TABLE public.vol_inscricoes ADD COLUMN IF NOT EXISTS qr_slug TEXT;
CREATE INDEX IF NOT EXISTS vol_inscricoes_qr_slug_idx
  ON public.vol_inscricoes (qr_slug) WHERE qr_slug IS NOT NULL;
COMMENT ON COLUMN public.vol_inscricoes.qr_slug IS
  'Slug do link curto (ativação de campanha) por onde a pessoa chegou (?qr=).';





ALTER TABLE public.camp_vinculos
  ADD COLUMN IF NOT EXISTS inscricao_id UUID REFERENCES public.inscricoes(id) ON DELETE SET NULL;




DO $do$
DECLARE r RECORD; def TEXT;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.camp_disparos'::regclass AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%segmento%'
       AND pg_get_constraintdef(oid) ILIKE '%doadores_campanha%'
  LOOP
    EXECUTE format('ALTER TABLE public.camp_disparos DROP CONSTRAINT %I', r.conname);
  END LOOP;
  ALTER TABLE public.camp_disparos ADD CONSTRAINT camp_disparos_segmento_check
    CHECK (segmento IN ('todos', 'membros', 'voluntarios', 'pais_kids', 'doadores_campanha',
                        'aderentes', 'aderentes_em_atraso'));
  SELECT pg_get_constraintdef(oid) INTO def FROM pg_constraint
   WHERE conrelid = 'public.camp_disparos'::regclass AND conname = 'camp_disparos_segmento_check';
  IF def !~ 'doadores_campanha' OR def !~ 'aderentes_em_atraso' OR def !~ 'pais_kids' THEN
    RAISE EXCEPTION 'camp_disparos_segmento_check perdeu segmento: %', def;
  END IF;
END
$do$;








