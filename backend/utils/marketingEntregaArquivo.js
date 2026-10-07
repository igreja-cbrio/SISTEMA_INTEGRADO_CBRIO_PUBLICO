'use strict';






























const RP = require('./marketingRedesPlano');



const TAMANHO_MAX_BYTES = 10 * 1024 * 1024 * 1024;
const NOME_MAX = 120;
const PASTA_MAX = 80;

const RAIZ = 'Demandas';
const CATEGORIAS = {
  ciclo: 'Ciclo criativo',
  rotina: 'Rotina',
  requisicoes: 'Requisições',
  redes: 'Redes',
};
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho',
  'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];



const PROIBIDOS = /["*:<>?/\\|#%\u0000-\u001f\u007f]/g;
const RESERVADOS = /^(con|prn|aux|nul|com[0-9]|lpt[0-9]|desktop\.ini)$/i;

const cortar = (s, max) => Array.from(s).slice(0, max).join('');




function nomeLegivel(texto, reserva = 'Sem nome', max = PASTA_MAX) {
  let s = String(texto ?? '').normalize('NFC')
    .replace(PROIBIDOS, ' ')
    .replace(/_vti_/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.~$ ]+/, '');
  s = cortar(s, max).replace(/[. ]+$/, '');
  if (!s || RESERVADOS.test(s)) return reserva;
  return s;
}

const dd = (n) => String(Number(n) || 0).padStart(2, '0');
const MES_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DIA_RE = /^\d{4}-\d{2}-\d{2}$/;
const mesDoDia = (dia) => {
  const m = String(dia || '').slice(0, 7);
  return MES_RE.test(m) ? m : null;
};


function pastaDoMes(mes) {
  const n = Number(String(mes).slice(5, 7));
  return `${dd(n)} - ${MESES[n - 1]}`;
}


const semObservacao = (t) => String(t || '').replace(/\s+/g, ' ').trim().replace(/\s*\([^()]*\)\s*$/, '').trim();

function montar(ano, categoria, resto) {
  const partes = [CATEGORIAS[categoria], ...resto];
  return { ano, categoria, partes, pasta: [RAIZ, ano, ...partes].join('/') };
}










function pastaDaEntrega(alvo = {}, hoje = '') {
  const reservaMes = mesDoDia(hoje);
  if (alvo.tipo === 'ciclo') {
    const mes = mesDoDia(alvo.evento && alvo.evento.data) || reservaMes;
    if (!mes) throw new Error('pastaDaEntrega: falta a data');
    const f = alvo.fase;
    const fase = f && f.numero != null
      ? nomeLegivel([dd(f.numero), String(f.nome || '').trim()].filter(Boolean).join(' - '), dd(f.numero))
      : 'Outras tarefas';
    return montar(mes.slice(0, 4), 'ciclo', [nomeLegivel(alvo.evento && alvo.evento.nome, 'Evento sem nome'), fase]);
  }
  if (alvo.tipo === 'rotina') {
    if (!DIA_RE.test(String(alvo.semanaInicio || ''))) throw new Error('pastaDaEntrega: semana inválida');
    const { mes } = RP.semanaDoMes(alvo.semanaInicio);
    return montar(mes.slice(0, 4), 'rotina', [pastaDoMes(mes), nomeLegivel(semObservacao(alvo.compromisso), 'Rotina')]);
  }
  if (alvo.tipo === 'tarefa') {
    const mes = mesDoDia(alvo.dia) || reservaMes;
    if (!mes) throw new Error('pastaDaEntrega: falta a data');
    const nome = nomeLegivel(alvo.titulo, 'Tarefa sem título');
    if (alvo.categoria === 'redes') return montar(mes.slice(0, 4), 'redes', ['Produção', pastaDoMes(mes), nome]);
    if (alvo.categoria === 'requisicoes') return montar(mes.slice(0, 4), 'requisicoes', [pastaDoMes(mes), nome]);
    throw new Error('pastaDaEntrega: categoria inválida');
  }
  if (alvo.tipo === 'planejamento') {
    if (!MES_RE.test(String(alvo.mes || ''))) throw new Error('pastaDaEntrega: mês inválido');
    return montar(alvo.mes.slice(0, 4), 'redes', ['Planejamento', pastaDoMes(alvo.mes)]);
  }
  throw new Error('pastaDaEntrega: tipo inválido');
}




function pastaFixada(calculada, existente) {
  const e = typeof existente === 'string' ? existente : '';
  return e.startsWith(`${RAIZ}/`) ? e : calculada;
}



function extensaoDe(original) {
  const nome = String(original || '').normalize('NFC').trim();
  const ponto = nome.lastIndexOf('.');
  const temExt = ponto > 0 && ponto >= nome.length - 11 && /^[A-Za-z0-9]{1,10}$/.test(nome.slice(ponto + 1));
  return { nome, ponto, ext: temExt ? `.${nome.slice(ponto + 1).toLowerCase()}` : '' };
}




function nomeDoArquivo(original, prefixos = []) {
  const { nome, ponto, ext } = extensaoDe(original);
  const base = nomeLegivel(ext ? nome.slice(0, ponto) : nome, 'arquivo', NOME_MAX);
  const pre = (prefixos || []).map(p => nomeLegivel(p, '', 40)).filter(Boolean);
  const corpo = cortar([...pre, base].join(' - '), NOME_MAX - ext.length).replace(/[. ]+$/, '');
  return `${corpo}${ext}`;
}

















function semAno(nome, ano) {
  const s = String(nome || '').trim();
  const a = String(ano || '');
  if (!/^\d{4}$/.test(a)) return s;
  const SEP_FIM = /[\s\-–·:]+$/;
  const SEP_INI = /^[\s\-–·:]+/;
  if (s.endsWith(a)) {
    const antes = s.slice(0, -a.length);
    const resto = antes.replace(SEP_FIM, '').trim();
    if (resto && SEP_FIM.test(antes)) return resto;
  }
  if (s.startsWith(a)) {
    const depois = s.slice(a.length);
    const resto = depois.replace(SEP_INI, '').trim();
    if (resto && SEP_INI.test(depois)) return resto;
  }
  return s;
}


function partesDoNome({ pasta, tipo, entregavel, culto, tarefa, semanaInicio, pessoa } = {}) {
  const seg = String(pasta || '').split('/');
  const ano = seg[1] || '';
  const ultima = seg[seg.length - 1];
  if (tipo === 'ciclo') {
    const fase = /^(\d{2})(?:\s|$)/.exec(seg[4] || '');
    return [ano, semAno(seg[3], ano), fase ? `F${fase[1]}` : tarefa, entregavel, culto ? String(culto).toUpperCase() : null];
  }
  if (tipo === 'rotina') return [semanaInicio, ultima, pessoa];
  return [ano, ultima, entregavel];
}

const BASE_MAX = 100;


function baseDoNome(partes) {
  const limpas = (partes || []).map(p => nomeLegivel(p, '', 40)).filter(Boolean);
  return cortar(limpas.join(' - '), BASE_MAX).replace(/[-. ]+$/, '') || 'arquivo';
}





function proximaVersao(nomes, base) {
  const b = `${String(base || '').normalize('NFC').toLowerCase()} - v`;
  let max = 0;
  for (const n of nomes || []) {
    const s = String(n || '').normalize('NFC').toLowerCase();
    if (!s.startsWith(b)) continue;
    const m = /^(\d+)/.exec(s.slice(b.length));
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}


function nomePadrao({ base, versao, original }) {
  return `${base} - v${String(Math.max(1, Number(versao) || 1)).padStart(2, '0')}${extensaoDe(original).ext}`;
}














const paiDe = (pasta) => String(pasta).split('/').slice(0, -1).join('/');

function estruturaDoAno({ ano, hoje, eventos = [], compromissos = [] } = {}) {
  const a = String(ano || '');
  if (!/^\d{4}$/.test(a) || !DIA_RE.test(String(hoje || ''))) throw new Error('estruturaDoAno: ano e hoje (AAAA-MM-DD)');
  if (a !== hoje.slice(0, 4)) throw new Error('estruturaDoAno: por enquanto, só o ano corrente');
  const mesHoje = Number(hoje.slice(5, 7));
  const meses = [];
  for (let m = mesHoje; m <= 12; m++) meses.push(`${a}-${dd(m)}`);

  const pastas = [];
  const vistas = new Set();
  const por = (pasta) => {
    const seg = String(pasta).split('/');
    for (let i = 1; i <= seg.length; i++) {
      const p = seg.slice(0, i).join('/');
      if (!vistas.has(p)) { vistas.add(p); pastas.push(p); }
    }
  };

  por(`${RAIZ}/${a}/${CATEGORIAS.ciclo}`);
  por(`${RAIZ}/${a}/${CATEGORIAS.rotina}`);
  por(`${RAIZ}/${a}/${CATEGORIAS.requisicoes}`);
  por(`${RAIZ}/${a}/${CATEGORIAS.redes}/Produção`);
  por(`${RAIZ}/${a}/${CATEGORIAS.redes}/Planejamento`);

  const futuros = (eventos || [])
    .filter(ev => ev && DIA_RE.test(String(ev.data || '')) && ev.data >= hoje && ev.data.slice(0, 4) === a)
    .sort((x, y) => String(x.data).localeCompare(String(y.data)));
  for (const ev of futuros) {
    const fases = [...(ev.fases || [])].sort((x, y) => (Number(x.numero) || 0) - (Number(y.numero) || 0));
    for (const f of fases) {
      por(pastaDaEntrega({ tipo: 'ciclo', evento: { nome: ev.nome, data: ev.data }, fase: { numero: f.numero, nome: f.nome } }, hoje).pasta);
    }
  }

  const ativos = (compromissos || []).filter(c => c && String(c.descricao || '').trim());
  for (const mes of meses) {
    const domingo = RP.semanasDoMes(mes)[0].inicio;
    por(paiDe(pastaDaEntrega({ tipo: 'rotina', semanaInicio: domingo, compromisso: 'x' }, hoje).pasta));
    for (const c of ativos) por(pastaDaEntrega({ tipo: 'rotina', semanaInicio: domingo, compromisso: c.descricao }, hoje).pasta);
  }
  for (const mes of meses) {
    por(paiDe(pastaDaEntrega({ tipo: 'tarefa', categoria: 'requisicoes', titulo: 'x', dia: `${mes}-15` }, hoje).pasta));
    por(paiDe(pastaDaEntrega({ tipo: 'tarefa', categoria: 'redes', titulo: 'x', dia: `${mes}-15` }, hoje).pasta));
  }
  for (const mes of meses.slice(1)) por(pastaDaEntrega({ tipo: 'planejamento', mes }, hoje).pasta);
  return pastas;
}


function ehEntregaDeCiclo(card) {
  return !!card && card.origem === 'evento' && !!card.event_phase_id;
}




function tipoDaTarefa(card, frente) {
  if (ehEntregaDeCiclo(card)) return { origem: 'ciclo', categoria: 'ciclo', exige: true };
  if (card && (card.event_id || card.origem === 'evento')) return { origem: 'ciclo', categoria: 'ciclo', exige: false };
  if (frente === 'prd') return { origem: 'tarefa', categoria: 'redes', exige: false };
  return { origem: 'tarefa', categoria: 'requisicoes', exige: false };
}

function validarArquivo({ nome, tamanho } = {}) {
  if (typeof nome !== 'string' || !nome.trim()) return { ok: false, erro: 'Escolha o arquivo.' };
  const t = Number(tamanho);
  if (!Number.isFinite(t) || t <= 0) return { ok: false, erro: 'O arquivo está vazio.' };
  if (t > TAMANHO_MAX_BYTES) return { ok: false, erro: 'O arquivo passou de 10 GB. Mande um link ou divida em partes.' };
  return { ok: true };
}




function itemNaPasta({ driveItem, driveId, pasta } = {}) {
  const ref = driveItem && driveItem.parentReference;
  if (!ref || !driveItem.id || !driveItem.webUrl) return false;
  if (ref.driveId && driveId && String(ref.driveId) !== String(driveId)) return false;
  let caminho = String(ref.path || '');
  try { caminho = decodeURIComponent(caminho); } catch {                      }
  const alvo = `root:/${String(pasta || '')}`.normalize('NFC').toLowerCase();
  return caminho.normalize('NFC').toLowerCase().endsWith(alvo);
}


function resumoDoArquivo(r) {
  return {
    id: r.id,
    nome: r.nome_arquivo,
    web_url: r.web_url,
    tamanho: r.tamanho_bytes ?? null,
    enviado_em: r.enviado_em,
    enviado_por: r.enviado_por || null,
  };
}


const chaveRotina = (compromissoId, membroId, semanaInicio) => `${compromissoId}|${membroId}|${semanaInicio}`;




function anotarEntregas({ cards = [], rotina = [], arquivos = [], exigeArquivo = {} } = {}) {
  const porItem = {};
  const porRotina = {};
  for (const a of arquivos || []) {
    if (!a || a.deleted_at) continue;
    if (a.checklist_item_id && (a.origem === 'ciclo' || a.origem === 'tarefa')) {
      (porItem[a.checklist_item_id] ||= []).push(resumoDoArquivo(a));
    }
    if (a.origem === 'rotina' && a.compromisso_id) {
      (porRotina[chaveRotina(a.compromisso_id, a.membro_id, a.semana_inicio)] ||= []).push(resumoDoArquivo(a));
    }
  }
  for (const t of cards || []) {
    const entrega = !!t && t.frente === 'ins' && !!t.event_phase_id;
    for (const i of (t && t.itens) || []) {
      i.aceita_arquivo = true;
      i.exige_arquivo = entrega;
      i.arquivos = porItem[i.id] || [];
    }
  }
  for (const t of rotina || []) {
    for (const i of (t && t.itens) || []) {
      i.aceita_arquivo = true;
      i.exige_arquivo = exigeArquivo[i.compromisso_id] === true;
      i.arquivos = porRotina[chaveRotina(i.compromisso_id, i.membro_id, t.semana_inicio)] || [];
    }
  }
}




function categoriaDoArquivo(a) {
  if (a && a.categoria && CATEGORIAS[a.categoria]) return a.categoria;
  if (a && a.origem === 'ciclo') return 'ciclo';
  if (a && a.origem === 'rotina') return 'rotina';
  if (a && a.origem === 'planejamento') return 'redes';
  return 'requisicoes';
}



function podeVerArquivo(a, acesso = {}) {
  if (acesso.marketing === true) return true;
  return acesso.eventos === true && categoriaDoArquivo(a) === 'ciclo';
}





function caminhoNaArvore(a, legado) {
  const pasta = String((a && a.pasta) || '');
  if (pasta.startsWith(`${RAIZ}/`)) return pasta.slice(RAIZ.length + 1).split('/').filter(Boolean);
  return legado ? [legado.ano, ...legado.partes] : null;
}

module.exports = {
  TAMANHO_MAX_BYTES, RAIZ, CATEGORIAS, nomeLegivel, pastaDoMes, pastaDaEntrega, pastaFixada,
  nomeDoArquivo, semAno, partesDoNome, baseDoNome, proximaVersao, nomePadrao, estruturaDoAno,
  ehEntregaDeCiclo, tipoDaTarefa, validarArquivo, itemNaPasta, resumoDoArquivo,
  chaveRotina, anotarEntregas, categoriaDoArquivo, podeVerArquivo, caminhoNaArvore,
};
