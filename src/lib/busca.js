













export function normalizarBusca(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}




export function contemNormalizado(alvo, termo) {
  const t = normalizarBusca(termo);
  if (!t) return true;
  return normalizarBusca(alvo).includes(t);
}


export function algumContemNormalizado(lista, termo) {
  const t = normalizarBusca(termo);
  if (!t) return true;
  return (lista || []).some((v) => normalizarBusca(v).includes(t));
}
