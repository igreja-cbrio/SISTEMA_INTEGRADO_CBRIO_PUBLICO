import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { semComentariosJs } from './_semComentarios';



const require = createRequire(import.meta.url);
const L = require('../../backend/utils/marketingLinha.js');

const LIDER_REAL = { lider: true, nivel: 5, meusMembroIds: ['m-pedro'] };
const NAO_LIDER = { lider: false, nivel: 5, meusMembroIds: ['m-leticia'] };

const MEMBROS = [
  { id: 'm-pedro', profile_id: 'p-pedro', habilidade: 'coordenador', ativo: true },
  { id: 'm-leticia', profile_id: 'p-leticia', habilidade: 'design', ativo: true },
  { id: 'm-leticia-2', profile_id: 'p-leticia', habilidade: 'video', ativo: true },
  { id: 'm-caua', profile_id: 'p-caua', habilidade: 'video', ativo: true },
  { id: 'm-coord2', profile_id: 'p-coord2', habilidade: 'coordenador', ativo: true },
  { id: 'm-sem-login', profile_id: null, habilidade: 'design', ativo: true },
  { id: 'm-saiu', profile_id: 'p-saiu', habilidade: 'design', ativo: false },
];

describe('contextoVerComo · quem pode e como fica o recorte', () => {
  it('quem não é líder não simula ninguém', () => {
    expect(L.contextoVerComo({ ctxReal: NAO_LIDER, membros: MEMBROS, membroId: 'm-caua' }))
      .toEqual({ erro: 'so_lider' });
    expect(L.contextoVerComo({ ctxReal: null, membros: MEMBROS, membroId: 'm-caua' }))
      .toEqual({ erro: 'so_lider' });
  });

  it('pessoa da equipe vira o contexto dela, sem liderança e sem poder de marcar', () => {
    const r = L.contextoVerComo({ ctxReal: LIDER_REAL, membros: MEMBROS, membroId: 'm-caua', role: 'assistente' });
    expect(r.erro).toBeUndefined();
    expect(r.alvo.id).toBe('m-caua');
    expect(r.ctx).toEqual({ lider: false, nivel: 0, meusMembroIds: ['m-caua'] });
  });

  it('todas as linhas de membro da MESMA pessoa entram (é o que o login dela vê)', () => {
    const r = L.contextoVerComo({ ctxReal: LIDER_REAL, membros: MEMBROS, membroId: 'm-leticia' });
    expect(r.ctx.meusMembroIds.sort()).toEqual(['m-leticia', 'm-leticia-2']);
  });

  it('membro sem login fica só com a própria linha', () => {
    const r = L.contextoVerComo({ ctxReal: LIDER_REAL, membros: MEMBROS, membroId: 'm-sem-login' });
    expect(r.ctx.meusMembroIds).toEqual(['m-sem-login']);
  });

  it('inativo ou inexistente é recusado (nunca vira visão vazia)', () => {
    expect(L.contextoVerComo({ ctxReal: LIDER_REAL, membros: MEMBROS, membroId: 'm-saiu' }))
      .toEqual({ erro: 'membro_invalido' });
    expect(L.contextoVerComo({ ctxReal: LIDER_REAL, membros: MEMBROS, membroId: 'nao-existe' }))
      .toEqual({ erro: 'membro_invalido' });
    const apagado = [...MEMBROS, { id: 'm-apagado', profile_id: 'p-x', ativo: true, deleted_at: '2026-09-01' }];
    expect(L.contextoVerComo({ ctxReal: LIDER_REAL, membros: apagado, membroId: 'm-apagado' }))
      .toEqual({ erro: 'membro_invalido' });
  });

  it('o id casa como texto (vem da URL)', () => {
    const num = [{ id: 7, profile_id: 'p-7', habilidade: 'design', ativo: true }];
    expect(L.contextoVerComo({ ctxReal: LIDER_REAL, membros: num, membroId: '7' }).ctx.meusMembroIds).toEqual([7]);
  });

  it('outro coordenador ou admin/diretor continua vendo como líder', () => {
    expect(L.contextoVerComo({ ctxReal: LIDER_REAL, membros: MEMBROS, membroId: 'm-coord2' }).ctx.lider).toBe(true);
    expect(L.contextoVerComo({ ctxReal: LIDER_REAL, membros: MEMBROS, membroId: 'm-caua', role: 'diretor' }).ctx.lider).toBe(true);
  });
});

describe('contextoVerComo × recortarCard · a visão emprestada é a da pessoa', () => {
  const ctx = L.contextoVerComo({ ctxReal: LIDER_REAL, membros: MEMBROS, membroId: 'm-caua' }).ctx;

  it('card de outra pessoa some; card dela aparece', () => {
    expect(L.recortarCard({ card: { id: 1, atribuido_a: 'm-leticia' }, itens: [], ctx })).toBeNull();
    const meu = L.recortarCard({ card: { id: 2, atribuido_a: 'm-caua' }, itens: [], ctx });
    expect(meu.papel).toBe('responsavel');
  });

  it('card só do líder some da visão emprestada', () => {
    expect(L.recortarCard({ card: { id: 3, atribuido_a: 'm-caua', visibilidade: 'so_lider' }, itens: [], ctx })).toBeNull();
  });

  it('item dela em card alheio aparece sozinho', () => {
    const r = L.recortarCard({
      card: { id: 4, atribuido_a: 'm-leticia' },
      itens: [{ id: 'a', membro_id: 'm-caua' }, { id: 'b', membro_id: 'm-leticia' }],
      ctx,
    });
    expect(r.papel).toBe('dono');
    expect(r.itens.map(i => i.id)).toEqual(['a']);
  });
});

describe('opcoesVerComo · a lista do seletor', () => {
  const saida = [
    { id: 'm-pedro', nome: 'Pablo Pontal' },
    { id: 'm-leticia', nome: 'Letícia' },
    { id: 'm-caua', nome: 'Cauã' },
    { id: 'm-allan', nome: 'Allan' },
  ];

  it('não oferece o próprio líder e sai em ordem de nome', () => {
    expect(L.opcoesVerComo(LIDER_REAL, saida).map(o => o.nome)).toEqual(['Allan', 'Cauã', 'Letícia']);
  });

  it('quem não é líder recebe lista vazia', () => {
    expect(L.opcoesVerComo(NAO_LIDER, saida)).toEqual([]);
    expect(L.opcoesVerComo(null, saida)).toEqual([]);
  });
});

describe('guardas estáticas · rota, tela e modal', () => {
  const raiz = join(__dirname, '..', '..');
  const rota = semComentariosJs(readFileSync(join(raiz, 'backend/routes/marketingLinha.js'), 'utf8'));
  const tela = semComentariosJs(readFileSync(join(raiz, 'src/pages/marketing/MarketingLinhaDoTempo.jsx'), 'utf8'));
  const modal = semComentariosJs(readFileSync(join(raiz, 'src/pages/marketing/linha/ModalTarefa.jsx'), 'utf8'));


  const lista = semComentariosJs(readFileSync(join(raiz, 'src/pages/marketing/linha/ListaSubtarefas.jsx'), 'utf8'));

  it('a rota decide pela régua e o seletor pelo contexto REAL', () => {
    expect(rota).toContain('L.contextoVerComo(');
    expect(rota).toContain('pode_ver_como: ctxReal.lider');
    expect(rota).toContain('L.opcoesVerComo(ctxReal');
  });

  it('o valor cru da URL nunca vai direto numa consulta', () => {
    expect(rota).not.toMatch(/\.(eq|in)\(\s*'[^']+'\s*,\s*req\.query\.ver_como/);
  });

  it('a tela passa o somente leitura ao modal, o modal à lista, e a lista bloqueia a marcação', () => {
    expect(tela).toMatch(/somenteLeitura=\{!!vendoComo\}/);
    expect(modal).toMatch(/<ListaSubtarefas[^>]*somenteLeitura=\{somenteLeitura\}/);
    expect(lista).toMatch(/const bloqueado = somenteLeitura \|\|/);
    expect(lista).toMatch(/if \(somenteLeitura\) return;/);
  });

  it('o modal de gerenciar a solicitação nunca abre na visão emprestada', () => {


    expect(tela).toMatch(/if \(t\.solicitacao_id && !vendoComo\)/);
  });
});
