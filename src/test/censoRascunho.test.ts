












import { describe, it, expect } from 'vitest';
import { podeAplicarRascunho, soDigitos } from '@/lib/censoRascunho';

describe('censoRascunho · o rascunho só volta pro dono', () => {
  it('máscara não atrapalha: compara só dígitos', () => {
    expect(soDigitos('123.456.789-09')).toBe('12345678909');
    expect(podeAplicarRascunho('123.456.789-09', '12345678909')).toBe(true);
    expect(podeAplicarRascunho('12345678909', '123.456.789-09')).toBe(true);
  });

  it('CPF diferente NÃO recupera — é o caso do aparelho compartilhado', () => {
    expect(podeAplicarRascunho('12345678909', '98765432100')).toBe(false);
  });



  it('prefixo NÃO basta — exige os 11 dígitos', () => {
    expect(podeAplicarRascunho('12345678909', '123')).toBe(false);
    expect(podeAplicarRascunho('12345678909', '1234567890')).toBe(false);
    expect(podeAplicarRascunho('12345678909', '12345678909')).toBe(true);
  });



  it('rascunho sem dono nunca é aplicado', () => {
    expect(podeAplicarRascunho(null, '12345678909')).toBe(false);
    expect(podeAplicarRascunho('', '12345678909')).toBe(false);
    expect(podeAplicarRascunho(undefined, '12345678909')).toBe(false);
    expect(podeAplicarRascunho('123', '12345678909')).toBe(false);
  });

  it('sem CPF digitado, nada volta', () => {
    expect(podeAplicarRascunho('12345678909', '')).toBe(false);
    expect(podeAplicarRascunho('12345678909', null)).toBe(false);
  });
});
