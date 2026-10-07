import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';






const RAIZ = path.resolve(__dirname, '../..');
const shell = readFileSync(path.join(RAIZ, 'src/components/layout/AppShell.jsx'), 'utf8');
const busca = readFileSync(path.join(RAIZ, 'src/components/ui/command-search.tsx'), 'utf8');
const mega = readFileSync(path.join(RAIZ, 'src/components/ui/mega-menu.tsx'), 'utf8');

describe('menu Planejamento', () => {
  it('Acompanhamento de Rotinas está no menu e na busca', () => {
    expect(shell).toContain("path: '/rotinas'");
    expect(busca).toContain("path: '/rotinas'");
  });

  it('as colunas do Planejamento não passam de 4 itens (7 numa só cortava o menu)', () => {
    const bloco = shell.slice(shell.indexOf("label: 'Planejamento',\n    subMenus"), shell.indexOf("label: 'Ministerial'"));
    const colunas = bloco.split(/title: '/).slice(1);
    expect(colunas.length).toBeGreaterThanOrEqual(3);
    colunas.forEach((c) => expect((c.match(/\{ label: /g) || []).length).toBeLessThanOrEqual(4));
  });

  it('o dropdown rola em vez de passar da altura da tela', () => {
    expect(mega).toMatch(/max-h-\[calc\(100vh-[\d.]+rem\)\][^"]*overflow-y-auto/);
  });
});
