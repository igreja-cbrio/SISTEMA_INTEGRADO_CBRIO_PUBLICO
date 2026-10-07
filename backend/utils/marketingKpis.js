'use strict';




const L = require('./marketingLinha');

const DIA_MS = 86400000;
const diasEntre = (depois, antes) =>
  Math.round((Date.parse(depois + 'T00:00:00Z') - Date.parse(antes + 'T00:00:00Z')) / DIA_MS);









function prazoNoAlvo(cards = []) {
  const lista = (cards || []).filter(Boolean);
  if (!lista.length) return { valor: null, observacao: 'Sem cards entregues no período' };
  let comPrazo = 0;
  let noPrazo = 0;
  for (const c of lista) {
    const alvo = L.prazoDoCard(c);
    if (!alvo) continue;
    comPrazo++;
    const entrega = L.dataSP(c.entregue_em);
    if (entrega && entrega <= alvo) noPrazo++;
  }
  const semPrazo = lista.length - comPrazo;
  if (!comPrazo) {
    return { valor: null, observacao: `${semPrazo} card(s) entregue(s), nenhum com prazo — sem medição` };
  }
  return {
    valor: Math.round((noPrazo / comPrazo) * 100),
    observacao: `${noPrazo} de ${comPrazo} entregues no prazo${semPrazo ? ` · ${semPrazo} sem prazo ficaram fora da conta` : ''}`,
  };
}








function leadDosPedidos(cards = [], inicioDoPedido = () => null) {
  const pedidos = (cards || []).filter(c => c && L.frenteDoCard(c) === 'sis');
  if (!pedidos.length) return { valor: null, observacao: 'Nenhum pedido entregue no período' };
  const dias = [];
  let semData = 0;
  for (const c of pedidos) {
    const ini = L.dataSP(inicioDoPedido(c));
    const fim = L.dataSP(c.entregue_em);
    if (!ini || !fim) { semData++; continue; }
    dias.push(Math.max(0, diasEntre(fim, ini)));
  }
  if (!dias.length) {
    return { valor: null, observacao: `${semData} pedido(s) entregue(s) sem a data do pedido — sem medição` };
  }
  const media = Math.round((dias.reduce((a, n) => a + n, 0) / dias.length) * 10) / 10;
  return {
    valor: media,
    observacao: `${dias.length} pedido(s) · média de ${media} dias do pedido à entrega${semData ? ` · ${semData} sem a data do pedido ficaram fora` : ''}`,
  };
}

module.exports = { prazoNoAlvo, leadDosPedidos };
