


















SET lock_timeout = '10s';


CREATE OR REPLACE FUNCTION public.fn_inscricoes_parceira_sem_membro()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW.membro_id IS NOT NULL AND EXISTS (
    SELECT 1
      FROM public.insc_eventos e
      JOIN public.igrejas g ON g.id = e.igreja_id
     WHERE e.id = NEW.evento_id AND g.tipo = 'cba_acompanhada'
  ) THEN
    RAISE EXCEPTION 'Inscrição de igreja parceira não se liga a cadastro da CBRio'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_inscricoes_parceira_sem_membro ON public.inscricoes;
CREATE TRIGGER trg_inscricoes_parceira_sem_membro
  BEFORE INSERT OR UPDATE OF membro_id, evento_id ON public.inscricoes
  FOR EACH ROW EXECUTE FUNCTION public.fn_inscricoes_parceira_sem_membro();


DO $$
DECLARE
  v_def  text;
  v_novo text;
  v_opts text[];
  
  v_pat  text := '(JOIN (public\.)?insc_eventos e ON \(?\(?e\.id = i\.evento_id\)?\)?)';
  v_n    int;
BEGIN
  SELECT pg_get_viewdef('public.vw_inscricoes_unificadas'::regclass, true) INTO v_def;
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'vw_inscricoes_unificadas não existe';
  END IF;
  IF v_def ILIKE '%cba_acompanhada%' THEN
    RAISE NOTICE 'vw_inscricoes_unificadas já exclui igreja parceira — nada a fazer';
    RETURN;
  END IF;
  SELECT count(*) INTO v_n FROM regexp_matches(v_def, v_pat, 'g');
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'âncora do ramo da espinha apareceu % vez(es) na definição VIVA — conferir pg_get_viewdef antes de seguir', v_n;
  END IF;
  v_novo := regexp_replace(
    v_def, v_pat,
    E'\\1 AND NOT (EXISTS ( SELECT 1 FROM igrejas g_parc WHERE g_parc.id = e.igreja_id AND g_parc.tipo = ''cba_acompanhada''::text))');
  IF v_novo = v_def OR strpos(v_novo, 'g_parc') = 0 THEN
    RAISE EXCEPTION 'o patch não entrou na view — abortado';
  END IF;
  SELECT reloptions INTO v_opts
    FROM pg_class WHERE oid = 'public.vw_inscricoes_unificadas'::regclass;
  EXECUTE 'CREATE OR REPLACE VIEW public.vw_inscricoes_unificadas AS ' || v_novo;
  IF v_opts IS NOT NULL THEN
    EXECUTE format('ALTER VIEW public.vw_inscricoes_unificadas SET (%s)',
                   array_to_string(v_opts, ', '));
  END IF;
  RAISE NOTICE 'vw_inscricoes_unificadas: eventos de igreja parceira fora da visão unificada';
END $$;

NOTIFY pgrst, 'reload schema';
