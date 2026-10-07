import { describe, it, expect } from 'vitest';
import {
  codigoConfirmado, aplicarSugestaoNoForm, camposBoletoDoForm, rotuloOrigem, mensagemMotivo, formatarLinha, soDigitos,
} from '@/lib/boletoTela';

const COD = '1'.repeat(44);
const COD2 = '2'.repeat(44);

describe('codigoConfirmado · duas leituras iguais', () => {
  it('uma leitura só não basta', () => {
    expect(codigoConfirmado([COD])).toBeNull();
  });
  it('duas iguais confirmam (com ruído de formatação)', () => {
    expect(codigoConfirmado([COD, `${COD.slice(0, 20)} ${COD.slice(20)}`])).toBe(COD);
  });
  it('leituras diferentes não se somam', () => {
    expect(codigoConfirmado([COD, COD2])).toBeNull();
  });
  it('ignora o que não tem 44 dígitos', () => {
    expect(codigoConfirmado(['123', '123', COD])).toBeNull();
  });
  it('vence a leitura mais repetida', () => {
    expect(codigoConfirmado([COD2, COD, COD, COD2, COD2])).toBe(COD2);
  });
});

const resp = {
  ok: true,
  campos: {
    codigo_barras: COD, linha_digitavel: '3'.repeat(47), valor: 120.5, data_vencimento: '2026-10-10',
    fornecedor: 'Fornecedor Exemplo LTDA', descricao: 'Boleto · Fornecedor Exemplo LTDA', beneficiario_cnpj: '11222333000181',
    plano_contas_id: 'p1', centro_custo_id: 'c1',
  },
  origem: { codigo_barras: 'pdf', valor: 'pdf', data_vencimento: 'pdf', fornecedor: 'texto', beneficiario_cnpj: 'texto', plano_contas_id: 'historico', centro_custo_id: 'historico' },
};

describe('aplicarSugestaoNoForm', () => {
  it('preenche o formulário vazio e marca Boleto', () => {
    const { form, preenchidos } = aplicarSugestaoNoForm({ descricao: '', valor: '', forma_pagamento: '' }, resp);
    expect(form.valor).toBe(120.5);
    expect(form.data_vencimento).toBe('2026-10-10');
    expect(form.forma_pagamento).toBe('Boleto');
    expect(form.codigo_barras).toBe(COD);
    expect(preenchidos).toContain('fornecedor');
    expect(form.boleto_origem_campos).toMatchObject({ valor: 'pdf', fornecedor: 'texto', codigo_barras: 'pdf' });
  });
  it('não apaga o que a pessoa já digitou, e diz o que manteve', () => {
    const { form, mantidos } = aplicarSugestaoNoForm({ valor: '99', fornecedor: '' }, resp);
    expect(form.valor).toBe('99');
    expect(mantidos).toEqual(['valor']);
    expect((form.boleto_origem_campos as Record<string, string>).valor).toBeUndefined();
  });
  it('com sobrescrever, troca o digitado', () => {
    expect(aplicarSugestaoNoForm({ valor: '99' }, resp, { sobrescrever: true }).form.valor).toBe(120.5);
  });
  it('leitura que falhou não grava código nem forma', () => {
    const { form } = aplicarSugestaoNoForm({ forma_pagamento: '' }, { ok: false, campos: {}, origem: {} });
    expect(form.codigo_barras).toBeUndefined();
    expect(form.forma_pagamento).toBe('');
    expect(form.boleto_origem_campos).toBeNull();
  });
  it('campos do boleto vão no payload', () => {
    const { form } = aplicarSugestaoNoForm({}, resp);
    expect(camposBoletoDoForm(form)).toMatchObject({ codigo_barras: COD, beneficiario_cnpj: '11222333000181' });
    expect(camposBoletoDoForm({})).toEqual({});
  });
});

describe('textos', () => {
  it('rótulo de origem e motivo', () => {
    expect(rotuloOrigem('historico')).toMatch(/última conta/);
    expect(rotuloOrigem('xyz')).toBeNull();
    expect(mensagemMotivo('digito_verificador')).toMatch(/dígito verificador/);
    expect(mensagemMotivo('nao_encontrado', { escaneado: true })).toMatch(/imagem/);
  });
  it('formata a linha de boleto e de arrecadação', () => {
    expect(formatarLinha('1'.repeat(47))).toBe('11111.11111 11111.111111 11111.111111 1 11111111111111');
    expect(formatarLinha('8'.repeat(48))).toBe('88888888888-8 88888888888-8 88888888888-8 88888888888-8');
    expect(soDigitos('a1b2')).toBe('12');
  });
});
