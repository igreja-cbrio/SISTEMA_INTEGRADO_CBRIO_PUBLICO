

















import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(__dirname, '..', '..', 'supabase/migrations');
const ARQ = readdirSync(DIR).find((f) => f.includes('kpi_nao_mostra_dado_vencido'));
const SQL = ARQ ? readFileSync(join(DIR, ARQ), 'utf8') : '';

describe('⚠️⚠️ a migration do corte de idade existe e está completa', () => {
  it('o arquivo existe', () => {
    expect(ARQ, 'a migration do corte sumiu de supabase/migrations').toBeTruthy();
  });

  it('⚠️ traz a VIEW inteira, não só a função', () => {
    expect(
      SQL,
      'sem a view, rodar as migrations do zero recria o bug — a função sozinha não corta nada',
    ).toMatch(/CREATE OR REPLACE VIEW vw_kpi_trajetoria_atual/);
    expect(SQL).toMatch(/CREATE OR REPLACE FUNCTION public\._kpi_periodo_minimo/);
  });
});

describe('⚠️⚠️ o corte de idade continua na régua', () => {
  it('marca como vencido o período mais antigo que o mínimo', () => {
    expect(SQL).toMatch(/periodo_bruto < _kpi_periodo_minimo\(b\.periodicidade\)\)\s*AS vencido/);
  });

  it('⚠️ e vencido ANULA o valor exibido — senão a tela continua mostrando o número velho', () => {
    expect(SQL).toMatch(/CASE WHEN vencido THEN NULL ELSE valor_bruto\s*END AS ultimo_valor/);
    expect(SQL).toMatch(/CASE WHEN vencido THEN NULL ELSE periodo_bruto END AS ultimo_periodo/);
  });

  it('⚠️ vencido cai em `sem_dado`, não em crítico nem em no_alvo', () => {
    expect(SQL).toMatch(/WHEN vencido OR valor_bruto IS NULL THEN 'sem_dado'/);
    expect(SQL).toMatch(/WHEN vencido OR valor_bruto IS NULL THEN 'pendente'/);
  });

  it('⚠️ o percentual da meta também é anulado — número sobre dado vencido engana igual', () => {
    expect(SQL).toMatch(/CASE WHEN vencido THEN NULL\s*\n?\s*ELSE _kpi_pct_meta/);
  });
});

describe('⚠️ a tolerância é de 1 período — nem zero, nem infinita', () => {
  it('mensal aceita o mês anterior', () => {
    expect(SQL).toMatch(/WHEN 'mensal'\s*THEN to_char\(current_date - interval '1 month'/);
  });

  it('trimestral aceita o trimestre anterior, semestral o semestre', () => {
    expect(SQL).toMatch(/interval '3 months'/);
    expect(SQL).toMatch(/interval '6 months'/);
  });

  it('⚠️ semanal aceita a semana passada — o corrente quase nunca fechou', () => {
    expect(
      SQL,
      'exigir o período CORRENTE apagaria todo mundo: ninguém preenche setembro no dia 1º',
    ).toMatch(/WHEN 'semanal'\s*THEN to_char\(current_date - interval '7 days'/);
  });
});

describe('⚠️⚠️ o valor vencido NÃO é jogado fora', () => {
  it('vira diagnóstico em `*_conhecido` + a bandeira `dado_vencido`', () => {
    expect(SQL).toMatch(/periodo_bruto AS ultimo_periodo_conhecido/);
    expect(SQL).toMatch(/valor_bruto\s+AS ultimo_valor_conhecido/);
    expect(
      SQL,
      'é o que deixa a tela dizer "a coleta parou em julho" em vez de só "sem dado"',
    ).toMatch(/vencido\s+AS dado_vencido/);
  });

  it('⚠️ as colunas novas ficam NO FIM (CREATE OR REPLACE VIEW recusa no meio · 42P16)', () => {




    const corpo = SQL.slice(SQL.indexOf('CREATE OR REPLACE VIEW'));
    const iSentido = corpo.lastIndexOf('sentido_meta,');
    const iNovas = corpo.indexOf('periodo_bruto AS ultimo_periodo_conhecido');
    expect(iSentido, 'sentido_meta sumiu do SELECT final').toBeGreaterThan(0);
    expect(iNovas, 'a coluna de diagnóstico sumiu do SELECT final').toBeGreaterThan(0);
    expect(iNovas).toBeGreaterThan(iSentido);
  });
});
