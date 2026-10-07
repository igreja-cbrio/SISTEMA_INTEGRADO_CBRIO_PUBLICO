import { describe, expect, it } from 'vitest';
import { rebalancear } from '../components/avaliacao360/Pesos';

const soma = (p: Record<string, number>) => p.gestor + p.auto + p.outros;

describe('pesos da 360 · a soma é sempre 100%', () => {
  const base = { gestor: 70, auto: 15, outros: 15 };
  it('subir um tira dos outros na proporção', () => {
    expect(rebalancear(base, 'gestor', 80)).toEqual({ gestor: 80, auto: 10, outros: 10 });
    expect(rebalancear(base, 'auto', 25)).toEqual({ gestor: 60, auto: 25, outros: 15 });
  });
  it('em qualquer ponto, soma 100 e nada negativo, em passos de 5', () => {
    for (const k of ['gestor', 'auto', 'outros'] as const) {
      for (let v = 0; v <= 100; v += 1) {
        const r = rebalancear(base, k, v);
        expect(soma(r)).toBe(100);
        expect([r.gestor, r.auto, r.outros].every((x: number) => x >= 0 && x % 5 === 0)).toBe(true);
      }
    }
  });
  it('com os outros zerados, divide o resto ao meio', () => {
    expect(rebalancear({ gestor: 100, auto: 0, outros: 0 }, 'gestor', 60)).toEqual({ gestor: 60, auto: 20, outros: 20 });
  });
});
