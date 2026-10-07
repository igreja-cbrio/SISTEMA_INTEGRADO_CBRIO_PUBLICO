





















export type TipoDoc = {

  tipo: string;
  label: string;

  dica?: string;
};







export const DOCS_CLT: TipoDoc[] = [
  { tipo: 'contrato', label: 'Contrato de Trabalho' },
  { tipo: 'rg', label: 'RG' },
  { tipo: 'cpf', label: 'CPF' },
  { tipo: 'ctps', label: 'CTPS' },
  { tipo: 'comprovante_residencia', label: 'Comprovante de Residência' },
];










export const DOCS_PJ: TipoDoc[] = [
  { tipo: 'contrato', label: 'Contrato de Prestação de Serviços' },
  { tipo: 'cnpj', label: 'Cartão CNPJ', dica: 'Cartão CNPJ atualizado' },
  { tipo: 'contrato_social', label: 'Contrato social ou MEI', dica: 'Contrato social ou certificado do MEI' },
  { tipo: 'rg', label: 'Identidade do representante' },
  { tipo: 'comprovante_bancario', label: 'Comprovante bancário', dica: 'Comprovante dos dados da conta' },
];


export function conjuntoDe(tipoContrato?: string | null): TipoDoc[] {
  return String(tipoContrato || '').toUpperCase().startsWith('PJ') ? DOCS_PJ : DOCS_CLT;
}










export function entregue(documentos: Array<{ tipo?: string | null }> | null | undefined, tipo: string): boolean {
  const alvo = String(tipo || '').toLowerCase().trim();
  if (!alvo) return false;
  return (documentos || []).some((d) => String(d?.tipo || '').toLowerCase().trim() === alvo);
}


export function faltando(
  documentos: Array<{ tipo?: string | null }> | null | undefined,
  tipoContrato?: string | null,
): TipoDoc[] {
  return conjuntoDe(tipoContrato).filter((req) => !entregue(documentos, req.tipo));
}









export function foraDoCatalogo(
  documentos: Array<{ tipo?: string | null }> | null | undefined,
  tipoContrato?: string | null,
): Array<{ tipo?: string | null }> {
  const validos = new Set(conjuntoDe(tipoContrato).map((d) => d.tipo));
  return (documentos || []).filter((d) => !validos.has(String(d?.tipo || '').toLowerCase().trim()));
}






const EXTENSOES = new Set(['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx', 'xls', 'xlsx', 'webp', 'heic']);
export function tipoEhExtensao(tipo?: string | null): boolean {
  return EXTENSOES.has(String(tipo || '').toLowerCase().trim());
}
