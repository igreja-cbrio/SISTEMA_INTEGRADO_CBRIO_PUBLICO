











const providers = require('./providers');
const cobrancas = require('./cobrancas');
const webhooks = require('./webhooks');
const handlers = require('./handlers');
const tipos = require('./tipos');
const maquina = require('./maquinaEstados');
const saude = require('./saude');

const { STATUS, TIPO_PAGAMENTO } = tipos;

function habilitado() {
  return process.env.PAG_ENABLED !== '0' && process.env.PAG_ENABLED !== 'false';
}





function capacidades(providerNome) {
  return providers.obter(providerNome).capacidades;
}


function metodosDisponiveis(desejados, providerNome) {
  const cap = capacidades(providerNome);
  const lista = Array.isArray(desejados) && desejados.length ? desejados : cap.metodos;
  return lista.filter((m) => cap.metodos.includes(m));
}

async function criarCobranca(dados) {
  if (!habilitado()) {
    throw new Error('Pagamentos estão desligados (PAG_ENABLED=0).');
  }
  return cobrancas.criarCobranca(dados);
}









async function definirMetodo(cobrancaOuId, metodo, opcoes = {}) {
  if (!habilitado()) throw new Error('Pagamentos estão desligados (PAG_ENABLED=0).');




  return cobrancas.definirMetodo(cobrancaOuId, metodo, opcoes);
}

const consultar = cobrancas.porId;
const consultarPorToken = cobrancas.porToken;
const consultarPorReferencia = cobrancas.porReferencia;




















function chavePublica(providerNome) {
  try {
    const a = providers.obter(providerNome);
    return typeof a.chavePublica === 'function' ? a.chavePublica() : null;
  } catch { return null; }
}

async function pagarComCartao(cobrancaOuId, dados = {}) {
  if (!habilitado()) throw new Error('Pagamentos estão desligados (PAG_ENABLED=0).');

  const c = typeof cobrancaOuId === 'string' ? await cobrancas.porId(cobrancaOuId) : cobrancaOuId;
  if (!c) return { ok: false, motivo: 'cobrança não encontrada' };
  if (c.valor_pago_centavos > 0 || maquina.estaTerminal(c.status)) {


    return { ok: false, motivo: 'cobranca_nao_editavel', cobranca: c };
  }

  const adapter = providers.obter(c.provider);
  if (typeof adapter.pagarComToken !== 'function' || !adapter.capacidades.tokenizacao) {
    return { ok: false, motivo: 'provider_sem_tokenizacao' };
  }







  const teto = Number(c.parcelas_max) > 0 ? Number(c.parcelas_max) : 1;
  const pedidas = Number(dados.installments) > 0 ? Math.floor(Number(dados.installments)) : 1;
  if (pedidas > teto) {
    return { ok: false, motivo: `Este evento aceita no máximo ${teto}x.` };
  }

  let r;
  try {
    r = await adapter.pagarComToken(c, { ...dados, installments: pedidas });
  } catch (e) {
    await cobrancas.registrarErro(c.id, e.message).catch(() => {});
    throw e;
  }

  if (r.recusado || !(Number(r.valor_pago_centavos) > 0)) {

    await cobrancas.registrarErro(c.id, `cartão recusado: ${r.motivo_recusa || 'sem detalhe'}`)
      .catch(() => {});
    return { ok: false, recusado: true, motivo: r.motivo_recusa || 'Pagamento não aprovado.', cobranca: c };
  }


  const reg = await cobrancas.registrarPagamento(c, {
    tipo: TIPO_PAGAMENTO.LIQUIDACAO,
    valor_centavos: r.valor_pago_centavos,
    liquido_centavos: r.liquido_centavos,
    taxa_centavos: r.taxa_centavos,
    metodo: r.metodo, parcelas: r.parcelas,
    provider_pagamento_id: r.provider_pagamento_id,
    repassado_em: r.repassado_em,
    payload: r.payload || null,
  });



  const extra = {};
  if (r.cartao_brand) extra.cartao_brand = r.cartao_brand;
  if (r.cartao_last4) extra.cartao_last4 = r.cartao_last4;
  if (Object.keys(extra).length) {
    await cobrancas.aplicarExtras(reg.cobranca.id, extra).catch(() => {});
  }

  return { ok: true, pago: true, cobranca: reg.cobranca, duplicado: reg.duplicado };
}






async function sincronizar(cobrancaOuId) {
  const c = typeof cobrancaOuId === 'string' ? await cobrancas.porId(cobrancaOuId) : cobrancaOuId;
  if (!c) return { ok: false, motivo: 'cobrança não encontrada' };
  if (maquina.estaTerminal(c.status) || c.status === STATUS.PAGO) {
    return { ok: true, cobranca: c, semMudanca: true };
  }

  const adapter = providers.obter(c.provider);
  if (!adapter.capacidades.consulta_status) {
    return { ok: true, cobranca: c, semMudanca: true, motivo: 'provider não consulta status' };
  }

  const remoto = await adapter.consultarStatus(c);
  if (!remoto) return { ok: true, cobranca: c, semMudanca: true };

  if (Number(remoto.valor_pago_centavos || 0) > 0) {
    const r = await cobrancas.registrarPagamento(c, {
      tipo: TIPO_PAGAMENTO.LIQUIDACAO,
      valor_centavos: remoto.valor_pago_centavos,
      liquido_centavos: remoto.liquido_centavos,
      taxa_centavos: remoto.taxa_centavos,
      metodo: remoto.metodo, parcelas: remoto.parcelas,
      provider_pagamento_id: remoto.provider_pagamento_id,
      e2e_id: remoto.e2e_id, repassado_em: remoto.repassado_em,
      payload: remoto.bruto || null,


      statusFinal: remoto.quita_cobranca ? STATUS.PAGO : undefined,
    });
    return { ok: true, cobranca: r.cobranca, duplicado: r.duplicado };
  }

  if (remoto.status && remoto.status !== c.status) {
    const r = await cobrancas.aplicarStatus(c, remoto.status);
    return { ok: true, cobranca: r.cobranca, aplicado: r.aplicado, motivo: r.motivo };
  }





  await cobrancas.tocarReconciliacao(c.id);
  return { ok: true, cobranca: c, semMudanca: true };
}








async function marcarPagoManual(cobrancaId, {
  confirmado_por, valor_centavos, metodo, observacao, repassado_em,
} = {}) {
  if (!confirmado_por) throw new Error('confirmado_por é obrigatório em pagamento manual');
  const c = await cobrancas.porId(cobrancaId);
  if (!c) return { ok: false, motivo: 'cobrança não encontrada' };
  if (c.status === STATUS.PAGO) return { ok: true, cobranca: c, semMudanca: true };
  if (maquina.estaTerminal(c.status)) {
    return { ok: false, motivo: `cobrança está ${c.status} — crie uma cobrança nova` };
  }

  const valor = Number(valor_centavos) > 0
    ? Number(valor_centavos)
    : (c.valor_centavos - c.valor_pago_centavos);

  const r = await cobrancas.registrarPagamento(c, {
    tipo: TIPO_PAGAMENTO.LIQUIDACAO,
    valor_centavos: valor,


    metodo: metodo || 'dinheiro',
    payload: { manual: true, confirmado_por, observacao: observacao || null },
    repassado_em: repassado_em || null,
  });
  return { ok: true, cobranca: r.cobranca, duplicado: r.duplicado };
}









async function cancelar(cobrancaId, { motivo, preservar_dominio = false } = {}) {
  const c = await cobrancas.porId(cobrancaId);
  if (!c) return { ok: false, motivo: 'cobrança não encontrada' };
  if (maquina.temDinheiro(c.status)) {

    return { ok: false, motivo: 'cobrança já tem pagamento — o caminho é estorno, não cancelamento' };
  }
  const adapter = providers.obter(c.provider);
  try {
    await adapter.cancelarCobranca(c);
  } catch (e) {
    console.error('[pagamentos] cancelar no provider falhou:', e.message);


  }
  const r = await cobrancas.aplicarStatus(c, STATUS.CANCELADA, {
    ultimo_erro: motivo ? String(motivo).slice(0, 500) : null,
    ctx: { preservar_inscricao: !!preservar_dominio, motivo: motivo || null },
  });
  return { ok: r.aplicado, cobranca: r.cobranca, motivo: r.motivo };
}

async function estornar(cobrancaId, { valor_centavos, motivo, solicitado_por } = {}) {
  const c = await cobrancas.porId(cobrancaId);
  if (!c) return { ok: false, motivo: 'cobrança não encontrada' };
  if (!maquina.temDinheiro(c.status)) {
    return { ok: false, motivo: `cobrança está ${c.status} — não há o que estornar` };
  }
  const adapter = providers.obter(c.provider);
  const parcial = Number(valor_centavos) > 0 && Number(valor_centavos) < c.valor_pago_centavos;
  const resp = await adapter.estornar(c, { valor_centavos: valor_centavos || c.valor_pago_centavos });

  const r = await cobrancas.registrarPagamento(c, {
    tipo: TIPO_PAGAMENTO.ESTORNO,
    valor_centavos: valor_centavos || c.valor_pago_centavos,
    provider_pagamento_id: resp?.provider_pagamento_id || null,
    payload: { motivo: motivo || null, solicitado_por: solicitado_por || null, ...(resp?.bruto || {}) },
  });
  const alvo = parcial ? STATUS.ESTORNADO_PARCIAL : STATUS.ESTORNADO;
  const f = await cobrancas.aplicarStatus(r.cobranca, alvo, {
    ultimo_erro: motivo ? String(motivo).slice(0, 500) : null,
  });
  return { ok: f.aplicado, cobranca: f.cobranca, motivo: f.motivo };
}






async function expirarVencidas({ limite = 200 } = {}) {
  const lista = await cobrancas.listarParaExpirar(limite);
  const r = { total: lista.length, expiradas: 0, ignoradas: 0 };
  for (const c of lista) {
    try {
      const res = await cobrancas.aplicarStatus(c, STATUS.EXPIRADA);
      if (res.aplicado) r.expiradas += 1; else r.ignoradas += 1;
    } catch (e) {
      r.ignoradas += 1;
      console.error(`[pagamentos] expirar ${c.id}:`, e.message);
    }
  }
  return r;
}








async function reconciliar({ dias = 30, limite = 200 } = {}) {
  const lista = await cobrancas.listarParaReconciliar({ dias, limite });
  const r = { total: lista.length, atualizadas: 0, iguais: 0, falhas: 0 };
  for (const c of lista) {
    try {
      const res = await sincronizar(c);
      if (res.semMudanca) {
        r.iguais += 1;
        await cobrancas.tocarReconciliacao(c.id);
      } else {
        r.atualizadas += 1;
      }
    } catch (e) {
      r.falhas += 1;
      console.error(`[pagamentos] reconciliar ${c.id}:`, e.message);


      await cobrancas.tocarReconciliacao(c.id);
    }
  }
  return r;
}

module.exports = {

  habilitado,
  capacidades,
  metodosDisponiveis,
  providerPadrao: providers.providerPadrao,
  pspConfigurado: providers.pspConfigurado,
  listarProviders: providers.listar,


  criarCobranca,
  definirMetodo,
  consultar,
  consultarPorToken,
  consultarPorReferencia,
  sincronizar,
  pagarComCartao,
  chavePublica,
  marcarPagoManual,
  cancelar,
  estornar,


  expirarVencidas,
  reconciliar,



  verificarSaude: saude.verificar,
  saudeAtual: saude.atual,


  processarWebhook: webhooks.processar,
  reprocessarWebhooksPendentes: webhooks.reprocessarPendentes,


  registrarHandler: handlers.registrar,


  ...tipos,
};
