







const { supabase } = require('../utils/supabase');
const T = require('../utils/assistenteTemas');

const MODEL = process.env.ASSISTENTE_TEMAS_MODEL || 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 400;
const TIMEOUT_MODELO_MS = 30_000;
const RETENCAO_MESES = 12;
const TABELA = 'assistente_conversa_temas';

let _client = null;
function client() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY não configurada');
  if (!_client) {

    const Anthropic = require('@anthropic-ai/sdk');
    _client = new Anthropic({ timeout: TIMEOUT_MODELO_MS, maxRetries: 0 });
  }
  return _client;
}

async function classificarComModelo(turnos, nomePessoa) {
  const msg = await client().messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: T.montarSystemPrompt(),
    tools: [T.TOOL_CLASSIFICAR],
    tool_choice: { type: 'tool', name: T.TOOL_CLASSIFICAR.name },
    messages: [{ role: 'user', content: T.transcricaoParaModelo(turnos, { nomePessoa }) }],
  });
  const tool = (msg?.content || []).find((b) => b.type === 'tool_use');
  if (!tool?.input) throw new Error(msg?.stop_reason === 'max_tokens' ? 'modelo_resposta_cortada' : 'modelo_sem_resultado');
  return {
    ...T.normalizarClassificacao(tool.input, { nomePessoa }),
    tokens_in: msg?.usage?.input_tokens || 0,
    tokens_out: msg?.usage?.output_tokens || 0,
  };
}


function erroCurto(e) {
  const m = String(e?.message || e || 'erro').toLowerCase();
  if (m.includes('credit') || m.includes('saldo') || m.includes('billing')) return 'anthropic_sem_credito';
  if (m.includes('api_key') || m.includes('401') || m.includes('authentication')) return 'anthropic_chave_invalida';
  if (m.includes('timeout') || m.includes('timed out')) return 'modelo_timeout';
  if (m.includes('modelo_')) return m.slice(0, 60);
  return 'modelo_falhou';
}






async function registrarConversaVideo({ conversaId, telaRotulo, duracaoS, turnos, nomePessoa = null }) {
  const conversaHash = T.hashConversa(conversaId);
  const { data: existente, error: erroLeitura } = await supabase
    .from(TABELA).select('id, status').eq('canal', 'video').eq('conversa_hash', conversaHash).maybeSingle();
  if (erroLeitura) throw erroLeitura;
  if (existente) return { status: existente.status, repetida: true };

  const falas = T.normalizarTurnos(turnos);
  if (!T.temFalaDaPessoa(falas)) return { status: 'ignorada', motivo: 'sem_fala_da_pessoa' };

  const linha = {
    canal: 'video',
    conversa_hash: conversaHash,
    dia: T.diaBrt(),
    tela_rotulo: typeof telaRotulo === 'string' ? telaRotulo.slice(0, 80) : null,
    duracao_s: Number.isInteger(duracaoS) && duracaoS >= 0 && duracaoS < 24 * 3600 ? duracaoS : null,
    n_turnos: falas.length,
    versao_temas: T.VERSAO_TEMAS,
    modelo: null,
  };

  if (T.conversaSensivel(falas)) {
    Object.assign(linha, { status: 'descartado', sensivel_descartado: true });
  } else {
    try {
      const c = await classificarComModelo(falas, nomePessoa);
      Object.assign(linha, {
        status: 'classificado', tema: c.tema, tipo: c.tipo, resolvido: c.resolvido, resumo: c.resumo,
        tokens_in: c.tokens_in, tokens_out: c.tokens_out, modelo: MODEL,
      });
    } catch (e) {
      Object.assign(linha, { status: 'erro', erro: erroCurto(e), modelo: MODEL });
      console.error('[assistente-temas] classificação falhou:', erroCurto(e));
    }
  }



  const { error } = await supabase.from(TABELA).upsert(linha, { onConflict: 'canal,conversa_hash', ignoreDuplicates: true });
  if (error) throw error;
  return { status: linha.status };
}

async function lerPeriodo({ inicio, fim }) {
  const linhas = [];
  const pagina = 1000;
  for (let de = 0; ; de += pagina) {
    let q = supabase.from(TABELA)
      .select('dia, tela_rotulo, tema, tipo, resolvido, resumo, status')
      .order('dia', { ascending: false })
      .order('id', { ascending: true })
      .range(de, de + pagina - 1);
    if (inicio) q = q.gte('dia', inicio);
    if (fim) q = q.lte('dia', fim);
    const { data, error } = await q;
    if (error) throw error;
    linhas.push(...(data || []));
    if (!data || data.length < pagina) break;
  }
  return linhas;
}

async function resumoTemas({ inicio, fim }) {
  return { periodo: { inicio: inicio || null, fim: fim || null }, ...T.agregarTemas(await lerPeriodo({ inicio, fim })) };
}



async function expurgarTemasAntigos(agora = new Date()) {
  const limite = new Date(agora);
  limite.setUTCMonth(limite.getUTCMonth() - RETENCAO_MESES);
  const { error, count } = await supabase.from(TABELA)
    .delete({ count: 'exact' })
    .lt('created_at', limite.toISOString());
  if (error) throw error;
  return { apagadas: count || 0 };
}

module.exports = { registrarConversaVideo, resumoTemas, expurgarTemasAntigos, erroCurto };
