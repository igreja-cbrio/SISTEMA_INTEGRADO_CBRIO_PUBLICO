'use strict';













const { horasDoItem } = require('./marketingAlocacao');


const { ehFrenteRotina, AREAS_ROTINA } = require('./marketingLinha');
const FRENTES_DE_ROTINA = Object.values(AREAS_ROTINA);

const r1 = (n) => Math.round(n * 10) / 10;

function semanasDaJanela(semanaAtual, horizonte, ultimaSemana) {
  const out = [];
  for (let n = semanaAtual; n < semanaAtual + horizonte && (ultimaSemana == null || n <= ultimaSemana); n++) out.push(n);
  return out;
}



function semanaQuePesa(semana, semanaAtual) {
  if (semana == null) return null;
  return semana < semanaAtual ? semanaAtual : semana;
}

function cargaPorPessoa({
  membros = [], tarefas = [], rotina = [], folgas = [], semanaAtual, horizonte = 4, ultimaSemana = null,
  semanaDoItem = () => null,
}) {
  const janela = semanasDaJanela(semanaAtual, horizonte, ultimaSemana);
  const naJanela = new Set(janela);
  const celula = () => ({ capacidade: 0, folga: null, rotina_h: 0, demandas_h: 0, livre: 0, tarefas: 0, sem_estimativa: 0, atrasadas: 0 });
  const porPessoa = new Map();
  for (const m of membros) {
    const semanas = {};
    for (const n of janela) semanas[n] = { ...celula(), capacidade: Number(m.horas_semanais) || 0 };
    porPessoa.set(m.id, {
      id: m.id, nome: m.nome || 'Sem nome', habilidade: m.habilidade || null,
      horas_semanais: Number(m.horas_semanais) || 0, semanas, _tarefasPorSemana: {},
    });
  }

  for (const f of folgas) {
    const p = porPessoa.get(f.membro_id);
    if (!p || !naJanela.has(f.semana)) continue;
    const c = p.semanas[f.semana];
    c.capacidade = Math.max(0, Number(f.horas_disponiveis) || 0);
    c.folga = { horas: c.capacidade, motivo: f.motivo || null };
  }

  for (const t of rotina) {
    const p = porPessoa.get(t.membro_id);
    if (!p || !naJanela.has(t.semana)) continue;

    p.semanas[t.semana].rotina_h += (t.itens || []).reduce((a, i) => a + (Number(i.esforco_valor) || 0), 0);
  }

  const contarTarefa = (p, semana, id, atrasada) => {
    const chave = `${semana}|${id}`;
    if (p._tarefasPorSemana[chave]) return;
    p._tarefasPorSemana[chave] = true;
    p.semanas[semana].tarefas += 1;
    if (atrasada) p.semanas[semana].atrasadas += 1;
  };

  for (const t of tarefas) {
    if (!t || t.tipo === 'pedido' || ehFrenteRotina(t.frente) || !t.aberta) continue;
    const abertos = (t.itens || []).filter(i => !i.feito);
    const resp = t.atribuido_a || null;
    const semTarefa = semanaQuePesa(t.semana, semanaAtual);
    if (!abertos.length) {

      const p = porPessoa.get(resp);
      if (p && naJanela.has(semTarefa)) {
        contarTarefa(p, semTarefa, t.id, t.semana != null && t.semana < semanaAtual);
        p.semanas[semTarefa].sem_estimativa += 1;
      }
      continue;
    }
    for (const i of abertos) {
      const p = porPessoa.get(i.membro_id || resp);
      if (!p) continue;
      const semOrig = semanaDoItem(i) ?? t.semana;
      const sem = semanaQuePesa(semOrig, semanaAtual);
      if (!naJanela.has(sem)) continue;
      contarTarefa(p, sem, t.id, semOrig != null && semOrig < semanaAtual);
      const h = horasDoItem(i);
      if (h > 0) p.semanas[sem].demandas_h += h;
      else p.semanas[sem].sem_estimativa += 1;
    }
  }

  const pessoas = [...porPessoa.values()].map(p => {
    for (const n of janela) {
      const c = p.semanas[n];
      c.rotina_h = r1(c.rotina_h);
      c.demandas_h = r1(c.demandas_h);
      c.livre = r1(c.capacidade - c.rotina_h - c.demandas_h);
    }
    const { _tarefasPorSemana, ...resto } = p;
    return resto;
  }).sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));

  return { semanas: janela, pessoas };
}



function ocupacao(c) {
  const usado = (c.rotina_h || 0) + (c.demandas_h || 0);
  if (!(c.capacidade > 0)) return usado > 0 ? Infinity : null;
  return usado / c.capacidade;
}










function resumoDaEquipe(carga, { excluir = [] } = {}) {
  const semana = (carga && carga.semanas && carga.semanas[0]) ?? null;
  const fora = new Set(excluir);
  let usado = 0; let capacidade = 0; let demandas = 0; let semEstimativa = 0; let pessoas = 0; let usadoFora = 0;
  for (const p of (carga && carga.pessoas) || []) {
    const c = semana == null ? null : p.semanas[semana];
    if (!c) continue;
    const u = (c.rotina_h || 0) + (c.demandas_h || 0);
    if (fora.has(p.id)) { usadoFora += u; continue; }
    pessoas += 1;
    usado += u;
    demandas += c.demandas_h || 0;
    capacidade += c.capacidade || 0;
    semEstimativa += c.sem_estimativa || 0;
  }
  let pct = null;
  let motivo = null;
  if (!pessoas) motivo = 'sem_equipe';
  else if (!(capacidade > 0)) motivo = 'sem_capacidade';
  else if (demandas === 0 && semEstimativa > 0) motivo = 'sem_estimativa';
  else pct = Math.round((usado / capacidade) * 100);
  return {
    semana, pessoas, usado_h: r1(usado), capacidade_h: r1(capacidade),
    sem_estimativa: semEstimativa, coordenacao_h: r1(usadoFora), pct, motivo,
  };
}








function minhaSemana({
  membros = [], tarefas = [], rotina = [], semanaAtual, ultimaSemana = null,
  semanaDoItem = () => null, meusIds = [],
}) {
  const ids = new Set((meusIds || []).filter(Boolean));
  const eu = (membros || []).filter(m => ids.has(m.id));
  if (!eu.length || !(semanaAtual >= 1)) return null;

  const contar = (lista) => {
    const r = cargaPorPessoa({ membros: eu, tarefas: lista, rotina: [], semanaAtual, horizonte: 1, ultimaSemana, semanaDoItem });
    const soma = { tarefas: 0, atrasadas: 0, sem_estimativa: 0, demandas_h: 0 };
    for (const p of r.pessoas) {
      const c = p.semanas[semanaAtual];
      if (!c) continue;
      soma.tarefas += c.tarefas;
      soma.atrasadas += c.atrasadas;
      soma.sem_estimativa += c.sem_estimativa;
      soma.demandas_h += c.demandas_h;
    }
    soma.demandas_h = r1(soma.demandas_h);
    return soma;
  };

  const total = contar(tarefas);
  const porFrente = {};


  for (const f of ['ins', 'sis', 'prd']) porFrente[f] = contar(tarefas.filter(t => t && t.frente === f)).tarefas;




  const daSemana = (rotina || []).filter(t => t && ids.has(t.membro_id) && t.semana === semanaAtual);
  const contarRotina = (lista) => {
    const itens = lista.flatMap(t => t.itens || []);
    return { total: itens.length, feitas: itens.filter(i => i.feito).length };
  };
  const rotinaPorFrente = {};
  for (const f of FRENTES_DE_ROTINA) rotinaPorFrente[f] = contarRotina(daSemana.filter(t => (t.frente || 'rot') === f));

  return {
    semana: semanaAtual,
    ...total,
    por_frente: porFrente,
    rotina: contarRotina(daSemana),
    rotina_por_frente: rotinaPorFrente,
  };
}




function semanaDoItemPor(semanaDe) {
  return (i) => {
    if (!i || !i.prazo) return null;
    const s = semanaDe(i.prazo);
    return s == null ? Number.POSITIVE_INFINITY : s;
  };
}

module.exports = { cargaPorPessoa, semanasDaJanela, semanaQuePesa, ocupacao, resumoDaEquipe, semanaDoItemPor, minhaSemana };
