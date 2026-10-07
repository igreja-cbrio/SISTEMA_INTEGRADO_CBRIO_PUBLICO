




















const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || 'v21.0';

let avisouTokenLegado = false;
function token() {
  if (process.env.WHATSAPP_ACCESS_TOKEN) return process.env.WHATSAPP_ACCESS_TOKEN;
  if (process.env.WHATSAPP_TOKEN) {
    if (!avisouTokenLegado) {
      console.warn('[waSender] usando WHATSAPP_TOKEN legado — migrar pra WHATSAPP_ACCESS_TOKEN');
      avisouTokenLegado = true;
    }
    return process.env.WHATSAPP_TOKEN;
  }
  return null;
}

function isConfigured() {
  return !!(process.env.WHATSAPP_PHONE_NUMBER_ID && token());
}






function normalizarTelefone(raw, { strict = false } = {}) {
  const d = (raw || '').toString().replace(/\D+/g, '');
  if (!d) return strict ? null : '';
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) return d;
  if (d.length === 10 || d.length === 11) return '55' + d;
  return strict ? null : d;
}






const RE_URL_LOCAL = /localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|:\/\/(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/i;
function contemUrlLocal(payload) {
  try { return RE_URL_LOCAL.test(JSON.stringify(payload)); } catch { return false; }
}


async function postMessages(payload, { phoneNumberId, timeoutMs = 15000, rotulo = 'msg' } = {}) {
  const tk = token();
  const pnid = phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!tk || !pnid) {
    console.warn('[waSender] credenciais ausentes · pulando envio (%s)', rotulo);
    return { sent: false, reason: 'sem_credencial' };
  }
  if (contemUrlLocal(payload)) {
    console.error('[waSender] %s BLOQUEADO: mensagem contém URL local (FRONTEND_URL de dev?) · to=%s', rotulo, payload.to);
    return { sent: false, reason: 'link_local', to: payload.to };
  }
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${pnid}/messages`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('[waSender] %s erro %d: %s', rotulo, res.status, JSON.stringify(json));
      return { sent: false, reason: 'api_error', status: res.status, detail: json, to: payload.to };
    }
    return { sent: true, to: payload.to, messageId: json.messages?.[0]?.id || null };
  } catch (err) {
    console.error('[waSender] %s exception: %s', rotulo, err.message);
    return { sent: false, reason: 'exception', detail: err.message, to: payload.to };
  }
}


async function sendText(toRaw, texto, opts = {}) {
  const to = normalizarTelefone(toRaw);
  if (!to) return { sent: false, reason: 'invalid_phone' };
  return postMessages({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { body: String(texto).slice(0, 4096), preview_url: false },
  }, { ...opts, rotulo: 'text' });
}


async function sendTemplate(toRaw, templateName, language, params = [], opts = {}) {
  if (!templateName) return { sent: false, reason: 'template_nao_configurado' };
  const to = normalizarTelefone(toRaw);
  if (!to) return { sent: false, reason: 'invalid_phone' };
  return postMessages({
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: language || 'pt_BR' },
      components: params?.length
        ? [{ type: 'body', parameters: params.map(t => ({ type: 'text', text: String(t).slice(0, 1024) })) }]
        : undefined,
    },
  }, { ...opts, rotulo: `template:${templateName}` });
}


async function sendButtons(toRaw, corpo, botoes, opts = {}) {
  const to = normalizarTelefone(toRaw);
  if (!to) return { sent: false, reason: 'invalid_phone' };
  const buttons = (botoes || []).slice(0, 3).map(b => ({
    type: 'reply', reply: { id: String(b.id).slice(0, 256), title: String(b.title).slice(0, 20) },
  }));
  return postMessages({
    messaging_product: 'whatsapp', to, type: 'interactive',
    interactive: { type: 'button', body: { text: String(corpo).slice(0, 1024) }, action: { buttons } },
  }, { ...opts, rotulo: 'buttons' });
}


async function sendMedia(toRaw, kind, link, { filename, caption, ...opts } = {}) {
  const to = normalizarTelefone(toRaw);
  if (!to) return { sent: false, reason: 'invalid_phone' };
  if (!link) return { sent: false, reason: 'sem_link' };
  const midia = kind === 'document'
    ? { link, ...(filename ? { filename } : {}), ...(caption ? { caption } : {}) }
    : { link, ...(caption ? { caption } : {}) };
  return postMessages({
    messaging_product: 'whatsapp', to, type: kind, [kind]: midia,
  }, { ...opts, timeoutMs: 20000, rotulo: kind });
}


async function baixarMedia(mediaId) {
  const tk = token();
  if (!mediaId || !tk) return null;
  try {
    const meta = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${mediaId}`, {
      headers: { Authorization: `Bearer ${tk}` }, signal: AbortSignal.timeout(15000),
    }).then(r => r.json()).catch(() => null);
    if (!meta?.url) return null;
    const resp = await fetch(meta.url, { headers: { Authorization: `Bearer ${tk}` }, signal: AbortSignal.timeout(20000) });
    const buffer = Buffer.from(await resp.arrayBuffer());
    if (buffer.length > 16 * 1024 * 1024) return null;
    return { buffer, mime: meta.mime_type || resp.headers.get('content-type') || 'application/octet-stream' };
  } catch (err) { console.error('[waSender] baixarMedia:', err.message); return null; }
}

module.exports = {
  GRAPH_VERSION,
  isConfigured,
  normalizarTelefone,
  sendText,
  sendTemplate,
  sendButtons,
  sendMedia,
  baixarMedia,
};
