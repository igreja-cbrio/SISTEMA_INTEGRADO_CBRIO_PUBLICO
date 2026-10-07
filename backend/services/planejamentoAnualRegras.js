
















const SUPOSICOES = {


  espacoEntreNaturezasDiferentes: true,




  ressalvaVerificadaAntesDoCalendario: false,


  rateioUniforme: true,

  prazoDias: 5,
};


const CRITERIOS = [
  { chave: 'relevancia', titulo: 'Relevância', descricao: 'Alcance sobre o público-alvo: 80% da igreja, ou 80% do recorte geracional.' },
  { chave: 'pertencimento', titulo: 'Pertencimento', descricao: 'Trazer pessoas para a igreja pela nossa cultura, por aquilo que nos pertence.' },
  { chave: 'transformacao', titulo: 'Transformação', descricao: 'Contribuição para os cinco valores, conforme as justificativas. A nota não varia com a quantidade marcada.' },
  { chave: 'visao', titulo: 'Visão CBRio', descricao: 'Contribuição para 5 anos, 5 igrejas, 50 mil vidas.' },
  { chave: 'impacto', titulo: 'Impacto', descricao: 'Cativar as pessoas que vêm à CBRio pelo que a CBRio é, e não por ações pontuais.' },
  { chave: 'custo', titulo: 'Custo', descricao: 'Proporcionalidade do custo ao alcance e ao resultado esperado.' },
  { chave: 'sustentabilidade', titulo: 'Sustentabilidade financeira', descricao: 'Adequação do modelo de custeio ao propósito do projeto.' },
];

const VALORES_IGREJA = [
  'Seguir a Jesus',
  'Conectar-se com Pessoas',
  'Investir Tempo com Deus',
  'Servir em comunidade',
  'Viver generosamente',
];

const CAMPOS_APONTAVEIS = [
  { chave: 'nome', rotulo: 'Nome' },
  { chave: 'natureza', rotulo: 'Natureza' },
  { chave: 'area', rotulo: 'Área' },
  { chave: 'lider', rotulo: 'Líder responsável' },
  { chave: 'quando', rotulo: 'Período e recorrência' },
  { chave: 'local', rotulo: 'Local' },
  { chave: 'publico', rotulo: 'Público-alvo' },
  { chave: 'descricao', rotulo: 'Descrição' },
  { chave: 'alcance', rotulo: 'Alcance estimado' },
  { chave: 'pertencimento', rotulo: 'Pertencimento' },
  { chave: 'transformacao', rotulo: 'Transformação e valores' },
  { chave: 'visao', rotulo: 'Visão CBRio' },
  { chave: 'impacto', rotulo: 'Impacto' },
  { chave: 'custo', rotulo: 'Custo total' },
  { chave: 'arrecadacao', rotulo: 'Arrecadação prevista' },
];


const CAMPOS_RETIFICACAO = [
  'data_inicio', 'precisao_inicio', 'data_fim', 'precisao_fim',
  'custo', 'arrecadacao_prevista', 'local_id', 'descricao',
];



const TRANSICOES = {
  rascunho: ['enviada'],
  enviada: ['aprovada', 'aprovada_ressalvas', 'reprovada', 'arquivada'],
  aprovada: ['enviada'],
  aprovada_ressalvas: ['enviada'],
  reprovada: ['retificada', 'arquivada'],
  retificada: ['aprovada', 'aprovada_ressalvas', 'arquivada', 'enviada'],
  arquivada: [],
};


const mesDe = (dataStr) => parseInt(String(dataStr).slice(5, 7), 10);

function somarDias(dataStr, dias) {
  const [y, m, d] = String(dataStr).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + dias));
  return dt.toISOString().slice(0, 10);
}

function horariosSobrepoem(a, b) {


  if (!a.hora_inicio || !a.hora_fim || !b.hora_inicio || !b.hora_fim) return false;
  return a.hora_inicio < b.hora_fim && b.hora_inicio < a.hora_fim;
}


function liquido(p) {
  const arrec = p.tem_arrecadacao ? Number(p.arrecadacao_prevista || 0) : 0;
  return Math.round((Number(p.custo || 0) - arrec) * 100) / 100;
}

function modeloCusteio(p) {
  const arrec = p.tem_arrecadacao ? Number(p.arrecadacao_prevista || 0) : 0;
  const custo = Number(p.custo || 0);
  if (!p.tem_arrecadacao || arrec === 0) return { tipo: 'integral', rotulo: 'Custeio integral pela igreja' };
  if (arrec < custo) return { tipo: 'parcial', rotulo: 'Custeio parcial' };
  return { tipo: 'autossustentado', rotulo: 'Autossustentado pela arrecadação' };
}





function mesesOcupados(p) {
  const ini = mesDe(p.data_inicio);
  const fim = p.multi_dia && p.data_fim ? mesDe(p.data_fim) : ini;
  if (!Number.isFinite(ini) || !Number.isFinite(fim) || fim < ini) return [];
  const ms = [];
  for (let m = ini; m <= fim; m += 1) ms.push(m);
  return ms;
}




function rateioMensal(p) {
  const ms = mesesOcupados(p);
  const porMes = new Array(12).fill(0);
  if (!ms.length) return porMes;
  const totalCent = Math.round(liquido(p) * 100);
  const base = Math.trunc(totalCent / ms.length);
  let resto = totalCent - base * ms.length;
  const passo = resto >= 0 ? 1 : -1;
  ms.forEach((m, i) => {
    let cent = base;
    if (resto !== 0) { cent += passo; resto -= passo; }
    porMes[m - 1] = cent / 100;
  });
  return porMes;
}


function decisaoVigente(decisoes) {
  const ativas = (decisoes || []).filter((d) => !d.revogada_em);
  if (!ativas.length) return null;
  return ativas.reduce((max, d) => (d.rodada > max.rodada ? d : max), ativas[0]);
}

function ressalvaVerificada(decisoes) {
  const d = decisaoVigente(decisoes);
  return Boolean(d && d.decisao === 'aprovada_ressalvas' && d.ressalva_cumprida_em);
}


function noCalendario(proposta, decisoes, suposicoes = SUPOSICOES) {
  if (proposta.deleted_at) return false;
  if (proposta.estado === 'aprovada') return true;
  if (proposta.estado === 'aprovada_ressalvas') {
    return suposicoes.ressalvaVerificadaAntesDoCalendario ? ressalvaVerificada(decisoes) : true;
  }
  return false;
}


function estadoDerivado(proposta, numAvaliacoes, quorum) {
  if (proposta.estado === 'enviada') {
    return numAvaliacoes >= quorum ? 'ranqueada' : 'em_avaliacao';
  }
  return proposta.estado;
}

function podeTransicionar(de, para) {
  return (TRANSICOES[de] || []).includes(para);
}






const textoVazio = (v) => !v || !String(v).trim();











function validarCamposObrigatorios(proposta, ciclo) {
  const erros = [];

  if (textoVazio(proposta.nome)) erros.push('Nome da proposta é obrigatório.');
  if (!proposta.natureza) erros.push('Natureza é obrigatória.');
  if (!proposta.area) erros.push('Área é obrigatória.');
  if (!proposta.lider_id) erros.push('Líder responsável é obrigatório.');
  if (!proposta.data_inicio) erros.push('Mês de início é obrigatório.');





  if (proposta.data_inicio && ciclo?.ano
      && Number(String(proposta.data_inicio).slice(0, 4)) !== ciclo.ano) {
    erros.push(`A data de início deve ser em ${ciclo.ano}, o ano deste ciclo.`);
  }



  if (proposta.multi_dia && proposta.data_fim && proposta.data_inicio
      && proposta.data_fim < proposta.data_inicio) {
    erros.push('A data de encerramento não pode ser antes da data de início.');
  }
  if (!proposta.local_id) erros.push('Local é obrigatório.');


  if (proposta.alcance_pct == null) erros.push('Alcance estimado é obrigatório.');
  if (!proposta.publico_considerado) erros.push('Público considerado é obrigatório.');
  if (textoVazio(proposta.pertencimento)) erros.push('Pertencimento é obrigatório.');
  if (textoVazio(proposta.visao_explique)) erros.push('Visão CBRio é obrigatória.');
  if (textoVazio(proposta.impacto)) erros.push('Impacto é obrigatório.');
  if (proposta.custo == null) erros.push('Custo total é obrigatório.');

  const valores = Array.isArray(proposta.valores) ? proposta.valores : [];
  if (!valores.length) {
    erros.push('Marque ao menos um dos cinco valores em Transformação.');
  }
  valores.forEach((v) => {
    if (!v || textoVazio(v.justificativa)) {
      erros.push(`Justificativa é obrigatória para o valor marcado "${v && v.nome ? v.nome : '?'}".`);
    }
    if (v && v.nome && !VALORES_IGREJA.includes(v.nome)) {
      erros.push(`Valor desconhecido: "${v.nome}".`);
    }
  });

  if (proposta.tem_arrecadacao && !(Number(proposta.arrecadacao_prevista) > 0)) {
    erros.push('Informe o valor previsto de arrecadação.');
  }
  return erros;
}

function validarEnvio(proposta, ciclo) {
  const erros = [];
  if (!ciclo || !ciclo.submissao_aberta) {
    erros.push('A janela de submissão está fechada, então o envio está desabilitado.');
  }
  erros.push(...validarCamposObrigatorios(proposta, ciclo));
  return erros;
}

function validarAvaliacao(notas) {

  const erros = [];
  CRITERIOS.forEach((c) => {
    const n = notas ? notas['nota_' + c.chave] : null;
    if (!Number.isInteger(n) || n < 1 || n > 5) {
      erros.push(`Nota de "${c.titulo}" é obrigatória (1 a 5).`);
    }
  });
  return erros;
}

function validarRetificacao(proposta, hoje) {
  const erros = [];
  if (proposta.estado !== 'reprovada') erros.push('Só proposta reprovada pode ser retificada.');
  if (Number(proposta.versao) >= 2) erros.push('A rodada única de retificação já foi usada.');
  if (proposta.retificacao_prazo && hoje && hoje > proposta.retificacao_prazo) {
    erros.push('O prazo de retificação expirou.');
  }
  return erros;
}

function snapshotRetificacao(proposta) {
  const snap = {};
  CAMPOS_RETIFICACAO.forEach((c) => { snap[c] = proposta[c] === undefined ? null : proposta[c]; });
  return snap;
}

function diffRetificacao(versaoAnterior, atual) {
  if (!versaoAnterior) return [];
  return CAMPOS_RETIFICACAO
    .filter((c) => {
      const antes = versaoAnterior[c] === undefined ? null : versaoAnterior[c];
      const depois = atual[c] === undefined ? null : atual[c];
      return String(antes) !== String(depois);
    })
    .map((c) => ({ campo: c, antes: versaoAnterior[c] ?? null, depois: atual[c] ?? null }));
}




const collatorPtBr = new Intl.Collator('pt-BR');

function somasPorCriterio(avaliacoes) {
  return CRITERIOS.map((c) =>
    (avaliacoes || []).reduce((s, a) => s + (Number(a['nota_' + c.chave]) || 0), 0));
}

function mediasPorCriterio(avaliacoes) {
  const n = (avaliacoes || []).length;
  if (!n) return CRITERIOS.map(() => null);
  return somasPorCriterio(avaliacoes).map((s) => s / n);
}







function montarRanking({ propostas, avaliacoesPorProposta, quorum, diretorias }) {
  const ranqueaveis = [];
  const foraDoRanking = [];
  (propostas || []).forEach((p) => {
    if (p.deleted_at) return;
    if (!['enviada', 'aprovada', 'aprovada_ressalvas', 'reprovada', 'retificada'].includes(p.estado)) return;
    if (p.estado === 'retificada') return;
    const avs = (avaliacoesPorProposta[p.id] || []).filter((a) => !a.deleted_at);
    if (avs.length < quorum) {
      const presentes = new Set(avs.map((a) => a.diretoria));
      foraDoRanking.push({
        proposta: p,
        avaliacoes: avs.length,
        faltam: (diretorias || []).filter((d) => !presentes.has(d)),
      });
      return;
    }
    const somas = somasPorCriterio(avs);
    ranqueaveis.push({
      proposta: p,
      medias: somas.map((s) => s / avs.length),
      soma: somas.reduce((t, s) => t + s, 0) / avs.length,
      _somas: somas,
      _somaTotal: somas.reduce((t, s) => t + s, 0),
    });
  });

  ranqueaveis.sort((a, b) => {
    if (b._somaTotal !== a._somaTotal) return b._somaTotal - a._somaTotal;
    for (let i = 0; i < CRITERIOS.length; i += 1) {
      if (b._somas[i] !== a._somas[i]) return b._somas[i] - a._somas[i];
    }
    return collatorPtBr.compare(a.proposta.nome || '', b.proposta.nome || '');
  });

  return {
    ranqueadas: ranqueaveis.map(({ _somas, _somaTotal, ...r }) => r),
    foraDoRanking,
  };
}




function diaSemanaDe(dataStr) {
  const [y, m, d] = String(dataStr).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}




function diasDaFaixa(p) {
  const fim = p.multi_dia && p.data_fim ? p.data_fim : p.data_inicio;
  const dias = [];
  let cursor = p.data_inicio;
  let guarda = 0;
  while (cursor <= fim && guarda < 400) {
    dias.push(cursor);
    cursor = somarDias(cursor, 1);
    guarda += 1;
  }
  return dias;
}

function rotinasCoincidem(a, b) {
  if (a.dia_semana == null || b.dia_semana == null) return false;
  if (a.dia_semana !== b.dia_semana) return false;
  const ma = mesesOcupados(a);
  const mb = new Set(mesesOcupados(b));
  return ma.some((m) => mb.has(m));
}












function datasColidem(a, b) {
  const aRotina = a.natureza === 'rotina';
  const bRotina = b.natureza === 'rotina';

  if (aRotina && bRotina) return rotinasCoincidem(a, b);

  if (aRotina || bRotina) {
    const rotina = aRotina ? a : b;
    const outra = aRotina ? b : a;
    if (rotina.dia_semana == null) return false;
    const mesesRotina = new Set(mesesOcupados(rotina));
    if (!mesesOcupados(outra).some((m) => mesesRotina.has(m))) return false;
    if (outra.precisao_inicio !== 'dia') return true;
    return diasDaFaixa(outra).some((d) => diaSemanaDe(d) === Number(rotina.dia_semana));
  }


  if (a.precisao_inicio !== 'dia' || b.precisao_inicio !== 'dia') {

    if (mesDe(a.data_inicio) === mesDe(b.data_inicio)) return true;
    const ma = new Set(mesesOcupados(a));
    return mesesOcupados(b).some((m) => ma.has(m));
  }


  const fimA = a.multi_dia && a.data_fim ? a.data_fim : a.data_inicio;
  const fimB = b.multi_dia && b.data_fim ? b.data_fim : b.data_inicio;
  return a.data_inicio <= fimB && b.data_inicio <= fimA;
}





function conflitoFirme(a, b) {
  const aRotina = a.natureza === 'rotina';
  const bRotina = b.natureza === 'rotina';
  if (aRotina && bRotina) return true;
  if (aRotina || bRotina) return (aRotina ? b : a).precisao_inicio === 'dia';
  return a.precisao_inicio === 'dia' && b.precisao_inicio === 'dia';
}












function detectarConflitos(propostas, locaisById, suposicoes = SUPOSICOES) {
  const lista = (propostas || []).filter((p) => !p.deleted_at);
  const out = [];
  for (let i = 0; i < lista.length; i += 1) {
    for (let j = i + 1; j < lista.length; j += 1) {
      let [a, b] = [lista[i], lista[j]];
      if (String(b.id) < String(a.id)) [a, b] = [b, a];


      const local = locaisById ? locaisById[a.local_id] : null;
      const geraConflito = local ? local.gera_conflito !== false : true;
      const naturezasOk = suposicoes.espacoEntreNaturezasDiferentes || a.natureza === b.natureza;
      if (a.local_id && a.local_id === b.local_id && geraConflito && naturezasOk
          && horariosSobrepoem(a, b) && datasColidem(a, b)) {
        out.push({ a, b, tipo: 'espaco', firme: conflitoFirme(a, b) });
      }


      if (a.natureza === b.natureza && datasColidem(a, b)) {
        out.push({ a, b, tipo: 'agenda', firme: conflitoFirme(a, b) });
      }
    }
  }
  return out;
}


function aplicarAceites(conflitos, aceites) {
  const chave = (pa, pb, tipo) => [pa, pb].sort().join('|') + '|' + tipo;
  const mapa = new Map((aceites || []).map((ac) => [chave(ac.proposta_a, ac.proposta_b, ac.tipo), ac]));
  return (conflitos || []).map((c) => ({
    ...c,
    aceite: mapa.get(chave(c.a.id, c.b.id, c.tipo)) || null,
  }));
}







function validarTravas({ propostas, avaliacoesPorProposta, decisoesPorProposta, quorum, locaisById, aceites, suposicoes = SUPOSICOES }) {
  const vivas = (propostas || []).filter((p) => !p.deleted_at);
  const avsDe = (p) => (avaliacoesPorProposta[p.id] || []).filter((a) => !a.deleted_at);
  const decDe = (p) => decisoesPorProposta[p.id] || [];

  const semQuorum = vivas.filter((p) => p.estado === 'enviada' && avsDe(p).length < quorum);
  const semDecisao = vivas.filter((p) => p.estado === 'enviada' && avsDe(p).length >= quorum);
  const retificacao = vivas.filter((p) => ['reprovada', 'retificada'].includes(p.estado));
  const ressalva = vivas.filter((p) => p.estado === 'aprovada_ressalvas' && !ressalvaVerificada(decDe(p)));

  const emCalendario = vivas.filter((p) => noCalendario(p, decDe(p), suposicoes));
  const conflitos = aplicarAceites(detectarConflitos(emCalendario, locaisById, suposicoes), aceites)
    .filter((c) => c.firme && !c.aceite);

  const motivos = [];
  if (semQuorum.length) motivos.push(`${semQuorum.length} proposta(s) sem quórum de avaliação`);
  if (semDecisao.length) motivos.push(`${semDecisao.length} proposta(s) sem decisão`);
  if (retificacao.length) motivos.push(`${retificacao.length} retificação(ões) em andamento`);
  if (conflitos.length) motivos.push(`${conflitos.length} conflito(s) confirmado(s) e não aceito(s) no calendário`);

  return {
    bloqueada: motivos.length > 0,
    motivos,
    detalhe: { semQuorum, semDecisao, retificacao, ressalva, conflitos, itensCalendario: emCalendario },
  };
}







const MULTIPLICADOR_RECORRENCIA = {
  unica: 1, diaria: 365, semanal: 52, mensal: 12, trimestral: 4, semestral: 2, personalizada: 1,
};

function valorEfetivoProposta(p) {
  const ap = (v, orig) => (v === null || v === undefined ? orig : v);
  return {
    custo: ap(p.custo_apontado, Number(p.custo || 0)),
    recorrencia: ap(p.recorrencia_apontada, p.recorrencia),
    diaSemana: ap(p.dia_semana_apontado, p.dia_semana),
    dataInicio: ap(p.data_inicio_apontada, p.data_inicio),
    precisaoInicio: ap(p.precisao_inicio_apontada, p.precisao_inicio),
  };
}


function custoAnualizado(custoBase, recorrencia) {
  const fator = MULTIPLICADOR_RECORRENCIA[recorrencia] ?? 1;
  return Number(custoBase || 0) * fator;
}








function valoresMaterializacao(p) {
  const efetivo = valorEfetivoProposta(p);
  const recorrencia = efetivo.recorrencia || 'unica';
  const custoAnual = Math.round(custoAnualizado(efetivo.custo, recorrencia) * 100) / 100;
  const arrecadacaoAnual = p.tem_arrecadacao
    ? Math.round(custoAnualizado(Number(p.arrecadacao_prevista || 0), recorrencia) * 100) / 100
    : 0;
  const dataInicio = efetivo.dataInicio || null;


  const dataFim = p.multi_dia && p.data_fim && (!dataInicio || p.data_fim >= dataInicio) ? p.data_fim : null;
  return {
    custoAnual,
    arrecadacaoAnual,
    custoIgreja: Math.max(0, Math.round((custoAnual - arrecadacaoAnual) * 100) / 100),
    dataInicio,
    dataFim,
    precisaoMes: efetivo.precisaoInicio !== 'dia',
    recorrencia,
    diaSemana: efetivo.diaSemana,
  };
}






function gestorPode({ pastor, pmo, areasLider, userId }, proposta) {
  if (pastor || pmo) return true;
  const donos = [proposta.lider_id, proposta.preenchido_por_id, proposta.created_by].filter(Boolean);
  if (userId && donos.includes(userId)) return true;
  return Boolean(proposta.area && areasLider && areasLider.has(proposta.area));
}




const RECORRENCIA_EVENTO = {
  unica: 'unico', semanal: 'semanal', mensal: 'mensal', trimestral: 'trimestral', semestral: 'semestral',
};







function datasOcorrencias(p) {
  const v = valoresMaterializacao(p);
  const passoMeses = { mensal: 1, trimestral: 3, semestral: 6 }[v.recorrencia];
  if (!v.dataInicio || v.precisaoMes || (v.recorrencia !== 'semanal' && !passoMeses)) return [];
  const ini = String(v.dataInicio).slice(0, 10);
  const fim = v.dataFim ? String(v.dataFim).slice(0, 10) : `${ini.slice(0, 4)}-12-31`;
  const datas = [];
  if (v.recorrencia === 'semanal') {
    let cursor = ini;
    if (v.diaSemana != null) {
      const [y, m, d] = cursor.split('-').map(Number);
      const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
      cursor = somarDias(cursor, (Number(v.diaSemana) - dow + 7) % 7);
    }
    while (cursor <= fim && datas.length < 60) { datas.push(cursor); cursor = somarDias(cursor, 7); }
    return datas;
  }
  const [y0, m0, d0] = ini.split('-').map(Number);
  for (let i = 0; datas.length < 60; i += 1) {
    const mesAbs = (m0 - 1) + i * passoMeses;
    const ano = y0 + Math.floor(mesAbs / 12);
    const mes = (mesAbs % 12) + 1;
    const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
    const data = `${ano}-${String(mes).padStart(2, '0')}-${String(Math.min(d0, ultimo)).padStart(2, '0')}`;
    if (data > fim) break;
    datas.push(data);
  }
  return datas;
}







function datasNoCalendario(p) {
  const v = valoresMaterializacao(p);
  if (!v.dataInicio) return { dias: [], mesSemDia: null };
  const ini = String(v.dataInicio).slice(0, 10);
  if (v.precisaoMes) return { dias: [], mesSemDia: ini.slice(0, 7) };
  const ocorrencias = datasOcorrencias(p);
  if (ocorrencias.length) return { dias: ocorrencias, mesSemDia: null };
  const fim = v.dataFim ? String(v.dataFim).slice(0, 10) : ini;
  const dias = [];
  let cursor = ini;
  while (cursor <= fim && dias.length < 400) { dias.push(cursor); cursor = somarDias(cursor, 1); }
  return { dias, mesSemDia: null };
}













const LIMITE_ATRASO_VERMELHO = 0.3;

function fmtDiaMes(iso) { const [, m, d] = String(iso).slice(0, 10).split('-'); return `${d}/${m}`; }



function divergenciaPublicado(p, publicado) {
  if (!publicado) return [];
  const v = valoresMaterializacao(p);
  const out = [];
  const pub = (x) => (x ? String(x).slice(0, 10) : null);
  if (pub(publicado.data_inicio) && v.dataInicio && pub(publicado.data_inicio) !== pub(v.dataInicio)) {
    out.push(`Início mudou: publicado ${fmtDiaMes(publicado.data_inicio)} → agora ${fmtDiaMes(v.dataInicio)}`);
  }
  if (pub(publicado.data_fim) !== pub(v.dataFim) && (publicado.data_fim || v.dataFim)) {
    out.push(`Fim mudou: publicado ${publicado.data_fim ? fmtDiaMes(publicado.data_fim) : 'sem fim'} → agora ${v.dataFim ? fmtDiaMes(v.dataFim) : 'sem fim'}`);
  }
  if ((publicado.recorrencia || 'unica') !== v.recorrencia) {
    out.push(`Recorrência mudou: publicada ${publicado.recorrencia || 'unica'} → agora ${v.recorrencia}`);
  }
  if (publicado.dia_semana != null && v.diaSemana != null && Number(publicado.dia_semana) !== Number(v.diaSemana)) {
    out.push('Dia da semana mudou em relação ao publicado');
  }
  return out;
}

function saudeExecucao(p, ctx) {
  const hoje = ctx.hoje;
  const t = ctx.tarefas || { total: 0, abertas: 0, concluidas: 0, atrasadas: 0, bloqueadas: 0, vencendo7: 0 };
  const vermelho = [];
  const amarelo = [];
  const avisos = [];

  if (ctx.foraDoPlano) vermelho.push('Saiu do plano, mas ainda tem trabalho em andamento');

  const r = ctx.ressalva;
  if (r && !r.cumprida) {
    if (r.prazo && r.prazo < hoje) {
      vermelho.push(`Ressalva vencida em ${fmtDiaMes(r.prazo)} e ainda não verificada`);
      avisos.push({ tipo: 'ressalva', nivel: 'vermelho', texto: `Ressalva venceu em ${fmtDiaMes(r.prazo)}` });
    } else {
      amarelo.push(r.prazo ? `Ressalva pendente (prazo ${fmtDiaMes(r.prazo)})` : 'Ressalva pendente');
      if (r.prazo && r.prazo <= somarDias(hoje, 7)) avisos.push({ tipo: 'ressalva', nivel: 'amarelo', texto: `Ressalva vence em ${fmtDiaMes(r.prazo)}` });
    }
  }

  if (t.bloqueadas > 0) vermelho.push(`${t.bloqueadas} tarefa(s) bloqueada(s)`);
  if (t.atrasadas > 0) {
    const fracao = t.abertas ? t.atrasadas / t.abertas : 0;
    (fracao >= LIMITE_ATRASO_VERMELHO ? vermelho : amarelo).push(`${t.atrasadas} tarefa(s) atrasada(s)`);
    avisos.push({ tipo: 'atraso', nivel: fracao >= LIMITE_ATRASO_VERMELHO ? 'vermelho' : 'amarelo', texto: `${t.atrasadas} tarefa(s) com prazo vencido` });
  }
  if (t.vencendo7 > 0) avisos.push({ tipo: 'prazo', nivel: 'amarelo', texto: `${t.vencendo7} tarefa(s) vencem nos próximos 7 dias` });

  const diverg = divergenciaPublicado(p, ctx.publicado);
  diverg.forEach((d) => amarelo.push(d));


  const v = valoresMaterializacao(p);
  const inicio = v.dataInicio ? String(v.dataInicio).slice(0, 10) : null;
  if (inicio && !v.precisaoMes && inicio >= hoje && inicio <= somarDias(hoje, 30) && !ctx.foraDoPlano) {
    if (!ctx.temVinculo) {
      amarelo.push(`Começa em ${fmtDiaMes(inicio)} e ainda não tem ${p.natureza === 'rotina' ? 'fases de implantação' : 'projeto/evento criado'}`);
      avisos.push({ tipo: 'inicio', nivel: 'amarelo', texto: `Começa em ${fmtDiaMes(inicio)} sem ${p.natureza === 'rotina' ? 'fases' : 'vínculo'}` });
    } else if (t.total === 0) {
      amarelo.push(`Começa em ${fmtDiaMes(inicio)} e ainda não tem tarefas`);
      avisos.push({ tipo: 'inicio', nivel: 'amarelo', texto: `Começa em ${fmtDiaMes(inicio)} sem tarefas` });
    }
  }

  const farol = vermelho.length ? 'vermelho' : amarelo.length ? 'amarelo' : 'verde';
  return { farol, motivos: [...vermelho, ...amarelo], divergencias: diverg, avisos };
}




const FASES_INICIAIS_ROTINA = ['Preparação', 'Implantação', 'Acompanhamento'];


function nomeFaseRotina(v) {
  const nome = String(v ?? '').trim().replace(/\s+/g, ' ');
  return nome && nome.length <= 80 ? nome : null;
}







const HORARIOS_DOMINGO = 'Domingo · 09:30 · 11:30 · 19:00';
const LITURGICOS = [
  { chave: 'ceia', nome: 'Ceia do Senhor', domingo: 1,
    descricao: 'Santa Ceia nos cultos do primeiro domingo do mês.' },
  { chave: 'apresentacao', nome: 'Apresentação de bebês', domingo: 2,
    descricao: 'Apresentação de bebês nos cultos do segundo domingo do mês.' },
  { chave: 'batismo', nome: 'Batismo', domingo: 4,
    descricao: 'Batismo nos cultos do quarto domingo do mês.' },

  { chave: 'culto-do-amigo', nome: 'Culto do Amigo (CBKids)', domingo: 5, categoria: 'geracional',
    descricao: 'Quinto domingo do mês: no Kids é o dia do Culto do Amigo.' },
  { chave: 'culto-jovem', nome: 'Culto Jovem (AMI)', domingo: 5, categoria: 'geracional',
    descricao: 'Quinto domingo do mês: quem serve nos cultos são os jovens do AMI.' },
];


function domingosPorMes(ano) {
  const meses = Array.from({ length: 12 }, () => []);
  let cursor = `${ano}-01-01`;
  cursor = somarDias(cursor, (7 - diaSemanaDe(cursor)) % 7);
  while (cursor.startsWith(String(ano))) {
    meses[Number(cursor.slice(5, 7)) - 1].push(cursor);
    cursor = somarDias(cursor, 7);
  }
  return meses;
}




const CULTOS_SEMANAIS = [
  { chave: 'domingo', nome: 'Cultos de domingo', dow: 0, horarios: 'Domingo · 09:30 · 11:30 · 19:00',
    descricao: 'Cultos de domingo às 09:30, 11:30 e 19:00.' },
  { chave: 'quarta', nome: 'Quarta com Deus', dow: 3, horarios: 'Quarta · 20h',
    descricao: 'Culto de quarta-feira, às 20h.' },
  { chave: 'bridge', nome: 'Bridge (adolescentes)', dow: 6, horarios: 'Sábado · 17h',
    descricao: 'Culto dos adolescentes (Bridge), aos sábados às 17h.' },
  { chave: 'ami', nome: 'AMI (jovens)', dow: 6, horarios: 'Sábado · 20h',
    descricao: 'Culto dos jovens (AMI), aos sábados às 20h.' },
];

function cultosDoAno(ano) {
  const a = Number(ano);
  return CULTOS_SEMANAIS.map((c) => {
    const dias = [];
    let cursor = `${a}-01-01`;
    cursor = somarDias(cursor, (c.dow - diaSemanaDe(cursor) + 7) % 7);
    while (cursor.startsWith(String(a))) { dias.push(cursor); cursor = somarDias(cursor, 7); }
    return {
      id: `culto:${c.chave}`, natureza: 'culto', categoria: 'rotina_liturgia', nome: c.nome, descricao: c.descricao,
      horarios: c.horarios, calendario: { dias, mesSemDia: null },
    };
  });
}



function encontraoDoAno(ano) {
  const a = Number(ano);
  const dias = [];
  for (let m = 1; m <= 12; m += 1) {
    let cursor = `${a}-${String(m).padStart(2, '0')}-01`;
    cursor = somarDias(cursor, (3 - diaSemanaDe(cursor) + 7) % 7);
    dias.push(somarDias(cursor, 7));
  }
  return {
    id: 'rotina_fixa:encontrao', natureza: 'rotina_fixa', categoria: 'rotina_staff',
    nome: 'Encontrão', descricao: 'Encontro da equipe (staff), toda segunda quarta-feira do mês.',
    horarios: 'Quarta', calendario: { dias, mesSemDia: null },
  };
}


function ehDataISO(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}







function aplicarAjustes(itens, ajustes, ano) {
  const prefixo = `${Number(ano)}-`;
  return (itens || []).map((item) => {
    const meus = (ajustes || []).filter((a) => a.item_id === item.id);
    if (!meus.length) return { ...item, ajustes: [], remanejadas: {} };
    const dias = new Set(item.calendario.dias);
    const remanejadas = {};
    meus.forEach((a) => {
      dias.delete(a.data_original);
      if (a.data_nova) {
        dias.add(a.data_nova);
        remanejadas[a.data_nova] = a.data_original;
      }
    });
    return {
      ...item,
      calendario: { ...item.calendario, dias: [...dias].filter((d) => d.startsWith(prefixo)).sort() },
      ajustes: meus.map((a) => ({ data_original: a.data_original, data_nova: a.data_nova || null, motivo: a.motivo || '' })),
      remanejadas,
    };
  });
}

function liturgicosDoAno(ano) {
  const meses = domingosPorMes(Number(ano));
  return LITURGICOS.map((l) => ({
    id: `liturgico:${l.chave}`,
    natureza: 'liturgico',
    categoria: l.categoria || 'rotina_liturgia',
    nome: l.nome,
    descricao: l.descricao,
    horarios: HORARIOS_DOMINGO,
    calendario: { dias: meses.map((doms) => doms[l.domingo - 1]).filter(Boolean), mesSemDia: null },
  }));
}














function distribuirCustoPorMes(proposta, { usarApontamento } = {}) {
  const efetivo = usarApontamento ? valorEfetivoProposta(proposta) : {
    custo: Number(proposta.custo || 0),
    recorrencia: proposta.recorrencia,
    diaSemana: proposta.dia_semana,
    dataInicio: proposta.data_inicio,
    precisaoInicio: proposta.precisao_inicio,
  };
  const recorrencia = efetivo.recorrencia || 'unica';

  if (recorrencia === 'unica' || recorrencia === 'personalizada') {


    const base = {
      ...proposta,
      custo: efetivo.custo,
      data_inicio: efetivo.dataInicio,
      precisao_inicio: efetivo.precisaoInicio,
    };











    if (usarApontamento && proposta.multi_dia && proposta.data_fim && efetivo.dataInicio !== proposta.data_inicio) {
      const duracaoOriginal = mesesOcupados(proposta).length || 1;
      const mesNovoIni = mesDe(efetivo.dataInicio);
      if (Number.isFinite(mesNovoIni)) {
        const mesNovoFim = Math.min(12, mesNovoIni + duracaoOriginal - 1);
        base.data_fim = `${String(efetivo.dataInicio).slice(0, 4)}-${String(mesNovoFim).padStart(2, '0')}-01`;
      }
    }
    return rateioMensal(base);
  }









  const porMes = new Array(12).fill(0);
  const custoAnual = custoAnualizado(efetivo.custo, recorrencia);
  const arrecAnual = proposta.tem_arrecadacao
    ? custoAnualizado(Number(proposta.arrecadacao_prevista || 0), recorrencia)
    : 0;
  const mensal = Math.round(((custoAnual - arrecAnual) / 12) * 100) / 100;
  for (let i = 0; i < 12; i += 1) porMes[i] = mensal;
  return porMes;
}





function custoMensalTodasPropostas(propostas) {
  const total = new Array(12).fill(0);
  (propostas || [])
    .filter((p) => !p.deleted_at && !['rascunho', 'arquivada'].includes(p.estado))
    .forEach((p) => {
      distribuirCustoPorMes(p, { usarApontamento: false }).forEach((v, i) => {
        total[i] = Math.round((total[i] + v) * 100) / 100;
      });
    });
  return total;
}




function custoMensalAprovadas(propostas) {
  const total = new Array(12).fill(0);
  (propostas || [])
    .filter((p) => !p.deleted_at && ['aprovada', 'aprovada_ressalvas'].includes(p.estado))
    .forEach((p) => {
      distribuirCustoPorMes(p, { usarApontamento: true }).forEach((v, i) => {
        total[i] = Math.round((total[i] + v) * 100) / 100;
      });
    });
  return total;
}


const LINHAS_ORCAMENTO = ['dizimos_ofertas', 'outras_receitas', 'folha', 'despesas_operacionais', 'provisoes'];


function caixaLivreMensal(valores) {
  const porLinha = {};
  LINHAS_ORCAMENTO.forEach((l) => { porLinha[l] = new Array(12).fill(0); });
  (valores || []).forEach((v) => {
    if (porLinha[v.linha] && v.mes >= 1 && v.mes <= 12) porLinha[v.linha][v.mes - 1] = Number(v.valor) || 0;
  });
  return new Array(12).fill(0).map((_, i) =>
    Math.round(((porLinha.dizimos_ofertas[i] + porLinha.outras_receitas[i])
      - (porLinha.folha[i] + porLinha.despesas_operacionais[i] + porLinha.provisoes[i])) * 100) / 100);
}















function orcamentoDoPastor({ propostas, avaliacoesPorProposta, decisoesPorProposta, quorum, caixaLivre, suposicoes = SUPOSICOES }) {
  const vivas = (propostas || []).filter((p) => !p.deleted_at);
  const avsDe = (p) => (avaliacoesPorProposta[p.id] || []).filter((a) => !a.deleted_at);
  const decDe = (p) => decisoesPorProposta[p.id] || [];

  const aprovadas = vivas.filter((p) => noCalendario(p, decDe(p), suposicoes));
  const pendentes = vivas.filter((p) => p.estado === 'enviada' && avsDe(p).length >= quorum);

  const soma = (lista) => {
    const total = new Array(12).fill(0);
    lista.forEach((p) => {
      distribuirCustoPorMes(p, { usarApontamento: true }).forEach((v, i) => {
        total[i] = Math.round((total[i] + v) * 100) / 100;
      });
    });
    return total;
  };

  const comprometido = soma(aprovadas);
  const propostos = soma(pendentes);
  const saldo = new Array(12).fill(0).map((_, i) =>
    Math.round((((caixaLivre && caixaLivre[i]) || 0) - comprometido[i] - propostos[i]) * 100) / 100);

  return {
    comprometido,
    propostos,
    saldo,
    mesesNegativos: saldo.filter((s) => s < 0).length,
    aprovadas,
    pendentes,
  };
}








function projetarProposta({ proposta, avaliacoes, decisoes, apontamentos, quorum, papel, minhaDiretoria, souProponente }) {
  const avs = (avaliacoes || []).filter((a) => !a.deleted_at);
  const quorumCompleto = avs.length >= quorum;
  const vigente = decisaoVigente(decisoes || []);

  const base = {
    ...proposta,
    estado_derivado: estadoDerivado(proposta, avs.length, quorum),
    custeio: modeloCusteio(proposta),
    liquido: liquido(proposta),
    liquido_exibicao: Math.max(liquido(proposta), 0),
    avaliacoes_recebidas: avs.length,
    quorum,
    situacao_decisao: vigente ? vigente.decisao : null,
    sou_proponente: Boolean(souProponente),
  };

  const semNotas = { avaliacoes: null, medias: null, soma: null };











  if (souProponente) {
    return {
      ...base,
      ...semNotas,
      exigencia: vigente && vigente.decisao === 'reprovada'
        ? { texto: vigente.exigencia_texto, prazo: vigente.exigencia_prazo, rodada: vigente.rodada } : null,
      ressalva: vigente && vigente.decisao === 'aprovada_ressalvas'
        ? {
          texto: vigente.ressalva_texto,
          responsavel_id: vigente.ressalva_responsavel_id,
          prazo: vigente.ressalva_prazo,
          verificada: Boolean(vigente.ressalva_cumprida_em),
        } : null,
      apontamentos: (apontamentos || []).filter((ap) => !ap.deleted_at),
    };
  }

  if (papel === 'proponente') {
    return {
      ...base,
      ...semNotas,

      exigencia: vigente && vigente.decisao === 'reprovada'
        ? { texto: vigente.exigencia_texto, prazo: vigente.exigencia_prazo, rodada: vigente.rodada } : null,
      ressalva: vigente && vigente.decisao === 'aprovada_ressalvas'
        ? {
          texto: vigente.ressalva_texto,
          responsavel_id: vigente.ressalva_responsavel_id,
          prazo: vigente.ressalva_prazo,
          verificada: Boolean(vigente.ressalva_cumprida_em),
        } : null,
      apontamentos: (apontamentos || []).filter((ap) => !ap.deleted_at),
    };
  }

  if (papel === 'avaliador') {
    const minha = avs.find((a) => a.diretoria === minhaDiretoria) || null;
    return {
      ...base,
      exigencia: null, ressalva: null, apontamentos: null,
      minha_avaliacao: minha,
      avaliacoes: quorumCompleto ? avs : null,
      medias: quorumCompleto ? mediasPorCriterio(avs) : null,
      soma: quorumCompleto ? mediasPorCriterio(avs).reduce((s, m) => s + m, 0) : null,
    };
  }

  if (papel === 'pastor') {
    return {
      ...base,
      exigencia: vigente && vigente.decisao === 'reprovada'
        ? { texto: vigente.exigencia_texto, prazo: vigente.exigencia_prazo, rodada: vigente.rodada } : null,
      ressalva: vigente && vigente.decisao === 'aprovada_ressalvas'
        ? {
          texto: vigente.ressalva_texto,
          responsavel_id: vigente.ressalva_responsavel_id,
          prazo: vigente.ressalva_prazo,
          verificada: Boolean(vigente.ressalva_cumprida_em),
          verificada_por: vigente.ressalva_verificada_por || null,
        } : null,
      apontamentos: (apontamentos || []).filter((ap) => !ap.deleted_at),




      avaliacoes: avs,
      medias: avs.length ? mediasPorCriterio(avs) : null,
      soma: avs.length ? mediasPorCriterio(avs).reduce((s, m) => s + m, 0) : null,
      diff_retificacao: proposta.versao_anterior ? diffRetificacao(proposta.versao_anterior, proposta) : null,
    };
  }


  return { ...base, ...semNotas, exigencia: null, ressalva: null, apontamentos: null };
}

module.exports = {
  SUPOSICOES,
  CRITERIOS,
  VALORES_IGREJA,
  CAMPOS_APONTAVEIS,
  CAMPOS_RETIFICACAO,
  LINHAS_ORCAMENTO,
  TRANSICOES,

  somarDias,
  horariosSobrepoem,
  mesDe,

  liquido,
  modeloCusteio,
  mesesOcupados,
  rateioMensal,

  decisaoVigente,
  ressalvaVerificada,
  noCalendario,
  estadoDerivado,
  podeTransicionar,

  validarEnvio,
  validarCamposObrigatorios,
  validarAvaliacao,
  validarRetificacao,
  snapshotRetificacao,
  diffRetificacao,

  somasPorCriterio,
  mediasPorCriterio,
  montarRanking,

  detectarConflitos,
  aplicarAceites,

  validarTravas,

  caixaLivreMensal,
  orcamentoDoPastor,

  MULTIPLICADOR_RECORRENCIA,
  valorEfetivoProposta,
  custoAnualizado,

  valoresMaterializacao,
  datasOcorrencias,
  datasNoCalendario,
  liturgicosDoAno,
  ehDataISO,
  aplicarAjustes,
  encontraoDoAno,
  cultosDoAno,
  FASES_INICIAIS_ROTINA,
  saudeExecucao,
  divergenciaPublicado,
  nomeFaseRotina,
  gestorPode,
  RECORRENCIA_EVENTO,
  distribuirCustoPorMes,
  custoMensalTodasPropostas,
  custoMensalAprovadas,

  projetarProposta,
};
