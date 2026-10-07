const { createClient } = require('@supabase/supabase-js');
const { Pool } = require('pg');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('[Supabase] SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY não configurados. Rotas que usam Supabase podem falhar.');
}
































const TIMEOUT_PADRAO_MS = Number(process.env.SUPABASE_FETCH_TIMEOUT_MS) || 30000;


const TIMEOUT_LONGO_MS = Number(process.env.SUPABASE_FETCH_TIMEOUT_LONGO_MS) || 150000;

function tetoParaUrl(url) {
  const u = String(url || '');
  return (u.includes('/rpc/') || u.includes('/storage/')) ? TIMEOUT_LONGO_MS : TIMEOUT_PADRAO_MS;
}








function comTeto(url, opcoes) {
  let teto;
  try { teto = AbortSignal.timeout(tetoParaUrl(url)); } catch { return opcoes; }
  const doChamador = opcoes && opcoes.signal;
  if (!doChamador) return { ...(opcoes || {}), signal: teto };
  if (typeof AbortSignal.any !== 'function') return opcoes;
  return { ...opcoes, signal: AbortSignal.any([doChamador, teto]) };
}

function fetchQueAnotaFalha(url, opcoes) {
  const nativo = globalThis.fetch;
  const p = nativo(url, comTeto(url, opcoes));
  return p.then((resposta) => {
    try {
      if (!resposta || resposta.ok || resposta.status < 400) return resposta;
      const { registrarFalhaDb } = require('./contextoFalha');
      const { motivoDeErroPostgrest } = require('./motivoFalha');
      resposta.clone().text().then((txt) => {
        let corpo = null;
        try { corpo = txt ? JSON.parse(txt) : null; } catch {                }
        registrarFalhaDb({
          motivo: motivoDeErroPostgrest(corpo) || String(txt || '').slice(0, 400),
          codigo: corpo?.code || '',
          status: resposta.status,


          rota: (() => { try { return new URL(String(url)).pathname; } catch { return ''; } })(),
        });
      }).catch(() => {                                                   });
    } catch {                                               }
    return resposta;
  }, (erro) => {




    try {
      if (erro && (erro.name === 'TimeoutError' || erro.name === 'AbortError')) {
        const { registrarFalhaDb } = require('./contextoFalha');
        registrarFalhaDb({
          motivo: `Supabase nao respondeu em ${tetoParaUrl(url)}ms (teto do cliente)`,
          codigo: 'FETCH_TIMEOUT',
          status: 503,
          rota: (() => { try { return new URL(String(url)).pathname; } catch { return ''; } })(),
        });
      }
    } catch {                                               }
    throw erro;
  });
}

const supabase = (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { fetch: fetchQueAnotaFalha },
    })
  : null;


const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: parseInt(process.env.DB_POOL_MAX) || (process.env.VERCEL === '1' ? 1 : 10),
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('[DB] Erro inesperado no pool:', err.message);
});

const query = async (text, params) => {
  const start = Date.now();
  const result = await pool.query(text, params);
  if (process.env.NODE_ENV === 'development') {
    const ms = Date.now() - start;
    if (ms > 200) console.warn(`[DB] Query lenta (${ms}ms):`, text.slice(0, 80));
  }
  return result;
};

const transaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};





module.exports = { supabase, pool, query, transaction, fetchQueAnotaFalha };
