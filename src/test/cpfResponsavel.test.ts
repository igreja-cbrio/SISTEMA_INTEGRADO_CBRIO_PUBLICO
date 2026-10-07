






import { describe, it, expect } from 'vitest';
// @ts-ignore — util CommonJS do backend (padrão do apresentacaoHorario.test.ts)
import { donoDoCpf, nomeDoDonoDoCpf, distribuirCpfs } from '../../backend/utils/cpfResponsavel';

describe('donoDoCpf', () => {


  it('um responsável só ⇒ o dono é ele, o informado é ignorado', () => {
    expect(donoDoCpf({ informado: 'mae', temPai: true, temMae: false })).toBe('pai');
    expect(donoDoCpf({ informado: 'pai', temPai: false, temMae: true })).toBe('mae');
    expect(donoDoCpf({ informado: null, temPai: true, temMae: false })).toBe('pai');
  });

  it('os dois nomes ⇒ vale o que a família escolheu', () => {
    expect(donoDoCpf({ informado: 'pai', temPai: true, temMae: true })).toBe('pai');
    expect(donoDoCpf({ informado: 'mae', temPai: true, temMae: true })).toBe('mae');
    expect(donoDoCpf({ informado: 'PAI', temPai: true, temMae: true })).toBe('pai');
  });



  it('sem escolha e com os dois nomes ⇒ mãe, como sempre foi', () => {
    expect(donoDoCpf({ informado: null, temPai: true, temMae: true })).toBe('mae');
    expect(donoDoCpf({ informado: '', temPai: true, temMae: true })).toBe('mae');
    expect(donoDoCpf({ informado: 'tio', temPai: true, temMae: true })).toBe('mae');
    expect(donoDoCpf({ informado: undefined, temPai: false, temMae: false })).toBe('mae');
  });
});

describe('nomeDoDonoDoCpf', () => {

  it('o nome que acompanha o CPF é o do DONO', () => {
    expect(nomeDoDonoDoCpf('pai', 'Robson Ribeiral', 'Priscila Seoud')).toBe('Robson Ribeiral');
    expect(nomeDoDonoDoCpf('mae', 'Robson Ribeiral', 'Priscila Seoud')).toBe('Priscila Seoud');
  });
  it('dono sem nome cai no outro, em vez de mandar nulo pro matcher', () => {
    expect(nomeDoDonoDoCpf('pai', null, 'Priscila Seoud')).toBe('Priscila Seoud');
    expect(nomeDoDonoDoCpf('mae', 'Robson Ribeiral', null)).toBe('Robson Ribeiral');
  });
  it('sem nenhum nome devolve nulo', () => {
    expect(nomeDoDonoDoCpf('mae', null, null)).toBe(null);
    expect(nomeDoDonoDoCpf('pai', '', '')).toBe(null);
  });
});

describe('distribuirCpfs', () => {
  it('põe o principal no dono e o outro no outro', () => {
    expect(distribuirCpfs({ dono: 'pai', cpf: '111', cpfOutro: '222' })).toEqual({ cpf_pai: '111', cpf_mae: '222' });
    expect(distribuirCpfs({ dono: 'mae', cpf: '111', cpfOutro: '222' })).toEqual({ cpf_mae: '111', cpf_pai: '222' });
  });

  it('sem o segundo CPF, o outro fica nulo', () => {
    expect(distribuirCpfs({ dono: 'mae', cpf: '111', cpfOutro: null })).toEqual({ cpf_mae: '111', cpf_pai: null });
  });



  it('CPF repetido nos dois campos descarta o segundo', () => {
    expect(distribuirCpfs({ dono: 'pai', cpf: '111', cpfOutro: '111' })).toEqual({ cpf_pai: '111', cpf_mae: null });
    expect(distribuirCpfs({ dono: 'mae', cpf: '111', cpfOutro: '111' })).toEqual({ cpf_mae: '111', cpf_pai: null });
  });

  it('vazio vira nulo, nunca string vazia no banco', () => {
    expect(distribuirCpfs({ dono: 'mae', cpf: '', cpfOutro: '' })).toEqual({ cpf_mae: null, cpf_pai: null });
  });
});
