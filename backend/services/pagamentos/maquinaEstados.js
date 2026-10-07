











const { STATUS, STATUS_ABERTOS, STATUS_TERMINAIS, STATUS_COM_DINHEIRO, TRANSICOES } = require('./tipos');










function aplicarTransicao(atual, novo) {
  if (!atual || !novo) {
    return { ok: false, motivo: 'status ausente' };
  }
  if (atual === novo) {

    return { ok: true, noop: true };
  }
  const permitidas = TRANSICOES[atual];
  if (!permitidas) {
    return { ok: false, motivo: `status atual desconhecido: ${atual}` };
  }
  if (!TRANSICOES[novo]) {
    return { ok: false, motivo: `status destino desconhecido: ${novo}` };
  }
  if (!permitidas.includes(novo)) {
    return { ok: false, motivo: `transicao nao permitida: ${atual} -> ${novo}` };
  }
  return { ok: true };
}


function estaAberta(status) {
  return STATUS_ABERTOS.includes(status);
}


function estaTerminal(status) {
  return STATUS_TERMINAIS.includes(status);
}


function temDinheiro(status) {
  return STATUS_COM_DINHEIRO.includes(status);
}








function podeExpirar(cobranca) {
  if (!cobranca) return false;
  if (!estaAberta(cobranca.status)) return false;
  if (Number(cobranca.valor_pago_centavos || 0) > 0) return false;
  if (!cobranca.expira_em) return false;
  return new Date(cobranca.expira_em).getTime() <= Date.now();
}








function statusPorValor({ valor_centavos, valor_pago_centavos }) {
  const total = Number(valor_centavos || 0);
  const pago = Number(valor_pago_centavos || 0);
  if (pago <= 0) return null;
  if (pago >= total - 1) return STATUS.PAGO;
  return STATUS.PAGO_PARCIAL;
}

module.exports = {
  aplicarTransicao,
  estaAberta,
  estaTerminal,
  temDinheiro,
  podeExpirar,
  statusPorValor,
};
