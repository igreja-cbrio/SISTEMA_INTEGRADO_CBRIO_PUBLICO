import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { semComentariosJs } from './_semComentarios';



const require = createRequire(import.meta.url);
const C = require('../../backend/utils/marketingCargaPessoa.js');

const SA = 40;
const membros = [
  { id: 'm-leticia', nome: 'Letícia', habilidade: 'designer', horas_semanais: 30 },
  { id: 'm-caua', nome: 'Cauã', habilidade: 'videomaker', horas_semanais: 40 },
];
const item = (id, extra = {}) => ({ id, feito: false, membro_id: null, esforco_valor: 0, esforco_unidade: 'horas', prazo: null, ...extra });

function calcular(extra = {}) {
  return C.cargaPorPessoa({ membros, semanaAtual: SA, horizonte: 4, semanaDoItem: () => null, ...extra });
}
const celula = (r, id, sem) => r.pessoas.find(p => p.id === id).semanas[sem];

describe('cargaPorPessoa', () => {
  it('a janela é a semana atual e as próximas', () => {
    expect(calcular().semanas).toEqual([40, 41, 42, 43]);
    expect(C.semanasDaJanela(52, 4, 53)).toEqual([52, 53]);
  });

  it('capacidade = horas por semana; livre = capacidade − rotina − demandas', () => {
    const r = calcular({
      tarefas: [{ id: 't1', frente: 'sis', atribuido_a: 'm-leticia', semana: 41, aberta: true,
        itens: [item('a', { membro_id: 'm-leticia', esforco_valor: 6 })] }],
      rotina: [{ membro_id: 'm-leticia', semana: 41, itens: [{ esforco_valor: 4, feito: true }] }],
    });
    expect(celula(r, 'm-leticia', 41)).toMatchObject({ capacidade: 30, rotina_h: 4, demandas_h: 6, livre: 20, tarefas: 1 });
  });

  it('subtarefa SEM dono pesa em quem é responsável pela tarefa', () => {
    const r = calcular({
      tarefas: [{ id: 't1', frente: 'ins', atribuido_a: 'm-caua', semana: 40, aberta: true,
        itens: [item('a', { esforco_valor: 3 })] }],
    });
    expect(celula(r, 'm-caua', 40).demandas_h).toBe(3);
  });

  it('dias viram horas (8h por dia)', () => {
    const r = calcular({
      tarefas: [{ id: 't1', frente: 'sis', atribuido_a: 'm-caua', semana: 40, aberta: true,
        itens: [item('a', { membro_id: 'm-caua', esforco_valor: 2, esforco_unidade: 'dias' })] }],
    });
    expect(celula(r, 'm-caua', 40).demandas_h).toBe(16);
  });

  it('o ATRASADO pesa na semana ATUAL (e é contado como atrasado)', () => {
    const r = calcular({
      tarefas: [{ id: 't1', frente: 'sis', atribuido_a: 'm-caua', semana: 37, aberta: true,
        itens: [item('a', { membro_id: 'm-caua', esforco_valor: 5 })] }],
    });
    expect(celula(r, 'm-caua', 40)).toMatchObject({ demandas_h: 5, tarefas: 1, atrasadas: 1 });
  });

  it('subtarefa sem horas não some: vira "sem estimativa"', () => {
    const r = calcular({
      tarefas: [{ id: 't1', frente: 'sis', atribuido_a: 'm-caua', semana: 41, aberta: true,
        itens: [item('a', { membro_id: 'm-caua' }), item('b', { membro_id: 'm-caua', esforco_valor: 2 })] }],
    });
    expect(celula(r, 'm-caua', 41)).toMatchObject({ demandas_h: 2, sem_estimativa: 1, tarefas: 1 });
  });

  it('tarefa sem subtarefa conta como tarefa do responsável, sem estimativa', () => {
    const r = calcular({ tarefas: [{ id: 't1', frente: 'sis', atribuido_a: 'm-leticia', semana: 42, aberta: true, itens: [] }] });
    expect(celula(r, 'm-leticia', 42)).toMatchObject({ tarefas: 1, sem_estimativa: 1, demandas_h: 0 });
  });

  it('a mesma tarefa com várias subtarefas conta UMA vez na semana', () => {
    const r = calcular({
      tarefas: [{ id: 't1', frente: 'sis', atribuido_a: 'm-caua', semana: 40, aberta: true,
        itens: [item('a', { membro_id: 'm-caua', esforco_valor: 1 }), item('b', { membro_id: 'm-caua', esforco_valor: 2 })] }],
    });
    expect(celula(r, 'm-caua', 40)).toMatchObject({ tarefas: 1, demandas_h: 3 });
  });

  it('subtarefa feita e tarefa fechada não pesam; pedido e rotina-como-tarefa são ignorados', () => {
    const r = calcular({
      tarefas: [
        { id: 't1', frente: 'sis', atribuido_a: 'm-caua', semana: 40, aberta: true, itens: [item('a', { membro_id: 'm-caua', esforco_valor: 9, feito: true }), item('b', { membro_id: 'm-caua', esforco_valor: 1 })] },
        { id: 't2', frente: 'sis', atribuido_a: 'm-caua', semana: 40, aberta: false, itens: [item('c', { membro_id: 'm-caua', esforco_valor: 9 })] },


        { id: 'p1', frente: 'sis', tipo: 'pedido', atribuido_a: 'm-caua', semana: 40, aberta: true, itens: [] },
        { id: 'r1', frente: 'rot', atribuido_a: 'm-caua', semana: 40, aberta: true, itens: [item('d', { membro_id: 'm-caua', esforco_valor: 5 })] },

        { id: 'r2', frente: 'red', atribuido_a: 'm-caua', semana: 40, aberta: true, itens: [item('g', { membro_id: 'm-caua', esforco_valor: 2 })] },
      ],
    });
    expect(celula(r, 'm-caua', 40)).toMatchObject({ demandas_h: 1, tarefas: 1 });
  });

  it('a semana do ITEM vence a da tarefa', () => {
    const r = calcular({
      semanaDoItem: (i: { id: string }) => (i.id === 'a' ? 42 : null),
      tarefas: [{ id: 't1', frente: 'sis', atribuido_a: 'm-caua', semana: 43, aberta: true,
        itens: [item('a', { membro_id: 'm-caua', esforco_valor: 2 }), item('b', { membro_id: 'm-caua', esforco_valor: 3 })] }],
    });
    expect(celula(r, 'm-caua', 42).demandas_h).toBe(2);
    expect(celula(r, 'm-caua', 43).demandas_h).toBe(3);
  });

  it('férias/folga troca a capacidade da semana', () => {
    const r = calcular({ folgas: [{ membro_id: 'm-leticia', semana: 41, horas_disponiveis: 0, motivo: 'Férias' }] });
    expect(celula(r, 'm-leticia', 41)).toMatchObject({ capacidade: 0, folga: { horas: 0, motivo: 'Férias' } });
    expect(celula(r, 'm-leticia', 40).capacidade).toBe(30);
  });

  it('fora da janela não entra; pessoa de fora da equipe não entra', () => {
    const r = calcular({
      tarefas: [
        { id: 't1', frente: 'sis', atribuido_a: 'm-caua', semana: 50, aberta: true, itens: [item('a', { membro_id: 'm-caua', esforco_valor: 8 })] },
        { id: 't2', frente: 'sis', atribuido_a: 'm-fora', semana: 40, aberta: true, itens: [item('b', { membro_id: 'm-fora', esforco_valor: 8 })] },
      ],
    });
    expect(Object.values(r.pessoas.find(p => p.id === 'm-caua').semanas).every((c: { demandas_h: number }) => c.demandas_h === 0)).toBe(true);
    expect(r.pessoas.map(p => p.id).sort()).toEqual(['m-caua', 'm-leticia']);
  });

  it('pessoas em ordem de nome com acento', () => {
    expect(calcular().pessoas.map(p => p.nome)).toEqual(['Cauã', 'Letícia']);
  });
});

describe('ocupacao', () => {
  it('uso sobre a capacidade', () => {
    expect(C.ocupacao({ capacidade: 40, rotina_h: 10, demandas_h: 10 })).toBe(0.5);
  });
  it('sem capacidade: sobrecarga se há trabalho, nada a medir se não há', () => {
    expect(C.ocupacao({ capacidade: 0, rotina_h: 0, demandas_h: 2 })).toBe(Infinity);
    expect(C.ocupacao({ capacidade: 0, rotina_h: 0, demandas_h: 0 })).toBeNull();
  });
});


describe('resumoDaEquipe', () => {
  const pessoa = (id: string, sem: Record<string, unknown>) => ({ id, nome: id, semanas: { 40: sem } });
  const cel = (extra = {}) => ({ capacidade: 30, rotina_h: 0, demandas_h: 0, sem_estimativa: 0, ...extra });

  it('horas usadas sobre horas disponíveis de quem executa', () => {
    const r = C.resumoDaEquipe({ semanas: [40], pessoas: [
      pessoa('a', cel({ rotina_h: 5, demandas_h: 10 })),
      pessoa('b', cel({ capacidade: 20, demandas_h: 5 })),
    ] });
    expect(r).toMatchObject({ semana: 40, pessoas: 2, usado_h: 20, capacidade_h: 50, pct: 40, motivo: null });
  });

  it('a coordenação fica fora da conta e é declarada à parte', () => {
    const r = C.resumoDaEquipe({ semanas: [40], pessoas: [
      pessoa('a', cel({ demandas_h: 15 })),
      pessoa('pedro', cel({ capacidade: 40, demandas_h: 60 })),
    ] }, { excluir: ['pedro'] });
    expect(r).toMatchObject({ pessoas: 1, usado_h: 15, capacidade_h: 30, pct: 50, coordenacao_h: 60 });
  });

  it('trabalho aberto sem NENHUMA hora não é medido (seria só a rotina)', () => {
    const r = C.resumoDaEquipe({ semanas: [40], pessoas: [pessoa('a', cel({ rotina_h: 4, sem_estimativa: 3 }))] });
    expect(r).toMatchObject({ pct: null, motivo: 'sem_estimativa', sem_estimativa: 3 });
  });

  it('com parte das horas estimada, mede e conta o que ficou de fora', () => {
    const r = C.resumoDaEquipe({ semanas: [40], pessoas: [pessoa('a', cel({ demandas_h: 6, sem_estimativa: 2 }))] });
    expect(r).toMatchObject({ pct: 20, sem_estimativa: 2, motivo: null });
  });

  it('todo mundo de folga não vira divisão por zero', () => {
    const r = C.resumoDaEquipe({ semanas: [40], pessoas: [pessoa('a', cel({ capacidade: 0, demandas_h: 3 }))] });
    expect(r).toMatchObject({ pct: null, motivo: 'sem_capacidade' });
  });

  it('só a coordenação ativa: não há equipe para medir', () => {
    const r = C.resumoDaEquipe({ semanas: [40], pessoas: [pessoa('pedro', cel({ demandas_h: 9 }))] }, { excluir: ['pedro'] });
    expect(r).toMatchObject({ pct: null, motivo: 'sem_equipe', coordenacao_h: 9 });
  });

  it('sem trabalho nenhum, zero é medição (a equipe está livre)', () => {
    const r = C.resumoDaEquipe({ semanas: [40], pessoas: [pessoa('a', cel())] });
    expect(r).toMatchObject({ pct: 0, motivo: null });
  });
});

describe('semanaDoItemPor', () => {
  const semanaDe = (d: string) => (d.startsWith('2026') ? 41 : null);

  it('prazo fora do ano não cai na semana da tarefa', () => {
    const f = C.semanaDoItemPor(semanaDe);
    expect(f({ prazo: '2027-01-05' })).toBe(Number.POSITIVE_INFINITY);
    const r = calcular({
      semanaDoItem: f,
      tarefas: [{ id: 't1', frente: 'sis', atribuido_a: 'm-caua', semana: 40, aberta: true,
        itens: [item('a', { membro_id: 'm-caua', esforco_valor: 7, prazo: '2027-01-05' })] }],
    });
    expect(Object.values(r.pessoas.find((p: { id: string }) => p.id === 'm-caua').semanas)
      .every((c: { demandas_h: number }) => c.demandas_h === 0)).toBe(true);
  });

  it('sem prazo no item, vale a semana da tarefa', () => {
    expect(C.semanaDoItemPor(semanaDe)({ prazo: null })).toBeNull();
    expect(C.semanaDoItemPor(semanaDe)({ prazo: '2026-10-06' })).toBe(41);
  });
});

describe('MKT-DEM-CAP em horas · guardas', () => {
  const raiz = join(__dirname, '..', '..');
  const ler = (rel: string) => semComentariosJs(readFileSync(join(raiz, rel), 'utf8'));

  it('o coletor usa a régua da visão Por pessoa e não mede mais em slots', () => {
    const src = ler('backend/services/kpiAutoCollector.js');
    const ini = src.indexOf("'marketing.razao_demanda_capacidade'");
    const bloco = src.slice(ini, src.indexOf('\n  },', ini));
    expect(bloco).toContain('lerCargaEquipe(');
    expect(bloco).toContain('MKT_CARGA.resumoDaEquipe(');
    expect(bloco).not.toContain('slots_dia');
    expect(bloco).toContain('if (!(inicio <= hoje && hoje < fim)) return null;');
  });

  it('a tela e o KPI usam a mesma semana do item', () => {
    expect(ler('backend/routes/marketingLinha.js')).toContain('semanaDoItem: CP.semanaDoItemPor(');
    expect(ler('backend/services/marketingCargaEquipe.js')).toContain('semanaDoItem: CP.semanaDoItemPor(');
  });
});



describe('minhaSemana · o número do Início', () => {
  const eu = ['m-leticia'];
  const minha = (extra = {}) => C.minhaSemana({ membros, semanaAtual: SA, semanaDoItem: () => null, meusIds: eu, ...extra });
  const tarefa = (id, frente, semana, itens, extra = {}) => ({ id, frente, atribuido_a: 'm-leticia', semana, aberta: true, itens, ...extra });

  it('quem não é da equipe recebe null, nunca zero', () => {
    expect(minha({ meusIds: ['m-outra'] })).toBeNull();
    expect(minha({ meusIds: [] })).toBeNull();
    expect(minha({ semanaAtual: 0 })).toBeNull();
  });

  it('bate com a célula da semana atual da visão Por pessoa', () => {
    const tarefas = [
      tarefa('t1', 'ins', SA, [item('a', { membro_id: 'm-leticia', esforco_valor: 3 })]),
      tarefa('t2', 'sis', SA - 2, [item('b', { membro_id: 'm-leticia' })]),
      tarefa('t3', 'sis', SA + 1, [item('c', { membro_id: 'm-leticia' })]),
    ];
    const r = minha({ tarefas });
    const cel = celula(calcular({ tarefas }), 'm-leticia', SA);
    expect(r.tarefas).toBe(cel.tarefas);
    expect(r.atrasadas).toBe(cel.atrasadas);
    expect(r).toMatchObject({ semana: SA, tarefas: 2, atrasadas: 1, sem_estimativa: 1, demandas_h: 3 });
  });

  it('separa por frente e a soma fecha com o total; rotina e pedido não são tarefa', () => {
    const r = minha({
      tarefas: [
        tarefa('t1', 'ins', SA, [item('a', { membro_id: 'm-leticia' })]),
        tarefa('t2', 'ins', SA, [item('b', { membro_id: 'm-leticia' })]),
        tarefa('t3', 'sis', SA, []),
        tarefa('t4', 'sis', SA, [item('c')]),
        tarefa('t5', 'rot', SA, [item('d', { membro_id: 'm-leticia' })]),
        tarefa('t7', 'red', SA, [item('e', { membro_id: 'm-leticia' })]),
        tarefa('t6', 'sis', SA, [], { tipo: 'pedido' }),
        tarefa('t8', 'prd', SA, [item('f', { membro_id: 'm-leticia' })]),
      ],
    });


    expect(r.por_frente).toEqual({ ins: 2, sis: 2, prd: 1 });
    expect(r.tarefas).toBe(5);
  });

  it('a rotina conta os compromissos da semana e quantos já foram feitos', () => {
    const r = minha({
      rotina: [
        { membro_id: 'm-leticia', semana: SA, itens: [{ feito: true }, { feito: false }] },
        { membro_id: 'm-leticia', semana: SA + 1, itens: [{ feito: false }] },
        { membro_id: 'm-caua', semana: SA, itens: [{ feito: false }] },
      ],
    });
    expect(r.rotina).toEqual({ total: 2, feitas: 1 });
  });

  it('a rotina se separa por área (Institucionais × Redes) e a soma fecha', () => {
    const r = minha({
      rotina: [
        { frente: 'rot', membro_id: 'm-leticia', semana: SA, itens: [{ feito: true }, { feito: false }] },
        { frente: 'red', membro_id: 'm-leticia', semana: SA, itens: [{ feito: false }, { feito: false }, { feito: true }] },

        { membro_id: 'm-leticia', semana: SA, itens: [{ feito: false }] },
        { frente: 'red', membro_id: 'm-caua', semana: SA, itens: [{ feito: false }] },
      ],
    });
    expect(r.rotina_por_frente).toEqual({ rot: { total: 3, feitas: 1 }, red: { total: 3, feitas: 1 } });
    expect(r.rotina).toEqual({ total: 6, feitas: 2 });
  });

  it('a rota calcula para quem está vendo, pela mesma régua', () => {
    const src = semComentariosJs(readFileSync(join(__dirname, '..', '..', 'backend/routes/marketingLinha.js'), 'utf8'));
    expect(src).toContain('CP.minhaSemana(');
    expect(src).toContain('meusIds: ctx.meusMembroIds');
    expect(src).toContain('minha_semana: minhaSemana');
  });
});
