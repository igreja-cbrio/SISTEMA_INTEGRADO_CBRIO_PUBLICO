'use strict';
















const { supabase } = require('../utils/supabase');
const { notificar } = require('./notificar');

async function concluirSolicitacaoMarketing({ campanha = null, solicitacao = null, cards = [], porCoordenacao = false, observacao = null }) {
  const agora = new Date().toISOString();
  if (campanha && campanha.status !== 'concluida') {
    const { error } = await supabase.from('marketing_campanhas')
      .update({ status: 'concluida', updated_at: agora })
      .eq('id', campanha.id).neq('status', 'concluida');
    if (error) throw error;
  }

  const solId = solicitacao?.id || campanha?.solicitacao_id || null;
  let sol = null;
  if (solId) {


    const { data, error } = await supabase.from('solicitacoes')
      .update({ status: 'concluido', concluido_em: agora })
      .eq('id', solId).not('status', 'in', '("concluido","avaliado")')
      .select('id, titulo, solicitante_id').maybeSingle();
    if (error) throw error;
    sol = data;
  }

  const titulo = sol?.titulo || campanha?.titulo || 'Solicitação';
  if (porCoordenacao) {
    if (sol?.solicitante_id) {
      const obs = observacao ? ` — "${observacao}"` : '';
      await notificar({
        modulo: 'marketing',
        tipo: 'solicitacao_avaliar',
        titulo: `Avalie: ${titulo}`,
        mensagem: `Sua solicitação foi concluída${obs}. Avalie o atendimento em 30 segundos · ajuda muito a melhorar.`,
        link: '/solicitacoes',
        severidade: 'info',
        chaveDedup: `solicitacao_status_${sol.id}_concluido`,
        targetIds: [sol.solicitante_id],
      }).catch(err => console.error('[MARKETING] notify conclusão (solicitante):', err.message));
    }
  } else {
    const donoIds = [...new Set((cards || []).map(c => c && c.atribuido_a).filter(Boolean))];
    if (donoIds.length) {
      try {
        const { data: ms, error } = await supabase.from('marketing_membros').select('profile_id').in('id', donoIds);
        if (error) throw error;
        const pids = [...new Set((ms || []).map(m => m.profile_id).filter(Boolean))];
        if (pids.length) {
          await notificar({
            modulo: 'marketing', tipo: 'marketing_campanha_aprovada',
            titulo: `Demanda aprovada: ${titulo}`,
            mensagem: 'O solicitante aprovou a entrega completa · campanha concluída.',
            link: '/marketing', severidade: 'info',
            chaveDedup: `marketing_campanha_aprovada_${campanha?.id || solId}`, targetIds: pids,
          }).catch(err => console.error('[MARKETING] notify campanha aprovada:', err.message));
        }
      } catch (e) { console.error('[MARKETING] donos da conclusão:', e.message); }
    }
  }
  return { solicitacao_concluida: !!sol };
}

module.exports = { concluirSolicitacaoMarketing };
