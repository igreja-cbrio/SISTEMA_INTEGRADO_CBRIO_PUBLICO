


































const CORES_EVENTO = [
  '#16a34a',
  '#b91c1c',
  '#0891b2',
  '#2563eb',
  '#a21caf',
  '#ec4899',
];


const COR_EXCEDENTE = '#64748b';








function corDoEvento(indice) {




  if (typeof indice !== 'number' || !Number.isInteger(indice) || indice < 0) {
    return COR_EXCEDENTE;
  }
  return indice < CORES_EVENTO.length ? CORES_EVENTO[indice] : COR_EXCEDENTE;
}


function ehExcedente(indice) {
  return corDoEvento(indice) === COR_EXCEDENTE;
}

module.exports = { CORES_EVENTO, COR_EXCEDENTE, corDoEvento, ehExcedente };
