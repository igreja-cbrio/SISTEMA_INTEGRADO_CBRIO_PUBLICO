import { describe, it, expect, vi, afterEach } from 'vitest';
import { escapeHtml, celulaCsv, montarCsv, montarHtmlPdf, exportPDF, dateStr } from '@/lib/export';

afterEach(() => { vi.restoreAllMocks(); });

describe('exportPDF · nada do banco vira HTML', () => {
  const ataque = '<img src=x onerror=alert(1)>';

  it('célula, título, cabeçalho, subtítulo e rodapé são escapados', () => {
    const html = montarHtmlPdf(ataque, [ataque], [[ataque, 'ok']], { subtitle: ataque, footer: ataque, geradoEm: 'agora' });
    expect(html).not.toContain('<img');
    expect(html.match(/&lt;img src=x onerror=alert\(1\)&gt;/g)).toHaveLength(6);
  });
  it('aspas e & também', () => {
    expect(escapeHtml(`a"b'c&d`)).toBe('a&quot;b&#39;c&amp;d');
  });
  it('vazio vira travessão, como antes', () => {
    const html = montarHtmlPdf('T', ['A'], [[null], [undefined], ['']], { geradoEm: 'agora' });
    expect(html.match(/<td>—<\/td>/g)).toHaveLength(2);
    expect(html).toContain('<td></td>');
  });
  it('pop-up bloqueado não derruba a tela', () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(exportPDF('T', ['A'], [['x']])).toBe(false);
  });
});

describe('exportCSV · célula não vira fórmula no Excel', () => {
  it('= + - @ tab e CR no começo ganham apóstrofo', () => {
    for (const v of ['=HYPERLINK("x")', '+5521999', '-cmd', '@SOMA(A1)', '\tx', '\rx']) {
      expect(celulaCsv(v).startsWith(`"'`)).toBe(true);
    }
  });
  it('número puro continua número (inclusive negativo e com vírgula)', () => {
    expect(celulaCsv(-12.5)).toBe('-12.5');
    expect(celulaCsv('-12.50')).toBe('"-12.50"');
    expect(celulaCsv('1234,56')).toBe('"1234,56"');
    expect(celulaCsv(Number.NaN)).toBe('');
  });
  it('aspas dobradas e vazio', () => {
    expect(celulaCsv('a"b')).toBe('"a""b"');
    expect(celulaCsv(null)).toBe('""');
  });
  it('monta linhas com cabeçalho', () => {
    expect(montarCsv(['Nome', 'Valor'], [['=1+1', 10]])).toBe(`"Nome","Valor"\n"'=1+1",10`);
  });
});

describe('data do nome do arquivo é BRT', () => {
  it('22h de 02/10 em Brasília (01h UTC de 03/10) continua 02/10', () => {
    expect(dateStr(new Date('2026-10-03T01:00:00Z'))).toBe('2026-10-02');
  });
});
