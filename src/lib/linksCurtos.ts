





export const BASE_QR = 'https://www.cbrio.org/r/';











export function sugerirSlug(titulo: string) {
  return String(titulo || '')
    .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}
