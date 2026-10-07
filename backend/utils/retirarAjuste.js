





















const MOTIVOS_DE_DEVOLUCAO = ['descricao', 'escopo', 'data'];
const COMENTARIO_MIN = 3;





function ehDevolucaoDaArea(ajuste) {
  return ajuste?.lado === 'responsavel' && MOTIVOS_DE_DEVOLUCAO.includes(ajuste?.motivo);
}


function ehPedidoDeAjuste(ajuste) {
  return MOTIVOS_DE_DEVOLUCAO.includes(ajuste?.motivo);
}









function podeRetirarAjuste({ sol, ultimoAjuste, comentario, usuarioId }) {
  if (!sol || sol.deleted_at) return { ok: false, motivo: 'nao_encontrada', erro: 'Solicitação não encontrada.' };


  if (usuarioId && sol.solicitante_id && usuarioId === sol.solicitante_id) {
    return { ok: false, motivo: 'solicitante', erro: 'Quem fez a solicitação responde ao ajuste reenviando.' };
  }
  if (sol.status !== 'aguardando_ajuste') {
    return { ok: false, motivo: 'status', erro: 'A solicitação não está aguardando ajuste.' };
  }
  if (!sol.status_antes_ajuste) {
    return { ok: false, motivo: 'sem_status_anterior', erro: 'Não dá para saber para onde a solicitação voltaria. Peça ao solicitante para reenviar.' };
  }
  if (!ehDevolucaoDaArea(ultimoAjuste)) {
    return { ok: false, motivo: 'nao_foi_a_area', erro: 'Só dá para retirar um pedido de ajuste feito pela área. Quando foi o solicitante quem pediu, é ele quem reenvia.' };
  }
  if (String(comentario || '').trim().length < COMENTARIO_MIN) {
    return { ok: false, motivo: 'comentario', erro: 'Diga em poucas palavras por que está retirando o pedido de ajuste.' };
  }
  return { ok: true };
}



function montarRetirada(sol) {
  return {
    status: sol.status_antes_ajuste,
    status_antes_ajuste: null,
    sla_pausado_em: null,
    vezes_refeita: Math.max(0, (Number(sol.vezes_refeita) || 0) - 1),
  };
}

module.exports = {
  MOTIVOS_DE_DEVOLUCAO, COMENTARIO_MIN, ehDevolucaoDaArea, ehPedidoDeAjuste, podeRetirarAjuste, montarRetirada,
};
