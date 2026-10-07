import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

















const raiz = (p: string) => resolve(__dirname, '../../', p);







function semComentarios(js: string): string {
  return js
    .split('\n')
    .map((l) => l.replace(/\/\*.*?\*\//g, ''))
    .map((l) => l.replace(/(^|[^:])\/\/[^\n]*/, '$1'))
    .join('\n');
}

function linhaDaRota(src: string, metodo: string, caminho: string): string | undefined {
  return src.split('\n').find((l) => l.includes(`router.${metodo}('${caminho}'`));
}

const ESCRITA: Array<{ arquivo: string; guarda: string; rotas: Array<[string, string]> }> = [
  {
    arquivo: 'backend/routes/events.js',
    guarda: 'escritaEventos',
    rotas: [
      ['patch', '/:id/status'], ['patch', '/:id/occurrences/:occId'],
      ['post', '/:id/tasks'], ['put', '/tasks/:taskId'], ['patch', '/tasks/:taskId/status'],
      ['post', '/tasks/:taskId/subtasks'], ['patch', '/subtasks/:subId'], ['delete', '/subtasks/:subId'],
      ['post', '/tasks/:taskId/comments'], ['post', '/:id/risks'], ['patch', '/risks/:riskId'],
      ['post', '/:id/retrospective'], ['post', '/:eventId/tasks/:taskId/attachments'],
    ],
  },
  {
    arquivo: 'backend/routes/projects.js',
    guarda: 'escritaProjetos',
    rotas: [
      ['patch', '/tasks/:taskId/status'], ['post', '/tasks/:taskId/subtasks'],
      ['patch', '/subtasks/:subId'], ['post', '/tasks/:taskId/comments'],
      ['patch', '/milestones/:mId/status'], ['patch', '/kpis/:kpiId'],
      ['patch', '/risks/:riskId'], ['patch', '/budget/:itemId'],
    ],
  },
];

describe('lote 1 · rotas de escrita que precisam de gate', () => {
  for (const grupo of ESCRITA) {
    const bruto = readFileSync(raiz(grupo.arquivo), 'utf8');
    const limpo = semComentarios(bruto);

    it(`${grupo.arquivo} · o limpador de comentários não destrói o arquivo`, () => {
      expect(limpo.length).toBeGreaterThan(bruto.length * 0.5);
      expect(limpo).toContain(`const ${grupo.guarda} = authorizeModule(`);
    });

    for (const [metodo, caminho] of grupo.rotas) {
      it(`${grupo.arquivo} · ${metodo.toUpperCase()} ${caminho} exige ${grupo.guarda}`, () => {
        const linha = linhaDaRota(limpo, metodo, caminho);
        expect(linha, `rota ${metodo.toUpperCase()} ${caminho} sumiu de ${grupo.arquivo}`).toBeTruthy();
        expect(linha, `${metodo.toUpperCase()} ${caminho} ficou SEM gate de escrita`).toContain(grupo.guarda);
      });
    }
  }

  it('kpisV2 · PUT e DELETE /registros/:id checam a área do KPI, igual ao POST', () => {


    const limpo = semComentarios(readFileSync(raiz('backend/routes/kpisV2.js'), 'utf8'));
    for (const [metodo, caminho] of [['put', '/registros/:id'], ['delete', '/registros/:id']] as const) {
      const linha = linhaDaRota(limpo, metodo, caminho);
      expect(linha, `rota ${metodo.toUpperCase()} ${caminho} sumiu`).toBeTruthy();
      expect(linha, `${metodo.toUpperCase()} ${caminho} sem checagem de área`).toContain('authorizeKpiArea');
    }
  });

  it('permissoes.js · o gate do router é a MATRIZ, não o nível de cargo', () => {



    const limpo = semComentarios(readFileSync(raiz('backend/routes/permissoes.js'), 'utf8'));
    expect(limpo).toContain("router.use(authenticate, authorizeModule('permissoes', 4))");
    expect(limpo).not.toMatch(/router\.use\([^)]*authorize\(\s*'admin'/);
  });

  it('permissoes.js · as 3 portas laterais de auto-escalação estão fechadas', () => {
    const limpo = semComentarios(readFileSync(raiz('backend/routes/permissoes.js'), 'utf8'));




    const trechoDelete = limpo.slice(limpo.indexOf("router.delete('/usuario/:id/modulo/:moduloId'"));
    expect(trechoDelete.slice(0, 900)).toContain('bloqueiaAutoEdicao');
    const trechoMatriz = limpo.slice(limpo.indexOf("router.put('/matriz/celula'"));
    expect(trechoMatriz.slice(0, 1600)).toContain('podeMexerNoControleDeAcesso');
    expect(trechoMatriz.slice(0, 1600)).toMatch(/cargoId/);
  });

  it('permissoes.js · o bloqueio do próprio cargo tem escape para o time de sistemas', () => {



    const limpo = semComentarios(readFileSync(raiz('backend/routes/permissoes.js'), 'utf8'));
    const trecho = limpo.slice(limpo.indexOf("router.put('/matriz/celula'"));
    expect(trecho.slice(0, 1600)).toMatch(/!\(await ehDev\(req\)\)/);
  });

  it('permissoes.js · conceder o próprio módulo de permissões exige a régua forte', () => {


    const limpo = semComentarios(readFileSync(raiz('backend/routes/permissoes.js'), 'utf8'));
    const trecho = limpo.slice(limpo.indexOf("router.put('/usuario/:id/modulo'"));
    expect(trecho.slice(0, 2000)).toContain("permissoes-admin");
    expect(trecho.slice(0, 2000)).toContain('podeMexerNoControleDeAcesso');
  });

  it('permissoes.js · toda rota mutante deixa trilha em app_audit_log', () => {
    const limpo = semComentarios(readFileSync(raiz('backend/routes/permissoes.js'), 'utf8'));



    expect(limpo).toContain('app_audit_log');
    const mutantes = limpo
      .split('\n')
      .filter((l) => /^router\.(post|put|patch|delete)\(/.test(l))
      .length;
    const auditorias = (limpo.match(/auditarAcesso\(/g) || []).length;
    expect(auditorias, `${mutantes} rotas mutantes e só ${auditorias} chamadas de auditoria`).toBeGreaterThanOrEqual(8);
  });
});
