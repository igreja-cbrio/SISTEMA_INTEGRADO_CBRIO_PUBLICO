
























const MAX_AMOSTRA = 5;







function amostraNomes(rotulos, max = MAX_AMOSTRA) {
  const itens = (rotulos || []).filter(r => r != null && String(r).trim() !== '');
  if (!itens.length) return '';
  const limite = Number.isFinite(max) && max > 0 ? Math.floor(max) : MAX_AMOSTRA;
  const lista = itens.slice(0, limite).join(', ');
  const resto = itens.length > limite ? ` e mais ${itens.length - limite}` : '';
  return `${lista}${resto}`;
}






function plural(n, singular, pluralPalavra) {
  return Number(n) === 1 ? singular : pluralPalavra;
}

module.exports = { amostraNomes, plural, MAX_AMOSTRA };
