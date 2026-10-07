

























const REMETENTE_NOME_PADRAO = 'CBRio';






function nomeDeExibicao(fromName) {
  const n = typeof fromName === 'string' ? fromName.trim() : '';
  return n || REMETENTE_NOME_PADRAO;
}












function remetenteResend(configurado, fromName) {
  const bruto = typeof configurado === 'string' ? configurado.trim() : '';
  if (!bruto) return '';
  const m = bruto.match(/<([^>]+)>\s*$/);
  const endereco = (m ? m[1] : bruto).trim();
  if (!endereco) return '';
  return `${nomeDeExibicao(fromName)} <${endereco}>`;
}

module.exports = { REMETENTE_NOME_PADRAO, nomeDeExibicao, remetenteResend };
