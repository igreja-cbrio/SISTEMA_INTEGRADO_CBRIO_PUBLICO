























const { supabase } = require('../utils/supabase');
const { disparoDesligado } = require('./comunicacaoDisparosOff');
const V = require('../utils/botIaVarredura');
const R = require('../utils/botIaRegras');




const RUIDO = require('../utils/ruidoInbound');
const { ehSoAgradecimento } = require('../utils/agradecimento');

function ehRuidoDeEntrada(texto) {
  return ehSoAgradecimento(texto) || RUIDO.ehDigitoDeMenu(texto) || !!RUIDO.classificarRuido(texto).tipo;
}

const DISPARO_ID = 'bot_varredura_mensal';
const TABELA = 'wa_bot_varreduras';
const MODEL = process.env.WHATSAPP_BOT_IA_MODEL || 'claude-haiku-4-5-20251001';


const MAX_TOKENS = 4000;
const TIMEOUT_MODELO_MS = 90_000;



const URL_ERP = 'https://www.cbrio.org';


const TRAVADO_MS = 30 * 60 * 1000;


const TETO_LEITURA = 20000;
const LOTE_IN = 200;

function tabelaAusente(error) {
  return error && (error.code === '42P01' || error.code === 'PGRST205' || /wa_bot_varreduras/.test(error.message || ''));
}



async function lerLinha(periodo) {
  const { data, error } = await supabase.from(TABELA).select('*').eq('periodo', periodo).maybeSingle();
  if (error) throw error;
  return data || null;
}

async function lerConfigBotIa() {
  const { data, error } = await supabase.from('whatsapp_config').select('bot_ia').eq('id', 1).maybeSingle();
  if (error) return { botIa: R.lerConfigBotIa(null), erro: error.message };
  return { botIa: R.lerConfigBotIa(data?.bot_ia) };
}


async function lerMensagensDoPeriodo(periodo) {
  const { inicioIso, fimIso } = V.limitesUtcDoPeriodo(periodo);
  const out = [];
  let truncado = false;
  for (let off = 0; ; off += 1000) {
    const { data, error } = await supabase.from('wa_mensagens')
      .select('id, conversa_id, texto, criado_em')
      .eq('direcao', 'in').eq('tipo', 'text').not('texto', 'is', null)
      .gte('criado_em', inicioIso).lt('criado_em', fimIso)
      .order('criado_em', { ascending: true }).order('id', { ascending: true })
      .range(off, off + 999);

    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
    if (out.length >= TETO_LEITURA) { truncado = true; break; }
  }
  return { mensagens: out, leituraTruncada: truncado };
}

async function lerConversas(ids) {
  const mapa = new Map();
  const unicos = [...new Set(ids.filter(Boolean))];
  for (let i = 0; i < unicos.length; i += LOTE_IN) {
    const lote = unicos.slice(i, i + LOTE_IN);
    const { data, error } = await supabase.from('wa_conversas').select('id, area, telefone').in('id', lote);


    if (error) throw error;
    for (const c of data || []) mapa.set(c.id, c);
  }
  return mapa;
}

async function lerAreasBot() {
  const { data, error } = await supabase.from('wa_bot_areas').select('*').order('area');
  if (error) return { areas: [] };
  return { areas: (data || []).map(R.lerArea).filter(Boolean) };
}



let _client = null;
function client() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY não configurada');
  if (!_client) {


    const Anthropic = require('@anthropic-ai/sdk');
    _client = new Anthropic({ timeout: TIMEOUT_MODELO_MS, maxRetries: 0 });
  }
  return _client;
}

async function agruparComModelo({ system, user }) {
  const msg = await client().messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system,
    tools: [V.TOOL_AGRUPAR],
    tool_choice: { type: 'tool', name: V.TOOL_AGRUPAR.name },
    messages: [{ role: 'user', content: user }],
  });
  const tool = (msg?.content || []).find(b => b.type === 'tool_use');
  return {
    input: tool?.input || null,
    stop: msg?.stop_reason || null,
    tokensIn: msg?.usage?.input_tokens || 0,
    tokensOut: msg?.usage?.output_tokens || 0,
  };
}








async function atualizar(id, patch, { critico = false } = {}) {
  const { error } = await supabase.from(TABELA).update(patch).eq('id', id);
  if (error) {
    console.error('[botIaVarredura] update %s:', id, error.message);
    if (critico) throw error;
  }
}




async function reivindicar({ periodo, forcado, criadoPor }) {
  const agoraIso = new Date().toISOString();
  const nova = { periodo, status: 'rodando', forcado: !!forcado, criado_por: criadoPor || null, iniciado_em: agoraIso };
  let ins = await supabase.from(TABELA).insert(nova).select('*').maybeSingle();
  if (ins.error && ins.error.code === '23503' && nova.criado_por) {

    ins = await supabase.from(TABELA).insert({ ...nova, criado_por: null }).select('*').maybeSingle();
  }
  if (!ins.error) return { linha: ins.data };
  if (tabelaAusente(ins.error)) return { pulou: 'migration_ausente', migracaoAusente: true };
  if (ins.error.code !== '23505') throw ins.error;


  const ex = await lerLinha(periodo);
  if (!ex) return { pulou: 'em_curso' };
  if (ex.status === 'ok' || ex.status === 'sem_dados') return { pulou: 'ja_existe', varredura: ex };

  let podeRetomar = false;
  if (ex.status === 'erro') {


    if (!forcado) return { pulou: 'erro_anterior', varredura: ex };
    podeRetomar = true;
  } else if (ex.status === 'rodando') {
    const idade = Date.now() - new Date(ex.iniciado_em).getTime();
    if (Number.isFinite(idade) && idade < TRAVADO_MS) return { pulou: 'em_curso', varredura: ex };
    podeRetomar = true;
  }
  if (!podeRetomar) return { pulou: 'em_curso', varredura: ex };



  const { data: retomada, error } = await supabase.from(TABELA)
    .update({
      status: 'rodando', iniciado_em: agoraIso, forcado: !!forcado,
      criado_por: criadoPor || ex.criado_por || null, erro: null,
      email_erro: null, email_enviado_em: null, email_destinos: null,
    })
    .eq('id', ex.id).eq('status', ex.status).eq('iniciado_em', ex.iniciado_em)
    .select('*').maybeSingle();
  if (error) throw error;
  if (!retomada) return { pulou: 'em_curso' };
  return { linha: retomada };
}

async function enviarEmailResumo({ periodo, totais, temas, lacunas }) {
  const { botIa } = await lerConfigBotIa();
  const destinos = botIa.varredura_emails;
  if (!destinos.length) return { email_erro: 'sem_destinatarios' };
  const corpo = V.montarEmail({ periodo, totais, temas, lacunas, urlErp: URL_ERP });
  let r;
  try {
    const { enviarEmail, isConfigured } = require('./email');

    if (!isConfigured()) return { email_erro: 'email_sem_canal' };
    r = await enviarEmail({ to: destinos, subject: corpo.subject, html: corpo.html, text: corpo.text, fromName: 'Comunicação · CBRio' });
  } catch (e) {
    r = { ok: false, error: e.message };
  }
  if (!r?.ok) {


    return { email_erro: V.sanitizarErro(r?.error || 'falha_no_envio') };
  }
  return { email_enviado_em: new Date().toISOString(), email_destinos: destinos };
}







async function rodar({ periodo, forcado = false, criadoPor = null } = {}) {
  if (!V.periodoValido(periodo)) return { pulou: 'periodo_invalido' };



  if (!forcado && await disparoDesligado(DISPARO_ID)) return { pulou: 'desligado' };

  let claim;
  try {
    claim = await reivindicar({ periodo, forcado, criadoPor });
  } catch (e) {
    console.error('[botIaVarredura] reivindicar %s:', periodo, e.message);
    return { erro: V.sanitizarErro(e.message) };
  }
  if (!claim.linha) return claim;
  const linha = claim.linha;

  try {
    const { mensagens, leituraTruncada } = await lerMensagensDoPeriodo(periodo);
    const conversas = await lerConversas(mensagens.map(m => m.conversa_id));

    let excluidasPastoral = 0;
    let excluidasCuidados = 0;
    let excluidasRuido = 0;
    const analisaveis = [];
    for (const m of mensagens) {
      const conv = conversas.get(m.conversa_id) || null;

      if (conv && R.normalizarNome(conv.area) === 'cuidados') { excluidasCuidados += 1; continue; }
      if (V.ehPastoral(m.texto)) { excluidasPastoral += 1; continue; }



      if (ehRuidoDeEntrada(m.texto)) { excluidasRuido += 1; continue; }
      analisaveis.push({
        id: m.id, conversa_id: m.conversa_id, area: conv?.area || null,

        texto: V.mascararPII(m.texto, { telefoneConversa: conv?.telefone || null }),
      });
    }
    const amostra = V.prepararAmostra(analisaveis);
    const totais = {
      total_mensagens: mensagens.length,
      total_conversas: new Set(mensagens.map(m => m.conversa_id).filter(Boolean)).size,
      excluidas_pastoral: excluidasPastoral,
      excluidas_conversas_cuidados: excluidasCuidados,
    };

    if (!amostra.itens.length) {
      await atualizar(linha.id, { status: 'sem_dados', gerado_em: new Date().toISOString(), ...totais, temas: [], lacunas: [] }, { critico: true });
      await atualizar(linha.id, { excluidas_ruido: excluidasRuido });
      return { status: 'sem_dados', periodo, ...totais, excluidas_ruido: excluidasRuido };
    }

    const { areas } = await lerAreasBot();
    const nomesAreas = areas.map(a => a.area);
    const conhecimentoPorArea = Object.fromEntries(areas.map(a => [a.area, a.conhecimento]));
    const system = V.montarSystemPrompt({ areas: nomesAreas, conhecimentoPorArea });
    const user = V.montarUser({ amostra, periodo });

    const r = await agruparComModelo({ system, user });
    const { temas, lacunas } = V.normalizarSaidaModelo(r.input, { amostra, areasValidas: nomesAreas });

    if (!temas.length) {

      const motivo = r.stop === 'max_tokens' ? 'modelo_resposta_cortada' : 'modelo_sem_resultado';
      await atualizar(linha.id, { status: 'erro', erro: motivo, ...totais, modelo: MODEL, tokens_in: r.tokensIn, tokens_out: r.tokensOut });
      return { status: 'erro', erro: motivo, periodo };
    }

    await atualizar(linha.id, {
      status: 'ok', gerado_em: new Date().toISOString(), ...totais,
      temas, lacunas, modelo: MODEL, tokens_in: r.tokensIn, tokens_out: r.tokensOut,
    }, { critico: true });



    await atualizar(linha.id, { excluidas_ruido: excluidasRuido });

    const email = await enviarEmailResumo({
      periodo, temas, lacunas,
      totais: { ...totais, analisadas: amostra.itens.length, truncado: amostra.truncado || leituraTruncada },
    });
    await atualizar(linha.id, email);

    return {
      status: 'ok', periodo, ...totais, excluidas_ruido: excluidasRuido, temas: temas.length, lacunas: lacunas.length,
      analisadas: amostra.itens.length, truncado: amostra.truncado || leituraTruncada,
      email: email.email_enviado_em ? 'enviado' : (email.email_erro || 'nao_enviado'),
    };
  } catch (e) {
    const motivo = V.sanitizarErro(e?.message);
    console.error('[botIaVarredura] %s:', periodo, motivo);
    await atualizar(linha.id, { status: 'erro', erro: motivo });
    return { status: 'erro', erro: motivo, periodo };
  }
}


async function rodarSeDevido({ agoraMs = Date.now() } = {}) {
  const periodo = V.periodoAnterior(agoraMs);
  const { data, error } = await supabase.from(TABELA)
    .select('id, status, iniciado_em').eq('periodo', periodo).maybeSingle();
  if (error) {
    if (tabelaAusente(error)) return { periodo, executou: false, resultado: { pulou: 'migration_ausente' } };
    throw error;
  }


  const travada = data?.status === 'rodando'
    && Date.now() - new Date(data.iniciado_em).getTime() >= TRAVADO_MS;
  const jaExiste = !!data && !travada;
  if (!V.deveRodarAgora({ agoraMs, jaExiste })) {
    return { periodo, executou: false, motivo: jaExiste ? `ja_existe:${data.status}` : 'antes_das_6h' };
  }
  const resultado = await rodar({ periodo });


  return { periodo, executou: !!resultado.status, resultado };
}

async function listar({ limite = 12 } = {}) {
  const n = Math.min(Math.max(parseInt(limite, 10) || 12, 1), 36);
  const { data, error } = await supabase.from(TABELA).select('*')
    .order('periodo', { ascending: false }).limit(n);
  if (error) {
    if (tabelaAusente(error)) return { varreduras: [], migracaoAusente: true };
    throw error;
  }
  return { varreduras: data || [] };
}





async function exemplos(periodo) {
  if (!V.periodoValido(periodo)) return { erro: 'periodo_invalido' };
  let linha;
  try {
    linha = await lerLinha(periodo);
  } catch (e) {
    if (tabelaAusente(e)) return { migracaoAusente: true, temas: [] };
    throw e;
  }
  if (!linha) return { naoEncontrada: true, temas: [] };
  const temas = Array.isArray(linha.temas) ? linha.temas : [];
  const ids = [...new Set(temas.flatMap(t => (Array.isArray(t?.exemplo_ids) ? t.exemplo_ids : [])))].filter(Boolean);

  const msgs = new Map();
  for (let i = 0; i < ids.length; i += LOTE_IN) {
    const { data, error } = await supabase.from('wa_mensagens')
      .select('id, conversa_id, criado_em, texto').in('id', ids.slice(i, i + LOTE_IN));
    if (error) throw error;
    for (const m of data || []) msgs.set(m.id, m);
  }
  const conversas = await lerConversas([...msgs.values()].map(m => m.conversa_id));

  return {
    periodo,
    temas: temas.map(t => ({
      tema: t.tema, area_sugerida: t.area_sugerida, contagem: t.contagem,
      exemplos: (t.exemplo_ids || []).map(id => msgs.get(id)).filter(Boolean).map(m => ({
        id: m.id, conversa_id: m.conversa_id, criado_em: m.criado_em,
        texto: V.mascararPII(m.texto, { telefoneConversa: conversas.get(m.conversa_id)?.telefone || null }),
      })),
    })),
  };
}

module.exports = { DISPARO_ID, MODEL, URL_ERP, rodar, rodarSeDevido, listar, exemplos };
