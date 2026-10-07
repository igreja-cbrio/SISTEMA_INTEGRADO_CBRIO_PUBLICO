

























BEGIN;




ALTER TABLE public.rh_aval360_ciclo
  ADD COLUMN IF NOT EXISTS corte_baixo NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS corte_alto  NUMERIC(5,2);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rh_aval360_ciclo_cortes_ck') THEN
    ALTER TABLE public.rh_aval360_ciclo ADD CONSTRAINT rh_aval360_ciclo_cortes_ck
      CHECK ((corte_baixo IS NULL AND corte_alto IS NULL)
          OR (corte_baixo IS NOT NULL AND corte_alto IS NOT NULL
              AND corte_baixo >= 1 AND corte_alto <= escala_max AND corte_baixo < corte_alto));
  END IF;
END $$;


CREATE TABLE IF NOT EXISTS public.rh_aval360_entrega (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ciclo_id           UUID NOT NULL REFERENCES public.rh_aval360_ciclo(id) ON DELETE RESTRICT,
  avaliado_id        UUID NOT NULL REFERENCES public.rh_funcionarios(id) ON DELETE RESTRICT,
  
  liberado_em        TIMESTAMPTZ,
  liberado_por       UUID REFERENCES public.rh_funcionarios(id) ON DELETE RESTRICT,
  
  devolutiva_dia     DATE,
  devolutiva_por     UUID REFERENCES public.rh_funcionarios(id) ON DELETE RESTRICT,
  devolutiva_obs     TEXT CHECK (devolutiva_obs IS NULL OR length(devolutiva_obs) <= 5000),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at         TIMESTAMPTZ,
  UNIQUE (ciclo_id, avaliado_id)
);
CREATE INDEX IF NOT EXISTS idx_aval360_entrega_ativa
  ON public.rh_aval360_entrega (ciclo_id, avaliado_id) WHERE deleted_at IS NULL;

ALTER TABLE public.rh_aval360_entrega ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aval360_entrega_service ON public.rh_aval360_entrega;
CREATE POLICY aval360_entrega_service ON public.rh_aval360_entrega
  FOR ALL TO service_role USING (true) WITH CHECK (true);


COMMENT ON TABLE public.rh_aval360_entrega IS
  'Liberação do resultado 360 ao avaliado e registro da devolutiva. Uma linha por (ciclo, avaliado).';



DO $$
DECLARE v_lista TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'app_soft_deletable_tables') THEN
    SELECT string_agg(quote_literal(t), ', ' ORDER BY t) INTO v_lista
    FROM (SELECT unnest(public.app_soft_deletable_tables()) AS t UNION SELECT 'rh_aval360_entrega') s;
    EXECUTE format($f$
      CREATE OR REPLACE FUNCTION public.app_soft_deletable_tables()
      RETURNS TEXT[] LANGUAGE sql IMMUTABLE AS $body$
        SELECT ARRAY[%s]::TEXT[]
      $body$;
    $f$, v_lista);
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'audit_log_changes') THEN
    DROP TRIGGER IF EXISTS trg_audit_rh_aval360_entrega ON public.rh_aval360_entrega;
    CREATE TRIGGER trg_audit_rh_aval360_entrega
      AFTER INSERT OR UPDATE OR DELETE ON public.rh_aval360_entrega
      FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes('liberado_em,liberado_por,devolutiva_dia,devolutiva_por,deleted_at');
  END IF;
END $$;


CREATE OR REPLACE FUNCTION public.fn_aval360_resultado(p_ciclo_id uuid, p_avaliado_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ciclo rh_aval360_ciclo%ROWTYPE;
  v_piso int;
  v_baixo numeric;
  v_alto numeric;
  v_papeis jsonb;
  v_criterios jsonb;
  v_eixo_res numeric;
  v_eixo_comp numeric;
  v_geral numeric;
  v_nivel_res text;
  v_nivel_comp text;
  v_entrega jsonb;
BEGIN
  SELECT * INTO v_ciclo FROM rh_aval360_ciclo WHERE id = p_ciclo_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ciclo não encontrado.' USING ERRCODE = 'P0403'; END IF;
  IF v_ciclo.status NOT IN ('apuracao', 'publicado', 'encerrado') THEN
    RAISE EXCEPTION 'O resultado só existe depois que as respostas são encerradas.' USING ERRCODE = 'P0409';
  END IF;
  v_piso := GREATEST(v_ciclo.piso_respondentes, 3);
  v_baixo := COALESCE(v_ciclo.corte_baixo, round(1 + (v_ciclo.escala_max - 1) * 0.26, 2));
  v_alto  := COALESCE(v_ciclo.corte_alto,  round(1 + (v_ciclo.escala_max - 1) * 0.76, 2));

  
  WITH resp AS (
    SELECT r.papel, count(*)::int AS n FROM rh_aval360_resposta r
    WHERE r.ciclo_id = p_ciclo_id AND r.avaliado_id = p_avaliado_id AND r.deleted_at IS NULL
    GROUP BY r.papel)
  SELECT COALESCE(jsonb_object_agg(papel, jsonb_build_object('respondentes', n,
           'visivel', papel IN ('auto', 'gestor') OR n >= v_piso)), '{}'::jsonb)
    INTO v_papeis FROM resp;

  WITH vis AS (
    SELECT key AS papel FROM jsonb_each(v_papeis) WHERE (value->>'visivel')::boolean),
  notas AS (
    SELECT r.papel, nt.id, nt.competencia_id, nt.nota, nt.comentario
    FROM rh_aval360_resposta r JOIN rh_aval360_nota nt ON nt.resposta_id = r.id
    WHERE r.ciclo_id = p_ciclo_id AND r.avaliado_id = p_avaliado_id AND r.deleted_at IS NULL
      AND r.papel IN (SELECT papel FROM vis)),
  comps AS (
    SELECT cp.id, cp.nome, cp.descricao, cp.eixo, cc.peso, cc.ordem
    FROM rh_aval360_ciclo_competencia cc JOIN rh_aval360_competencia cp ON cp.id = cc.competencia_id
    WHERE cc.ciclo_id = p_ciclo_id AND cc.deleted_at IS NULL),
  medias AS (
    SELECT c.id,
      avg(n.nota) FILTER (WHERE n.papel = 'auto')                   AS auto,
      avg(n.nota) FILTER (WHERE n.papel = 'gestor')                 AS gestor,
      avg(n.nota) FILTER (WHERE n.papel = 'par')                    AS par,
      avg(n.nota) FILTER (WHERE n.papel = 'liderado')               AS liderado,
      avg(n.nota) FILTER (WHERE n.papel IN ('par', 'liderado'))     AS outros
    FROM comps c LEFT JOIN notas n ON n.competencia_id = c.id GROUP BY c.id),
  finais AS (
    
    SELECT m.*, (
      COALESCE(v_ciclo.peso_auto * m.auto, 0) + COALESCE(v_ciclo.peso_gestor * m.gestor, 0)
      + COALESCE(v_ciclo.peso_outros * m.outros, 0))
      / NULLIF((CASE WHEN m.auto IS NULL THEN 0 ELSE v_ciclo.peso_auto END)
             + (CASE WHEN m.gestor IS NULL THEN 0 ELSE v_ciclo.peso_gestor END)
             + (CASE WHEN m.outros IS NULL THEN 0 ELSE v_ciclo.peso_outros END), 0) AS final
    FROM medias m)
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'competencia_id', c.id, 'nome', c.nome, 'descricao', c.descricao, 'eixo', c.eixo,
      'auto', round(f.auto, 2), 'gestor', round(f.gestor, 2), 'par', round(f.par, 2),
      'liderado', round(f.liderado, 2), 'outros', round(f.outros, 2), 'final', round(f.final, 2),
      'comentarios', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('papel', n.papel, 'texto', n.comentario)
                 ORDER BY md5(n.id::text || p_ciclo_id::text))
        FROM notas n WHERE n.competencia_id = c.id AND n.comentario IS NOT NULL AND btrim(n.comentario) <> ''),
        '[]'::jsonb)
    ) ORDER BY c.ordem, c.id), '[]'::jsonb),
    sum(f.final * c.peso) FILTER (WHERE c.eixo = 'resultado' AND f.final IS NOT NULL)
      / NULLIF(sum(c.peso) FILTER (WHERE c.eixo = 'resultado' AND f.final IS NOT NULL), 0),
    sum(f.final * c.peso) FILTER (WHERE c.eixo = 'comportamento' AND f.final IS NOT NULL)
      / NULLIF(sum(c.peso) FILTER (WHERE c.eixo = 'comportamento' AND f.final IS NOT NULL), 0),
    sum(f.final * c.peso) FILTER (WHERE f.final IS NOT NULL)
      / NULLIF(sum(c.peso) FILTER (WHERE f.final IS NOT NULL), 0)
  INTO v_criterios, v_eixo_res, v_eixo_comp, v_geral
  FROM comps c JOIN finais f ON f.id = c.id;

  v_nivel_res  := CASE WHEN v_eixo_res  IS NULL THEN NULL WHEN v_eixo_res  <= v_baixo THEN 'baixo'
                       WHEN v_eixo_res  >= v_alto THEN 'alto' ELSE 'medio' END;
  v_nivel_comp := CASE WHEN v_eixo_comp IS NULL THEN NULL WHEN v_eixo_comp <= v_baixo THEN 'baixo'
                       WHEN v_eixo_comp >= v_alto THEN 'alto' ELSE 'medio' END;

  SELECT jsonb_build_object('liberado_em', e.liberado_em, 'devolutiva_dia', e.devolutiva_dia,
           'devolutiva_obs', e.devolutiva_obs)
    INTO v_entrega FROM rh_aval360_entrega e
    WHERE e.ciclo_id = p_ciclo_id AND e.avaliado_id = p_avaliado_id AND e.deleted_at IS NULL;

  RETURN jsonb_build_object(
    'ciclo', jsonb_build_object('id', v_ciclo.id, 'nome', v_ciclo.nome, 'status', v_ciclo.status,
      'escala_max', v_ciclo.escala_max, 'escala_rotulos', v_ciclo.escala_rotulos,
      'peso_auto', v_ciclo.peso_auto, 'peso_gestor', v_ciclo.peso_gestor, 'peso_outros', v_ciclo.peso_outros,
      'piso', v_piso, 'corte_baixo', v_baixo, 'corte_alto', v_alto),
    'avaliado', (SELECT jsonb_build_object('id', f.id, 'nome', f.nome, 'cargo', f.cargo, 'area', f.area)
                 FROM rh_funcionarios f WHERE f.id = p_avaliado_id),
    'papeis', v_papeis,
    'criterios', v_criterios,
    'eixo_resultado', round(v_eixo_res, 2),
    'eixo_comportamento', round(v_eixo_comp, 2),
    'final', round(v_geral, 2),
    'nivel_resultado', v_nivel_res,
    'nivel_comportamento', v_nivel_comp,
    'quadrante', CASE v_nivel_comp || '/' || v_nivel_res
      WHEN 'alto/baixo'  THEN 'Diamante bruto'   WHEN 'alto/medio'  THEN 'Forte desempenho'
      WHEN 'alto/alto'   THEN 'Estrela'
      WHEN 'medio/baixo' THEN 'Questionável'     WHEN 'medio/medio' THEN 'Mantenedor'
      WHEN 'medio/alto'  THEN 'Forte desempenho'
      WHEN 'baixo/baixo' THEN 'Insuficiente'     WHEN 'baixo/medio' THEN 'Eficaz'
      WHEN 'baixo/alto'  THEN 'Comprometido' END,
    'entrega', COALESCE(v_entrega, '{}'::jsonb));
END;
$$;


CREATE OR REPLACE FUNCTION public.fn_aval360_resultados_ciclo(p_ciclo_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_out jsonb := '[]'::jsonb;
  v_r jsonb;
  v_id uuid;
BEGIN
  FOR v_id IN
    SELECT DISTINCT c.avaliado_id FROM rh_aval360_convite c
    WHERE c.ciclo_id = p_ciclo_id AND c.deleted_at IS NULL
  LOOP
    v_r := fn_aval360_resultado(p_ciclo_id, v_id);
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'avaliado', v_r->'avaliado', 'papeis', v_r->'papeis', 'final', v_r->'final',
      'eixo_resultado', v_r->'eixo_resultado', 'eixo_comportamento', v_r->'eixo_comportamento',
      'nivel_resultado', v_r->'nivel_resultado', 'nivel_comportamento', v_r->'nivel_comportamento',
      'quadrante', v_r->'quadrante', 'entrega', v_r->'entrega'));
  END LOOP;
  RETURN v_out;
END;
$$;




CREATE OR REPLACE FUNCTION public.fn_aval360_eh_gestor(p_ciclo_id uuid, p_avaliado_id uuid, p_gestor_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM rh_aval360_convite
    WHERE ciclo_id = p_ciclo_id AND avaliado_id = p_avaliado_id AND avaliador_id = p_gestor_id
      AND papel = 'gestor' AND deleted_at IS NULL AND suprimido_em IS NULL)
$$;




CREATE OR REPLACE FUNCTION public.fn_aval360_entregar(
  p_ciclo_id uuid, p_avaliado_id uuid, p_por uuid, p_eh_rh boolean,
  p_liberar boolean, p_devolutiva_dia date, p_devolutiva_obs text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status text;
  v_e rh_aval360_entrega%ROWTYPE;
BEGIN
  SELECT status INTO v_status FROM rh_aval360_ciclo WHERE id = p_ciclo_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ciclo não encontrado.' USING ERRCODE = 'P0403'; END IF;
  IF v_status NOT IN ('publicado', 'encerrado') THEN
    RAISE EXCEPTION 'O RH ainda não publicou os resultados deste ciclo.' USING ERRCODE = 'P0409';
  END IF;
  IF NOT COALESCE(p_eh_rh, false) AND NOT fn_aval360_eh_gestor(p_ciclo_id, p_avaliado_id, p_por) THEN
    RAISE EXCEPTION 'Só o gestor desta pessoa no ciclo, ou o RH, faz a entrega.' USING ERRCODE = 'P0403';
  END IF;
  IF NOT COALESCE(p_liberar, false) AND p_devolutiva_dia IS NULL THEN
    RAISE EXCEPTION 'Nada para registrar.' USING ERRCODE = 'P0400';
  END IF;
  IF p_devolutiva_dia IS NOT NULL AND p_devolutiva_dia > (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date THEN
    RAISE EXCEPTION 'A devolutiva é registrada depois de acontecer — a data não pode ser futura.' USING ERRCODE = 'P0400';
  END IF;
  IF p_devolutiva_obs IS NOT NULL AND length(p_devolutiva_obs) > 5000 THEN
    RAISE EXCEPTION 'Observação de até 5.000 caracteres.' USING ERRCODE = 'P0400';
  END IF;

  INSERT INTO rh_aval360_entrega(ciclo_id, avaliado_id) VALUES (p_ciclo_id, p_avaliado_id)
    ON CONFLICT (ciclo_id, avaliado_id) DO NOTHING;
  SELECT * INTO v_e FROM rh_aval360_entrega WHERE ciclo_id = p_ciclo_id AND avaliado_id = p_avaliado_id FOR UPDATE;

  
  IF p_liberar AND v_e.liberado_em IS NULL THEN
    UPDATE rh_aval360_entrega SET liberado_em = now(), liberado_por = p_por, updated_at = now() WHERE id = v_e.id;
  END IF;
  IF p_devolutiva_dia IS NOT NULL THEN
    IF COALESCE(v_e.liberado_em, CASE WHEN p_liberar THEN now() END) IS NULL THEN
      RAISE EXCEPTION 'Libere o resultado antes de registrar a devolutiva.' USING ERRCODE = 'P0409';
    END IF;
    UPDATE rh_aval360_entrega SET devolutiva_dia = p_devolutiva_dia, devolutiva_por = p_por,
      devolutiva_obs = NULLIF(btrim(COALESCE(p_devolutiva_obs, '')), ''), updated_at = now()
      WHERE id = v_e.id;
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_aval360_eh_gestor(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_aval360_entregar(uuid, uuid, uuid, boolean, boolean, date, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_aval360_eh_gestor(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_aval360_entregar(uuid, uuid, uuid, boolean, boolean, date, text) TO service_role;
REVOKE ALL ON FUNCTION public.fn_aval360_resultado(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_aval360_resultados_ciclo(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_aval360_resultado(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_aval360_resultados_ciclo(uuid) TO service_role;

COMMIT;
