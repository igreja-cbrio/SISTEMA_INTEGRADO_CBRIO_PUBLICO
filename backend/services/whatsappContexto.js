















const { supabase } = require('../utils/supabase');
const { notificar } = require('./notificar');

const { moduloDoContexto, diaBrt } = require('../utils/whatsappModulo');

















async function avisarNaoEntregue(envio, motivo) {
  try {
    const { modulo, link } = moduloDoContexto(envio?.contexto);



    let quem = '';
    if (envio?.ref_id) {
      const { data: m } = await supabase
        .from('mem_membros').select('nome')
        .eq('id', envio.ref_id).is('deleted_at', null).maybeSingle();
      if (m?.nome) quem = m.nome;
    }

    const alvo = quem ? `${quem} (${envio.telefone})` : `o telefone ${envio?.telefone}`;
    await notificar({
      modulo,
      tipo: 'whatsapp_nao_entregue',
      titulo: 'WhatsApp não entregue',
      mensagem: `A mensagem para ${alvo} foi aceita pela Meta mas NÃO foi entregue (${String(motivo || 'falha na entrega').slice(0, 140)}). Normalmente é número sem WhatsApp ou número errado — confira o cadastro. Se houve mais falhas hoje, elas estão no histórico de envios.`,
      link,
      severidade: 'aviso',
      chaveDedup: `wpp_nao_entregue_${modulo}_${diaBrt()}`,
    });
  } catch (e) {
    console.warn('[whatsappContexto] aviso de não-entrega:', e.message);
  }
}

module.exports = { moduloDoContexto, avisarNaoEntregue, diaBrt };
