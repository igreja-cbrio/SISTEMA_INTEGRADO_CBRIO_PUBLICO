// @vitest-environment node

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import type { AddressInfo } from 'net';






const require = createRequire(import.meta.url);
type Linha = Record<string, unknown>;
const T: Record<string, Linha[]> = {};
let seq = 0;
const uid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;


function de(nome: string) {
  const st = { op: 'select', filtros: [] as ((r: Linha) => boolean)[], payload: null as unknown, head: false, single: false, maybe: false, depois: false, onConflict: 'id', ignorar: false, limite: null as number | null, range: null as [number, number] | null };
  const linhas = () => (T[nome] ||= []);
  const casa = (r: Linha) => st.filtros.every(f => f(r));
  const exec = () => {
    if (st.op === 'select') {
      let rows = linhas().filter(casa);
      if (st.head) return { data: null, count: rows.length, error: null };
      if (st.range) rows = rows.slice(st.range[0], st.range[1] + 1);
      if (st.limite != null) rows = rows.slice(0, st.limite);
      rows = rows.map(r => ({ ...r }));
      if (st.single) return rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: { code: 'PGRST116', message: 'linhas: ' + rows.length } };
      if (st.maybe) return { data: rows[0] || null, error: null };
      return { data: rows, error: null };
    }
    if (st.op === 'insert') {
      const arr = (Array.isArray(st.payload) ? st.payload : [st.payload]).map(r => ({ id: uid(), created_at: new Date().toISOString(), ...(r as Linha) }));
      linhas().push(...arr);
      const out = arr.map(r => ({ ...r }));
      return { data: st.single ? out[0] : out, error: null };
    }
    if (st.op === 'update') {
      const alvo = linhas().filter(casa);
      alvo.forEach(r => Object.assign(r, st.payload));
      const out = alvo.map(r => ({ ...r }));
      if (st.single) return out.length === 1 ? { data: out[0], error: null } : { data: null, error: { code: 'PGRST116', message: 'linhas: ' + out.length } };
      if (st.maybe) return { data: out[0] || null, error: null };
      return { data: st.depois ? out : null, error: null };
    }
    if (st.op === 'delete') {
      const saiu = linhas().filter(casa);
      T[nome] = linhas().filter(r => !casa(r));
      return { data: st.depois ? saiu : null, error: null };
    }
    const chaves = st.onConflict.split(',');
    for (const p of (Array.isArray(st.payload) ? st.payload : [st.payload]) as Linha[]) {
      const ex = linhas().find(r => chaves.every(k => r[k] === p[k]));
      if (ex) { if (!st.ignorar) Object.assign(ex, p); } else linhas().push({ id: uid(), ...p });
    }
    return { data: null, error: null };
  };
  const api: Record<string, unknown> = {
    select: (_c?: string, o: { head?: boolean } = {}) => { if (st.op === 'select') st.head = !!o.head; else st.depois = true; return api; },
    eq: (c: string, v: unknown) => { st.filtros.push(r => r[c] === v); return api; },
    neq: (c: string, v: unknown) => { st.filtros.push(r => r[c] !== v); return api; },
    is: (c: string, v: unknown) => { st.filtros.push(r => (v === null ? r[c] == null : r[c] === v)); return api; },
    in: (c: string, vs: unknown[]) => { st.filtros.push(r => vs.includes(r[c])); return api; },
    gte: (c: string, v: string) => { st.filtros.push(r => String(r[c]) >= v); return api; },
    lte: (c: string, v: string) => { st.filtros.push(r => String(r[c]) <= v); return api; },
    not: () => api, order: () => api,
    limit: (n: number) => { st.limite = n; return api; },
    range: (a: number, b: number) => { st.range = [a, b]; return api; },
    insert: (p: unknown) => { st.op = 'insert'; st.payload = p; return api; },
    update: (p: unknown) => { st.op = 'update'; st.payload = p; return api; },
    upsert: (p: unknown, o: { onConflict?: string; ignoreDuplicates?: boolean } = {}) => { st.op = 'upsert'; st.payload = p; st.onConflict = o.onConflict || 'id'; st.ignorar = !!o.ignoreDuplicates; return api; },
    delete: () => { st.op = 'delete'; return api; },
    single: () => { st.single = true; return api; },
    maybeSingle: () => { st.maybe = true; return api; },
    then: (ok: (v: unknown) => unknown, ruim: (e: unknown) => unknown) => Promise.resolve(exec()).then(ok, ruim),
  };
  return api;
}


const falso = (caminho: string, exports: unknown) => {
  const p = require.resolve(caminho);
  require.cache[p] = { id: p, filename: p, loaded: true, exports } as unknown as NodeJS.Module;
};
falso('../../backend/utils/supabase.js', { supabase: { from: de, rpc: async () => ({ data: null, error: null }) } });
falso('../../backend/middleware/auth.js', {
  authenticate: (req: { headers: Record<string, string>; user?: unknown }, _res: unknown, next: () => void) => {
    req.user = JSON.parse(req.headers['x-teste'] || '{}'); next();
  },
  authorizeModule: () => (_req: unknown, _res: unknown, next: () => void) => next(),
});

const express = require('express');
const router = require('../../backend/routes/marketingLinha.js');

const M = { lor: 'aaaaaaaa-0000-4000-8000-000000000001', let: 'aaaaaaaa-0000-4000-8000-000000000002', all: 'aaaaaaaa-0000-4000-8000-000000000003', out: 'aaaaaaaa-0000-4000-8000-000000000004' };
const P = { lor: 'bbbbbbbb-0000-4000-8000-000000000001', out: 'bbbbbbbb-0000-4000-8000-000000000004' };
const C_PLAN = 'cccccccc-0000-4000-8000-000000000001';
let base = '';
let server: { close: () => void };

beforeAll(async () => {
  Object.assign(T, {
    marketing_membros: Object.entries(M).map(([k, id]) => ({ id, profile_id: (P as Record<string, string>)[k] || null, habilidade: 'social_media', ativo: true, deleted_at: null })),
    marketing_compromissos_recorrentes: [{ id: C_PLAN, tipo: 'planejamento_postagens', ativo: true, deleted_at: null, semana_do_mes: -2, responsavel_execucao_membro_id: M.let }],
    marketing_recorrentes_participantes: [{ compromisso_id: C_PLAN, membro_id: M.lor }],
  });
  const app = express();
  app.use(express.json());
  app.use('/', router);
  await new Promise<void>((ok) => { server = app.listen(0, () => ok()); });
  base = `http://127.0.0.1:${((server as unknown as { address: () => AddressInfo }).address()).port}`;
});
afterAll(() => server?.close());

const chamar = async (metodo: string, caminho: string, corpo?: unknown, quem = P.lor) => {
  const r = await fetch(base + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', 'x-teste': JSON.stringify({ userId: quem, role: 'assistente' }) },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  return { status: r.status, json: await r.json() };
};
const vivos = (t: string) => (T[t] || []).filter(r => !r.deleted_at);
const cardDe = (semana: number, etapa: string) => {
  const l = (T.marketing_redes_plano_cards || []).find(x => x.semana === semana && x.etapa === etapa);
  return l ? (T.marketing_kanban_cards || []).find(c => c.id === l.card_id) : undefined;
};
const itensDe = (card?: Linha) => (T.marketing_card_checklist || []).filter(i => card && i.card_id === card.id);

describe('salvar o planejamento · 1ª vez', () => {
  it('quem não faz o planejamento (nem é líder) não salva', async () => {
    const r = await chamar('PUT', '/redes/planos/2026-12', { responsavel_membro_id: M.let, posts: [] }, P.out);
    expect(r.status).toBe(403);
  });

  it('dia fora da semana volta com o motivo, e nada é gravado', async () => {
    const r = await chamar('PUT', '/redes/planos/2026-12', {
      responsavel_membro_id: M.let, posts: [{ semana: 1, dia_provavel: '2026-12-09', nome: 'Reels', responsavel_membro_id: M.let }],
    });
    expect(r.status).toBe(400);
    expect(r.json.error).toMatch(/entre 01\/12 e 05\/12/);
    expect(T.marketing_redes_planos || []).toHaveLength(0);
  });

  it('gera produzir + postar por semana com postagem, para quem produz e posta', async () => {
    const r = await chamar('PUT', '/redes/planos/2026-12', {
      responsavel_membro_id: M.let,
      posts: [
        { semana: 1, dia_provavel: '2026-12-02', nome: 'Reels', ref_url: 'https://ex.com/r', descricao: 'obs', responsavel_membro_id: M.all },
        { semana: 1, dia_provavel: '2026-12-04', nome: 'Carrossel', responsavel_membro_id: M.let },
        { semana: 3, dia_provavel: '2026-12-15', nome: 'Live', responsavel_membro_id: M.let },
        { semana: 2, dia_provavel: '2026-12-06', nome: '', ref_url: '', descricao: '' },
      ],
    });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ postagens: 3, cards_criados: 4 });
    const prod1 = cardDe(1, 'producao');
    expect(prod1).toMatchObject({ origem: 'interna', area: 'redes', atribuido_a: M.let, data_inicio: '2026-11-22', data_fim: '2026-11-28', titulo: 'Produzir posts · Semana 1 de Dezembro' });
    expect(itensDe(prod1).map(i => [i.texto, i.membro_id])).toEqual([['Reels', M.all], ['Carrossel', M.let]]);
    const post1 = cardDe(1, 'postagem');
    expect(post1).toMatchObject({ data_inicio: '2026-11-29', data_fim: '2026-12-05' });
    expect(itensDe(post1).map(i => [i.texto, i.prazo, i.membro_id])).toEqual([['Reels', '2026-12-02', M.let], ['Carrossel', '2026-12-04', M.let]]);
    expect(cardDe(2, 'producao')).toBeUndefined();
    expect(itensDe(cardDe(3, 'producao')).map(i => i.texto)).toEqual(['Live']);

    expect(vivos('marketing_redes_plano_posts').every(p => p.subtarefa_producao_id && p.subtarefa_postagem_id)).toBe(true);
    expect(T.marketing_rotina_execucoes).toEqual([expect.objectContaining({ compromisso_id: C_PLAN, membro_id: M.lor, semana_inicio: '2026-11-15' })]);
    expect((T.marketing_redes_planos || [])[0].gerado_em).toBeTruthy();
  });
});

describe('salvar de novo · o que foi feito fica, o resto acompanha', () => {
  it('renomeia o aberto, preserva o feito, tira o que saiu e move o que mudou de semana', async () => {
    const posts = vivos('marketing_redes_plano_posts');
    const reels = posts.find(p => p.nome === 'Reels')!;
    const live = posts.find(p => p.nome === 'Live')!;
    const carrossel = posts.find(p => p.nome === 'Carrossel')!;

    const subProdReels = (T.marketing_card_checklist || []).find(i => i.id === reels.subtarefa_producao_id)!;
    subProdReels.feito = true;
    const subsCarrossel = [carrossel.subtarefa_producao_id, carrossel.subtarefa_postagem_id];
    const card3 = cardDe(3, 'producao')!;

    const r = await chamar('PUT', '/redes/planos/2026-12', {
      responsavel_membro_id: M.let,
      posts: [
        { id: reels.id, semana: 1, dia_provavel: '2026-12-03', nome: 'Reels v2', ref_url: 'https://ex.com/r', responsavel_membro_id: M.all },
        { id: live.id, semana: 2, dia_provavel: '2026-12-08', nome: 'Live', responsavel_membro_id: M.let },
      ],
    });
    expect(r.status).toBe(200);

    expect((T.marketing_card_checklist || []).find(i => i.id === subProdReels.id)).toMatchObject({ texto: 'Reels', feito: true });
    expect((T.marketing_card_checklist || []).find(i => i.id === reels.subtarefa_postagem_id)).toMatchObject({ texto: 'Reels v2', prazo: '2026-12-03' });

    expect((T.marketing_card_checklist || []).filter(i => subsCarrossel.includes(i.id))).toHaveLength(0);
    expect(vivos('marketing_redes_plano_posts').map(p => p.nome).sort()).toEqual(['Live', 'Reels v2']);

    expect(itensDe(cardDe(2, 'producao')).map(i => i.texto)).toEqual(['Live']);
    expect(itensDe(cardDe(2, 'postagem')).map(i => [i.texto, i.prazo])).toEqual([['Live', '2026-12-08']]);
    expect((T.marketing_kanban_cards || []).find(c => c.id === card3.id)!.deleted_at).toBeTruthy();
    expect(cardDe(3, 'producao')).toBeUndefined();
  });

  it('⚠️ o card de planejamento NÃO se marca no clique: fica feito ao salvar o plano', async () => {
    const r = await chamar('PUT', `/rotina/${C_PLAN}/2026-11-15`, { membro_id: M.lor });
    expect(r.status).toBe(400);
    expect(r.json.codigo).toBe('planejamento_obrigatorio');
  });

  it('o GET devolve o plano salvo com as semanas e quem pode editar', async () => {
    const r = await chamar('GET', '/redes/planos/2026-12');
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ mes: '2026-12', pode_editar: true, responsavel_membro_id: M.let });
    expect(r.json.semanas).toHaveLength(5);
    expect(r.json.posts.map((p: { nome: string }) => p.nome).sort()).toEqual(['Live', 'Reels v2']);
    const outro = await chamar('GET', '/redes/planos/2026-12', undefined, P.out);
    expect(outro.json.pode_editar).toBe(false);
  });
});
