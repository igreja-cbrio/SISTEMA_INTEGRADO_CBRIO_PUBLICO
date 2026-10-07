










import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { normalizarBairro, avaliarBairro, sugerirBairros, type BairroCatalogo } from '../lib/bairros';

const require_ = createRequire(import.meta.url);
const geoBrasil = require_('../../backend/services/geoBrasil.js');


const CATALOGO: BairroCatalogo[] = [
  { norm: 'barra da tijuca', nome: 'Barra da Tijuca', pessoas: 55, apelidos: ['barra'] },





  { norm: 'recreio dos bandeirantes', nome: 'Recreio dos Bandeirantes', pessoas: 29, apelidos: ['recreio', 'recreio bandeirantes'] },
  { norm: 'barra olimpica', nome: 'Barra Olímpica', pessoas: 20, apelidos: [] },
  { norm: 'freguesia (jacarepagua)', nome: 'Freguesia (Jacarepaguá)', pessoas: 9, apelidos: ['freguesia'] },
  { norm: 'taquara', nome: 'Taquara', pessoas: 7, apelidos: [] },
  { norm: 'vargem pequena', nome: 'Vargem Pequena', pessoas: 5, apelidos: [] },
  { norm: 'vargem grande', nome: 'Vargem Grande', pessoas: 3, apelidos: [] },
  { norm: 'vila valqueire', nome: 'Vila Valqueire', pessoas: 1, apelidos: [] },
];

describe('normalizarBairro · o MESMO resultado no front e no backend', () => {



  const casos = [
    'Barra da Tijuca', '  Copacabana  ', 'São Conrado', 'Jacarepaguá',
    'Freguesia (Jacarepaguá)', 'MARECHAL HERMES', 'Água Santa', 'Praça Seca',
    'Vila Isabel / Grajaú', 'Niterói - Icaraí', 'Penha Circular 2',
  ];
  for (const c of casos) {
    it(`front e backend concordam em ${JSON.stringify(c)}`, () => {
      expect(normalizarBairro(c)).toBe(geoBrasil.normalizarBairro(c));
    });
  }

  it('vazio: o front devolve string vazia, o backend null — e os dois são falsy', () => {



    expect(normalizarBairro('   ')).toBe('');
    expect(geoBrasil.normalizarBairro('   ')).toBeNull();
    expect(Boolean(normalizarBairro('   '))).toBe(Boolean(geoBrasil.normalizarBairro('   ')));
  });
});

describe('avaliarBairro · o que o texto significa', () => {
  it('nome oficial é reconhecido', () => {
    const r = avaliarBairro('Barra da Tijuca', CATALOGO);
    expect(r.tipo).toBe('conhecido');
  });

  it('acento, caixa e espaço não atrapalham', () => {
    expect(avaliarBairro('  freguesia (JACAREPAGUA) ', CATALOGO).tipo).toBe('conhecido');
  });

  it('⚠️ APELIDO é reconhecido e aponta para o canônico', () => {


    const r = avaliarBairro('Barra', CATALOGO);
    expect(r.tipo).toBe('apelido');
    if (r.tipo === 'apelido') expect(r.bairro.nome).toBe('Barra da Tijuca');
  });

  it('⚠️ bairro fora do catálogo é "novo", NUNCA erro', () => {


    const r = avaliarBairro('Copacabana', CATALOGO);
    expect(r.tipo).toBe('novo');
    if (r.tipo === 'novo') expect(r.digitado).toBe('Copacabana');
  });

  it('vazio não diz nada', () => {
    expect(avaliarBairro('', CATALOGO).tipo).toBe('vazio');
    expect(avaliarBairro('   ', CATALOGO).tipo).toBe('vazio');
  });

  it('⚠️ "Barra Olímpica" é lugar PRÓPRIO, não apelido da Barra', () => {


    const r = avaliarBairro('Barra Olímpica', CATALOGO);
    expect(r.tipo).toBe('conhecido');
    if (r.tipo === 'conhecido') expect(r.bairro.nome).toBe('Barra Olímpica');
  });
});

describe('sugerirBairros · o que aparece na lista', () => {
  it('sem texto, os bairros com mais gente vêm primeiro', () => {


    const r = sugerirBairros('', CATALOGO, 3).map((b) => b.nome);
    expect(r).toEqual(['Barra da Tijuca', 'Recreio dos Bandeirantes', 'Barra Olímpica']);
  });

  it('⚠️ digitar o APELIDO acha o bairro oficial', () => {


    expect(sugerirBairros('recreio', CATALOGO).map((b) => b.nome))
      .toContain('Recreio dos Bandeirantes');
  });

  it('⚠️ apelido que NÃO é prefixo também acha — é o ramo que só ele exercita', () => {



    expect(sugerirBairros('recreio bandeirantes', CATALOGO).map((b) => b.nome))
      .toContain('Recreio dos Bandeirantes');
  });

  it('começo do nome vem antes de meio do nome', () => {
    const r = sugerirBairros('vargem', CATALOGO).map((b) => b.nome);
    expect(r[0]).toBe('Vargem Pequena');
    expect(r[1]).toBe('Vargem Grande');
  });

  it('acento no que a pessoa digita não impede o acerto', () => {
    expect(sugerirBairros('olímpica', CATALOGO).map((b) => b.nome)).toContain('Barra Olímpica');
    expect(sugerirBairros('olimpica', CATALOGO).map((b) => b.nome)).toContain('Barra Olímpica');
  });

  it('texto que não casa com nada devolve lista vazia, não o catálogo inteiro', () => {

    expect(sugerirBairros('zzzzz', CATALOGO)).toEqual([]);
  });

  it('respeita o limite', () => {
    expect(sugerirBairros('', CATALOGO, 2)).toHaveLength(2);
  });
});
