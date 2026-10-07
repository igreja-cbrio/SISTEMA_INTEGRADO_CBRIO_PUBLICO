'use strict';

































const DIAS_PARA_FREQUENTADORA = 3;


const DIAS_DE_PRAZO = 28;











function devePromover(diasComCheckin, eVisitante = true) {
  if (eVisitante !== true) return false;
  const n = Number(diasComCheckin);
  if (!Number.isFinite(n)) return false;
  return n >= DIAS_PARA_FREQUENTADORA;
}









function prazoDe(hojeISO) {
  const s = String(hojeISO || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + DIAS_DE_PRAZO);
  return d.toISOString().slice(0, 10);
}









function patchAposCheckin({ eVisitante, diasComCheckin, hojeISO }) {
  if (eVisitante !== true) return null;

  if (devePromover(diasComCheckin, true)) {
    return { visitante: false, data_limite: null, visitante_relacao: null, promovida: true };
  }

  const prazo = prazoDe(hojeISO);
  return prazo ? { data_limite: prazo, promovida: false } : null;
}

module.exports = {
  DIAS_PARA_FREQUENTADORA,
  DIAS_DE_PRAZO,
  devePromover,
  prazoDe,
  patchAposCheckin,
};
