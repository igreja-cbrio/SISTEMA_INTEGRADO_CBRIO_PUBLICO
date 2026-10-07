



























function inteiro(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null;
}
















function calcularDs({ viewCountD1, viewsLive } = {}) {
  const d1 = inteiro(viewCountD1);
  if (d1 === null) return { ds: null, regra: 'sem_dado' };

  const live = inteiro(viewsLive);
  if (live === null) return { ds: d1, regra: 'acumulado' };





  return { ds: Math.max(0, d1 - live), regra: 'pos_live' };
}










function maiorViewCount(atual, novo) {
  const a = inteiro(atual);
  const n = inteiro(novo);
  if (n === null) return a;
  if (a === null) return n;
  return Math.max(a, n);
}

module.exports = { calcularDs, maiorViewCount, inteiro };
