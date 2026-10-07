







export const FRENTE_ROTULO = { ins: 'Calendário · Ciclos criativos', sis: 'Requisições', int: 'Requisições', rot: 'Calendário · Rotina', red: 'Redes · Rotina', prd: 'Redes · Produção' };
export const CULTO_ROTULO = { cbrio: 'CBRio', ami: 'AMI', kids: 'Kids', sem_culto: 'sem culto' };
export const PEDIDO_STATUS_ROTULO = {
  aguardando_alocacao: 'esperando alocação',
  sem_tarefa: 'triado, sem tarefa',
  aguardando_aprovacao: 'no diretor de origem',
};




export const NOME_KPI = {
  'MKT-PRAZO': 'Entregues no prazo',
  'MKT-LEAD': 'Lead time do pedido à entrega',
  'MKT-THROUGHPUT': 'Entregas por semana',
  'MKT-DEM-CAP': 'Demanda × capacidade',
};
export const nomeKpi = (ind) => (ind && (NOME_KPI[ind.id] || ind.nome || ind.id)) || '';



export const ddmm = (s) => (s ? `${String(s).slice(8, 10)}/${String(s).slice(5, 7)}` : '—');



export const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;



export function rotuloFaixa(f) {
  if (!f) return '';
  if (f.chave === 'vencidas') return 'Vencidas';
  if (f.chave === 'depois') return 'Depois';
  if (f.chave === 0) return 'Esta semana';
  return ddmm(f.inicio);
}


export function janelaFaixa(f) {
  if (!f) return '';
  if (f.chave === 'vencidas') return f.fim ? `prazo até ${ddmm(f.fim)}` : 'prazo já passou';
  if (f.chave === 'depois') return f.inicio ? `a partir de ${ddmm(f.inicio)}` : 'mais adiante';
  return `${ddmm(f.inicio)} a ${ddmm(f.fim)}`;
}



export function alturaRelativa(total, maximo) {
  const t = Number(total) || 0;
  const m = Number(maximo) || 0;
  if (t <= 0 || m <= 0) return 0;
  return Math.max(3, Math.round((t / m) * 100));
}



export function faixaRotulada(f, pico) {
  if (!f || !f.total) return false;
  return f.chave === 'vencidas' || f.chave === 0 || f.chave === pico;
}


export function composicaoCulto(porCulto = {}) {
  return Object.entries(porCulto || {})
    .filter(([, n]) => n > 0)
    .map(([chave, n]) => ({ chave, rotulo: CULTO_ROTULO[chave] || chave, n }))
    .sort((a, b) => b.n - a.n || a.rotulo.localeCompare(b.rotulo, 'pt-BR'));
}

export function composicaoFrente(porFrente = {}) {
  return Object.entries(porFrente || {})
    .filter(([, n]) => n > 0)
    .map(([chave, n]) => ({ chave, rotulo: FRENTE_ROTULO[chave] || chave, n }))
    .sort((a, b) => b.n - a.n);
}



export function textoHero(topo) {
  if (!topo) return null;
  const n = Number(topo.com_atraso) || 0;
  return {
    alerta: n > 0,
    numero: n,
    titulo: n === 0
      ? 'Nenhuma demanda com atraso'
      : `${n === 1 ? 'demanda' : 'demandas'} com atraso`,
    detalhe: `${plural(Number(topo.pecas_vencidas) || 0, 'peça vencida', 'peças vencidas')} · de ${plural(Number(topo.demandas_abertas) || 0, 'demanda aberta', 'demandas abertas')}`,
    frentes: composicaoFrente(topo.com_atraso_por_frente),
  };
}



export function progressoCiclo(l) {
  const total = Number(l && l.total) || 0;
  if (!total) return null;
  const pct = (n) => Math.min(100, Math.max(0, Math.round((Number(n) || 0) / total * 100)));
  return { total, pct_prontas: pct(l.prontas), pct_devia: pct(l.deviam) };
}

export function quandoDiaD(l) {
  if (!l || !l.dia_d) return 'sem Dia D';
  const d = Number(l.dias_ate_dia_d);
  if (!Number.isFinite(d)) return `Dia D ${ddmm(l.dia_d)}`;
  if (d === 0) return `Dia D hoje (${ddmm(l.dia_d)})`;
  if (d < 0) return `Dia D foi ${ddmm(l.dia_d)}`;
  return `Dia D ${ddmm(l.dia_d)} · em ${plural(d, 'dia', 'dias')}`;
}



export function eixoDias(maxDias) {
  const m = Math.max(30, Number(maxDias) || 0);
  return Math.ceil((m + 1) / 15) * 15;
}



export function posicionarPontos(pontos = [], limite) {
  const lim = Number(limite) || 1;
  const porLinha = new Map();
  return (pontos || []).filter(p => p && p.dias != null).map(p => {
    const x = Math.min(100, Math.max(0, (Number(p.dias) / lim) * 100));
    const linha = p.area || '';
    const vizinhos = porLinha.get(linha) || [];
    const nivel = vizinhos.filter(v => Math.abs(v - x) < 4).length;
    vizinhos.push(x);
    porLinha.set(linha, vizinhos);
    return { ...p, x, nivel };
  });
}



export function medidorPct(parte, total) {
  const t = Number(total) || 0;
  if (t <= 0) return null;
  return Math.round(((Number(parte) || 0) / t) * 100);
}


export function formatoValorKpi(valor, unidade) {
  if (valor == null) return 'sem medição';
  const n = Number(valor);
  const num = Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',');
  const u = String(unidade || '').trim();
  if (u === '%') return `${num}%`;
  if (!u) return num;
  return `${num} ${u}`;
}

export function textoMeta(meta, unidade, sentido) {
  if (meta == null) return 'sem meta';
  const sinal = sentido === 'menor_melhor' ? '≤' : '≥';
  return `meta ${sinal} ${formatoValorKpi(meta, unidade)}`;
}
