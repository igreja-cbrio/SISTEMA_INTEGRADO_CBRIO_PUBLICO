













export function ciclosDaSemana(dash) {
  const semanas = dash?.semanas || [];
  const atual = semanas.find(s => s.eh_semana_atual);
  if (!atual) return [];
  const conferido = dash?.ciclo?.rolando_ok === true;
  const out = [];
  for (const l of dash?.ciclo?.linhas || []) {
    const cel = (l.celulas || []).find(c => c.semana_idx === atual.idx);
    if (!cel || cel.vazio) continue;
    if (conferido && !(Number(l.mkt_abertas) > 0)) continue;
    out.push({
      id: l.id,
      nome: nomeDoCiclo(l.nome),
      fase: cel.nome_fase || '',
      numero_fase: cel.numero_fase ?? null,
      proxima: cel.transicao?.nome_fase || null,
      dia_d: l.dia_d || null,
      abertas: conferido ? Number(l.mkt_abertas) : null,
    });
  }
  return out;
}



export function ciclosNaoConferidos(dash) {
  return dash?.ciclo?.rolando_ok === false;
}



export function nomeDoCiclo(nome) {
  const n = String(nome || '').trim();
  return n.replace(/^s[ée]rie\s*[:\-–]\s*/i, '').trim() || n;
}






const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const ORDEM_DIAS = [1, 2, 3, 4, 5, 6, 0];

export function rotuloDias(dias) {
  const ord = ORDEM_DIAS.filter(d => dias.includes(d));
  if (!ord.length) return '';
  if (ord.length === 7) return 'Todos os dias';
  if (ord.length === 1) return DIAS[ord[0]];
  const pos = ord.map(d => ORDEM_DIAS.indexOf(d));
  const seguidos = pos.every((p, i) => i === 0 || p === pos[i - 1] + 1);
  if (seguidos && ord.length >= 3) return `${DIAS[ord[0]]} a ${DIAS[ord[ord.length - 1]]}`;
  const nomes = ord.map(d => DIAS[d]);
  return `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
}



export function rotinasDaSemana(linha) {
  const fs = ['rot', 'red'].map(k => linha?.frentes?.[k]).filter(f => f && f.status !== 'indisponivel');
  if (!fs.length) return null;
  const semana = linha?.semana_atual;
  const porTexto = new Map();
  for (const t of fs.flatMap(f => f.tarefas || [])) {
    if (t.semana !== semana) continue;
    for (const i of t.itens || []) {
      const dia = Number(i.dia_semana);
      if (!Number.isInteger(dia) || dia < 0 || dia > 6) continue;
      const texto = textoCurto(i.texto);
      if (!texto) continue;
      if (!porTexto.has(texto)) porTexto.set(texto, new Set());
      porTexto.get(texto).add(dia);
    }
  }
  return [...porTexto.entries()]
    .map(([texto, set]) => {
      const dias = ORDEM_DIAS.filter(d => set.has(d));
      return { dia: dias[0], dias, rotulo: rotuloDias(dias), textos: [texto], ordem: ORDEM_DIAS.indexOf(dias[0]) };
    })


    .sort((a, b) => a.ordem - b.ordem || a.dias.length - b.dias.length)
    .map(({ ordem, ...r }) => r);
}




export function textoCurto(texto) {
  const t = String(texto || '').replace(/\s+/g, ' ').trim();
  const sem = t.replace(/\s*\([^()]*\)\s*$/, '').trim();
  return sem || t;
}



export function nomeDeExibicao(nome) {
  const partes = String(nome || '').trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return '';
  if (partes.length === 1) return partes[0];
  return `${partes[0]} ${partes[partes.length - 1]}`;
}













const LARGURA_LETRA = {
  A: 0.62, B: 0.57, C: 0.68, D: 0.63, E: 0.54, F: 0.51, G: 0.68, H: 0.63, I: 0.19,
  J: 0.28, K: 0.58, L: 0.45, M: 0.78, N: 0.63, O: 0.7, P: 0.57, Q: 0.71, R: 0.6,
  S: 0.59, T: 0.56, U: 0.62, V: 0.62, W: 0.96, X: 0.61, Y: 0.57, Z: 0.56,
};
const LARGURA_ESPACO = 0.16;
const LARGURA_OUTRO = 0.62;

export function tamanhoDoNome(nome, { ocupacao = 96, minRem = 2.5, maxRem = 12 } = {}) {
  const n = String(nome || '').trim().replace(/\s+/g, ' ');
  if (!n) return null;

  const base = n.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  let em = 0;
  for (const ch of base) em += ch === ' ' ? LARGURA_ESPACO : (LARGURA_LETRA[ch] ?? LARGURA_OUTRO);
  const divisor = Math.round(Math.max(1, em) * 100) / 100;
  return `clamp(${minRem}rem, calc(${ocupacao}cqi / ${divisor}), ${maxRem}rem)`;
}





export const AVISO_SEM_NUMEROS = 'Não se esqueça de checar sua fila institucional, de redes, rotinas e principalmente de tirar suas dúvidas! Vamos fazer acontecer.';

export function avisoDaSemana(minha) {
  if (!minha) return [{ t: AVISO_SEM_NUMEROS }];
  const pf = minha.por_frente || {};
  const partes = [];
  const add = (n, um, varios) => { if (n > 0) partes.push({ n, rotulo: n === 1 ? um : varios }); };




  const abertas = (r) => Math.max(0, (r?.total || 0) - (r?.feitas || 0));
  const rpf = minha.rotina_por_frente;
  add((pf.ins || 0) + (rpf ? abertas(rpf.rot) : abertas(minha.rotina)), 'do calendário', 'do calendário');
  add(pf.sis || 0, 'requisição', 'requisições');
  add((rpf ? abertas(rpf.red) : 0) + (pf.prd || 0), 'de redes', 'de redes');

  if (!partes.length) {
    return [{ t: 'Sua fila desta semana está em dia. Aproveite para adiantar as próximas e tirar suas dúvidas. Vamos fazer acontecer!' }];
  }
  const out = [{ t: 'Não se esqueça de checar sua fila desta semana: ' }];
  partes.forEach((p, i) => {
    if (i > 0) out.push({ t: i === partes.length - 1 ? ' e ' : ', ' });
    out.push({ n: p.n }, { t: ` ${p.rotulo}` });
  });
  const atrasadas = Number(minha.atrasadas) || 0;
  if (atrasadas > 0) {
    out.push({ t: ' (' }, { n: atrasadas, forte: true }, { t: atrasadas === 1 ? ' já atrasada)' : ' já atrasadas)' });
  }
  out.push({ t: '. E principalmente, tire suas dúvidas! Vamos fazer acontecer.' });
  return out;
}



export function demandasSemanais(minha) {
  if (!minha || typeof minha.tarefas !== 'number') return null;
  return minha.tarefas;
}
