










export type FormaPagamento = 'pix' | 'transferencia_bancaria' | 'boleto' | 'dinheiro';

export const ROTULO_FORMA: Record<FormaPagamento, string> = {
  pix: 'Pix',
  transferencia_bancaria: 'Transferência bancária',
  boleto: 'Boleto',
  dinheiro: 'Dinheiro',
};

export function rotuloForma(forma: string | null | undefined): string {
  if (!forma) return '—';
  const f = forma === 'transferencia' ? 'transferencia_bancaria' : forma;
  return (ROTULO_FORMA as Record<string, string>)[f] || forma;
}

export function exigeComprovante(forma: string | null | undefined): boolean {
  return !!forma && forma !== 'dinheiro';
}




export function formaInicial(preferencia: string | null | undefined, permitidas: string[]): string {
  if (!preferencia) return '';
  const p = preferencia === 'transferencia' ? 'transferencia_bancaria' : preferencia;
  return permitidas.includes(p) ? p : '';
}


export function hojeBrtIso(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(agora);
}

export type EstadoForm = {
  forma: string;
  data: string;
  temArquivo: boolean;
  podePagar: boolean;
  permitidas: string[];
  hojeIso: string;
};



export function motivoBloqueio(e: EstadoForm): string | null {
  if (!e.podePagar) return 'Quem fez a solicitação não pode registrar o próprio pagamento.';
  if (!e.forma || !e.permitidas.includes(e.forma)) return 'Escolha a forma de pagamento.';
  if (exigeComprovante(e.forma) && !e.temArquivo) {
    return `Pagamento por ${rotuloForma(e.forma)} exige o comprovante anexado.`;
  }
  if (e.data && !/^\d{4}-\d{2}-\d{2}$/.test(e.data)) return 'Data do pagamento inválida.';
  if (e.data && e.hojeIso && e.data > e.hojeIso) return 'A data do pagamento não pode ser no futuro.';
  return null;
}



export function textoBotao(statusAposPagamento: string | null | undefined): string {
  return statusAposPagamento === 'concluido' ? 'Concluir solicitação' : 'Marcar como pago';
}


export function valorSugerido(sol: { valor_cotado?: number | string | null; valor_estimado?: number | string | null }): string {
  const v = Number(sol.valor_cotado ?? sol.valor_estimado);
  return Number.isFinite(v) && v > 0 ? v.toFixed(2).replace('.', ',') : '';
}








export const FORMAS_POR_CATEGORIA: Record<string, FormaPagamento[]> = {
  reembolso: ['pix', 'transferencia_bancaria', 'dinheiro'],
  pagamento: ['pix', 'transferencia_bancaria', 'boleto', 'dinheiro'],
  compras: ['pix', 'transferencia_bancaria', 'boleto', 'dinheiro'],
  servico: ['pix', 'transferencia_bancaria', 'boleto', 'dinheiro'],
};

export const CATEGORIAS_SO_CONCLUEM_PAGANDO = ['reembolso', 'pagamento'];

export function formasDaCategoria(categoria: string | null | undefined): string[] {
  return (categoria && FORMAS_POR_CATEGORIA[categoria]) || [];
}

export function statusAposPagamento(categoria: string | null | undefined): string {
  return categoria && CATEGORIAS_SO_CONCLUEM_PAGANDO.includes(categoria) ? 'concluido' : 'aguardando_entrega';
}

type SolParaPagar = {
  categoria?: string | null; status?: string | null; area_responsavel?: string | null;
  pago_em?: string | null; deleted_at?: string | null;
  precisa_aprovacao_financeira?: boolean | null; aprovado_financeiro_em?: string | null;
};

export function prontaParaPagar(s: SolParaPagar | null | undefined): boolean {
  if (!s || s.deleted_at) return false;
  if (!formasDaCategoria(s.categoria).length) return false;
  if (s.pago_em) return false;
  if (s.status !== 'em_atendimento' || s.area_responsavel !== 'financeiro') return false;
  if (s.precisa_aprovacao_financeira && !s.aprovado_financeiro_em) return false;
  return true;
}


export function paraConcluirPagamento<T extends SolParaPagar & { solicitante_id?: string | null }>(s: T, usuarioId: string | null | undefined) {
  return {
    ...s,
    formas_permitidas: formasDaCategoria(s.categoria),
    status_apos_pagamento: statusAposPagamento(s.categoria),
    pode_pagar: !usuarioId || s.solicitante_id !== usuarioId,
  };
}
