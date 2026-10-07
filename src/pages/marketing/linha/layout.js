









export const FRENTES = [
  { key: 'rot', nome: 'Rotina', desc: 'Rotina da área institucional', quadro: 'cal' },
  { key: 'ins', nome: 'Ciclos criativos', desc: 'Séries com ciclo criativo · CBRio, AMI e Kids', quadro: 'cal' },
  { key: 'sis', nome: 'Requisições', desc: 'Pedidos de outras áreas e demandas do líder', quadro: 'sis' },
  { key: 'red', nome: 'Rotina', desc: 'Rotina da área de redes sociais', quadro: 'redes' },
  { key: 'prd', nome: 'Produção', desc: 'Tarefas da área de redes sociais', quadro: 'redes' },
];



export const QUADROS = [
  { key: 'cal', nome: 'Calendário', desc: 'Rotina institucional e ciclos criativos', frentes: ['rot', 'ins'], cor: 'ins' },
  { key: 'sis', nome: 'Requisições', desc: 'Pedidos de outras áreas e demandas do líder', frentes: ['sis'], cor: 'sis' },
  { key: 'redes', nome: 'Redes', desc: 'Rotina e produção de redes sociais', frentes: ['red', 'prd'], cor: 'red' },
];


const tem = (obj, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(obj, k);
const QUADRO_POR_KEY = Object.fromEntries(QUADROS.map(q => [q.key, q]));
const QUADRO_DA_FRENTE = Object.fromEntries(QUADROS.flatMap(q => q.frentes.map(f => [f, q.key])));
export const quadroPorKey = (k) => (tem(QUADRO_POR_KEY, k) ? QUADRO_POR_KEY[k] : null);
export const quadroDaFrente = (f) => (tem(QUADRO_DA_FRENTE, f) ? QUADRO_POR_KEY[QUADRO_DA_FRENTE[f]] : null);
export const temSubblocos = (q) => !!q && Array.isArray(q.frentes) && q.frentes.length > 1;



export function rotuloFrente(key) {
  const f = FRENTES.find(x => x.key === key);
  if (!f) return null;
  const q = quadroPorKey(f.quadro);
  return temSubblocos(q) ? `${q.nome} · ${f.nome}` : f.nome;
}





export function statusQuadro(dados, quadro) {
  const fs = ((quadro && quadro.frentes) || []).map(k => dados?.frentes?.[k]).filter(f => f && f.status !== 'indisponivel');
  if (!fs.length) return { status: 'indisponivel', pendentes: null, semanas_atrasadas: [], parcial: false };
  const semanas = [...new Set(fs.flatMap(f => f.semanas_atrasadas || []))].sort((a, b) => a - b);
  return {
    status: fs.some(f => f.status === 'vermelho') ? 'vermelho' : 'verde',
    pendentes: fs.reduce((a, f) => a + (Number(f.pendentes) || 0), 0),
    semanas_atrasadas: semanas,
    parcial: fs.length < quadro.frentes.length,
  };
}



export const AREA_DA_FRENTE = { rot: 'institucional', red: 'redes' };
export const ehFrenteRotina = (frente) => Object.prototype.hasOwnProperty.call(AREA_DA_FRENTE, frente);
export const ROTULO_ROTINA = { rot: 'Rotina institucional', red: 'Rotina de redes' };




export const ROTULO_ORIGEM = { externa: 'Externa', interna: 'Interna' };
export function origemDaTarefa(t) {
  if (!t || t.frente !== 'sis') return null;
  if (t.origem_req === 'externa' || t.origem_req === 'interna') return t.origem_req;
  return t.tipo === 'pedido' || t.solicitacao_id || t.pedido ? 'externa' : 'interna';
}
export const frenteVisivel = (f, dados) => !f.soLider || !!dados?.perfil?.lider;
export const NOME_FRENTE = Object.fromEntries(FRENTES.map(f => [f.key, rotuloFrente(f.key)]));
export const CULTOS = { cbrio: 'CBRio', ami: 'AMI', kids: 'Kids' };
export const rotuloCulto = (c) => CULTOS[c] || 'Sem culto';




export const G = {
  BX: 40, BW: 240, BH: 128, BGAP: 28, TOPY: 140,
  HY: 40, COLW: 256, SPX: 22, NX: 44, NW: 200,
  SBW: 224, SBH: 118,
  CARD_H: 112, ETAPA_TOPO: 62, FAIXA_H: 30, GAP: 18, GG: 56,
};
G.SBX = G.BX + G.BW + 70;
G.NOTE_Y = G.TOPY + QUADROS.length * (G.BH + G.BGAP) + 6;

export const laneY = (i) => G.TOPY + i * (G.BH + G.BGAP) + G.BH / 2;

export const x0Para = (aberta) => (temSubblocos(quadroPorKey(aberta)) ? G.SBX + G.SBW + 80 : G.BX + G.BW + 100);






export const SEMANAS_NA_ABERTURA = 5.5;
const MARGEM_ABERTURA = 16;
const ZOOM_PISO_ABERTURA = 0.5;
const ZOOM_TETO_ABERTURA = 2;

export function enquadramentoInicial(largura, altura, nQuadros = QUADROS.length) {
  const M = MARGEM_ABERTURA;
  const w = Number(largura) > 0 ? Number(largura) : 0;
  const h = Number(altura) > 0 ? Number(altura) : 0;
  const n = Math.max(1, Number(nQuadros) || QUADROS.length);
  const esquerda = G.BX - 20;
  const larguraConteudo = x0Para(null) - esquerda + SEMANAS_NA_ABERTURA * G.COLW;
  const topo = G.HY - 16;
  const base = G.TOPY + n * (G.BH + G.BGAP) - G.BGAP;
  const centro = (G.TOPY + base) / 2;


  const zoom = Math.max(ZOOM_PISO_ABERTURA, Math.min(ZOOM_TETO_ABERTURA,
    Math.min((w - M) / larguraConteudo, (h - 2 * M) / (base - topo))));
  const ideal = h / 2 - centro * zoom;
  const cabecalhoVisivel = M - topo * zoom;
  const quadrosVisiveis = h - M - base * zoom;

  const y = Math.max(cabecalhoVisivel, Math.min(ideal, quadrosVisiveis));
  return { zoom, x: M - esquerda * zoom, y };
}




export function semanaNoPonto(layout, ponto) {
  if (!layout || !Array.isArray(layout.colunas) || !ponto) return null;
  const { x, y } = ponto;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (y < G.HY - 16 || y > layout.CH) return null;
  const c = layout.colunas.find(col => x >= col.x && x < col.x + G.COLW);
  if (!c || c.antes || !c.inicio || !c.fim) return null;
  return c;
}

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
export const ddmm = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : '');
export const ddmmaaaa = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '');
export const mesDe = (s) => (s ? MESES[Number(s.slice(5, 7)) - 1] : '');

export const alturaEtapa = (etapa) => G.ETAPA_TOPO + etapa.faixas.length * G.FAIXA_H;


function unidades(data, key) {
  const f = data.frentes?.[key];
  if (!f) return [];
  if (key === 'ins') {
    return (f.series || []).flatMap((s, si) => (s.etapas || []).map((e, ei) => ({
      tipo: 'etapa', frente: 'ins', si, key: `ins-${si}-${e.event_phase_id ?? ei}`,
      semana: e.semana, aberta: (e.faixas || []).some(t => t.aberta), serie: s, etapa: e,
    })));
  }
  return (f.tarefas || []).map(t => ({ tipo: 'tarefa', frente: key, key: `${key}-${t.id}`, semana: t.semana, aberta: t.aberta, tarefa: t }));
}




export function statusSerie(serie, semanaAtual) {
  const faixas = (serie.etapas || []).flatMap(e => e.faixas || []);
  const abertas = faixas.filter(t => t.aberta && t.semana != null);
  const pend = abertas.filter(t => t.semana <= semanaAtual);
  const atrasadas = abertas.filter(t => t.semana < semanaAtual);
  const semanasAtrasadas = new Set(atrasadas.map(t => t.semana)).size;
  const cultosAtrasados = new Set(atrasadas.map(t => t.culto));
  const cultos = [...new Set(faixas.map(t => t.culto))];
  return {
    pendentes: pend.length, atrasadas: atrasadas.length, semanasAtrasadas,
    vermelha: semanasAtrasadas > 0, cultos, cultosAtrasados,
  };
}




export function textoStatus(pendentes, semanasAtrasadas) {
  const n = Number(pendentes) || 0;
  if (!n) return '';
  const tarefas = `${n} ${n === 1 ? 'tarefa' : 'tarefas'}`;
  const w = Number(semanasAtrasadas) || 0;
  if (!w) return `${tarefas} nesta semana`;
  return `${tarefas} · ${w} ${w === 1 ? 'semana' : 'semanas'}`;
}


export function montarLayout(data, aberta, esconderConcluidas) {
  const semanaAtual = data.semana_atual;
  const semanas = data.semanas || [];
  const quadro = quadroPorKey(aberta);
  const todas = FRENTES.flatMap(f => unidades(data, f.key)).filter(u => u.aberta && u.semana != null);
  const frentesEscopo = quadro ? quadro.frentes : FRENTES.map(f => f.key);
  const escopo = quadro ? todas.filter(u => frentesEscopo.includes(u.frente)) : todas;



  const atrasadasTodas = FRENTES.flatMap(f => data.frentes?.[f.key]?.semanas_atrasadas || []);
  let inicio;
  if (atrasadasTodas.length) inicio = Math.min(...atrasadasTodas);
  else inicio = semanaAtual >= 1 && semanaAtual <= semanas.length ? semanaAtual : 1;

  const atrasadasEscopo = new Set(frentesEscopo.flatMap(k => data.frentes?.[k]?.semanas_atrasadas || []));
  const comAberto = new Set(escopo.map(u => u.semana));

  let cols = [];
  if (inicio === 0) cols.push({ n: 0, inicio: null, fim: null, antes: true });
  cols.push(...semanas.filter(w => w.n >= Math.max(1, inicio)));
  if (esconderConcluidas) cols = cols.filter(w => w.n >= semanaAtual || comAberto.has(w.n));
  if (!cols.length && semanas.length) cols = [semanas[semanas.length - 1]];

  const X0 = x0Para(aberta);
  const colX = (i) => X0 + i * G.COLW;
  const colunas = cols.map((w, i) => ({
    ...w, i, x: colX(i),
    atual: w.n === semanaAtual,
    atrasada: atrasadasEscopo.has(w.n),
    futura: w.n > semanaAtual,
  }));

  const idxDe = (n) => {
    const i = colunas.findIndex(c => c.n >= n);
    return i < 0 ? colunas.length - 1 : i;
  };

  const CW = colX(colunas.length) + 160;
  let CH = G.NOTE_Y + 200;
  const nos = [];
  const grupos = [];
  let li = -1;
  const multi = temSubblocos(quadro);
  let notaSemSeries = null;

  if (quadro) {
    li = QUADROS.findIndex(q => q.key === quadro.key);
    const yLane = laneY(li);
    const lista = [];
    for (const fk of quadro.frentes) {
      if (fk === 'ins') {
        (data.frentes?.ins?.series || []).forEach((s, si) => {
          const us = escopo.filter(u => u.frente === 'ins' && u.si === si);
          if (us.length) lista.push({ serie: s, sub: null, us });
        });
      } else {


        lista.push({ serie: null, sub: multi ? fk : null, us: escopo.filter(u => u.frente === fk) });
      }
    }

    const altura = (u) => (u.tipo === 'etapa' ? alturaEtapa(u.etapa) : G.CARD_H);
    const pilhas = lista.map(g => {
      const porCol = {};
      for (const u of g.us) (porCol[idxDe(u.semana)] ||= []).push(u);
      const altCol = Object.values(porCol).map(us => us.reduce((a, u) => a + altura(u), 0) + G.GAP * (us.length - 1));
      return { porCol, banda: Math.max(0, ...altCol, g.serie || g.sub ? G.SBH : 60) };
    });
    const total = pilhas.reduce((a, p) => a + p.banda, 0) + G.GG * Math.max(0, pilhas.length - 1);
    let topo = Math.max(G.HY + 100, yLane - total / 2);

    lista.forEach((g, gi) => {
      const { porCol, banda } = pilhas[gi];
      const comBloco = !!(g.serie || g.sub);
      const yc = comBloco ? topo + banda / 2 : yLane;
      const grupo = { gi, serie: g.serie, sub: g.sub, yc, x0: comBloco ? G.SBX + G.SBW : G.BX + G.BW, colsComNo: new Set() };
      if (comBloco) grupo.blocoY = yc - G.SBH / 2;
      for (const [ci, us] of Object.entries(porCol)) {
        const h = us.reduce((a, u) => a + altura(u), 0) + G.GAP * (us.length - 1);
        let y = Math.max(G.HY + 100, yc - h / 2);
        for (const u of us) {
          const c = colunas[+ci];
          nos.push({ ...u, gi, ci: +ci, x: c.x + G.NX, y, h: altura(u), fut: c.futura });
          grupo.colsComNo.add(+ci);
          y += altura(u) + G.GAP;
          CH = Math.max(CH, y + 120);
        }
      }
      grupos.push(grupo);
      topo += banda + G.GG;
      CH = Math.max(CH, topo + 80);
    });



    if (frentesEscopo.includes('ins') && !(data.frentes?.ins?.series || []).length) {
      const ult = grupos[grupos.length - 1];
      notaSemSeries = { x: G.SBX, y: (ult && ult.blocoY != null ? ult.blocoY + G.SBH : yLane) + 14 };
      CH = Math.max(CH, notaSemSeries.y + 80);
    }
  }

  return { colunas, CW, CH, nos, grupos, li, X0, semanaAtual, multi, notaSemSeries };
}


export function orth(sx, sy, tx, ty, mx, r = 10) {
  if (Math.abs(ty - sy) < 2) return `M${sx},${sy} L${tx},${ty}`;
  const d = ty > sy ? 1 : -1;
  return `M${sx},${sy} L${mx - r},${sy} Q${mx},${sy} ${mx},${sy + d * r} L${mx},${ty - d * r} Q${mx},${ty} ${mx + r},${ty} L${tx},${ty}`;
}

export function ramo(sx, yc, tx, ty, r = 9) {
  if (Math.abs(ty - yc) < 2) return `M${sx},${yc} L${tx},${ty}`;
  const dir = ty > yc ? 1 : -1;
  return `M${sx},${yc} L${sx},${ty - dir * r} Q${sx},${ty} ${sx + r},${ty} L${tx},${ty}`;
}

export function nomeMembro(membros, id) {
  if (!id) return null;
  const m = (membros || []).find(x => x.id === id);
  return m ? (m.nome || 'Sem nome') : 'Sem nome';
}

export function textoEsforco(valor, unidade) {
  const v = Number(valor);
  if (!v) return '';
  const n = (Math.round(v * 10) / 10).toString().replace('.', ',');
  if (unidade === 'dias') return `${n} ${v === 1 ? 'dia' : 'dias'}`;
  return `${n}h`;
}
