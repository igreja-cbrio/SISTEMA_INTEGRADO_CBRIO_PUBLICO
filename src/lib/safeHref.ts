



















const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

export function safeHref(input: string | null | undefined): string {
  if (typeof input !== 'string' || !input.trim()) return '#';
  const raw = input.trim();


  const base =
    typeof window !== 'undefined' && window.location
      ? window.location.origin
      : 'https://cbrio.local';

  try {
    const parsed = new URL(raw, base);
    return ALLOWED_PROTOCOLS.has(parsed.protocol) ? raw : '#';
  } catch {
    return '#';
  }
}

export default safeHref;
