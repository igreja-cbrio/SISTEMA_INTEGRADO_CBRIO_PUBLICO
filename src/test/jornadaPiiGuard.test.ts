import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';





















const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');




function semComentarios(src: string) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/(^|[^:'"`\\])\/\/[^\n]*$/, '$1'))
    .join('\n');
}

const src = semComentarios(readFileSync(path.join(RAIZ, 'backend/routes/jornada.js'), 'utf8'));



const ROTAS_COM_PII: Array<[string, string]> = [
  ["router.get('/membros'", 'lista de membros com nome/e-mail/telefone'],
  ["router.get('/membro/:id'", 'ficha de uma pessoa'],
  ["router.post('/cruzar'", 'cruzamento — até 500 pessoas por chamada, com batismo e conversão'],
  ["router.post('/refresh-papeis'", 'refresh da matview de pessoas'],
];

describe('⚠️⚠️ jornada · rota que devolve PESSOA exige módulo, não só login', () => {
  for (const [decl, oQueVaza] of ROTAS_COM_PII) {
    it(`${decl} está guardada (${oQueVaza})`, () => {
      const i = src.indexOf(decl);
      expect(i, `${decl} não existe mais — se a rota foi renomeada, atualizar ESTE teste`).toBeGreaterThan(-1);




      const declaracao = src.slice(i, i + 200);
      expect(declaracao, `${decl} está SEM guard de módulo`).toMatch(/soQuemCuidaDeGente|authorizeModule/);
    });
  }

  it('o guard usa a routeKey ESTREITA `membresia`, não a ampla `membros`', () => {



    expect(src).toContain("authorizeModule('membresia', 2)");
    expect(src).not.toContain("authorizeModule('membros'");
  });

  it('⚠️ a routeKey do guard EXISTE no ROUTE_MODULE_MAP', () => {







    const auth = readFileSync(path.join(RAIZ, 'backend/middleware/auth.js'), 'utf8');
    const bloco = auth.match(/const\s+ROUTE_MODULE_MAP\s*=\s*\{([\s\S]*?)\n\};/);
    expect(bloco, 'ROUTE_MODULE_MAP não encontrado — a forma mudou').toBeTruthy();
    expect(semComentarios(bloco![1])).toMatch(/['"]membresia['"]\s*:/);
  });

  it('`/dashboard` e `/visao` seguem ABERTAS — são agregados do /painel', () => {


    for (const decl of ["router.get('/dashboard'", "router.get('/visao'"]) {
      const i = src.indexOf(decl);
      expect(i).toBeGreaterThan(-1);
      expect(src.slice(i, i + 200)).not.toMatch(/soQuemCuidaDeGente|authorizeModule/);
    }
  });

  it('o cron continua fora do authenticate (Vercel chama sem login)', () => {
    expect(src).toMatch(/router\.get\('\/cron\/refresh-papeis',\s*autorizaCron/);
    expect(src.indexOf("router.get('/cron/refresh-papeis'"))
      .toBeLessThan(src.indexOf('router.use(authenticate)'));
  });
});

describe('a tela espelha o servidor, e está no menu', () => {
  const tela = readFileSync(path.join(RAIZ, 'src/pages/admin/CruzamentosPessoas.jsx'), 'utf8');
  const shell = readFileSync(path.join(RAIZ, 'src/components/layout/AppShell.jsx'), 'utf8');
  const busca = readFileSync(path.join(RAIZ, 'src/components/ui/command-search.tsx'), 'utf8');

  it('a tela usa canAccessModule, não profile.role', () => {
    expect(tela).toContain("canAccessModule(['membresia'], 'leitura', 2)");
    expect(tela).not.toMatch(/\['admin',\s*'diretor'\]\.includes\(profile\?\.role\)/);
  });

  it('⚠️ está no mega-menu — tela fora do menu é tela invisível', () => {



    expect(shell).toContain("path: '/admin/cruzamentos'");
    expect(shell).toMatch(/path: '\/admin\/cruzamentos', module: 'membresia'/);
  });

  it('está também na busca ⌘K — as duas listas são espelhos', () => {
    expect(busca).toContain("path: '/admin/cruzamentos'");
    expect(busca).toContain("module: 'membresia'");
  });

  it('⚠️ "Jornada da Igreja" também é gated — ela lista pessoas', () => {
    expect(shell).toMatch(/path: '\/jornada', module: 'membresia'/);
  });
});
