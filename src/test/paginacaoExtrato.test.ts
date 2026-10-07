import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { avaliarPagina, chaveItem, dentroDaJanela } = require('../../backend/utils/paginacaoExtrato.js');

const DIA = '2026-08-31';
const item = (i: number, data = '31/08/2026') => ({ transactionId: `t${i}`, transactionDate: data, amount: 10 });
const pagina = (n: number, data?: string) => Array.from({ length: n }, (_, i) => item(i, data));

describe('avaliarPagina · quando parar de paginar o extrato', () => {
  it('página PARCIAL encerra o lote — o caminho de todo sucesso histórico', () => {
    const r = avaliarPagina({ itens: pagina(12), vistos: new Set(), limite: 50, inicio: DIA, fim: DIA });
    expect(r.encerrar).toBe(true);
    expect(r.travou).toBe(false);
    expect(r.novosNaJanela).toBe(12);
  });

  it('página vazia encerra e NÃO é travamento', () => {
    const r = avaliarPagina({ itens: [], vistos: new Set(), limite: 50, inicio: DIA, fim: DIA });
    expect(r.encerrar).toBe(true);
    expect(r.travou).toBe(false);
  });

  it('página CHEIA com itens novos continua', () => {
    const r = avaliarPagina({ itens: pagina(50), vistos: new Set(), limite: 50, inicio: DIA, fim: DIA });
    expect(r.encerrar).toBe(false);
    expect(r.travou).toBe(false);
  });



  it('página CHEIA repetida = travou, e o motivo NOMEIA o `_offset`', () => {
    const vistos = new Set();
    const p = pagina(50);
    expect(avaliarPagina({ itens: p, vistos, limite: 50, inicio: DIA, fim: DIA }).travou).toBe(false);
    const r2 = avaliarPagina({ itens: p, vistos, limite: 50, inicio: DIA, fim: DIA });
    expect(r2.travou).toBe(true);
    expect(r2.novosNaJanela).toBe(0);
    expect(r2.motivo).toContain('_offset');
  });





  it('página cheia SÓ com itens fora da janela = travou', () => {
    const r = avaliarPagina({
      itens: pagina(50, '02/01/2026'), vistos: new Set(), limite: 50, inicio: DIA, fim: DIA,
    });
    expect(r.travou).toBe(true);
    expect(r.novosNaJanela).toBe(0);
  });

  it('um único item novo NA JANELA já é progresso', () => {
    const vistos = new Set();
    const p = pagina(50);
    avaliarPagina({ itens: p, vistos, limite: 50, inicio: DIA, fim: DIA });
    const r = avaliarPagina({ itens: [...p.slice(1), item(999)], vistos, limite: 50, inicio: DIA, fim: DIA });
    expect(r.travou).toBe(false);
    expect(r.novosNaJanela).toBe(1);
  });



  it('item SEM transactionId é deduplicado pelo conteúdo, não tratado como novo', () => {
    const sem = Array.from({ length: 50 }, (_, i) => ({ transactionDate: '31/08/2026', amount: i }));
    const vistos = new Set();
    expect(avaliarPagina({ itens: sem, vistos, limite: 50, inicio: DIA, fim: DIA }).travou).toBe(false);
    expect(avaliarPagina({ itens: sem, vistos, limite: 50, inicio: DIA, fim: DIA }).travou).toBe(true);
  });

  it('itens sem id mas DIFERENTES continuam sendo novos', () => {
    const vistos = new Set();
    const a = Array.from({ length: 50 }, (_, i) => ({ transactionDate: '31/08/2026', amount: i }));
    const b = Array.from({ length: 50 }, (_, i) => ({ transactionDate: '31/08/2026', amount: 100 + i }));
    avaliarPagina({ itens: a, vistos, limite: 50, inicio: DIA, fim: DIA });
    expect(avaliarPagina({ itens: b, vistos, limite: 50, inicio: DIA, fim: DIA }).travou).toBe(false);
  });



  it('data ilegível conta como dentro da janela', () => {
    expect(dentroDaJanela({ transactionDate: 'xx/yy/zzzz' }, DIA, DIA)).toBe(true);
    expect(dentroDaJanela({}, DIA, DIA)).toBe(true);
  });

  it('a janela aceita intervalo, não só um dia', () => {
    expect(dentroDaJanela({ transactionDate: '30/08/2026' }, '2026-08-29', '2026-08-31')).toBe(true);
    expect(dentroDaJanela({ transactionDate: '28/08/2026' }, '2026-08-29', '2026-08-31')).toBe(false);
  });

  it('chaveItem prefere o id e cai no conteúdo quando não há', () => {
    expect(chaveItem({ transactionId: 'abc' })).toBe('id:abc');
    expect(chaveItem({ transactionId: '  ' })).toContain('raw:');
    expect(chaveItem({ a: 1 })).toBe(chaveItem({ a: 1 }));
    expect(chaveItem({ a: 1 })).not.toBe(chaveItem({ a: 2 }));
  });
});










describe('a régua não arrasta dependência de backend/', () => {
  const src = readFileSync('backend/utils/paginacaoExtrato.js', 'utf8')
    .split('\n').map((l) => l.replace(/(^|[^:])\/\/[^\n]*/, '$1')).join('\n');

  it('não importa nada de services/', () => {
    expect(src).not.toMatch(/require\(['"][^'"]*services\//);
  });

  it('a data vem do módulo puro utils/dataBr', () => {
    expect(src).toContain("require('./dataBr')");
  });
});

describe('o laço NUNCA filtra o que importa', () => {
  const src = readFileSync('backend/services/santander/contasService.js', 'utf8')
    .split('\n').map((l) => l.replace(/(^|[^:])\/\/[^\n]*/, '$1')).join('\n');

  it('empilha a PÁGINA INTEIRA no content, nunca só os novos', () => {
    expect(src).toContain('content.push(...pageContent)');
    expect(src).not.toContain('content.push(...novos)');
  });

  it('a quarentena por dia é OPT-IN (default false)', () => {
    expect(src).toContain('tolerarDiaIncompleto = false');
    expect(src).toContain('if (!tolerarDiaIncompleto) throw e;');
  });
});
