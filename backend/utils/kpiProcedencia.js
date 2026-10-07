


























const CATALOGO = Object.freeze({
  voluntarios_checkin: {
    fonte: 'vol_schedules × vol_check_ins (por vol_teams.area)',
    conta: 'Escalas da área que tiveram check-in registrado, divididas por TODAS as escalas da área.',



    ressalva: 'Mede o REGISTRO, não a presença: quem serviu e não passou pelo check-in entra como ausente. O crédito vai para o mês do CULTO, não do dia em que o check-in foi lançado.',



    partes: { denominador: 'escalas', numerador: 'com check-in' },
  },
  voluntarios_ativos: {
    fonte: 'mem_voluntarios',
    conta: 'Vínculos de voluntariado em aberto (sem data de saída) na área.',
  },
  batismos: { fonte: 'batismo_inscricoes', conta: 'Batismos realizados no período.' },
  conversoes: { fonte: 'cultos', conta: 'Decisões registradas nos cultos do período.' },
  devocionais: { fonte: 'mem_devocionais', conta: 'Devocionais concluídos no período.' },
  doacoes_valor: {
    fonte: 'vw_doacoes_unificada',
    conta: 'Dízimo + oferta (planos 3.01.01 e 3.01.02 do razão) no período.',
    ressalva: 'Campanhas, missões, ação social, outras contribuições e extraordinárias não entram neste número.',
  },
  doadores_count: { fonte: 'mem_contribuicoes', conta: 'Pessoas distintas que contribuíram no período.' },
  frequencia_culto: { fonte: 'cultos', conta: 'Público registrado nos cultos do período.' },
  frequencia_grupos: {
    fonte: 'mem_grupo_encontros × mem_grupo_encontro_presencas',
    conta: 'Presenças registradas nos encontros de grupo do período.',
    ressalva: 'Depende de o líder registrar a chamada — encontro sem chamada não entra.',
  },
  grupos_ativos: { fonte: 'mem_grupos', conta: 'Grupos ativos da área.' },
  inscricoes_jornada180: { fonte: 'cui_jornada', conta: 'Inscrições na Jornada 180 no período.' },
  lideres_acompanhados: {
    fonte: 'grupo_supervisao_visitas × mem_grupos',
    conta: 'Líderes distintos que receberam visita de supervisão no período.',
  },
  lideres_treinados: { fonte: 'mem_grupo_membros × mem_grupos', conta: 'Líderes em treinamento nos grupos.' },
  nps_next: { fonte: 'dados_brutos', conta: 'Nota de NPS do Next informada no período.' },
});


















const CATALOGO_AUTO = Object.freeze({
  'cultos.online_ds_cresc': {
    fonte: 'cultos.online_ds (views depois da live)',
    conta: 'Quanto o DS da semana cresceu ou caiu em relação à semana anterior.',
    ressalva: 'DS é quem viu DEPOIS que a transmissão acabou — não é o pico de espectadores simultâneos nem as views durante a live. Semana sem nenhum DS registrado fica SEM DADO, e não 0%: o DS só é lido na manhã seguinte ao culto.',
    partes: { numerador: 'DS da semana', denominador: 'semana anterior' },
  },
  'cultos.online_freq': {
    fonte: 'cultos.online_pico',
    conta: 'Soma do pico de espectadores SIMULTÂNEOS dos cultos da semana.',
    ressalva: 'É audiência absoluta, não percentual.',
  },
});


const COMO_CALCULA = Object.freeze({
  soma_periodo: 'Soma/apura o dado do próprio período.',
  delta_pct: 'Variação percentual contra o período de comparação.',
  delta_abs: 'Variação absoluta contra o período de comparação.',
  razao: 'Razão entre dois dados do período.',
  manual: 'Preenchido à mão — o sistema não calcula.',
});

const PERIODO_LABEL = Object.freeze({
  semanal: 'toda semana', mensal: 'todo mês', trimestral: 'a cada trimestre',
  semestral: 'a cada semestre', anual: 'uma vez por ano',
});



















function metaDaFicha(kpi, trajetoria) {
  const nominal = kpi.meta_valor ?? kpi.meta_valor_absoluto ?? null;
  const efetiva = trajetoria && trajetoria.meta_efetiva !== undefined
    && trajetoria.meta_efetiva !== null ? Number(trajetoria.meta_efetiva) : null;
  const doPeriodo = trajetoria && trajetoria.meta_periodo !== undefined
    && trajetoria.meta_periodo !== null ? Number(trajetoria.meta_periodo) : null;
  const nominalNum = nominal === null ? null : Number(nominal);
  const divergente = efetiva !== null && nominalNum !== null
    && Number.isFinite(efetiva) && Number.isFinite(nominalNum) && efetiva !== nominalNum;
  return {
    meta: nominal,
    meta_efetiva: efetiva,
    meta_periodo: doPeriodo,

    meta_divergente: divergente,
  };
}

function montarProcedencia(kpi, historico = {}, trajetoria = null) {
  if (!kpi || typeof kpi !== 'object') return null;

  const tipoCalculo = String(kpi.tipo_calculo || '').trim() || 'manual';
  const dadoTipo = kpi.formula_config && typeof kpi.formula_config === 'object'
    ? String(kpi.formula_config.dado_tipo || '').trim()
    : '';
  const fonteAuto = String(kpi.fonte_auto || '').trim();



  const entradaAuto = fonteAuto ? CATALOGO_AUTO[fonteAuto] : null;
  const entrada = entradaAuto || (dadoTipo ? CATALOGO[dadoTipo] : null);


  const automatico = tipoCalculo !== 'manual' || !!fonteAuto;








  const semImplementacao = !fonteAuto && tipoCalculo !== 'manual' && !!dadoTipo && !entrada;

  return {
    kpi_id: kpi.id || null,
    indicador: kpi.indicador || null,
    area: kpi.area || null,
    periodicidade: kpi.periodicidade || null,
    quando: PERIODO_LABEL[String(kpi.periodicidade || '').toLowerCase()] || null,
    ...metaDaFicha(kpi, trajetoria),
    sentido_meta: kpi.sentido_meta || null,
    automatico,
    como_calcula: COMO_CALCULA[tipoCalculo] || null,
    tipo_calculo: tipoCalculo,
    dado_tipo: dadoTipo || null,
    fonte_auto: fonteAuto || null,
    fonte: entrada?.fonte
      || (fonteAuto ? `rotina automática \`${fonteAuto}\`` : null),
    conta: entrada?.conta || null,
    ressalva: entrada?.ressalva || null,

    rotulo_partes: entrada?.partes || null,


    conta_generica: !entrada && !!fonteAuto,
    sem_implementacao: semImplementacao,



    desde: historico.primeiro_periodo || null,
    ate: historico.ultimo_periodo || null,
    periodos_medidos: Number.isFinite(Number(historico.total_periodos))
      ? Number(historico.total_periodos) : 0,

    nunca_mediu: !historico.primeiro_periodo,
  };
}

module.exports = { CATALOGO, CATALOGO_AUTO, COMO_CALCULA, PERIODO_LABEL, metaDaFicha, montarProcedencia };
