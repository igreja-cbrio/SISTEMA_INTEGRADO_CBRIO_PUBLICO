










export const ZONA_BORDA = 90;

export const VELOCIDADE_MAX = 24;









export function velocidadeAutoScroll(
  y: number,
  altura: number,
  zona: number = ZONA_BORDA,
  vMax: number = VELOCIDADE_MAX,
): number {
  if (!Number.isFinite(y) || !Number.isFinite(altura) || altura <= 0) return 0;


  const z = Math.max(1, Math.min(zona, Math.floor(altura / 2)));

  if (y < z) {
    const p = Math.min(1, (z - y) / z);
    return -Math.max(1, Math.round(p * vMax));
  }
  if (y > altura - z) {
    const p = Math.min(1, (y - (altura - z)) / z);
    return Math.max(1, Math.round(p * vMax));
  }
  return 0;
}










export function containerDeScroll(el: Element | null): Element | null {
  let atual: Element | null = el?.parentElement || null;
  while (atual && atual !== document.body && atual !== document.documentElement) {
    const estilo = getComputedStyle(atual);
    const rolavel = /(auto|scroll|overlay)/.test(estilo.overflowY);
    if (rolavel && atual.scrollHeight > atual.clientHeight + 1) return atual;
    atual = atual.parentElement;
  }
  return null;
}


export function podeRolar(alvo: Element | null, delta: number): boolean {
  if (delta === 0) return false;
  if (!alvo) {
    const y = window.scrollY;
    if (delta < 0) return y > 0;
    return y + window.innerHeight < document.documentElement.scrollHeight - 1;
  }
  if (delta < 0) return alvo.scrollTop > 0;
  return alvo.scrollTop + alvo.clientHeight < alvo.scrollHeight - 1;
}
