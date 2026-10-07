












































const crypto = require('crypto');
const { STATUS, METODOS } = require('../tipos');
const { resilientFetch } = require('../../../utils/resilientFetch');

const nome = 'asaas';

const BASE_PROD = 'https://api.asaas.com/v3';
const BASE_SANDBOX = 'https://api-sandbox.asaas.com/v3';

const capacidades = Object.freeze({


  metodos: [METODOS.PIX, METODOS.CARTAO, METODOS.BOLETO],
  parcelas_max: 21,
  webhook: true,
  estorno: true,
  consulta_status: true,
});












function ehProducao() {
  if (process.env.VERCEL_ENV) return process.env.VERCEL_ENV === 'production';
  return process.env.NODE_ENV === 'production';
}

function apiKey() {
  const k = process.env.ASAAS_API_KEY;
  if (!k) throw new Error('ASAAS_API_KEY não configurada');



  const sandbox = k.startsWith('$aact_hmlg_');
  const producao = k.startsWith('$aact_prod_');
  const ambiente = process.env.VERCEL_ENV || process.env.NODE_ENV || 'desconhecido';
  if (ehProducao() && sandbox) {
    throw new Error(`ASAAS_API_KEY é de SANDBOX ($aact_hmlg_) mas o ambiente é PRODUÇÃO (${ambiente}) — nada seria cobrado de verdade.`);
  }
  if (!ehProducao() && producao) {
    throw new Error(`ASAAS_API_KEY é de PRODUÇÃO ($aact_prod_) fora de produção (${ambiente}) — um teste cobraria dinheiro real.`);
  }
  return k;
}

function baseUrl() {
  return process.env.ASAAS_BASE_URL || (ehProducao() ? BASE_PROD : BASE_SANDBOX);
}





function paraReais(centavos) {
  return Number((Math.round(Number(centavos) || 0) / 100).toFixed(2));
}

function paraCentavos(reais) {
  if (reais === null || reais === undefined || reais === '') return null;
  return Math.round(Number(reais) * 100);
}



async function req(metodo, caminho, corpo) {
  const resp = await resilientFetch(`${baseUrl()}${caminho}`, {
    method: metodo,
    headers: {
      'Content-Type': 'application/json',

      'User-Agent': `CBRio-ERP/1.0 (Node.js; ${ehProducao() ? 'producao' : 'sandbox'})`,
      access_token: apiKey(),
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  }, {
    dependency: 'Asaas',
    timeoutMs: 8_000,
    maxRetries: 1,
  });

  const texto = await resp.text();
  let json = null;
  try { json = texto ? JSON.parse(texto) : null; } catch {                         }

  if (!resp.ok) {

    const desc = json?.errors?.map((e) => e.description).filter(Boolean).join(' · ')
      || json?.message || texto?.slice(0, 300) || `HTTP ${resp.status}`;
    const err = new Error(`Asaas ${metodo} ${caminho}: ${desc}`);
    err.status = resp.status;
    err.asaasErrors = json?.errors || null;
    throw err;
  }
  return json;
}



async function acharOuCriarCliente({ nome: nomePagador, cpf, email, telefone }) {
  const doc = String(cpf || '').replace(/\D/g, '');

  if (doc) {

    const busca = await req('GET', `/customers?cpfCnpj=${encodeURIComponent(doc)}&limit=1`);
    const achado = busca?.data?.[0];
    if (achado?.id) return achado.id;
  }

  const criado = await req('POST', '/customers', {
    name: nomePagador || 'Inscrito',
    cpfCnpj: doc || undefined,
    email: email || undefined,
    mobilePhone: String(telefone || '').replace(/\D/g, '') || undefined,
    notificationDisabled: true,
  });
  if (!criado?.id) throw new Error('Asaas não devolveu id do cliente');
  return criado.id;
}



function ymd(d) {
  const dt = d instanceof Date ? d : new Date(d);
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${dt.getFullYear()}-${mm}-${dd}`;
}















async function buscarPixQrCode(paymentId) {
  if (!paymentId) return null;
  try {
    const qr = await req('GET', `/payments/${encodeURIComponent(paymentId)}/pixQrCode`);

    if (!qr || qr.success === false) return null;
    return {
      payload: qr.payload || null,
      base64: qr.encodedImage || null,
    };
  } catch (e) {

    console.warn(`[asaas] QR do Pix indisponível para ${paymentId}: ${e.message}`);
    return null;
  }
}

async function criarCobranca(dados) {
  const clienteId = dados.provider_cliente_id || await acharOuCriarCliente({
    nome: dados.pagador_nome, cpf: dados.pagador_cpf,
    email: dados.pagador_email, telefone: dados.pagador_telefone,
  });




  const venc = dados.vencimento
    || (dados.expira_em ? ymd(dados.expira_em) : ymd(new Date(Date.now() + 86400000)));

  const corpo = {
    customer: clienteId,

    billingType: 'UNDEFINED',
    value: paraReais(dados.valor_centavos),
    dueDate: venc,
    description: (dados.descricao || 'Inscrição CBRio').slice(0, 500),


    externalReference: dados.referencia || dados.id || undefined,
  };
















  const p = await req('POST', '/payments', corpo);




  const pix = await buscarPixQrCode(p.id);

  return {
    provider_cobranca_id: p.id,
    provider_cliente_id: clienteId,

    status: STATUS.AGUARDANDO,
    checkout_url: p.invoiceUrl || null,
    pix_payload: pix?.payload || null,
    pix_qrcode_base64: pix?.base64 || null,
    boleto_linha_digitavel: p.identificationField || null,
    boleto_url: p.bankSlipUrl || null,
    vencimento: p.dueDate || venc,
    metodo: null,
    bruto: p,
  };
}





















const BILLING_POR_METODO = {
  [METODOS.PIX]: 'PIX',
  [METODOS.CARTAO]: 'CREDIT_CARD',
  [METODOS.BOLETO]: 'BOLETO',
};

async function definirMetodo(cobranca, metodo, opcoes = {}) {
  const billing = BILLING_POR_METODO[metodo];
  if (!billing) throw new Error(`Asaas não cobra por "${metodo}"`);
  if (!cobranca.provider_cobranca_id) throw new Error('Cobrança sem id no Asaas');




  const parcelas = metodo === METODOS.CARTAO && Number(opcoes.parcelas) > 1
    ? Math.min(Math.floor(Number(opcoes.parcelas)), capacidades.parcelas_max)
    : null;

  const id = encodeURIComponent(cobranca.provider_cobranca_id);
  const atual = await req('GET', `/payments/${id}`);



  const jaTemParcelas = Number(atual?.installmentCount) || null;
  const precisaTrocarForma = atual?.billingType !== billing;
  const precisaTrocarParcelas = (parcelas || null) !== jaTemParcelas;

  let p = atual;
  if (precisaTrocarForma || precisaTrocarParcelas) {
    const corpo = { billingType: billing, dueDate: atual.dueDate };
    if (parcelas) {


      corpo.installmentCount = parcelas;
      corpo.totalValue = paraReais(cobranca.valor_centavos);
    } else {



      corpo.value = paraReais(cobranca.valor_centavos);
      corpo.installmentCount = null;
    }
    p = await req('PUT', `/payments/${id}`, corpo);
  }







  const confirmado = metodoDeBillingType(p.billingType);
  if (confirmado !== metodo) {
    throw new Error(
      `O Asaas não habilitou ${metodo} nesta cobrança (segue como ${confirmado || p.billingType || 'indefinida'}). `
      + 'Verifique se a forma está ativa na conta.',
    );
  }

  const saida = {
    metodo: confirmado,


    parcelas: Number(p.installmentCount) || 1,
    checkout_url: p.invoiceUrl || atual.invoiceUrl || null,
    pix_payload: null,
    pix_qrcode_base64: null,
    boleto_linha_digitavel: p.identificationField || null,
    boleto_url: p.bankSlipUrl || null,
  };

  if (metodo === METODOS.PIX) {


    const qr = await req('GET', `/payments/${id}/pixQrCode`);
    if (qr && qr.success !== false) {
      saida.pix_payload = qr.payload || null;
      saida.pix_qrcode_base64 = qr.encodedImage || null;
    }
  }

  if (metodo === METODOS.BOLETO && !saida.boleto_linha_digitavel) {

    try {
      const linha = await req('GET', `/payments/${id}/identificationField`);
      saida.boleto_linha_digitavel = linha?.identificationField || null;
      saida.boleto_url = saida.boleto_url || linha?.bankSlipUrl || null;
    } catch (e) {
      console.warn(`[asaas] linha digitável indisponível para ${cobranca.provider_cobranca_id}: ${e.message}`);
    }
  }

  return saida;
}



async function consultarStatus(cobranca) {
  if (!cobranca.provider_cobranca_id) return null;
  const p = await req('GET', `/payments/${encodeURIComponent(cobranca.provider_cobranca_id)}`);
  if (!p) return null;

  const st = statusDePagamento(p.status);
  const pago = st === STATUS.PAGO;

  return {
    status: st,


    valor_pago_centavos: pago ? paraCentavos(p.value) : 0,
    liquido_centavos: pago ? paraCentavos(p.netValue) : null,
    taxa_centavos: pago ? taxaCentavos(p) : null,
    metodo: metodoDeBillingType(p.billingType),
    parcelas: p.installmentCount || null,
    provider_pagamento_id: p.id,
    repassado_em: p.creditDate || null,
    cartao_brand: p.creditCard?.creditCardBrand || null,
    cartao_last4: last4(p.creditCard),



    quita_cobranca: pago && !!p.installment && p.billingType === 'CREDIT_CARD',
    bruto: p,
  };
}

async function cancelarCobranca(cobranca) {
  if (!cobranca.provider_cobranca_id) return { ok: true };
  await req('DELETE', `/payments/${encodeURIComponent(cobranca.provider_cobranca_id)}`);
  return { ok: true };
}

async function estornar(cobranca, { valor_centavos } = {}) {
  const corpo = {};
  if (Number(valor_centavos) > 0 && Number(valor_centavos) < cobranca.valor_pago_centavos) {
    corpo.value = paraReais(valor_centavos);
  }
  const r = await req('POST', `/payments/${encodeURIComponent(cobranca.provider_cobranca_id)}/refund`, corpo);
  return { ok: true, provider_pagamento_id: r?.id || null, bruto: r };
}









function verificarAssinatura(_rawBody, headers, segredo) {
  if (!segredo) {


    return { ok: false, motivo: 'ASAAS_WEBHOOK_SECRET não configurado' };
  }
  const recebido = headers?.['asaas-access-token'] || headers?.['Asaas-Access-Token'];
  if (!recebido) return { ok: false, motivo: 'header asaas-access-token ausente' };

  const a = Buffer.from(String(recebido));
  const b = Buffer.from(String(segredo));


  if (a.length !== b.length) return { ok: false, motivo: 'token divergente' };
  if (!crypto.timingSafeEqual(a, b)) return { ok: false, motivo: 'token divergente' };
  return { ok: true };
}

const METODO_POR_BILLING = {
  PIX: METODOS.PIX,
  BOLETO: METODOS.BOLETO,
  CREDIT_CARD: METODOS.CARTAO,
  DEBIT_CARD: METODOS.CARTAO,
  TRANSFER: METODOS.TRANSFERENCIA,
  UNDEFINED: null,
};
function metodoDeBillingType(bt) {
  return METODO_POR_BILLING[bt] || null;
}


const STATUS_POR_PAYMENT = {
  PENDING: STATUS.AGUARDANDO,
  AWAITING_RISK_ANALYSIS: STATUS.AGUARDANDO,


  OVERDUE: STATUS.AGUARDANDO,
  CONFIRMED: STATUS.PAGO,
  RECEIVED: STATUS.PAGO,
  RECEIVED_IN_CASH: STATUS.PAGO,
  REFUNDED: STATUS.ESTORNADO,
  REFUND_REQUESTED: STATUS.PAGO,
  PARTIALLY_REFUNDED: STATUS.ESTORNADO_PARCIAL,
  CHARGEBACK_REQUESTED: STATUS.CHARGEBACK,
  CHARGEBACK_DISPUTE: STATUS.CHARGEBACK,
  AWAITING_CHARGEBACK_REVERSAL: STATUS.CHARGEBACK,
  DUNNING_REQUESTED: STATUS.AGUARDANDO,
  DUNNING_RECEIVED: STATUS.PAGO,
  AWAITING_CASH_PAYMENT: STATUS.AGUARDANDO,
  DELETED: STATUS.CANCELADA,
};
function statusDePagamento(s) {
  return STATUS_POR_PAYMENT[s] || null;
}


const STATUS_POR_EVENTO = {
  PAYMENT_CREATED: STATUS.AGUARDANDO,
  PAYMENT_AWAITING_RISK_ANALYSIS: STATUS.AGUARDANDO,
  PAYMENT_UPDATED: null,
  PAYMENT_AWAITING_CHARGEBACK_REVERSAL: STATUS.CHARGEBACK,


  PAYMENT_CONFIRMED: STATUS.PAGO,


  PAYMENT_RECEIVED: STATUS.PAGO,
  PAYMENT_RECEIVED_IN_CASH: STATUS.PAGO,
  PAYMENT_ANTICIPATED: STATUS.PAGO,


  PAYMENT_OVERDUE: null,

  PAYMENT_REPROVED_BY_RISK_ANALYSIS: STATUS.FALHOU,
  PAYMENT_CREDIT_CARD_CAPTURE_REFUSED: STATUS.FALHOU,
  PAYMENT_DELETED: STATUS.CANCELADA,
  PAYMENT_RESTORED: STATUS.AGUARDANDO,

  PAYMENT_REFUNDED: STATUS.ESTORNADO,
  PAYMENT_PARTIALLY_REFUNDED: STATUS.ESTORNADO_PARCIAL,
  PAYMENT_REFUND_IN_PROGRESS: null,
  PAYMENT_REFUND_DENIED: null,
  PAYMENT_CHARGEBACK_REQUESTED: STATUS.CHARGEBACK,
  PAYMENT_CHARGEBACK_DISPUTE: STATUS.CHARGEBACK,
};


const EVENTOS_COM_DINHEIRO = new Set([
  'PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED', 'PAYMENT_RECEIVED_IN_CASH',
  'PAYMENT_ANTICIPATED', 'PAYMENT_REFUNDED', 'PAYMENT_PARTIALLY_REFUNDED',
  'PAYMENT_CHARGEBACK_REQUESTED',
]);






function taxaCentavos(p) {
  const bruto = paraCentavos(p.value);
  const liquido = paraCentavos(p.netValue);
  if (bruto == null || liquido == null) return null;
  return Math.max(0, bruto - liquido);
}

function last4(cc) {
  if (!cc) return null;
  const n = String(cc.creditCardNumber || '').replace(/\D/g, '');
  return n.length >= 4 ? n.slice(-4) : null;
}

function normalizarEvento(payload) {
  const p = payload?.payment;
  if (!payload?.event || !p) return null;

  const tipo = String(payload.event);
  const status = STATUS_POR_EVENTO[tipo];
  const comDinheiro = EVENTOS_COM_DINHEIRO.has(tipo);

  return {




    evento_id: payload.id || `${tipo}:${p.id}`,
    tipo,
    provider_cobranca_id: p.id,


    provider_installment_id: p.installment || null,
    referencia: p.externalReference || null,
    status: status === undefined ? null : status,

    valor_pago_centavos: comDinheiro ? paraCentavos(p.value) : 0,
    liquido_centavos: comDinheiro ? paraCentavos(p.netValue) : null,
    taxa_centavos: comDinheiro ? taxaCentavos(p) : null,

    metodo: metodoDeBillingType(p.billingType),
    parcelas: p.installmentCount || null,
    parcela_numero: p.installmentNumber || null,

    provider_pagamento_id: p.id,
    e2e_id: p.pixTransaction?.endToEndIdentifier || p.pixTransaction || null,


    repassado_em: p.creditDate || null,

    cartao_brand: p.creditCard?.creditCardBrand || null,
    cartao_last4: last4(p.creditCard),




    quita_cobranca: !!p.installment && p.billingType === 'CREDIT_CARD'
      && (tipo === 'PAYMENT_CONFIRMED' || tipo === 'PAYMENT_RECEIVED'),
  };
}















async function verificarChave() {
  const t0 = Date.now();
  await req('GET', '/customers?limit=1');
  return { ok: true, latencia_ms: Date.now() - t0 };
}

module.exports = {
  nome,
  capacidades,
  criarCobranca,
  definirMetodo,
  consultarStatus,
  cancelarCobranca,
  estornar,
  verificarAssinatura,
  normalizarEvento,
  verificarChave,

  _internos: {
    paraReais, paraCentavos, taxaCentavos, last4,
    statusDePagamento, metodoDeBillingType, buscarPixQrCode, BILLING_POR_METODO,
    STATUS_POR_EVENTO, EVENTOS_COM_DINHEIRO, BASE_PROD, BASE_SANDBOX,
  },
};
