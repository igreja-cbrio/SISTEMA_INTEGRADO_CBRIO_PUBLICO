




















const { supabase } = require('../utils/supabase');
const { sendTemplate, sendText, configurado } = require('./whatsappService');
const waSender = require('./waSender');
const { notificar } = require('./notificar');



function podeRegistrar() {
  return waSender.isConfigured();
}








const ESTADOS_TEMPLATE_BLOQUEADOS = new Set(['REJECTED', 'PAUSED', 'DISABLED']);
let cacheTemplates = { em: 0, mapa: new Map() };
async function templateBloqueado(nome) {
  if (!nome) return false;
  if (Date.now() - cacheTemplates.em > 5 * 60 * 1000) {
    try {
      const { data } = await supabase.from('wa_templates').select('nome, status_meta').limit(500);
      cacheTemplates = {
        em: Date.now(),
        mapa: new Map((data || []).map(t => [t.nome, String(t.status_meta || '').toUpperCase()])),
      };
    } catch {                                                       }
  }
  return ESTADOS_TEMPLATE_BLOQUEADOS.has(cacheTemplates.mapa.get(nome));
}

const TEMPLATE_LANG = process.env.WHATSAPP_TEMPLATE_LANG || 'pt_BR';


const BACKOFF_MIN = [30, 120, 360, 720, 1440];












const IDADE_MIN_DESISTIR_H = 36;
const RETRY_APOS_ESGOTAR_MIN = 60;






const MAX_POR_TELEFONE_POR_RODADA = 2;




function decidirRetry({ reason, tentativas, maxTentativas, idadeHoras, permanente }) {


  if (reason === 'disabled') {
    return { status: 'pendente', tentativas, backoffMin: BACKOFF_MIN[0], terminal: false };
  }
  const n = tentativas + 1;
  if (permanente) return { status: 'erro', tentativas: n, backoffMin: BACKOFF_MIN[0], terminal: true };

  const acabaramTentativas = n >= (maxTentativas || 5);
  if (acabaramTentativas && idadeHoras >= IDADE_MIN_DESISTIR_H) {
    return { status: 'erro', tentativas: n, backoffMin: BACKOFF_MIN[0], terminal: true };
  }
  if (acabaramTentativas) {

    return { status: 'pendente', tentativas: n, backoffMin: RETRY_APOS_ESGOTAR_MIN, terminal: false };
  }
  return {
    status: 'pendente',
    tentativas: n,
    backoffMin: BACKOFF_MIN[Math.min(Math.max(n - 1, 0), BACKOFF_MIN.length - 1)],
    terminal: false,
  };
}


function limitarPorTelefone(pendentes, max = MAX_POR_TELEFONE_POR_RODADA) {
  const conta = new Map();
  const saida = [];
  for (const p of pendentes || []) {
    const k = String(p.telefone || '');
    const n = (conta.get(k) || 0) + 1;
    conta.set(k, n);
    if (n <= max) saida.push(p);
  }
  return saida;
}







const CODIGOS_META_PERMANENTES = new Set([100, 131026, 131030, 132000, 132001, 132005, 132007, 132012]);
function falhaPermanente(r) {
  if (r.reason === 'invalid_phone') return true;
  if (r.reason === 'link_local') return true;
  if (r.reason === 'api_error') return CODIGOS_META_PERMANENTES.has(Number(r.detail?.error?.code));
  return false;
}






async function avisarFalhaTerminal(e, razao) {
  try {




    const { moduloDoContexto } = require('./whatsappContexto');
    const { modulo, link } = moduloDoContexto(e.contexto);
    await notificar({
      modulo,
      tipo: 'whatsapp_envio_falhou',
      titulo: 'Mensagem de WhatsApp não entregue',
      mensagem: `${e.tipo === 'texto' ? 'A mensagem de texto' : `O template "${e.template}"`} para o telefone ${e.telefone} falhou de vez (${String(razao).slice(0, 140)}). Contexto: ${e.contexto || '—'}. Confira o telefone no cadastro e reenvie.`,
      link,
      severidade: 'aviso',
      chaveDedup: `wpp_envio_falha_${e.id}`,
    });
  } catch (err) {
    console.warn('[whatsappFila] aviso de falha terminal:', err.message);
  }
}



async function enfileirar({ telefone, template, texto, params, contexto, refId, idioma }) {
  if (!podeRegistrar()) return { queued: false, sent: false, reason: 'disabled' };
  if (!telefone || (!template && !texto)) return { queued: false, sent: false, reason: 'dados_incompletos' };
  if (template && !texto && await templateBloqueado(template)) {
    return { queued: false, sent: false, reason: 'template_rejeitado_na_meta' };
  }
  const tipo = texto && !template ? 'texto' : 'template';

  const { data: row, error } = await supabase.from('whatsapp_envios').insert({
    telefone,
    tipo,
    template: tipo === 'template' ? template : null,
    texto: tipo === 'texto' ? String(texto) : null,
    idioma: idioma || TEMPLATE_LANG,
    params: Array.isArray(params) ? params : [],
    contexto: contexto || null,
    ref_id: refId || null,
  }).select('id').single();

  if (error) {


    console.error('[whatsappFila] insert falhou (envio direto):', error.message);
    const direto = tipo === 'texto'
      ? await sendText(telefone, texto)
      : await sendTemplate(telefone, template, idioma || TEMPLATE_LANG, params || []);
    return { queued: false, sent: direto.sent === true, reason: direto.sent ? null : (direto.reason || 'api_error'), messageId: direto.messageId || null };
  }



  if (!configurado()) return { queued: true, id: row.id, sent: false, reason: 'disabled' };

  const r = await tentarEnvio(row.id);
  return { queued: true, id: row.id, ...r };
}


async function tentarEnvio(id) {
  const { data: e, error } = await supabase.from('whatsapp_envios').select('*').eq('id', id).maybeSingle();
  if (error || !e) return { sent: false, reason: 'nao_encontrado' };
  if (e.status !== 'pendente') return { sent: false, reason: `status_${e.status}` };



  if (e.tipo === 'template' && await templateBloqueado(e.template)) {
    await supabase.from('whatsapp_envios').update({
      status: 'erro',
      tentativas: (e.tentativas || 0) + 1,
      erro: 'template_rejeitado_na_meta',
    }).eq('id', id);
    await avisarFalhaTerminal(e, 'template rejeitado na Meta');
    return { sent: false, reason: 'template_rejeitado_na_meta' };
  }

  const r = e.tipo === 'texto'
    ? await sendText(e.telefone, e.texto)
    : await sendTemplate(e.telefone, e.template, e.idioma, Array.isArray(e.params) ? e.params : []);

  if (r.sent) {
    await supabase.from('whatsapp_envios').update({
      status: 'enviado',
      tentativas: (e.tentativas || 0) + 1,
      message_id: r.messageId || null,
      erro: null,
      enviado_em: new Date().toISOString(),
    }).eq('id', id);
    return { sent: true, messageId: r.messageId || null };
  }

  const razao = r.reason === 'api_error'
    ? (r.detail?.error?.message || `HTTP ${r.status || '?'}`)
    : (r.reason || 'erro_desconhecido');
  const idadeHoras = e.criado_em
    ? (Date.now() - new Date(e.criado_em).getTime()) / 3600000
    : 0;
  const d = decidirRetry({
    reason: r.reason,
    tentativas: e.tentativas || 0,
    maxTentativas: e.max_tentativas || 5,
    idadeHoras,
    permanente: falhaPermanente(r),
  });

  await supabase.from('whatsapp_envios').update({
    status: d.status,
    tentativas: d.tentativas,
    erro: String(razao).slice(0, 500),
    proxima_tentativa_em: new Date(Date.now() + d.backoffMin * 60000).toISOString(),
  }).eq('id', id);

  if (d.terminal) await avisarFalhaTerminal(e, razao);

  return { sent: false, reason: razao };
}






async function enfileirarLote(itens) {
  if (!podeRegistrar()) return { queued: 0, motivo: 'disabled' };
  const linhas = (itens || [])
    .filter(i => i && i.telefone && (i.template || i.texto))
    .map(i => {
      const tipo = i.texto && !i.template ? 'texto' : 'template';
      return {
        telefone: i.telefone,
        tipo,
        template: tipo === 'template' ? i.template : null,
        texto: tipo === 'texto' ? String(i.texto) : null,
        idioma: i.idioma || TEMPLATE_LANG,
        params: Array.isArray(i.params) ? i.params : [],
        contexto: i.contexto || null,
        ref_id: i.refId || null,
      };
    });
  if (!linhas.length) return { queued: 0 };


  let bloqueadosTemplate = 0;
  const aceitas = [];
  for (const l of linhas) {
    if (l.tipo === 'template' && await templateBloqueado(l.template)) { bloqueadosTemplate += 1; continue; }
    aceitas.push(l);
  }
  if (!aceitas.length) return { queued: 0, bloqueados_template: bloqueadosTemplate, motivo: 'template_rejeitado_na_meta' };
  const { data, error } = await supabase.from('whatsapp_envios').insert(aceitas).select('id');
  if (error) {


    console.error('[whatsappFila] lote falhou, caindo pro individual:', error.message);
    let ok = 0;
    for (const i of itens) {
      const r = await enfileirar(i);
      if (r.sent || r.queued) ok += 1;
    }
    return { queued: ok, degradado: true };
  }
  return { queued: (data || []).length, ...(bloqueadosTemplate ? { bloqueados_template: bloqueadosTemplate } : {}) };
}




async function processarFila({ limite = 200 } = {}) {
  if (!configurado()) return { processados: 0, enviados: 0, motivo: 'disabled' };
  const agora = new Date().toISOString();
  const { data: pendentes, error } = await supabase.from('whatsapp_envios')
    .select('id, telefone')
    .eq('status', 'pendente')
    .lte('proxima_tentativa_em', agora)
    .order('criado_em', { ascending: true })
    .limit(limite);
  if (error) return { processados: 0, enviados: 0, erro: error.message };




  const naRodada = limitarPorTelefone(pendentes || []);
  let enviados = 0;
  for (const p of naRodada) {
    const r = await tentarEnvio(p.id);
    if (r.sent) enviados += 1;
  }
  return {
    processados: naRodada.length,
    enviados,
    adiadosPorTelefone: (pendentes || []).length - naRodada.length,
  };
}

module.exports = {
  enfileirar, enfileirarLote, processarFila, tentarEnvio,

  decidirRetry, limitarPorTelefone, falhaPermanente,
  IDADE_MIN_DESISTIR_H, MAX_POR_TELEFONE_POR_RODADA, BACKOFF_MIN,
};
