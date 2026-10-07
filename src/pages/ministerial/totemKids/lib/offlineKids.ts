






















import { ehFalhaDeRedeOuServidor, ehDuplicado } from '@/lib/falhaDeRede';

const K_CODIGOS = 'kids_offline_codigos';
const K_FILA = 'kids_offline_fila';
const K_ESTACAO = 'kids_offline_estacao_ref';
const K_CRIANCAS = 'kids_offline_criancas';
const K_SESSAO = 'kids_offline_sessao';


export const PISO_ALERTA_CODIGOS = 15;

export interface CriancaCache {
  id: string;
  nome: string;
  nome_norm: string;
  sala_id: string | null;
  sala_nome?: string | null;
  familia_id?: string | null;

  exige_pager: boolean | null;
  responsavel_nome?: string | null;
}

export interface ItemFila {
  local_id: string;
  codigo: string;
  crianca_id: string;
  crianca_nome: string;
  sala_id: string | null;
  sessao_id: string;
  responsavel_nome: string;
  responsavel_telefone?: string | null;
  checkin_at: string;
  impresso: boolean;
  tentativas: number;
  erro?: string | null;
}

function ler<T>(chave: string, padrao: T): T {
  try { const v = localStorage.getItem(chave); return v ? (JSON.parse(v) as T) : padrao; }
  catch { return padrao; }
}
function gravar(chave: string, valor: unknown): void {
  try { localStorage.setItem(chave, JSON.stringify(valor)); } catch {                  }
}







export function estacaoRef(): string {
  let r = ler<string>(K_ESTACAO, '');
  if (!r) {
    r = `totem-${(globalThis.crypto?.randomUUID?.() || String(Date.now())).slice(0, 8)}`;
    gravar(K_ESTACAO, r);
  }
  return r;
}


export function guardarCodigos(codigos: string[]): void {


  gravar(K_CODIGOS, Array.isArray(codigos) ? codigos : []);
}
export function codigosDisponiveis(): string[] {
  return ler<string[]>(K_CODIGOS, []);
}








export function sacarCodigo(): string | null {
  const lista = codigosDisponiveis();
  if (!lista.length) return null;
  const codigo = lista[0];
  gravar(K_CODIGOS, lista.slice(1));
  return codigo;
}


export function guardarCriancas(l: CriancaCache[]): void { gravar(K_CRIANCAS, l || []); }
export function criancasCache(): CriancaCache[] { return ler<CriancaCache[]>(K_CRIANCAS, []); }
export function guardarSessao(s: unknown): void { gravar(K_SESSAO, s); }
export function sessaoCache<T>(): T | null { return ler<T | null>(K_SESSAO, null); }


export function buscarOffline(termo: string, limite = 20): CriancaCache[] {
  const q = String(termo || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  if (q.length < 2) return [];
  return criancasCache().filter((c) => (c.nome_norm || '').includes(q)).slice(0, limite);
}








export function exigePagerOffline(c: Pick<CriancaCache, 'exige_pager'> | null | undefined): boolean {
  return c?.exige_pager !== false;
}


export function fila(): ItemFila[] { return ler<ItemFila[]>(K_FILA, []); }
export function filaCount(): number { return fila().length; }

export function enfileirar(item: Omit<ItemFila, 'local_id' | 'tentativas' | 'impresso'>): ItemFila {
  const novo: ItemFila = {
    ...item,
    local_id: globalThis.crypto?.randomUUID?.() || `l-${Date.now()}-${Math.random()}`,
    tentativas: 0,
    impresso: false,
  };
  gravar(K_FILA, [...fila(), novo]);
  return novo;
}


export function marcarImpresso(localId: string): void {
  gravar(K_FILA, fila().map((i) => (i.local_id === localId ? { ...i, impresso: true } : i)));
}

export interface ResultadoSync {
  enviados: number;
  duplicados: number;
  falharam: number;
  conflitoDeCodigo: ItemFila[];
  pendentes: number;
}








export async function sincronizar(
  enviar: (payload: Record<string, unknown>) => Promise<unknown>,
): Promise<ResultadoSync> {
  const itens = fila();
  const r: ResultadoSync = { enviados: 0, duplicados: 0, falharam: 0, conflitoDeCodigo: [], pendentes: 0 };
  if (!itens.length) return r;

  const restam: ItemFila[] = [];
  for (const item of itens) {
    try {
      await enviar({
        sessao_id: item.sessao_id,
        crianca_id: item.crianca_id,
        sala_id: item.sala_id,
        responsavel_nome: item.responsavel_nome,
        responsavel_telefone: item.responsavel_telefone || null,
        codigo_reservado: item.codigo,
        checkin_at: item.checkin_at,
        origem: 'offline',
      });
      r.enviados += 1;
    } catch (e) {




      const corpo = (e as { corpo?: { codigo_conflito?: boolean; codigo_invalido?: boolean } })?.corpo;
      if (corpo?.codigo_conflito || corpo?.codigo_invalido) {



        r.conflitoDeCodigo.push(item);
        continue;
      }



      if (ehDuplicado(e)) { r.duplicados += 1; continue; }

      if (ehFalhaDeRedeOuServidor(e)) {

        restam.push({ ...item, tentativas: item.tentativas + 1 });
        continue;
      }

      r.falharam += 1;
      restam.push({ ...item, tentativas: item.tentativas + 1, erro: String((e as Error)?.message || e).slice(0, 200) });
    }
  }
  gravar(K_FILA, restam);
  r.pendentes = restam.length;
  return r;
}
