














import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { resolveApiBaseUrl } from '../lib/api-base';

function arquivosDeCodigo(dir: string, acc: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) {
      if (nome === 'node_modules' || nome === 'test') continue;
      arquivosDeCodigo(caminho, acc);
    } else if (/\.(t|j)sx?$/.test(nome)) {
      acc.push(caminho);
    }
  }
  return acc;
}









function semComentarios(src: string) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/(^|[^:"'`])\/\/[^\n]*$/, '$1'))
    .join('\n');
}

describe('base da API', () => {
  it('resolveApiBaseUrl acrescenta /api quando a env não termina nele', () => {
    expect(resolveApiBaseUrl('https://crmcbrio.vercel.app')).toBe('https://crmcbrio.vercel.app/api');
    expect(resolveApiBaseUrl('https://crmcbrio.vercel.app/')).toBe('https://crmcbrio.vercel.app/api');
    expect(resolveApiBaseUrl('https://crmcbrio.vercel.app/api')).toBe('https://crmcbrio.vercel.app/api');
    expect(resolveApiBaseUrl('')).toBe('/api');
    expect(resolveApiBaseUrl(undefined as any)).toBe('/api');
  });

  it('nenhum arquivo de src/ monta a base da API à mão', () => {
    const proibido = /VITE_API_URL\s*(\)|\s)*\|\|/;
    const infratores = arquivosDeCodigo('src')
      .filter((f) => proibido.test(semComentarios(readFileSync(f, 'utf8'))));
    expect(
      infratores,
      `use resolveApiBaseUrl(...) de src/lib/api-base — a env de produção não termina em /api:\n${infratores.join('\n')}`,
    ).toEqual([]);
  });
});
