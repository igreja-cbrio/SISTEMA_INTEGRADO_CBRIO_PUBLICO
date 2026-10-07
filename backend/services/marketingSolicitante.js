




const { supabase } = require('../utils/supabase');
const { escolherVinculoSolicitante } = require('../utils/marketingSolicitante');

const CAMPOS_CARD = 'id, origem, estado, titulo, solicitacao_id, campanha_id';












async function solicitanteDoCard(cardOuId) {
  let card = cardOuId;

  if (typeof cardOuId === 'string') {
    const { data, error } = await supabase
      .from('marketing_kanban_cards')
      .select(CAMPOS_CARD)
      .eq('id', cardOuId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) return { erro: true, motivo: error.message };
    card = data;
  }
  if (!card) return null;

  let campanha = null;
  if (!card.solicitacao_id && card.campanha_id) {
    const { data, error } = await supabase
      .from('marketing_campanhas')
      .select('id, solicitacao_id, solicitante_id, deleted_at')
      .eq('id', card.campanha_id)
      .maybeSingle();
    if (error) return { erro: true, motivo: error.message };
    campanha = data;
  }

  const vinculo = escolherVinculoSolicitante({ card, campanha });
  if (!vinculo) return null;

  const { data: sol, error: eSol } = await supabase
    .from('solicitacoes')
    .select('id, solicitante_id, titulo')
    .eq('id', vinculo.solicitacao_id)
    .is('deleted_at', null)
    .maybeSingle();
  if (eSol) return { erro: true, motivo: eSol.message };



  if (!sol) return null;

  return {
    solicitacao_id: sol.id,
    solicitante_id: sol.solicitante_id || null,
    titulo_solicitacao: sol.titulo || null,
    via: vinculo.via,
  };
}



async function ehSolicitanteDoCard(cardOuId, userId) {
  if (!userId) return false;
  const r = await solicitanteDoCard(cardOuId);
  if (!r || r.erro) return false;
  return r.solicitante_id === userId;
}

module.exports = { solicitanteDoCard, ehSolicitanteDoCard };
