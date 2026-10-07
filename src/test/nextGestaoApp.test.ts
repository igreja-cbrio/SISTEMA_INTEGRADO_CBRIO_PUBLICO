


















import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { semComentariosJs } from './_semComentarios';
import {
  podeGerenciarNext,
  podeEscreverNext,
  podeGerenciarTurmaApp,
  NIVEL_MINIMO_NEXT_APP,
} from '../../backend/utils/nextGestaoApp';

const RAIZ = join(__dirname, '..', '..');
const APP_JS = semComentariosJs(readFileSync(join(RAIZ, 'backend', 'routes', 'app.js'), 'utf8'));

const MEMBRO = '11111111-1111-1111-1111-111111111111';
const OUTRO = '22222222-2222-2222-2222-222222222222';

describe('alcança a gestão do Next no app', () => {
  it('escrita 2 na matriz entra, mesmo sem turma própria', () => {
    expect(podeGerenciarNext({ leitura: 0, escrita: 2, turmasProprias: 0 })).toBe(true);
  });

  it('só LEITURA já alcança a área — ver não é agir', () => {

    expect(podeGerenciarNext({ leitura: 3, escrita: 0, turmasProprias: 0 })).toBe(true);
  });

  it('o responsável de turma entra MESMO sem nível — a união não substitui a posse', () => {
    expect(podeGerenciarNext({ leitura: 0, escrita: 0, turmasProprias: 1 })).toBe(true);
    expect(podeGerenciarNext({ leitura: 1, escrita: 1, turmasProprias: 3 })).toBe(true);
  });

  it('nível 1 sem turma própria NÃO entra (leitura no web não é gestão no app)', () => {
    expect(podeGerenciarNext({ leitura: 1, escrita: 1, turmasProprias: 0 })).toBe(false);
  });

  it('sem nada não entra', () => {
    expect(podeGerenciarNext({})).toBe(false);
    expect(podeGerenciarNext({ leitura: 0, escrita: 0, turmasProprias: 0 })).toBe(false);
  });

  it('nível ilegível vale ZERO (fail-closed), nunca "passa porque veio algo"', () => {
    expect(podeGerenciarNext({ escrita: 'cinco' as unknown as number })).toBe(false);
    expect(podeGerenciarNext({ escrita: NaN })).toBe(false);
    expect(podeGerenciarNext({ leitura: null as unknown as number })).toBe(false);
    expect(podeGerenciarNext({ escrita: -3 })).toBe(false);
    expect(podeGerenciarNext({ turmasProprias: 'duas' as unknown as number })).toBe(false);
  });

  it('o mínimo é 2 — o mesmo do batismo no app', () => {
    expect(NIVEL_MINIMO_NEXT_APP).toBe(2);
  });
});

describe('⚠️⚠️ AGIR exige ESCRITA — o caso do revisor da App Store', () => {
  it('leitura 3 / escrita 0 ALCANÇA a área e NÃO escreve nada', () => {
    const revisor = { leitura: 3, escrita: 0, turmasProprias: 0 };
    expect(podeGerenciarNext(revisor)).toBe(true);
    expect(podeEscreverNext(revisor)).toBe(false);
  });

  it('escrita 2 escreve', () => {
    expect(podeEscreverNext({ leitura: 0, escrita: 2 })).toBe(true);
    expect(podeEscreverNext({ leitura: 5, escrita: 5 })).toBe(true);
  });

  it('escrita 1 NÃO escreve (o mínimo é 2, como no web)', () => {
    expect(podeEscreverNext({ leitura: 5, escrita: 1 })).toBe(false);
  });

  it('a POSSE continua escrevendo sem nível nenhum na matriz', () => {
    expect(podeEscreverNext({ leitura: 0, escrita: 0, turmasProprias: 1 })).toBe(true);
  });

  it('sem nada não escreve', () => {
    expect(podeEscreverNext({})).toBe(false);
    expect(podeEscreverNext({ leitura: 0, escrita: 0, turmasProprias: 0 })).toBe(false);
  });

  it('escrita ilegível vale ZERO (fail-closed)', () => {
    expect(podeEscreverNext({ escrita: 'dois' as unknown as number })).toBe(false);
    expect(podeEscreverNext({ escrita: NaN })).toBe(false);
    expect(podeEscreverNext({ escrita: -5 })).toBe(false);
  });
});

describe('agir NESTA turma', () => {
  it('escrita 2 age em turma de qualquer dono, e em turma sem dono', () => {
    expect(podeGerenciarTurmaApp({
      leitura: 0, escrita: 2, escrever: true, turma: { responsavel_id: OUTRO }, membroId: MEMBRO,
    })).toBe(true);
    expect(podeGerenciarTurmaApp({
      leitura: 0, escrita: 5, escrever: true, turma: { responsavel_id: null }, membroId: MEMBRO,
    })).toBe(true);
  });

  it('⚠️⚠️ leitura 3 / escrita 0 VÊ a turma e NÃO age nela', () => {
    const turma = { responsavel_id: OUTRO };
    expect(podeGerenciarTurmaApp({ leitura: 3, escrita: 0, turma, membroId: MEMBRO })).toBe(true);
    expect(podeGerenciarTurmaApp({
      leitura: 3, escrita: 0, escrever: true, turma, membroId: MEMBRO,
    })).toBe(false);
  });

  it('o default de `escrever` é LEITURA — quem esquecer o parâmetro não escala poder', () => {



    expect(podeGerenciarTurmaApp({ leitura: 3, escrita: 0, turma: { responsavel_id: OUTRO } })).toBe(true);
  });

  it('sem nível, só o próprio responsável age', () => {
    expect(podeGerenciarTurmaApp({
      escrita: 0, escrever: true, turma: { responsavel_id: MEMBRO }, membroId: MEMBRO,
    })).toBe(true);
    expect(podeGerenciarTurmaApp({
      escrita: 0, escrever: true, turma: { responsavel_id: OUTRO }, membroId: MEMBRO,
    })).toBe(false);
  });

  it('⚠️⚠️ turma SEM DONO + membro não resolvido NÃO libera (null === null é true em JS)', () => {



    expect(podeGerenciarTurmaApp({ escrita: 0, turma: { responsavel_id: null }, membroId: null })).toBe(false);
    expect(podeGerenciarTurmaApp({ escrita: 0, turma: { responsavel_id: null } })).toBe(false);
    expect(podeGerenciarTurmaApp({ leitura: 1, turma: {}, membroId: undefined })).toBe(false);
    expect(podeGerenciarTurmaApp({
      escrita: 0, escrever: true, turma: { responsavel_id: null }, membroId: null,
    })).toBe(false);
  });

  it('turma ausente é fail-closed', () => {
    expect(podeGerenciarTurmaApp({ leitura: 5, escrita: 5, turma: null, membroId: MEMBRO })).toBe(false);
    expect(podeGerenciarTurmaApp({ leitura: 5, escrita: 5, membroId: MEMBRO })).toBe(false);
  });

  it('compara como TEXTO (uuid vindo do banco × do corpo)', () => {
    expect(podeGerenciarTurmaApp({
      escrita: 0, escrever: true, turma: { responsavel_id: MEMBRO }, membroId: String(MEMBRO),
    })).toBe(true);
  });
});

describe('montagem em backend/routes/app.js', () => {
  it('os endpoints do Next usam a régua, não a comparação de posse solta', () => {
    expect(APP_JS).toContain("require('../utils/nextGestaoApp')");
    expect(APP_JS).toMatch(/podeGerenciarTurmaApp\(/);
  });

  it('⚠️ nenhuma comparação crua de `responsavel_id` sobrou nos endpoints do app', () => {

    expect(APP_JS).not.toMatch(/turma\.responsavel_id\s*!==\s*membro\.id/);
  });

  it('o nível sai da matriz pelo caminho canônico', () => {
    expect(APP_JS).toMatch(/permissaoModuloApp\(req,\s*'next'\)/);
  });

  it('⚠️⚠️ os 4 endpoints de ESCRITA carregam o gate de escrita', () => {


    const usos = APP_JS.match(/autorizarEscritaNextApp/g) || [];
    expect(usos.length).toBeGreaterThanOrEqual(5);
  });

  it('⚠️ e os 4 pedem a turma com `escrever: true`', () => {
    const usos = APP_JS.match(/escrever:\s*true/g) || [];
    expect(usos.length).toBeGreaterThanOrEqual(4);
  });

  it('o contexto separa leitura de escrita, nunca um `nivel` só', () => {
    expect(APP_JS).toMatch(/podeEscreverNext\(/);
    expect(APP_JS).not.toMatch(/podeGerenciarNext\(\s*\{\s*nivel\b/);
  });

  it('⚠️⚠️ ninguém lê um `ctx.nivel` — o campo NÃO existe e daria `undefined >= 2`', () => {



    expect(APP_JS).not.toMatch(/\bctx\.nivel\b/);
    expect(APP_JS).not.toMatch(/nextCtx\.nivel\b/);
    expect(APP_JS).toMatch(/Math\.max\(ctx\.leitura,\s*ctx\.escrita\)\s*>=\s*NIVEL_MINIMO_NEXT_APP/);
  });

  it('⚠️ `escreve` viaja pra tela, senão o botão aparece pra quem só lê', () => {
    expect(APP_JS).toMatch(/escreve:\s*ctx\.escreve/);
  });
});
