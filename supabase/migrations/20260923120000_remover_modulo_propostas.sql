




















DO $$
DECLARE
  v_id  int;
  r     record;
  v_n   bigint;
BEGIN
  SELECT id INTO v_id FROM public.modulos WHERE slug = 'propostas';
  IF v_id IS NULL THEN
    RAISE NOTICE 'modulo propostas ja nao existe em modulos - nada a fazer';
    RETURN;
  END IF;

  FOR r IN
    SELECT c.conrelid::regclass AS tabela, a.attname AS coluna
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
     WHERE c.contype = 'f'
       AND c.confrelid = 'public.modulos'::regclass
  LOOP
    EXECUTE format('DELETE FROM %s WHERE %I = $1', r.tabela, r.coluna) USING v_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RAISE NOTICE '% . % : % linha(s) do modulo % apagadas', r.tabela, r.coluna, v_n, v_id;
  END LOOP;

  DELETE FROM public.modulos WHERE id = v_id;
  RAISE NOTICE 'modulos: linha % (propostas) apagada', v_id;
END $$;




DO $$
DECLARE
  v_lista text;
BEGIN
  IF NOT ('prop_proposta' = ANY(public.app_soft_deletable_tables())) THEN
    RAISE NOTICE 'prop_proposta ja nao estava na whitelist - nada a fazer';
  ELSE
    SELECT string_agg(quote_literal(t), ', ' ORDER BY t) INTO v_lista
      FROM unnest(public.app_soft_deletable_tables()) AS t
     WHERE t <> 'prop_proposta';
    EXECUTE 'CREATE OR REPLACE FUNCTION public.app_soft_deletable_tables() '
         || 'RETURNS TEXT[] LANGUAGE sql IMMUTABLE AS $body$ SELECT ARRAY['
         || v_lista || ']::TEXT[] $body$';
    RAISE NOTICE 'whitelist atualizada sem prop_proposta';
  END IF;
END $$;


DROP TRIGGER IF EXISTS trg_prop_derivados ON public.prop_proposta;
DROP FUNCTION IF EXISTS public.fn_prop_derivados();
DROP FUNCTION IF EXISTS public.fn_prop_transicionar(UUID, TEXT, TEXT, UUID);


DROP TABLE IF EXISTS public.prop_pos_evento      CASCADE;
DROP TABLE IF EXISTS public.prop_deliberacao     CASCADE;
DROP TABLE IF EXISTS public.prop_avaliacao_nota  CASCADE;
DROP TABLE IF EXISTS public.prop_avaliacao       CASCADE;
DROP TABLE IF EXISTS public.prop_snapshot        CASCADE;
DROP TABLE IF EXISTS public.prop_log             CASCADE;
DROP TABLE IF EXISTS public.prop_anexo           CASCADE;
DROP TABLE IF EXISTS public.prop_desembolso      CASCADE;
DROP TABLE IF EXISTS public.prop_risco           CASCADE;
DROP TABLE IF EXISTS public.prop_atividade       CASCADE;
DROP TABLE IF EXISTS public.prop_indicador       CASCADE;
DROP TABLE IF EXISTS public.prop_proposta        CASCADE;
DROP TABLE IF EXISTS public.prop_criterio        CASCADE;
DROP TABLE IF EXISTS public.prop_parametro       CASCADE;
DROP TABLE IF EXISTS public.prop_area_diretor    CASCADE;
DROP TABLE IF EXISTS public.prop_ciclo           CASCADE;



