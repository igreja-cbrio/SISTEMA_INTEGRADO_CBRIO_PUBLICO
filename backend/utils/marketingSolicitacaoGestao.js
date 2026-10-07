'use strict';















const SOL_CONCLUIDA = new Set(['concluido', 'avaliado']);
const SOL_RECUSADA = new Set(['rejeitado', 'cancelado']);
const SOL_PORTAO = 'aguardando_aprovacao_origem';

const ETAPAS = {
  aguardando_aprovacao: { rotulo: 'Aguardando o diretor da área', ordem: 1 },
  aguardando_alocacao: { rotulo: 'Esperando alocação', ordem: 2 },
  sem_tarefa: { rotulo: 'Triada, sem tarefa', ordem: 2 },
  em_producao: { rotulo: 'Em produção', ordem: 3 },
  em_revisao: { rotulo: 'Em revisão', ordem: 3 },
  entregue: { rotulo: 'Entregue · aguardando o solicitante', ordem: 4 },
  concluida: { rotulo: 'Concluída', ordem: 5 },
  recusada: { rotulo: 'Recusada', ordem: 5 },
};


const ACOES = {
  alocar: 'Transformar o pedido em tarefa da equipe',
  recusar: 'Recusar o pedido, com o motivo para quem pediu',
  entregar: 'Concluir a tarefa e avisar quem pediu que foi entregue',
  encerrar: 'Encerrar a solicitação em nome de quem pediu',
  reabrir: 'Voltar a tarefa para produção',
  fechar_tarefa: 'Fechar a tarefa que ficou aberta aqui',
};

const MOTIVO_MIN = 10;
const TEXTO_MAX = 500;

const vivos = (cards) => (Array.isArray(cards) ? cards : []).filter(c => c && !c.deleted_at);

function etapaDaSolicitacao({ solicitacao, campanha = null, cards = [] } = {}) {
  if (!solicitacao) return null;
  const st = solicitacao.status;
  const tarefas = vivos(cards);
  const abertas = tarefas.filter(c => c.estado !== 'concluido');

  if (SOL_RECUSADA.has(st) || (campanha && campanha.status === 'cancelada')) return 'recusada';
  if (SOL_CONCLUIDA.has(st)) return 'concluida';
  if (st === SOL_PORTAO) return 'aguardando_aprovacao';
  if (!tarefas.length) return campanha && campanha.status === 'triagem' ? 'aguardando_alocacao' : 'sem_tarefa';
  if (abertas.some(c => c.estado === 'revisao')) return 'em_revisao';
  if (abertas.length) return 'em_producao';
  return 'entregue';
}


function acoesPermitidas({ etapa, lider, campanha = null, cards = [] } = {}) {
  if (!lider || !etapa) return [];
  const abertas = vivos(cards).filter(c => c.estado !== 'concluido');
  switch (etapa) {
    case 'aguardando_alocacao':
    case 'sem_tarefa':


      return campanha ? ['alocar', 'recusar'] : ['recusar'];
    case 'em_producao':
    case 'em_revisao':
      return ['entregar'];
    case 'entregue':
      return ['encerrar', 'reabrir'];
    case 'concluida':
      return abertas.length ? ['fechar_tarefa'] : [];
    default:
      return [];
  }
}



function validarAcao(body = {}) {
  const acao = typeof body.acao === 'string' ? body.acao : '';
  if (!Object.prototype.hasOwnProperty.call(ACOES, acao)) return { erro: 'Ação desconhecida' };
  const texto = (v) => (typeof v === 'string' ? v.trim() : '');
  if (acao === 'recusar') {
    const motivo = texto(body.motivo);
    if (motivo.length < MOTIVO_MIN) return { erro: `Escreva o motivo da recusa (pelo menos ${MOTIVO_MIN} caracteres)` };
    if (motivo.length > TEXTO_MAX) return { erro: `O motivo pode ter até ${TEXTO_MAX} caracteres` };
    return { acao, motivo };
  }
  if (acao === 'encerrar') {
    const observacao = texto(body.observacao);
    if (observacao.length > TEXTO_MAX) return { erro: `A observação pode ter até ${TEXTO_MAX} caracteres` };
    return { acao, observacao: observacao || null };
  }
  return { acao };
}



function linhaDoTempo({ solicitacao, campanha = null, cards = [] } = {}) {
  if (!solicitacao) return [];
  const ev = [];
  const add = (quando, rotulo) => { if (quando) ev.push({ quando, rotulo }); };
  add(solicitacao.created_at, 'Pedido feito');
  if (solicitacao.aprovacao_origem_status === 'aprovada') add(solicitacao.aprovacao_origem_em, 'Aprovado pelo diretor da área');
  if (campanha) add(campanha.triada_em, 'Alocado para a equipe');
  const entregas = vivos(cards).map(c => c.entregue_em).filter(Boolean).sort();
  if (entregas.length) add(entregas[0], 'Entregue');
  if (SOL_CONCLUIDA.has(solicitacao.status)) add(solicitacao.concluido_em, 'Concluída');
  return ev.sort((a, b) => String(a.quando).localeCompare(String(b.quando)));
}


function subtarefasAbertas(tarefas = []) {
  return (Array.isArray(tarefas) ? tarefas : [])
    .filter(t => t && t.estado !== 'concluido')
    .reduce((n, t) => n + (t.itens || []).filter(i => !i.feito).length, 0);
}

module.exports = {
  ETAPAS,
  ACOES,
  MOTIVO_MIN,
  TEXTO_MAX,
  SOL_CONCLUIDA,
  SOL_RECUSADA,
  etapaDaSolicitacao,
  acoesPermitidas,
  validarAcao,
  linhaDoTempo,
  subtarefasAbertas,
};
