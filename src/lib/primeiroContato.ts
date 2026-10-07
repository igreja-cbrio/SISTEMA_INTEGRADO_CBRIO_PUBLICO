














export type OpcaoPrimeiroContato = {
  v: string;
  label: string;

  positivo?: boolean;
};







export const PCONTATO_OPCOES: OpcaoPrimeiroContato[] = [
  { v: 'contactada',          label: 'Contactada (aguardando resposta)' },
  { v: 'nao_respondeu',       label: 'Não respondeu' },
  { v: 'nao_atendido',        label: 'Não atendido' },
  { v: 'numero_errado',       label: 'Número errado' },



  { v: 'contato_impossivel',  label: 'Contato impossível' },
  { v: 'atendido_respondido', label: 'Atendido e respondido', positivo: true },
];






export const PCONTATO_LABEL: Record<string, string> = {
  contactada: 'Contactada (aguardando resposta)',
  nao_respondeu: 'Não respondeu',
  nao_atendido: 'Não atendido',
  atendido_respondido: 'Atendido e respondido',
  respondeu: 'Respondeu',
  nao_compareceu: 'Não compareceu',
  sem_retorno: 'Sem retorno do responsável',
  numero_errado: 'Número errado',
  contato_impossivel: 'Contato impossível',
};


export const PCONTATO_COR: Record<string, string> = {
  atendido_respondido: '#10b981',
  contactada: '#3b82f6',
  nao_respondeu: '#f59e0b',
  nao_atendido: '#64748b',
  numero_errado: '#94a3b8',
  contato_impossivel: '#a78bfa',
  pendente: '#ef476f',
};











export const PCONTATO_FEITO = new Set([
  'contactada', 'respondeu', 'atendido_respondido', 'nao_respondeu',
  'nao_compareceu', 'nao_atendido',
]);





export const PCONTATO_INALCANCAVEL = new Set(['numero_errado', 'contato_impossivel']);


export function rotuloPrimeiroContato(status: unknown): string {
  const s = String(status ?? '').trim();
  if (!s) return '—';
  return PCONTATO_LABEL[s] || s;
}
