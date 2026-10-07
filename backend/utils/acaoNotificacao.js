
















const MAX_ESCALAS = 8;

function _ids(valor) {
  if (!Array.isArray(valor)) return [];
  const vistos = new Set();
  for (const v of valor) {
    if (typeof v === 'string' && v.trim()) vistos.add(v.trim());
    if (vistos.size >= MAX_ESCALAS) break;
  }
  return [...vistos];
}













function acoesDaNotificacao(tipo, data) {
  const d = data && typeof data === 'object' ? data : {};
  if (d.acao) return { acoes: [], feita: String(d.acao) };

  if (tipo === 'escala') {
    const ids = _ids(d.escala_ids);
    if (!ids.length) return { acoes: [], feita: null };
    return { acoes: ['confirmar', 'nao_posso'], feita: null, escalaIds: ids };
  }

  if (tipo === 'grupo_pedido') {
    const pedidoId = typeof d.pedido_id === 'string' && d.pedido_id.trim() ? d.pedido_id.trim() : null;
    if (!pedidoId) return { acoes: [], feita: null };
    return { acoes: ['aprovar', 'recusar'], feita: null, pedidoId };
  }

  return { acoes: [], feita: null };
}



function acaoPermitida(tipo, data, acao) {
  if (typeof acao !== 'string') return false;
  return acoesDaNotificacao(tipo, data).acoes.includes(acao);
}





function statusDaAcao(acao) {
  if (acao === 'confirmar') return 'confirmed';
  if (acao === 'nao_posso') return 'declined';
  return null;
}

module.exports = { acoesDaNotificacao, acaoPermitida, statusDaAcao, MAX_ESCALAS };
