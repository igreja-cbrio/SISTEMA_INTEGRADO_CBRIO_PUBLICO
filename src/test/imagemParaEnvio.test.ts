





import { describe, it, expect } from 'vitest';
import { dimensoesReduzidas, LADO_MAX_PADRAO, TETO_DATAURL } from '../lib/imagemParaEnvio';

describe('dimensoesReduzidas', () => {
  it('encolhe pelo lado MAIOR, preservando a proporção', () => {
    expect(dimensoesReduzidas(4032, 3024, 1024)).toEqual({ largura: 1024, altura: 768 });
    expect(dimensoesReduzidas(3024, 4032, 1024)).toEqual({ largura: 768, altura: 1024 });
    expect(dimensoesReduzidas(2000, 2000, 1024)).toEqual({ largura: 1024, altura: 1024 });
  });


  it('NUNCA aumenta', () => {
    expect(dimensoesReduzidas(640, 480, 1024)).toEqual({ largura: 640, altura: 480 });
    expect(dimensoesReduzidas(200, 100, 1024)).toEqual({ largura: 200, altura: 100 });
    expect(dimensoesReduzidas(1024, 700, 1024)).toEqual({ largura: 1024, altura: 700 });
  });



  it('lado estreito nunca chega a zero', () => {
    const r = dimensoesReduzidas(10000, 3, 1024);
    expect(r.largura).toBe(1024);
    expect(r.altura).toBeGreaterThanOrEqual(1);
  });



  it('dimensão inválida volta como veio, sem virar 0×0', () => {
    expect(dimensoesReduzidas(0, 0, 1024)).toEqual({ largura: 0, altura: 0 });
    expect(dimensoesReduzidas(NaN, 100, 1024)).toEqual({ largura: NaN, altura: 100 });
    expect(dimensoesReduzidas(-5, 10, 1024)).toEqual({ largura: -5, altura: 10 });
  });

  it('ladoMax inválido não encolhe nada', () => {
    expect(dimensoesReduzidas(4000, 3000, 0)).toEqual({ largura: 4000, altura: 3000 });
    expect(dimensoesReduzidas(4000, 3000, NaN)).toEqual({ largura: 4000, altura: 3000 });
  });

  it('arredonda pra inteiro — canvas não aceita fração', () => {
    const r = dimensoesReduzidas(1001, 667, 1000);
    expect(Number.isInteger(r.largura)).toBe(true);
    expect(Number.isInteger(r.altura)).toBe(true);
  });
});

describe('os tetos', () => {


  it('o teto do dataURL fica abaixo do 1mb do express.json', () => {
    expect(TETO_DATAURL).toBeLessThan(1024 * 1024);
  });
  it('o lado máximo é o de uma foto de identificação, não de impressão', () => {
    expect(LADO_MAX_PADRAO).toBeLessThanOrEqual(1280);
    expect(LADO_MAX_PADRAO).toBeGreaterThanOrEqual(640);
  });
});
