










const waSender = require('./waSender');

const ENABLED = process.env.WHATSAPP_ENABLED === 'true';
const TEMPLATE_PEDIDO = process.env.WHATSAPP_TEMPLATE_PEDIDO || 'pedido_atualizado';
const TEMPLATE_LANG = process.env.WHATSAPP_TEMPLATE_LANG || 'pt_BR';

function configurado() {
  return !!(ENABLED && waSender.isConfigured());
}



function normalizarTelefone(raw) {
  return waSender.normalizarTelefone(raw, { strict: true });
}



async function sendTemplate(toRaw, templateName, language, parameters, opts = {}) {
  const to = normalizarTelefone(toRaw);
  if (!to) {
    return { sent: false, reason: 'invalid_phone', raw: toRaw };
  }
  if (!configurado()) {
    console.log('[WPP][DRY-RUN] template=%s lang=%s to=%s params=%j',
      templateName, language, to, parameters);
    return { sent: false, reason: 'disabled', to };
  }
  return waSender.sendTemplate(to, templateName, language, parameters || [], opts);
}


async function sendText(toRaw, texto, opts = {}) {
  const to = normalizarTelefone(toRaw);
  if (!to) return { sent: false, reason: 'invalid_phone' };
  if (!configurado()) {
    console.log('[WPP][DRY-RUN] text to=%s: %s', to, texto);
    return { sent: false, reason: 'disabled', to };
  }
  return waSender.sendText(to, texto, opts);
}


async function sendButtons(toRaw, corpo, botoes, opts = {}) {
  const to = normalizarTelefone(toRaw);
  if (!to) return { sent: false, reason: 'invalid_phone' };
  if (!configurado()) { console.log('[WPP][DRY-RUN] buttons to=%s: %s', to, corpo); return { sent: false, reason: 'disabled', to }; }
  return waSender.sendButtons(to, corpo, botoes, opts);
}


async function sendMedia(toRaw, kind, link, { filename, caption, ...opts } = {}) {
  const to = normalizarTelefone(toRaw);
  if (!to) return { sent: false, reason: 'invalid_phone' };
  if (!link) return { sent: false, reason: 'sem_link' };
  if (!configurado()) { console.log('[WPP][DRY-RUN] %s to=%s: %s', kind, to, link); return { sent: false, reason: 'disabled', to }; }
  return waSender.sendMedia(to, kind, link, { filename, caption, ...opts });
}


async function baixarMedia(mediaId) {
  return waSender.baixarMedia(mediaId);
}


async function sendPedidoAtualizado(telefone, vars) {
  const params = [
    vars.primeiroNome || 'Ola',
    vars.tituloSolicitacao || 'sua solicitação',
    vars.statusLabel || 'atualizado',
    vars.detalhe || '',
    vars.link || '',
  ];
  return sendTemplate(telefone, TEMPLATE_PEDIDO, TEMPLATE_LANG, params);
}


const TEMPLATE_DEVOCIONAL = process.env.WHATSAPP_TEMPLATE_DEVOCIONAL || 'devocional_diario';
async function sendDevocionalDiario(telefone, vars) {
  const params = [
    vars.primeiroNome || 'Ola',
    vars.titulo || 'devocional do dia',
    vars.link || '',
  ];
  return sendTemplate(telefone, TEMPLATE_DEVOCIONAL, TEMPLATE_LANG, params);
}










const { supabase } = require('../utils/supabase');

const TEMPLATES_APP = {
  inscricao_confirmada: process.env.WHATSAPP_TEMPLATE_INSCRICAO,
  doacao_recebida:      process.env.WHATSAPP_TEMPLATE_DOACAO,
  kids_vinculo:         process.env.WHATSAPP_TEMPLATE_KIDS_VINCULO,
  kids_precheckin:      process.env.WHATSAPP_TEMPLATE_KIDS_PRECHECKIN,
  batismo_lembrete:     process.env.WHATSAPP_TEMPLATE_BATISMO,
  escala_voluntario:    process.env.WHATSAPP_TEMPLATE_ESCALA,


  aniversario:          process.env.WHATSAPP_TEMPLATE_ANIVERSARIO2 || process.env.WHATSAPP_TEMPLATE_ANIVERSARIO,
  pedido_atualizado:    process.env.WHATSAPP_TEMPLATE_PEDIDO,
  familia_convite_aceito: process.env.WHATSAPP_TEMPLATE_FAMILIA_ACEITO,

  suporte_app:          process.env.WHATSAPP_TEMPLATE_SUPORTE_APP,
};



const TEMPLATES_MARKETING = new Set(['aniversario']);
const OPTIN_SEMPRE = process.env.WHATSAPP_OPTIN_OBRIGATORIO === '1';



async function notificarMembro(membroId, chave, params = [], { idioma = TEMPLATE_LANG } = {}) {
  try {
    const templateName = TEMPLATES_APP[chave];
    if (!templateName) return { skipped: 'template_nao_configurado' };
    if (!waSender.isConfigured()) return { skipped: 'wpp_nao_configurado' };
    if (!membroId) return { skipped: 'sem_membro' };

    const { data: m } = await supabase
      .from('mem_membros')
      .select('telefone, whatsapp_optin')
      .eq('id', membroId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!m?.telefone) return { skipped: 'sem_telefone' };

    const exigeOptin = TEMPLATES_MARKETING.has(chave) || OPTIN_SEMPRE;
    if (exigeOptin && !m.whatsapp_optin) return { skipped: 'sem_optin' };

    const to = normalizarTelefone(m.telefone);
    if (!to) return { skipped: 'telefone_invalido' };





    const { enfileirar } = require('./whatsappFila');
    const r = await enfileirar({
      telefone: to,
      template: templateName,
      params,
      idioma,
      contexto: `app.${chave}`,
      refId: membroId,
    });
    if (!r.sent) {
      console.warn('[WPP] notificarMembro %s não saiu na hora: %j', chave, { reason: r.reason, queued: r.queued });
    }
    return r;
  } catch (e) {
    console.warn('[WPP] notificarMembro %s exception:', chave, e.message);
    return { error: e.message };
  }
}

module.exports = {
  configurado,
  normalizarTelefone,
  sendTemplate,
  sendText,
  sendButtons,
  sendMedia,
  baixarMedia,
  sendPedidoAtualizado,
  sendDevocionalDiario,
  notificarMembro,
  TEMPLATES_APP,
};
