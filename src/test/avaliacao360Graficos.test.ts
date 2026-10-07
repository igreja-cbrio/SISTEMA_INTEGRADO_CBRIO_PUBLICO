import { describe, expect, it } from 'vitest';
import { pontosCegos } from '../components/avaliacao360/Graficos';

describe('pontos cegos · autoavaliação × média das outras visões', () => {
  const c = (nome: string, auto: number | null, gestor: number | null, outros: number | null) => ({ nome, auto, gestor, outros });
  it('ordena pela maior distância e corta em 3, ignorando diferenças pequenas', () => {
    const r = pontosCegos([c('A', 6, 4, 4), c('B', 3, 5, 5), c('C', 5, 5, 4.8), c('D', 6, 5, null), c('E', 2, 5, 5)]);
    expect(r.map((x) => [x.nome, Math.round(x.diff * 10) / 10])).toEqual([['E', -3], ['A', 2], ['B', -2]]);
  });
  it('sem autoavaliação ou sem outra visão, não há comparação', () => {
    expect(pontosCegos([c('A', null, 4, 4), c('B', 5, null, null)])).toEqual([]);
  });
});

import { htmlDoResultado } from '../components/avaliacao360/imprimir';
describe('impressão do resultado', () => {
  const r: any = {
    ciclo: { nome: 'Ciclo <X>', escala_max: 6, peso_auto: 0.15, peso_gestor: 0.7, peso_outros: 0.15, piso: 3 },
    avaliado: { nome: 'Ana & Cia', cargo: 'Coord.' }, papeis: { auto: { visivel: true, respondentes: 1 }, gestor: { visivel: true, respondentes: 1 }, par: { visivel: false, respondentes: 2 } },
    criterios: [{ competencia_id: 'c', nome: 'Ouvir', eixo: 'resultado', descricao: 'Escuta antes de decidir', auto: 6, gestor: 4, par: null, final: 4.3, comentarios: [{ papel: 'gestor', texto: 'Bom <b>' }], perguntas: [] }],
    final: 4.3, eixo_resultado: 4.3, quadrante: 'Mantenedor',
    entrega: { plano: [{ texto: 'Ouvir a equipe', prazo: '2027-03-01' }], devolutiva_obs: 'PRIVADO' },
  };
  const html = htmlDoResultado(r);
  it('escapa o texto e traz descrição, comentário, plano e o aviso de sigilo', () => {
    expect(html).toContain('Ana &amp; Cia');
    expect(html).toContain('Bom &lt;b&gt;');
    expect(html).toContain('Escuta antes de decidir');
    expect(html).toContain('Ouvir a equipe');
    expect(html).toContain('2 pares');
  });
  it('nunca imprime a anotação privada da devolutiva nem a coluna de pares oculta', () => {
    expect(html).not.toContain('PRIVADO');
    expect(html).not.toMatch(/<th class="num">Pares<\/th>/);
  });
  it('A4 com margens e sem quebrar linha de tabela', () => {
    expect(html).toMatch(/@page \{ size: A4/);
    expect(html).toMatch(/tr \{ break-inside: avoid/);
  });
});
