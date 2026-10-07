'use strict';























const { tarefaAberta } = require('./marketingLinha');

const aberta = (card, itensPorCard) =>
  tarefaAberta({ estado: card.estado, papel: 'lider', itens: itensPorCard[card.id] || [] });



function abertasPorCiclo({
  cards = [], tarefasLegado = [], cardDaTarefa = {}, itensPorCard = {},
  tarefaFeita = () => false,
} = {}) {
  const out = {};
  const somar = (ev, ehAberta) => { out[ev] = (out[ev] || 0) + (ehAberta ? 1 : 0); };
  const comCardNovo = new Set();
  for (const c of cards || []) {
    if (!c || !c.event_id || c.deleted_at) continue;
    comCardNovo.add(c.event_id);
    somar(c.event_id, aberta(c, itensPorCard));
  }
  for (const t of tarefasLegado || []) {
    if (!t || !t.event_id || comCardNovo.has(t.event_id)) continue;
    const c = cardDaTarefa[t.id];
    somar(t.event_id, c ? aberta(c, itensPorCard) : !tarefaFeita(t.status));
  }
  return out;
}

module.exports = { abertasPorCiclo };
