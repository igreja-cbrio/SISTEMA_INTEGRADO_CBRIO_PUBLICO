























export const STATUS_INDISPONIVEL = [500, 502, 503, 504, 521, 522, 523, 524] as const;

export function ehFalhaDeRedeOuServidor(err: unknown): boolean {
  if (!err) return false;
  const e = err as { status?: number; name?: string; message?: string };

  const status = Number(e.status);
  if (Number.isFinite(status) && status > 0) {

    if (status >= 500) return true;


    if (status === 429) return true;



    return false;
  }


  if (e.name === 'TypeError' || e.name === 'AbortError' || e.name === 'TimeoutError') return true;
  const msg = String(e.message || '').toLowerCase();
  if (!msg) return false;
  return /failed to fetch|networkerror|network request failed|load failed|backend n[ãa]o dispon|timeout|timed out|aborted/.test(msg);
}






export function ehDuplicado(err: unknown): boolean {
  if (!err) return false;
  const e = err as { status?: number; message?: string };
  if (Number(e.status) === 409) return true;
  return /duplicad|j[áa] (existe|possui|tem) check|23505/i.test(String(e.message || ''));
}
