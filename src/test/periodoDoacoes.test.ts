import { describe, it, expect } from 'vitest';
import {
  LIMITE_PADRAO, parsePeriodoDoacoes, parseLimite, coberturaAtribuicao, diaSeguinte,
} from '../../backend/utils/periodoDoacoes.js';

const AGORA = new Date('2026-08-26T18:00:00Z');

describe('periodoDoacoes · o filtro do ranking de contribuintes', () => {
  it('"ano" é 1º de janeiro até HOJE', () => {
    const r = parsePeriodoDoacoes('ano', AGORA);
    expect(r.desde).toBe('2026-01-01');
    expect(r.ate).toBe('2026-08-27');
  });

  it('⚠️ o fim do intervalo é EXCLUSIVO, senão o último dia se perde', () => {


    const r = parsePeriodoDoacoes('2026-01-01:2026-08-26', AGORA);
    expect(r.ate).toBe('2026-08-27');
    expect(diaSeguinte('2026-08-26')).toBe('2026-08-27');
  });

  it('vira o mês e o ano no fim do intervalo', () => {
    expect(diaSeguinte('2026-01-31')).toBe('2026-02-01');
    expect(diaSeguinte('2026-12-31')).toBe('2027-01-01');
    expect(diaSeguinte('2028-02-29')).toBe('2028-03-01');
  });

  it('intervalo invertido é corrigido, não recusado', () => {
    const r = parsePeriodoDoacoes('2026-08-26:2026-01-01', AGORA);
    expect(r.desde).toBe('2026-01-01');
    expect(r.ate).toBe('2026-08-27');
  });

  it('mês específico continua funcionando como antes', () => {
    const r = parsePeriodoDoacoes('2026-03', AGORA);
    expect(r).toMatchObject({ desde: '2026-03-01', ate: '2026-04-01', rotulo: 'mes' });
  });

  it('"tudo" não corta nada', () => {
    expect(parsePeriodoDoacoes('tudo', AGORA)).toMatchObject({ desde: null, ate: null });
  });

  it('lixo cai em 12 meses, nunca em intervalo quebrado', () => {
    for (const v of ['', 'lixo', '2026-13', '2026-01-01:', ':2026-01-01', '2026-1-1:2026-2-2', null as any]) {
      const r = parsePeriodoDoacoes(v, AGORA);
      expect(r.periodo).toBe('12m');
      expect(r.desde).toBe('2025-08-26');
    }
  });

  it('o limite é 20 por padrão, aceita 30 e tem teto', () => {
    expect(parseLimite(undefined)).toBe(LIMITE_PADRAO);
    expect(parseLimite('30')).toBe(30);
    expect(parseLimite('999')).toBe(100);
    for (const v of ['0', '-5', 'abc', '']) expect(parseLimite(v)).toBe(LIMITE_PADRAO);
  });

  it('⚠️ declara a FRAÇÃO do valor com doador identificado', () => {

    const c = coberturaAtribuicao({ total_periodo: 15932751, total_atribuido: 5146278, linhas_por_cpf: 0, linhas_por_nome: 11038 });
    expect(c.pct_valor_atribuido).toBe(32.3);
    expect(c.incompleto).toBe(true);
    expect(c.linhas_por_nome).toBe(11038);
  });

  it('tudo identificado não é incompleto', () => {
    expect(coberturaAtribuicao({ total_periodo: 100, total_atribuido: 100 }).incompleto).toBe(false);
  });

  it('período sem doação não afirma nada (nunca vira 0%)', () => {
    const c = coberturaAtribuicao({ total_periodo: 0, total_atribuido: 0 });
    expect(c.pct_valor_atribuido).toBeNull();
    expect(c.incompleto).toBe(false);
    expect(coberturaAtribuicao(undefined).pct_valor_atribuido).toBeNull();
  });

  it('atribuído maior que o total (arredondamento) fica em 100%', () => {
    expect(coberturaAtribuicao({ total_periodo: 10, total_atribuido: 10.004 }).pct_valor_atribuido).toBe(100);
  });

  it('⚠️ "hoje" é o dia da IGREJA, não o UTC', () => {

    const r = parsePeriodoDoacoes('ano', new Date('2026-08-27T02:00:00Z'));
    expect(r.ate).toBe('2026-08-27');
  });
});
