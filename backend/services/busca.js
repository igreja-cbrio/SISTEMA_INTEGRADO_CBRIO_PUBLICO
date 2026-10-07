













function normalizarBusca(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}



function contemNormalizado(alvo, termo) {
  const t = normalizarBusca(termo);
  if (!t) return true;
  return normalizarBusca(alvo).includes(t);
}


function algumContemNormalizado(lista, termo) {
  const t = normalizarBusca(termo);
  if (!t) return true;
  return (lista || []).some((v) => normalizarBusca(v).includes(t));
}

module.exports = { normalizarBusca, contemNormalizado, algumContemNormalizado };
