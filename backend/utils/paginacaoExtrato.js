




































const { parseDateBR } = require('./dataBr');









function chaveItem(t) {
  const id = t && typeof t === 'object' ? t.transactionId : null;
  if (typeof id === 'string' && id.trim()) return `id:${id.trim()}`;
  try {
    return `raw:${JSON.stringify(t)}`;
  } catch {
    return `raw:${String(t)}`;
  }
}








function dentroDaJanela(t, inicio, fim) {
  const d = parseDateBR(t && typeof t === 'object' ? t.transactionDate : null);
  if (!d) return true;
  if (typeof inicio === 'string' && inicio && d < inicio) return false;
  if (typeof fim === 'string' && fim && d > fim) return false;
  return true;
}












function avaliarPagina({ itens, vistos, limite, inicio, fim } = {}) {
  const lista = Array.isArray(itens) ? itens : [];
  const conhecidos = vistos instanceof Set ? vistos : new Set();

  const novos = [];
  let novosNaJanela = 0;
  for (const t of lista) {
    const k = chaveItem(t);
    if (conhecidos.has(k)) continue;
    conhecidos.add(k);
    novos.push(t);
    if (dentroDaJanela(t, inicio, fim)) novosNaJanela += 1;
  }



  const encerrar = lista.length < Number(limite);



  const travou = !encerrar && novosNaJanela === 0;

  return {
    novos,
    novosNaJanela,
    encerrar,
    travou,
    motivo: travou
      ? 'a paginação do extrato não avançou: a página veio cheia e não trouxe nenhum lançamento novo dentro da janela pedida — o gateway do Santander não está respeitando o `_offset`'
      : null,
  };
}

module.exports = { chaveItem, dentroDaJanela, avaliarPagina };
