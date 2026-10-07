




import { ddmm, rotuloCulto, ehFrenteRotina, origemDaTarefa } from './layout';

export const SITUACOES = [
  { key: 'atrasada', rotulo: 'Atrasadas' },
  { key: 'semana', rotulo: 'Esta semana' },
  { key: 'proxima', rotulo: 'Próximas' },
  { key: 'sem_data', rotulo: 'Sem data' },
  { key: 'concluida', rotulo: 'Concluídas' },
];




export const HORIZONTE_PROXIMAS = 4;




export function situacaoDe(t, semanaAtual) {
  if (!t || !t.aberta) return 'concluida';
  if (t.tipo === 'pedido' && t.atrasada) return 'atrasada';
  if (t.semana == null) return 'sem_data';
  if (t.semana < semanaAtual) return 'atrasada';
  if (t.semana === semanaAtual) return 'semana';
  return 'proxima';
}

export function progressoItens(t) {
  const itens = (t && t.itens) || [];
  return { feitos: itens.filter(i => i.feito).length, total: itens.length };
}

function linha(t, semanaAtual, extra = {}) {
  const ehPedido = t.tipo === 'pedido';
  const ehRotina = ehFrenteRotina(t.frente);
  const responsavel = ehPedido ? null : ehRotina ? t.membro_id || null : t.atribuido_a || null;


  const pessoas = ehPedido ? [] : [...new Set([responsavel, ...((t.itens || []).map(i => i.membro_id))].filter(Boolean))];
  return {
    key: String(t.id),
    tarefa: t,
    tipo: ehPedido ? 'pedido' : ehRotina ? 'rotina' : 'tarefa',
    situacao: situacaoDe(t, semanaAtual),
    semana: t.semana ?? null,
    prazo: t.prazo || null,
    responsavel,
    pessoas,
    progresso: progressoItens(t),

    origem: origemDaTarefa(t),
    ...extra,
  };
}



export function linhasDoPainel(dados, frente) {
  const fr = dados && dados.frentes && dados.frentes[frente];
  if (!fr) return [];
  const sa = dados.semana_atual;
  if (frente === 'ins') {
    const out = [];
    for (const s of fr.series || []) {
      const serie = { id: idDaSerie(s), nome: s.nome || 'Evento sem nome', data: s.data || null };
      for (const e of s.etapas || []) {
        for (const t of e.faixas || []) {
          out.push(linha(t, sa, { serie, titulo: `${e.nome_fase || t.titulo || 'Etapa'} · ${rotuloCulto(t.culto)}` }));
        }
      }
    }
    return out;
  }
  return (fr.tarefas || []).map(t => linha(t, sa));
}


export const idDaSerie = (s) => String((s && s.event_id) || 'sem_evento');



export function separarPedidos(linhas) {
  const pedidos = [];
  const tarefas = [];
  for (const l of linhas) (l.tipo === 'pedido' ? pedidos : tarefas).push(l);
  return { pedidos, tarefas };
}

export function filtrarPorPessoa(linhas, membroId) {
  if (!membroId) return linhas;
  return linhas.filter(l => l.pessoas.includes(membroId));
}


export function filtrarPorOrigem(linhas, origem) {
  if (!origem) return linhas;
  return linhas.filter(l => l.origem === origem);
}



export function contarOrigens(linhas) {
  const n = { externa: 0, interna: 0 };
  for (const l of linhas) if (l.origem in n) n[l.origem] += 1;
  return n;
}

export function filtrarPorSerie(linhas, serieId) {
  if (!serieId) return linhas;
  return linhas.filter(l => l.serie && l.serie.id === String(serieId));
}


export function filtrarPorSituacao(linhas, filtro) {
  if (!filtro || filtro === 'todas') return linhas;
  if (filtro === 'abertas') return linhas.filter(l => l.situacao !== 'concluida');
  return linhas.filter(l => l.situacao === filtro);
}





export function resumoPainel(linhas, semanaAtual) {
  const por = Object.fromEntries(SITUACOES.map(s => [s.key, 0]));
  let feitos = 0;
  let total = 0;
  for (const l of linhas) {
    por[l.situacao] += 1;
    if (l.semana != null && l.semana <= semanaAtual) {
      feitos += l.progresso.feitos;
      total += l.progresso.total;
    }
  }
  return {
    total: linhas.length,
    abertas: linhas.length - por.concluida,
    por,
    andamento: { feitos, total, pct: total ? Math.round((feitos * 100) / total) : null },
  };
}

const ordem = (a, b) =>
  (a.semana ?? 999) - (b.semana ?? 999) || String(a.prazo || '').localeCompare(String(b.prazo || ''));




export function agruparPorSituacao(linhas, { semanaAtual, horizonte = HORIZONTE_PROXIMAS } = {}) {
  return SITUACOES
    .map(s => {
      const todas = linhas.filter(l => l.situacao === s.key).sort(ordem);
      if (s.key !== 'proxima' || semanaAtual == null) return { ...s, linhas: todas, ocultas: [] };
      const limite = semanaAtual + horizonte;
      return { ...s, linhas: todas.filter(l => l.semana <= limite), ocultas: todas.filter(l => l.semana > limite) };
    })
    .filter(s => s.linhas.length + s.ocultas.length > 0);
}




export function agruparPorSerie(linhas, semanaAtual) {
  const mapa = new Map();
  for (const l of linhas) {
    const id = l.serie ? l.serie.id : 'sem_evento';
    if (!mapa.has(id)) mapa.set(id, { id, nome: l.serie ? l.serie.nome : 'Sem série', data: l.serie ? l.serie.data : null, linhas: [] });
    mapa.get(id).linhas.push(l);
  }
  return [...mapa.values()]
    .map(g => {
      const abertas = g.linhas.filter(l => l.situacao !== 'concluida' && l.semana != null);
      const prox = abertas.length ? Math.min(...abertas.map(l => l.semana)) : 999;
      return { ...g, resumo: resumoPainel(g.linhas, semanaAtual), prox, linhas: [...g.linhas].sort(ordem) };
    })
    .sort((a, b) => a.prox - b.prox || String(a.data || '').localeCompare(String(b.data || '')));
}



export function pessoasDoPainel(linhas, membros) {
  const ids = new Set(linhas.flatMap(l => l.pessoas));
  return (membros || [])
    .filter(m => ids.has(m.id))
    .map(m => ({ id: m.id, nome: m.nome || 'Sem nome' }))
    .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
}

export function rotuloSemana(semanas, n, ano) {
  if (n == null) return 'sem data';
  if (n === 0) return `antes de ${ano}`;
  const w = (semanas || []).find(s => s.n === n);
  return w ? `sem. ${n} · ${ddmm(w.inicio)}` : `sem. ${n}`;
}
