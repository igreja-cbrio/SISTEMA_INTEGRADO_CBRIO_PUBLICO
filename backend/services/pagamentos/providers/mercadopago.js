











































































const crypto = require('crypto');
const { STATUS, METODOS } = require('../tipos');
const { resilientFetch } = require('../../../utils/resilientFetch');

const nome = 'mercadopago';

const BASE = 'https://api.mercadopago.com';


const capacidades = Object.freeze({
  metodos: [METODOS.PIX, METODOS.CARTAO],
  parcelas_max: 36,




  tokenizacao: true,
  webhook: true,
  estorno: true,
  consulta_status: true,
});












function ambienteDeclarado() {
  const env = String(process.env.MERCADOPAGO_AMBIENTE || '').trim().toLowerCase();
  if (env === 'producao' || env === 'production') return 'producao';
  if (env === 'teste' || env === 'test' || env === 'sandbox') return 'teste';
  const vercel = process.env.VERCEL_ENV;
  if (vercel) return vercel === 'production' ? 'producao' : 'teste';
  return process.env.NODE_ENV === 'production' ? 'producao' : 'teste';
}

function ehProducao() {
  return ambienteDeclarado() === 'producao';
}

function accessToken() {
  const t = (process.env.MERCADOPAGO_ACCESS_TOKEN || '').trim();
  if (!t) {
    throw new Error(
      'MERCADOPAGO_ACCESS_TOKEN não configurado — o provider mercadopago não '
      + 'consegue cobrar. (Sem a env, mantenha PAG_PROVIDER_PADRAO=manual.)',
    );
  }
  conferirConta(t);
  return t;
}























function conferirConta(token) {
  const esperada = String(process.env.MERCADOPAGO_CONTA_ID || '').replace(/\D/g, '');
  if (!esperada) return;






  if (String(token).startsWith('TEST-')) return;
  const partes = String(token).split('-');
  const daChave = String(partes[partes.length - 1] || '').replace(/\D/g, '');
  if (!daChave) return;
  if (daChave === esperada) return;
  throw new Error(
    'Mercado Pago: o Access Token é da conta ' + daChave + ', mas este ambiente '
    + 'está declarado para a conta ' + esperada + ' (MERCADOPAGO_CONTA_ID). '
    + '⚠️ Credencial da conta REAL num ambiente de ensaio cobraria dinheiro de '
    + 'verdade — troque a chave ou o escopo da env antes de seguir.',
  );
}













function conferirLiveMode(payload, contexto = 'resposta') {
  if (!payload || typeof payload !== 'object') return;
  const live = payload.live_mode;
  if (typeof live !== 'boolean') return;
  const producao = ehProducao();
  if (live === producao) return;
  throw new Error(
    `Mercado Pago: ambiente declarado é "${ambienteDeclarado()}" mas a ${contexto} veio com `
    + `live_mode=${live}. ${producao
      ? 'O token configurado é de TESTE em produção — ninguém pagaria de verdade.'
      : 'O token configurado é de PRODUÇÃO fora de produção — isto cobraria dinheiro real.'}`,
  );
}




function paraReais(centavos) {
  return (Number(centavos) / 100).toFixed(2);
}













function paraReaisNumero(centavos) {
  return Number(paraReais(centavos));
}

function paraCentavos(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  return Math.round(Number(valor) * 100);
}

















const REF_MAX = 64;

function refExterna(referencia, fallbackId) {
  const cru = String(referencia || fallbackId || '');
  const limpo = cru.replace(/:/g, '_').replace(/[^A-Za-z0-9_-]/g, '-');
  if (limpo.length <= REF_MAX) return limpo;




  console.warn(`[mercadopago] external_reference acima de ${REF_MAX} — truncando: ${limpo}`);
  return limpo.slice(-REF_MAX);
}


function refDoExterno(externa) {
  if (!externa) return null;
  return String(externa).replace(/_/g, ':');
}



async function req(metodo, caminho, corpo, { idempotencyKey } = {}) {
  const headers = {
    Authorization: `Bearer ${accessToken()}`,
    'Content-Type': 'application/json',
    accept: 'application/json',
  };


  if (idempotencyKey) headers['X-Idempotency-Key'] = String(idempotencyKey).slice(0, 64);

  const r = await resilientFetch(`${BASE}${caminho}`, {
    method: metodo,
    headers,
    body: corpo ? JSON.stringify(corpo) : undefined,
  }, {
    dependency: 'Mercado Pago',
    timeoutMs: 8_000,
    maxRetries: 1,
  });

  const txt = await r.text();
  let json = null;
  try { json = txt ? JSON.parse(txt) : null; } catch {                         }

  if (!r.ok) {
    const detalhe = json?.message || json?.error || txt.slice(0, 300) || `HTTP ${r.status}`;








    const par = /live credentials|invalid.*(public.?key|token)/i.test(String(detalhe));




    const emailSandbox = /invalid_email_for_sandbox|@testuser\.com/i.test(String(detalhe));
    const err = new Error(
      `Mercado Pago ${metodo} ${caminho} falhou (${r.status}): ${detalhe}`
      + (par && r.status === 401
        ? ' · ⚠️ MERCADOPAGO_PUBLIC_KEY e MERCADOPAGO_ACCESS_TOKEN precisam ser da'
          + ' MESMA aplicação/conta — confira se os dois foram trocados juntos.'
        : '')
      + (emailSandbox
        ? ' · ⚠️ REGRA SÓ DE SANDBOX: em conta de teste o e-mail do pagador tem'
          + ' que terminar em @testuser.com. Isto NÃO vale em produção — não'
          + ' mexa no código por causa disto, use um e-mail de teste na inscrição.'
        : ''),
    );
    err.status = r.status;
    err.corpo = json;
    throw err;
  }

  conferirLiveMode(json);
  return json;
}






const STATUS_POR_ORDER = {
  created: STATUS.CRIADA,
  action_required: STATUS.AGUARDANDO,
  processing: STATUS.AGUARDANDO,
  in_review: STATUS.AGUARDANDO,
  processed: STATUS.PAGO,
  refunded: STATUS.ESTORNADO,
  charged_back: STATUS.CHARGEBACK,
  expired: STATUS.EXPIRADA,
  canceled: STATUS.CANCELADA,
  cancelled: STATUS.CANCELADA,
















  failed: null,
};


const STATUS_POR_PAYMENT = {
  pending: STATUS.AGUARDANDO,
  in_process: STATUS.AGUARDANDO,
  authorized: STATUS.AGUARDANDO,
  approved: STATUS.PAGO,
  refunded: STATUS.ESTORNADO,
  charged_back: STATUS.CHARGEBACK,
  cancelled: STATUS.CANCELADA,
  canceled: STATUS.CANCELADA,
















  rejected: null,
};






function statusCanonico(status, detalhe, mapa) {
  if (String(detalhe || '') === 'partially_refunded') return STATUS.ESTORNADO_PARCIAL;
  return mapa[String(status || '').toLowerCase()] || null;
}

const METODO_POR_MP = {
  pix: METODOS.PIX,
  bank_transfer: METODOS.PIX,
  boleto: METODOS.BOLETO,
  bolbradesco: METODOS.BOLETO,
  ticket: METODOS.BOLETO,
  credit_card: METODOS.CARTAO,
  debit_card: METODOS.CARTAO,
};

function metodoDeMp(idOuTipo) {
  return METODO_POR_MP[String(idOuTipo || '').toLowerCase()] || null;
}



function urlBase() {
  const raw = process.env.FRONTEND_URL || process.env.VERCEL_URL || '';
  const u = raw.startsWith('http') ? raw : (raw ? `https://${raw}` : '');


  if (!u || /localhost|127\.0\.0\.1|0\.0\.0\.0|:\/\/10\.|:\/\/192\.168\./.test(u)) {
    return 'https://cbrio.org';
  }
  return u.replace(/\/$/, '');
}

function payerDaCobranca(c) {
  const payer = { email: c.pagador_email || (process.env.CBRIO_PRIVATE_87A117B9302C || 'unconfigured@example.invalid') };
  const nomeCompleto = String(c.pagador_nome || '').trim();
  if (nomeCompleto) {
    const partes = nomeCompleto.split(/\s+/);
    payer.first_name = partes[0];
    if (partes.length > 1) payer.last_name = partes.slice(1).join(' ');
  }
  const cpf = String(c.pagador_cpf || '').replace(/\D/g, '');
  if (cpf.length === 11) payer.identification = { type: 'CPF', number: cpf };
  return payer;
}

















async function criarPreference(c) {
  const base = urlBase();
  const corpo = {
    items: [{
      id: String(c.referencia || c.id),
      title: (c.descricao || 'Inscrição CBRio').slice(0, 250),
      quantity: 1,
      currency_id: 'BRL',
      unit_price: paraReaisNumero(c.valor_centavos),
    }],
    payer: payerDaCobranca(c),
    external_reference: refExterna(c.referencia, c.id),
    notification_url: `${base}/api/pagamentos-webhook/mercadopago`,
    back_urls: {
      success: `${base}/pagamento/${c.public_token}`,
      pending: `${base}/pagamento/${c.public_token}`,
      failure: `${base}/pagamento/${c.public_token}`,
    },
    auto_return: 'approved',
    statement_descriptor: 'CBRIO',
  };



  const teto = Number(c.parcelas_max) || capacidades.parcelas_max;
  corpo.payment_methods = { installments: Math.min(Math.max(teto, 1), 36) };

  if (c.expira_em) {
    corpo.expires = true;
    corpo.expiration_date_to = new Date(c.expira_em).toISOString();
  }

  const pref = await req('POST', '/checkout/preferences', corpo);



  const checkout = ehProducao() ? pref?.init_point : (pref?.sandbox_init_point || pref?.init_point);
  return { pref, checkout };
}















function ehUrlDeCheckoutHospedado(url) {
  return typeof url === 'string' && /mercadopago\.com(\.br)?\/checkout\//i.test(url);
}

async function urlCheckoutHospedado(c) {
  if (ehUrlDeCheckoutHospedado(c.checkout_url)) return c.checkout_url;





  const { checkout } = await criarPreference(c);
  return checkout || null;
}

async function criarCobranca(c) {
  const { pref, checkout } = await criarPreference(c);

  return {
    provider_cobranca_id: pref?.id ? String(pref.id) : null,
    status: STATUS.AGUARDANDO,
    checkout_url: checkout || null,

    pix_payload: null,
    pix_qrcode_base64: null,
    boleto_linha_digitavel: null,
    boleto_url: null,
    metodo: null,
    bruto: pref,
  };
}



function ehOrderId(id) {
  return /^ORD/i.test(String(id || ''));
}










async function definirMetodo(c, metodo, opcoes = {}) {
  if (metodo === METODOS.CARTAO) {




    return { metodo: METODOS.CARTAO, checkout_url: await urlCheckoutHospedado(c) };
  }

  if (metodo !== METODOS.PIX) {
    throw new Error(`Mercado Pago: forma "${metodo}" não é oferecida por este adapter.`);
  }











  if (c.pix_payload && ehOrderId(c.provider_cobranca_id)) {
    return {
      metodo: METODOS.PIX,
      pix_payload: c.pix_payload,
      pix_qrcode_base64: c.pix_qrcode_base64 || null,
    };
  }

  const corpo = {
    type: 'online',
    processing_mode: 'automatic',
    total_amount: paraReais(c.valor_centavos),
    external_reference: refExterna(c.referencia, c.id),
    payer: payerDaCobranca(c),
    transactions: {
      payments: [{
        amount: paraReais(c.valor_centavos),
        payment_method: { id: 'pix', type: 'bank_transfer' },
        expiration_time: expiracaoPix(c),
      }],
    },
  };



  let order;
  try {
    order = await req('POST', '/v1/orders', corpo, {
      idempotencyKey: `${c.id}:${metodo}:${opcoes.tentativa || 1}`,
    });
  } catch (e) {




    if (!ehChaveIdempotenteUsada(e)) throw e;
    order = await req('POST', '/v1/orders', corpo, {



      idempotencyKey: `${c.id}:${metodo}:r${Math.floor(Date.now() / 60000)}`,
    });
  }

  const pg = order?.transactions?.payments?.[0] || {};
  const pm = pg.payment_method || {};

  const confirmado = metodoDeMp(pm.id) || metodoDeMp(pm.type);


  if (confirmado && confirmado !== METODOS.PIX) {
    throw new Error(
      `Mercado Pago confirmou a forma "${confirmado}" para um pedido de Pix — `
      + 'a conta pode estar sem chave Pix habilitada.',
    );
  }
  if (!pm.qr_code) {
    throw new Error(
      'Mercado Pago criou a cobrança mas não devolveu o QR do Pix — confira se a '
      + 'conta tem chave Pix cadastrada no painel.',
    );
  }

  return {
    metodo: METODOS.PIX,
    provider_cobranca_id: order?.id ? String(order.id) : null,
    pix_payload: pm.qr_code,
    pix_qrcode_base64: pm.qr_code_base64 || null,





  };
}


function ehChaveIdempotenteUsada(e) {
  return e?.status === 409 && /idempotency_key_already_used/i.test(
    `${e?.message || ''} ${JSON.stringify(e?.corpo || {})}`,
  );
}







function expiracaoPix(c) {
  const MIN = 30;
  const MAX = 30 * 24 * 60;
  if (!c.expira_em) return 'PT24H';
  const minutos = Math.round((new Date(c.expira_em).getTime() - Date.now()) / 60000);
  if (!Number.isFinite(minutos)) return 'PT24H';
  return `PT${Math.min(Math.max(minutos, MIN), MAX)}M`;
}









async function consultarStatus(c) {
  const id = c.provider_cobranca_id;
  if (!id || !ehOrderId(id)) return null;

  const order = await req('GET', `/v1/orders/${encodeURIComponent(id)}`);
  return dadosDaOrder(order);
}

function dadosDaOrder(order) {
  if (!order) return null;
  const pg = order?.transactions?.payments?.[0] || {};
  const status = statusCanonico(
    pg.status || order.status,
    pg.status_detail || order.status_detail,
    STATUS_POR_ORDER,
  );
  if (!status) return null;

  const pago = paraCentavos(pg.paid_amount ?? pg.amount ?? order.total_amount);
  return {
    status,
    provider_pagamento_id: pg.id ? String(pg.id) : null,
    valor_pago_centavos: status === STATUS.PAGO || status === STATUS.PAGO_PARCIAL ? pago : null,


    taxa_centavos: null,
    liquido_centavos: null,
    repassado_em: null,
    metodo: metodoDeMp(pg.payment_method?.id) || metodoDeMp(pg.payment_method?.type) || null,
    referencia: refDoExterno(order.external_reference),
  };
}



async function cancelarCobranca(c) {
  const id = c.provider_cobranca_id;


  if (!id || !ehOrderId(id)) return { ok: true, motivo: 'sem_order_no_provider' };

  try {
    await req('POST', `/v1/orders/${encodeURIComponent(id)}/cancel`, {}, {
      idempotencyKey: `cancel:${c.id}`,
    });
    return { ok: true };
  } catch (e) {



    if (e.status === 409) return { ok: false, motivo: 'nao_cancelavel_no_provider' };
    throw e;
  }
}

async function estornar(c, { valor_centavos } = {}) {
  const id = c.provider_cobranca_id;
  if (!id || !ehOrderId(id)) {
    throw new Error('Mercado Pago: não há order no provider para estornar.');
  }



  let corpo = { transactions: [] };
  if (valor_centavos) {
    const atual = await req('GET', `/v1/orders/${encodeURIComponent(id)}`);
    const pgId = atual?.transactions?.payments?.[0]?.id;
    if (!pgId) throw new Error('Mercado Pago: order sem transação para estorno parcial.');
    corpo = { transactions: [{ id: String(pgId), amount: paraReais(valor_centavos) }] };
  }

  const r = await req('POST', `/v1/orders/${encodeURIComponent(id)}/refund`, corpo, {
    idempotencyKey: `refund:${c.id}:${valor_centavos || 'total'}`,
  });
  const refund = r?.transactions?.refunds?.[0] || {};
  return { ok: true, provider_pagamento_id: refund.id ? String(refund.id) : null };
}











function verificarAssinatura(_rawBody, headers = {}, segredo, extras = {}) {
  if (!segredo) {
    return { ok: false, motivo: 'MERCADOPAGO_WEBHOOK_SECRET não configurado' };
  }

  const assinatura = headers['x-signature'] || headers['X-Signature'];
  const requestId = headers['x-request-id'] || headers['X-Request-Id'] || '';
  if (!assinatura) return { ok: false, motivo: 'header x-signature ausente' };

  let ts = null;
  let v1 = null;
  for (const parte of String(assinatura).split(',')) {
    const [k, ...resto] = parte.split('=');
    const valor = resto.join('=').trim();
    if (k.trim() === 'ts') ts = valor;
    if (k.trim() === 'v1') v1 = valor;
  }
  if (!ts || !v1) return { ok: false, motivo: 'x-signature sem ts/v1' };



  const idCru = extras.query?.['data.id']
    ?? extras.query?.id
    ?? extras.payload?.data?.id
    ?? '';
  const id = String(idCru).toLowerCase();

  const manifesto = `id:${id};request-id:${requestId};ts:${ts};`;
  const esperado = crypto.createHmac('sha256', segredo).update(manifesto).digest('hex');

  const a = Buffer.from(esperado, 'utf8');
  const b = Buffer.from(String(v1), 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, motivo: 'assinatura não confere' };
  }
  return { ok: true };
}










async function normalizarEvento(payload, headers = {}) {
  conferirLiveMode(payload, 'notificação');

  const tipo = String(payload?.type || payload?.topic || '').toLowerCase();
  const idRecurso = payload?.data?.id ?? payload?.resource;
  if (!idRecurso) return null;



  const eventoId = payload?.id
    ? `${tipo}:${payload.id}`
    : `${tipo}:${idRecurso}:${payload?.action || ''}`;

  const comum = {
    evento_id: String(eventoId),
    tipo: String(payload?.action || tipo || 'desconhecido'),
    provider_cobranca_id: String(idRecurso),
  };

  if (tipo === 'orders' || tipo === 'order') {
    const order = await req('GET', `/v1/orders/${encodeURIComponent(idRecurso)}`);
    const d = dadosDaOrder(order);
    if (!d) return null;
    return { ...comum, ...d };
  }

  if (tipo === 'payment') {
    const p = await req('GET', `/v1/payments/${encodeURIComponent(idRecurso)}`);
    return { ...comum, ...dadosDoPayment(p) };
  }

  return null;
}







function payloadSemCartao(p) {
  if (!p || typeof p !== 'object') return null;
  const { card, ...resto } = p;
  return resto;
}

function dadosDoPayment(p) {

  if (!p) return {};
  const status = statusCanonico(p.status, p.status_detail, STATUS_POR_PAYMENT);
  const td = p.transaction_details || {};















  const bruto = paraCentavos(p.transaction_amount ?? td.total_paid_amount);
  const liquido = paraCentavos(td.net_received_amount);


  const taxa = Array.isArray(p.fee_details) && p.fee_details.length
    ? p.fee_details.reduce((s, f) => s + (paraCentavos(f.amount) || 0), 0)
    : null;

  return {
    status,
    provider_pagamento_id: p.id ? String(p.id) : null,
    valor_pago_centavos: status === STATUS.PAGO || status === STATUS.PAGO_PARCIAL ? bruto : null,
    liquido_centavos: liquido,
    taxa_centavos: taxa,


    repassado_em: p.money_release_date || null,
    metodo: metodoDeMp(p.payment_method_id) || metodoDeMp(p.payment_type_id) || null,
    parcelas: Number(p.installments) > 0 ? Number(p.installments) : null,
    cartao_brand: p.card?.brand || p.payment_method_id || null,
    cartao_last4: p.card?.last_four_digits || null,
    referencia: refDoExterno(p.external_reference),













    payload: payloadSemCartao(p),
  };
}








async function verificarChave() {
  const inicio = Date.now();
  try {
    await req('GET', '/v1/payment_methods');
    return { ok: true, status_http: 200, latencia_ms: Date.now() - inicio };
  } catch (e) {
    return {
      ok: false,
      status_http: e.status || null,
      erro: e.message,
      latencia_ms: Date.now() - inicio,
    };
  }
}













































function chavePublica() {
  const pk = (process.env.MERCADOPAGO_PUBLIC_KEY || '').trim();
  if (!pk) return null;

  const token = (process.env.MERCADOPAGO_ACCESS_TOKEN || '').trim();
  if (!token) return pk;

  const versao = (v) => (v.startsWith('TEST-') ? 'teste' : 'producao');
  if (versao(pk) !== versao(token)) {
    console.error(
      '[mercadopago] ⚠️ MERCADOPAGO_PUBLIC_KEY é de ' + versao(pk) + ' e '
      + 'MERCADOPAGO_ACCESS_TOKEN é de ' + versao(token) + '. Os dois têm que ser '
      + 'do MESMO par (mesma aplicação E mesma versão — Credenciais de teste OU '
      + 'de produção). Enquanto divergirem, o cartão na página é desligado e a '
      + 'pessoa segue pelo checkout hospedado.',
    );
    return null;
  }
  return pk;
}

async function pagarComToken(c, dados = {}) {
  const token = String(dados.token || '').trim();
  if (!token) throw new Error('Mercado Pago: token do cartão ausente.');

  const parcelas = Number(dados.installments) > 0 ? Math.floor(Number(dados.installments)) : 1;

  const corpo = {


    transaction_amount: paraReaisNumero(c.valor_centavos),
    token,
    installments: parcelas,
    description: c.descricao || 'Pagamento CBRio',
    external_reference: refExterna(c.referencia, c.id),
    payer: {
      email: dados.payer?.email || c.pagador_email || undefined,
      identification: dados.payer?.identification?.number
        ? {
          type: dados.payer.identification.type || 'CPF',
          number: String(dados.payer.identification.number).replace(/\D/g, ''),
        }
        : undefined,
    },
  };


  if (dados.payment_method_id) corpo.payment_method_id = String(dados.payment_method_id);
  if (dados.issuer_id) corpo.issuer_id = String(dados.issuer_id);
  if (dados.payment_method_option_id) corpo.payment_method_option_id = String(dados.payment_method_option_id);

  const p = await req('POST', '/v1/payments', corpo, {



    idempotencyKey: `${c.id}:cartao:${token.slice(0, 12)}`,
  });
  conferirLiveMode(p, 'pagamento com cartão');

  const norm = dadosDoPayment(p);
  return {
    ...norm,



    recusado: norm.status === null,
    motivo_recusa: norm.status === null
      ? (p?.status_detail || p?.status || 'pagamento não aprovado')
      : null,
  };
}

module.exports = {
  nome,
  capacidades,
  criarCobranca,
  definirMetodo,
  consultarStatus,
  cancelarCobranca,
  estornar,
  pagarComToken,
  chavePublica,
  refExterna,
  refDoExterno,
  verificarAssinatura,
  normalizarEvento,
  verificarChave,

  _internos: {
    ambienteDeclarado,
    conferirLiveMode,
    statusCanonico,
    metodoDeMp,
    dadosDaOrder,
    dadosDoPayment,
    expiracaoPix,
    paraCentavos,
    paraReais,
    STATUS_POR_ORDER,
    STATUS_POR_PAYMENT,
  },
};
