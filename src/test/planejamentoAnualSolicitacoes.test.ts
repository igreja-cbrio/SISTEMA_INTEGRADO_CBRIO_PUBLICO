import { describe, it, expect } from 'vitest';
import { valorTotalItens, estaNoVencimento, dentroDaVigencia } from '../../backend/services/planejamentoAnualSolicitacoes.js';








describe('valorTotalItens (rotina de compras · achado 2026-09-28)', () => {
  it('soma valor_tipo "total" direto, sem multiplicar pela quantidade', () => {
    const itens = [{ valor_estimado: 300, valor_tipo: 'total', quantidade: 4 }];
    expect(valorTotalItens(itens)).toBe(300);
  });

  it('multiplica valor_tipo "por_unid" pela quantidade', () => {
    const itens = [{ valor_estimado: 50, valor_tipo: 'por_unid', quantidade: 4 }];
    expect(valorTotalItens(itens)).toBe(200);
  });

  it('soma itens mistos (total + por_unid)', () => {
    const itens = [
      { valor_estimado: 300, valor_tipo: 'total', quantidade: 1 },
      { valor_estimado: 50, valor_tipo: 'por_unid', quantidade: 4 },
    ];
    expect(valorTotalItens(itens)).toBe(500);
  });

  it('quantidade ausente ou zerada conta como 1 (não zera o total)', () => {
    const itens = [{ valor_estimado: 80, valor_tipo: 'por_unid', quantidade: 0 }];
    expect(valorTotalItens(itens)).toBe(80);
  });

  it('itens vazios, nulos ou sem valor_estimado dão 0, não quebram', () => {
    expect(valorTotalItens([])).toBe(0);
    expect(valorTotalItens(null as unknown as never[])).toBe(0);
    expect(valorTotalItens([{ valor_tipo: 'total' }])).toBe(0);
  });

  it('cenário real: compra planejada de R$ 50.000 não é mais tratada como até R$ 1.000', () => {
    const itens = [{ valor_estimado: 5000, valor_tipo: 'por_unid', quantidade: 10 }];
    const total = valorTotalItens(itens);
    expect(total).toBe(50000);
    expect(total <= 1000).toBe(false);
  });
});






describe('dentroDaVigencia (cron da rotina · achado 2026-09-28)', () => {
  const base = { data_inicio: '2027-01-15', multi_dia: false, data_fim: null };

  it('antes de data_inicio, fora da vigência (não gera antes da hora)', () => {
    expect(dentroDaVigencia(base, 2027, '2026-10-01')).toBe(false);
  });

  it('no dia de data_inicio em diante, dentro da vigência', () => {
    expect(dentroDaVigencia(base, 2027, '2027-01-15')).toBe(true);
    expect(dentroDaVigencia(base, 2027, '2027-06-01')).toBe(true);
  });

  it('sem data_fim explícito, morre no fim do ano do ciclo (não é permanente)', () => {
    expect(dentroDaVigencia(base, 2027, '2027-12-31')).toBe(true);
    expect(dentroDaVigencia(base, 2027, '2028-01-01')).toBe(false);
  });

  it('com multi_dia + data_fim, respeita a data_fim explícita (mesmo dentro do ano do ciclo)', () => {
    const p = { data_inicio: '2027-01-15', multi_dia: true, data_fim: '2027-03-31' };
    expect(dentroDaVigencia(p, 2027, '2027-03-31')).toBe(true);
    expect(dentroDaVigencia(p, 2027, '2027-04-01')).toBe(false);
  });

  it('sem ciclo (ano indisponível) e sem data_fim, nunca expira por data (só por data_inicio)', () => {
    expect(dentroDaVigencia(base, null, '2030-01-01')).toBe(true);
  });
});

describe('estaNoVencimento (regra de recorrência, sem regressão)', () => {
  it('diária vence todo dia, exceto se já gerou hoje', () => {
    expect(estaNoVencimento('diaria', null, null, '2027-03-10')).toBe(true);
    expect(estaNoVencimento('diaria', null, '2027-03-10T08:00:00Z', '2027-03-10')).toBe(false);
  });

  it('semanal vence só no dia da semana certo', () => {

    expect(estaNoVencimento('semanal', 3, null, '2027-03-10')).toBe(true);
    expect(estaNoVencimento('semanal', 1, null, '2027-03-10')).toBe(false);
  });

  it('personalizada nunca vence pelo cron (fica fora do escopo determinístico)', () => {
    expect(estaNoVencimento('personalizada', null, null, '2027-03-10')).toBe(false);
  });
});
