





























import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { semComentariosJs } from './_semComentarios';

const RAIZ = join(__dirname, '..', '..');
const AUTH = join(RAIZ, 'backend', 'middleware', 'auth.js');










export function chavesDoMapa(fonteAuth: string): Set<string> {
  const inicio = fonteAuth.indexOf('const ROUTE_MODULE_MAP = {');
  if (inicio < 0) throw new Error('ROUTE_MODULE_MAP não encontrado em auth.js');
  const fim = fonteAuth.indexOf('\n};', inicio);
  if (fim < 0) throw new Error('fim do ROUTE_MODULE_MAP não encontrado');
  const bloco = semComentariosJs(fonteAuth.slice(inicio, fim));
  return new Set([...bloco.matchAll(/'([a-z0-9-]+)'\s*:/g)].map((m) => m[1]));
}

function arquivosJs(dir: string): string[] {
  const saida: string[] = [];
  for (const nome of readdirSync(dir)) {
    if (nome === 'node_modules') continue;
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) saida.push(...arquivosJs(caminho));
    else if (nome.endsWith('.js')) saida.push(caminho);
  }
  return saida;
}


export function routeKeysUsados(pastas: string[]): Map<string, string[]> {
  const usados = new Map<string, string[]>();
  for (const pasta of pastas) {
    for (const caminho of arquivosJs(pasta)) {
      const src = semComentariosJs(readFileSync(caminho, 'utf8'));
      const relativo = caminho.slice(RAIZ.length + 1).replace(/\\/g, '/');
      for (const m of src.matchAll(/authorizeModule\(\s*'([^']+)'/g)) {
        const lista = usados.get(m[1]) || [];
        if (!lista.includes(relativo)) lista.push(relativo);
        usados.set(m[1], lista);
      }
    }
  }
  return usados;
}

describe('ROUTE_MODULE_MAP · todo routeKey usado está declarado', () => {
  const fonteAuth = readFileSync(AUTH, 'utf8');
  const chaves = chavesDoMapa(fonteAuth);
  const usados = routeKeysUsados([
    join(RAIZ, 'backend', 'routes'),
    join(RAIZ, 'backend', 'services'),
    join(RAIZ, 'backend', 'utils'),
  ]);

  it('o mapa foi lido de verdade (guarda contra recorte vazio)', () => {


    expect(chaves.size).toBeGreaterThan(40);
    expect(chaves.has('membresia')).toBe(true);
    expect(usados.size).toBeGreaterThan(20);
  });

  it('nenhum routeKey cai no nível padrão do cargo', () => {
    const orfaos = [...usados.keys()]
      .filter((k) => !chaves.has(k))
      .sort()
      .map((k) => `${k} (usado em ${usados.get(k)!.join(', ')})`);

    expect(
      orfaos,
      'routeKey fora do ROUTE_MODULE_MAP: o guard ignora a matriz cargo × módulo '
        + 'e passa a decidir pelo nível padrão do cargo. Declare a entrada em '
        + 'backend/middleware/auth.js.',
    ).toEqual([]);
  });

  it('links aponta pro módulo links (a entrada que faltava)', () => {
    expect(chaves.has('links')).toBe(true);
    const bloco = semComentariosJs(fonteAuth);
    expect(bloco).toMatch(/'links'\s*:\s*\[\s*'links'\s*\]/);
  });

  it('toda chave do mapa é slug em minúsculas (nada de nome de módulo)', () => {


    for (const chave of chaves) expect(chave).toMatch(/^[a-z0-9-]+$/);
  });
});
