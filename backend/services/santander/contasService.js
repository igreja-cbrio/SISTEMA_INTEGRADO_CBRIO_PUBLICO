

const { callApi, BANK_ID, AGENCIA, CONTA } = require('./httpClient');
const { supabase } = require('../../utils/supabase');
const { avaliarPagina } = require('../../utils/paginacaoExtrato');

const BASE = '/bank_account_information/v1';



function padAgencia(a) { return String(a || '').padStart(4, '0'); }
function padConta(c) { return String(c || '').padStart(12, '0'); }

function balanceId() {
  if (!AGENCIA || !CONTA) throw new Error('SANTANDER_AGENCIA / SANTANDER_CONTA não configurados');
  return `${padAgencia(AGENCIA)}.${padConta(CONTA)}`;
}

function transactionsPath({ agencia = AGENCIA, conta = CONTA } = {}) {
  if (!agencia || !conta) throw new Error('SANTANDER_AGENCIA / SANTANDER_CONTA nao configurados');
  const transactionId = padAgencia(agencia) + '.' + padConta(conta);
  return BASE + '/transactions/' + transactionId;
}

async function listarContas({ userId } = {}) {
  return callApi(`${BASE}/banks/${BANK_ID}/accounts`, { userId });
}




async function buscarLimiteOverdraft({ userId } = {}) {
  try {
    const raw = await callApi(`${BASE}/banks/${BANK_ID}/accounts`, { userId });
    const accounts = Array.isArray(raw) ? raw : (raw?.accounts || raw?.data || []);
    const myAccount = accounts.find(a => {
      const ag = String(a.branchCode || '').padStart(4, '0');
      const ct = String(a.accountNumber || a.accountId || '').padStart(12, '0');
      return ag === padAgencia(AGENCIA) && ct.includes(padConta(CONTA));
    }) || accounts[0];

    if (!myAccount) {

      return {
        overdraftLimit: 0,
        overdraftUsed: 0,
        rawAccount: { _debug_no_account: true, _accountsResponse: raw },
      };
    }

    return {
      overdraftLimit: Number(
        myAccount.overdraftLimitAmount
        || myAccount.overdraftContractedLimit
        || myAccount.checkSpecialContractedLimit
        || myAccount.contractedOverdraft
        || myAccount.overdraftLimit
        || 0
      ),
      overdraftUsed: Number(
        myAccount.overdraftUsedAmount
        || myAccount.checkSpecialUsedAmount
        || myAccount.overdraftUsed
        || 0
      ),
      rawAccount: myAccount,
    };
  } catch (e) {

    console.warn('[Santander] /accounts falhou:', e.message);
    return {
      overdraftLimit: 0,
      overdraftUsed: 0,
      rawAccount: { _debug_error: e.message, _debug_status: e.status, _debug_body: e.body },
    };
  }
}

async function consultarSaldo({ userId } = {}) {

  const [raw, limite] = await Promise.all([
    callApi(`${BASE}/banks/${BANK_ID}/balances/${balanceId()}`, { userId }),
    buscarLimiteOverdraft({ userId }),
  ]);


  const available = Number(raw.availableAmount || 0);
  const blocked = Number(raw.blockedAmount || 0);
  const invested = Number(raw.automaticallyInvestedAmount || 0);
  const { overdraftLimit, overdraftUsed, rawAccount } = limite;

  return {
    available,
    blocked,
    invested,
    overdraftLimit,
    overdraftUsed,
    overdraftAvailable: overdraftLimit > 0 ? overdraftLimit - overdraftUsed : 0,




    total: available,
    currency: raw.availableAmountCurrency || 'BRL',
    raw: { balance: raw, account: rawAccount },
  };
}

async function snapshotSaldoDoDia({ userId } = {}) {
  const saldo = await consultarSaldo({ userId });
  const hoje = new Date().toISOString().slice(0, 10);
  if (!supabase) return saldo;
  await supabase
    .from('santander_saldo_snapshot')
    .upsert({
      data: hoje,
      available_amount: saldo.available,
      blocked_amount: saldo.blocked,
      invested_amount: saldo.invested,
      overdraft_limit: saldo.overdraftLimit,
      overdraft_used: saldo.overdraftUsed,
      currency: saldo.currency,
      raw_response: saldo.raw,
      capturado_em: new Date().toISOString(),
    }, { onConflict: 'data' });
  return saldo;
}

async function historicoSaldo({ dias = 30 } = {}) {
  if (!supabase) return [];
  const desde = new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10);
  const { data } = await supabase
    .from('santander_saldo_snapshot')
    .select('data, available_amount, blocked_amount, invested_amount, currency')
    .gte('data', desde)
    .order('data', { ascending: true });
  return data || [];
}








function fatiarPeriodo(inicio, fim) {
  const fatias = [];
  let cursor = new Date(inicio);
  const fimDate = new Date(fim);
  while (cursor <= fimDate) {
    const proxFim = new Date(cursor);
    proxFim.setDate(proxFim.getDate());
    const fimFatia = proxFim > fimDate ? fimDate : proxFim;
    fatias.push({
      inicio: cursor.toISOString().slice(0, 10),
      fim: fimFatia.toISOString().slice(0, 10),
    });
    cursor = new Date(fimFatia);
    cursor.setDate(cursor.getDate() + 1);
  }
  return fatias;
}

async function buscarExtratoSantander({ inicio, fim, userId }) {
  const limit = 50;
  let offset = 0;
  const content = [];



  const vistos = new Set();

  for (let page = 0; page < 100; page += 1) {
    const response = await callApi(transactionsPath(), {
      query: { initialDate: inicio, finalDate: fim, _limit: limit, _offset: offset },
      userId,
    });
    const pageContent = Array.isArray(response?._content) ? response._content : [];
    content.push(...pageContent);



    const { encerrar, travou, motivo } = avaliarPagina({
      itens: pageContent, vistos, limite: limit, inicio, fim,
    });
    if (encerrar) {
      return { ...response, _content: content };
    }




    if (travou) {
      throw new Error(motivo);
    }
    offset += pageContent.length;
  }

  throw new Error('Limite de paginacao do extrato Santander excedido (100 páginas cheias e ainda com lançamento novo)');
}

async function consultarExtrato({ inicio, fim, usarCache = true, userId, tolerarDiaIncompleto = false } = {}) {
  if (!inicio || !fim) throw new Error('início e fim obrigatórios (YYYY-MM-DD)');


  if (usarCache && supabase) {
    const { data: cached } = await supabase
      .from('santander_extrato_cache')
      .select('conteudo, expires_at')
      .eq('data_inicio', inicio)
      .eq('data_fim', fim)
      .single();
    if (cached && new Date(cached.expires_at).getTime() > Date.now()) {
      return cached.conteudo;
    }
  }

  const fatias = fatiarPeriodo(inicio, fim);
  const respostas = [];














  const diasIncompletos = [];
  for (const f of fatias) {
    try {
      respostas.push(await buscarExtratoSantander({ inicio: f.inicio, fim: f.fim, userId }));
    } catch (e) {
      if (!tolerarDiaIncompleto) throw e;
      diasIncompletos.push({ dia: f.inicio, motivo: e.message });
    }
  }


  const merged = {
    _content: respostas.flatMap((r) => Array.isArray(r?._content) ? r._content : []),
    _pageable: { _moreElements: false },
    _fatias: fatias.length,
    _diasIncompletos: diasIncompletos,
  };



  if (usarCache && supabase && !diasIncompletos.length) {
    await supabase
      .from('santander_extrato_cache')
      .upsert({
        data_inicio: inicio,
        data_fim: fim,
        conteudo: merged,
        cached_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      }, { onConflict: 'data_inicio,data_fim' });
  }

  return merged;
}

module.exports = {
  listarContas,
  consultarSaldo,
  snapshotSaldoDoDia,
  historicoSaldo,
  consultarExtrato,
  transactionsPath,
};
