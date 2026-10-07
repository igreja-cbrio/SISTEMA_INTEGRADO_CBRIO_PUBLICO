








































export const NIVEIS_ZOOM = [1, 1.15, 1.25, 1.5] as const;
export type NivelZoom = (typeof NIVEIS_ZOOM)[number];

export const ZOOM_PADRAO: NivelZoom = 1;







export const CHAVE_ZOOM = 'cbrio_dash_zoom_v1';


export function normalizarZoom(v: unknown): NivelZoom {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return ZOOM_PADRAO;
  return (NIVEIS_ZOOM as readonly number[]).includes(n) ? (n as NivelZoom) : ZOOM_PADRAO;
}






export function lerZoomSalvo(storage?: Pick<Storage, 'getItem'>): NivelZoom {
  try {
    const s = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    return normalizarZoom(s?.getItem(CHAVE_ZOOM));
  } catch {
    return ZOOM_PADRAO;
  }
}

export function salvarZoom(nivel: NivelZoom, storage?: Pick<Storage, 'setItem'>): void {
  try {
    const s = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    s?.setItem(CHAVE_ZOOM, String(normalizarZoom(nivel)));
  } catch {

  }
}


export function rotuloZoom(n: NivelZoom): string {
  return n === 1 ? '100%' : `${Math.round(n * 100)}%`;
}
