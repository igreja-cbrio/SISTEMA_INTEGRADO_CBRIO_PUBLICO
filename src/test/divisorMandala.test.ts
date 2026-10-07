import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require_ = createRequire(import.meta.url);
const {
  ehDomingo,
  domingosNoMes,
  divisorDomingos,
} = require_('../../backend/utils/divisorMandala.js');




const JANEIRO_2026 = [
  '2026-01-01', '2026-01-04', '2026-01-07', '2026-01-11',
  '2026-01-14', '2026-01-18', '2026-01-21', '2026-01-25', '2026-01-28',
].map((data) => ({ data }));

describe('divisor da média de frequência · por DOMINGO', () => {
  it('reconhece domingo pela data ISO', () => {
    expect(ehDomingo('2026-01-04')).toBe(true);
    expect(ehDomingo('2026-01-01')).toBe(false);
    expect(ehDomingo('2026-01-03')).toBe(false);
  });







  it('a leitura do dia da semana é em UTC, mesmo com a máquina em BRT', () => {
    const tzOriginal = process.env.TZ;
    try {
      process.env.TZ = 'America/Sao_Paulo';


      expect(new Date('2026-01-04T00:00:00Z').getTimezoneOffset()).toBe(180);
      expect(new Date('2026-01-04T00:00:00Z').getDay()).toBe(6);

      expect(ehDomingo('2026-01-04')).toBe(true);
      expect(domingosNoMes(2026, 1)).toBe(4);
      expect(divisorDomingos(JANEIRO_2026, { ano: 2026, mes: 1 })).toBe(4);
    } finally {
      if (tzOriginal === undefined) delete process.env.TZ;
      else process.env.TZ = tzOriginal;
    }
  });

  it('entrada inválida não vira domingo', () => {
    expect(ehDomingo(null as unknown as string)).toBe(false);
    expect(ehDomingo('')).toBe(false);
    expect(ehDomingo('04/01/2026')).toBe(false);
    expect(ehDomingo('2026-13-45')).toBe(false);
  });

  it('conta os domingos do calendário', () => {
    expect(domingosNoMes(2026, 1)).toBe(4);
    expect(domingosNoMes(2026, 3)).toBe(5);
    expect(domingosNoMes(2026, 8)).toBe(5);
    expect(domingosNoMes(2024, 2)).toBe(4);
  });

  it('mês inválido não explode', () => {
    expect(domingosNoMes(2026, 0)).toBe(0);
    expect(domingosNoMes(2026, 13)).toBe(0);
    expect(domingosNoMes(null as unknown as number, null as unknown as number)).toBe(0);
  });




  it('janeiro/2026 divide por 4 domingos, não por 5 semanas', () => {
    expect(divisorDomingos(JANEIRO_2026, { ano: 2026, mes: 1 })).toBe(4);
  });

  it('média de janeiro/2026 bate com o número medido em produção', () => {
    const presencialTotal = 9046;
    const divisor = divisorDomingos(JANEIRO_2026, { ano: 2026, mes: 1 });
    expect(Math.round(presencialTotal / divisor)).toBe(2262);
  });

  it('conta domingo DISTINTO, não linha de culto (são 4 cultos por domingo)', () => {
    const quatroCultosNoMesmoDomingo = [
      { data: '2026-03-01' }, { data: '2026-03-01' },
      { data: '2026-03-01' }, { data: '2026-03-01' },
      { data: '2026-03-08' },
    ];
    expect(divisorDomingos(quatroCultosNoMesmoDomingo, { ano: 2026, mes: 3 })).toBe(2);
  });

  it('mês sem culto nenhum cai no calendário', () => {
    expect(divisorDomingos([], { ano: 2026, mes: 3 })).toBe(5);
    expect(divisorDomingos(null as unknown as [], { ano: 2026, mes: 1 })).toBe(4);
  });


  it('nunca devolve 0, nem sem culto e sem mês de referência', () => {
    expect(divisorDomingos([], {} as { ano: number; mes: number })).toBe(1);
    expect(divisorDomingos([{ data: '2026-01-07' }], {} as { ano: number; mes: number })).toBe(1);
  });

  it('mês só com culto de quarta cai no calendário em vez de dividir por zero', () => {
    const soQuartas = [{ data: '2026-01-07' }, { data: '2026-01-14' }];
    expect(divisorDomingos(soQuartas, { ano: 2026, mes: 1 })).toBe(4);
  });

  it('aceita data com hora e string solta', () => {
    expect(divisorDomingos(['2026-03-01', '2026-03-08T00:00:00Z'], { ano: 2026, mes: 3 })).toBe(2);
  });


  it('mês com 5 domingos e 5 semanas mantém o mesmo divisor', () => {
    const marco = ['2026-03-01', '2026-03-04', '2026-03-08', '2026-03-11', '2026-03-15',
      '2026-03-18', '2026-03-22', '2026-03-25', '2026-03-29'].map((data) => ({ data }));
    expect(divisorDomingos(marco, { ano: 2026, mes: 3 })).toBe(5);
  });
});
