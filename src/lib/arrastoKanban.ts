































export const LIMIAR_ARRASTO_PX = 6;


export const FAIXA_AUTOSCROLL_PX = 72;

export const VELOCIDADE_AUTOSCROLL_MAX = 18;

export type EstadoArrasto = {
  ativo: boolean;
  pointerId: number;
  cardId: string;
  estadoOrigem: string;
  x0: number;
  y0: number;
  x: number;
  y: number;
};

export function iniciarArrasto(args: {
  pointerId: number; cardId: string; estadoOrigem: string; x: number; y: number;
}): EstadoArrasto {
  return {
    ativo: false,
    pointerId: args.pointerId,
    cardId: args.cardId,
    estadoOrigem: args.estadoOrigem,
    x0: args.x, y0: args.y, x: args.x, y: args.y,
  };
}





export function moverArrasto(e: EstadoArrasto | null, x: number, y: number): EstadoArrasto | null {
  if (!e) return null;
  const dist = Math.hypot(x - e.x0, y - e.y0);
  return { ...e, x, y, ativo: e.ativo || dist >= LIMIAR_ARRASTO_PX };
}







export function decidirSoltura(
  e: EstadoArrasto | null,
  colunaAlvo: string | null,
  aceitaColuna?: (coluna: string) => boolean,
): { acao: 'nada' } | { acao: 'clique'; cardId: string } | { acao: 'mover'; cardId: string; para: string } {
  if (!e) return { acao: 'nada' };
  if (!e.ativo) return { acao: 'clique', cardId: e.cardId };
  if (!colunaAlvo) return { acao: 'nada' };


  if (colunaAlvo === e.estadoOrigem) return { acao: 'nada' };
  if (aceitaColuna && !aceitaColuna(colunaAlvo)) return { acao: 'nada' };
  return { acao: 'mover', cardId: e.cardId, para: colunaAlvo };
}







export function velocidadeAutoScroll(
  xPonteiro: number,
  retangulo: { left: number; right: number },
): number {
  if (!Number.isFinite(xPonteiro)) return 0;
  const { left, right } = retangulo;
  if (!Number.isFinite(left) || !Number.isFinite(right) || right <= left) return 0;

  const daEsquerda = xPonteiro - left;
  const daDireita = right - xPonteiro;


  if (daEsquerda < 0) return -VELOCIDADE_AUTOSCROLL_MAX;
  if (daDireita < 0) return VELOCIDADE_AUTOSCROLL_MAX;

  if (daEsquerda < FAIXA_AUTOSCROLL_PX) {
    const forca = (FAIXA_AUTOSCROLL_PX - daEsquerda) / FAIXA_AUTOSCROLL_PX;
    return -Math.max(1, Math.round(forca * VELOCIDADE_AUTOSCROLL_MAX));
  }
  if (daDireita < FAIXA_AUTOSCROLL_PX) {
    const forca = (FAIXA_AUTOSCROLL_PX - daDireita) / FAIXA_AUTOSCROLL_PX;
    return Math.max(1, Math.round(forca * VELOCIDADE_AUTOSCROLL_MAX));
  }
  return 0;
}
