











































const crypto = require('crypto');
const { supabase } = require('../utils/supabase');



const { ALFABETO, CODIGO_LEN, ipDentroDoCerco } = require('../utils/totemCerco');

const PAREAMENTO_TTL_MIN = 15;
const DISPOSITIVO_TTL_DIAS = 90;




const CACHE_TTL_MS = 60 * 1000;
const cache = new Map();

const SELECT_ESTACAO = `
  id, codigo, nome, finalidades, local, igreja_id, evento_fixo_id,
  tef_provider, tef_terminal_serie, tef_terminal_logico, tef_ativo,
  printer_target, printer_modelo, printer_largura_mm, printer_altura_mm,
  ativo, ip_permitidos, revogada_em, ultima_batida_em, versao_app
`;

function hashToken(t) {
  return crypto.createHash('sha256').update(String(t)).digest('hex');
}

function gerarCodigo() {


  const limite = 256 - (256 % ALFABETO.length);
  let out = '';
  while (out.length < CODIGO_LEN) {
    for (const b of crypto.randomBytes(CODIGO_LEN)) {
      if (b >= limite) continue;
      out += ALFABETO[b % ALFABETO.length];
      if (out.length === CODIGO_LEN) break;
    }
  }
  return out;
}

function gerarSegredo() {
  return `tk_${crypto.randomBytes(32).toString('hex')}`;
}


async function emitirToken(estacaoId, tipo, { criadoPor, rotulo, linhagem, ttlDias } = {}) {
  const segredo = tipo === 'pareamento' ? gerarCodigo() : gerarSegredo();
  const expira = new Date(
    tipo === 'pareamento'
      ? Date.now() + PAREAMENTO_TTL_MIN * 60 * 1000
      : Date.now() + (ttlDias || DISPOSITIVO_TTL_DIAS) * 24 * 60 * 60 * 1000,
  ).toISOString();

  const linha = {
    estacao_id: estacaoId,
    tipo,
    token_hash: hashToken(segredo),
    prefixo: segredo.slice(0, 8),
    rotulo: rotulo || null,
    criado_por: criadoPor || null,
    expira_em: expira,
  };
  if (linhagem) linha.linhagem = linhagem;

  const { data, error } = await supabase
    .from('totem_estacao_tokens')
    .insert(linha)
    .select('id, tipo, prefixo, linhagem, expira_em, created_at')
    .single();
  if (error) throw error;


  return { segredo, token: data };
}


async function gerarPareamento(estacaoId, { criadoPor, rotulo } = {}) {



  await supabase
    .from('totem_estacao_tokens')
    .update({ revogado_em: new Date().toISOString(), revogado_motivo: 'código novo gerado' })
    .eq('estacao_id', estacaoId).eq('tipo', 'pareamento')
    .is('revogado_em', null).is('usado_em', null);

  const { segredo, token } = await emitirToken(estacaoId, 'pareamento', { criadoPor, rotulo });
  return { codigo: segredo, expira_em: token.expira_em };
}



async function parear({ codigo, tipo = 'dispositivo', ip, userAgent, rotulo }) {
  const limpo = String(codigo || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (limpo.length !== CODIGO_LEN) return { ok: false, motivo: 'codigo_invalido' };

  const { data: linha, error } = await supabase
    .from('totem_estacao_tokens')
    .select('id, estacao_id, tipo, expira_em, usado_em, revogado_em')
    .eq('token_hash', hashToken(limpo)).eq('tipo', 'pareamento')
    .maybeSingle();
  if (error) throw error;


  if (!linha || linha.revogado_em || linha.usado_em) return { ok: false, motivo: 'codigo_invalido' };
  if (linha.expira_em && new Date(linha.expira_em) <= new Date()) return { ok: false, motivo: 'codigo_invalido' };

  const { data: est, error: e2 } = await supabase
    .from('totem_estacoes').select(SELECT_ESTACAO).eq('id', linha.estacao_id).maybeSingle();
  if (e2) throw e2;
  if (!est || !est.ativo || est.revogada_em) return { ok: false, motivo: 'estacao_indisponivel' };





  const { data: queimado, error: e3 } = await supabase
    .from('totem_estacao_tokens')
    .update({
      usado_em: new Date().toISOString(),
      pareado_em: new Date().toISOString(),
      pareado_ip: ip || null,
      pareado_user_agent: (userAgent || '').slice(0, 300) || null,
    })
    .eq('id', linha.id).is('usado_em', null).is('revogado_em', null)
    .select('id');
  if (e3) throw e3;
  if (!queimado || queimado.length === 0) return { ok: false, motivo: 'codigo_invalido' };

  const alvo = tipo === 'agente' ? 'agente' : 'dispositivo';
  const { segredo, token } = await emitirToken(est.id, alvo, {
    criadoPor: null,
    rotulo: rotulo || (userAgent || '').slice(0, 120) || null,
  });

  cache.clear(); cacheConta.clear();
  return { ok: true, segredo, token, estacao: publico(est) };
}


async function resolverToken(segredo, { ip, tipo } = {}) {
  const bruto = String(segredo || '');
  if (!bruto.startsWith('tk_') || bruto.length < 20) return { ok: false, motivo: 'token_invalido' };

  const hash = hashToken(bruto);
  const agora = Date.now();

  let entrada = cache.get(hash);
  if (!entrada || entrada.exp <= agora) {
    const { data: linha, error } = await supabase
      .from('totem_estacao_tokens')
      .select('id, estacao_id, tipo, expira_em, revogado_em, linhagem')
      .eq('token_hash', hash).maybeSingle();
    if (error) throw error;
    if (!linha) return { ok: false, motivo: 'token_invalido' };

    const { data: est, error: e2 } = await supabase
      .from('totem_estacoes').select(SELECT_ESTACAO).eq('id', linha.estacao_id).maybeSingle();
    if (e2) throw e2;
    if (!est) return { ok: false, motivo: 'token_invalido' };

    entrada = { linha, estacao: est, exp: agora + CACHE_TTL_MS };
    cache.set(hash, entrada);
  }

  const { linha, estacao } = entrada;

  if (linha.revogado_em) return { ok: false, motivo: 'estacao_revogada' };
  if (linha.expira_em && new Date(linha.expira_em) <= new Date(agora)) return { ok: false, motivo: 'token_expirado' };
  if (!estacao.ativo || estacao.revogada_em) return { ok: false, motivo: 'estacao_revogada' };
  if (tipo && linha.tipo !== tipo) return { ok: false, motivo: 'token_invalido' };


  if (!ipDentroDoCerco(ip, estacao.ip_permitidos)) return { ok: false, motivo: 'ip_nao_permitido' };

  return { ok: true, estacao, token: linha };
}















const cacheConta = new Map();

async function estacaoDaConta(contaId) {
  if (!contaId) return null;

  const agora = Date.now();
  const cached = cacheConta.get(contaId);
  if (cached && cached.exp > agora) return cached.estacao;

  const { data, error } = await supabase
    .from('totem_estacoes').select(SELECT_ESTACAO)
    .eq('conta_id', contaId).maybeSingle();
  if (error) {



    console.warn('[totem-estacao] estacaoDaConta:', error.message);
    return null;
  }

  const viva = data && data.ativo && !data.revogada_em ? data : null;
  cacheConta.set(contaId, { estacao: viva, exp: agora + CACHE_TTL_MS });
  return viva;
}



async function heartbeat(estacao, { ip, userAgent, versao } = {}) {
  const ultima = estacao.ultima_batida_em ? new Date(estacao.ultima_batida_em).getTime() : 0;
  if (Date.now() - ultima < CACHE_TTL_MS) return { ok: true, pulado: true };

  const { error } = await supabase.from('totem_estacoes').update({
    ultima_batida_em: new Date().toISOString(),
    ultimo_ip: ip || null,
    ultimo_user_agent: (userAgent || '').slice(0, 300) || null,
    versao_app: versao || estacao.versao_app || null,
  }).eq('id', estacao.id);
  if (error) return { ok: false, motivo: error.message };

  cache.clear(); cacheConta.clear();
  return { ok: true };
}


async function revogarToken(tokenId, { por, motivo }) {
  const m = String(motivo || '').trim();
  if (m.length < 3) return { ok: false, motivo: 'motivo_obrigatorio' };
  const { data, error } = await supabase.from('totem_estacao_tokens')
    .update({ revogado_em: new Date().toISOString(), revogado_por: por || null, revogado_motivo: m })
    .eq('id', tokenId).is('revogado_em', null).select('id, estacao_id');
  if (error) throw error;
  cache.clear(); cacheConta.clear();
  return { ok: true, revogados: data?.length || 0 };
}





async function revogarEstacao(estacaoId, { por, motivo }) {
  const m = String(motivo || '').trim();
  if (m.length < 3) return { ok: false, motivo: 'motivo_obrigatorio' };
  const agora = new Date().toISOString();

  const { error } = await supabase.from('totem_estacoes').update({
    ativo: false, revogada_em: agora, revogada_por: por || null, revogada_motivo: m,
  }).eq('id', estacaoId);
  if (error) throw error;

  await supabase.from('totem_estacao_tokens')
    .update({ revogado_em: agora, revogado_por: por || null, revogado_motivo: `estação revogada: ${m}` })
    .eq('estacao_id', estacaoId).is('revogado_em', null);

  cache.clear(); cacheConta.clear();
  return { ok: true };
}



function publico(est) {
  if (!est) return null;
  return {
    id: est.id, codigo: est.codigo, nome: est.nome, local: est.local,
    finalidades: est.finalidades || [], evento_fixo_id: est.evento_fixo_id,
    tef_ativo: !!est.tef_ativo,
    tem_impressora: !!est.printer_target,
  };
}

function limparCache() { cache.clear(); cacheConta.clear(); }

module.exports = {
  hashToken, gerarPareamento, emitirToken, parear, resolverToken,


  estacaoDaConta,
  heartbeat, revogarToken, revogarEstacao, publico, limparCache,
  gerarCodigo,
};
