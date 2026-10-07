import { describe, it, expect } from 'vitest';
import {
  montarLinhaDoTempo, variacoes, indiceBase100, razaoPor100, correlacao,
  rotuloCorrelacao, variacaoPeriodo, variacaoPct, fraseRelacao,
} from '../lib/cruzamentoIndicadores';

const freq = [
  { mes: 11, '2025': 1000, '2026': null },
  { mes: 12, '2025': 1200, '2026': null },
  { mes: 1, '2025': 800, '2026': 900 },
  { mes: 2, '2025': null, '2026': 1100 },
];
const acc = [
  { mes: 11, '2025': 20, '2026': null },
  { mes: 12, '2025': 30, '2026': null },
  { mes: 1, '2025': 10, '2026': 18 },
  { mes: 2, '2025': null, '2026': 0 },
];

describe('cruzamento de indicadores', () => {
  const pontos = montarLinhaDoTempo({ frequencia: freq, aceitacoes: acc }, [2026, 2025]);

  it('ordena cronologicamente e descarta mês sem dado em nenhum indicador', () => {
    expect(pontos.map(p => p.label)).toEqual(['jan/25', 'nov/25', 'dez/25', 'jan/26', 'fev/26']);
  });

  it('mês anterior atravessa a virada do ano; ano anterior compara o mesmo mês', () => {
    const v = variacoes(pontos, 'frequencia');
    const jan26 = v[3];
    expect(jan26.mom).toBeCloseTo(-25);
    expect(jan26.yoy).toBeCloseTo(12.5);
    expect(v[0].mom).toBeNull();
  });

  it('zero é dado: entra na razão, mas não serve de base de variação', () => {
    expect(razaoPor100(pontos, 'aceitacoes', 'frequencia')[4]).toBe(0);
    expect(variacaoPct(5, 0)).toBeNull();
  });

  it('índice base 100 parte do 1º mês com dado', () => {
    expect(indiceBase100(pontos, 'frequencia')).toEqual([100, 125, 150, 112.5, 137.5]);
  });

  it('correlação usa só meses com os dois lados e exige 3 pontos', () => {
    const c = correlacao(pontos, 'frequencia', 'aceitacoes');
    expect(c.n).toBe(5);
    expect(c.r).not.toBeNull();
    expect(correlacao(pontos.slice(0, 2), 'frequencia', 'aceitacoes').r).toBeNull();
    expect(rotuloCorrelacao(0.85)).toBe('forte positiva');
    expect(rotuloCorrelacao(-0.5)).toBe('moderada negativa');
    expect(rotuloCorrelacao(0.1)).toBe('sem relação');
  });

  it('mês em andamento fica fora da variação do período e da correlação', () => {
    const comParcial = montarLinhaDoTempo({ frequencia: freq, aceitacoes: acc }, [2025, 2026], { ano: 2026, mes: 2 });
    expect(comParcial.map(p => p.parcial)).toEqual([false, false, false, false, true]);
    const p = variacaoPeriodo(comParcial, 'frequencia');
    expect(p.ate).toBe('jan/26');
    expect(p.deltaPct).toBeCloseTo(12.5);
    expect(p.total).toBe(5000);
    expect(correlacao(comParcial, 'frequencia', 'aceitacoes').n).toBe(4);
  });

  it('variação do período vai do 1º ao último mês com dado', () => {
    const p = variacaoPeriodo(pontos, 'frequencia');
    expect(p.de).toBe('jan/25');
    expect(p.ate).toBe('fev/26');
    expect(p.deltaPct).toBeCloseTo(37.5);
    expect(p.total).toBe(5000);
  });

  it('frase da relação: esconde com poucos meses e nunca afirma causa', () => {
    expect(fraseRelacao(0.9, 5, 'Frequência', 'Aceitações').nivel).toBe('poucos');
    expect(fraseRelacao(null, 12, 'Frequência', 'Aceitações').nivel).toBe('poucos');
    const forte = fraseRelacao(0.82, 24, 'Frequência', 'Aceitações');
    expect(forte.nivel).toBe('forte');
    expect(forte.texto).toContain('Aceitações costuma subir junto');
    expect(forte.texto).toContain('24 meses');
    expect(fraseRelacao(-0.5, 12, 'A', 'B').texto).toContain('B costuma cair');
    expect(fraseRelacao(0.1, 12, 'A', 'B').nivel).toBe('nenhuma');
  });
});
