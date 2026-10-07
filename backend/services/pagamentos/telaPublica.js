

















const pagamentos = require('./index');







function estadoBasePagamento(cobranca) {
  const ofertados = Array.isArray(cobranca.metodos_ofertados) ? cobranca.metodos_ofertados : [];
  return {
    status: cobranca.status,
    pago: cobranca.status === 'pago',
    valor_centavos: cobranca.valor_centavos,
    valor_pago_centavos: cobranca.valor_pago_centavos,
    metodo: cobranca.metodo || null,
    parcelas: cobranca.parcelas_total || null,


    metodos: ofertados,
    parcelas_max: cobranca.parcelas_max || null,
    checkout_url: cobranca.checkout_url || null,
    pix_payload: cobranca.pix_payload || null,
    boleto_linha_digitavel: cobranca.boleto_linha_digitavel || null,
    boleto_url: cobranca.boleto_url || null,
    expira_em: cobranca.expira_em || null,
    pago_em: cobranca.pago_em || null,






    cartao_na_pagina: !!(
      cobranca.status !== 'pago'
      && ofertados.includes('cartao')
      && pagamentos.capacidades(cobranca.provider)?.tokenizacao
      && pagamentos.chavePublica(cobranca.provider)
    ),
    cartao_public_key: (
      cobranca.status !== 'pago'
      && ofertados.includes('cartao')
      && pagamentos.capacidades(cobranca.provider)?.tokenizacao
    ) ? pagamentos.chavePublica(cobranca.provider) : null,
  };
}























function tetoParcelas(cobranca) {
  if (Number(cobranca.parcelas_max) > 0) return Number(cobranca.parcelas_max);
  return 1;
}



























function decidirForma(cobranca, { metodo: metodoBruto, parcelas: parcelasBrutas } = {}, tetoEfetivo = 1) {
  const metodo = String(metodoBruto || '').trim();
  const ofertados = Array.isArray(cobranca.metodos_ofertados) ? cobranca.metodos_ofertados : [];




  if (ofertados.length && !ofertados.includes(metodo)) {
    return { acao: 'recusar', status: 400, error: 'Esta forma de pagamento não está disponível.' };
  }

  if (cobranca.status === 'pago') return { acao: 'ja_pago', status: 200 };








  const pedidas = Math.floor(Number(parcelasBrutas) || 1);
  const teto = Number(tetoEfetivo) > 0 ? Number(tetoEfetivo) : 1;
  const parcelas = metodo === 'cartao' && pedidas > 1 ? Math.min(pedidas, teto) : 1;

  return { acao: 'aplicar', metodo, parcelas };
}







async function escolherFormaPagamento(cobranca, pedido = {}, deps = {}) {
  const definirMetodo = deps.definirMetodo || pagamentos.definirMetodo;
  const d = decidirForma(cobranca, pedido, tetoParcelas(cobranca));
  if (d.acao === 'recusar') return { cobranca, status: d.status, error: d.error };
  if (d.acao === 'ja_pago') return { cobranca, status: 200 };
  const { metodo, parcelas } = d;

  try {
    const r = await definirMetodo(cobranca, metodo, { parcelas });



    if (r.alterada === false) {
      return {
        cobranca: r.cobranca,
        status: 409,
        error: 'Esta cobrança não aceita mais troca de forma de pagamento.',
      };
    }
    return { cobranca: r.cobranca, status: 200 };
  } catch (e) {
    console.error('[pagamentos/telaPublica] definir forma:', e.message);


    return {
      cobranca,
      status: 502,
      error: 'Não conseguimos preparar esta forma de pagamento agora.',
    };
  }
}









const PARADA_MS = 120000;

async function sincronizarSeParada(cobranca, deps = {}) {
  const sincronizar = deps.sincronizar || pagamentos.sincronizar;
  const abertos = ['criada', 'aguardando_pagamento'];
  if (!abertos.includes(cobranca.status)) return cobranca;
  const paradaHa = Date.now() - new Date(cobranca.updated_at).getTime();
  if (!(paradaHa > PARADA_MS)) return cobranca;
  try {
    const r = await sincronizar(cobranca);
    return r?.cobranca || cobranca;
  } catch (e) {
    console.error('[pagamentos/telaPublica] sincronizar:', e.message);
    return cobranca;
  }
}

module.exports = {
  estadoBasePagamento,
  decidirForma,
  escolherFormaPagamento,
  sincronizarSeParada,
  tetoParcelas,
  PARADA_MS,
};
