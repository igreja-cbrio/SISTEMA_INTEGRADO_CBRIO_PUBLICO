import { describe, it, expect } from 'vitest';
import {
  velocidadeAutoScroll, podeRolar, ZONA_BORDA, VELOCIDADE_MAX,
} from '../lib/autoScrollArrasto';





const ALTURA = 800;

describe('velocidade da rolagem automática', () => {
  it('no meio da tela NÃO rola — é o que impede a tela de fugir', () => {
    for (const y of [200, 400, 600, ALTURA / 2]) {
      expect(velocidadeAutoScroll(y, ALTURA)).toBe(0);
    }

    expect(velocidadeAutoScroll(ZONA_BORDA, ALTURA)).toBe(0);
    expect(velocidadeAutoScroll(ALTURA - ZONA_BORDA, ALTURA)).toBe(0);
  });

  it('perto do topo rola para CIMA; perto da base, para BAIXO', () => {
    expect(velocidadeAutoScroll(10, ALTURA)).toBeLessThan(0);
    expect(velocidadeAutoScroll(ALTURA - 10, ALTURA)).toBeGreaterThan(0);
  });

  it('acelera conforme entra na zona — não é liga/desliga', () => {
    const longe = Math.abs(velocidadeAutoScroll(ZONA_BORDA - 5, ALTURA));
    const meio = Math.abs(velocidadeAutoScroll(ZONA_BORDA / 2, ALTURA));
    const perto = Math.abs(velocidadeAutoScroll(2, ALTURA));
    expect(longe).toBeLessThan(meio);
    expect(meio).toBeLessThan(perto);


    expect(longe).toBeGreaterThanOrEqual(1);
  });

  it('⚠️ ponteiro FORA da janela satura na velocidade máxima', () => {


    expect(velocidadeAutoScroll(-500, ALTURA)).toBe(-VELOCIDADE_MAX);
    expect(velocidadeAutoScroll(ALTURA + 500, ALTURA)).toBe(VELOCIDADE_MAX);
  });

  it('janela baixa não faz as duas zonas se sobreporem', () => {


    const meio = velocidadeAutoScroll(50, 100);
    expect(meio).toBe(0);
    expect(velocidadeAutoScroll(2, 100)).toBeLessThan(0);
    expect(velocidadeAutoScroll(98, 100)).toBeGreaterThan(0);
  });

  it('entrada inválida não rola (evita NaN virando scroll)', () => {
    expect(velocidadeAutoScroll(NaN, ALTURA)).toBe(0);
    expect(velocidadeAutoScroll(100, 0)).toBe(0);
    expect(velocidadeAutoScroll(100, NaN)).toBe(0);
  });
});

describe('podeRolar · não insiste no fim', () => {
  function elemento({ scrollTop, clientHeight, scrollHeight }: {
    scrollTop: number; clientHeight: number; scrollHeight: number;
  }) {
    return { scrollTop, clientHeight, scrollHeight } as unknown as Element;
  }

  it('delta zero nunca rola', () => {
    expect(podeRolar(elemento({ scrollTop: 10, clientHeight: 100, scrollHeight: 500 }), 0)).toBe(false);
  });

  it('no topo não sobe mais; no fim não desce mais', () => {
    const noTopo = elemento({ scrollTop: 0, clientHeight: 100, scrollHeight: 500 });
    expect(podeRolar(noTopo, -5)).toBe(false);
    expect(podeRolar(noTopo, 5)).toBe(true);

    const noFim = elemento({ scrollTop: 400, clientHeight: 100, scrollHeight: 500 });
    expect(podeRolar(noFim, 5)).toBe(false);
    expect(podeRolar(noFim, -5)).toBe(true);
  });
});
