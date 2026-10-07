

















function proximoCursor(paginaCrua, tamanho, chave = 'id') {
  const linhas = Array.isArray(paginaCrua) ? paginaCrua : [];


  if (!linhas.length || linhas.length < tamanho) return null;
  const ultimo = linhas[linhas.length - 1];
  return ultimo && ultimo[chave] != null ? ultimo[chave] : null;
}

module.exports = { proximoCursor };
