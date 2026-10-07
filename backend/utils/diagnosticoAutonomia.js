


























const FAIXAS = Object.freeze({
  AUTO: 'auto',
  PR: 'pr',
  HUMANO: 'humano',
});












const CLASSIFICACAO_DE_CODIGO = 'codigo';

const MOTIVO_CLASSIFICACAO = Object.freeze({
  dados: 'o agente classificou como problema de DADO, não de código — conserto por código não resolve',
  dependencia_externa: 'o agente classificou como dependência EXTERNA — não se conserta no nosso código',
  experiencia_usuario: 'o agente classificou como experiência de uso — é decisão de produto, não conserto',
  configuracao: 'o agente classificou como configuração — resolve-se em env/painel, não em código',
  infraestrutura: 'o agente classificou como infraestrutura — não é código do repositório',
  desconhecido: 'o agente NÃO identificou a causa — mandar consertar seria chute',
});

















const MARCAS_PROTEGIDAS = Object.freeze([
  { re: /\b(pagament|payment|checkout|cobran[cç]|boleto|\bpix\b|stripe|pagarme|mercado ?pago|santander)/i, area: 'pagamentos' },
  { re: /\b(financeir|dizim|d[ií]zim|oferta|conciliac|contab|fin_)/i, area: 'financeiro' },
  { re: /\b(autentica|autoriza|login|senha|credencial|oauth|jwt|service.?role|permiss)/i, area: 'autenticação e permissão' },
  { re: /\b(migration|migra[cç][aã]o de banco|drop (table|column)|alter table)/i, area: 'banco de dados' },
]);

function texto(item) {
  return [
    item?.titulo,
    item?.resumo,
    ...(Array.isArray(item?.plano_de_acao) ? item.plano_de_acao : []),
  ].filter(Boolean).join(' \n ');
}


function areaProtegida(item) {
  const t = texto(item);
  const achada = MARCAS_PROTEGIDAS.find((m) => m.re.test(t));
  return achada ? achada.area : null;
}












function foiReproduzido(item) {
  const st = String(item?.incidente?.status || '').toLowerCase();
  return st !== 'nao_reproduzido';
}









function avaliarAutonomia(item) {
  const avisos = [];
  const classificacao = String(item?.classificacao || '').toLowerCase().trim();
  const confianca = String(item?.confianca || '').toLowerCase().trim();






  if (!item?.incidente?.id) {
    return { faixa: FAIXAS.HUMANO, motivo: 'achado de auditoria, sem incidente aberto — não há onde registrar nem acompanhar o conserto', avisos };
  }
  if (item?.estado !== 'aberto') {
    return { faixa: FAIXAS.HUMANO, motivo: 'já decidido (resolvido ou risco aceito) — o plano aqui é histórico', avisos };
  }
  if (!Array.isArray(item?.plano_de_acao) || !item.plano_de_acao.length) {
    return { faixa: FAIXAS.HUMANO, motivo: 'sem plano de ação registrado — não há o que implementar', avisos };
  }
  if (classificacao && classificacao !== CLASSIFICACAO_DE_CODIGO) {
    return {
      faixa: FAIXAS.HUMANO,
      motivo: MOTIVO_CLASSIFICACAO[classificacao] || `o agente classificou como "${classificacao}" — fora do que se conserta por código`,
      avisos,
    };
  }
  const area = areaProtegida(item);
  if (area) {
    return { faixa: FAIXAS.HUMANO, motivo: `toca ${area} — o agente não escreve nesses arquivos por regra própria`, avisos };
  }


  if (!foiReproduzido(item)) {
    avisos.push('o incidente não foi reproduzido');
    return { faixa: FAIXAS.PR, motivo: 'o incidente não foi reproduzido — o conserto vai para PR e o merge é seu', avisos };
  }
  if (confianca === 'baixa') {
    avisos.push('confiança baixa no diagnóstico');
    return { faixa: FAIXAS.PR, motivo: 'o agente declarou confiança BAIXA no diagnóstico — o conserto vai para PR e o merge é seu', avisos };
  }




  if (item?.decisao_necessaria) avisos.push('o agente também deixou uma pergunta de decisão');
  if (confianca === 'media') avisos.push('confiança média no diagnóstico');
  return {
    faixa: FAIXAS.AUTO,
    motivo: 'incidente reproduzível, classificado como código e com plano de ação — o agente corrige, abre o PR e mergeia quando o CI ficar verde',
    avisos,
  };
}








function distribuir(itens = []) {
  const lista = (Array.isArray(itens) ? itens : []).map((item) => ({
    ...item,
    autonomia: avaliarAutonomia(item),
  }));
  const por = (f) => lista.filter((i) => i.autonomia.faixa === f);
  const auto = por(FAIXAS.AUTO);
  const pr = por(FAIXAS.PR);
  const humano = por(FAIXAS.HUMANO);
  return {
    itens: lista,
    auto,
    pr,
    humano,
    resumo: {
      total: lista.length,
      auto: auto.length,
      pr: pr.length,
      humano: humano.length,

      despachaveis: auto.length + pr.length,
    },
  };
}














const ANDAMENTO = Object.freeze({
  NAO_INICIADO: 'nao_iniciado',
  NA_FILA: 'na_fila',
  TRABALHANDO: 'trabalhando',
  RESOLVIDO: 'resolvido',
  PRECISA_DE_VOCE: 'precisa_de_voce',









  ENCERRADO: 'encerrado',
});





const MOTIVO_STATUS = Object.freeze({
  aguardando_revisao: 'o agente terminou e abriu o PR — falta você revisar e mergear',
  aguardando_aprovacao: 'o agente pede sua aprovação antes de mexer no código',
  falhou: 'o agente tentou e falhou — veja o comentário na tarefa antes de mandar de novo',
  bloqueada: 'bloqueada: o CI ficou vermelho 3× seguidas e o agente parou de tentar',
  rejeitada: 'a tarefa foi recusada — nada será feito por aqui',
  cancelada: 'a tarefa foi cancelada',
});





function andamentoDoAchado(item, tarefa) {
  const st = String(tarefa?.status || '').toLowerCase();

  if (st === 'concluida') {
    return {
      andamento: ANDAMENTO.RESOLVIDO,
      motivo: tarefa?.pull_request_url
        ? 'corrigido — PR mergeado na main (o deploy sai pelo Vercel)'
        : 'a tarefa foi concluída',
    };
  }
  if (st === 'agendada') {
















    const bloqueio = typeof tarefa?.bloqueio_ambiente === 'string' ? tarefa.bloqueio_ambiente.trim() : '';
    if (bloqueio) {
      return {
        andamento: ANDAMENTO.NA_FILA,
        motivo: `a fila NÃO está andando — ${bloqueio}`,
        fila_travada: bloqueio,
      };
    }
    return { andamento: ANDAMENTO.NA_FILA, motivo: 'na fila do agente — o executor pega em até 10 minutos' };
  }
  if (st === 'em_andamento' || st === 'em_diagnostico') {
    return { andamento: ANDAMENTO.TRABALHANDO, motivo: 'o agente está trabalhando nisso agora' };
  }
  if (MOTIVO_STATUS[st]) {
    return { andamento: ANDAMENTO.PRECISA_DE_VOCE, motivo: MOTIVO_STATUS[st] };
  }










  if (item?.estado === 'encerrado') {
    return {
      andamento: ANDAMENTO.ENCERRADO,
      motivo: 'o incidente já foi decidido — este plano é histórico',
    };
  }



  if (item?.autonomia?.faixa === FAIXAS.HUMANO) {
    return { andamento: ANDAMENTO.PRECISA_DE_VOCE, motivo: item.autonomia.motivo };
  }
  return { andamento: ANDAMENTO.NAO_INICIADO, motivo: 'ainda não foi despachado ao agente' };
}


function resumirAndamento(itens = []) {
  const lista = Array.isArray(itens) ? itens : [];
  const conta = (a) => lista.filter((i) => i?.andamento === a).length;


  const travadas = lista.filter((i) => typeof i?.fila_travada === 'string' && i.fila_travada.trim());
  return {
    fila_travada: travadas.length
      ? { qtd: travadas.length, motivo: travadas[0].fila_travada }
      : null,
    encerrados: conta(ANDAMENTO.ENCERRADO),
    resolvidos: conta(ANDAMENTO.RESOLVIDO),
    em_andamento: conta(ANDAMENTO.NA_FILA) + conta(ANDAMENTO.TRABALHANDO),
    precisam_de_voce: conta(ANDAMENTO.PRECISA_DE_VOCE),
    nao_iniciados: conta(ANDAMENTO.NAO_INICIADO),
  };
}

module.exports = {
  FAIXAS,
  CLASSIFICACAO_DE_CODIGO,
  MOTIVO_CLASSIFICACAO,
  MARCAS_PROTEGIDAS,
  areaProtegida,
  foiReproduzido,
  avaliarAutonomia,
  distribuir,
  ANDAMENTO,
  MOTIVO_STATUS,
  andamentoDoAchado,
  resumirAndamento,
};
