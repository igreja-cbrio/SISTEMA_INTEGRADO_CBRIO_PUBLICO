








































CREATE OR REPLACE FUNCTION public._kpi_periodo_minimo(p_periodicidade text)
RETURNS text LANGUAGE sql STABLE SET search_path TO 'public' AS $function$
  SELECT CASE lower(coalesce(p_periodicidade, 'mensal'))
    WHEN 'semanal'    THEN to_char(current_date - interval '7 days', 'IYYY"-W"IW')
    WHEN 'mensal'     THEN to_char(current_date - interval '1 month', 'YYYY-MM')
    WHEN 'trimestral' THEN to_char(current_date - interval '3 months', 'YYYY')
                             || '-Q' || ((((extract(month from current_date - interval '3 months')::int - 1) / 3) + 1))::text
    WHEN 'semestral'  THEN to_char(current_date - interval '6 months', 'YYYY')
                             || '-S' || (CASE WHEN extract(month from current_date - interval '6 months') <= 6 THEN 1 ELSE 2 END)::text
    WHEN 'anual'      THEN to_char(current_date - interval '1 year', 'YYYY')
    ELSE to_char(current_date - interval '1 month', 'YYYY-MM')
  END
$function$;

CREATE OR REPLACE VIEW vw_kpi_trajetoria_atual AS
WITH ultimo_manual AS (
  SELECT DISTINCT ON (r.indicador_id) r.indicador_id, r.periodo_referencia,
         r.valor_realizado, r.data_preenchimento
    FROM kpi_registros r
    JOIN kpi_indicadores_taticos ktm ON ktm.id = r.indicador_id
   WHERE r.valor_realizado IS NOT NULL AND
         CASE WHEN ktm.periodicidade = 'semanal'
              THEN r.periodo_referencia < to_char(CURRENT_DATE::timestamptz, 'IYYY"-W"IW')
              ELSE r.periodo_referencia < _kpi_periodo_corrente(ktm.periodicidade) OR r.valor_realizado > 0::numeric
         END
   ORDER BY r.indicador_id, r.periodo_referencia DESC
), ultimo_calculado AS (
  SELECT DISTINCT ON (c.kpi_id) c.kpi_id, c.periodo_referencia, c.valor_calculado, c.calculado_em
    FROM kpi_valores_calculados c
    JOIN kpi_indicadores_taticos ktc ON ktc.id = c.kpi_id
   WHERE c.valor_calculado IS NOT NULL AND
         CASE WHEN ktc.periodicidade = 'semanal'
              THEN c.periodo_referencia < to_char(CURRENT_DATE::timestamptz, 'IYYY"-W"IW')
              ELSE c.periodo_referencia < _kpi_periodo_corrente(ktc.periodicidade) OR c.valor_calculado > 0::numeric
         END
   ORDER BY c.kpi_id, c.periodo_referencia DESC
), meta_efetiva AS (
  SELECT k_1.id AS kpi_id,
         COALESCE(k_1.meta_valor_absoluto, t_1.meta_valor, k_1.meta_valor) AS meta_anual,
         CASE k_1.periodicidade WHEN 'semanal' THEN 52 WHEN 'mensal' THEN 12
              WHEN 'trimestral' THEN 4 WHEN 'semestral' THEN 2 ELSE 1 END AS divisor
    FROM kpi_indicadores_taticos k_1
    LEFT JOIN kpi_trajetoria t_1 ON t_1.kpi_id = k_1.id AND t_1.ativa = true
), base AS (
  SELECT k.id, k.indicador, k.area, k.periodicidade, k.tipo_calculo, k.valores, k.is_okr,
         k.objetivo_geral_id, k.meta_valor_absoluto, k.sentido_meta,
         t.periodo_referencia AS checkpoint_periodo, t.meta_valor AS checkpoint_meta,
         me.meta_anual,
         CASE WHEN k.tipo_calculo <> 'manual' AND uc.valor_calculado IS NOT NULL
              THEN uc.periodo_referencia ELSE um.periodo_referencia END AS periodo_bruto,
         CASE WHEN k.tipo_calculo <> 'manual' AND uc.valor_calculado IS NOT NULL
              THEN uc.valor_calculado ELSE um.valor_realizado END AS valor_bruto,
         CASE WHEN k.meta_valor_absoluto IS NOT NULL THEN me.meta_anual / me.divisor::numeric
              ELSE me.meta_anual END AS meta_periodo_calc
    FROM kpi_indicadores_taticos k
    LEFT JOIN kpi_trajetoria t ON t.kpi_id = k.id AND t.ativa = true
    LEFT JOIN ultimo_manual um ON um.indicador_id = k.id
    LEFT JOIN ultimo_calculado uc ON uc.kpi_id = k.id
    LEFT JOIN meta_efetiva me ON me.kpi_id = k.id
   WHERE k.ativo = true
), datado AS (
  
  SELECT b.*,
         (b.periodo_bruto IS NOT NULL AND b.periodo_bruto < _kpi_periodo_minimo(b.periodicidade)) AS vencido
    FROM base b
)
SELECT id AS kpi_id, indicador, area, periodicidade, tipo_calculo, valores, is_okr,
       objetivo_geral_id, checkpoint_periodo, checkpoint_meta,
       meta_anual AS meta_efetiva,
       CASE WHEN meta_valor_absoluto IS NOT NULL THEN round(meta_periodo_calc, 2)
            ELSE meta_periodo_calc END AS meta_periodo,
       CASE WHEN vencido THEN NULL ELSE periodo_bruto END AS ultimo_periodo,
       CASE WHEN vencido THEN NULL ELSE valor_bruto  END AS ultimo_valor,
       CASE
         WHEN vencido OR valor_bruto IS NULL THEN 'pendente'::text
         WHEN meta_anual IS NULL OR meta_anual = 0::numeric
              THEN CASE WHEN valor_bruto > 0::numeric THEN 'verde'::text ELSE 'vermelho'::text END
         WHEN _kpi_atingiu(valor_bruto, meta_periodo_calc, sentido_meta) THEN 'verde'::text
         WHEN _kpi_atingiu(valor_bruto, meta_periodo_calc, sentido_meta, 0.9) THEN 'amarelo'::text
         ELSE 'vermelho'::text
       END AS status,
       CASE
         WHEN vencido OR valor_bruto IS NULL THEN 'sem_dado'::text
         WHEN meta_anual IS NULL OR meta_anual = 0::numeric THEN 'sem_meta'::text
         WHEN _kpi_atingiu(valor_bruto, meta_periodo_calc, sentido_meta) THEN 'no_alvo'::text
         WHEN _kpi_atingiu(valor_bruto, meta_periodo_calc, sentido_meta, 0.9) THEN 'atras'::text
         ELSE 'critico'::text
       END AS status_trajetoria,
       CASE WHEN vencido THEN NULL
            ELSE _kpi_pct_meta(valor_bruto, meta_periodo_calc, sentido_meta) END AS percentual_meta,
       sentido_meta,
       
       
       periodo_bruto AS ultimo_periodo_conhecido,
       valor_bruto   AS ultimo_valor_conhecido,
       vencido       AS dado_vencido,
       _kpi_periodo_minimo(periodicidade) AS periodo_minimo_aceito
  FROM datado;
