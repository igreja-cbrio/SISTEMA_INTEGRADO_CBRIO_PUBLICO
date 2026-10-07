import { describe, it, expect } from 'vitest';
import { G, montarLayout, semanaNoPonto } from '../pages/marketing/linha/layout';
import { pontoNoCanvas } from '../pages/marketing/linha/useCanvasPanZoom';
import { diaDaSemana, situacaoDaSemana } from '../pages/marketing/linha/MenuSemana';
import { solicitacaoJaConcluida, subTarefa } from '../pages/marketing/linha/CartaoTarefa';





const semanas = [
  { n: 39, inicio: '2026-09-20', fim: '2026-09-26' },
  { n: 40, inicio: '2026-09-27', fim: '2026-10-03' },
  { n: 41, inicio: '2026-10-04', fim: '2026-10-10' },
  { n: 42, inicio: '2026-10-11', fim: '2026-10-17' },
];
const dados = { ano: 2026, semana_atual: 40, semanas, membros: [], frentes: {} };

describe('semanaNoPonto · contra um layout real do quadro', () => {
  const layout = montarLayout(dados, null, false);
  const col40 = layout.colunas.find((c: { n: number }) => c.n === 40);
  const yMeio = G.TOPY + 10;

  it('o ponto dentro da coluna devolve aquela semana, com as datas', () => {
    const s = semanaNoPonto(layout, { x: col40.x + 5, y: yMeio });
    expect(s).toMatchObject({ n: 40, inicio: '2026-09-27', fim: '2026-10-03', atual: true });
  });

  it('a borda direita da coluna já é a semana seguinte (intervalo semiaberto)', () => {
    expect(semanaNoPonto(layout, { x: col40.x + G.COLW, y: yMeio })?.n).toBe(41);
    expect(semanaNoPonto(layout, { x: col40.x + G.COLW - 0.5, y: yMeio })?.n).toBe(40);
  });

  it('acima do cabeçalho, abaixo do quadro, à esquerda das colunas ou ponto inválido: nada', () => {
    expect(semanaNoPonto(layout, { x: col40.x + 5, y: G.HY - 17 })).toBeNull();
    expect(semanaNoPonto(layout, { x: col40.x + 5, y: layout.CH + 1 })).toBeNull();
    expect(semanaNoPonto(layout, { x: 10, y: yMeio })).toBeNull();
    expect(semanaNoPonto(layout, { x: Number.NaN, y: yMeio })).toBeNull();
    expect(semanaNoPonto(null, { x: col40.x, y: yMeio })).toBeNull();
    expect(semanaNoPonto(layout, null)).toBeNull();
  });

  it('a coluna "antes do ano" não é semana em que se cria tarefa', () => {
    const fake = { CH: 1000, colunas: [{ n: 0, x: 400, antes: true, inicio: null, fim: null }] };
    expect(semanaNoPonto(fake, { x: 410, y: yMeio })).toBeNull();
  });
});

describe('pontoNoCanvas · tela → quadro', () => {
  const rect = { left: 100, top: 50 };
  it('desconta a posição do quadro na tela, o deslocamento e o zoom', () => {
    expect(pontoNoCanvas({ clientX: 300, clientY: 250 }, rect, { x: 0, y: 0, zoom: 1 })).toEqual({ x: 200, y: 200 });
    expect(pontoNoCanvas({ clientX: 300, clientY: 250 }, rect, { x: 40, y: 20, zoom: 2 })).toEqual({ x: 80, y: 90 });
  });
  it('zoom inválido ou coordenada inválida não inventa ponto', () => {
    expect(pontoNoCanvas({ clientX: 300, clientY: 250 }, rect, { x: 0, y: 0, zoom: 0 })).toBeNull();
    expect(pontoNoCanvas({ clientX: 300, clientY: 250 }, rect, { x: 0, y: 0, zoom: -1 })).toBeNull();
    expect(pontoNoCanvas({ clientX: 300, clientY: 250 }, rect, { x: 0, y: 0 })).toBeNull();
    expect(pontoNoCanvas({ clientX: Number.NaN, clientY: 250 }, rect, { x: 0, y: 0, zoom: 1 })).toBeNull();
    expect(pontoNoCanvas({ clientX: 300, clientY: 250 }, null, { x: 0, y: 0, zoom: 1 })).toBeNull();
  });
});

describe('diaDaSemana · sem cair no fuso', () => {
  it('sábado é sábado, inclusive num fuso atrás de UTC', () => {
    const antes = process.env.TZ;
    try {
      process.env.TZ = 'America/Sao_Paulo';
      expect(diaDaSemana('2026-10-03')).toBe('sáb');
      expect(diaDaSemana('2026-09-27')).toBe('dom');
    } finally {
      process.env.TZ = antes;
    }
  });
  it('data malformada não vira dia', () => {
    expect(diaDaSemana('2026-10')).toBe('');
    expect(diaDaSemana(null)).toBe('');
    expect(diaDaSemana('ontem')).toBe('');
  });
});

describe('situacaoDaSemana · o menu avisa antes de criar', () => {
  it('semana que já passou avisa que a tarefa nasce atrasada', () => {
    expect(situacaoDaSemana({ atual: true })).toEqual({ tag: 'Esta semana', dica: null });
    expect(situacaoDaSemana({ futura: true })).toEqual({ tag: 'Próximas semanas', dica: null });
    expect(situacaoDaSemana({})?.dica).toMatch(/atrasada/);
    expect(situacaoDaSemana(null)).toBeNull();
  });
});

describe('cartão do quadro · solicitação já concluída com a tarefa aberta', () => {
  const base = { frente: 'sis', estado: 'pesquisa', solicitacao_status: 'concluido', pedido: { titulo: 'Arte do batismo' } };
  it('é dito no cartão (o modal oferece fechar)', () => {
    expect(solicitacaoJaConcluida(base)).toBe(true);
    expect(subTarefa(base)).toBe('Solicitação já concluída');
    expect(solicitacaoJaConcluida({ ...base, solicitacao_status: 'avaliado' })).toBe(true);
  });
  it('tarefa já concluída, solicitação aberta, pedido ou outra frente: não', () => {
    expect(solicitacaoJaConcluida({ ...base, estado: 'concluido' })).toBe(false);
    expect(solicitacaoJaConcluida({ ...base, solicitacao_status: 'aprovado' })).toBe(false);
    expect(subTarefa({ ...base, solicitacao_status: 'aprovado' })).toBe('Arte do batismo');
    expect(solicitacaoJaConcluida({ ...base, tipo: 'pedido' })).toBe(false);
    expect(solicitacaoJaConcluida({ ...base, frente: 'rot' })).toBe(false);
    expect(solicitacaoJaConcluida(null)).toBe(false);
  });
});
