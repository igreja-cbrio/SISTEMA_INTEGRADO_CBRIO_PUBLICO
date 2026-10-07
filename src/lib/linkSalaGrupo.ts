















export type FormLinkSala = {
  link_online?: string | null;

  link_indisponivel?: boolean;
};











export function payloadLinkSala(form: FormLinkSala): { link_online?: string } {
  if (form?.link_indisponivel) return {};
  return { link_online: String(form?.link_online ?? '').trim() };
}
