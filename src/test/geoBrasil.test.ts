













import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const { normalizarBairro, dentroDoRio, CAIXA_RJ } =
  require_('../../backend/services/geoBrasil.js');

describe('normalizarBairro · espelho de f_unaccent(lower(trim()))', () => {

  const casos: [string, string | null][] = [
    ['Barra da Tijuca', 'barra da tijuca'],
    ['  Copacabana  ', 'copacabana'],
    ['São Conrado', 'sao conrado'],
    ['Jacarepaguá', 'jacarepagua'],
    ['Freguesia (Jacarepaguá)', 'freguesia (jacarepagua)'],
    ['MARECHAL HERMES', 'marechal hermes'],
    ['Água Santa', 'agua santa'],
    ['Praça Seca', 'praca seca'],
    ['Vila Isabel / Grajaú', 'vila isabel / grajau'],
    ['Niterói - Icaraí', 'niteroi - icarai'],
    ['Penha Circular 2', 'penha circular 2'],

    ['   ', null],
  ];
  for (const [entrada, esperado] of casos) {
    it(`${JSON.stringify(entrada)} → ${JSON.stringify(esperado)}`, () => {
      expect(normalizarBairro(entrada)).toBe(esperado);
    });
  }

  it('ausência de bairro é null, nunca string vazia', () => {


    expect(normalizarBairro('')).toBeNull();
    expect(normalizarBairro(null)).toBeNull();
    expect(normalizarBairro(undefined)).toBeNull();
  });

  it('acento é REMOVIDO, não só minusculizado', () => {


    expect(normalizarBairro('São Conrado')).not.toContain('ã');
    expect(normalizarBairro('Jacarepaguá')).not.toContain('á');
  });

  it('NFC e NFD do mesmo nome dão a MESMA chave', () => {


    expect(normalizarBairro('São Conrado'.normalize('NFC')))
      .toBe(normalizarBairro('São Conrado'.normalize('NFD')));
  });
});

describe('dentroDoRio · a caixa que protege o centróide de bairro', () => {
  it('aceita coordenada do Rio metropolitano', () => {
    expect(dentroDoRio(-22.9068, -43.1729)).toBe(true);
    expect(dentroDoRio(-22.8833, -43.1036)).toBe(true);
    expect(dentroDoRio(-22.7561, -43.4603)).toBe(true);
  });

  it('recusa homônimo em outro estado', () => {



    expect(dentroDoRio(-27.5954, -48.5480)).toBe(false);
    expect(dentroDoRio(-23.5505, -46.6333)).toBe(false);
    expect(dentroDoRio(-19.9167, -43.9345)).toBe(false);
  });

  it('coordenada ilegível NUNCA passa', () => {

    expect(dentroDoRio(NaN, NaN)).toBe(false);
    expect(dentroDoRio(null as unknown as number, -43.2)).toBe(false);
    expect(dentroDoRio(undefined as unknown as number, undefined as unknown as number)).toBe(false);
  });

  it('coordenada em STRING não passa — é o que a guarda Number.isFinite protege', () => {




    expect(dentroDoRio('-22.9068' as unknown as number, '-43.1729' as unknown as number)).toBe(false);
  });

  it('a caixa é do Rio, e o teste trava os limites', () => {


    expect(CAIXA_RJ).toEqual({ latMax: -21.8, latMin: -23.6, lngMax: -42.4, lngMin: -44.3 });
  });
});
