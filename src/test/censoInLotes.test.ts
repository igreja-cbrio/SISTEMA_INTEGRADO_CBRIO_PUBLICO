




import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(process.cwd(), 'backend', 'routes', 'censo.js'), 'utf8')
  .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

describe('censo · .in() sempre em lotes', () => {
  it('nenhum .in(\'id\', …) recebe a lista inteira', () => {
    const chamadas = [...src.matchAll(/\.in\('id',\s*([^)]*\)?)/g)].map((m) => m[1].trim());
    expect(chamadas.length).toBeGreaterThan(0);
    const soltas = chamadas.filter((arg) => !/\.slice\(\s*\w+\s*,\s*\w+\s*\+\s*200\s*\)/.test(arg) && !/^lote\b/.test(arg));
    expect(soltas).toEqual([]);
  });
});
