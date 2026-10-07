import { describe, it, expect } from 'vitest';

import {
  cnpjValido,
  cpfValido,
  candidatosDocumento,
  escolherBeneficiario,
  vencimentoImpresso,
  lerTextoBoleto,
} from '../../backend/utils/boletoTexto.js';





const CNPJ_FORN = '11.222.333/0001-81';
const CNPJ_OUTRO = '98.765.432/0001-98';
const CPF_CLIENTE = '123.456.789-09';

describe('documentos', () => {
  it('CNPJ e CPF com dígito verificador', () => {
    expect(cnpjValido('11222333000181')).toBe(true);
    expect(cnpjValido('11222333000182')).toBe(false);
    expect(cnpjValido('00000000000000')).toBe(false);
    expect(cpfValido('12345678909')).toBe(true);
    expect(cpfValido('52900008475')).toBe(false);
  });
  it('documento com DV errado não vira candidato', () => {
    expect(candidatosDocumento('Empresa X - CNPJ: 11.222.333/0001-82')).toEqual([]);
  });
});

describe('escolher o beneficiário', () => {
  it('o PAGADOR é descartado mesmo aparecendo mais vezes', () => {
    const texto = [
      'Beneficiário',
      `Empresa Fornecedora LTDA - CNPJ: ${CNPJ_FORN}`,
      'Pagador',
      `Fulano de Tal - CPF/CNPJ: ${CNPJ_OUTRO}`,
      'Sacado',
      `Fulano de Tal - CPF/CNPJ: ${CNPJ_OUTRO}`,
    ].join('\n');
    const b = escolherBeneficiario(candidatosDocumento(texto));
    expect(b).toMatchObject({ documento: '11222333000181', tipo: 'cnpj', nome: 'Empresa Fornecedora LTDA' });
  });

  it('a própria igreja como pagadora sai, mesmo sem o rótulo "Pagador" perto', () => {
    const texto = [
      `Comunidade Batista do Rio de Janeiro - CNPJ: ${CNPJ_OUTRO}`,
      `Operadora de Telefonia SA - CNPJ: ${CNPJ_FORN}`,
    ].join('\n');
    expect(escolherBeneficiario(candidatosDocumento(texto))?.documento).toBe('11222333000181');
  });

  it('havendo CNPJ, o CPF do cliente não concorre (conta de consumo)', () => {
    const texto = [`Titular: CPF: ${CPF_CLIENTE}`, `CPF: ${CPF_CLIENTE}`, `CNPJ: ${CNPJ_FORN}`].join('\n');
    expect(escolherBeneficiario(candidatosDocumento(texto))).toMatchObject({ documento: '11222333000181', tipo: 'cnpj' });
  });

  it('sem documento nenhum devolve null (nunca inventa)', () => {
    expect(escolherBeneficiario(candidatosDocumento('texto sem documento'))).toBeNull();
  });
});

describe('vencimento impresso', () => {
  it('pega a data da linha do rótulo ou das duas seguintes', () => {
    expect(vencimentoImpresso('Vencimento\n15/10/2026')).toBe('2026-10-15');
    expect(vencimentoImpresso('Data de Vencimento: 05/11/2026')).toBe('2026-11-05');
  });
  it('data longe do rótulo não conta', () => {
    expect(vencimentoImpresso('Vencimento\na\nb\nc\n15/10/2026')).toBeNull();
  });
});

describe('lerTextoBoleto', () => {
  it('junta código, beneficiário e data impressa', () => {
    const texto = [
      'Beneficiário',
      `Empresa Fornecedora LTDA - CNPJ: ${CNPJ_FORN}`,
      'Vencimento 15/10/2026',
      '34191.09008 00000.123455 67890.123457 3 16000000123456',
    ].join('\n');
    const r = lerTextoBoleto(texto, { referenciaIso: '2026-10-01' });
    expect(r.boleto.ok).toBe(true);
    expect(r.beneficiario?.documento).toBe('11222333000181');
    expect(r.vencimento_impresso).toBe('2026-10-15');
  });
});
