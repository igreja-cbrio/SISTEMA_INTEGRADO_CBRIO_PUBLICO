import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';


















const ARQ = resolve(__dirname, '../../backend/routes/grupos.js');









function semComentarios(js: string): string {
  return js
    .split('\n')
    .map((l) => l.replace(/\/\*.*?\*\//g, ''))
    .map((l) => l.replace(/(^|[^:])\/\/[^\n]*/, '$1'))
    .join('\n');
}

const ROTAS_COM_GATE: Array<{ metodo: string; caminho: string; nivel: number; porque: string }> = [
  {
    metodo: 'get', caminho: '/pedidos/list', nivel: 1,
    porque: 'devolve nome, e-mail e telefone de quem pediu para entrar em grupo',
  },
  {
    metodo: 'patch', caminho: '/participacao/:id/presenca', nivel: 2,
    porque: 'incrementa `presencas`, o contador que promove visitante → frequentador',
  },
  {
    metodo: 'post', caminho: '/:id/pedidos', nivel: 3,
    porque: 'cria pedido de entrada EM NOME DE OUTRA PESSOA',
  },
];

describe('grupos.js · rotas que precisam de authorizeModule', () => {
  const limpo = semComentarios(readFileSync(ARQ, 'utf8'));



  it('o limpador de comentários não destrói o arquivo', () => {
    expect(limpo).toContain("router.get('/pedidos/list'");
    expect(limpo.length).toBeGreaterThan(readFileSync(ARQ, 'utf8').length * 0.5);
  });

  for (const r of ROTAS_COM_GATE) {
    it(`${r.metodo.toUpperCase()} ${r.caminho} exige grupos >= ${r.nivel} — ${r.porque}`, () => {
      const linha = limpo
        .split('\n')
        .find((l) => l.includes(`router.${r.metodo}('${r.caminho}'`));
      expect(linha, `rota ${r.metodo.toUpperCase()} ${r.caminho} sumiu do arquivo`).toBeTruthy();
      expect(
        linha,
        `${r.metodo.toUpperCase()} ${r.caminho} ficou SEM authorizeModule — ${r.porque}`,
      ).toContain(`authorizeModule('grupos', ${r.nivel})`);
    });
  }

  it('o arquivo continua sem gate global (o gate é por rota — não relaxar)', () => {


    expect(limpo).not.toMatch(/router\.use\(\s*authorizeModule/);
  });
});
