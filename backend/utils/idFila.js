





























function idFila(valor) {
  if (typeof valor === 'number') {
    return Number.isInteger(valor) && valor > 0 ? valor : null;
  }
  if (typeof valor !== 'string') return null;

  if (!/^[1-9][0-9]{0,17}$/.test(valor)) return null;
  const n = Number(valor);
  return Number.isSafeInteger(n) ? n : null;
}

module.exports = { idFila };
