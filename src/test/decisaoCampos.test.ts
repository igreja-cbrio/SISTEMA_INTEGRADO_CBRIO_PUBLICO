





import { describe, it, expect } from 'vitest';
import * as mod from '../../backend/utils/decisaoCampos.js';

const { validarDecisao } = mod as {
  validarDecisao: (b: unknown, o?: { hoje?: string; nascimentoObrigatorio?: boolean }) => {
    ok: boolean; campo?: string; erro?: string;
    valores?: { nome: string; dataNascimento: string; telefone: string; cep: string | null; email: string | null };
  };
};

const bom = {
  nome: 'Ana Paula Souza',
  data_nascimento: '1990-05-10',
  telefone: '(21) 99999-8888',
  aceite_lgpd: true,
};

describe('validarDecisao · o que a porta aceita', () => {
  it('aceita o caso completo e normaliza telefone e CEP', () => {
    const r = validarDecisao({ ...bom, cep: '22640-100' });
    expect(r.ok).toBe(true);
    expect(r.valores?.telefone).toBe('21999998888');
    expect(r.valores?.cep).toBe('22640100');
    expect(r.valores?.dataNascimento).toBe('1990-05-10');
  });




  it('⚠️ sem CEP passa — o campo é opcional', () => {
    const r = validarDecisao(bom);
    expect(r.ok).toBe(true);
    expect(r.valores?.cep).toBeNull();
  });

  it('⚠️⚠️ CEP pela METADE não recusa a decisão — vira null', () => {



    const r = validarDecisao({ ...bom, cep: '226' });
    expect(r.ok).toBe(true);
    expect(r.valores?.cep).toBeNull();
  });

  it('CEP com máscara, espaço ou letra vira só dígitos', () => {
    expect(validarDecisao({ ...bom, cep: ' 22640-100 ' }).valores?.cep).toBe('22640100');
    expect(validarDecisao({ ...bom, cep: 'cep 22640100' }).valores?.cep).toBe('22640100');
  });

  it('CEP longo demais não é truncado — vira null', () => {


    expect(validarDecisao({ ...bom, cep: '226401000' }).valores?.cep).toBeNull();
  });




  it('sem telefone válido recusa — decisão sem contato é pessoa que ninguém alcança', () => {
    expect(validarDecisao({ ...bom, telefone: '' }).campo).toBe('telefone');
    expect(validarDecisao({ ...bom, telefone: '9999-8888' }).campo).toBe('telefone');
    expect(validarDecisao({ ...bom, telefone: '219999988887' }).campo).toBe('telefone');
  });

  it('nome vazio ou de 1 letra recusa', () => {
    expect(validarDecisao({ ...bom, nome: '' }).campo).toBe('nome');
    expect(validarDecisao({ ...bom, nome: ' A ' }).campo).toBe('nome');
  });

  it('nascimento é obrigatório e usa a régua do Contrato de porta', () => {
    expect(validarDecisao({ ...bom, data_nascimento: '' }).campo).toBe('data_nascimento');

    expect(validarDecisao({ ...bom, data_nascimento: '1990-02-31' }).campo).toBe('data_nascimento');
    expect(validarDecisao({ ...bom, data_nascimento: '1899-01-01' }).campo).toBe('data_nascimento');
    expect(validarDecisao({ ...bom, data_nascimento: '2030-01-01' }, { hoje: '2026-08-27' }).campo)
      .toBe('data_nascimento');
  });




  it('⚠️⚠️ o aceite precisa ser o booleano TRUE, não um valor "parecido com sim"', () => {



    expect(validarDecisao({ ...bom, aceite_lgpd: 'false' }).campo).toBe('aceite_lgpd');
    expect(validarDecisao({ ...bom, aceite_lgpd: 1 }).campo).toBe('aceite_lgpd');
    expect(validarDecisao({ ...bom, aceite_lgpd: 'on' }).campo).toBe('aceite_lgpd');
    expect(validarDecisao({ ...bom, aceite_lgpd: undefined }).campo).toBe('aceite_lgpd');
  });

  it('a ordem dos erros é a do formulário — o primeiro campo errado é o apontado', () => {


    expect(validarDecisao({}).campo).toBe('nome');
  });

  it('nunca lança — devolve objeto mesmo com payload lixo', () => {
    expect(() => validarDecisao(null)).not.toThrow();
    expect(() => validarDecisao('texto')).not.toThrow();
    expect(validarDecisao(null).ok).toBe(false);
  });

  it('e-mail continua opcional (a porta nunca o exigiu)', () => {
    expect(validarDecisao(bom).valores?.email).toBeNull();
    expect(validarDecisao({ ...bom, email: ' a@b.com ' }).valores?.email).toBe('a@b.com');
  });




  it('nascimentoObrigatorio: false — vazio e inválido viram null, nunca recusa', () => {
    const opt = { nascimentoObrigatorio: false } as const;
    const semData = validarDecisao({ ...bom, data_nascimento: '' }, opt);
    expect(semData.ok).toBe(true);
    expect(semData.valores?.dataNascimento).toBeNull();


    const invalida = validarDecisao({ ...bom, data_nascimento: '1990-02-31' }, opt);
    expect(invalida.ok).toBe(true);
    expect(invalida.valores?.dataNascimento).toBeNull();

    expect(validarDecisao(bom, opt).valores?.dataNascimento).toBe(bom.data_nascimento);
  });

  it('⚠️ o DEFAULT continua exigindo nascimento — a porta online não afrouxou', () => {


    expect(validarDecisao({ ...bom, data_nascimento: '' }).campo).toBe('data_nascimento');
    expect(validarDecisao({ ...bom, data_nascimento: '' }, {}).campo).toBe('data_nascimento');
  });
});
