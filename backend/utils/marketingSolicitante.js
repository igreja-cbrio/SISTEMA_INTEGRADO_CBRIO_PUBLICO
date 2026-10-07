





































function escolherVinculoSolicitante(entrada) {




  if (!entrada || typeof entrada !== 'object') return null;
  const { card, campanha } = entrada;
  if (!card || typeof card !== 'object') return null;



  if (card.solicitacao_id) {
    return { solicitacao_id: card.solicitacao_id, solicitante_id: null, via: 'card' };
  }


  if (!card.campanha_id || !campanha || typeof campanha !== 'object') return null;





  if (campanha.id && campanha.id !== card.campanha_id) return null;



  if (campanha.deleted_at) return null;

  if (!campanha.solicitacao_id) return null;

  return {
    solicitacao_id: campanha.solicitacao_id,
    solicitante_id: campanha.solicitante_id || null,
    via: 'campanha',
  };
}




function semSolicitantePorDesenho(card) {
  if (!card || typeof card !== 'object') return false;
  return card.origem === 'evento' || (!card.solicitacao_id && !card.campanha_id);
}

module.exports = { escolherVinculoSolicitante, semSolicitantePorDesenho };
