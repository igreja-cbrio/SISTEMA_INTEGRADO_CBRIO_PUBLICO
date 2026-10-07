







const STATUS_ENCERRADOS = ['concluido', 'cancelado', 'rejeitado', 'avaliado'];

function estaEncerrada(status) {
  return STATUS_ENCERRADOS.includes(status);
}



function patchPodeMudarStatus(atual, novo) {
  if (!novo || novo === atual) return true;
  return !estaEncerrada(atual);
}

module.exports = { STATUS_ENCERRADOS, estaEncerrada, patchPodeMudarStatus };
