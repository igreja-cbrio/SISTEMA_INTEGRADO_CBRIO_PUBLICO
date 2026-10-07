'use strict';













const numero = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const unidade = (u) => (u === 'dias' ? 'dias' : 'horas');

function esforcoMudou(antigo, novo) {
  if (!antigo || !novo) return false;
  return numero(antigo.esforco_valor) !== numero(novo.esforco_valor)
    || unidade(antigo.esforco_unidade) !== unidade(novo.esforco_unidade);
}




function segueOPadrao(item, antigo) {
  const v = numero(item.esforco_valor);
  if (v === 0) return true;
  return v === numero(antigo.esforco_valor) && unidade(item.esforco_unidade) === unidade(antigo.esforco_unidade);
}




function categoriaCasa(card, antigo, categoriasComListaPropria) {
  if (antigo.category_id) return card.category_id === antigo.category_id;
  return !categoriasComListaPropria.has(card.category_id);
}

function alvosDaPropagacao({ antigo, novo, cards = [], itens = [], categoriasComListaPropria = new Set() }) {
  if (!esforcoMudou(antigo, novo)) return [];


  if (!(numero(novo.esforco_valor) > 0)) return [];
  const cardsOk = new Set(cards
    .filter(c => c && c.estado !== 'concluido')
    .filter(c => !antigo.culto || c.culto === antigo.culto)
    .filter(c => categoriaCasa(c, antigo, categoriasComListaPropria))
    .map(c => c.id));
  return itens
    .filter(i => i && cardsOk.has(i.card_id) && !i.feito)
    .filter(i => i.grupo === antigo.nome_fase && i.texto === antigo.texto)
    .filter(i => segueOPadrao(i, antigo))
    .map(i => i.id);
}

module.exports = { esforcoMudou, segueOPadrao, categoriaCasa, alvosDaPropagacao };
