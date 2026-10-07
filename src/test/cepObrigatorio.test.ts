








import { describe, it, expect } from 'vitest';
import { cepCompleto as noServidor, normalizarCep, regiaoDeCep } from '../../backend/utils/trechoCep.js';
import { cepCompleto as noCliente, mascaraCep } from '../lib/cepAutopreenche';


const CASOS: Array<[string, boolean]> = [
  ['22640-102', true],
  ['22640102', true],
  [' 22640-102 ', true],
  ['2264010', false],
  ['22640-10', false],
  ['226401021', false],
  ['', false],
  ['   ', false],
  ['abcdefgh', false],
  ['00000000', true],
];

describe('⚠️ cliente e servidor decidem IGUAL', () => {
  it.each(CASOS)('%s → %s nos dois lados', (valor, esperado) => {
    expect(noCliente(valor)).toBe(esperado);
    expect(noServidor(valor)).toBe(esperado);
  });

  it('nulo e undefined não quebram nenhum dos dois', () => {
    for (const v of [null, undefined]) {
      expect(noCliente(v as never)).toBe(false);
      expect(noServidor(v as never)).toBe(false);
    }
  });
});

describe('normalizarCep', () => {
  it('devolve os 8 dígitos, sem máscara', () => {
    expect(normalizarCep('22640-102')).toBe('22640102');
  });

  it('⚠️⚠️ incompleto devolve null — NUNCA completa nem trunca', () => {

    expect(normalizarCep('2264010')).toBeNull();
    expect(normalizarCep('226')).toBeNull();
  });
});

describe('⚠️ o que passa aqui tem que virar trecho no mapa', () => {
  it('CEP aceito sempre produz região de 5 dígitos', () => {
    for (const [valor, ok] of CASOS) {
      if (ok) expect(regiaoDeCep(valor)).toHaveLength(5);
      else expect(regiaoDeCep(valor)).toBeNull();
    }
  });
});

describe('a máscara não deixa passar do formato', () => {
  it('corta em 8 dígitos e formata', () => {
    expect(mascaraCep('226401021999')).toBe('22640-102');
    expect(mascaraCep('22640')).toBe('22640');
  });

  it('⚠️ o que a máscara produz do valor completo é aceito pelas duas réguas', () => {
    const m = mascaraCep('22640102');
    expect(noCliente(m)).toBe(true);
    expect(noServidor(m)).toBe(true);
  });
});
