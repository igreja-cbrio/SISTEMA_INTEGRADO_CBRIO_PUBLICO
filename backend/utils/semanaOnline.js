


















const { isoWeekRange, isoWeekOf } = require('./isoWeek');


const DIAS_CONSOLIDACAO = 2;


function hojeBRT(agora = Date.now()) {
  return new Date(agora - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function iso(d) {
  return d.toISOString().slice(0, 10);
}

function ddmm(isoDia) {



  const [, m, d] = isoDia.split('-');
  return `${d}/${m}`;
}







function semanaAnteriorBRT(agora = Date.now()) {
  const hoje = hojeBRT(agora);
  const hojeDate = new Date(`${hoje}T00:00:00Z`);



  const naSemanaAnterior = new Date(hojeDate);
  naSemanaAnterior.setUTCDate(hojeDate.getUTCDate() - 7);
  const { ano, semana } = isoWeekOf(naSemanaAnterior);
  const { inicio, fim } = isoWeekRange(ano, semana);

  const inicioIso = iso(inicio);
  const fimIso = iso(fim);



  const desde = Math.round((Date.parse(`${hoje}T00:00:00Z`) - Date.parse(`${fimIso}T00:00:00Z`)) / 86400000);

  return {
    ano,
    semana,
    inicio: inicioIso,
    fim: fimIso,
    rotulo: `${ddmm(inicioIso)} a ${ddmm(fimIso)}`,
    consolidando: desde <= DIAS_CONSOLIDACAO,
    dias: 7,
  };
}











function somarViews(linhas, inicio, fim) {
  const noIntervalo = (Array.isArray(linhas) ? linhas : []).filter((l) => {
    const d = typeof l?.data === 'string' ? l.data.slice(0, 10) : null;
    return d && d >= inicio && d <= fim;
  });

  if (noIntervalo.length === 0) {
    return { views: null, watch_minutos: null, dias_com_dado: 0 };
  }

  let views = 0;
  let watch = 0;
  let temWatch = false;
  for (const l of noIntervalo) {
    const v = Number(l.views);
    if (Number.isFinite(v)) views += v;
    const w = Number(l.watch_minutos);
    if (Number.isFinite(w)) { watch += w; temWatch = true; }
  }

  return {
    views,
    watch_minutos: temWatch ? watch : null,
    dias_com_dado: noIntervalo.length,
  };
}


















function compararSemanas(atual, anterior) {
  const completa = (s) => s && s.views != null && s.dias_com_dado === 7;

  if (!completa(atual)) {
    return { pode: false, motivo: 'semana_incompleta', dias_com_dado: atual?.dias_com_dado ?? 0 };
  }
  if (!completa(anterior)) {
    return { pode: false, motivo: 'anterior_incompleta', dias_com_dado: anterior?.dias_com_dado ?? 0 };
  }



  if (anterior.views === 0) {
    return { pode: false, motivo: 'base_zero', absoluto: atual.views };
  }

  const absoluto = atual.views - anterior.views;
  return {
    pode: true,
    absoluto,
    percentual: Number(((absoluto / anterior.views) * 100).toFixed(1)),
  };
}

module.exports = { DIAS_CONSOLIDACAO, hojeBRT, semanaAnteriorBRT, somarViews, compararSemanas };
