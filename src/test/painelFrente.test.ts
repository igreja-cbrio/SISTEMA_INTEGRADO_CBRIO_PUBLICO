import { describe, it, expect } from 'vitest';
import {
  situacaoDe, linhasDoPainel, separarPedidos, filtrarPorPessoa, filtrarPorSerie, filtrarPorSituacao,
  resumoPainel, agruparPorSituacao, agruparPorSerie, pessoasDoPainel, rotuloSemana,
  idDaSerie, HORIZONTE_PROXIMAS, filtrarPorOrigem, contarOrigens,
} from '../pages/marketing/linha/reguaPainelFrente';
import { origemDaTarefa, ehFrenteRotina, FRENTES, QUADROS, quadroPorKey, quadroDaFrente, rotuloFrente, temSubblocos, NOME_FRENTE } from '../pages/marketing/linha/layout';




const SA = 40;
const semanas = Array.from({ length: 14 }, (_, i) => {
  const n = 38 + i;
  const d = new Date(Date.UTC(2026, 8, 13 + i * 7));
  const f = new Date(Date.UTC(2026, 8, 19 + i * 7));
  return { n, inicio: d.toISOString().slice(0, 10), fim: f.toISOString().slice(0, 10) };
});

const dados = {
  ano: 2026,
  semana_atual: SA,
  semanas,
  perfil: { lider: true },
  membros: [
    { id: 'm-pedro', nome: 'Pablo Pontal' },
    { id: 'm-leticia', nome: 'Letícia' },
    { id: 'm-caua', nome: 'Cauã' },
    { id: 'm-allan', nome: 'Allan' },
  ],
  frentes: {
    ins: {
      status: 'vermelho',
      series: [
        {
          event_id: 'ev-olhos', nome: 'Pelos Olhos de Quem Vê', data: '2026-11-01',
          etapas: [{ nome_fase: 'Finalizações', faixas: [
            { id: 'o1', frente: 'ins', culto: 'kids', atribuido_a: 'm-allan', semana: 45, aberta: true, itens: [{ id: 'x', feito: false, membro_id: 'm-allan' }] },
          ] }],
        },
        {
          event_id: 'ev-par', nome: 'Parábolas Parabólicas', data: '2026-10-11',
          etapas: [{ nome_fase: 'Execução Estratégica', faixas: [
            { id: 'p1', frente: 'ins', culto: 'ami', atribuido_a: 'm-leticia', semana: 40, aberta: true,
              itens: [{ id: 'a', feito: true, membro_id: 'm-leticia' }, { id: 'b', feito: false, membro_id: 'm-caua' }] },
            { id: 'p2', frente: 'ins', culto: 'cbrio', atribuido_a: 'm-caua', semana: 39, aberta: true,
              itens: [{ id: 'c', feito: false, membro_id: 'm-caua' }] },
          ] }],
        },
        {
          event_id: null, nome: 'Avulsa', data: null,
          etapas: [{ nome_fase: 'Solta', faixas: [
            { id: 's1', frente: 'ins', culto: null, atribuido_a: null, semana: 41, aberta: false, itens: [{ id: 'd', feito: true }] },
          ] }],
        },
      ],
    },
    sis: {
      status: 'vermelho',
      tarefas: [
        { id: 'camp-1', frente: 'sis', tipo: 'pedido', pedido_status: 'aguardando_alocacao', semana: 42, aberta: true, atrasada: false, sugerido_membro_id: 'm-leticia', itens: [] },
        { id: 'sol-2', frente: 'sis', tipo: 'pedido', pedido_status: 'aguardando_aprovacao', semana: 1, aberta: true, atrasada: true, itens: [] },
        { id: 'card-3', frente: 'sis', origem_req: 'externa', solicitacao_id: 'sol-9', atribuido_a: 'm-caua', semana: 41, aberta: true, itens: [{ id: 'e', feito: false, membro_id: 'm-caua' }] },

        { id: 'i-1', frente: 'sis', origem_req: 'interna', atribuido_a: 'm-pedro', semana: null, aberta: true, itens: [] },
        { id: 'i-2', frente: 'sis', origem_req: 'interna', atribuido_a: 'm-leticia', semana: 44, aberta: true, itens: [] },
        { id: 'i-3', frente: 'sis', origem_req: 'interna', atribuido_a: 'm-leticia', semana: 45, aberta: true, itens: [] },
        { id: 'i-4', frente: 'sis', origem_req: 'interna', atribuido_a: 'm-leticia', semana: 30, aberta: false, itens: [{ id: 'f', feito: true }] },
      ],
    },
    red: {
      status: 'verde',
      tarefas: [
        { id: 'red-m-leticia-40', frente: 'red', membro_id: 'm-leticia', semana: 40, aberta: true, itens: [{ id: 'r9', feito: false, membro_id: 'm-leticia' }] },
      ],
    },
    rot: {
      status: 'verde',
      tarefas: [
        { id: 'rot-m-pedro-40', frente: 'rot', membro_id: 'm-pedro', semana: 40, aberta: true, itens: [{ id: 'r1', feito: false, membro_id: 'm-pedro' }] },
      ],
    },
  },
};

describe('situacaoDe · a mesma régua do quadro', () => {
  it('fechada é concluída, sem olhar a semana', () => {
    expect(situacaoDe({ aberta: false, semana: 10 }, SA)).toBe('concluida');
  });
  it('semana que JÁ PASSOU é atrasada; a atual ainda está em dia', () => {
    expect(situacaoDe({ aberta: true, semana: 39 }, SA)).toBe('atrasada');
    expect(situacaoDe({ aberta: true, semana: 40 }, SA)).toBe('semana');
    expect(situacaoDe({ aberta: true, semana: 41 }, SA)).toBe('proxima');
  });
  it('"de antes do ano" (semana 0) é atrasada', () => {
    expect(situacaoDe({ aberta: true, semana: 0 }, SA)).toBe('atrasada');
  });
  it('sem data é estado próprio, nunca "próxima"', () => {
    expect(situacaoDe({ aberta: true, semana: null }, SA)).toBe('sem_data');
  });
  it('pedido marcado atrasado pelo servidor é atrasado mesmo na semana 1', () => {
    expect(situacaoDe({ tipo: 'pedido', aberta: true, atrasada: true, semana: 1 }, 1)).toBe('atrasada');
  });
});

describe('linhasDoPainel', () => {
  it('Institucionais: uma linha por faixa (etapa × culto), guardando a série', () => {
    const l = linhasDoPainel(dados, 'ins');
    expect(l.map(x => x.key)).toEqual(['o1', 'p1', 'p2', 's1']);
    expect(l.find(x => x.key === 'p1').titulo).toBe('Execução Estratégica · AMI');
    expect(l.find(x => x.key === 'p1').serie).toEqual({ id: 'ev-par', nome: 'Parábolas Parabólicas', data: '2026-10-11' });
  });
  it('série sem evento vira UMA série (sem_evento)', () => {
    expect(linhasDoPainel(dados, 'ins').find(x => x.key === 's1').serie.id).toBe('sem_evento');
    expect(idDaSerie({ event_id: null })).toBe('sem_evento');
    expect(idDaSerie({ event_id: 'ev-1' })).toBe('ev-1');
  });
  it('pessoas = responsável + donos das subtarefas', () => {
    expect(linhasDoPainel(dados, 'ins').find(x => x.key === 'p1').pessoas.sort()).toEqual(['m-caua', 'm-leticia']);
  });
  it('pedido NÃO tem pessoa (a sugestão não é atribuição)', () => {
    const p = linhasDoPainel(dados, 'sis').find(x => x.key === 'camp-1');
    expect(p.tipo).toBe('pedido');
    expect(p.pessoas).toEqual([]);
    expect(p.responsavel).toBeNull();
  });
  it('rotina: o dono é a pessoa da semana', () => {
    const r = linhasDoPainel(dados, 'rot')[0];
    expect(r.tipo).toBe('rotina');
    expect(r.responsavel).toBe('m-pedro');
  });
  it('Redes também é rotina (01/10 · a rotina passou a ser por área)', () => {
    const r = linhasDoPainel(dados, 'red')[0];
    expect(r.tipo).toBe('rotina');
    expect(r.responsavel).toBe('m-leticia');
    expect(r.origem).toBeNull();
  });
  it('frente ausente devolve lista vazia', () => {
    expect(linhasDoPainel({ frentes: {} }, 'sis')).toEqual([]);
    expect(linhasDoPainel(null, 'sis')).toEqual([]);
  });
});



describe('Requisições · a origem é etiqueta', () => {
  const sis = linhasDoPainel(dados, 'sis');
  it('pedido e tarefa de solicitação são externas; a do líder é interna', () => {
    const origem = Object.fromEntries(sis.map(l => [l.key, l.origem]));
    expect(origem).toEqual({
      'camp-1': 'externa', 'sol-2': 'externa', 'card-3': 'externa',
      'i-1': 'interna', 'i-2': 'interna', 'i-3': 'interna', 'i-4': 'interna',
    });
  });
  it('fora de Requisições não há etiqueta', () => {
    expect(linhasDoPainel(dados, 'ins').every(l => l.origem === null)).toBe(true);
    expect(linhasDoPainel(dados, 'rot').every(l => l.origem === null)).toBe(true);
  });
  it('o filtro de origem separa as duas; vazio devolve todas', () => {
    expect(filtrarPorOrigem(sis, 'externa').map(l => l.key)).toEqual(['camp-1', 'sol-2', 'card-3']);
    expect(filtrarPorOrigem(sis, 'interna').map(l => l.key)).toEqual(['i-1', 'i-2', 'i-3', 'i-4']);
    expect(filtrarPorOrigem(sis, '')).toHaveLength(7);
  });
  it('a contagem dos chips fecha com o total', () => {
    expect(contarOrigens(sis)).toEqual({ externa: 3, interna: 4 });
    expect(contarOrigens(linhasDoPainel(dados, 'ins'))).toEqual({ externa: 0, interna: 0 });
  });
  it('o servidor decide; sem o campo (resposta de antes), deriva do que a tarefa carrega', () => {
    expect(origemDaTarefa({ frente: 'sis', origem_req: 'interna', solicitacao_id: 'x' })).toBe('interna');
    expect(origemDaTarefa({ frente: 'sis', tipo: 'pedido' })).toBe('externa');
    expect(origemDaTarefa({ frente: 'sis', solicitacao_id: 's' })).toBe('externa');
    expect(origemDaTarefa({ frente: 'sis', pedido: { titulo: 'Arte' } })).toBe('externa');
    expect(origemDaTarefa({ frente: 'sis' })).toBe('interna');
    expect(origemDaTarefa({ frente: 'ins', solicitacao_id: 's' })).toBeNull();
    expect(origemDaTarefa(null)).toBeNull();
  });
});




describe('os três quadros (01/10 · 2ª leva)', () => {
  it('Calendário (Rotina em cima, ciclos embaixo) · Requisições · Redes (Rotina e Produção)', () => {
    expect(QUADROS.map(q => [q.key, q.nome, q.frentes])).toEqual([
      ['cal', 'Calendário', ['rot', 'ins']],
      ['sis', 'Requisições', ['sis']],
      ['redes', 'Redes', ['red', 'prd']],
    ]);
  });
  it('as chaves históricas continuam, e cada frente mora em UM quadro só', () => {
    expect(FRENTES.map(f => f.key).sort()).toEqual(['ins', 'prd', 'red', 'rot', 'sis']);
    const todas = QUADROS.flatMap(q => q.frentes);
    expect(new Set(todas).size).toBe(todas.length);
    expect([...todas].sort()).toEqual(FRENTES.map(f => f.key).sort());
    for (const f of FRENTES) expect(quadroDaFrente(f.key)?.key).toBe(f.quadro);
  });
  it('o nome leva o quadro quando ele tem mais de um bloco ("Rotina" sozinho não diz qual)', () => {
    expect(rotuloFrente('rot')).toBe('Calendário · Rotina');
    expect(rotuloFrente('red')).toBe('Redes · Rotina');
    expect(rotuloFrente('prd')).toBe('Redes · Produção');
    expect(rotuloFrente('sis')).toBe('Requisições');
    expect(NOME_FRENTE.ins).toBe('Calendário · Ciclos criativos');
    expect(rotuloFrente('xyz')).toBeNull();
  });
  it('só propriedade PRÓPRIA: "toString" não é quadro nem frente', () => {
    expect(quadroPorKey('toString')).toBeNull();
    expect(quadroDaFrente('toString')).toBeNull();
    expect(quadroPorKey(undefined)).toBeNull();
  });
  it('Calendário e Redes têm blocos; Requisições não', () => {
    expect(temSubblocos(quadroPorKey('cal'))).toBe(true);
    expect(temSubblocos(quadroPorKey('redes'))).toBe(true);
    expect(temSubblocos(quadroPorKey('sis'))).toBe(false);
    expect(temSubblocos(null)).toBe(false);
  });
  it('as duas Rotinas são frentes de rotina; a Produção NÃO (é tarefa); "int" não existe mais', () => {
    expect(ehFrenteRotina('rot')).toBe(true);
    expect(ehFrenteRotina('red')).toBe(true);
    expect(ehFrenteRotina('prd')).toBe(false);
    expect(ehFrenteRotina('sis')).toBe(false);
    expect(ehFrenteRotina('int')).toBe(false);
    expect(ehFrenteRotina('toString')).toBe(false);
    expect(FRENTES.some(f => f.key === 'int')).toBe(false);
  });
});

describe('filtros', () => {
  const ins = linhasDoPainel(dados, 'ins');
  it('por pessoa pega quem é dono de subtarefa, não só o responsável', () => {
    expect(filtrarPorPessoa(ins, 'm-caua').map(l => l.key).sort()).toEqual(['p1', 'p2']);
  });
  it('filtrar por pessoa tira os pedidos (ninguém os recebeu ainda)', () => {
    const sis = linhasDoPainel(dados, 'sis');

    expect(filtrarPorPessoa(sis, 'm-leticia').map(l => l.key)).toEqual(['i-2', 'i-3', 'i-4']);
    expect(filtrarPorPessoa(sis, 'm-leticia').some(l => l.tipo === 'pedido')).toBe(false);
  });
  it('por série', () => {
    expect(filtrarPorSerie(ins, 'ev-par').map(l => l.key)).toEqual(['p1', 'p2']);
    expect(filtrarPorSerie(ins, null)).toHaveLength(4);
  });
  it('"abertas" é tudo menos concluída', () => {
    expect(filtrarPorSituacao(ins, 'abertas').map(l => l.key)).toEqual(['o1', 'p1', 'p2']);
    expect(filtrarPorSituacao(ins, 'concluida').map(l => l.key)).toEqual(['s1']);
    expect(filtrarPorSituacao(ins, 'todas')).toHaveLength(4);
  });
});

describe('separarPedidos', () => {
  const { pedidos, tarefas } = separarPedidos(linhasDoPainel(dados, 'sis'));
  it('pedido e tarefa não se misturam', () => {
    expect(pedidos.map(l => l.key)).toEqual(['camp-1', 'sol-2']);
    expect(tarefas.map(l => l.key)).toEqual(['card-3', 'i-1', 'i-2', 'i-3', 'i-4']);
  });
});


const internas = () => filtrarPorOrigem(linhasDoPainel(dados, 'sis'), 'interna');

describe('resumoPainel · o acompanhamento', () => {
  it('a contagem por situação FECHA com o total', () => {
    const r = resumoPainel(internas(), SA);
    const soma = (Object.values(r.por) as number[]).reduce((a, b) => a + b, 0);
    expect(soma).toBe(r.total);
    expect(r.total).toBe(4);
    expect(r.abertas).toBe(3);
  });
  it('o andamento olha só o que já devia estar feito (até a semana atual)', () => {

    const r = resumoPainel(linhasDoPainel(dados, 'ins'), SA);
    expect(r.andamento).toEqual({ feitos: 1, total: 3, pct: 33 });
  });
  it('sem subtarefa vencendo, o percentual é null — nunca 0%', () => {
    const soFuturo = internas().filter(l => l.semana == null || l.semana > SA);
    expect(resumoPainel(soFuturo, SA).andamento).toEqual({ feitos: 0, total: 0, pct: null });
    expect(resumoPainel([], SA).andamento.pct).toBeNull();
  });
});

describe('agruparPorSituacao', () => {
  it('o que ficou para trás vem primeiro, e seção vazia não aparece', () => {
    const s = agruparPorSituacao(internas(), { semanaAtual: SA });
    expect(s.map(x => x.key)).toEqual(['proxima', 'sem_data', 'concluida']);
  });
  it('próximas além do horizonte vão para `ocultas`, NUNCA são descartadas', () => {
    const s = agruparPorSituacao(internas(), { semanaAtual: SA });
    const prox = s.find(x => x.key === 'proxima');
    expect(HORIZONTE_PROXIMAS).toBe(4);
    expect(prox.linhas.map(l => l.key)).toEqual(['i-2']);
    expect(prox.ocultas.map(l => l.key)).toEqual(['i-3']);
  });
  it('ordena pela semana dentro da seção', () => {
    const s = agruparPorSituacao(linhasDoPainel(dados, 'ins'), { semanaAtual: SA });
    expect(s[0].key).toBe('atrasada');
    expect(s[0].linhas.map(l => l.key)).toEqual(['p2']);
  });
});

describe('agruparPorSerie', () => {
  it('a série com atraso vem primeiro, mesmo lançando depois', () => {
    const g = agruparPorSerie(linhasDoPainel(dados, 'ins'), SA);

    expect(g.map(x => x.id)).toEqual(['ev-par', 'ev-olhos', 'sem_evento']);
    expect(g[0].resumo.por.atrasada).toBe(1);
  });
});

describe('pessoasDoPainel + rotuloSemana', () => {
  it('só quem aparece nas linhas, em ordem de nome com acento', () => {
    expect(pessoasDoPainel(linhasDoPainel(dados, 'ins'), dados.membros).map(p => p.nome)).toEqual(['Allan', 'Cauã', 'Letícia']);
  });
  it('rótulo da semana', () => {
    expect(rotuloSemana(semanas, null, 2026)).toBe('sem data');
    expect(rotuloSemana(semanas, 0, 2026)).toBe('antes de 2026');
    expect(rotuloSemana(semanas, 40, 2026)).toBe('sem. 40 · 27/09');
    expect(rotuloSemana(semanas, 99, 2026)).toBe('sem. 99');
  });
});
