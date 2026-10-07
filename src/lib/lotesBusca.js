





















export const POR_LOTE = 1000;



export const MAX_LOTES = 20;








export function lotesPara(total, porLote = POR_LOTE, maxLotes = MAX_LOTES) {
  const n = Number(total);
  const passo = Number(porLote) > 0 ? Math.floor(Number(porLote)) : POR_LOTE;
  const teto = Number(maxLotes) > 0 ? Math.floor(Number(maxLotes)) : MAX_LOTES;




  if (!Number.isFinite(n) || n <= 0) return { offsets: [0], truncado: false, alcance: passo };

  const necessarios = Math.ceil(n / passo);
  const usados = Math.min(necessarios, teto);
  const offsets = [];
  for (let i = 0; i < usados; i += 1) offsets.push(i * passo);
  return {
    offsets,
    truncado: necessarios > teto,
    alcance: Math.min(n, usados * passo),
  };
}
