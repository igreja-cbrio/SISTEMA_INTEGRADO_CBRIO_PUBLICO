



























const TOLERANCIA = 0.05;

function numero(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}








function montarSerie(partes, gravados, periodoAtual = null) {
  const porPeriodo = new Map();
  for (const g of Array.isArray(gravados) ? gravados : []) {
    const p = g && g.periodo_referencia;
    if (!p) continue;










    if (periodoAtual && String(p) > String(periodoAtual)) continue;
    porPeriodo.set(String(p), numero(g.valor_calculado));
  }

  const vivas = (Array.isArray(partes) ? partes : [])
    .filter((l) => !periodoAtual || String(l.periodo) <= String(periodoAtual));




  if (vivas.length === 0) {
    const linhas = [...porPeriodo.entries()]
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
      .map(([periodo, valor]) => ({
        periodo, numerador: null, denominador: null, valor,
        valor_gravado: valor, divergente: false,
      }));
    return { tem_partes: false, linhas, divergencias: 0 };
  }

  let divergencias = 0;
  const linhas = vivas.map((l) => {
    const periodo = String(l.periodo);
    const valor = numero(l.valor);
    const gravado = porPeriodo.has(periodo) ? porPeriodo.get(periodo) : null;



    const divergente = valor !== null && gravado !== null
      && Math.abs(valor - gravado) > TOLERANCIA;
    if (divergente) divergencias += 1;
    return {
      periodo,
      numerador: numero(l.numerador),
      denominador: numero(l.denominador),
      valor,
      valor_gravado: gravado,
      divergente,
    };
  });

  return { tem_partes: true, linhas, divergencias };
}

module.exports = { TOLERANCIA, montarSerie };
