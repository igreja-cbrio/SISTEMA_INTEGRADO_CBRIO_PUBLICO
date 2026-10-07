import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';




const require = createRequire(import.meta.url);
const P = require('../../backend/utils/marketingPainel.js');
const L = require('../../backend/utils/marketingLinha.js');

const HOJE = '2026-09-30';

const card = (id: string, extra: Record<string, unknown> = {}) => ({
  id, estado: 'producao', origem: null, culto: null, atribuido_a: 'm1', event_id: null,
  campanha_id: null, solicitacao_id: null, data_fim: null, prazo_producao: null,
  prazo_confirmado: null, prazo_preliminar: null, ...extra,
});
const item = (id: string, extra: Record<string, unknown> = {}) => ({
  id, feito: false, membro_id: null, esforco_valor: 0, esforco_unidade: 'horas', prazo: null, ...extra,
});

describe('semana e faixas do horizonte', () => {
  it('a semana é domingo→sábado, e nunca começa antes de 1º de janeiro', () => {
    expect(P.inicioDaSemana(HOJE)).toBe('2026-09-27');
    expect(P.fimDaSemana(HOJE)).toBe('2026-10-03');
    expect(P.inicioDaSemana('2026-01-01')).toBe('2026-01-01');
  });

  it('cada dia cai numa faixa: vencidas, semanas 0..8, depois ou sem prazo', () => {
    expect(P.faixaDoHorizonte('2026-09-26', HOJE)).toBe('vencidas');
    expect(P.faixaDoHorizonte('2026-09-27', HOJE)).toBe(0);
    expect(P.faixaDoHorizonte('2026-10-03', HOJE)).toBe(0);
    expect(P.faixaDoHorizonte('2026-10-04', HOJE)).toBe(1);
    expect(P.faixaDoHorizonte('2026-11-28', HOJE)).toBe(8);
    expect(P.faixaDoHorizonte('2026-11-29', HOJE)).toBe('depois');
    expect(P.faixaDoHorizonte(null, HOJE)).toBe('sem_prazo');
  });

  it('o dia é o de São Paulo: 23h do sábado não vira domingo', () => {

    expect(P.faixaDoHorizonte('2026-09-27T02:00:00Z', HOJE)).toBe('vencidas');
  });
});

describe('peças abertas', () => {
  it('tarefa aberta sem subtarefa conta como UMA peça; concluída não conta', () => {
    const tarefas = P.montarTarefas([
      card('a', { data_fim: '2026-10-01' }),
      card('b', { estado: 'concluido', data_fim: '2026-10-01' }),
    ], {});
    const pecas = P.pecasAbertas(tarefas);
    expect(pecas).toHaveLength(1);
    expect(pecas[0]).toMatchObject({ tarefa_id: 'a', subtarefa: false, dia: '2026-10-01' });
  });

  it('só a subtarefa ABERTA vira peça, no prazo dela (senão no da tarefa)', () => {
    const tarefas = P.montarTarefas([card('a', { data_fim: '2026-10-10' })], {
      a: [
        item('i1', { feito: true, prazo: '2026-09-28' }),
        item('i2', { prazo: '2026-09-28', membro_id: 'm2', esforco_valor: 2 }),
        item('i3'),
      ],
    });
    const pecas = P.pecasAbertas(tarefas);
    expect(pecas.map((p: any) => p.dia)).toEqual(['2026-09-28', '2026-10-10']);
    expect(pecas[0]).toMatchObject({ membro_id: 'm2', horas: 2, subtarefa: true });
  });

  it('o prazo da tarefa segue a régua das Demandas (data_fim primeiro)', () => {
    const [t] = P.montarTarefas([card('a', { data_fim: '2026-10-02', prazo_producao: '2026-10-20' })], {});
    expect(t.prazo).toBe('2026-10-02');

    expect(t.frente).toBe('sis');
  });

  it('o horizonte FECHA: a soma das faixas + sem prazo é o total', () => {
    const tarefas = P.montarTarefas([
      card('v', { data_fim: '2026-09-20', culto: 'ami' }),
      card('s', { data_fim: '2026-09-30', culto: 'cbrio' }),
      card('s2', { data_fim: '2026-10-01', culto: 'cbrio' }),
      card('f', { data_fim: '2027-01-15' }),
      card('n'),
    ], {});
    const h = P.horizonteDePecas(P.pecasAbertas(tarefas), HOJE);
    const soma = h.faixas.reduce((a: number, f: any) => a + f.total, 0) + h.sem_prazo;
    expect(soma).toBe(h.total);
    expect(h.total).toBe(5);
    expect(h.sem_prazo).toBe(1);
    const semana = h.faixas.find((f: any) => f.chave === 0);
    expect(semana.total).toBe(2);
    expect(semana.por_culto).toEqual({ cbrio: 2 });
    expect(h.faixas.find((f: any) => f.chave === 'vencidas').por_culto).toEqual({ ami: 1 });
    expect(h.faixas.find((f: any) => f.chave === 'depois').por_culto).toEqual({ sem_culto: 1 });
    expect(h.pico).toBe(0);
  });
});

describe('topo', () => {
  const tarefas = P.montarTarefas([
    card('atrasada', { data_fim: '2026-09-20', event_id: 'e1' }),
    card('desta-semana', { data_fim: '2026-10-02', campanha_id: 'c1' }),
    card('sem-prazo'),
  ], {});
  const pecas = P.pecasAbertas(tarefas);

  it('com atraso = prazo de semana que JÁ PASSOU; o que vence nesta semana está em dia', () => {
    const t = P.resumoDoTopo({ tarefas, pecas, pedidos: [], hoje: HOJE });
    expect(t.demandas_abertas).toBe(3);
    expect(t.com_atraso).toBe(1);
    expect(t.com_atraso_por_frente).toEqual({ ins: 1 });
    expect(t.pecas_vencidas).toBe(1);
    expect(t.pecas_nesta_semana).toBe(1);
    expect(t.sem_prazo).toBe(1);
  });

  it('sem a fila de pedidos, os números de pedido são NULL, nunca zero', () => {
    const t = P.resumoDoTopo({ tarefas, pecas, pedidos: null, hoje: HOJE });
    expect(t.pedidos_esperando).toBeNull();
    expect(t.pedido_mais_antigo_dias).toBeNull();
    expect(t.pedidos_no_diretor).toBeNull();
  });

  it('quem está no diretor de origem não conta como esperando o Marketing', () => {
    const pedidos = [
      { status: 'aguardando_alocacao', dias: 40 },
      { status: 'aguardando_aprovacao', dias: 90 },
    ];
    const t = P.resumoDoTopo({ tarefas, pecas, pedidos, hoje: HOJE });
    expect(t.pedidos_esperando).toBe(1);
    expect(t.pedido_mais_antigo_dias).toBe(40);
    expect(t.pedidos_no_diretor).toBe(1);
  });
});

describe('pedidos abertos (a régua da frente Sistema)', () => {
  const sols = [
    { id: 's-diretor', status: 'aguardando_aprovacao_origem' },
    { id: 's-triagem', status: 'em_analise' },
    { id: 's-com-card', status: 'em_analise' },
    { id: 's-fechada', status: 'concluido' },
    { id: 's-camp-com-card', status: 'em_analise' },
    { id: 's-sem-camp', status: 'aberto' },
  ];
  const camps = [
    { id: 'c-triagem', solicitacao_id: 's-triagem', status: 'triagem' },
    { id: 'c-com-card', solicitacao_id: 's-camp-com-card', status: 'ativa' },
  ];
  const cards = [{ solicitacao_id: 's-com-card' }, { campanha_id: 'c-com-card' }];

  it('fechada e com tarefa ficam de fora; o resto ganha o estado certo', () => {
    const r = L.pedidosAbertos({ solicitacoes: sols, campanhas: camps, cards });
    const porId = Object.fromEntries(r.map((x: any) => [x.sol.id, x.status]));
    expect(porId).toEqual({
      's-diretor': 'aguardando_aprovacao',
      's-triagem': 'aguardando_alocacao',
      's-sem-camp': 'sem_tarefa',
    });
  });
});

describe('fila de pedidos', () => {
  const abertos = [
    { sol: { id: 'a', created_at: '2026-08-01T12:00:00Z', area_cliente: 'kids', titulo: 'QR codes', data_necessaria: '2026-08-09' }, campanha: null, status: 'aguardando_alocacao' },
    { sol: { id: 'b', created_at: '2026-09-20T12:00:00Z', area_cliente: 'kids', eh_urgente: true }, campanha: { titulo: 'Arte' }, status: 'sem_tarefa' },
    { sol: { id: 'c', created_at: '2026-09-01T12:00:00Z', area_cliente: ' ami ' }, campanha: null, status: 'aguardando_aprovacao' },
  ];

  it('o título só vai para o líder', () => {
    expect(P.filaDePedidos(abertos, HOJE).pontos.every((p: any) => p.titulo === null)).toBe(true);
    const lider = P.filaDePedidos(abertos, HOJE, { comTitulo: true });
    expect(lider.pontos.find((p: any) => p.id === 'b').titulo).toBe('Arte');
  });

  it('ordena pelo mais antigo e separa quem está no diretor', () => {
    const f = P.filaDePedidos(abertos, HOJE);
    expect(f.pontos.map((p: any) => p.id)).toEqual(['a', 'c', 'b']);
    expect(f.pontos[0].dias).toBe(60);
    expect(f.esperando).toBe(2);
    expect(f.no_diretor).toBe(1);
    expect(f.mais_antigo_dias).toBe(60);
    expect(f.pontos.find((p: any) => p.id === 'c').area).toBe('ami');
  });

  it('as áreas somam os pedidos e guardam a espera mais longa', () => {
    const f = P.filaDePedidos(abertos, HOJE);
    expect(f.areas[0]).toMatchObject({ area: 'kids', total: 2, esperando: 2, max_dias: 60 });
  });

  it('registro em triagem sem solicitação aberta é DECLARADO, não entra na fila', () => {
    const r = P.pedidosSemSolicitacaoViva({
      campanhas: [
        { id: 'x1', status: 'triagem', solicitacao_id: 's1' },
        { id: 'x2', status: 'triagem', solicitacao_id: 's2' },
        { id: 'x3', status: 'triagem', solicitacao_id: 's3' },
        { id: 'x4', status: 'triagem', solicitacao_id: null },
      ],
      cards: [{ campanha_id: 'x3' }],
      solicitacoesPorId: { s1: { status: 'concluido' }, s2: { status: 'em_analise' }, s3: { status: 'concluido' } },
    });
    expect(r.map((x: any) => [x.id, x.motivo])).toEqual([['x1', 'solicitacao_fechada'], ['x4', 'sem_solicitacao']]);
  });
});

describe('ciclos até o Dia D', () => {
  const tarefas = P.montarTarefas([
    card('p1', { event_id: 'e1', estado: 'concluido', data_fim: '2026-09-10' }),
    card('p2', { event_id: 'e1', data_fim: '2026-09-20' }),
    card('p3', { event_id: 'e1', data_fim: '2026-10-01' }),
    card('q1', { event_id: 'e2', estado: 'concluido', data_fim: '2026-09-01' }),
  ], {});

  it('deviam = semanas que já passaram; vencidas = as que ficaram abertas', () => {
    const r = P.andamentoDosCiclos({ ciclos: [{ event_id: 'e1', nome: 'Série A', dia_d: '2026-10-11' }], tarefas, hoje: HOJE });
    expect(r.linhas[0]).toMatchObject({ total: 3, prontas: 1, deviam: 2, vencidas: 1, nesta_semana: 1, dias_ate_dia_d: 11 });
  });

  it('Dia D passado e nada aberto sai do gráfico e vai para encerrar', () => {
    const r = P.andamentoDosCiclos({
      ciclos: [
        { event_id: 'e2', nome: 'Série velha', dia_d: '2026-09-06' },
        { event_id: 'e1', nome: 'Série A', dia_d: '2026-10-11' },
      ],
      tarefas, hoje: HOJE,
    });
    expect(r.linhas.map((l: any) => l.event_id)).toEqual(['e1']);
    expect(r.a_encerrar).toEqual([{ event_id: 'e2', nome: 'Série velha', dia_d: '2026-09-06', tarefas: 1 }]);
  });
});

describe('o que ainda não dá para medir', () => {
  it('bloco que não carregou fica NULL, nunca zero', () => {
    const r = P.prontidaoDoDado({ pecas: [], membros: null, matriz: null, rotina: null });
    expect(r.capacidade).toBeNull();
    expect(r.matriz).toBeNull();
    expect(r.rotina).toBeNull();
  });

  it('só subtarefa de verdade entra na conta de dono e horas', () => {
    const r = P.prontidaoDoDado({
      pecas: [
        { subtarefa: true, membro_id: 'm1', horas: 2 },
        { subtarefa: true, membro_id: null, horas: 0 },
        { subtarefa: false, membro_id: null, horas: 0 },
      ],
      membros: [{ ativo: true, horas_semanais: 40 }, { ativo: true, horas_semanais: 0 }, { ativo: false, horas_semanais: 30 }],
      matriz: [{ esforco_valor: 1, esforco_unidade: 'dias' }, { esforco_valor: 0, esforco_unidade: 'horas' }],
      rotina: { compromissos: 3, esperadas: 5, marcadas: 2 },
    });
    expect(r.subtarefas).toEqual({ total: 2, com_dono: 1, com_horas: 1 });
    expect(r.capacidade).toEqual({ pessoas: 2, com_horas: 1, horas_semana: 40 });
    expect(r.matriz).toEqual({ total: 2, com_horas: 1 });
    expect(r.rotina).toEqual({ compromissos: 3, esperadas: 5, marcadas: 2 });
  });
});

describe('indicadores em calibração', () => {
  const indicadores = [
    { id: 'MKT-PRAZO', indicador: 'Prazo', unidade: '%', meta_valor: 85, sentido_meta: 'maior_melhor' },
    { id: 'MKT-LEAD', indicador: 'Lead', unidade: 'dias', meta_valor: 7, sentido_meta: 'menor_melhor' },
  ];

  it('a semana ISO é a do coletor', () => {
    expect(P.semanaIso('2026-09-30')).toBe('2026-W40');
    expect(P.semanaIso('2026-09-28')).toBe('2026-W40');
    expect(P.semanaIso('2026-09-27')).toBe('2026-W39');
    expect(P.segundaDaSemanaIso('2026-W40')).toBe('2026-09-28');
  });

  it('só conta do marco zero à semana atual, e vale o registro mais recente', () => {
    const k = P.kpisEmCalibracao({
      indicadores, hoje: HOJE,
      registros: [
        { indicador_id: 'MKT-PRAZO', periodo_referencia: '2026-W39', valor_realizado: 100, data_preenchimento: '2026-09-27' },
        { indicador_id: 'MKT-PRAZO', periodo_referencia: '2026-W40', valor_realizado: 50, data_preenchimento: '2026-09-29' },
        { indicador_id: 'MKT-PRAZO', periodo_referencia: '2026-W40', valor_realizado: 60, data_preenchimento: '2026-09-30' },
        { indicador_id: 'MKT-PRAZO', periodo_referencia: '2026-W52', valor_realizado: 0, data_preenchimento: '2026-08-24' },
      ],
    });
    const prazo = k.indicadores.find((i: any) => i.id === 'MKT-PRAZO');
    expect(prazo.serie.map((s: any) => [s.periodo, s.valor])).toEqual([['2026-W40', 60]]);
    expect(prazo.atual.em_andamento).toBe(true);
    expect(prazo.ultima_fechada).toBeNull();
    expect(k.calibrado).toBe(false);
    expect(prazo.farol).toBeNull();
    expect(k.farol_desde).toBe('2026-11-09');
    expect(k.indicadores.map((i: any) => i.id)).toEqual(P.KPIS_MKT);
  });

  it('com as semanas fechadas, o farol respeita a direção da meta', () => {
    const k = P.kpisEmCalibracao({
      indicadores, hoje: '2026-11-11',
      registros: [
        { indicador_id: 'MKT-PRAZO', periodo_referencia: '2026-W45', valor_realizado: 90, data_preenchimento: '2026-11-08' },
        { indicador_id: 'MKT-LEAD', periodo_referencia: '2026-W45', valor_realizado: 9, data_preenchimento: '2026-11-08' },
      ],
    });
    expect(k.calibrado).toBe(true);
    expect(k.indicadores.find((i: any) => i.id === 'MKT-PRAZO').farol).toBe('no_alvo');
    expect(k.indicadores.find((i: any) => i.id === 'MKT-LEAD').farol).toBe('fora');
  });
});
