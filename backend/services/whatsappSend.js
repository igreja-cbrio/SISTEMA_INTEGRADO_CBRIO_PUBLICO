




const waSender = require('./waSender');

function isConfigured() {
  return waSender.isConfigured();
}



function normalizarTelefone(raw) {
  return waSender.normalizarTelefone(raw);
}



function traduz(r) {
  if (r.sent) return { ok: true, message_id: r.messageId || null };
  const error = r.reason === 'sem_credencial'
    ? 'whatsapp_nao_configurado'
    : (r.detail?.error?.message || (r.status ? `HTTP ${r.status}` : null) || r.detail || r.reason || 'erro');
  return { ok: false, error };
}




async function enviarTexto(telefone, texto, opts = {}) {
  return traduz(await waSender.sendText(telefone, texto, opts));
}


async function enviarTemplate(telefone, templateName, language, params = [], opts = {}) {
  if (!templateName) return { ok: false, error: 'template_nao_configurado' };
  return traduz(await waSender.sendTemplate(telefone, templateName, language, params, opts));
}

module.exports = { enviarTexto, enviarTemplate, normalizarTelefone, isConfigured };
