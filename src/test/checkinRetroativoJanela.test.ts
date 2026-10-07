















import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const FONTE = readFileSync(join(__dirname, '..', '..', 'backend/routes/voluntariado.js'), 'utf8');


const i = FONTE.indexOf("router.post('/check-ins'");
const resto = FONTE.slice(i + 10);
const fim = resto.search(/\nrouter\.(get|post|patch|put|delete)\(/);
const trecho = fim === -1 ? resto : resto.slice(0, fim);

describe('⚠️⚠️ check-in retroativo alcança o mês anterior', () => {
  it('a janela é de 60 dias, não de 7', () => {
    expect(trecho).toMatch(/JANELA_RETROATIVA_MS\s*=\s*60\s*\*\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/);
    expect(
      trecho.replace(/\/\/[^\n]*/g, ''),
      'com 7 dias o mês anterior inteiro caía no dia de hoje',
    ).not.toMatch(/ms >= now - 7 \* 24/);
  });

  it('⚠️ e o descarte deixou de ser silencioso', () => {
    expect(trecho).toMatch(/dataAjustada = true/);
    expect(trecho, 'sem isto, quem lança na mão não descobre que a data virou hoje')
      .toMatch(/data_ajustada: dataAjustada/);
  });

  it('⚠️ data futura continua recusada (tolerando o skew de 5 min do totem)', () => {
    expect(trecho).toMatch(/ms <= now \+ 5 \* 60 \* 1000/);
  });

  it('⚠️ e continua FALLBACK, não 400 — o totem offline manda data antiga de propósito', () => {
    const janela = trecho.slice(trecho.indexOf('JANELA_RETROATIVA_MS'), trecho.indexOf('JANELA_RETROATIVA_MS') + 900);
    expect(janela, 'derrubar o totem seria trocar um silêncio por uma quebra').not.toMatch(/res\.status\(400\)/);
  });
});






















describe('⚠️⚠️ o seletor de culto alcança o mês anterior', () => {
  const HOOK = readFileSync(
    join(__dirname, '..', 'pages/ministerial/voluntariado/hooks/useVolServices.ts'), 'utf8',
  );

  it('pede uma janela para trás que cobre o mês anterior', () => {
    const m = HOOK.match(/checkinWindow\((\d+),\s*(\d+)\)/);
    expect(m, 'checkinWindow sumiu do hook').not.toBeNull();
    expect(
      Number(m![1]),
      'com 21 dias o culto do mês passado não aparecia no seletor — não havia o que marcar',
    ).toBeGreaterThanOrEqual(60);
  });

  it('⚠️ e não estoura o teto da rota, que capa em 120 dias', () => {
    const m = HOOK.match(/checkinWindow\((\d+),\s*(\d+)\)/);
    expect(Number(m![1])).toBeLessThanOrEqual(120);
    expect(Number(m![2])).toBeLessThanOrEqual(120);
  });
});
