import { describe, it, expect } from 'vitest';
import { G, QUADROS, x0Para, enquadramentoInicial, SEMANAS_NA_ABERTURA } from '../pages/marketing/linha/layout';





const TOPO_CABECALHO = G.HY - 16;
const BASE_QUADROS = G.TOPY + QUADROS.length * (G.BH + G.BGAP) - G.BGAP;
const CENTRO_QUADROS = (G.TOPY + BASE_QUADROS) / 2;

function semanasVisiveis(v: { zoom: number; x: number }, largura: number) {
  const inicioColunas = v.x + x0Para(null) * v.zoom;
  return (largura - inicioColunas) / (G.COLW * v.zoom);
}


const TELAS: Array<[string, number, number]> = [
  ['1920x1080 · 100%', 1920, 906],
  ['1920x1080 · 125%', 1536, 690],
  ['notebook 1366x768', 1366, 600],
  ['monitor 2560x1440', 2560, 1300],
];

describe('enquadramentoInicial', () => {
  for (const [nome, w, h] of TELAS) {
    it(`${nome}: mostra entre 5 e 6 semanas`, () => {
      const v = enquadramentoInicial(w, h);
      const semanas = semanasVisiveis(v, w);
      expect(semanas).toBeGreaterThanOrEqual(5);
      expect(semanas).toBeLessThanOrEqual(6);
    });

    it(`${nome}: o cabeçalho das semanas abre inteiro`, () => {
      const v = enquadramentoInicial(w, h);
      expect(v.y + TOPO_CABECALHO * v.zoom).toBeGreaterThanOrEqual(0);
    });

    it(`${nome}: os 3 quadrados cabem na altura`, () => {
      const v = enquadramentoInicial(w, h);
      expect(v.y + G.TOPY * v.zoom).toBeGreaterThanOrEqual(0);
      expect(v.y + BASE_QUADROS * v.zoom).toBeLessThanOrEqual(h);
    });

    it(`${nome}: quadrados perto do meio da altura (≤ 40px)`, () => {
      const v = enquadramentoInicial(w, h);
      expect(Math.abs(v.y + CENTRO_QUADROS * v.zoom - h / 2)).toBeLessThanOrEqual(40);
    });

    it(`${nome}: os quadrados começam colados à esquerda`, () => {
      const v = enquadramentoInicial(w, h);
      const xQuadros = v.x + G.BX * v.zoom;
      expect(xQuadros).toBeGreaterThan(0);
      expect(xQuadros).toBeLessThan(60);
    });
  }

  it('com altura sobrando, os quadrados ficam exatamente no meio', () => {
    const v = enquadramentoInicial(2560, 1300);
    expect(Math.abs(v.y + CENTRO_QUADROS * v.zoom - 650)).toBeLessThan(1);
  });

  it('tela baixa demais: vence o cabeçalho, mesmo sem caber tudo', () => {


    const v = enquadramentoInicial(1920, 420);
    expect(v.y + TOPO_CABECALHO * v.zoom).toBeGreaterThanOrEqual(0);
  });

  it('celular: não desce do piso de zoom (menos semanas, legíveis)', () => {
    const v = enquadramentoInicial(390, 700);
    expect(v.zoom).toBeGreaterThanOrEqual(0.5);
    expect(semanasVisiveis(v, 390)).toBeLessThan(SEMANAS_NA_ABERTURA);
  });

  it('viewport sem tamanho (ainda não medido) devolve números finitos', () => {
    for (const [w, h] of [[0, 0], [NaN, NaN], [-10, 500], [undefined, undefined]] as Array<[number, number]>) {
      const v = enquadramentoInicial(w, h);
      expect(Number.isFinite(v.zoom)).toBe(true);
      expect(Number.isFinite(v.x)).toBe(true);
      expect(Number.isFinite(v.y)).toBe(true);
      expect(v.zoom).toBeGreaterThanOrEqual(0.5);
      expect(v.zoom).toBeLessThanOrEqual(2);
    }
  });

  it('a faixa do cabeçalho começa no topo do canvas (sem o vazio do ano antigo)', () => {


    expect(TOPO_CABECALHO).toBeLessThanOrEqual(30);
    expect(G.TOPY - G.HY).toBe(100);
  });
});
