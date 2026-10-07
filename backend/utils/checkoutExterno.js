























const NOME_PADRAO = 'e-Inscrição';
















function linkExternoValido(bruto) {
  const s = String(bruto ?? '').trim();
  if (!s) return null;
  let u;
  try { u = new URL(s); } catch { return null; }
  if (u.protocol !== 'https:') return null;
  if (u.username || u.password) return null;
  if (!u.hostname || !u.hostname.includes('.')) return null;
  return u.toString();
}


function nomeExterno(bruto) {
  const s = String(bruto ?? '').trim();
  return s ? s.slice(0, 40) : NOME_PADRAO;
}









function temCheckoutExterno(ev) {
  return !!(ev && ev.pagamento_ativo && linkExternoValido(ev.checkout_externo_url));
}










function metodosProprios(metodos, ev) {
  const lista = Array.isArray(metodos) ? metodos : [];
  if (!temCheckoutExterno(ev)) return lista;
  return lista.filter((m) => m !== 'cartao');
}










function opcoesPagamento(ev) {
  if (!temCheckoutExterno(ev)) return { escolher: false, proprios: metodosProprios(ev?.pagamento_metodos, ev) };
  const proprios = metodosProprios(ev.pagamento_metodos, ev);
  return {
    escolher: proprios.length > 0,
    proprios,
    externo_url: linkExternoValido(ev.checkout_externo_url),
    externo_nome: nomeExterno(ev.checkout_externo_nome),
  };
}

module.exports = {
  NOME_PADRAO,
  linkExternoValido,
  nomeExterno,
  temCheckoutExterno,
  metodosProprios,
  opcoesPagamento,
};
