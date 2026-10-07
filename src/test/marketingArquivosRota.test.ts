// @vitest-environment node

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createRequire } from 'module';
import type { AddressInfo } from 'net';







const require = createRequire(import.meta.url);
type Linha = Record<string, unknown>;
const T: Record<string, Linha[]> = {};
let seq = 0;
const uid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
const chave = { semArvoreNova: false };

function de(nome: string) {
  const st = { op: 'select', cols: '', filtros: [] as ((r: Linha) => boolean)[], payload: null as unknown, head: false, single: false, maybe: false, depois: false, onConflict: 'id', ignorar: false, limite: null as number | null, range: null as [number, number] | null };
  const linhas = () => (T[nome] ||= []);
  const casa = (r: Linha) => st.filtros.every(f => f(r));
  const exec = () => {

    if (chave.semArvoreNova && nome === 'marketing_entrega_arquivos' && /categoria|plano_id/.test(st.cols)) {
      return { data: null, error: { code: '42703', message: 'column does not exist' } };
    }
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

      if (chave.semArvoreNova && nome === 'marketing_entrega_arquivos'
        && (Array.isArray(st.payload) ? st.payload : [st.payload]).some(r => 'categoria' in (r as Linha) || 'plano_id' in (r as Linha))) {
        return { data: null, error: { code: 'PGRST204', message: "Could not find the 'categoria' column" } };
      }
      const arr = (Array.isArray(st.payload) ? st.payload : [st.payload]).map(r => ({ id: uid(), enviado_em: new Date().toISOString(), deleted_at: null, ...(r as Linha) }));
      linhas().push(...arr);
      const out = arr.map(r => ({ ...r }));
      return { data: st.single ? out[0] : out, error: null };
    }
    if (st.op === 'update') {
      const alvo = linhas().filter(casa);
      alvo.forEach(r => Object.assign(r, st.payload));
      const out = alvo.map(r => ({ ...r }));
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
    select: (c = '', o: { head?: boolean } = {}) => { if (st.op === 'select') { st.cols = c; st.head = !!o.head; } else st.depois = true; return api; },
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


const grafo = {
  criativoLiberado: false, recusaPasta: false,
  itens: new Map<string, { drive: string; item: Linha }>(), sessoes: [] as { drive: string; caminho: string }[],
  pastas: new Map<string, Set<string>>(),
};
const pastasDe = (drive: string) => { if (!grafo.pastas.has(drive)) grafo.pastas.set(drive, new Set()); return grafo.pastas.get(drive)!; };
const resposta = (status: number, corpo: unknown = {}) => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });
async function grafoFalso(url: string, opts: { method?: string; body?: string } = {}) {
  const caminho = decodeURIComponent(new URL(url).pathname.replace(/^\/v1\.0/, ''));
  if (caminho === '/sites/infracbrio.sharepoint.com:/sites/Criativo:/drive') {
    return grafo.criativoLiberado
      ? resposta(200, { id: 'DRIVE-CRIATIVO', webUrl: 'https://infracbrio.sharepoint.com/sites/Criativo/Documentos%20Compartilhados' })
      : resposta(403);
  }
  if (caminho.startsWith('/shares/')) return resposta(403);
  if (caminho === '/drives/DRIVE-HUB') return resposta(200, { webUrl: 'https://infracbrio.sharepoint.com/sites/CBRioHub/Criativo' });
  let m = caminho.match(/^\/drives\/([^/]+)\/root:\/(.+):\/createUploadSession$/);
  if (m && opts.method === 'POST') {
    grafo.sessoes.push({ drive: m[1], caminho: m[2] });
    return resposta(200, { uploadUrl: `https://upload.falso/${grafo.sessoes.length}` });
  }
  m = caminho.match(/^\/drives\/([^/]+)\/items\/([^/]+)$/);
  if (m) {
    const x = grafo.itens.get(m[2]);
    if (!x || x.drive !== m[1]) return resposta(404);
    return resposta(200, { ...x.item, '@microsoft.graph.downloadUrl': `https://download.falso/${m[2]}` });
  }

  m = caminho.match(/^\/drives\/([^/]+)\/(?:root:\/(.+):|root)\/children$/);
  if (m && opts.method === 'POST') {
    if (grafo.recusaPasta) return resposta(403, { error: { code: 'accessDenied' } });
    const pai = m[2] || '';
    const corpo = JSON.parse(opts.body || '{}');

    if (corpo['@microsoft.graph.conflictBehavior'] !== 'fail') return resposta(400, { erro: 'criaria por cima de pasta existente' });
    const nome = corpo.name;
    const existentes = pastasDe(m[1]);
    if (pai && !existentes.has(pai)) return resposta(404, { error: { code: 'itemNotFound' } });
    const nova = pai ? `${pai}/${nome}` : nome;
    if (existentes.has(nova)) return resposta(409, { error: { code: 'nameAlreadyExists' } });
    existentes.add(nova);
    return resposta(201, { id: nova, name: nome, folder: {} });
  }
  return resposta(500, { erro: `rota do Graph não prevista: ${caminho}` });
}
const fetchReal = globalThis.fetch;
globalThis.fetch = ((url: string, opts?: { method?: string; body?: string }) => (String(url).startsWith('https://graph.microsoft.com/')
  ? grafoFalso(String(url), opts) : fetchReal(url, opts as RequestInit))) as typeof fetch;

const falso = (caminho: string, exports: unknown) => {
  const p = require.resolve(caminho);
  require.cache[p] = { id: p, filename: p, loaded: true, exports } as unknown as NodeJS.Module;
};
falso('../../backend/utils/supabase.js', { supabase: { from: de, rpc: async () => ({ data: null, error: null }) } });

falso('../../backend/middleware/auth.js', {
  authenticate: (req: { headers: Record<string, string>; user?: unknown }, _res: unknown, next: () => void) => {
    req.user = JSON.parse(req.headers['x-teste'] || '{}'); next();
  },
  authorizeModule: (chaveRota: string) => (req: { user?: { modulos?: string[] } }, res: { status: (n: number) => { json: (b: unknown) => void } }, next: () => void) => (
    (req.user?.modulos || []).includes(chaveRota) ? next() : res.status(403).json({ error: 'sem módulo' })
  ),
});
falso('../../backend/services/storageService.js', {
  SHAREPOINT_CONFIGURED: true,
  getGraphToken: async () => 'token-falso',
  getDriveIdByName: async () => 'DRIVE-HUB',
  MODULE_LIBRARY_MAP: { criativo: 'Criativo' },
});
const avisos: string[] = [];
falso('../../backend/services/marketingAvisos.js', {
  avisarSeChecklistConcluiu: async () => { avisos.push('checklist'); },
  avisarAtribuidos: async () => {}, avisarPrazoAjustado: async () => {}, avisarEntregue: async () => {}, carimbarEntrega: async () => {},
});
const express = require('express');
const linha = require('../../backend/routes/marketingLinha.js');
const arquivos = require('../../backend/routes/marketingArquivos.js');

const P = { lor: 'bbbbbbbb-0000-4000-8000-000000000001', ev: 'bbbbbbbb-0000-4000-8000-000000000002', nada: 'bbbbbbbb-0000-4000-8000-000000000003' };
const M = { lor: 'aaaaaaaa-0000-4000-8000-000000000001' };
const ID = {
  ev: 'eeeeeeee-0000-4000-8000-000000000001', fase: 'ffffffff-0000-4000-8000-000000000005',
  cCiclo: 'cccccccc-0000-4000-8000-000000000001', cReq: 'cccccccc-0000-4000-8000-000000000002',
  cProd: 'cccccccc-0000-4000-8000-000000000003', cSolta: 'cccccccc-0000-4000-8000-000000000004',
  iCiclo: '11111111-0000-4000-8000-000000000001', iReq: '11111111-0000-4000-8000-000000000002',
  iMood: '11111111-0000-4000-8000-000000000005', iDefesa: '11111111-0000-4000-8000-000000000006',
  evPassado: 'eeeeeeee-0000-4000-8000-000000000002', fasePassada: 'ffffffff-0000-4000-8000-000000000001', cPassado: 'cccccccc-0000-4000-8000-000000000009',
  iProd: '11111111-0000-4000-8000-000000000003', iSolta: '11111111-0000-4000-8000-000000000004',
  coExige: '22222222-0000-4000-8000-000000000001', coLivre: '22222222-0000-4000-8000-000000000002',
  legado: '33333333-0000-4000-8000-000000000001',
};
let base = '';
let server: { close: () => void };

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-06T15:00:00Z'));
  const card = (id: string, extra: Linha) => ({ id, origem: 'interna', estado: 'producao', culto: null, atribuido_a: M.lor, visibilidade: 'equipe', event_id: null, event_phase_id: null, solicitacao_id: null, campanha_id: null, data_fim: null, prazo_producao: null, prazo_confirmado: null, prazo_preliminar: null, created_at: '2026-10-01T12:00:00Z', deleted_at: null, area: null, ...extra });
  const item = (id: string, cardId: string, texto: string) => ({ id, card_id: cardId, texto, feito: false, membro_id: M.lor, exige_registro: false, registro: null });
  Object.assign(T, {
    marketing_membros: [{ id: M.lor, profile_id: P.lor, habilidade: 'social_media', ativo: true, deleted_at: null, nome_display: 'Luciana' }],
    profiles: [{ id: P.lor, name: 'Luciana Pariz' }],
    events: [{ id: ID.ev, name: 'Natal: 2026', date: '2026-12-24' }, { id: ID.evPassado, name: 'Páscoa', date: '2026-04-05' }],
    event_cycle_phases: [{ id: ID.fase, numero_fase: 5, nome_fase: 'Execução' }, { id: ID.fasePassada, numero_fase: 1, nome_fase: 'Briefing' }],
    marketing_kanban_cards: [
      card(ID.cCiclo, { origem: 'evento', event_id: ID.ev, event_phase_id: ID.fase, culto: 'ami', titulo: 'Natal · Execução' }),
      card(ID.cReq, { titulo: 'Arte do culto de Natal', data_fim: '2026-12-20' }),
      card(ID.cProd, { titulo: 'Postar · Semana 1 de novembro', data_fim: '2026-11-03', area: 'redes' }),
      card(ID.cSolta, { titulo: 'Ensaio fotográfico', event_id: ID.ev }),
      card(ID.cPassado, { origem: 'evento', event_id: ID.evPassado, event_phase_id: ID.fasePassada, titulo: 'Páscoa · Briefing' }),
    ],
    marketing_card_checklist: [item(ID.iCiclo, ID.cCiclo, 'Thumbs'), item(ID.iReq, ID.cReq, 'Briefing'), item(ID.iProd, ID.cProd, 'Post 1'), item(ID.iSolta, ID.cSolta, 'Fotos'),
      item(ID.iMood, ID.cCiclo, 'Moodboard'), item(ID.iDefesa, ID.cCiclo, 'Defesa')],
    marketing_compromissos_recorrentes: [
      { id: ID.coExige, descricao: 'Análise do YouTube', exige_arquivo: true, ativo: true, deleted_at: null },
      { id: ID.coLivre, descricao: 'Stories do culto (sábado)', exige_arquivo: false, ativo: true, deleted_at: null },
    ],
    marketing_recorrentes_participantes: [{ compromisso_id: ID.coExige, membro_id: M.lor }, { compromisso_id: ID.coLivre, membro_id: M.lor }],
    marketing_rotina_execucoes: [],

    marketing_entrega_arquivos: [{
      id: ID.legado, origem: 'rotina', compromisso_id: ID.coLivre, membro_id: M.lor, semana_inicio: '2026-10-04',
      nome_arquivo: 'Lorena_stories.zip', drive_id: 'DRIVE-HUB', sharepoint_item_id: 'item-antigo', web_url: 'https://hub/antigo',
      pasta: 'Marketing/Rotina/2026-10-04/Stories_do_culto', enviado_por: P.lor, enviado_em: '2026-10-05T18:00:00Z', deleted_at: null,
    }],
  });
  const app = express();
  app.use(express.json());
  app.use('/linha', linha);
  app.use('/arquivos', arquivos);
  await new Promise<void>((ok) => { server = app.listen(0, () => ok()); });
  base = `http://127.0.0.1:${((server as unknown as { address: () => AddressInfo }).address()).port}`;
});
afterAll(() => { server?.close(); vi.useRealTimers(); globalThis.fetch = fetchReal; });

const quem = {
  lor: { userId: P.lor, role: 'assistente', modulos: ['marketing'] },
  ev: { userId: P.ev, role: 'assistente', modulos: ['eventos'] },
  nada: { userId: P.nada, role: 'assistente', modulos: [] },
  lider: { userId: P.nada, role: 'admin', modulos: ['marketing'] },
};
const chamar = async (metodo: string, caminho: string, corpo?: unknown, pessoa: Linha = quem.lor) => {
  const r = await fetchReal(base + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', 'x-teste': JSON.stringify(pessoa) },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  return { status: r.status, json: await r.json() };
};



let nItem = 0;
async function enviar(alvo: Linha, nome: string) {
  const s = await chamar('POST', '/linha/entregas/sessao', { alvo, nome_arquivo: nome, tamanho_bytes: 2048 });
  if (s.status !== 200) return { sessao: s, registro: null };
  const id = `item-${++nItem}`;
  grafo.itens.set(id, {
    drive: s.json.drive_id,
    item: { id, name: s.json.nome_arquivo, webUrl: `https://sp/${id}`, size: 2048, file: { mimeType: 'application/pdf' },
      parentReference: { driveId: s.json.drive_id, path: `/drives/${s.json.drive_id}/root:/${encodeURI(s.json.pasta)}` } },
  });
  const r = await chamar('POST', '/linha/entregas', { alvo, drive_id: s.json.drive_id, sharepoint_item_id: id });
  return { sessao: s, registro: r };
}
const itemFeito = (id: string) => (T.marketing_card_checklist || []).find(i => i.id === id)?.feito;
const execucoes = () => (T.marketing_rotina_execucoes || []).length;

describe('para onde o arquivo vai', () => {
  it('sem acesso ao site Criativo: a MESMA árvore na biblioteca Criativo do CBRio Hub (a entrega nunca trava)', async () => {
    const { sessao, registro } = await enviar({ item_id: ID.iCiclo }, 'capa final.png');
    expect(sessao.status).toBe(200);
    expect(sessao.json.drive_id).toBe('DRIVE-HUB');
    expect(sessao.json.pasta).toBe('Demandas/2026/Ciclo criativo/Natal 2026/05 - Execução');

    expect(sessao.json.nome_arquivo).toBe('2026 - Natal - F05 - Thumbs - AMI - v01.png');
    expect(registro?.status).toBe(201);
  });

  it('liberado o acesso, a falha guardada vale só 5 minutos: depois, o site Criativo', async () => {
    grafo.criativoLiberado = true;
    const antes = await chamar('POST', '/linha/entregas/sessao', { alvo: { item_id: ID.iReq }, nome_arquivo: 'a.pdf', tamanho_bytes: 10 });
    expect(antes.json.drive_id).toBe('DRIVE-HUB');
    vi.setSystemTime(new Date('2026-10-06T15:06:00Z'));
    const depois = await chamar('POST', '/linha/entregas/sessao', { alvo: { item_id: ID.iReq }, nome_arquivo: 'a.pdf', tamanho_bytes: 10 });
    expect(depois.json.drive_id).toBe('DRIVE-CRIATIVO');
  });
});

describe('o que marca e o que não marca', () => {
  it('entrega de ciclo: enviar = marcar (e avisa o checklist)', async () => {
    expect(itemFeito(ID.iCiclo)).toBe(true);
    expect(avisos).toContain('checklist');
  });

  it('requisição: o anexo vai para Requisições/<mês do prazo>/<tarefa> e NÃO marca a subtarefa', async () => {
    const { sessao, registro } = await enviar({ item_id: ID.iReq }, 'briefing.pdf');
    expect(sessao.json.pasta).toBe('Demandas/2026/Requisições/12 - Dezembro/Arte do culto de Natal');
    expect(sessao.json.nome_arquivo).toBe('2026 - Arte do culto de Natal - Briefing - v01.pdf');
    expect(registro?.status).toBe(201);
    expect(registro?.json.feito).toBe(false);
    expect(itemFeito(ID.iReq)).toBe(false);
    const linhaGravada = T.marketing_entrega_arquivos.find(a => a.checklist_item_id === ID.iReq);
    expect(linhaGravada).toMatchObject({ origem: 'tarefa', categoria: 'requisicoes', card_id: ID.cReq, drive_id: 'DRIVE-CRIATIVO' });
  });

  it('a pasta da tarefa é a do 1º arquivo: o prazo mudou de mês e o próximo anexo vai para a mesma', async () => {
    T.marketing_kanban_cards.find(c => c.id === ID.cReq)!.data_fim = '2027-01-15';
    const { sessao } = await enviar({ item_id: ID.iReq }, 'versao 2.pdf');
    expect(sessao.json.pasta).toBe('Demandas/2026/Requisições/12 - Dezembro/Arte do culto de Natal');
  });

  it('Redes · Produção vai para Redes/Produção; tarefa de evento fora das fases, para o evento, sem marcar', async () => {
    const prod = await enviar({ item_id: ID.iProd }, 'post.png');
    expect(prod.sessao.json.pasta).toBe('Demandas/2026/Redes/Produção/11 - Novembro/Postar · Semana 1 de novembro');
    expect(T.marketing_entrega_arquivos.find(a => a.checklist_item_id === ID.iProd)).toMatchObject({ origem: 'tarefa', categoria: 'redes' });
    const solta = await enviar({ item_id: ID.iSolta }, 'foto.jpg');
    expect(solta.sessao.json.pasta).toBe('Demandas/2026/Ciclo criativo/Natal 2026/Outras tarefas');
    expect(itemFeito(ID.iProd)).toBe(false);
    expect(itemFeito(ID.iSolta)).toBe(false);
  });

  it('rotina: o compromisso que pede arquivo fica feito; o que não pede só anexa', async () => {
    const livre = await enviar({ compromisso_id: ID.coLivre, semana_inicio: '2026-10-04', membro_id: M.lor }, 'stories.zip');
    expect(livre.sessao.json.pasta).toBe('Demandas/2026/Rotina/10 - Outubro/Stories do culto');
    expect(livre.sessao.json.nome_arquivo).toBe('2026-10-04 - Stories do culto - Luciana - v01.zip');
    expect(execucoes()).toBe(0);
    const exige = await enviar({ compromisso_id: ID.coExige, semana_inicio: '2026-10-04', membro_id: M.lor }, 'report.pdf');
    expect(exige.registro?.json.feito).toBe(true);
    expect(execucoes()).toBe(1);
  });

  it('tirar o anexo da requisição não reabre nada; tirar o último da entrega de ciclo reabre', async () => {
    const anexo = T.marketing_entrega_arquivos.find(a => a.checklist_item_id === ID.iReq && !a.deleted_at)!;
    const r1 = await chamar('DELETE', `/linha/entregas/${anexo.id}`);
    expect(r1.json).toMatchObject({ ok: true, reaberta: false });
    const doCiclo = T.marketing_entrega_arquivos.filter(a => a.checklist_item_id === ID.iCiclo && !a.deleted_at);
    expect(doCiclo).toHaveLength(1);
    const r2 = await chamar('DELETE', `/linha/entregas/${doCiclo[0].id}`);
    expect(r2.json).toMatchObject({ ok: true, reaberta: true });
    expect(itemFeito(ID.iCiclo)).toBe(false);
  });

  it('tirar o anexo da tarefa de evento fora das fases não reabre (a origem é ciclo, mas não é entrega)', async () => {
    const it = T.marketing_card_checklist.find(i => i.id === ID.iSolta)!;
    it.feito = true;
    const anexo = T.marketing_entrega_arquivos.find(a => a.checklist_item_id === ID.iSolta && !a.deleted_at)!;
    const r = await chamar('DELETE', `/linha/entregas/${anexo.id}`);
    expect(r.json).toMatchObject({ ok: true, reaberta: false });
    expect(itemFeito(ID.iSolta)).toBe(true);

    await enviar({ item_id: ID.iSolta }, 'foto 2.jpg');
  });

  it('tirar o ÚNICO anexo da rotina que não pede arquivo não desfaz o feito da semana', async () => {

    const alvo = { compromisso_id: ID.coLivre, semana_inicio: '2026-10-11', membro_id: M.lor };
    T.marketing_rotina_execucoes.push({ id: uid(), compromisso_id: ID.coLivre, membro_id: M.lor, semana_inicio: '2026-10-11' });
    const { registro } = await enviar(alvo, 'roteiro.pdf');
    expect(registro?.status).toBe(201);
    const r = await chamar('DELETE', `/linha/entregas/${registro?.json.arquivo.id}`);
    expect(r.json).toMatchObject({ ok: true, reaberta: false });
    expect(T.marketing_rotina_execucoes.some(e => e.compromisso_id === ID.coLivre && e.semana_inicio === '2026-10-11')).toBe(true);
  });

  it('sem a migration de 06/10: o anexo de tarefa recusa ANTES de subir os bytes; a entrega de ciclo segue', async () => {
    chave.semArvoreNova = true;
    try {
      const s = await chamar('POST', '/linha/entregas/sessao', { alvo: { item_id: ID.iReq }, nome_arquivo: 'x.pdf', tamanho_bytes: 10 });
      expect(s.status).toBe(409);
      expect(s.json.error).toContain('20261006120000_mkt_arquivos_criativo.sql');

      const ciclo = await enviar({ item_id: ID.iCiclo }, 'capa v2.png');
      expect(ciclo.registro?.status).toBe(201);

      expect(ciclo.sessao.json.nome_arquivo).toBe('2026 - Natal - F05 - Thumbs - AMI - v02.png');
      expect(itemFeito(ID.iCiclo)).toBe(true);
    } finally {
      chave.semArvoreNova = false;
    }
  });
});

describe('o nome padrão (06/10): entrega por tarefa', () => {
  it('moodboard e defesa na mesma fase: um nome para cada entregável, e a versão é de cada um', async () => {
    const m1 = await enviar({ item_id: ID.iMood }, 'moodboard final FINAL.pdf');
    const d1 = await enviar({ item_id: ID.iDefesa }, 'apresentacao.pptx');
    const m2 = await enviar({ item_id: ID.iMood }, 'mood v2 (1).PDF');
    expect([m1, d1, m2].map(x => x.sessao.json.pasta)).toEqual(Array(3).fill('Demandas/2026/Ciclo criativo/Natal 2026/05 - Execução'));
    expect(m1.sessao.json.nome_arquivo).toBe('2026 - Natal - F05 - Moodboard - AMI - v01.pdf');
    expect(d1.sessao.json.nome_arquivo).toBe('2026 - Natal - F05 - Defesa - AMI - v01.pptx');
    expect(m2.sessao.json.nome_arquivo).toBe('2026 - Natal - F05 - Moodboard - AMI - v02.pdf');

    expect(T.marketing_entrega_arquivos.filter(a => a.checklist_item_id === ID.iMood).map(a => a.nome_arquivo))
      .toEqual(['2026 - Natal - F05 - Moodboard - AMI - v01.pdf', '2026 - Natal - F05 - Moodboard - AMI - v02.pdf']);
  });

  it('o nome segue a pasta FIXADA da tarefa: o evento mudou de nome e o próximo arquivo continua batendo com a pasta', async () => {
    const ev = T.events.find(e => e.id === ID.ev)!;
    ev.name = 'Natal Iluminado';
    try {
      const m3 = await enviar({ item_id: ID.iMood }, 'mood v3.pdf');
      expect(m3.sessao.json.pasta).toBe('Demandas/2026/Ciclo criativo/Natal 2026/05 - Execução');
      expect(m3.sessao.json.nome_arquivo).toBe('2026 - Natal - F05 - Moodboard - AMI - v03.pdf');
    } finally {
      ev.name = 'Natal: 2026';
    }
  });
});

describe('as pastas do ano (06/10): só o que 2026 ainda vai usar', () => {
  it('só o líder cria; e só o ano corrente', async () => {
    expect((await chamar('POST', '/arquivos/estrutura', { ano: '2026' })).status).toBe(403);
    expect((await chamar('GET', '/arquivos?ano=2026')).json.pode_criar_estrutura).toBe(false);
    expect((await chamar('GET', '/arquivos?ano=2026', undefined, quem.lider)).json.pode_criar_estrutura).toBe(true);
    expect((await chamar('POST', '/arquivos/estrutura', { ano: '2027' }, quem.lider)).status).toBe(400);
  });

  it('cria em lotes, o pai antes do filho, e repetir não muda nada', async () => {

    for (let i = 1; i <= 8; i += 1) {
      T.marketing_compromissos_recorrentes.push({ id: uid(), descricao: `Compromisso ${i}`, ativo: true, deleted_at: null });
    }
    T.marketing_compromissos_recorrentes.push({ id: uid(), descricao: 'Desligado', ativo: false, deleted_at: null });
    const r1 = await chamar('POST', '/arquivos/estrutura', { ano: '2026', desde: 0 }, quem.lider);
    expect(r1.status).toBe(200);
    expect(r1.json).toMatchObject({ ano: '2026', feitas: 40, proximo: 40 });
    const total = r1.json.total;
    const r2 = await chamar('POST', '/arquivos/estrutura', { ano: '2026', desde: r1.json.proximo }, quem.lider);
    expect(r2.json).toMatchObject({ feitas: total, proximo: null, existiam: 0 });
    expect(r1.json.criadas + r2.json.criadas).toBe(total);
    const criadas = pastasDe('DRIVE-CRIATIVO');

    expect(total).toBe(8 + 2 + 3 * 11 + 3 + 3 + 2);
    for (const p of [
      'Demandas/2026/Ciclo criativo/Natal 2026/05 - Execução',
      'Demandas/2026/Rotina/10 - Outubro/Stories do culto',
      'Demandas/2026/Rotina/12 - Dezembro/Compromisso 8',
      'Demandas/2026/Requisições/11 - Novembro',
      'Demandas/2026/Redes/Produção/12 - Dezembro',
      'Demandas/2026/Redes/Planejamento/11 - Novembro',
    ]) expect(criadas.has(p)).toBe(true);

    expect([...criadas].some(p => p.includes('Páscoa'))).toBe(false);
    expect([...criadas].some(p => p.includes('09 - Setembro'))).toBe(false);
    expect(criadas.has('Demandas/2026/Redes/Planejamento/10 - Outubro')).toBe(false);

    expect([...criadas].some(p => p.includes('Desligado') || p.includes('2027'))).toBe(false);

    const r3 = await chamar('POST', '/arquivos/estrutura', { ano: '2026', desde: 0 }, quem.lider);
    expect(r3.json).toMatchObject({ criadas: 0, existiam: 40 });
  });

  it('a pasta do 1º envio é a MESMA que a estrutura criou', async () => {
    const { sessao } = await enviar({ item_id: ID.iMood }, 'mood v4.pdf');
    expect(pastasDe('DRIVE-CRIATIVO').has(sessao.json.pasta)).toBe(true);
  });

  it('o SharePoint recusou: o motivo aparece', async () => {
    grafo.recusaPasta = true;
    try {
      T.marketing_compromissos_recorrentes.push({ id: uid(), descricao: 'Compromisso novo', ativo: true, deleted_at: null });
      const r = await chamar('POST', '/arquivos/estrutura', { ano: '2026', desde: 0 }, quem.lider);
      expect(r.status).toBe(500);
      expect(r.json.detalhe).toContain('O SharePoint recusou criar a pasta');
    } finally {
      grafo.recusaPasta = false;
    }
  });
});

describe('a página Arquivos: quem vê o quê', () => {
  it('o Marketing vê tudo do ano, com o link do SharePoint e o destino', async () => {
    const r = await chamar('GET', '/arquivos?ano=2026');
    expect(r.status).toBe(200);
    expect(r.json.acesso).toEqual({ marketing: true, eventos: false });
    const cats = new Set(r.json.arquivos.map((a: Linha) => a.categoria));
    expect([...cats].sort()).toEqual(['ciclo', 'redes', 'requisicoes', 'rotina']);
    expect(r.json.arquivos.every((a: Linha) => typeof a.web_url === 'string')).toBe(true);
    expect(r.json.destino).toEqual({ local: 'criativo', raiz_url: 'https://infracbrio.sharepoint.com/sites/Criativo/Documentos%20Compartilhados/Demandas' });

    const antigo = r.json.arquivos.find((a: Linha) => a.id === ID.legado);
    expect(antigo).toMatchObject({ legado: true, caminho: ['Rotina', '10 - Outubro', 'Stories do culto'] });
  });

  it('quem tem só o Eventos vê SÓ o Ciclo criativo, sem o link do SharePoint e sem o destino', async () => {
    const r = await chamar('GET', '/arquivos?ano=2026', undefined, quem.ev);
    expect(r.status).toBe(200);
    expect(r.json.arquivos.length).toBeGreaterThan(0);
    expect(r.json.arquivos.every((a: Linha) => a.categoria === 'ciclo' && a.web_url === null)).toBe(true);
    expect(r.json.destino).toBeNull();
  });

  it('quem não tem Marketing nem Eventos não entra', async () => {
    expect((await chamar('GET', '/arquivos', undefined, quem.nada)).status).toBe(403);
  });

  it('veio do Eventos (?evento=): o servidor diz o ano e a pasta do evento', async () => {
    const r = await chamar('GET', `/arquivos?evento=${ID.ev}`, undefined, quem.ev);
    expect(r.json.abrir).toEqual({ ano: '2026', caminho: ['Ciclo criativo', 'Natal 2026'] });
    expect(r.json.ano).toBe('2026');
  });

  it('baixar: o link do SharePoint para quem vê; o arquivo do Marketing é "não encontrado" para o Eventos', async () => {
    const ciclo = T.marketing_entrega_arquivos.find(a => a.checklist_item_id === ID.iSolta && !a.deleted_at)!;
    const ok = await chamar('GET', `/arquivos/${ciclo.id}/baixar`, undefined, quem.ev);
    expect(ok.status).toBe(200);
    expect(ok.json.url).toMatch(/^https:\/\/download\.falso\//);
    const prod = T.marketing_entrega_arquivos.find(a => a.checklist_item_id === ID.iProd && !a.deleted_at)!;
    expect((await chamar('GET', `/arquivos/${prod.id}/baixar`, undefined, quem.ev)).status).toBe(404);
    expect((await chamar('GET', `/arquivos/${prod.id}/baixar`)).status).toBe(200);

    const sumiu = await chamar('GET', `/arquivos/${ID.legado}/baixar`);
    expect(sumiu.status).toBe(410);
  });
});
