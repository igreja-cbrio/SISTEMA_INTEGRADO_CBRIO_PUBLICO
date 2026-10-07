import { describe, it, expect } from 'vitest';

import * as R from '../../backend/services/rotinasRegras.js';





describe('ocorrenciasDoItem', () => {
  it('diária = seg a sex, sem fim de semana', () => {

    expect(R.ocorrenciasDoItem({ frequencia: 'diaria', inicio: '2026-10-01' }, '2026-10-03', '2026-10-09'))
      .toEqual(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09']);
  });

  it('semanal cai sempre no dia da semana escolhido', () => {
    expect(R.ocorrenciasDoItem({ frequencia: 'semanal', dia_semana: 3, inicio: '2026-10-01' }, '2026-10-01', '2026-10-20'))
      .toEqual(['2026-10-07', '2026-10-14']);
  });

  it('quinzenal ancora no INÍCIO — a janela do cron não muda a quinzena', () => {
    const item = { frequencia: 'quinzenal', dia_semana: 5, inicio: '2026-10-01' };
    expect(R.ocorrenciasDoItem(item, '2026-10-01', '2026-10-31')).toEqual(['2026-10-02', '2026-10-16', '2026-10-30']);

    expect(R.ocorrenciasDoItem(item, '2026-10-08', '2026-10-31')).toEqual(['2026-10-16', '2026-10-30']);
  });

  it('mensal usa o dia do mês e cai no último dia quando o mês é curto', () => {
    expect(R.ocorrenciasDoItem({ frequencia: 'mensal', dia_mes: 31, inicio: '2027-01-01' }, '2027-01-01', '2027-04-30'))
      .toEqual(['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30']);
  });

  it('nada antes do início; sem dia obrigatório = nada', () => {
    expect(R.ocorrenciasDoItem({ frequencia: 'semanal', dia_semana: 1, inicio: '2026-10-15' }, '2026-10-01', '2026-10-20')).toEqual(['2026-10-19']);
    expect(R.ocorrenciasDoItem({ frequencia: 'semanal', dia_semana: null }, '2026-10-01', '2026-10-20')).toEqual([]);
    expect(R.ocorrenciasDoItem({ frequencia: 'anual' }, '2026-10-01', '2026-10-20')).toEqual([]);
  });
});

describe('normalizarItem', () => {
  const pessoa = '11111111-2222-3333-4444-555555555555';
  it('exige título, frequência, dia certo e responsável', () => {
    expect(R.normalizarItem({ frequencia: 'semanal', dia_semana: 2, responsavel_id: pessoa }).erro).toMatch(/Título/);
    expect(R.normalizarItem({ titulo: 'x', frequencia: 'semanal', responsavel_id: pessoa }).erro).toMatch(/dia da semana/);
    expect(R.normalizarItem({ titulo: 'x', frequencia: 'mensal', dia_mes: 40, responsavel_id: pessoa }).erro).toMatch(/dia do mês/);
    expect(R.normalizarItem({ titulo: 'x', frequencia: 'diaria' }).erro).toMatch(/responsável/);
  });
  it('limpa o dia que não se aplica à frequência', () => {
    const { item } = R.normalizarItem({ titulo: '  Conferir   estoque ', frequencia: 'mensal', dia_mes: 5, dia_semana: 3, responsavel_id: pessoa });
    expect(item).toMatchObject({ titulo: 'Conferir estoque', frequencia: 'mensal', dia_mes: 5, dia_semana: null });
  });
});

describe('escopo em cascata', () => {
  const areas = [
    { area: 'kids', diretoria: 'ministerial' },
    { area: 'ami', diretoria: 'ministerial' },
    { area: 'compras', diretoria: 'operacoes' },
  ];
  const ctx = (o: Record<string, unknown> = {}) => ({ geral: false, pmo: false, diretorias: new Set(), areasLider: new Set(), ...o });

  it('Pastor/DG e PMO veem tudo', () => {
    expect(R.areasVisiveis(ctx({ geral: true }), areas)).toBeNull();
    expect(R.areasVisiveis(ctx({ pmo: true }), areas)).toBeNull();
  });
  it('diretor vê as áreas da sua diretoria; líder, a própria área', () => {
    expect([...R.areasVisiveis(ctx({ diretorias: new Set(['ministerial']) }), areas)].sort()).toEqual(['ami', 'kids']);
    expect([...R.areasVisiveis(ctx({ areasLider: new Set(['compras']) }), areas)]).toEqual(['compras']);
    expect(R.podeGerirArea(ctx({ areasLider: new Set(['compras']) }), areas, 'kids')).toBe(false);
  });
  it('sem papel nenhum, não vê nada', () => {
    expect(R.areasVisiveis(ctx(), areas).size).toBe(0);
  });
});

describe('resumoCumprimento', () => {
  it('vencida e não concluída = não cumprida; o que vence hoje ou depois fica em aberto', () => {
    const r = R.resumoCumprimento([
      { data: '2026-10-05', status: 'concluida' },
      { data: '2026-10-06', status: 'a_fazer' },
      { data: '2026-10-07', status: 'fazendo' },
      { data: '2026-10-09', status: 'a_fazer' },
      { data: '2026-10-12', status: 'concluida' },
    ], '2026-10-09');
    expect(r).toEqual({ previstas: 4, cumpridas: 2, naoCumpridas: 2, emAberto: 1, pct: 50 });
  });
  it('sem nada vencido: pct null', () => {
    expect(R.resumoCumprimento([{ data: '2026-10-20', status: 'a_fazer' }], '2026-10-09').pct).toBeNull();
  });
});

describe('periodoDoPainel', () => {
  it('semana começa na segunda; mês no dia 1º; 30d são 30 dias corridos até hoje', () => {

    expect(R.periodoDoPainel('semana', '2026-10-08')).toEqual({ de: '2026-10-05', ate: '2026-10-08' });
    expect(R.periodoDoPainel('semana', '2026-10-11')).toEqual({ de: '2026-10-05', ate: '2026-10-11' });
    expect(R.periodoDoPainel('mes', '2026-10-08')).toEqual({ de: '2026-10-01', ate: '2026-10-08' });
    expect(R.periodoDoPainel('30d', '2026-10-08')).toEqual({ de: '2026-09-09', ate: '2026-10-08' });
    expect(R.periodoDoPainel('qualquer', '2026-10-08')).toEqual({ de: '2026-09-09', ate: '2026-10-08' });
  });
});

describe('montarPainel', () => {
  const areas = [{ area: 'kids', rotulo: 'Kids' }, { area: 'compras', rotulo: 'Compras' }];
  const rotinas = [{ id: 'r1', nome: 'Estoque', area: 'kids' }, { id: 'r2', nome: 'Pedidos', area: 'compras' }];
  const itens = [
    { id: 'i1', rotina_id: 'r1', titulo: 'Conferir estoque', frequencia: 'semanal', responsavel_id: 'u1', responsavel_nome: 'Ana' },
    { id: 'i2', rotina_id: 'r2', titulo: 'Fechar pedido', frequencia: 'semanal', responsavel_id: 'u2', responsavel_nome: 'Bia' },
  ];
  const tarefas = [
    { rotina_item_id: 'i1', data: '2026-10-01', status: 'concluida' },
    { rotina_item_id: 'i1', data: '2026-10-02', status: 'a_fazer' },
    { rotina_item_id: 'i2', data: '2026-10-01', status: 'concluida' },
    { rotina_item_id: 'i2', data: '2026-10-02', status: 'concluida' },
  ];
  const painel = R.montarPainel({ rotinas, itens, tarefas, areas, hoje: '2026-10-08' });

  it('geral soma tudo; áreas vêm do pior para o melhor cumprimento', () => {
    expect(painel.geral).toMatchObject({ previstas: 4, cumpridas: 3, naoCumpridas: 1, pct: 75 });
    expect(painel.areas.map((a: any) => [a.rotulo, a.pct])).toEqual([['Kids', 50], ['Compras', 100]]);
  });

  it('desce até o item, com o nome do responsável', () => {
    const kids = painel.areas[0];
    expect(kids.rotinas[0].itens[0]).toMatchObject({ titulo: 'Conferir estoque', responsavel_nome: 'Ana', naoCumpridas: 1, pct: 50 });
  });

  it('lista as não cumpridas (vencida e não concluída) com rotina, área e pessoa', () => {
    expect(painel.totalNaoCumpridas).toBe(1);
    expect(painel.naoCumpridas[0]).toEqual({ data: '2026-10-02', item: 'Conferir estoque', responsavel_nome: 'Ana', rotina: 'Estoque', area: 'Kids' });
  });

  it('área sem nada vencido fica no fim (pct null) e vazio não quebra', () => {
    const p = R.montarPainel({ rotinas, itens, tarefas: [{ rotina_item_id: 'i2', data: '2026-10-20', status: 'a_fazer' }], areas, hoje: '2026-10-08' });
    expect(p.areas.every((a: any) => a.pct === null)).toBe(true);
    expect(R.montarPainel({ rotinas: [], itens: [], tarefas: [], areas, hoje: '2026-10-08' }).areas).toEqual([]);
  });
});

describe('quadroLevantamento', () => {
  const areas = [
    { area: 'kids', rotulo: 'Kids' }, { area: 'compras', rotulo: 'Compras' },
    { area: 'ami', rotulo: 'AMI' }, { area: 'cuidados', rotulo: 'Cuidados' },
  ];
  const quadro = R.quadroLevantamento({
    areas,
    rotinas: [{ id: 'r1', area: 'kids' }, { id: 'r2', area: 'kids' }, { id: 'r3', area: 'compras' }],
    itens: [{ rotina_id: 'r1' }, { rotina_id: 'r1' }, { rotina_id: 'r2' }, { rotina_id: 'r3' }],
    declaracoes: [{ area: 'compras', concluida_em: '2026-10-05T12:00:00Z' }, { area: 'cuidados', concluida_em: '2026-10-06T12:00:00Z' }],
  });

  it('classifica: concluída, em andamento (declarou algo) e pendente', () => {
    const por = Object.fromEntries(quadro.map((a: any) => [a.area, a.status]));
    expect(por).toEqual({ kids: 'em_andamento', compras: 'concluida', ami: 'pendente', cuidados: 'concluida' });
  });
  it('conta rotinas e itens por área', () => {
    const kids = quadro.find((a: any) => a.area === 'kids');
    expect(kids).toMatchObject({ rotinas: 2, itens: 3 });
  });
  it('pendentes primeiro (é o que o PMO precisa cobrar), depois em andamento, depois concluídas', () => {
    expect(quadro.map((a: any) => a.status)).toEqual(['pendente', 'em_andamento', 'concluida', 'concluida']);
    expect(quadro[0].area).toBe('ami');
  });
  it('declaração sem nenhuma rotina também vale (área que não tem rotina própria)', () => {
    expect(quadro.find((a: any) => a.area === 'cuidados')).toMatchObject({ rotinas: 0, status: 'concluida' });
  });
});
