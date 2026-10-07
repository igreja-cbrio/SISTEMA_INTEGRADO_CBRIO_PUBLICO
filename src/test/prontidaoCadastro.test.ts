import { describe, it, expect } from 'vitest';

import {
  avaliarProntidao, nomeCompleto, nascimentoOk, generoOk,
} from '../../backend/utils/prontidaoCadastro.js';






const HOJE = new Date('2026-08-04T12:00:00-03:00');


const CPF_OK = '12345678909';

function cadastroCompleto(over = {}) {
  return {
    status: 'pendente',
    nome: 'Maria Madalena Monteiro',
    cpf: CPF_OK,
    telefone: '21900009683',
    email: 'pessoa@gmail.com',
    data_nascimento: '1975-12-19',
    genero: 'feminino',
    aceita_termos: true,
    duplicado_de_id: null,
    ...over,
  };
}

describe('avaliarProntidao · caminho felizes', () => {
  it('cadastro completo está pronto', () => {
    const r = avaliarProntidao(cadastroCompleto(), HOJE);
    expect(r.pronto).toBe(true);
    expect(r.faltando).toEqual([]);
    expect(r.bloqueios).toEqual([]);
  });

  it('aceita genero legado M/F além do canônico', () => {
    expect(avaliarProntidao(cadastroCompleto({ genero: 'M' }), HOJE).pronto).toBe(true);
    expect(avaliarProntidao(cadastroCompleto({ genero: 'f' }), HOJE).pronto).toBe(true);
  });

  it('aceita CPF com máscara', () => {
    expect(avaliarProntidao(cadastroCompleto({ cpf: '123.456.789-09' }), HOJE).pronto).toBe(true);
  });
});

describe('avaliarProntidao · cada campo obrigatório barra o lote', () => {
  const casos: Array<[string, object, string]> = [
    ['sem CPF', { cpf: null }, 'cpf'],
    ['CPF com DV errado', { cpf: '12345678901' }, 'cpf'],
    ['sem telefone', { telefone: null }, 'telefone'],
    ['sem e-mail', { email: '' }, 'email'],
    ['sem nascimento', { data_nascimento: null }, 'nascimento'],
    ['sem sexo', { genero: null }, 'genero'],
    ['sem aceite dos termos', { aceita_termos: false }, 'termos'],
    ['nome só com um token', { nome: 'Maria' }, 'nome'],
  ];

  for (const [rotulo, over, esperado] of casos) {
    it(rotulo, () => {
      const r = avaliarProntidao(cadastroCompleto(over), HOJE);
      expect(r.pronto).toBe(false);
      expect(r.faltando).toContain(esperado);

      expect(r.rotulos.join(' ')).toMatch(/\S/);
    });
  }




  it('telefone de 9 dígitos sem DDD não passa', () => {
    const r = avaliarProntidao(cadastroCompleto({ telefone: '900000015' }), HOJE);
    expect(r.faltando).toContain('telefone');
  });
});

describe('avaliarProntidao · bloqueios que exigem gente', () => {



  it('cadastro com duplicado_de_id NUNCA entra em lote, mesmo completo', () => {
    const r = avaliarProntidao(cadastroCompleto({ duplicado_de_id: 'algum-uuid' }), HOJE);
    expect(r.pronto).toBe(false);
    expect(r.bloqueios).toContain('duplicado');
    expect(r.faltando).toEqual([]);
  });

  it('status diferente de pendente não entra', () => {
    for (const status of ['aprovado', 'rejeitado', 'duplicado', 'aplicado']) {
      const r = avaliarProntidao(cadastroCompleto({ status }), HOJE);
      expect(r.pronto).toBe(false);
      expect(r.bloqueios).toContain('status');
    }
  });

  it('linha ausente/nula não estoura', () => {
    expect(avaliarProntidao(null, HOJE).pronto).toBe(false);
    expect(avaliarProntidao(undefined, HOJE).pronto).toBe(false);
  });
});

describe('nomeCompleto', () => {
  it('exige 2+ tokens', () => {
    expect(nomeCompleto('Maria Silva')).toBe(true);
    expect(nomeCompleto('Maria')).toBe(false);
    expect(nomeCompleto('   ')).toBe(false);
  });


  it('recusa abreviação de uma letra', () => {
    expect(nomeCompleto('Maria M. Silva')).toBe(false);
    expect(nomeCompleto('M Silva')).toBe(false);
  });

  it('aceita partícula de 2 letras (de, da, do)', () => {
    expect(nomeCompleto('Maria de Oliveira')).toBe(true);
  });
});

describe('nascimentoOk', () => {
  it('data no futuro não vale', () => {
    expect(nascimentoOk('2027-01-01', HOJE)).toBe(false);
  });

  it('idade acima de 120 anos não vale', () => {
    expect(nascimentoOk('1890-01-01', HOJE)).toBe(false);
  });

  it('data inexistente não vale', () => {
    expect(nascimentoOk('2000-02-31', HOJE)).toBe(false);
    expect(nascimentoOk('não é data', HOJE)).toBe(false);
    expect(nascimentoOk(null, HOJE)).toBe(false);
  });


  it('parse é local, não UTC', () => {
    expect(nascimentoOk('2000-01-01', HOJE)).toBe(true);
    expect(nascimentoOk('2000-01-01T00:00:00.000Z', HOJE)).toBe(true);
  });
});

describe('generoOk', () => {
  it('aceita canônico e legado, recusa vazio e "outro"', () => {
    expect(generoOk('masculino')).toBe(true);
    expect(generoOk('F')).toBe(true);
    expect(generoOk('')).toBe(false);
    expect(generoOk(null)).toBe(false);

    expect(generoOk('outro')).toBe(false);
  });
});
