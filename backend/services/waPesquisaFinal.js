







const { supabase } = require('../utils/supabase');
const wpp = require('./whatsappService');
const waInbox = require('./waInbox');

function textoPesquisa(protocolo) {
  return `Sua conversa foi finalizada! 🙏\nProtocolo: *${protocolo || '—'}*\n\nDe *0 a 5*, como você avalia nosso atendimento? Responda só com o número (0 = péssimo · 5 = excelente).`;
}


async function enviarPesquisaFinalizacao(conv) {
  try {
    if (!conv?.telefone || !waInbox.dentroJanela24h(conv.last_inbound_at)) return false;
    const msg = textoPesquisa(conv.protocolo);
    const r = await wpp.sendText(conv.telefone, msg,
      conv.phone_number_id ? { phoneNumberId: conv.phone_number_id } : {}).catch(() => ({ sent: false }));
    if (!r?.sent) return false;
    await supabase.from('wa_conversas')
      .update({ pesquisa_estado: 'aguardando', pesquisa_em: new Date().toISOString() })
      .eq('id', conv.id).then(() => {}, () => {});
    await waInbox.registrarOutbound({ telefone: conv.telefone, texto: msg, tipo: 'pesquisa', waMessageId: r.messageId || null }).catch(() => {});
    return true;
  } catch (e) {
    console.warn('[waPesquisaFinal]', e.message);
    return false;
  }
}

module.exports = { enviarPesquisaFinalizacao, textoPesquisa };
