






type Encerrador = () => Promise<void>;

let encerrador: Encerrador | null = null;
const TEMPO_MAX_MS = 2500;

export function registrarEncerramento(fn: Encerrador): () => void {
  encerrador = fn;
  return () => { if (encerrador === fn) encerrador = null; };
}


export async function antesDeSair(): Promise<void> {
  const fn = encerrador;
  if (!fn) return;
  await Promise.race([
    fn().catch(() => {                                        }),
    new Promise<void>((resolve) => setTimeout(resolve, TEMPO_MAX_MS)),
  ]);
}
