










import { describe, it, expect } from 'vitest';
import { lotesPara, POR_LOTE, MAX_LOTES } from '@/lib/lotesBusca';

describe('os lotes que cobrem a lista inteira', () => {

  it('1.410 respostas pedem DOIS lotes — um só deixava 410 de fora', () => {
    const r = lotesPara(1410);
    expect(r.offsets).toEqual([0, 1000]);
    expect(r.truncado).toBe(false);
    expect(r.alcance).toBe(1410);
  });

  it('cabendo em um lote, pede um só', () => {
    expect(lotesPara(1000).offsets).toEqual([0]);
    expect(lotesPara(1).offsets).toEqual([0]);
  });



  it('1.001 já precisa de dois', () => {
    expect(lotesPara(1001).offsets).toHaveLength(2);
    expect(lotesPara(1000).offsets).toHaveLength(1);
  });



  it('sem total conhecido, começa com um lote', () => {
    expect(lotesPara(null).offsets).toEqual([0]);
    expect(lotesPara(undefined).offsets).toEqual([0]);
    expect(lotesPara(0).offsets).toEqual([0]);
  });
});

describe('⚠️⚠️ teto que trunca tem que AVISAR', () => {
  it('acima do teto, marca truncado e diz o alcance real', () => {
    const r = lotesPara(34000);
    expect(r.offsets).toHaveLength(MAX_LOTES);
    expect(r.truncado).toBe(true);
    expect(r.alcance).toBe(MAX_LOTES * POR_LOTE);
  });

  it('exatamente no teto ainda não é truncado', () => {
    const r = lotesPara(MAX_LOTES * POR_LOTE);
    expect(r.truncado).toBe(false);
    expect(r.offsets).toHaveLength(MAX_LOTES);
  });

  it('um a mais que o teto já é truncado', () => {
    expect(lotesPara(MAX_LOTES * POR_LOTE + 1).truncado).toBe(true);
  });
});

describe('parâmetros tortos não viram lote infinito', () => {
  it('porLote inválido cai no padrão', () => {
    expect(lotesPara(1410, 0).offsets).toEqual([0, 1000]);
    expect(lotesPara(1410, -5).offsets).toEqual([0, 1000]);
  });

  it('maxLotes inválido cai no padrão', () => {
    expect(lotesPara(34000, 1000, 0).offsets).toHaveLength(MAX_LOTES);
  });

  it('total não numérico não estoura', () => {
    expect(lotesPara('muitos' as never).offsets).toEqual([0]);
  });
});
