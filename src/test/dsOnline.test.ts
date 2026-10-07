


import { describe, it, expect } from 'vitest';
import { calcularDs, maiorViewCount, inteiro } from '../../backend/utils/dsOnline.js';

describe('DS online · views depois que a live acabou', () => {
  it('⚠️ subtrai as views da live — o defeito que originou o pedido', () => {

    expect(calcularDs({ viewCountD1: 1355, viewsLive: 520 })).toEqual({ ds: 835, regra: 'pos_live' });
  });

  it('⚠️ sem views da live cai no ACUMULADO e DIZ que caiu', () => {


    expect(calcularDs({ viewCountD1: 1355 })).toEqual({ ds: 1355, regra: 'acumulado' });
    expect(calcularDs({ viewCountD1: 1355, viewsLive: null })).toEqual({ ds: 1355, regra: 'acumulado' });
  });

  it('⚠️ NUNCA devolve negativo (o YouTube revisa a contagem para baixo)', () => {


    expect(calcularDs({ viewCountD1: 500, viewsLive: 520 }).ds).toBe(0);
    expect(calcularDs({ viewCountD1: 0, viewsLive: 900 }).ds).toBe(0);
  });

  it('sem acumulado do dia seguinte não afirma nada', () => {
    expect(calcularDs({ viewCountD1: null, viewsLive: 520 })).toEqual({ ds: null, regra: 'sem_dado' });
    expect(calcularDs({})).toEqual({ ds: null, regra: 'sem_dado' });
  });

  it('⚠️ zero de views da live é DADO, não ausência', () => {

    expect(calcularDs({ viewCountD1: 900, viewsLive: 0 })).toEqual({ ds: 900, regra: 'pos_live' });
  });

  it('aceita o texto que a Data API devolve', () => {
    expect(calcularDs({ viewCountD1: '1355', viewsLive: '520' })).toEqual({ ds: 835, regra: 'pos_live' });
  });

  it('valor absurdo não vira número', () => {
    expect(inteiro(-5)).toBeNull();
    expect(inteiro('abc')).toBeNull();
    expect(inteiro(NaN)).toBeNull();
    expect(inteiro('')).toBeNull();
  });

  it('⚠️ views da live é o MAIOR amostrado, não o último', () => {

    expect(maiorViewCount(480, 310)).toBe(480);
    expect(maiorViewCount(200, 480)).toBe(480);
    expect(maiorViewCount(null, 200)).toBe(200);
    expect(maiorViewCount(480, null)).toBe(480);
    expect(maiorViewCount(null, null)).toBeNull();
  });

  it('⚠️ pico simultâneo e views são grandezas DIFERENTES', () => {


    const { ds } = calcularDs({ viewCountD1: 1355, viewsLive: 300 });
    expect(ds).toBe(1055);
    expect(ds).not.toBe(1355 - 1355);
  });
});
