










import { contemNormalizado } from './busca';

export type ContextoVariaveis = {
  nome?: string | null;
  telefone?: string | null;
  protocolo?: string | null;
  area?: string | null;
  atendente?: string | null;
  grupo?: string | null;
};

export type Variavel = { chave: string; rotulo: string; exemplo: string };



export const VARIAVEIS: Variavel[] = [
  { chave: 'primeiro_nome', rotulo: 'Primeiro nome da pessoa', exemplo: 'Maria' },
  { chave: 'nome', rotulo: 'Nome completo da pessoa', exemplo: 'Maria da Silva' },
  { chave: 'telefone', rotulo: 'Telefone da pessoa', exemplo: '(21) 99999-9999' },
  { chave: 'protocolo', rotulo: 'Protocolo da conversa', exemplo: 'CB-000123' },
  { chave: 'area', rotulo: 'Área da conversa', exemplo: 'Grupos' },
  { chave: 'atendente', rotulo: 'Seu primeiro nome (quem responde)', exemplo: 'Marcos' },
  { chave: 'grupo', rotulo: 'Grupo de conexão da pessoa', exemplo: 'Barra Jovens' },
];

const CHAVES = new Set(VARIAVEIS.map(v => v.chave));
const RE_VAR = /\{\{\s*([A-Za-z_][\w]*)\s*\}\}/g;

export function primeiroNome(nome?: string | null): string {
  return String(nome || '').trim().split(/\s+/)[0] || '';
}

function valorDe(chave: string, ctx: ContextoVariaveis): string {
  switch (chave) {
    case 'primeiro_nome': return primeiroNome(ctx.nome);
    case 'nome': return String(ctx.nome || '').trim();
    case 'telefone': return String(ctx.telefone || '').trim();
    case 'protocolo': return String(ctx.protocolo || '').trim();
    case 'area': return String(ctx.area || '').trim();
    case 'atendente': return primeiroNome(ctx.atendente);
    case 'grupo': return String(ctx.grupo || '').trim();
    default: return '';
  }
}






export function preencherVariaveis(texto: string, ctx: ContextoVariaveis = {}) {
  const faltando: string[] = [];
  const desconhecidas: string[] = [];
  const saida = String(texto || '').replace(RE_VAR, (bruto: string, chave: string) => {
    if (!CHAVES.has(chave)) {
      if (!desconhecidas.includes(chave)) desconhecidas.push(chave);
      return bruto;
    }
    const v = valorDe(chave, ctx);
    if (!v) {
      if (!faltando.includes(chave)) faltando.push(chave);
      return `{{${chave}}}`;
    }
    return v;
  });
  return { texto: saida, faltando, desconhecidas };
}


export function variaveisPendentes(texto: string): string[] {
  const out: string[] = [];
  for (const m of String(texto || '').matchAll(RE_VAR)) {
    if (!out.includes(m[1])) out.push(m[1]);
  }
  return out;
}






export function comandoBarra(texto: string): { ativo: boolean; filtro: string } {
  const m = /^\s*\/(\S*)$/.exec(String(texto || ''));
  return m ? { ativo: true, filtro: m[1] } : { ativo: false, filtro: '' };
}


export function filtrarProntas<T extends { titulo: string; texto: string }>(prontas: T[], filtro: string): T[] {
  const f = String(filtro || '').trim();
  if (!f) return prontas;
  return prontas.filter(p => contemNormalizado(p.titulo, f) || contemNormalizado(p.texto, f));
}
