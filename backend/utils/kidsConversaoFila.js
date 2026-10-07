

















const STATUS = ['aplicada', 'pendente', 'resolvida', 'descartada'];
const FAIXAS = ['A', 'B'];
const ACOES = ['vincular', 'descartar', 'reabrir'];





const TRANSICOES = Object.freeze({
  pendente: ['resolvida', 'descartada'],
  resolvida: ['descartada'],
  descartada: ['pendente'],
  aplicada: [],
});

function statusConhecido(s) {
  return typeof s === 'string' && STATUS.includes(s);
}




function transicaoValida(de, para) {
  if (!statusConhecido(de) || !statusConhecido(para)) return false;
  return TRANSICOES[de].includes(para);
}

function textoUtil(v, min = 1) {
  return typeof v === 'string' && v.trim().length >= min;
}







function avaliarResolucao({ linha, acao, criancaId, nota } = {}) {
  if (!linha || typeof linha !== 'object') {
    return { ok: false, codigo: 'linha_ausente', mensagem: 'Linha da fila não encontrada.' };
  }
  if (!ACOES.includes(acao)) {
    return { ok: false, codigo: 'acao_invalida', mensagem: 'Ação não reconhecida.' };
  }

  if (acao === 'vincular') {



    if (!textoUtil(criancaId, 10)) {
      return { ok: false, codigo: 'crianca_obrigatoria', mensagem: 'Escolha a criança antes de vincular.' };
    }
    if (!transicaoValida(linha.status, 'resolvida')) {
      return {
        ok: false,
        codigo: 'transicao_invalida',
        mensagem: linha.status === 'aplicada'
          ? 'Esta linha já virou vínculo. Desfazer é feito na ficha da criança.'
          : `Não dá para vincular uma linha em "${linha.status}".`,
      };
    }
    return { ok: true, statusNovo: 'resolvida', vincula: true };
  }

  if (acao === 'descartar') {



    if (!textoUtil(nota, 3)) {
      return { ok: false, codigo: 'nota_obrigatoria', mensagem: 'Escreva o motivo do descarte.' };
    }
    if (!transicaoValida(linha.status, 'descartada')) {
      return {
        ok: false,
        codigo: 'transicao_invalida',
        mensagem: linha.status === 'aplicada'
          ? 'Esta linha já virou vínculo e não pode ser descartada por aqui.'
          : `Não dá para descartar uma linha em "${linha.status}".`,
      };
    }
    return { ok: true, statusNovo: 'descartada', vincula: false };
  }


  if (!transicaoValida(linha.status, 'pendente')) {
    return { ok: false, codigo: 'transicao_invalida', mensagem: 'Só linha descartada volta para a fila.' };
  }
  return { ok: true, statusNovo: 'pendente', vincula: false };
}







function resumoFila(linhas) {
  const lista = Array.isArray(linhas) ? linhas.filter(Boolean) : [];
  const porStatus = { aplicada: 0, pendente: 0, resolvida: 0, descartada: 0 };
  let desconhecido = 0;
  let semCulto = 0;
  let semCrianca = 0;

  for (const l of lista) {
    if (statusConhecido(l.status)) porStatus[l.status] += 1;
    else desconhecido += 1;
    if (!l.culto_id) semCulto += 1;
    if (!l.crianca_id) semCrianca += 1;
  }

  const somaStatus = STATUS.reduce((s, k) => s + porStatus[k], 0) + desconhecido;
  return {
    total: lista.length,
    ...porStatus,
    desconhecido,
    sem_culto: semCulto,
    sem_crianca: semCrianca,

    a_conferir: porStatus.pendente,
    fecha: somaStatus === lista.length,
  };
}

module.exports = { STATUS, FAIXAS, ACOES, TRANSICOES, transicaoValida, avaliarResolucao, resumoFila };
