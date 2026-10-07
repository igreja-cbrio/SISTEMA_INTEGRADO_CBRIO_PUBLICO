
export function reconciliarRespostasSelecao(respostas, campos) {
  return Object.fromEntries(campos.filter(c => c.tipo !== 'anexo').map(c => {
    const v = respostas[c.id];
    if (c.tipo === 'multipla') return [c.id, Array.isArray(v) ? v.filter(x => c.opcoes.includes(x)) : []];
    if (c.tipo === 'escolha') return [c.id, typeof v === 'string' && c.opcoes.includes(v) ? v : ''];
    return [c.id, typeof v === 'string' ? v : ''];
  }));
}
