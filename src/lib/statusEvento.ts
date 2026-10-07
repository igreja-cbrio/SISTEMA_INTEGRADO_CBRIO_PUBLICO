



export const ROTULO_STATUS_EVENTO: Record<string, string> = {
  rascunho: 'rascunho',
  publicado: 'ativo',
  encerrado: 'inativo',
  arquivado: 'arquivado',
};

export function rotuloStatusEvento(status?: string | null): string {
  const s = String(status || '');
  return ROTULO_STATUS_EVENTO[s] || s;
}




export function eventoNaListaAtiva(status?: string | null): boolean {
  const s = String(status || '');
  return s === 'publicado' || s === 'rascunho';
}
