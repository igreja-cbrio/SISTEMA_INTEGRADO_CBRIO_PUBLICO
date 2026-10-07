import { describe, it, expect } from 'vitest';
import { tirarCodigoPais, mascaraTelefone, soDigitos } from '../lib/inscricao';


import {
  mascaraTelefone as backendMascara,
  tirarCodigoPaisTelefone as backendTirarCodigoPais,
} from '../../backend/utils/camposContato';









describe('tirarCodigoPais', () => {
  it('remove o 55 do país quando sobra telefone completo', () => {
    expect(tirarCodigoPais('5521999998888')).toBe('21999998888');
    expect(tirarCodigoPais('552133334444')).toBe('2133334444');
  });

  it('NÃO toca em DDD 55 legítimo (Santa Maria/RS)', () => {
    expect(tirarCodigoPais('55999998888')).toBe('55999998888');
    expect(tirarCodigoPais('5532201234')).toBe('5532201234');
  });

  it('não mexe em telefone normal nem em entrada vazia', () => {
    expect(tirarCodigoPais('21999998888')).toBe('21999998888');
    expect(tirarCodigoPais('')).toBe('');
    expect(tirarCodigoPais(null as unknown as string)).toBe('');
  });
});

describe('mascaraTelefone tira o país ANTES de truncar', () => {


  const gravado = (v: string) => soDigitos(mascaraTelefone(v));

  it('colar do contato com +55 preserva o número real', () => {
    expect(gravado('+55 21 99999-8888')).toBe('21999998888');
    expect(gravado('5521999998888')).toBe('21999998888');
  });

  it('DDD 55 com e sem código do país continuam corretos', () => {
    expect(gravado('+55 55 99999-8888')).toBe('55999998888');
    expect(gravado('(55) 99999-8888')).toBe('55999998888');
  });

  it('digitação normal segue intacta', () => {
    expect(gravado('(21) 99999-8888')).toBe('21999998888');
    expect(gravado('21 3333-4444')).toBe('2133334444');
  });

  it('o resultado sempre cabe na validação de 10–11 dígitos', () => {
    for (const entrada of [
      '+55 21 99999-8888', '5521999998888', '(55) 99999-8888',
      '+55 55 99999-8888', '(21) 99999-8888', '21 3333-4444',
    ]) {
      const d = gravado(entrada);
      expect(d.length, `${entrada} gravou ${d}`).toBeGreaterThanOrEqual(10);
      expect(d.length, `${entrada} gravou ${d}`).toBeLessThanOrEqual(11);
    }
  });
});

describe('camposContato (backend) · máscara do profiles.telefone', () => {



  const gravado = (v: string) => backendMascara(v);

  it('tem o MESMO comportamento do front (mascaraTelefone)', () => {
    for (const entrada of [
      '+55 21 99999-8888', '5521999998888', '(55) 99999-8888',
      '+55 55 99999-8888', '(21) 99999-8888', '21 3333-4444', '552133334444',
    ]) {
      expect(backendMascara(entrada), `front vs backend para ${entrada}`)
        .toBe(mascaraTelefone(entrada));
    }
  });

  it('+55 colado do contato vira máscara canônica de 11 dígitos', () => {
    expect(gravado('+55 21 99999-8888')).toBe('(21) 99999-8888');
    expect(gravado('5521999998888')).toBe('(21) 99999-8888');
    expect(gravado('552133334444')).toBe('(21) 3333-4444');
  });

  it('DDD 55 legítimo (Santa Maria/RS) não é comido', () => {
    expect(gravado('+55 55 99999-8888')).toBe('(55) 99999-8888');
    expect(gravado('(55) 99999-8888')).toBe('(55) 99999-8888');
  });

  it('null/vazio → string vazia (nunca "null" gravado em profiles)', () => {
    expect(backendMascara('')).toBe('');
    expect(backendMascara(null as unknown as string)).toBe('');
    expect(backendTirarCodigoPais('')).toBe('');
  });
});
