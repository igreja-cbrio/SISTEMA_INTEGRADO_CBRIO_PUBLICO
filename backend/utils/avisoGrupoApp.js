




































const TIPOS_ROTEADOS_HOJE = Object.freeze(['grupo_pedido']);


function primeiroNome(nome) {
  const t = String(nome ?? '').trim().split(/\s+/)[0];
  return t || 'Alguém';
}



















function avisoPedidoNovo({ pedidoId, grupoId, grupoNome, pessoaNome }) {
  if (!pedidoId || !grupoId) return null;
  const nome = primeiroNome(pessoaNome);
  const grupo = String(grupoNome ?? '').trim() || 'seu grupo';
  return {
    tipo: 'grupo_pedido',
    titulo: 'Novo pedido de entrada 👋',


    body: `${nome} quer entrar em ${grupo}. Fale com ${nome} antes de aprovar.`,
    data: { grupo_id: grupoId, pedido_id: pedidoId },
    chaveDedup: `grupo_pedido:${pedidoId}`,
  };
}
















function avisoSaida({ grupoId, grupoNome, pessoaNome, dia }) {
  if (!grupoId || !dia) return null;
  const nome = primeiroNome(pessoaNome);
  const grupo = String(grupoNome ?? '').trim() || 'seu grupo';
  return {
    tipo: 'grupo_saida',
    titulo: `${nome} saiu do grupo`,
    body: `${nome} saiu de ${grupo}.`,
    data: { grupo_id: grupoId },
    chaveDedup: `grupo_saida:${grupoId}:${String(pessoaNome ?? '').trim() || 'sem-nome'}:${dia}`,
  };
}

module.exports = { avisoPedidoNovo, avisoSaida, primeiroNome, TIPOS_ROTEADOS_HOJE };
