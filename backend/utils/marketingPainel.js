'use strict';


















const L = require('./marketingLinha');
const { horasDoItem } = require('./marketingAlocacao');

const DIA_MS = 86400000;
const SEMANAS_HORIZONTE = 8;




const MARCO_ZERO_KPI = '2026-W40';


const SEMANAS_CALIBRACAO = 6;
const KPIS_MKT = ['MKT-PRAZO', 'MKT-LEAD', 'MKT-THROUGHPUT', 'MKT-DEM-CAP'];

const utc = (dia) => Date.parse(String(dia).slice(0, 10) + 'T00:00:00Z');
const isoDe = (ms) => new Date(ms).toISOString().slice(0, 10);
const r1 = (n) => Math.round(n * 10) / 10;

function somarDias(dia, n) {
  return isoDe(utc(dia) + n * DIA_MS);
}

function diasEntre(depois, antes) {
  return Math.round((utc(depois) - utc(antes)) / DIA_MS);
}

function mediana(numeros) {
  const v = (numeros || []).filter(n => Number.isFinite(n)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : Math.round((v[m - 1] + v[m]) / 2);
}






function inicioDaSemana(hoje) {
  const domingo = L.domingoDe(hoje);
  const jan1 = `${String(hoje).slice(0, 4)}-01-01`;
  return domingo < jan1 ? jan1 : domingo;
}

function fimDaSemana(hoje) {
  return somarDias(L.domingoDe(hoje), 6);
}



function faixaDoHorizonte(dia, hoje, n = SEMANAS_HORIZONTE) {
  const d = L.dataSP(dia);
  if (!d) return 'sem_prazo';
  if (d < inicioDaSemana(hoje)) return 'vencidas';
  const k = Math.floor(diasEntre(d, L.domingoDe(hoje)) / 7);
  return k > n ? 'depois' : k;
}

function faixasDoHorizonte(hoje, n = SEMANAS_HORIZONTE) {
  const domingo = L.domingoDe(hoje);
  const ini = inicioDaSemana(hoje);
  const out = [{ chave: 'vencidas', inicio: null, fim: somarDias(ini, -1) }];
  for (let k = 0; k <= n; k++) {
    out.push({ chave: k, inicio: k === 0 ? ini : somarDias(domingo, 7 * k), fim: somarDias(domingo, 7 * k + 6) });
  }
  out.push({ chave: 'depois', inicio: somarDias(domingo, 7 * (n + 1)), fim: null });
  return out;
}





function montarTarefas(cards = [], itensPorCard = {}) {
  return (cards || []).filter(Boolean).map(c => {
    const itens = itensPorCard[c.id] || [];
    return {
      id: c.id,
      frente: L.frenteDoCard(c),
      culto: c.culto || null,
      estado: c.estado,
      event_id: c.event_id || null,
      atribuido_a: c.atribuido_a || null,
      prazo: L.prazoDoCard(c),
      aberta: L.tarefaAberta({ estado: c.estado, papel: 'lider', itens }),
      itens,
    };
  });
}





function pecasAbertas(tarefas = []) {
  const out = [];
  for (const t of tarefas || []) {
    if (!t || !t.aberta) continue;
    const abertos = (t.itens || []).filter(i => i && !i.feito);
    if (!abertos.length) {
      out.push({ tarefa_id: t.id, frente: t.frente, culto: t.culto || null, dia: t.prazo || null, membro_id: null, horas: 0, subtarefa: false });
      continue;
    }
    for (const i of abertos) {
      out.push({
        tarefa_id: t.id,
        frente: t.frente,
        culto: t.culto || null,
        dia: L.dataSP(i.prazo) || t.prazo || null,
        membro_id: i.membro_id || null,
        horas: horasDoItem(i),
        subtarefa: true,
      });
    }
  }
  return out;
}



function horizonteDePecas(pecas = [], hoje, n = SEMANAS_HORIZONTE) {
  const faixas = faixasDoHorizonte(hoje, n).map(f => ({ ...f, total: 0, por_culto: {}, por_frente: {} }));
  const porChave = new Map(faixas.map(f => [String(f.chave), f]));
  let semPrazo = 0;
  for (const p of pecas || []) {
    const chave = faixaDoHorizonte(p.dia, hoje, n);
    if (chave === 'sem_prazo') { semPrazo++; continue; }
    const f = porChave.get(String(chave));
    f.total++;
    const culto = p.culto || 'sem_culto';
    f.por_culto[culto] = (f.por_culto[culto] || 0) + 1;
    f.por_frente[p.frente] = (f.por_frente[p.frente] || 0) + 1;
  }
  let pico = null;
  for (const f of faixas) {
    if (typeof f.chave !== 'number' || f.total === 0) continue;
    if (!pico || f.total > pico.total) pico = f;
  }
  return { semanas: n, faixas, sem_prazo: semPrazo, total: (pecas || []).length, pico: pico ? pico.chave : null };
}







function filaDePedidos(abertos = [], hoje, { comTitulo = false } = {}) {
  const pontos = (abertos || []).filter(Boolean).map(({ sol, campanha, status }) => {
    const desde = L.dataSP(sol.created_at);
    return {
      id: sol.id,
      status,
      area: (sol.area_cliente && String(sol.area_cliente).trim()) || null,
      desde,
      dias: desde ? Math.max(0, diasEntre(hoje, desde)) : null,
      para: L.dataSP(sol.data_necessaria),
      urgente: sol.eh_urgente === true,
      titulo: comTitulo ? (sol.titulo || (campanha && campanha.titulo) || null) : null,
    };
  }).sort((a, b) => (b.dias ?? -1) - (a.dias ?? -1));



  const esperando = pontos.filter(p => p.status !== 'aguardando_aprovacao');
  const comDias = esperando.filter(p => p.dias != null);
  const areas = {};
  for (const p of pontos) {
    const k = p.area || '';
    const a = (areas[k] ||= { area: p.area, total: 0, esperando: 0, max_dias: 0 });
    a.total++;
    if (p.status !== 'aguardando_aprovacao') a.esperando++;
    if (p.dias != null && p.dias > a.max_dias) a.max_dias = p.dias;
  }
  return {
    pontos,
    areas: Object.values(areas).sort((a, b) => b.total - a.total || String(a.area || '~').localeCompare(String(b.area || '~'), 'pt-BR')),
    esperando: esperando.length,
    no_diretor: pontos.length - esperando.length,
    mediana_dias: mediana(comDias.map(p => p.dias)),
    mais_antigo_dias: comDias.length ? Math.max(...comDias.map(p => p.dias)) : null,
  };
}





function pedidosSemSolicitacaoViva({ campanhas = [], solicitacoesPorId = {}, cards = [] } = {}) {
  const campComCard = new Set((cards || []).map(c => c && c.campanha_id).filter(Boolean));
  const solComCard = new Set((cards || []).map(c => c && c.solicitacao_id).filter(Boolean));
  const out = [];
  for (const c of campanhas || []) {
    if (!c || !['triagem', 'ativa'].includes(c.status)) continue;
    if (campComCard.has(c.id) || (c.solicitacao_id && solComCard.has(c.solicitacao_id))) continue;
    const s = c.solicitacao_id ? solicitacoesPorId[c.solicitacao_id] : null;
    let motivo = null;
    if (!c.solicitacao_id) motivo = 'sem_solicitacao';
    else if (!s || s.deleted_at) motivo = 'solicitacao_apagada';
    else if (L.SOLICITACAO_FECHADA.has(s.status)) motivo = 'solicitacao_fechada';
    if (motivo) out.push({ id: c.id, titulo: c.titulo || null, status: c.status, motivo, desde: L.dataSP(c.created_at) });
  }
  return out;
}





function resumoDoTopo({ tarefas = [], pecas = [], pedidos = null, hoje }) {
  const ini = inicioDaSemana(hoje);
  const fim = fimDaSemana(hoje);
  const abertas = (tarefas || []).filter(t => t && t.aberta);
  const comAtraso = abertas.filter(t => t.prazo && t.prazo < ini);
  const porFrente = {};
  for (const t of comAtraso) porFrente[t.frente] = (porFrente[t.frente] || 0) + 1;
  const esperando = pedidos ? pedidos.filter(p => p.status !== 'aguardando_aprovacao') : null;
  const diasEsperando = esperando ? esperando.map(p => p.dias).filter(n => Number.isFinite(n)) : [];
  return {
    demandas_abertas: abertas.length,
    com_atraso: comAtraso.length,
    com_atraso_por_frente: porFrente,
    pecas_vencidas: (pecas || []).filter(p => p.dia && p.dia < ini).length,
    pecas_nesta_semana: (pecas || []).filter(p => p.dia && p.dia >= ini && p.dia <= fim).length,
    sem_prazo: abertas.filter(t => !t.prazo).length,
    pedidos_esperando: esperando ? esperando.length : null,
    pedido_mais_antigo_dias: diasEsperando.length ? Math.max(...diasEsperando) : null,
    pedidos_no_diretor: pedidos ? pedidos.length - esperando.length : null,
  };
}







function andamentoDosCiclos({ ciclos = [], tarefas = [], hoje }) {
  const ini = inicioDaSemana(hoje);
  const fim = fimDaSemana(hoje);
  const porEvento = {};
  for (const t of tarefas || []) if (t && t.event_id) (porEvento[t.event_id] ||= []).push(t);
  const linhas = [];
  const aEncerrar = [];
  for (const c of ciclos || []) {
    if (!c) continue;
    const ts = porEvento[c.event_id] || [];
    const abertas = ts.filter(t => t.aberta);
    const diaD = L.dataSP(c.dia_d);
    if (diaD && diaD < hoje && !abertas.length) {
      aEncerrar.push({ event_id: c.event_id, nome: c.nome, dia_d: diaD, tarefas: ts.length });
      continue;
    }
    const deviam = ts.filter(t => t.prazo && t.prazo < ini);
    const proximos = abertas.filter(t => t.prazo && t.prazo >= ini).map(t => t.prazo).sort();
    linhas.push({
      event_id: c.event_id,
      nome: c.nome,
      dia_d: diaD,
      dias_ate_dia_d: diaD ? diasEntre(diaD, hoje) : null,
      total: ts.length,
      prontas: ts.length - abertas.length,
      deviam: deviam.length,
      vencidas: deviam.filter(t => t.aberta).length,
      nesta_semana: abertas.filter(t => t.prazo && t.prazo >= ini && t.prazo <= fim).length,
      sem_prazo: abertas.filter(t => !t.prazo).length,
      proximo_prazo: proximos[0] || null,
    });
  }
  const porDia = (a, b) => String(a.dia_d || '9999-99-99').localeCompare(String(b.dia_d || '9999-99-99'));
  return { linhas: linhas.sort(porDia), a_encerrar: aEncerrar.sort(porDia) };
}




function prontidaoDoDado({ pecas = [], membros = null, matriz = null, rotina = null }) {
  const sub = (pecas || []).filter(p => p && p.subtarefa);
  const ativos = membros == null ? null : membros.filter(m => m && m.ativo !== false);
  return {
    subtarefas: {
      total: sub.length,
      com_dono: sub.filter(p => p.membro_id).length,
      com_horas: sub.filter(p => p.horas > 0).length,
    },
    capacidade: ativos == null ? null : {
      pessoas: ativos.length,
      com_horas: ativos.filter(m => Number(m.horas_semanais) > 0).length,
      horas_semana: r1(ativos.reduce((a, m) => a + (Number(m.horas_semanais) || 0), 0)),
    },
    matriz: matriz == null ? null : {
      total: matriz.length,
      com_horas: matriz.filter(i => horasDoItem(i) > 0).length,
    },
    rotina: rotina == null ? null : {
      compromissos: rotina.compromissos,
      esperadas: rotina.esperadas,
      marcadas: rotina.marcadas,
    },
  };
}




function semanaIso(dia) {
  const d = new Date(utc(dia));
  const dow = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dow);
  const ano = d.getUTCFullYear();
  const semana = Math.ceil((((d.getTime() - Date.UTC(ano, 0, 1)) / DIA_MS) + 1) / 7);
  return `${ano}-W${String(semana).padStart(2, '0')}`;
}


function segundaDaSemanaIso(rotulo) {
  const m = /^(\d{4})-W(\d{2})$/.exec(String(rotulo || ''));
  if (!m) return null;
  const jan4 = Date.UTC(Number(m[1]), 0, 4);
  const dow = new Date(jan4).getUTCDay() || 7;
  return isoDe(jan4 - (dow - 1) * DIA_MS + (Number(m[2]) - 1) * 7 * DIA_MS);
}

function atingiuMeta(valor, meta, sentido) {
  if (valor == null || meta == null) return null;
  return sentido === 'menor_melhor' ? Number(valor) <= Number(meta) : Number(valor) >= Number(meta);
}





function kpisEmCalibracao({ indicadores = [], registros = [], hoje, marco = MARCO_ZERO_KPI, semanas = SEMANAS_CALIBRACAO }) {
  const atual = semanaIso(hoje);
  const segMarco = segundaDaSemanaIso(marco);
  const segAtual = segundaDaSemanaIso(atual);
  const fechadas = Math.max(0, Math.floor(diasEntre(segAtual, segMarco) / 7));
  const calibrado = fechadas >= semanas;

  const itens = KPIS_MKT.map(id => {
    const ind = (indicadores || []).find(i => i && i.id === id) || null;

    const porPeriodo = new Map();
    for (const r of registros || []) {
      if (!r || r.indicador_id !== id) continue;
      const p = r.periodo_referencia;
      if (!p || p < marco || p > atual) continue;
      const antes = porPeriodo.get(p);
      if (!antes || String(r.data_preenchimento || '') >= String(antes.data_preenchimento || '')) porPeriodo.set(p, r);
    }
    const serie = [...porPeriodo.values()]
      .sort((a, b) => String(a.periodo_referencia).localeCompare(String(b.periodo_referencia)))
      .map(r => ({
        periodo: r.periodo_referencia,
        inicio: segundaDaSemanaIso(r.periodo_referencia),
        valor: r.valor_realizado == null ? null : Number(r.valor_realizado),
        observacao: r.observacoes || null,
        em_andamento: r.periodo_referencia === atual,
      }));
    const fechadasSerie = serie.filter(p => !p.em_andamento);
    const ultima = fechadasSerie.length ? fechadasSerie[fechadasSerie.length - 1] : null;
    const sentido = (ind && ind.sentido_meta) || 'maior_melhor';
    const meta = ind && ind.meta_valor != null ? Number(ind.meta_valor) : null;
    let farol = null;
    if (calibrado && ultima && ultima.valor != null && meta != null) {
      farol = atingiuMeta(ultima.valor, meta, sentido) ? 'no_alvo' : 'fora';
    }
    return {
      id,
      nome: (ind && ind.indicador) || id,
      unidade: (ind && ind.unidade) || null,
      meta,
      sentido,
      serie,
      atual: serie.find(p => p.em_andamento) || null,
      ultima_fechada: ultima,
      farol,
    };
  });

  return {
    marco,
    marco_inicio: segMarco,
    semana_atual: atual,
    semanas_fechadas: fechadas,
    semanas_calibracao: semanas,
    calibrado,

    farol_desde: somarDias(segMarco, semanas * 7),
    indicadores: itens,
  };
}

module.exports = {
  SEMANAS_HORIZONTE,
  MARCO_ZERO_KPI,
  SEMANAS_CALIBRACAO,
  KPIS_MKT,
  somarDias,
  diasEntre,
  mediana,
  inicioDaSemana,
  fimDaSemana,
  faixaDoHorizonte,
  faixasDoHorizonte,
  montarTarefas,
  pecasAbertas,
  horizonteDePecas,
  filaDePedidos,
  pedidosSemSolicitacaoViva,
  resumoDoTopo,
  andamentoDosCiclos,
  prontidaoDoDado,
  semanaIso,
  segundaDaSemanaIso,
  atingiuMeta,
  kpisEmCalibracao,
};
