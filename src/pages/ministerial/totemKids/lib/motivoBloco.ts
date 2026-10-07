
























export interface FalhaBloco {
  status?: number;
  name?: string;
  message?: string;

  detalhe?: string;
}








export function motivoFalhaBloco(e: unknown): string {
  const err = (e ?? null) as FalhaBloco | null;
  const status = typeof err?.status === 'number' ? err.status : undefined;

  if (status === 401 || status === 403) {
    return 'Esta conta do totem não tem permissão para reservar os códigos (precisa de nível 2 em Kids). Fale com quem cuida do sistema.';
  }
  if (status === 503) {
    const detalhe = String(err?.detalhe || '').trim();
    return `O servidor não conseguiu reservar os códigos${detalhe ? ` — ${detalhe}` : ''}. Fale com quem cuida do sistema.`;
  }
  if (status !== undefined && status >= 500) {
    return 'O servidor falhou ao reservar os códigos. Fale com quem cuida do sistema.';
  }
  if (status !== undefined) {
    return `O servidor recusou o pedido (erro ${status}). Fale com quem cuida do sistema.`;
  }





  const msgBruta = String(err?.message || '');
  if (/is not a function|n[ãa]o [ée] uma fun[çc][ãa]o|is not defined|cannot read propert|of undefined|of null/i.test(msgBruta)) {
    return `Falha no próprio totem, não na internet (${msgBruta}). Esperar não resolve — avise quem cuida do sistema.`;
  }





  if (/sess[ãa]o|n[ãa]o autorizado|expir/i.test(msgBruta)) {
    return 'A sessão deste totem expirou. Faça login de novo neste aparelho para voltar a reservar os códigos.';
  }


  return 'Não deu para falar com o servidor agora — assim que a internet voltar, o totem tenta sozinho.';
}
