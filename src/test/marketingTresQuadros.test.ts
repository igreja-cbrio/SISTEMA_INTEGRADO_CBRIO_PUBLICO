import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { G, QUADROS, montarLayout, x0Para, quadroPorKey, statusQuadro } from '../pages/marketing/linha/layout';
import { semComentariosJs } from './_semComentarios';





const semanas = [
  { n: 40, inicio: '2026-09-27', fim: '2026-10-03' },
  { n: 41, inicio: '2026-10-04', fim: '2026-10-10' },
  { n: 42, inicio: '2026-10-11', fim: '2026-10-17' },
];

function etapa(id: string, semana: number, aberta: boolean) {
  return { event_phase_id: id, nome_fase: 'Etapa', semana, faixas: [{ id: `t-${id}`, aberta, semana, culto: 'cbrio' }] };
}

type Frentes = Record<string, unknown>;
function dados(over: Frentes = {}) {
  return {
    ano: 2026, semana_atual: 40, semanas,
    frentes: {
      ins: {
        status: 'verde',
        series: [
          { event_id: 'e1', nome: 'Série A', etapas: [etapa('f1', 41, true)] },
          { event_id: 'e2', nome: 'Série B (nada aberto)', etapas: [etapa('f2', 41, false)] },
        ],
      },
      sis: { status: 'verde', tarefas: [{ id: 's1', frente: 'sis', semana: 40, aberta: true, itens: [] }] },
      rot: { status: 'verde', tarefas: [] },
      red: { status: 'verde', tarefas: [{ id: 'r1', frente: 'red', semana: 40, aberta: true, itens: [] }] },
      prd: { status: 'verde', tarefas: [] },
      ...over,
    },
  };
}

describe('montarLayout · Calendário', () => {
  const l = montarLayout(dados(), 'cal', false);
  it('a ROTINA vem primeiro e os ciclos criativos embaixo', () => {
    expect(l.grupos[0].sub).toBe('rot');
    expect(l.grupos[0].serie).toBeNull();
    expect(l.grupos.slice(1).map(g => g.serie?.nome)).toEqual(['Série A']);
  });
  it('o bloco da Rotina aparece mesmo sem nada aberto (é por ele que se abre o painel)', () => {
    expect(montarLayout(dados(), 'cal', false).nos.some(n => n.frente === 'rot')).toBe(false);
    expect(l.grupos[0].blocoY).toBeGreaterThan(0);
  });
  it('série sem nada aberto não vira bloco', () => {
    expect(l.grupos.some(g => g.serie?.nome === 'Série B (nada aberto)')).toBe(false);
  });
  it('os blocos não se sobrepõem, e o quadro é o 1º (li 0) com a coluna dos blocos', () => {
    expect(l.grupos[1].blocoY).toBeGreaterThanOrEqual(l.grupos[0].blocoY + G.SBH);
    expect(l.li).toBe(0);
    expect(l.multi).toBe(true);
    expect(l.X0).toBe(x0Para('cal'));
    expect(l.X0).toBe(G.SBX + G.SBW + 80);
  });
  it('o cartão da etapa fica no grupo da série', () => {
    const no = l.nos.find(n => n.tipo === 'etapa');
    expect(no && l.grupos[no.gi].serie?.nome).toBe('Série A');
  });
  it('sem série no ano a nota vai embaixo do bloco da Rotina, não por cima', () => {
    const v = montarLayout(dados({ ins: { status: 'verde', series: [] } }), 'cal', false);
    expect(v.grupos.map(g => g.sub)).toEqual(['rot']);
    expect(v.notaSemSeries).not.toBeNull();
    expect(v.notaSemSeries!.y).toBeGreaterThan(v.grupos[0].blocoY + G.SBH);
    expect(l.notaSemSeries).toBeNull();
  });
});

describe('montarLayout · Redes', () => {
  const l = montarLayout(dados({ prd: { status: 'verde', tarefas: [{ id: 'p1', frente: 'prd', semana: 41, aberta: true, itens: [] }] } }), 'redes', false);
  it('dois blocos, Rotina e Produção, nesta ordem', () => {
    expect(l.grupos.map(g => g.sub)).toEqual(['red', 'prd']);
    expect(l.li).toBe(2);
    expect(l.multi).toBe(true);
  });
  it('a Produção aparece mesmo vazia', () => {
    const v = montarLayout(dados(), 'redes', false);
    expect(v.grupos.map(g => g.sub)).toEqual(['red', 'prd']);
  });
  it('cada cartão no bloco da sua frente', () => {
    const porNo = Object.fromEntries(l.nos.map(n => [n.key, l.grupos[n.gi].sub]));
    expect(porNo).toEqual({ 'red-r1': 'red', 'prd-p1': 'prd' });
  });
  it('a nota de "sem série" é só do Calendário', () => {
    expect(montarLayout(dados({ ins: { status: 'verde', series: [] } }), 'redes', false).notaSemSeries).toBeNull();
  });
});

describe('montarLayout · Requisições segue igual', () => {
  const l = montarLayout(dados(), 'sis', false);
  it('uma linha só, saindo do quadrado, sem blocos', () => {
    expect(l.grupos).toHaveLength(1);
    expect(l.grupos[0].sub).toBeNull();
    expect(l.grupos[0].serie).toBeNull();
    expect(l.grupos[0].blocoY).toBeUndefined();
    expect(l.grupos[0].x0).toBe(G.BX + G.BW);
    expect(l.multi).toBe(false);
    expect(l.X0).toBe(G.BX + G.BW + 100);
    expect(l.li).toBe(1);
  });
  it('a Produção não vaza para Requisições', () => {
    const v = montarLayout(dados({ prd: { status: 'verde', tarefas: [{ id: 'p1', frente: 'prd', semana: 40, aberta: true, itens: [] }] } }), 'sis', false);
    expect(v.nos.map(n => n.key)).toEqual(['sis-s1']);
  });
});

describe('montarLayout · nada aberto', () => {
  it('sem grupos e sem quadro', () => {
    const l = montarLayout(dados(), null, false);
    expect(l.grupos).toEqual([]);
    expect(l.nos).toEqual([]);
    expect(l.li).toBe(-1);
    expect(l.multi).toBe(false);
  });
  it('a nota do perfil fica abaixo dos 3 quadrados', () => {
    expect(G.NOTE_Y).toBe(G.TOPY + QUADROS.length * (G.BH + G.BGAP) + 6);
  });
});

describe('statusQuadro · o quadrado soma as frentes dele', () => {
  const cal = quadroPorKey('cal');
  const fr = (status: string, pendentes: number, semanas_atrasadas: number[] = []) => ({ status, pendentes, semanas_atrasadas });
  it('vermelho se QUALQUER frente tem semana para trás; as pendências somam', () => {
    const s = statusQuadro({ frentes: { rot: fr('verde', 2), ins: fr('vermelho', 3, [38]) } }, cal);
    expect(s.status).toBe('vermelho');
    expect(s.pendentes).toBe(5);
    expect(s.semanas_atrasadas).toEqual([38]);
  });
  it('verde quando nada ficou para trás, mesmo com pendência desta semana', () => {
    const s = statusQuadro({ frentes: { rot: fr('verde', 2), ins: fr('verde', 1) } }, cal);
    expect(s.status).toBe('verde');
    expect(s.pendentes).toBe(3);
  });
  it('a mesma semana atrasada nas duas frentes conta UMA vez', () => {
    const s = statusQuadro({ frentes: { rot: fr('vermelho', 1, [38, 39]), ins: fr('vermelho', 2, [39]) } }, cal);
    expect(s.semanas_atrasadas).toEqual([38, 39]);
  });
  it('frente indisponível sai da conta, e o quadro diz que é parcial', () => {
    const s = statusQuadro({ frentes: { rot: { status: 'indisponivel', pendentes: null, semanas_atrasadas: [] }, ins: fr('verde', 4) } }, cal);
    expect(s.status).toBe('verde');
    expect(s.pendentes).toBe(4);
    expect(s.parcial).toBe(true);
  });
  it('nenhuma respondeu = indisponível, pendentes null (nunca 0)', () => {
    const s = statusQuadro({ frentes: {} }, cal);
    expect(s.status).toBe('indisponivel');
    expect(s.pendentes).toBeNull();
  });
});

describe('guardas estáticas · a tela e o editor', () => {
  const base = join(__dirname, '..', 'pages', 'marketing');
  const tela = semComentariosJs(readFileSync(join(base, 'MarketingLinhaDoTempo.jsx'), 'utf8'));
  const editor = semComentariosJs(readFileSync(join(base, 'linha', 'EditorTarefa.jsx'), 'utf8'));
  const css = readFileSync(join(base, 'linha', 'linha.css'), 'utf8');
  it('os blocos fixos e as séries só existem com quadro de blocos aberto', () => {
    expect(tela).toMatch(/layout\.multi && layout\.grupos\.map/);
  });
  it('a Produção entra no índice das tarefas (senão o cartão não abre o modal)', () => {
    expect(tela).toMatch(/for \(const k of \['sis', 'rot', 'red', 'prd'\]\)/);
  });
  it('tarefa nova nasce na Produção quando vem de Redes (menu da semana ou painel)', () => {
    expect(tela).toMatch(/area: aberta === 'redes' \? 'redes' : null/);
    expect(tela).toMatch(/area: painel\.frente === 'prd' \? 'redes' : null/);
  });
  it('⚠️ o editor só troca o quadro quando o SERVIDOR diz que pode (=== true, nunca truthy)', () => {
    expect(editor).toMatch(/tarefa\?\.pode_trocar_quadro === true/);
    expect(editor).toMatch(/area: f\.quadro \|\| null/);
    expect(editor).toMatch(/if \(podeTrocarQuadro && \(f\.quadro \|\| ''\) !== quadroOriginal\) body\.area = f\.quadro \|\| null;/);
  });
  it('a linha da Produção tem cor', () => {
    expect(css).toMatch(/\.mkt-linha \.l-prd \{ --lc: var\(--ln-red\); \}/);
  });
});
