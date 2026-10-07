




























import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, statSync, readFileSync } from 'node:fs';
import path from 'node:path';

const raiz = path.resolve(__dirname, '../..');
const temDepsBackend = existsSync(path.join(raiz, 'backend/node_modules/express'));

function jsDoBackend(dir: string, acc: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    if (nome === 'node_modules' || nome.startsWith('.')) continue;
    const p = path.join(dir, nome);
    if (statSync(p).isDirectory()) jsDoBackend(p, acc);
    else if (nome.endsWith('.js') || nome.endsWith('.cjs')) acc.push(p);
  }
  return acc;
}

describe('o backend é sintaticamente válido (guarda de FUNCTION_INVOCATION_FAILED)', () => {
  it('api/index.js e backend/server.js existem', () => {
    expect(existsSync(path.join(raiz, 'api/index.js'))).toBe(true);
    expect(existsSync(path.join(raiz, 'backend/server.js'))).toBe(true);
  });

  it('⚠️⚠️ TODO .js do backend é sintaticamente válido', () => {







    const arquivos = jsDoBackend(path.join(raiz, 'backend'));
    expect(arquivos.length).toBeGreaterThan(300);

    const quebrados: string[] = [];
    for (const f of arquivos) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        new (require('node:vm').Script)(




          (require('node:module') as any).wrap(
            readFileSync(f, 'utf8').replace(/^#![^\n]*/, ''),
          ),
          { filename: f },
        );
      } catch (e: any) {
        quebrados.push(`${path.relative(raiz, f)} · ${String(e?.message).split('\n')[0]}`);
      }
    }
    expect(quebrados, `sintaxe quebrada:\n${quebrados.join('\n')}`).toEqual([]);
  }, 60_000);
});

describe.skipIf(!temDepsBackend)('o backend CARREGA de verdade', () => {
  it('⚠️ carrega pelo mesmo caminho da Vercel (pega ReferenceError, não só sintaxe)', () => {





    let saida = '';
    try {
      saida = execFileSync(process.execPath, [
        '-e',
        `process.env.PORT='0';
         try { require(${JSON.stringify(path.join(raiz, 'backend/server.js'))}); console.log('CARREGOU_OK'); }
         catch (e) { console.log('CARREGOU_FALHOU:' + e.name + ': ' + e.message); }
         process.exit(0);`,
      ], { cwd: raiz, encoding: 'utf8', timeout: 60_000, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e: any) {
      saida = String(e?.stdout || '') + String(e?.stderr || '');
    }


    expect(saida, `o backend não carregou · saída:\n${saida}`).toContain('CARREGOU_OK');
    expect(saida).not.toContain('CARREGOU_FALHOU');





  }, 90_000);
});
