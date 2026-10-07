







import { describe, it, expect } from 'vitest';
import {
  classificar, aplicarTeto, cortarDemografia, SEM_DADO_DEMOGRAFIA,
  TIPOS_PARA_BUSCAR, TIPOS_IDENTIFICACAO, TETO_VALORES,
} from '../../backend/utils/censoGrafico.js';

describe('o que vira gráfico', () => {
  it('opção, escala, sim/não e número viram barra', () => {
    for (const t of ['opcao_unica', 'multipla', 'sim_nao', 'escala_5', 'estrelas_5', 'nps', 'numero']) {
      expect(classificar(t)).toBe('grafico');
    }
  });

  it('⚠️ nascimento (data) e texto_curto são IDENTIFICAÇÃO, nunca gráfico', () => {


    expect(classificar('data')).toBe('identificacao');
    expect(classificar('texto_curto')).toBe('identificacao');
    expect(TIPOS_IDENTIFICACAO).toContain('data');
  });

  it('⚠️ identificação NUNCA é pedida ao banco', () => {

    for (const t of TIPOS_IDENTIFICACAO) expect(TIPOS_PARA_BUSCAR).not.toContain(t);
    expect(TIPOS_PARA_BUSCAR).not.toContain('texto_longo');
  });

  it('⚠️ tipo desconhecido NÃO vira gráfico (whitelist, nunca blacklist)', () => {


    expect(classificar('cpf_mascarado')).toBe('desconhecido');
    expect(classificar('')).toBe('desconhecido');
    expect(TIPOS_PARA_BUSCAR).not.toContain('cpf_mascarado');
  });

  it('texto livre vai para a Leitura da IA, lista longa vira barra com teto', () => {
    expect(classificar('texto_longo')).toBe('texto');
    expect(classificar('busca')).toBe('lista_longa');
    expect(TIPOS_PARA_BUSCAR).toContain('busca');
  });

  it('seção continua sendo cabeçalho', () => {
    expect(classificar('secao')).toBe('secao');
  });
});

describe('teto de valores por pergunta', () => {
  const muitos = (n: number) => [...Array(n)].map((_, i) => ({ valor: `v${i}`, total: n - i, neutra: false }));

  it('lista curta passa inteira', () => {
    const r = aplicarTeto(muitos(5));
    expect(r.valores).toHaveLength(5);
    expect(r.ocultos).toBe(0);
  });

  it('⚠️ o que passa do teto é DECLARADO, com quantas pessoas representa', () => {


    const r = aplicarTeto(muitos(30));
    expect(r.valores).toHaveLength(TETO_VALORES);
    expect(r.ocultos).toBe(10);
    expect(r.ocultosTotal).toBeGreaterThan(0);
  });

  it('⚠️ a NEUTRA nunca é cortada, mesmo sendo a última', () => {


    const com = [...muitos(30), { valor: 'Prefiro não dizer', total: 1, neutra: true }];
    const r = aplicarTeto(com);
    expect(r.valores.some((v) => v.neutra)).toBe(true);
  });

  it('lista vazia não quebra', () => {
    expect(aplicarTeto([]).valores).toEqual([]);
    expect(aplicarTeto(undefined as never).valores).toEqual([]);
  });
});






describe('corte demográfico declara o que o teto escondeu', () => {

  const bairrosReais = {
    'Barra da Tijuca': 274, 'Recreio dos Bandeirantes': 145, 'Barra Olímpica': 125,
    'Freguesia (Jacarepaguá)': 60, 'Jacarepaguá': 48, 'Pechincha': 33, 'Taquara': 19,
    'Tijuca': 17, 'Realengo': 15, 'Centro': 13, 'Vargem Pequena': 11, 'Vargem Grande': 8,
    'Curicica': 8, 'Copacabana': 8, 'Campo Grande': 8, 'Anil': 7,
    '(não informado)': 7, 'Vila Isabel': 6, 'Bangu': 5, 'Tanque': 5,
  };
  const totalReal = Object.values(bairrosReais).reduce((s, n) => s + n, 0);

  it('visíveis + escondidos FECHAM com o total de pessoas', () => {
    const r = cortarDemografia(bairrosReais, 12);
    const soma = r.valores.reduce((s, v) => s + v.total, 0);
    expect(soma + r.ocultos_pessoas).toBe(totalReal);
  });

  it('declara quantos valores e quantas PESSOAS ficaram de fora', () => {
    const r = cortarDemografia(bairrosReais, 12);
    expect(r.ocultos).toBeGreaterThan(0);
    expect(r.ocultos_pessoas).toBeGreaterThan(0);
  });

  it('"(não informado)" NUNCA é cortado, mesmo caindo na cauda', () => {

    const r = cortarDemografia(bairrosReais, 12);
    expect(r.valores.some((v) => v.valor === SEM_DADO_DEMOGRAFIA)).toBe(true);

    expect(r.valores.filter((v) => v.valor !== SEM_DADO_DEMOGRAFIA)).toHaveLength(12);
  });

  it('sem estourar o teto, não esconde nada', () => {
    const r = cortarDemografia({ a: 3, b: 2, c: 1 }, 12);
    expect(r.ocultos).toBe(0);
    expect(r.ocultos_pessoas).toBe(0);
    expect(r.valores).toHaveLength(3);
  });

  it('ordena do maior para o menor', () => {
    const r = cortarDemografia({ a: 1, b: 9, c: 5 }, 12);
    expect(r.valores.map((v) => v.valor)).toEqual(['b', 'c', 'a']);
  });

  it('entrada vazia não quebra', () => {
    expect(cortarDemografia({}, 12).valores).toEqual([]);
    expect(cortarDemografia(undefined as never, 12).valores).toEqual([]);
  });
});
