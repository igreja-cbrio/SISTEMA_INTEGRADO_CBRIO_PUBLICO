





export const PASTAS_DO_ANO = ['Ciclo criativo', 'Rotina', 'Requisições', 'Redes'];

const comparar = (a, b) => a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' });
const comeca = (caminho, prefixo) => prefixo.every((p, i) => caminho[i] === p);




export function conteudoDaPasta(arquivos, caminho = [], { fixas = [] } = {}) {
  const pastas = new Map();
  const aqui = [];
  for (const a of arquivos || []) {
    const c = a.caminho || [];
    if (!comeca(c, caminho)) continue;
    if (c.length === caminho.length) { aqui.push(a); continue; }
    const nome = c[caminho.length];
    const p = pastas.get(nome) || { nome, total: 0, tamanho: 0 };
    p.total += 1;
    p.tamanho += Number(a.tamanho) || 0;
    pastas.set(nome, p);
  }
  if (caminho.length === 0) for (const nome of fixas) if (!pastas.has(nome)) pastas.set(nome, { nome, total: 0, tamanho: 0 });
  const ordemFixa = (n) => { const i = PASTAS_DO_ANO.indexOf(n); return i === -1 ? PASTAS_DO_ANO.length : i; };
  const lista = [...pastas.values()].sort((a, b) => (caminho.length === 0 ? ordemFixa(a.nome) - ordemFixa(b.nome) : 0) || comparar(a.nome, b.nome));
  aqui.sort((a, b) => String(b.enviado_em || '').localeCompare(String(a.enviado_em || '')));
  return { pastas: lista, arquivos: aqui };
}

const sem = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();



export function buscarArquivos(arquivos, termo) {
  const t = sem(termo).trim();
  if (!t) return [];
  const partes = t.split(/\s+/);
  return (arquivos || []).filter((a) => {
    const c = a.contexto || {};
    const alvo = sem([a.nome, ...(a.caminho || []), c.tarefa, c.subtarefa, c.compromisso, c.pessoa, a.enviado_por].filter(Boolean).join(' '));
    return partes.every(p => alvo.includes(p));
  }).sort((a, b) => String(b.enviado_em || '').localeCompare(String(a.enviado_em || '')));
}



export function urlDaPasta(raizUrl, ano, caminho = []) {
  if (!raizUrl || !ano) return null;
  return [raizUrl.replace(/\/+$/, ''), ...[ano, ...caminho].map(encodeURIComponent)].join('/');
}

export function tamanhoLegivel(b) {
  const n = Number(b) || 0;
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1).replace('.', ',')} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1).replace('.', ',')} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

export const rotuloArquivos = (n) => (n === 1 ? '1 arquivo' : `${n} arquivos`);
