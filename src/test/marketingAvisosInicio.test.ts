import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { join } from 'path';
import { semComentariosJs } from './_semComentarios';






const require = createRequire(import.meta.url);
const A = require('../../backend/utils/marketingAvisosInicio.js');
const C = require('../../backend/utils/marketingCicloAberto.js');
const { exigirLiderNaEscritaCom } = require('../../backend/services/marketingContexto.js');

const raiz = join(__dirname, '..', '..');
const ler = (p: string) => readFileSync(join(raiz, p), 'utf8');

const HOJE = '2026-10-02';

describe('avisos · validar texto e período', () => {
  const ok = (e: Record<string, unknown>, o: Record<string, unknown> = {}) => A.validarAviso(e, { hoje: HOJE, ...o });

  it('aviso certo volta normalizado: pontas aparadas, parágrafo mantido, linhas em branco juntadas', () => {
    const r = ok({ texto: '  Reunião às 10h \r\n\r\n\r\n\r\nTragam as pautas!  ', inicio: HOJE, fim: '2026-10-08' });
    expect(r).toEqual({ ok: true, valores: { texto: 'Reunião às 10h\n\nTragam as pautas!', inicio: HOJE, fim: '2026-10-08' } });
  });

  it('texto vazio, só espaço, não-texto ou longo demais volta com o motivo', () => {
    expect(ok({ texto: '   ', inicio: HOJE, fim: HOJE }).erro).toBe('Escreva o aviso.');
    expect(ok({ inicio: HOJE, fim: HOJE }).erro).toBe('Escreva o aviso.');
    expect(ok({ texto: 42, inicio: HOJE, fim: HOJE }).erro).toMatch(/precisa ser um texto/);
    expect(ok({ texto: 'x'.repeat(A.TEXTO_MAX), inicio: HOJE, fim: HOJE }).ok).toBe(true);
    expect(ok({ texto: 'x'.repeat(A.TEXTO_MAX + 1), inicio: HOJE, fim: HOJE }).erro).toMatch(/passou de 600 caracteres \(tem 601\)/);
  });

  it('data que não existe, ou fora do formato, não passa', () => {
    expect(ok({ texto: 'a', inicio: '2026-02-31', fim: '2026-10-08' }).erro).toMatch(/começa a aparecer/);
    expect(ok({ texto: 'a', inicio: '02/10/2026', fim: '2026-10-08' }).erro).toMatch(/começa a aparecer/);
    expect(ok({ texto: 'a', inicio: HOJE, fim: '' }).erro).toMatch(/até quando/);
  });

  it('o fim vem depois do início, e não pode já ter passado', () => {
    expect(ok({ texto: 'a', inicio: '2026-10-08', fim: '2026-10-07' }).erro).toBe('A data final vem antes da inicial.');
    expect(ok({ texto: 'a', inicio: '2026-09-20', fim: '2026-10-01' }).erro).toMatch(/01\/10\/2026\) já passou/);

    expect(ok({ texto: 'a', inicio: '2026-09-20', fim: HOJE }).ok).toBe(true);
    expect(ok({ texto: 'a', inicio: HOJE, fim: HOJE }).ok).toBe(true);
  });

  it('no máximo um ano no ar, e agendado até um ano à frente (pega o ano digitado errado)', () => {
    expect(ok({ texto: 'a', inicio: HOJE, fim: A.somarDias(HOJE, 365) }).ok).toBe(true);
    expect(ok({ texto: 'a', inicio: HOJE, fim: A.somarDias(HOJE, 366) }).erro).toMatch(/no máximo um ano/);
    const longe = A.somarDias(HOJE, 367);
    expect(ok({ texto: 'a', inicio: longe, fim: longe }).erro).toMatch(/até um ano à frente/);
    expect(ok({ texto: 'a', inicio: '2207-10-02', fim: '2207-10-05' }).ok).toBe(false);
  });

  it('na edição junta com o que já estava: mudar só o fim confere o período inteiro', () => {
    const atual = { texto: 'Fotos da equipe', inicio: '2026-09-28', fim: '2026-10-03' };
    expect(ok({ fim: '2026-10-10' }, { atual })).toEqual({ ok: true, valores: { ...atual, fim: '2026-10-10' } });
    expect(ok({ fim: '2026-09-27' }, { atual }).erro).toBe('A data final vem antes da inicial.');

    expect(ok({ texto: 'novo' }, { atual: { ...atual, fim: '2026-10-01' } }).erro).toMatch(/já passou/);

    expect(ok({ texto: undefined, inicio: undefined }, { atual }).ok).toBe(true);
    expect(ok({ texto: '' }, { atual }).erro).toBe('Escreva o aviso.');
  });

  it('sem o "hoje" do servidor a régua se recusa a decidir', () => {
    expect(() => A.validarAviso({ texto: 'a', inicio: HOJE, fim: HOJE }, {})).toThrow(/hoje inválido/);
  });
});

describe('avisos · no ar, agendado ou encerrado (os dois dias inclusive)', () => {
  it('o dia inicial e o final contam', () => {
    expect(A.estadoDoAviso({ inicio: HOJE, fim: HOJE }, HOJE)).toBe('vigente');
    expect(A.estadoDoAviso({ inicio: '2026-09-01', fim: HOJE }, HOJE)).toBe('vigente');
    expect(A.estadoDoAviso({ inicio: '2026-10-03', fim: '2026-10-09' }, HOJE)).toBe('agendado');
    expect(A.estadoDoAviso({ inicio: '2026-09-01', fim: '2026-10-01' }, HOJE)).toBe('encerrado');
    expect(A.estadoDoAviso(null, HOJE)).toBeNull();
  });

  it('separa o que mostrar: no ar (o mais novo primeiro) e agendados (o mais próximo primeiro)', () => {
    const r = A.separarAvisos([
      { id: 'velho', inicio: '2026-09-20', fim: '2026-10-05', created_at: '2026-09-20T10:00:00Z' },
      { id: 'novo', inicio: '2026-10-01', fim: '2026-10-05', created_at: '2026-10-01T10:00:00Z' },
      { id: 'mesmo-dia-depois', inicio: '2026-10-01', fim: '2026-10-02', created_at: '2026-10-01T15:00:00Z' },
      { id: 'longe', inicio: '2026-11-01', fim: '2026-11-02' },
      { id: 'perto', inicio: '2026-10-05', fim: '2026-10-06' },
      { id: 'acabou', inicio: '2026-09-01', fim: '2026-10-01' },
      { id: 'apagado', inicio: HOJE, fim: HOJE, deleted_at: '2026-10-02T09:00:00Z' },
      null,
    ], HOJE);
    expect(r.vigentes.map((a: { id: string }) => a.id)).toEqual(['mesmo-dia-depois', 'novo', 'velho']);
    expect(r.agendados.map((a: { id: string }) => a.id)).toEqual(['perto', 'longe']);
    expect(r.vigentes[0].estado).toBe('vigente');
    expect(r.agendados[0].estado).toBe('agendado');
  });
});

describe('ciclo com tarefa aberta · a conta do /dashboard', () => {
  const card = (id: string, event_id: string | null, estado = 'producao', extra: Record<string, unknown> = {}) =>
    ({ id, event_id, estado, ...extra });

  it('a régua das Demandas: subtarefa toda feita fecha, sem subtarefa conta o estado', () => {
    const r = C.abertasPorCiclo({
      cards: [
        card('k1', 'e1'),
        card('k2', 'e1'),
        card('k3', 'e1', 'concluido'),
        card('k4', 'e2', 'concluido'),
        card('k5', 'e3', 'fila'),
      ],
      itensPorCard: {
        k2: [{ feito: true }, { feito: true }],
        k5: [{ feito: true }, { feito: false }],
      },
    });
    expect(r).toEqual({ e1: 1, e2: 0, e3: 1 });
  });

  it('card apagado ou sem evento não conta', () => {
    const r = C.abertasPorCiclo({
      cards: [card('k1', 'e1', 'producao', { deleted_at: '2026-10-01T00:00:00Z' }), card('k2', null), null],
    });
    expect(r).toEqual({});
  });

  it('o espelho antigo: o card decide quando existe; sem card, o status da tarefa', () => {
    const r = C.abertasPorCiclo({
      tarefasLegado: [
        { id: 't1', event_id: 'e9', status: 'pendente' },
        { id: 't2', event_id: 'e9', status: 'concluida' },
        { id: 't3', event_id: 'e9', status: 'pendente' },
        { id: 't4', event_id: 'e9', status: 'concluida' },
      ],
      cardDaTarefa: { t1: card('m1', null, 'concluido'), t2: card('m2', null, 'producao') },
      tarefaFeita: (s: string) => s === 'concluida',
    });
    expect(r).toEqual({ e9: 2 });
  });

  it('⚠️ ciclo com card novo IGNORA o espelho antigo (a "Volta" já fecha as antigas: contar dobraria)', () => {
    const r = C.abertasPorCiclo({
      cards: [card('k1', 'e1')],
      tarefasLegado: [{ id: 't1', event_id: 'e1', status: 'pendente' }, { id: 't2', event_id: 'e2', status: 'pendente' }],
      tarefaFeita: () => false,
    });
    expect(r).toEqual({ e1: 1, e2: 1 });
  });

  it('sem nada lido devolve vazio (quem lê trata ausência como 0)', () => {
    expect(C.abertasPorCiclo()).toEqual({});
    expect(C.abertasPorCiclo({ cards: null, tarefasLegado: null })).toEqual({});
  });
});

describe('a trava do líder · mesma régua, mensagem dos avisos', () => {
  const rodar = async (mw: (req: unknown, res: unknown, next: () => void) => Promise<unknown>, method: string) => {
    const out: { status?: number; body?: { error?: string }; passou: boolean } = { passou: false };
    const res = {
      status(s: number) { out.status = s; return this; },
      json(b: { error?: string }) { out.body = b; return this; },
    };
    await mw({ method }, res, () => { out.passou = true; });
    return out;
  };

  it('a mensagem nova vale só para o 403; a de sempre continua sendo a padrão', async () => {
    const naoLider = async () => ({ lider: false });
    const avisos = await rodar(exigirLiderNaEscritaCom(naoLider, { mensagem: 'Só o líder do Marketing publica avisos no Início.' }), 'POST');
    expect(avisos).toEqual({ status: 403, body: { error: 'Só o líder do Marketing publica avisos no Início.' }, passou: false });
    const padrao = await rodar(exigirLiderNaEscritaCom(naoLider), 'PATCH');
    expect(padrao.body?.error).toBe('Só o líder do Marketing altera a configuração da equipe.');
  });

  it('leitura passa, líder passa, e sem conferir NÃO libera (503)', async () => {
    const lider = async () => ({ lider: true });
    const quebrado = async () => { throw new Error('banco fora'); };
    expect((await rodar(exigirLiderNaEscritaCom(quebrado), 'GET')).passou).toBe(true);
    expect((await rodar(exigirLiderNaEscritaCom(lider), 'DELETE')).passou).toBe(true);
    const r = await rodar(exigirLiderNaEscritaCom(quebrado, { mensagem: 'x' }), 'POST');
    expect(r.status).toBe(503);
    expect(r.passou).toBe(false);
  });
});

describe('guardas de estrutura', () => {
  const rota = semComentariosJs(ler('backend/routes/marketingAvisosInicio.js'));
  const servidor = semComentariosJs(ler('backend/server.js'));
  const mkt = semComentariosJs(ler('backend/routes/marketing.js'));
  const migration = ler('supabase/migrations/20261002150000_marketing_avisos_inicio.sql');

  it('a rota dos avisos monta ANTES do router geral do Marketing (senão ele a engole)', () => {
    const avisos = servidor.indexOf("app.use('/api/marketing/avisos-inicio'");
    const geral = servidor.indexOf("app.use('/api/marketing', require('./routes/marketing'))");
    expect(avisos).toBeGreaterThan(-1);
    expect(geral).toBeGreaterThan(avisos);
  });

  it('a rota exige o módulo, confere o líder na escrita e calcula o "hoje" de São Paulo', () => {
    expect(rota).toContain("router.use(authenticate)");
    expect(rota).toContain("router.use(authorizeModule('marketing', 1))");
    expect(rota).toMatch(/router\.use\(exigirLiderNaEscritaCom\(contextoSubtarefa,/);
    expect(rota).toContain('dataSP(new Date())');

    expect((rota.match(/A\.validarAviso\(/g) || []).length).toBe(2);

    expect(rota).not.toMatch(/\.delete\(\)/);

    expect(rota).toContain('agendados: lider ? agendados : []');
  });

  it('sem a tabela: leitura diz que não está disponível, escrita devolve 409 — nunca "não há aviso"', () => {
    expect(rota).toContain("e.code === '42P01' || e.code === 'PGRST205'");
    expect(rota).toContain('disponivel: false');
    expect((rota.match(/status\(409\)/g) || []).length).toBe(3);
  });

  it('a migration e a régua concordam no limite do texto e no período', () => {
    expect(migration).toContain(`BETWEEN 1 AND ${A.TEXTO_MAX}`);
    expect(migration).toContain('CHECK (fim >= inicio)');
    expect(migration).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(migration).toMatch(/TO anon, authenticated\s+USING \(false\)\s+WITH CHECK \(false\)/);
  });

  it('o /dashboard conta as tarefas abertas com leitura PAGINADA e devolve rolando_ok', () => {
    expect(mkt).toContain('abertasPorCiclo({');
    expect(mkt).toContain("lerEmLotesPaginado('marketing_card_checklist'");
    expect(mkt).toContain("lerEmLotesPaginado('marketing_kanban_cards'");
    expect(mkt).toMatch(/async function lerEmLotesPaginado[\s\S]{0,600}\.range\(de, de \+ 999\)/);
    expect(mkt).toContain('rolando_ok: rolandoOk');

    expect(mkt).toContain('semanas.some(s => s.eh_semana_atual)');
  });
});
