

















export const INTERVALO_BASE_MS = 30_000;

export const INTERVALO_MAX_MS = 300_000;









export function proximoIntervalo(falhasSeguidas: number, base = INTERVALO_BASE_MS): number {
  const n = Number(falhasSeguidas);
  if (!Number.isFinite(n) || n <= 0) return base;







  const passos = Math.min(n, 20);
  return Math.min(base * 2 ** passos, INTERVALO_MAX_MS);
}










export function deveRecuar(erro: unknown): boolean {
  if (!erro || typeof erro !== 'object') return true;
  const e = erro as { status?: number; message?: string };
  const status = Number(e.status);
  if (Number.isFinite(status) && status > 0) return status >= 500 || status === 429;
  const txt = String(e.message || '').toLowerCase();
  if (!txt) return true;
  return ['failed to fetch', 'networkerror', 'timeout', 'aborted', 'load failed']
    .some((m) => txt.includes(m));
}
