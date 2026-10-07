import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { semComentariosJs } from './_semComentarios';
















const raiz = path.resolve(__dirname, '../..');
const ler = (p: string) => semComentariosJs(fs.readFileSync(path.join(raiz, p), 'utf8'));

describe('sem equipe · o número não pode voltar a mentir', () => {
  const pool = ler('backend/routes/voluntariado.js');
  const sync = ler('backend/services/planningCenter.js');
  const tela = ler('src/pages/ministerial/voluntariado/VolLista.tsx');

  it('TODO embed de team_members devolve is_active', () => {







    const embeds = pool.match(/team_members:vol_team_members\(\s*\n\s*[^)]*/g) || [];
    expect(embeds.length).toBeGreaterThanOrEqual(2);
    for (const e of embeds) expect(e).toContain('is_active');
  });

  it('a tela decide "sem equipe" pela régua, não por team_members.length cru', () => {
    expect(tela).toContain('function equipesDe(');
    expect(tela).toContain('!equipesDe(v).length');

    expect(tela).not.toMatch(/!\(\(v\.team_members \|\| \[\]\)\.length\)/);
  });

  it('o sync REPONTA a linha órfã que já está no banco', () => {




    expect(sync).toContain('async function repontarOrfas(supabase,');
    expect(sync).toContain('await repontarOrfas(supabase, memberships, profByPc);');
  });

  it('repontarOrfas recebe o supabase por PARÂMETRO', () => {



    const corpo = sync.slice(sync.indexOf('async function repontarOrfas('));
    const fim = corpo.indexOf('\nasync function ', 1);
    const escopo = fim > 0 ? corpo.slice(0, fim) : corpo;
    expect(escopo).toContain('repontarOrfas(supabase,');
    expect(escopo).not.toMatch(/require\(['"].*supabase/);
  });

  it('órfã redundante é APAGADA no 23505, não deixada pra trás', () => {



    expect(sync).toMatch(/error\.code === '23505'[\s\S]{0,400}?\.delete\(\)/);
  });

  it('falha de LEITURA das órfãs não vira "não há órfã" nem derruba o sync', () => {
    const corpo = sync.slice(sync.indexOf('async function repontarOrfas('));
    const escopo = corpo.slice(0, corpo.indexOf('\nasync function ', 1));


    expect(escopo).toMatch(/leitura de órfãs/);
    expect(escopo).toMatch(/return \{ repontadas: 0, apagadas: 0 \};/);
  });
});
