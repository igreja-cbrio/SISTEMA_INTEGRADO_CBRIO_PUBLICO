import { describe, it, expect } from 'vitest';

import {
  lerBoleto,
  acharBoletoNoTexto,
  vencimentoDoFator,
} from '../../backend/utils/boletoLinha.js';








const REF = { referenciaIso: '2026-10-01' };


const BARRAS_ITAU = '34193160000001234561090000000123456789012345';
const LINHA_ITAU = '34191090080000012345567890123457316000000123456';

describe('boleto bancário · linha digitável e código de barras', () => {
  it('lê a linha digitável: banco, valor e vencimento', () => {
    const r = lerBoleto(LINHA_ITAU, REF);
    expect(r.ok).toBe(true);
    expect(r.tipo).toBe('boleto');
    expect(r.banco_codigo).toBe('341');
    expect(r.banco_nome).toBe('Itaú');
    expect(r.valor_centavos).toBe(123456);
    expect(r.vencimento).toBe('2026-10-15');
    expect(r.codigo_barras).toBe(BARRAS_ITAU);
  });

  it('aceita a linha com pontos, espaços e hífens', () => {
    const fmt = '34191.09008 00000.123455 67890.123457 3 16000000123456';
    const r = lerBoleto(fmt, REF);
    expect(r.ok).toBe(true);
    expect(r.valor_centavos).toBe(123456);
  });

  it('lê o código de barras (44) e reconstrói a linha (47)', () => {
    const r = lerBoleto(BARRAS_ITAU, REF);
    expect(r.ok).toBe(true);
    expect(r.linha_digitavel).toBe(LINHA_ITAU);
  });

  it('um dígito trocado na linha é RECUSADO (é o erro típico de leitura)', () => {
    const errada = LINHA_ITAU.slice(0, 40) + (LINHA_ITAU[40] === '9' ? '8' : '9') + LINHA_ITAU.slice(41);
    const r = lerBoleto(errada, REF);
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe('digito_verificador');
  });

  it('um dígito trocado no campo 2 (DV do campo) também é recusado', () => {
    const errada = LINHA_ITAU.slice(0, 12) + (LINHA_ITAU[12] === '9' ? '8' : '9') + LINHA_ITAU.slice(13);
    expect(lerBoleto(errada, REF).ok).toBe(false);
  });

  it('tamanho errado não lança: devolve motivo', () => {
    expect(lerBoleto('123', REF)).toMatchObject({ ok: false, motivo: 'tamanho_invalido' });
    expect(lerBoleto('', REF)).toMatchObject({ ok: false, motivo: 'vazio' });
    expect(lerBoleto(null, REF)).toMatchObject({ ok: false, motivo: 'vazio' });
  });
});

describe('fator de vencimento · a virada de 22/02/2025', () => {
  it('fator 1000 depois da virada é 22/02/2025', () => {
    expect(vencimentoDoFator('1000', '2026-10-01')).toBe('2025-02-22');
  });

  it('fator 9999 antes da virada é 21/02/2025', () => {
    expect(vencimentoDoFator('9999', '2025-01-01')).toBe('2025-02-21');
  });

  it('o mesmo fator aponta para a data mais próxima da referência (não para 2001)', () => {

    expect(vencimentoDoFator('1500', '2026-10-01')).toBe('2026-07-07');
  });

  it('fator inválido não inventa data', () => {
    expect(vencimentoDoFator('0999', '2026-10-01')).toBeNull();
    expect(vencimentoDoFator('abcd', '2026-10-01')).toBeNull();
  });

  it('boleto sem vencimento (fator 0000) devolve vencimento nulo', () => {

    const r = lerBoleto('23791234546789012345767890123457100000000005000', REF);
    expect(r.ok).toBe(true);
    expect(r.banco_nome).toBe('Bradesco');
    expect(r.valor_centavos).toBe(5000);
    expect(r.vencimento).toBeNull();
  });
});

describe('arrecadação (conta de consumo, tributo) · começa com 8', () => {
  it('identificador 6: valor efetivo, DV por módulo 10', () => {
    const r = lerBoleto('82660000000987612340000000000000000000000000');
    expect(r.ok).toBe(true);
    expect(r.tipo).toBe('arrecadacao');
    expect(r.valor_centavos).toBe(9876);
    expect(r.vencimento).toBeNull();
    expect(r.linha_digitavel).toBe('826600000002987612340008000000000000000000000000');
  });

  it('identificador 8: valor efetivo, DV por módulo 11', () => {
    const r = lerBoleto('828800000014531900010004000000000000000000000000');
    expect(r.ok).toBe(true);
    expect(r.valor_centavos).toBe(15319);
  });

  it('identificador 7: valor de REFERÊNCIA não vira valor a pagar', () => {
    const r = lerBoleto('82740000000987612340000000000000000000000000');
    expect(r.ok).toBe(true);
    expect(r.valor_centavos).toBeNull();
  });

  it('DV de bloco errado na linha de 48 é recusado', () => {
    const linha = '826600000002987612340008000000000000000000000000';
    const errada = linha.slice(0, 11) + (linha[11] === '9' ? '8' : '9') + linha.slice(12);
    expect(lerBoleto(errada).ok).toBe(false);
  });
});

describe('acharBoletoNoTexto · o texto extraído do PDF', () => {
  it('acha a linha no meio de um texto qualquer', () => {
    const texto = `Beneficiário: Empresa X LTDA\nVencimento 15/10/2026\n34191.09008 00000.123455 67890.123457 3 16000000123456\nValor R$ 1.234,56`;
    const r = acharBoletoNoTexto(texto, REF);
    expect(r.ok).toBe(true);
    expect(r.valor_centavos).toBe(123456);
  });

  it('sem linha no texto devolve nao_encontrado', () => {
    expect(acharBoletoNoTexto('nenhum número aqui', REF)).toMatchObject({ ok: false, motivo: 'nao_encontrado' });
  });

  it('linha com dígito errado é devolvida como inválida (não como "não achei")', () => {
    const errada = '34191.09008 00000.123455 67890.123457 3 16000000123457';
    const r = acharBoletoNoTexto(errada, REF);
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe('digito_verificador');
  });
});

describe('acharBoletoNoTexto · quebra de linha não é separador', () => {



  it('número na linha de cima não gruda na linha digitável', () => {
    const texto = 'Valor do documento 0000009083000\n82660000000-2 98761234000-8 00000000000-0 00000000000-0\nAutenticação mecânica';
    const r = acharBoletoNoTexto(texto, REF);
    expect(r.ok).toBe(true);
    expect(r.valor_centavos).toBe(9876);
  });

  it('número de 11 dígitos logo acima (tamanho de um bloco) também não gruda', () => {
    const texto = '12345678901\n82660000000-2 98761234000-8 00000000000-0 00000000000-0';
    expect(acharBoletoNoTexto(texto, REF)).toMatchObject({ ok: true, valor_centavos: 9876 });
  });

  it('número de 12 dígitos acima, com os blocos separados por vários espaços (PDF em colunas)', () => {


    const texto = 'Valor do documento 000000908300\n82660000000-2        98761234000-8        00000000000-0        00000000000-0';
    expect(acharBoletoNoTexto(texto, REF)).toMatchObject({ ok: true, valor_centavos: 9876 });
  });
});
