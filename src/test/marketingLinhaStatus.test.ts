import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { statusSerie, textoStatus } from '../pages/marketing/linha/layout';
import { semComentariosJs } from './_semComentarios';








const faixa = (culto: string, semana: number | null, aberta = true) => ({ culto, semana, aberta });
const serie = (...faixas: ReturnType<typeof faixa>[]) => ({ etapas: [{ faixas }] });

describe('statusSerie · vermelha só com semana que já passou', () => {
  it('Parábolas de 28/09: 3 abertas na semana atual (40) → conta 3, NÃO fica vermelha', () => {
    const st = statusSerie(serie(faixa('ami', 40), faixa('cbrio', 40), faixa('kids', 40), faixa('ami', 41)), 40);
    expect(st).toMatchObject({ pendentes: 3, atrasadas: 0, semanasAtrasadas: 0, vermelha: false });
    expect(st.cultosAtrasados.size).toBe(0);
  });
  it('Pelos Olhos de 28/09: 3 abertas na semana 39 → vermelha, 1 semana', () => {
    const st = statusSerie(serie(faixa('ami', 39), faixa('cbrio', 39), faixa('kids', 39)), 40);
    expect(st).toMatchObject({ pendentes: 3, atrasadas: 3, semanasAtrasadas: 1, vermelha: true });
    expect([...st.cultosAtrasados].sort()).toEqual(['ami', 'cbrio', 'kids']);
  });
  it('semanas atrasadas contam semana distinta, não tarefa', () => {
    const st = statusSerie(serie(faixa('ami', 30), faixa('cbrio', 30), faixa('kids', 35), faixa('ami', 40)), 40);
    expect(st).toMatchObject({ pendentes: 4, atrasadas: 3, semanasAtrasadas: 2, vermelha: true });
  });
  it('concluída ou sem semana não conta; semana 0 (antes do ano) é atrasada', () => {
    const st = statusSerie(serie(faixa('ami', 38, false), faixa('cbrio', null), faixa('kids', 0)), 40);
    expect(st).toMatchObject({ pendentes: 1, atrasadas: 1, semanasAtrasadas: 1, vermelha: true });
  });
  it('série sem etapas é verde e vazia', () => {
    expect(statusSerie({}, 40)).toMatchObject({ pendentes: 0, semanasAtrasadas: 0, vermelha: false });
  });
});

describe('textoStatus · cabe no quadrado', () => {
  it('o texto que o Mauricio pediu: "6 tarefas · 1 semana"', () => {
    expect(textoStatus(6, 1)).toBe('6 tarefas · 1 semana');
  });
  it('plural e singular', () => {
    expect(textoStatus(1, 1)).toBe('1 tarefa · 1 semana');
    expect(textoStatus(2, 3)).toBe('2 tarefas · 3 semanas');
  });
  it('sem semana atrasada diz que é desta semana (não manda procurar a vermelha)', () => {
    expect(textoStatus(3, 0)).toBe('3 tarefas nesta semana');
    expect(textoStatus(1, 0)).toBe('1 tarefa nesta semana');
  });
  it('nada aberto = vazio (inclusive null da Rotina indisponível)', () => {
    expect(textoStatus(0, 0)).toBe('');
    expect(textoStatus(null, 2)).toBe('');
    expect(textoStatus(undefined, undefined)).toBe('');
  });
  it('mesmo com número grande fica curto (≤ 24 caracteres, 1 linha no quadrado de 208px)', () => {
    for (const [p, w] of [[999, 53], [999, 0], [10, 10]]) expect(textoStatus(p, w).length).toBeLessThanOrEqual(24);
  });
});

describe('QuadroFrentes · usa a régua e o texto curto nos dois blocos', () => {
  const src = semComentariosJs(readFileSync(join(__dirname, '../pages/marketing/linha/QuadroFrentes.jsx'), 'utf8'));
  it('não sobrou o texto longo "em aberto até hoje" (quadrado, série nem legenda)', () => {
    expect(src.toLowerCase()).not.toContain('em aberto até hoje');
  });
  it('quadrado, bloco fixo (Rotina/Produção) e série escrevem o status por textoStatus', () => {
    expect(src.match(/textoStatus\(/g)?.length).toBe(3);
  });
  it('a cor da série vem de st.vermelha, não de st.pendentes', () => {
    expect(src).toMatch(/cor\s*=\s*st\.vermelha\s*\?/);
    expect(src).not.toMatch(/cor\s*=\s*st\.pendentes/);
  });
  it('a linha de status nunca quebra (quebrar em 2 linhas é o que vazava do quadrado)', () => {
    const css = readFileSync(join(__dirname, '../pages/marketing/linha/linha.css'), 'utf8');
    const regra = css.match(/\.ml-blk \.st\s*\{([^}]*)\}/)?.[1] || '';
    expect(regra).toMatch(/white-space:\s*nowrap/);
    expect(regra).toMatch(/text-overflow:\s*ellipsis/);
    expect(regra).toMatch(/overflow:\s*hidden/);
  });
});
