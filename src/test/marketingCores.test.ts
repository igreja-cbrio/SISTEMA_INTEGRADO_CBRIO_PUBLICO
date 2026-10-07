import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require_ = createRequire(import.meta.url);
const {
  CORES_EVENTO,
  COR_EXCEDENTE,
  corDoEvento,
  ehExcedente,
} = require_('../../backend/utils/marketingCores.js');







describe('paleta dos eventos no calendário', () => {
  it('são 6 cores, distintas, em hex de 6 dígitos', () => {
    expect(CORES_EVENTO).toHaveLength(6);
    expect(new Set(CORES_EVENTO).size).toBe(6);
    for (const c of CORES_EVENTO) expect(c).toMatch(/^#[0-9a-f]{6}$/i);
  });




  it('a cor da MARCA fica fora da paleta categórica', () => {
    const marca = ['#00b39d', '#00897b', '#3fe3c6'];
    for (const m of marca) {
      expect(CORES_EVENTO.map((c: string) => c.toLowerCase())).not.toContain(m);
    }
    expect(COR_EXCEDENTE.toLowerCase()).not.toBe('#00b39d');
  });

  it('cada posição até a 6ª tem cor própria', () => {
    const usadas = [0, 1, 2, 3, 4, 5].map(corDoEvento);
    expect(new Set(usadas).size).toBe(6);
    expect(usadas).toEqual(CORES_EVENTO);
    for (const i of [0, 1, 2, 3, 4, 5]) expect(ehExcedente(i)).toBe(false);
  });




  it('do 7º evento em diante cai no cinza neutro, sem inventar matiz', () => {
    for (const i of [6, 7, 12, 99]) {
      expect(corDoEvento(i)).toBe(COR_EXCEDENTE);
      expect(ehExcedente(i)).toBe(true);
    }
    expect(CORES_EVENTO).not.toContain(COR_EXCEDENTE);
  });

  it('índice inválido não estoura nem devolve undefined', () => {
    for (const ruim of [-1, NaN, undefined, null, 'a', 1.5, {}] as any[]) {
      expect(corDoEvento(ruim)).toBe(COR_EXCEDENTE);
      expect(ehExcedente(ruim)).toBe(true);
    }
  });



  it('é determinística', () => {
    for (const i of [0, 3, 5, 6, 40]) expect(corDoEvento(i)).toBe(corDoEvento(i));
  });
});
