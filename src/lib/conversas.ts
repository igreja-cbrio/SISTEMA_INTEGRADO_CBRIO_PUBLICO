



export function hrefConversa(telefone: string | number | null | undefined, texto?: string): string {
  const d = String(telefone ?? '').replace(/\D+/g, '');
  const p = new URLSearchParams();
  p.set('tab', 'conversas');
  if (d) p.set('telefone', d);
  if (d && texto) p.set('texto', texto);
  return `/comunicacao?${p.toString()}`;
}



















export function hrefWhatsapp(telefone: string | number | null | undefined, texto?: string): string | null {
  const d = String(telefone ?? '').replace(/\D+/g, '');
  if (d.length < 10) return null;
  const num = d.length <= 11 ? `55${d}` : d;
  const q = texto ? `?text=${encodeURIComponent(texto)}` : '';
  return `https://wa.me/${num}${q}`;
}
