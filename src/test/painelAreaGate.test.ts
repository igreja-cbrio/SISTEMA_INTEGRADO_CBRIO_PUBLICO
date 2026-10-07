















import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const raiz = resolve(__dirname, '../..');
const app = readFileSync(resolve(raiz, 'src/App.tsx'), 'utf8');
const shell = readFileSync(resolve(raiz, 'src/components/layout/AppShell.jsx'), 'utf8');




function semComentarios(src: string) {







  return src
    .split('\n')
    .map((l) => l.replace(/\/\*.*?\*\//g, ' '))
    .map((l) => l.replace(/(^|[^:])\/\/[^\n]*$/, '$1'))
    .join('\n');
}

const APP = semComentarios(app);
const SHELL = semComentarios(shell);


const PAINEIS: Array<[string, string]> = [
  ['/online', 'online'],
  ['/kids', 'kids'],
  ['/ami', 'ami'],
  ['/bridge', 'bridge'],
];

describe('painéis de área · rota', () => {
  for (const [path, slug] of PAINEIS) {
    it(`${path} é gateado por moduleSlug="${slug}"`, () => {
      const re = new RegExp(`<Route path="${path}" element=\\{<ModuleGuard moduleSlug="${slug}"`);
      expect(APP).toMatch(re);
    });

    it(`${path} NÃO é gateado por permKey (permissão de outro módulo)`, () => {
      const linha = APP.split('\n').find((l) => l.includes(`path="${path}"`)) || '';
      expect(linha).not.toMatch(/permKey=/);
    });
  }
});

describe('painéis de área · item de menu', () => {
  for (const [path, slug] of PAINEIS) {
    const linha = SHELL.split('\n').find((l) => l.includes(`path: '${path}'`)) || '';

    it(`o item ${path} existe no menu`, () => {
      expect(linha).not.toBe('');
    });

    it(`o item ${path} declara module: '${slug}'`, () => {
      expect(linha).toContain(`module: '${slug}'`);
    });

    it(`⚠️ o item ${path} não é escondido por canMembresia`, () => {


      expect(linha).not.toContain("perm: 'canMembresia'");
    });
  }
});













describe('canMembresia só gateia a Membresia', () => {
  const linhasComPerm = SHELL.split('\n').filter((l) => l.includes("perm: 'canMembresia'"));

  it('todo item que usa canMembresia é da própria Membresia', () => {
    const forasteiros = linhasComPerm.filter((l) => !l.includes("path: '/ministerial/membresia"));
    expect(forasteiros).toEqual([]);
  });

  it('os itens de área declaram o próprio módulo', () => {
    for (const [path, slug] of [
      ['/ministerial/voluntariado', 'voluntariado'],
      ['/ministerial/integracao', 'integracao'],
      ['/grupos', 'grupos'],
    ] as Array<[string, string]>) {
      const linha = SHELL.split('\n').find((l) => l.includes(`path: '${path}'`)) || '';
      expect(linha, path).toContain(`module: '${slug}'`);
      expect(linha, path).not.toContain("perm: 'canMembresia'");
    }
  });

  it('⚠️ o VoluntariadoGuard não decide por canMembresia', () => {
    const i = APP.indexOf('function VoluntariadoGuard');
    expect(i).toBeGreaterThan(-1);
    const corpo = APP.slice(i, i + 900);
    expect(corpo).not.toContain('canMembresia');
    expect(corpo).toContain("'voluntariado'");

    expect(corpo).toContain('auth.modulePerms');
  });

  it('as rotas da Membresia SEGUEM em canMembresia (é o módulo delas)', () => {
    const linhas = APP.split('\n').filter((l) => l.includes('path="/ministerial/membresia'));
    expect(linhas.length).toBeGreaterThan(0);
    for (const l of linhas) expect(l).toContain('permKey="canMembresia"');
  });
});
