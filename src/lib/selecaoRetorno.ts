
const CHAVE = 'cbrio_selecao_retorno';
export function caminhoSelecao(v: unknown): string | null {
  return typeof v === 'string' && /^\/selecao-interna\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) ? v : null;
}
export function guardarRetornoSelecao(caminho: string) {
  const seguro = caminhoSelecao(caminho);
  if (seguro) try { sessionStorage.setItem(CHAVE, JSON.stringify({ caminho: seguro, criado: Date.now() })); } catch {                                                           }
}
export function lerRetornoSelecao(): string | null {
  try { const v = JSON.parse(sessionStorage.getItem(CHAVE) || 'null'); return v && Date.now() - v.criado < 30 * 60 * 1000 ? caminhoSelecao(v.caminho) : null; } catch { return null; }
}
export function limparRetornoSelecao() { try { sessionStorage.removeItem(CHAVE); } catch {                               } }
