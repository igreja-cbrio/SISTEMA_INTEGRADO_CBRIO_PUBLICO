import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { semComentariosJs } from './_semComentarios';

const require = createRequire(import.meta.url);
const L = require('../../backend/utils/marketingLinha.js');

const EU = '11111111-1111-4111-8111-111111111111';
const OUTRO = '22222222-2222-4222-8222-222222222222';
const semanas27 = L.semanasDoAno(2027);

describe('semanas · domingo a sábado dentro do ano', () => {
  it('2027: semana 1 = 01/01–02/01 (sexta e sábado), semana 2 começa no domingo', () => {
    expect(semanas27[0]).toEqual({ n: 1, inicio: '2027-01-01', fim: '2027-01-02' });
    expect(semanas27[1]).toEqual({ n: 2, inicio: '2027-01-03', fim: '2027-01-09' });
  });
  it('a última semana termina em 31/12, sem vazar pro ano seguinte', () => {
    expect(semanas27[semanas27.length - 1].fim).toBe('2027-12-31');
    expect(semanas27.length).toBe(53);
  });
  it('data antes do ano = 0 (vem atrasada) · depois = null (fora)', () => {
    expect(L.semanaDe('2026-12-20', semanas27)).toBe(0);
    expect(L.semanaDe('2028-01-01', semanas27)).toBeNull();
    expect(L.semanaDe('2027-01-03', semanas27)).toBe(2);
  });
  it('timestamptz é lido em BRT: domingo 23h do Rio não vira segunda', () => {

    const antes = process.env.TZ;
    process.env.TZ = 'UTC';
    try {

      expect(L.semanaDe('2027-01-04T02:30:00Z', semanas27)).toBe(2);
      expect(L.dataSP('2027-01-04T02:30:00Z')).toBe('2027-01-03');
    } finally {
      if (antes === undefined) delete process.env.TZ; else process.env.TZ = antes;
    }
  });
  it('domingoDe devolve o domingo da semana civil', () => {
    expect(L.domingoDe('2026-09-30')).toBe('2026-09-27');
    expect(L.domingoDe('2026-09-27')).toBe('2026-09-27');
  });
});

describe('frenteDoCard', () => {

  it('evento → ins (Calendário) · todo o resto → sis (Requisições)', () => {
    expect(L.frenteDoCard({ event_id: 'e', origem: 'evento' })).toBe('ins');
    expect(L.frenteDoCard({ origem: 'evento' })).toBe('ins');
    expect(L.frenteDoCard({ campanha_id: 'c', origem: 'interna' })).toBe('sis');
    expect(L.frenteDoCard({ solicitacao_id: 's', origem: 'solicitacao' })).toBe('sis');
    expect(L.frenteDoCard({ origem: 'interna' })).toBe('sis');
    expect(L.frenteDoCard({})).toBe('sis');
  });
});



describe('Redes · Produção · frenteDoCard e a área da tarefa', () => {
  it('demanda interna com área redes → prd; sem área (ou área vazia) → sis', () => {
    expect(L.frenteDoCard({ origem: 'interna', area: 'redes' })).toBe('prd');
    expect(L.frenteDoCard({ area: 'redes' })).toBe('prd');
    expect(L.frenteDoCard({ origem: 'interna', area: null })).toBe('sis');
    expect(L.frenteDoCard({ origem: 'interna' })).toBe('sis');
  });
  it('⚠️ só demanda INTERNA vai para a Produção: evento, solicitação e campanha ficam onde a origem manda', () => {
    expect(L.frenteDoCard({ event_id: 'e', area: 'redes' })).toBe('ins');
    expect(L.frenteDoCard({ origem: 'evento', area: 'redes' })).toBe('ins');
    expect(L.frenteDoCard({ solicitacao_id: 's', area: 'redes' })).toBe('sis');
    expect(L.frenteDoCard({ origem: 'solicitacao', area: 'redes' })).toBe('sis');
    expect(L.frenteDoCard({ campanha_id: 'c', origem: 'interna', area: 'redes' })).toBe('sis');
  });
  it('ehTarefaInterna: nada de evento, solicitação nem campanha', () => {
    expect(L.ehTarefaInterna({ origem: 'interna' })).toBe(true);
    expect(L.ehTarefaInterna({ campanha_id: 'c' })).toBe(false);
    expect(L.ehTarefaInterna({ solicitacao_id: 's' })).toBe(false);
    expect(L.ehTarefaInterna({ event_id: 'e' })).toBe(false);
    expect(L.ehTarefaInterna(null)).toBe(false);
  });
  it('área desconhecida (ou herdada do objeto) NÃO vira frente', () => {
    expect(L.frenteDoCard({ origem: 'interna', area: 'toString' })).toBe('sis');
    expect(L.frenteDoCard({ origem: 'interna', area: 'institucional' })).toBe('sis');
  });
  it('validarAreaTarefa: ausente não mexe · vazio/null = Requisições · redes vale · o resto é ERRO, nunca coerção', () => {
    expect(L.validarAreaTarefa(undefined)).toEqual({ ausente: true });
    expect(L.validarAreaTarefa(null)).toEqual({ area: null });
    expect(L.validarAreaTarefa('')).toEqual({ area: null });
    expect(L.validarAreaTarefa('redes')).toEqual({ area: 'redes' });
    expect(L.validarAreaTarefa('Redes').erro).toBeTruthy();
    expect(L.validarAreaTarefa('toString').erro).toBeTruthy();
    expect(L.validarAreaTarefa(1).erro).toBeTruthy();
  });
});

describe('anotarAreaDasTarefas · leitura ISOLADA da área', () => {
  const S = require('../../backend/services/marketingAreaTarefa.js');
  function dbCom(resposta: { data?: unknown[]; error?: { code: string } | null }) {
    const chamadas: string[] = [];
    const q: Record<string, unknown> = {};
    for (const m of ['select', 'not', 'is', 'order']) q[m] = (...a: unknown[]) => { chamadas.push(`${m}:${String(a[0])}`); return q; };
    q.range = () => Promise.resolve({ data: resposta.data || [], error: resposta.error || null });
    return { db: { from: () => q }, chamadas };
  }
  it('anota a área em cada card; quem não tem área fica null', async () => {
    const { db, chamadas } = dbCom({ data: [{ id: 'c1', area: 'redes' }] });
    const cards: Array<{ id: string; area?: string | null }> = [{ id: 'c1' }, { id: 'c2' }];
    expect(await S.anotarAreaDasTarefas(cards, db)).toBeNull();
    expect(cards.map(c => c.area)).toEqual(['redes', null]);
    expect(chamadas[0]).toBe('select:id, area');
  });
  it('⚠️ coluna ausente (migration não aplicada) vira AVISO com o nome da migration, nunca erro', async () => {
    const { db } = dbCom({ error: { code: '42703' } });
    const cards: Array<{ id: string; area?: string | null }> = [{ id: 'c1' }];
    const aviso = await S.anotarAreaDasTarefas(cards, db);
    expect(aviso).toMatch(/20261001200000/);
    expect(cards[0].area).toBeNull();
  });
  it('outro erro do banco PROPAGA (mapa incompleto tiraria tarefa da Produção em silêncio)', async () => {
    const { db } = dbCom({ error: { code: '57014' } });
    await expect(S.anotarAreaDasTarefas([{ id: 'c1' }], db)).rejects.toBeTruthy();
  });
});

describe('migration da área da tarefa · o CHECK concorda com o código', () => {
  const sql = readFileSync(join(__dirname, '..', '..', 'supabase', 'migrations', '20261001200000_marketing_tarefa_area.sql'), 'utf8');
  it('a lista do CHECK é a mesma de AREAS_TAREFA', () => {
    const lista = sql.match(/area IN \(([^)]*)\)/)?.[1] || '';
    const doSql = [...lista.matchAll(/'([^']+)'/g)].map(m => m[1]).sort();
    expect(doSql).toEqual(Object.keys(L.AREAS_TAREFA).sort());
  });
  it('coluna nullable e idempotente (NULL = Requisições, que é o de sempre)', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS area text;/);
    expect(sql).not.toMatch(/area text NOT NULL/);
  });
});



describe('origemRequisicao · a origem é etiqueta', () => {
  it('veio de Solicitações → externa', () => {
    expect(L.origemRequisicao({ solicitacao_id: 's' })).toBe('externa');
    expect(L.origemRequisicao({ origem: 'solicitacao' })).toBe('externa');
  });
  it('⚠️ o card triado nasce origem "interna" — quem sabe de onde veio é a CAMPANHA', () => {
    expect(L.origemRequisicao({ origem: 'interna', campanha_id: 'c' }, { solicitacao_id: 's' })).toBe('externa');
    expect(L.origemRequisicao({ origem: 'interna', campanha_id: 'c' }, { solicitacao_id: null })).toBe('interna');
  });
  it('campanha que não foi possível ler conta como externa (não some da conta de quem pediu)', () => {
    expect(L.origemRequisicao({ origem: 'interna', campanha_id: 'c' }, null)).toBe('externa');
  });
  it('o líder pôs no quadro → interna', () => {
    expect(L.origemRequisicao({ origem: 'interna' })).toBe('interna');
    expect(L.origemRequisicao({})).toBe('interna');
    expect(L.origemRequisicao(null)).toBe('interna');
  });
});

describe('rotina por ÁREA (01/10 · Institucionais × Redes)', () => {
  it('cada área é uma frente; área desconhecida ou ausente fica em Institucionais', () => {
    expect(L.frenteDaArea('institucional')).toBe('rot');
    expect(L.frenteDaArea('redes')).toBe('red');
    expect(L.frenteDaArea(undefined)).toBe('rot');
    expect(L.frenteDaArea(null)).toBe('rot');
    expect(L.frenteDaArea('marketing')).toBe('rot');
    expect(L.frenteDaArea('toString')).toBe('rot');
  });
  it('as frentes de rotina são exatamente rot e red', () => {
    expect(L.ehFrenteRotina('rot')).toBe(true);
    expect(L.ehFrenteRotina('red')).toBe(true);
    for (const f of ['ins', 'sis', 'int', undefined, null]) expect(L.ehFrenteRotina(f)).toBe(false);
  });
  it('⚠️ o CHECK da migration concorda com a lista em código', () => {
    const sql = readFileSync(join(__dirname, '..', '..', 'supabase', 'migrations', '20261001140000_marketing_rotina_area.sql'), 'utf8');
    const check = sql.match(/CHECK \(area IN \(([^)]*)\)\)/);
    expect(check).not.toBeNull();
    const noBanco = (check as RegExpMatchArray)[1].split(',').map(s => s.trim().replace(/'/g, '')).sort();
    expect(noBanco).toEqual(Object.keys(L.AREAS_ROTINA).sort());
    expect(sql).toMatch(/DEFAULT 'institucional'/);
  });
});

describe('recortarCard · quem vê o quê', () => {
  const itens = [{ id: 'a', membro_id: EU }, { id: 'b', membro_id: OUTRO }];
  const base = { nivel: 0, meusMembroIds: [EU] };
  it('líder vê todos os itens de qualquer card, inclusive so_lider', () => {
    const r = L.recortarCard({ card: { visibilidade: 'so_lider' }, itens, ctx: { ...base, lider: true } });
    expect(r.papel).toBe('lider');
    expect(r.itens).toHaveLength(2);
  });
  it('so_lider some para a equipe', () => {
    expect(L.recortarCard({ card: { visibilidade: 'so_lider', atribuido_a: EU }, itens, ctx: { ...base, lider: false } })).toBeNull();
  });
  it('responsável do card vê todas as subtarefas', () => {
    const r = L.recortarCard({ card: { atribuido_a: EU }, itens, ctx: { ...base, lider: false } });
    expect(r.papel).toBe('responsavel');
    expect(r.itens).toHaveLength(2);
  });
  it('os demais só veem os próprios itens', () => {
    const r = L.recortarCard({ card: { atribuido_a: OUTRO }, itens, ctx: { ...base, lider: false } });
    expect(r.papel).toBe('dono');
    expect(r.itens.map((i: any) => i.id)).toEqual(['a']);
  });
  it('sem item seu, o card não aparece', () => {
    expect(L.recortarCard({ card: { atribuido_a: OUTRO }, itens: [{ id: 'b', membro_id: OUTRO }], ctx: { ...base, lider: false } })).toBeNull();
  });
  it('lider_move: o responsável do culto vê, mas não marca', () => {
    const r = L.recortarCard({
      card: { visibilidade: 'lider_move', atribuido_a: OUTRO }, itens,
      ctx: { ...base, lider: false, nivel: 5 }, responsaveisDoCulto: [EU],
    });
    expect(r.papel).toBe('responsavel');
    expect(r.itens.every((i: any) => i.pode_marcar === false)).toBe(true);
  });
  it('lider_move sem ser responsável do culto: não vê', () => {
    expect(L.recortarCard({ card: { visibilidade: 'lider_move', atribuido_a: OUTRO }, itens, ctx: { ...base, lider: false } })).toBeNull();
  });
});

describe('tarefaAberta', () => {
  it('card concluído não está aberto para quem vê o card inteiro', () => {
    expect(L.tarefaAberta({ estado: 'concluido', papel: 'responsavel', itens: [{ feito: false }] })).toBe(false);
  });
  it('quem só vê os próprios itens está em dia quando os DELE estão feitos', () => {
    expect(L.tarefaAberta({ estado: 'producao', papel: 'dono', itens: [{ feito: true }] })).toBe(false);
    expect(L.tarefaAberta({ estado: 'concluido', papel: 'dono', itens: [{ feito: false }] })).toBe(true);
  });
  it('card sem checklist e não concluído está aberto', () => {
    expect(L.tarefaAberta({ estado: 'backlog', papel: 'lider', itens: [] })).toBe(true);
  });
});

describe('statusFrente · pendência só até a semana atual', () => {
  it('aberta no futuro é previsto, não pendência', () => {
    expect(L.statusFrente([{ aberta: true, semana: 20 }], 10)).toMatchObject({ status: 'verde', pendentes: 0 });
  });


  it('aberta só na semana atual conta, mas fica verde e não é "atrasada"', () => {
    expect(L.statusFrente([{ aberta: true, semana: 10 }], 10)).toMatchObject({ status: 'verde', pendentes: 1, semanas_atrasadas: [] });
  });
  it('vermelho quando sobra semana que já passou; a da semana atual soma no total', () => {
    expect(L.statusFrente([{ aberta: true, semana: 9 }, { aberta: true, semana: 10 }, { aberta: false, semana: 8 }], 10))
      .toEqual({ status: 'vermelho', pendentes: 2, semanas_atrasadas: [9] });
  });
  it('aberta antes da semana atual entra em semanas_atrasadas', () => {
    expect(L.statusFrente([{ aberta: true, semana: 3 }, { aberta: true, semana: 0 }], 10).semanas_atrasadas).toEqual([0, 3]);
  });
});

describe('tarefasDaRotina', () => {


  const comp = [{ id: 'c1', descricao: 'Arte do culto', duracao_h: 4, participantes_ids: [EU, OUTRO], created_at: '2026-01-01' }];
  const semanas26 = L.semanasDoAno(2026);
  it('compromisso sem participante não vira tarefa de ninguém', () => {
    const t = L.tarefasDaRotina({
      compromissos: [{ ...comp[0], participantes_ids: [] }],
      execucoes: [], semanas: semanas26, ctx: { lider: true, meusMembroIds: [] },
    });
    expect(t).toEqual([]);
  });
  it('não cobra semanas antes da Fase 3 existir', () => {
    const t = L.tarefasDaRotina({ compromissos: comp, execucoes: [], semanas: semanas26, ctx: { lider: true, meusMembroIds: [] } });
    expect(t.every((x: any) => x.semana_inicio >= L.ROTINA_DESDE)).toBe(true);
  });
  it('quem não é líder só vê a própria rotina', () => {
    const t = L.tarefasDaRotina({ compromissos: comp, execucoes: [], semanas: semanas26, ctx: { lider: false, meusMembroIds: [OUTRO] } });
    expect(new Set(t.map((x: any) => x.membro_id))).toEqual(new Set([OUTRO]));
  });
  it('a frente vem de quem chama: Redes nasce "red", com id próprio', () => {
    const ctx = { lider: true, meusMembroIds: [] };
    const red = L.tarefasDaRotina({ compromissos: comp, execucoes: [], semanas: semanas26, ctx, frente: 'red' });
    const rot = L.tarefasDaRotina({ compromissos: comp, execucoes: [], semanas: semanas26, ctx });
    expect(red.length).toBeGreaterThan(0);
    expect(red.every((x: any) => x.frente === 'red' && x.id.startsWith('red-'))).toBe(true);

    expect(rot.every((x: any) => x.frente === 'rot' && x.id.startsWith('rot-'))).toBe(true);

    const ids = new Set(rot.map((x: any) => x.id));
    expect(red.some((x: any) => ids.has(x.id))).toBe(false);
  });
  it('execução gravada fecha o item daquela pessoa naquela semana', () => {
    const t = L.tarefasDaRotina({
      compromissos: comp, semanas: semanas26, ctx: { lider: true, meusMembroIds: [] },
      execucoes: [{ compromisso_id: 'c1', membro_id: EU, semana_inicio: '2026-09-27' }],
    });
    const minha = t.find((x: any) => x.membro_id === EU && x.semana_inicio === '2026-09-27');
    const dele = t.find((x: any) => x.membro_id === OUTRO && x.semana_inicio === '2026-09-27');
    expect(minha.aberta).toBe(false);
    expect(dele.aberta).toBe(true);
  });
});





describe('rota da linha · compromissos recorrentes', () => {
  const fonte = semComentariosJs(readFileSync(join(__dirname, '..', '..', 'backend', 'routes', 'marketingLinha.js'), 'utf8'));
  const selects = [...fonte.matchAll(/from\('marketing_compromissos_recorrentes'\)\s*\.select\('([^']*)'\)/g)].map(m => m[1]);



  it('as cinco leituras da tabela existem (rotina, área, rotina mensal, planejamento e autorizar a marcação)', () => {
    expect(selects.length).toBe(5);
  });




  it('⚠️ a rotina MENSAL vem em leitura isolada: a leitura principal não pede as colunas novas', () => {
    const principal = selects.find(s => s.split(',').map(x => x.trim()).includes('dia_semana'));
    expect(principal).toBeDefined();
    for (const c of ['frequencia', 'semana_do_mes', 'tipo']) {
      expect(principal!.split(',').map(x => x.trim())).not.toContain(c);
    }
  });

  it('nenhuma pede membro_id — quem participa vem de marketing_recorrentes_participantes', () => {
    for (const s of selects) expect(s.split(',').map(x => x.trim())).not.toContain('membro_id');
  });




  it('⚠️ a ÁREA vem numa leitura ISOLADA, só `id, area`', () => {
    const comArea = selects.filter(s => s.split(',').map(x => x.trim()).includes('area'));
    expect(comArea).toEqual(['id, area']);
  });

  it('coluna ausente vira aviso e Institucionais, nunca erro', () => {
    expect(fonte).toMatch(/ehColunaAusente = \(e\) => e && \(e\.code === '42703'/);
    expect(fonte).toMatch(/if \(!ehColunaAusente\(error\)\) throw error;/);
  });

  it('o quadro devolve as cinco frentes (os 3 quadros), e "int" não existe mais', () => {
    const bloco = fonte.split('const frentes = {')[1]?.split('};')[0] || '';
    expect(bloco).toMatch(/\bins:/);
    expect(bloco).toMatch(/\bsis:/);
    expect(bloco).toMatch(/\brot: frenteRotina\(rotinaInst\)/);
    expect(bloco).toMatch(/\bred: frenteRotina\(rotinaRedes\)/);
    expect(bloco).toMatch(/\bprd: \{ \.\.\.L\.statusFrente\(porFrente\('prd'\)/);
    expect(bloco).not.toMatch(/\bint:/);
  });

  it('a área da tarefa vem do serviço isolado, e gravar sem a coluna é 409 com o nome da migration', () => {
    expect(fonte).toMatch(/const avisoArea = await anotarAreaDasTarefas\(cards, supabase\);/);
    expect(fonte).toMatch(/falta aplicar a migration \$\{MIGRATION_AREA_TAREFA\}/);
    expect(fonte).toMatch(/if \(!va\.ausente && !L\.ehTarefaInterna\(card\)\)/);
    expect(fonte).toContain('pode_trocar_quadro: L.ehTarefaInterna(c)');
  });

  it('a etiqueta de origem e a entrega final saem do servidor', () => {
    expect(fonte).toContain("origem_req: L.frenteDoCard(c) === 'sis' ? L.origemRequisicao(c, camp) : null");
    expect(fonte).toContain('tem_entrega_final: !!camp');
    expect(fonte).toContain("origem_req: 'externa'");
  });
});
