'use strict';













const STATUS_ENCERRADOS = Object.freeze([
  'concluido', 'rejeitado', 'cancelado', 'avaliado',
]);







function aceitaVinculo(sol) {
  if (!sol) return false;
  if (sol.deleted_at) return false;
  if (sol.categoria !== 'compras') return false;
  return !STATUS_ENCERRADOS.includes(sol.status);
}







function podeVincular(sol, ator) {
  if (!sol || !ator?.userId) return false;
  if (['admin', 'diretor'].includes(ator.role)) return true;
  if (sol.solicitante_id === ator.userId) return true;
  if (sol.responsavel_id === ator.userId) return true;

  if (!sol.area_responsavel) return false;
  const areas = Array.isArray(ator.areasResponsavel) ? ator.areasResponsavel : [];
  return areas.includes(sol.area_responsavel);
}


function candidatas(solicitacoes, ator) {
  return (Array.isArray(solicitacoes) ? solicitacoes : [])
    .filter((s) => aceitaVinculo(s) && podeVincular(s, ator));
}

module.exports = { aceitaVinculo, podeVincular, candidatas, STATUS_ENCERRADOS };
