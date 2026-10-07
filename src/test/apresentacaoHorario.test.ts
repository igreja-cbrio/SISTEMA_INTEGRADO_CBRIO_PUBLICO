



import { describe, it, expect } from 'vitest';
// @ts-ignore — util CommonJS do backend (padrão do cultoApresentacao.test.ts)
import {
  escolherHorarioApresentacao, rotuloHorarioApresentacao, paisIguais, nomesDosPaisUnicos,
  exigeConfirmacaoPaisIguais,
} from '../../backend/utils/apresentacaoHorario';
import * as front from '../lib/apresentacaoPais';

const catalogo = [
  { horario: '09:30', label: 'Culto das 9h30', aberto: true, limite: 6, ordem: 1 },
  { horario: '11:30', label: 'Culto das 11h30', aberto: true, limite: null, ordem: 2 },
];

describe('escolherHorarioApresentacao', () => {
  it('vazio ⇒ 9h30 (primário)', () => {
    const r = escolherHorarioApresentacao(catalogo, {});
    expect(r.horario).toBe('09:30');
    expect(r.label).toBe('Culto das 9h30');
    expect(r.transbordou).toBe(false);
  });

  it('com 5 no 9h30 ainda cabe (a 6ª inscrição fica no 9h30)', () => {
    expect(escolherHorarioApresentacao(catalogo, { '09:30': 5 }).horario).toBe('09:30');
  });


  it('com 6 no 9h30 (limite atingido) transborda pro 11h30', () => {
    const r = escolherHorarioApresentacao(catalogo, { '09:30': 6 });
    expect(r.horario).toBe('11:30');
    expect(r.transbordou).toBe(true);
  });


  it('limite nulo nunca lota, mesmo com contagem alta', () => {
    const r = escolherHorarioApresentacao(catalogo, { '09:30': 6, '11:30': 999 });
    expect(r.horario).toBe('11:30');
    expect(r.lotado).toBe(false);
  });

  it('horário fechado é pulado mesmo com vaga', () => {
    const cat = [{ ...catalogo[0], aberto: false }, catalogo[1]];
    expect(escolherHorarioApresentacao(cat, {}).horario).toBe('11:30');
  });

  it('todos lotados ⇒ null + lotado=true (a equipe precisa agir; a inscrição NÃO se perde)', () => {
    const cat = [catalogo[0], { ...catalogo[1], limite: 6 }];
    const r = escolherHorarioApresentacao(cat, { '09:30': 6, '11:30': 6 });
    expect(r.horario).toBeNull();
    expect(r.lotado).toBe(true);
  });

  it('respeita a ORDEM do catálogo, não a ordem da lista', () => {
    const invertido = [catalogo[1], catalogo[0]];
    expect(escolherHorarioApresentacao(invertido, {}).horario).toBe('09:30');
  });

  it('catálogo nulo/vazio ⇒ null sem quebrar (falha fechada: entra sem horário)', () => {
    expect(escolherHorarioApresentacao(null as any, {}).horario).toBeNull();
    expect(escolherHorarioApresentacao([], {}).horario).toBeNull();
    expect(escolherHorarioApresentacao(undefined as any).horario).toBeNull();
  });

  it('ocupação em Map também funciona', () => {
    expect(escolherHorarioApresentacao(catalogo, new Map([['09:30', 6]])).horario).toBe('11:30');
  });

  it('limite 0 lota sempre (é diferente de nulo)', () => {
    const cat = [{ ...catalogo[0], limite: 0 }, catalogo[1]];
    expect(escolherHorarioApresentacao(cat, {}).horario).toBe('11:30');
  });
});

describe('rotuloHorarioApresentacao', () => {
  it('usa o label do catálogo quando há', () => {
    expect(rotuloHorarioApresentacao('09:30', catalogo)).toBe('Culto das 9h30');
  });
  it('sem catálogo cai no formato da igreja', () => {
    expect(rotuloHorarioApresentacao('11:30')).toBe('11h30');
  });
  it('sem horário devolve null (omite, nunca inventa)', () => {
    expect(rotuloHorarioApresentacao(null, catalogo)).toBeNull();
    expect(rotuloHorarioApresentacao('', catalogo)).toBeNull();
  });
});

describe('paisIguais · o caso Isabella', () => {
  it('"Aline Lazaro" / "Aline Lazaro" é a mesma pessoa', () => {
    expect(paisIguais('Aline Lazaro', 'Aline Lazaro')).toBe(true);
  });
  it('tolera caixa, acento e espaço duplo', () => {
    expect(paisIguais('aline  lázaro', 'Aline Lazaro')).toBe(true);
  });
  it('nomes diferentes não são iguais', () => {
    expect(paisIguais('Caetano Pestana', 'Aline Lazaro')).toBe(false);
  });
  it('vazio nunca é "igual" (um só preenchido é o caso normal)', () => {
    expect(paisIguais('', 'Aline Lazaro')).toBe(false);
    expect(paisIguais(null, null)).toBe(false);
  });
});

describe('nomesDosPaisUnicos', () => {
  it('linha antiga dobrada sai UMA vez (o certificado deixa de dobrar)', () => {
    expect(nomesDosPaisUnicos('Aline Lazaro', 'Aline Lazaro')).toEqual(['Aline Lazaro']);
  });
  it('pai e mãe distintos saem os dois, pai primeiro', () => {
    expect(nomesDosPaisUnicos('Caetano Pestana', 'Aline Lazaro')).toEqual(['Caetano Pestana', 'Aline Lazaro']);
  });
  it('só um preenchido', () => {
    expect(nomesDosPaisUnicos(null, 'Aline Lazaro')).toEqual(['Aline Lazaro']);
    expect(nomesDosPaisUnicos('', '')).toEqual([]);
  });
});




describe('espelho front × backend (apresentacaoPais)', () => {
  const casos: Array<[unknown, unknown]> = [
    ['Aline Lazaro', 'Aline Lazaro'], ['aline  lázaro', 'Aline Lazaro'], ['Caetano Pestana', 'Aline Lazaro'],
    ['', 'Aline Lazaro'], [null, null], ['  Ana  Maria ', 'ana maria'],
  ];
  it('paisIguais concorda em todos os casos', () => {
    for (const [a, b] of casos) expect(front.paisIguais(a, b)).toBe(paisIguais(a, b));
  });
  it('nomesDosPaisUnicos concorda em todos os casos', () => {
    for (const [a, b] of casos) expect(front.nomesDosPaisUnicos(a, b)).toEqual(nomesDosPaisUnicos(a, b));
  });
});










describe('exigeConfirmacaoPaisIguais', () => {
  it('nome dobrado SEM confirmação é recusado', () => {
    expect(exigeConfirmacaoPaisIguais('Aline Lazaro', 'Aline Lazaro', undefined)).toBe(true);
  });
  it('nome dobrado COM confirmação passa', () => {
    expect(exigeConfirmacaoPaisIguais('Aline Lazaro', 'Aline Lazaro', true)).toBe(false);
  });


  it('só o booleano true confirma — truthy não serve', () => {
    for (const v of ['false', 'true', 1, {}, [], 'sim']) {
      expect(exigeConfirmacaoPaisIguais('Aline Lazaro', 'Aline Lazaro', v)).toBe(true);
    }
  });
  it('nomes diferentes nunca pedem confirmação', () => {
    expect(exigeConfirmacaoPaisIguais('Caetano Pestana', 'Aline Lazaro', undefined)).toBe(false);
  });
  it('um campo só preenchido é o caso normal — passa direto', () => {
    expect(exigeConfirmacaoPaisIguais(null, 'Aline Lazaro', undefined)).toBe(false);
    expect(exigeConfirmacaoPaisIguais('', '', undefined)).toBe(false);
  });


  it('front e backend decidem IGUAL', () => {
    const nomes = ['Aline Lazaro', 'aline  lázaro', 'Caetano Pestana', '', null];
    const flags = [true, false, undefined, 'true', 1];
    for (const a of nomes) for (const b of nomes) for (const c of flags) {
      expect(front.exigeConfirmacaoPaisIguais(a, b, c)).toBe(exigeConfirmacaoPaisIguais(a, b, c));
    }
  });
});
