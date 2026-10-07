













const { STATUS } = require('../tipos');

const nome = 'manual';




const capacidades = Object.freeze({
  metodos: ['dinheiro', 'transferencia', 'pix'],
  parcelas_max: 1,
  webhook: false,
  estorno: false,
  consulta_status: false,
});





async function criarCobranca(dados) {
  return {
    provider_cobranca_id: null,
    status: STATUS.AGUARDANDO,
    checkout_url: null,
    pix_payload: null,
    pix_qrcode_base64: null,
    boleto_linha_digitavel: null,
    boleto_url: null,
    metodo: dados.metodo || null,
    bruto: { manual: true },
  };
}


async function consultarStatus() {
  return null;
}

async function cancelarCobranca() {
  return { ok: true };
}

async function estornar() {
  throw new Error('Provider manual não estorna — devolução em espécie é ato de tesouraria, registre à mão.');
}


function verificarAssinatura() {
  return { ok: false, motivo: 'provider manual não recebe webhook' };
}

function normalizarEvento() {
  return null;
}

module.exports = {
  nome,
  capacidades,
  criarCobranca,
  consultarStatus,
  cancelarCobranca,
  estornar,
  verificarAssinatura,
  normalizarEvento,
};
