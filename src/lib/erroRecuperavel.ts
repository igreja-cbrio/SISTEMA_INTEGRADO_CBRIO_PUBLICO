












export const CHUNK_ERROR_RE = /Loading chunk|ChunkLoadError|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|valid JavaScript MIME type|Expected a JavaScript(?: \w+)? module script/i;



export const HOOKS_ERROR_RE = /Minified React error #3(00|10)\b|Rendered (more|fewer) hooks/i;

export type MotivoRecuperacao = 'chunk' | 'hooks-pos-atualizacao';



















export function classificarErroDeTela(
  mensagem: string | null | undefined,
  retryCount: number,
  maxRetries: number,
): { recuperavel: boolean; motivo: MotivoRecuperacao | null } {
  const msg = mensagem || '';

  if (CHUNK_ERROR_RE.test(msg)) {
    return { recuperavel: retryCount < maxRetries, motivo: 'chunk' };
  }

  if (HOOKS_ERROR_RE.test(msg) && retryCount > 0) {
    return { recuperavel: retryCount < maxRetries, motivo: 'hooks-pos-atualizacao' };
  }

  return { recuperavel: false, motivo: null };
}
