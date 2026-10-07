














const { supabase } = require('../../utils/supabase');
const providers = require('./providers');
const handlers = require('./handlers');
const { STATUS, TIPO_PAGAMENTO, STATUS_ABERTOS, METODOS } = require('./tipos');
const {
  aplicarTransicao, statusPorValor, podeExpirar, estaTerminal, estaAberta,
} = require('./maquinaEstados');

const SELECT_COBRANCA = `
  id, public_token, origem_tipo, origem_id, referencia, idempotency_key,
  valor_centavos, valor_pago_centavos, moeda,
  provider, provider_cobranca_id, provider_cliente_id,
  metodo, metodos_ofertados, parcelas_total, parcelas_max, juros_repassados,
  checkout_url, pix_payload, pix_qrcode_base64, boleto_linha_digitavel, boleto_url,
  vencimento, status, expira_em, pago_em,
  pagador_nome, pagador_cpf, pagador_email, pagador_telefone, membro_id,
  estacao_id,
  cartao_brand, cartao_last4, descricao, metadata, ultimo_erro,
  criado_por, created_at, updated_at
`.replace(/\s+/g, ' ').trim();

function centavos(v) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : 0;
}

async function porId(id) {
  const { data, error } = await supabase.from('pag_cobrancas')
    .select(SELECT_COBRANCA).eq('id', id).is('deleted_at', null).maybeSingle();
  if (error) throw error;
  return data || null;
}

async function porToken(token) {
  const { data, error } = await supabase.from('pag_cobrancas')
    .select(SELECT_COBRANCA).eq('public_token', token).is('deleted_at', null).maybeSingle();
  if (error) throw error;
  return data || null;
}

async function porReferencia(referencia) {
  if (!referencia) return null;
  const { data, error } = await supabase.from('pag_cobrancas')
    .select(SELECT_COBRANCA).eq('referencia', referencia).is('deleted_at', null).maybeSingle();
  if (error) throw error;
  return data || null;
}

async function porProviderId(provider, providerCobrancaId) {
  if (!providerCobrancaId) return null;
  const { data, error } = await supabase.from('pag_cobrancas')
    .select(SELECT_COBRANCA)
    .eq('provider', provider).eq('provider_cobranca_id', providerCobrancaId)
    .is('deleted_at', null).maybeSingle();
  if (error) throw error;
  return data || null;
}















async function familiaReferencia(referencia) {
  if (!referencia) return [];
  const { data, error } = await supabase.from('pag_cobrancas')
    .select(SELECT_COBRANCA)
    .like('referencia', `${referencia}%`)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data || []).filter((c) => {
    const r = String(c.referencia || '');
    return r === referencia || r.startsWith(`${referencia}:`);
  });
}










const STATUS_REEMITIVEIS = Object.freeze([STATUS.EXPIRADA, STATUS.CANCELADA, STATUS.FALHOU]);

function podeReemitir(c) {
  return !!c
    && STATUS_REEMITIVEIS.includes(c.status)
    && Number(c.valor_pago_centavos || 0) === 0;
}






















async function criarCobranca({
  origem_tipo, origem_id, referencia,
  valor_centavos, descricao,
  provider: providerNome, metodo, metodos_ofertados,
  parcelas_max, juros_repassados,
  expira_em, vencimento,
  pagador_nome, pagador_cpf, pagador_email, pagador_telefone, membro_id,
  metadata, criado_por,




  estacao_id,
}) {
  if (!origem_tipo) throw new Error('origem_tipo é obrigatório');
  const valor = centavos(valor_centavos);
  if (valor <= 0) throw new Error('valor_centavos deve ser maior que zero');

  const adapter = providers.obter(providerNome);



  const camposLinha = {
    origem_tipo,
    origem_id: origem_id || null,
    valor_centavos: valor,
    descricao: descricao || null,
    provider: adapter.nome,
    metodo: metodo || null,
    metodos_ofertados: Array.isArray(metodos_ofertados) ? metodos_ofertados : [],
    parcelas_max: parcelas_max || null,
    juros_repassados: juros_repassados === undefined ? true : !!juros_repassados,
    expira_em: expira_em || null,
    vencimento: vencimento || null,
    pagador_nome: pagador_nome || null,
    pagador_cpf: pagador_cpf || null,
    pagador_email: pagador_email || null,
    pagador_telefone: pagador_telefone || null,
    membro_id: membro_id || null,
    estacao_id: estacao_id || null,
    metadata: metadata || {},
    criado_por: criado_por || null,
    status: STATUS.CRIADA,
  };


  async function devolver(c) {






    const incompleta = !c.provider_cobranca_id && c.status === STATUS.CRIADA;
    if (!incompleta) return { cobranca: c, reaproveitada: true };
    const retomada = await pedirAoProvider(adapter, c);
    return { cobranca: retomada, reaproveitada: true, retomada: true };
  }

  const existente = await porReferencia(referencia);



  if (existente && !podeReemitir(existente)) return devolver(existente);

  if (existente) {



    const familia = await familiaReferencia(referencia);
    const comDinheiro = familia.find((c) => Number(c.valor_pago_centavos || 0) > 0);
    if (comDinheiro) return { cobranca: comDinheiro, reaproveitada: true };
    const aberta = familia.find((c) => estaAberta(c.status));
    if (aberta) return devolver(aberta);
    return reemitir({ adapter, camposLinha, referencia, anterior: existente });
  }

  const { data: nova, error: eIns } = await supabase.from('pag_cobrancas')
    .insert({ ...camposLinha, referencia: referencia || null })
    .select(SELECT_COBRANCA).single();

  if (eIns) {


    if (eIns.code === '23505') {
      const dela = await porReferencia(referencia);
      if (dela) return { cobranca: dela, reaproveitada: true };
    }
    throw eIns;
  }

  const atualizada = await pedirAoProvider(adapter, nova);
  return { cobranca: atualizada, reaproveitada: false };
}












async function reemitir({ adapter, camposLinha, referencia, anterior }) {
  if (anterior.provider_cobranca_id && typeof adapter.cancelarCobranca === 'function') {
    try {
      await adapter.cancelarCobranca(anterior);
    } catch (e) {
      console.error(`[pagamentos] cancelar anterior ${anterior.id} no provider:`, e.message);
    }
  }





  const novaRef = `${referencia}:r${Date.now().toString(36)}`;
  const { data, error } = await supabase.from('pag_cobrancas')
    .insert({
      ...camposLinha,
      referencia: novaRef,


      metadata: {
        ...(camposLinha.metadata || {}),
        reemitida_de: anterior.id,
        reemitida_de_status: anterior.status,
      },
    })
    .select(SELECT_COBRANCA).single();

  if (error) {


    if (error.code === '23505') {
      const familia = await familiaReferencia(referencia);
      const viva = familia.find((c) => estaAberta(c.status));
      if (viva) return { cobranca: viva, reaproveitada: true };
    }
    throw error;
  }

  const atualizada = await pedirAoProvider(adapter, data);
  return { cobranca: atualizada, reaproveitada: false, reemitida: true, anterior_id: anterior.id };
}







async function pedirAoProvider(adapter, linha) {
  let resposta;
  try {
    resposta = await adapter.criarCobranca(linha);
  } catch (e) {





    await supabase.from('pag_cobrancas')
      .update({ ultimo_erro: String(e.message).slice(0, 500) })
      .eq('id', linha.id);
    throw e;
  }

  const patch = {
    provider_cobranca_id: resposta.provider_cobranca_id || null,
    provider_cliente_id: resposta.provider_cliente_id || null,
    checkout_url: resposta.checkout_url || null,
    pix_payload: resposta.pix_payload || null,
    pix_qrcode_base64: resposta.pix_qrcode_base64 || null,
    boleto_linha_digitavel: resposta.boleto_linha_digitavel || null,
    boleto_url: resposta.boleto_url || null,
    ultimo_erro: null,
  };
  if (resposta.metodo) patch.metodo = resposta.metodo;
  if (resposta.vencimento) patch.vencimento = resposta.vencimento;
  if (resposta.status && resposta.status !== linha.status) {
    const t = aplicarTransicao(linha.status, resposta.status);
    if (t.ok) patch.status = resposta.status;
    else console.error(`[pagamentos] provider devolveu status inválido na criação: ${t.motivo}`);
  }

  const { data, error } = await supabase.from('pag_cobrancas')
    .update(patch).eq('id', linha.id).select(SELECT_COBRANCA).single();
  if (error) throw error;
  return data;
}






function artefatoJaExiste(c, metodo) {
  if (metodo === METODOS.PIX) return !!c.pix_payload;
  if (metodo === METODOS.BOLETO) return !!c.boleto_linha_digitavel;
  return false;
}













async function definirMetodo(cobrancaOuId, metodo, opcoes = {}) {
  const c = typeof cobrancaOuId === 'string' ? await porId(cobrancaOuId) : cobrancaOuId;
  if (!c) throw new Error('Cobrança não encontrada');
  if (c.valor_pago_centavos > 0 || estaTerminal(c.status)) {
    return { cobranca: c, alterada: false, motivo: 'cobranca_nao_editavel' };
  }








  if (c.metodo === metodo && artefatoJaExiste(c, metodo)) {
    return { cobranca: c, alterada: true };
  }

  const adapter = providers.obter(c.provider);
  if (!adapter.capacidades.metodos.includes(metodo)) {
    throw new Error(`Forma de pagamento "${metodo}" não é oferecida por ${adapter.nome}.`);
  }
  if (typeof adapter.definirMetodo !== 'function') {


    const { data, error } = await supabase.from('pag_cobrancas')
      .update({ metodo }).eq('id', c.id).select(SELECT_COBRANCA).single();
    if (error) throw error;
    return { cobranca: data, alterada: true };
  }

  let r;
  try {








    r = await adapter.definirMetodo(c, metodo, { ...opcoes, tentativa: c.updated_at });
  } catch (e) {


    await supabase.from('pag_cobrancas')
      .update({ ultimo_erro: String(e.message).slice(0, 500) })
      .eq('id', c.id);
    throw e;
  }

  const patch = {
    metodo: r.metodo || metodo,
    ultimo_erro: null,
  };






  if (r.provider_cobranca_id) patch.provider_cobranca_id = String(r.provider_cobranca_id);



  if (Number(r.parcelas) > 0) patch.parcelas_total = Number(r.parcelas);


  if (r.checkout_url) patch.checkout_url = r.checkout_url;
  if (r.pix_payload) patch.pix_payload = r.pix_payload;
  if (r.pix_qrcode_base64) patch.pix_qrcode_base64 = r.pix_qrcode_base64;
  if (r.boleto_linha_digitavel) patch.boleto_linha_digitavel = r.boleto_linha_digitavel;
  if (r.boleto_url) patch.boleto_url = r.boleto_url;

  const { data, error } = await supabase.from('pag_cobrancas')
    .update(patch).eq('id', c.id).select(SELECT_COBRANCA).single();
  if (error) throw error;
  return { cobranca: data, alterada: true };
}


async function somaPago(cobrancaId) {
  const { data, error } = await supabase.from('pag_pagamentos')
    .select('valor_centavos, tipo').eq('cobranca_id', cobrancaId);
  if (error) throw error;
  return (data || [])
    .filter((p) => p.tipo !== TIPO_PAGAMENTO.TARIFA)
    .reduce((acc, p) => acc + centavos(p.valor_centavos), 0);
}








async function aplicarStatus(cobranca, novoStatus, extra = {}) {
  const t = aplicarTransicao(cobranca.status, novoStatus);
  if (!t.ok) return { aplicado: false, motivo: t.motivo, cobranca };
  if (t.noop) return { aplicado: false, noop: true, cobranca };




  const { ctx, ...colunas } = extra;
  const patch = { status: novoStatus, ...colunas };
  if (novoStatus === STATUS.PAGO && !cobranca.pago_em && !patch.pago_em) {
    patch.pago_em = new Date().toISOString();
  }

  const { data, error } = await supabase.from('pag_cobrancas')
    .update(patch).eq('id', cobranca.id).select(SELECT_COBRANCA).single();
  if (error) throw error;




  if (data.status !== novoStatus) {
    return { aplicado: false, motivo: `banco recusou a transição para ${novoStatus}`, cobranca: data };
  }

  const gancho = {
    [STATUS.PAGO]: 'aoPagar',
    [STATUS.PAGO_PARCIAL]: 'aoPagarParcial',
    [STATUS.EXPIRADA]: 'aoExpirar',
    [STATUS.CANCELADA]: 'aoCancelar',
    [STATUS.ESTORNADO]: 'aoEstornar',
    [STATUS.ESTORNADO_PARCIAL]: 'aoEstornar',
    [STATUS.CHARGEBACK]: 'aoEstornar',
  }[novoStatus];
  if (gancho) await handlers.disparar(gancho, data, ctx || {});

  return { aplicado: true, cobranca: data };
}










async function registrarPagamento(cobranca, {
  tipo = TIPO_PAGAMENTO.LIQUIDACAO,
  valor_centavos,
  liquido_centavos, taxa_centavos,
  metodo, parcelas,
  provider_pagamento_id, e2e_id,
  pago_em, repassado_em,
  payload,




  statusFinal,
}) {
  const valor = centavos(valor_centavos);
  const negativo = tipo === TIPO_PAGAMENTO.ESTORNO
    || tipo === TIPO_PAGAMENTO.CHARGEBACK
    || tipo === TIPO_PAGAMENTO.TARIFA;

  const linha = {
    cobranca_id: cobranca.id,
    tipo,


    valor_centavos: negativo ? -Math.abs(valor) : Math.abs(valor),
    liquido_centavos: liquido_centavos === undefined || liquido_centavos === null
      ? null : centavos(liquido_centavos),
    taxa_centavos: taxa_centavos === undefined || taxa_centavos === null
      ? null : centavos(taxa_centavos),
    metodo: metodo || cobranca.metodo || null,
    parcelas: parcelas || cobranca.parcelas_total || null,
    provider_pagamento_id: provider_pagamento_id || null,
    e2e_id: e2e_id || null,
    pago_em: pago_em || new Date().toISOString(),
    repassado_em: repassado_em || null,
    payload: payload || null,
  };

  const { error } = await supabase.from('pag_pagamentos').insert(linha);
  if (error && error.code !== '23505') throw error;
  const duplicado = !!error;





  if (duplicado && repassado_em && provider_pagamento_id) {
    const { error: eRep } = await supabase.from('pag_pagamentos')
      .update({
        repassado_em,
        ...(liquido_centavos != null ? { liquido_centavos: centavos(liquido_centavos) } : {}),
        ...(taxa_centavos != null ? { taxa_centavos: centavos(taxa_centavos) } : {}),
      })
      .eq('provider_pagamento_id', provider_pagamento_id)
      .is('repassado_em', null);
    if (eRep) console.error('[pagamentos] marcar repasse:', eRep.message);
  }

  const pago = await somaPago(cobranca.id);
  const patch = { valor_pago_centavos: Math.max(0, pago) };
  if (metodo && !cobranca.metodo) patch.metodo = metodo;
  if (parcelas && !cobranca.parcelas_total) patch.parcelas_total = parcelas;

  const { data: comValor, error: eUp } = await supabase.from('pag_cobrancas')
    .update(patch).eq('id', cobranca.id).select(SELECT_COBRANCA).single();
  if (eUp) throw eUp;



  if (negativo) return { duplicado, cobranca: comValor };




  const derivado = statusFinal || statusPorValor(comValor);
  if (!derivado) return { duplicado, cobranca: comValor };
  const r = await aplicarStatus(comValor, derivado, { pago_em: linha.pago_em });
  return { duplicado, cobranca: r.cobranca, aplicado: r.aplicado, motivo: r.motivo };
}


async function listarParaExpirar(limite = 200) {
  const { data, error } = await supabase.from('pag_cobrancas')
    .select(SELECT_COBRANCA)
    .in('status', [STATUS.CRIADA, STATUS.AGUARDANDO])
    .lte('expira_em', new Date().toISOString())
    .is('deleted_at', null)
    .order('expira_em', { ascending: true })
    .limit(limite);
  if (error) throw error;


  return (data || []).filter(podeExpirar);
}










async function listarParaReconciliar({ dias = 30, limite = 200 } = {}) {
  const desde = new Date(Date.now() - dias * 86400000).toISOString();
  const { data, error } = await supabase.from('pag_cobrancas')
    .select(SELECT_COBRANCA)
    .in('status', STATUS_ABERTOS)
    .gte('created_at', desde)
    .not('provider_cobranca_id', 'is', null)
    .is('deleted_at', null)
    .order('updated_at', { ascending: true })
    .limit(limite);
  if (error) throw error;
  return data || [];
}






async function tocarReconciliacao(cobrancaId) {
  const { error } = await supabase.from('pag_cobrancas')
    .update({ updated_at: new Date().toISOString() }).eq('id', cobrancaId);
  if (error) console.error('[pagamentos] tocar reconciliação:', error.message);
}







async function registrarErro(cobrancaId, mensagem) {
  const { error } = await supabase.from('pag_cobrancas')
    .update({ ultimo_erro: String(mensagem || '').slice(0, 500) })
    .eq('id', cobrancaId);
  if (error) throw error;
  return { ok: true };
}






const EXTRAS_PERMITIDOS = new Set(['cartao_brand', 'cartao_last4', 'parcelas_total']);

async function aplicarExtras(cobrancaId, extras = {}) {
  const patch = {};
  for (const [k, v] of Object.entries(extras)) {
    if (EXTRAS_PERMITIDOS.has(k) && v !== undefined && v !== null) patch[k] = v;
  }
  if (!Object.keys(patch).length) return { ok: true, semMudanca: true };
  const { error } = await supabase.from('pag_cobrancas').update(patch).eq('id', cobrancaId);
  if (error) throw error;
  return { ok: true };
}

module.exports = {
  SELECT_COBRANCA,
  porId, porToken, porReferencia, porProviderId, familiaReferencia,
  criarCobranca,
  podeReemitir,
  STATUS_REEMITIVEIS,
  definirMetodo,
  aplicarStatus,
  registrarPagamento,
  somaPago,
  listarParaExpirar,
  listarParaReconciliar,
  tocarReconciliacao,
  registrarErro,
  aplicarExtras,
  EXTRAS_PERMITIDOS,
};
