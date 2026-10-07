
















const { supabase } = require('../utils/supabase');
const { notificar } = require('./notificar');
const { normalizarTelefone } = require('./whatsappService');

const JANELA_DISPARO_DIAS = 7;

function semFalhar(p, tag) {
  return Promise.resolve(p).then(r => { if (r?.error) console.warn(tag, r.error.message); return r; }, e => { console.warn(tag, e?.message); return null; });
}

async function conversaPorTelefone(telefone) {
  const tel = normalizarTelefone(telefone) || String(telefone || '').replace(/\D+/g, '');
  if (!tel) return null;
  const { data, error } = await supabase.from('wa_conversas')
    .select('id, nome, telefone, protocolo, resolvida, notas, area')
    .eq('telefone', tel).is('deleted_at', null).maybeSingle();
  if (error) { console.warn('[waRuido] conversa:', error.message); return null; }
  return data || null;
}


async function houveDisparoRecente(telefone, dias = JANELA_DISPARO_DIAS) {
  const d = String(telefone || '').replace(/\D+/g, '');
  const tel8 = d.slice(-8);
  if (tel8.length < 8) return false;
  const desde = new Date(Date.now() - dias * 86400000).toISOString();
  const { count, error } = await supabase.from('whatsapp_envios')
    .select('id', { count: 'exact', head: true })
    .eq('tel8', tel8).eq('status', 'enviado').gte('criado_em', desde);
  if (error) { console.warn('[waRuido] disparo recente:', error.message); return false; }
  return (count || 0) > 0;
}

async function gravarTrilha({ messageId, telefone, texto, tipo, sinais, efeito }) {
  await semFalhar(supabase.from('whatsapp_coletas').insert({
    whatsapp_message_id: messageId, telefone, raw_text: String(texto || '').slice(0, 2000),
    status: 'ignorado', erro: `ruido:${tipo}`, modulo_destino: 'conversas',
    parsed: { ruido: { tipo, sinais, efeito } },
  }), '[waRuido] trilha');
}






async function tratar({ telefone, texto, messageId, tipo, sinais = [] }) {
  try {
    if (tipo === 'auto_resposta_empresa') {
      const houve = await houveDisparoRecente(telefone);
      if (!houve) {
        await gravarTrilha({ messageId, telefone, texto, tipo, sinais, efeito: 'sem_disparo_nosso' });
        return { tratado: false, efeito: 'sem_disparo_nosso' };
      }
      const conv = await conversaPorTelefone(telefone);
      if (!conv) { await gravarTrilha({ messageId, telefone, texto, tipo, sinais, efeito: 'sem_conversa' }); return { tratado: true, efeito: 'sem_conversa' }; }


      const { data: mudou } = await semFalhar(supabase.from('wa_conversas')
        .update({ resolvida: true }).eq('id', conv.id).eq('resolvida', false).select('id'), '[waRuido] finalizar') || {};
      if (mudou?.length) {
        await semFalhar(supabase.from('wa_mensagens').insert({
          conversa_id: conv.id, direcao: 'out', tipo: 'sistema', autor_id: null,
          texto: '🤖 Resposta automática de empresa detectada — conversa finalizada sozinha. Se uma pessoa escrever, ela reabre.',
        }), '[waRuido] nota');
      }
      await gravarTrilha({ messageId, telefone, texto, tipo, sinais, efeito: mudou?.length ? 'finalizada' : 'ja_finalizada' });
      return { tratado: true, efeito: mudou?.length ? 'finalizada' : 'ja_finalizada' };
    }

    if (tipo === 'nao_sou_eu') {
      const conv = await conversaPorTelefone(telefone);
      if (conv) {
        const marca = '⚠ A pessoa disse que não é o contato certo';
        if (!String(conv.notas || '').includes(marca)) {
          const dia = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
          const notas = `${conv.notas ? conv.notas + '\n' : ''}${marca} (${dia}) · conferir o cadastro na Membresia.`;
          await semFalhar(supabase.from('wa_conversas').update({ notas }).eq('id', conv.id), '[waRuido] notas');
        }
        await notificar({
          modulo: 'membresia', tipo: 'contato_nao_e_a_pessoa', severidade: 'aviso',
          titulo: 'Contato de WhatsApp não é a pessoa cadastrada',
          mensagem: `${conv.nome || conv.telefone} respondeu que não é a pessoa (ou pediu correção do cadastro): "${String(texto || '').slice(0, 140)}". Conferir e corrigir o telefone na Membresia.`,
          link: `/comunicacao?tab=conversas&telefone=${encodeURIComponent(conv.telefone || '')}`,
          chaveDedup: `wa_nao_sou_eu_${conv.id}`,
        }).catch(e => console.warn('[waRuido] notificar:', e.message));
      }
      await gravarTrilha({ messageId, telefone, texto, tipo, sinais, efeito: conv ? 'avisado_membresia' : 'sem_conversa' });
      return { tratado: true, efeito: conv ? 'avisado_membresia' : 'sem_conversa' };
    }
    return { tratado: false, efeito: 'tipo_desconhecido' };
  } catch (e) {
    console.error('[waRuido]', e.message);
    return { tratado: false, efeito: 'erro' };
  }
}

module.exports = { tratar, houveDisparoRecente, JANELA_DISPARO_DIAS };
