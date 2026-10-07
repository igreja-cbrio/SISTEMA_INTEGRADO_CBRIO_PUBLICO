

























const OCUPACOES_DIAS = [1, 2, 3, 5];

const RE_DIA = /^\d{4}-\d{2}-\d{2}$/;




function paraDia(s) {
  if (typeof s !== 'string' || !RE_DIA.test(s)) return null;
  const t = Date.parse(`${s}T00:00:00Z`);
  if (Number.isNaN(t)) return null;


  const d = new Date(t);
  if (d.toISOString().slice(0, 10) !== s) return null;
  return Math.floor(t / 86400000);
}

function paraStr(dia) {
  return new Date(dia * 86400000).toISOString().slice(0, 10);
}


function diaDaSemana(dia) {
  return ((dia + 4) % 7 + 7) % 7;
}

function ehDiaUtil(diaOuStr) {
  const d = typeof diaOuStr === 'string' ? paraDia(diaOuStr) : diaOuStr;
  if (d === null) return false;
  const dow = diaDaSemana(d);
  return dow !== 0 && dow !== 6;
}


function proximoDiaUtil(diaStr) {
  let d = paraDia(diaStr);
  if (d === null) return null;

  for (let i = 0; i < 7 && !ehDiaUtil(d); i++) d += 1;
  return paraStr(d);
}









function calcularDataFim(inicioStr, ocupaDias) {
  const ini = paraDia(inicioStr);
  if (ini === null) return null;
  const n = Number(ocupaDias);
  if (!Number.isFinite(n) || n <= 0) return null;

  const precisa = Math.max(1, Math.ceil(n));
  let d = ini;

  for (let i = 0; i < 7 && !ehDiaUtil(d); i++) d += 1;

  let contados = 1;
  let guarda = 0;
  while (contados < precisa && guarda < 400) {
    d += 1;
    guarda++;
    if (ehDiaUtil(d)) contados++;
  }
  return paraStr(d);
}


function diasUteisNoIntervalo(inicioStr, fimStr) {
  const a = paraDia(inicioStr);
  const b = paraDia(fimStr);
  if (a === null || b === null || b < a) return 0;
  let n = 0;
  for (let d = a; d <= b; d++) if (ehDiaUtil(d)) n++;
  return n;
}







function cargaNoDia({ pode_paralelo = true, slots_dia = 3, ocupa_dias = 1 } = {}) {
  const slots = Number.isFinite(Number(slots_dia)) && Number(slots_dia) > 0 ? Number(slots_dia) : 3;
  if (!pode_paralelo) return slots;
  const n = Number(ocupa_dias);
  if (Number.isFinite(n) && n > 0 && n < 1) return n;
  return 1;
}










function ocupacaoPorDia({ tarefas = [], slots_dia = 3, de = null, ate = null } = {}) {
  const slots = Number.isFinite(Number(slots_dia)) && Number(slots_dia) > 0 ? Number(slots_dia) : 3;
  const lo = de ? paraDia(de) : null;
  const hi = ate ? paraDia(ate) : null;
  const mapa = {};

  for (const t of Array.isArray(tarefas) ? tarefas : []) {
    const a = paraDia(t?.data_inicio);
    const b = paraDia(t?.data_fim);





    if (a === null || b === null || b < a) continue;
    const carga = cargaNoDia({
      pode_paralelo: t.pode_paralelo !== false,
      slots_dia: slots,
      ocupa_dias: t.ocupa_dias,
    });
    for (let d = a; d <= b; d++) {
      if (!ehDiaUtil(d)) continue;
      if (lo !== null && d < lo) continue;
      if (hi !== null && d > hi) continue;
      const k = paraStr(d);
      if (!mapa[k]) mapa[k] = { slots: 0, cheio: false, excedido: false, tarefas: [] };
      mapa[k].slots += carga;
      mapa[k].tarefas.push(t.titulo || t.id || '—');
    }
  }
  for (const k of Object.keys(mapa)) {
    mapa[k].slots = Math.round(mapa[k].slots * 100) / 100;
    mapa[k].cheio = mapa[k].slots >= slots;
    mapa[k].excedido = mapa[k].slots > slots;
  }
  return mapa;
}

module.exports = {
  OCUPACOES_DIAS,
  ehDiaUtil,
  proximoDiaUtil,
  calcularDataFim,
  diasUteisNoIntervalo,
  cargaNoDia,
  ocupacaoPorDia,
};
