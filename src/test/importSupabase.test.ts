
















import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = join(process.cwd(), 'backend');

function arquivosJs(dir: string): string[] {
  const out: string[] = [];
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) out.push(...arquivosJs(p));
    else if (nome.endsWith('.js') && !nome.endsWith('.test.js')) out.push(p);
  }
  return out;
}



function semComentarios(src: string): string {



  return src
    .split('\n').map(l => l.replace(/(^|[^:])\/\/[^\n]*/, '$1')).join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('import do cliente Supabase no backend', () => {
  const arquivos = arquivosJs(RAIZ);






  const fontes = arquivos.map(f => ({ f, src: semComentarios(readFileSync(f, 'utf8')) }));
  const T = 30_000;

  it('há arquivos para varrer (o próprio varredor não pode virar no-op)', () => {
    expect(arquivos.length).toBeGreaterThan(50);
  });

  it('⚠️ NENHUM arquivo importa utils/supabase sem desestruturar', () => {
    const errados: string[] = [];
    for (const { f, src } of fontes) {

      if (/(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*require\([^)]*utils\/supabase[^)]*\)/.test(src)) {
        errados.push(f.replace(RAIZ, 'backend'));
      }
    }
    expect(errados, `importe com chaves: const { supabase } = require('../utils/supabase')`).toEqual([]);
  }, T);

  it('quem usa `supabase.from` importa o cliente de verdade', () => {
    const semImport: string[] = [];
    for (const { f, src } of fontes) {
      if (!/\bsupabase\s*\.\s*(from|rpc|storage)\b/.test(src)) continue;
      const ok = /\{[^}]*\bsupabase\b[^}]*\}\s*=\s*require\([^)]*supabase[^)]*\)/.test(src)
        || /\bsupabase\s*=\s*createClient\(/.test(src)
        || /function[^(]*\(\s*[^)]*\bsupabase\b/.test(src)
        || /\bsupabase\s*[,)]/.test(src.split('\n')[0] || '');
      if (!ok) semImport.push(f.replace(RAIZ, 'backend'));
    }
    expect(semImport).toEqual([]);
  }, T);
});
