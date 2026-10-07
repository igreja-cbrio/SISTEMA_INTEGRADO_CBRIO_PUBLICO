import { describe, it, expect } from 'vitest';

import { lerBoleto } from '../../backend/utils/boletoLinha.js';
import {
  montarSugestao,
  boletoUnico,
  fornecedoresCompativeis,
  planejarAdocao,
  mesmoFornecedor,
  historicoDoFornecedor,
} from '../../backend/utils/contaPagarBoleto.js';





const REF = { referenciaIso: '2026-10-01' };
const LINHA_ITAU = '34191090080000012345567890123457316000000123456';
const BARRAS_ITAU = '34193160000001234561090000000123456789012345';
const ARREC_REFERENCIA = '82740000000987612340000000000000000000000000';

describe('montarSugestao · hierarquia código > texto', () => {
  it('valor e vencimento vêm do código, com a origem registrada', () => {
    const s = montarSugestao({ leitura: lerBoleto(LINHA_ITAU, REF), hojeIso: '2026-10-01', origemCodigo: 'linha_digitada' });
    expect(s.campos.valor).toBe(1234.56);
    expect(s.campos.data_vencimento).toBe('2026-10-15');
    expect(s.origem).toMatchObject({ valor: 'linha_digitada', data_vencimento: 'linha_digitada' });
    expect(s.campos.codigo_barras).toBe(BARRAS_ITAU);
  });

  it('data impressa diferente da do código vira AVISO; o código continua valendo', () => {
    const s = montarSugestao({
      leitura: lerBoleto(LINHA_ITAU, REF),
      texto: { beneficiario: null, vencimento_impresso: '2026-10-20' },
      hojeIso: '2026-10-01',
    });
    expect(s.campos.data_vencimento).toBe('2026-10-15');
    expect(s.avisos.map((a: { tipo: string }) => a.tipo)).toContain('vencimento_divergente');
  });

  it('arrecadação sem vencimento no código usa a data impressa, marcada como "texto"', () => {
    const s = montarSugestao({
      leitura: lerBoleto('82660000000987612340000000000000000000000000', REF),
      texto: { beneficiario: null, vencimento_impresso: '2026-10-10' },
      hojeIso: '2026-10-01',
    });
    expect(s.campos.data_vencimento).toBe('2026-10-10');
    expect(s.origem.data_vencimento).toBe('texto');
    expect(s.avisos.map((a: { tipo: string }) => a.tipo)).toContain('sem_beneficiario');
  });

  it('valor de referência (não é o valor a pagar) não preenche o valor e avisa', () => {
    const s = montarSugestao({ leitura: lerBoleto(ARREC_REFERENCIA, REF), hojeIso: '2026-10-01' });
    expect(s.campos.valor).toBeUndefined();
    expect(s.avisos.map((a: { tipo: string }) => a.tipo)).toContain('valor_aberto');
  });

  it('boleto vencido avisa', () => {
    const s = montarSugestao({ leitura: lerBoleto(LINHA_ITAU, REF), hojeIso: '2026-10-20' });
    expect(s.avisos.map((a: { tipo: string }) => a.tipo)).toContain('vencido');
  });

  it('beneficiário do texto preenche fornecedor e documento, e a descrição', () => {
    const s = montarSugestao({
      leitura: lerBoleto(LINHA_ITAU, REF),
      texto: { beneficiario: { documento: '11222333000181', tipo: 'cnpj', nome: 'Empresa X LTDA' }, vencimento_impresso: null },
      hojeIso: '2026-10-01',
    });
    expect(s.campos).toMatchObject({ fornecedor: 'Empresa X LTDA', beneficiario_cnpj: '11222333000181', descricao: 'Boleto · Empresa X LTDA' });
    expect(s.origem.fornecedor).toBe('texto');
  });
});

describe('boletoUnico · espelho do índice único do banco', () => {
  it('boleto com valor no código é único', () => expect(boletoUnico(BARRAS_ITAU)).toBe(true));
  it('boleto de valor aberto (zeros) se paga mais de uma vez', () => {
    const aberto = BARRAS_ITAU.slice(0, 9) + '0000000000' + BARRAS_ITAU.slice(19);
    expect(boletoUnico(aberto)).toBe(false);
  });
  it('arrecadação: valor efetivo (6/8) é único; referência (7/9) não', () => {
    expect(boletoUnico('82660000000987612340000000000000000000000000')).toBe(true);
    expect(boletoUnico(ARREC_REFERENCIA)).toBe(false);
  });
  it('sem código não é único', () => expect(boletoUnico(null)).toBe(false));
});

describe('fornecedores', () => {
  it('compatível basta um token significativo (régua da adoção)', () => {
    expect(fornecedoresCompativeis('Light Serviços de Eletricidade SA', 'LIGHT S/A')).toBe(true);
    expect(fornecedoresCompativeis('Empresa Alfa LTDA', 'Comércio Beta ME')).toBe(false);
  });
  it('para o histórico exige DOIS tokens (um nome só juntaria pessoas diferentes)', () => {
    expect(mesmoFornecedor('Pablo Pontal Serviços', 'Pablo Figueiral')).toBe(false);
    expect(mesmoFornecedor('Leroy Merlin Cia', 'LEROY MERLIN COMPANHIA BRASILEIRA')).toBe(true);
    expect(mesmoFornecedor('Light', 'Light Serviços de Eletricidade SA')).toBe(true);
  });
});

describe('historicoDoFornecedor', () => {
  const contas = [
    { fornecedor: 'Leroy Merlin Cia', plano_contas_id: 'p-antigo', centro_custo_id: 'c1', data_vencimento: '2026-01-10' },
    { fornecedor: 'Leroy Merlin Cia', plano_contas_id: 'p-novo', centro_custo_id: 'c2', data_vencimento: '2026-09-10' },
    { fornecedor: 'Pablo Figueiral', plano_contas_id: 'p-x', centro_custo_id: 'c3', data_vencimento: '2026-09-30' },
  ];
  it('vale a conta mais recente do mesmo fornecedor e conta os planos distintos', () => {
    expect(historicoDoFornecedor('LEROY MERLIN', contas)).toMatchObject({
      plano_contas_id: 'p-novo', centro_custo_id: 'c2', contas_consideradas: 2, planos_distintos: 2,
    });
  });
  it('sem conta parecida devolve null', () => {
    expect(historicoDoFornecedor('Empresa Desconhecida', contas)).toBeNull();
  });
});

describe('planejarAdocao · o gêmeo da planilha', () => {
  const titulo = { import_chave: 'teorico:900', valor: 150.75, data_vencimento: '2026-10-10', fornecedor: 'Empresa Alfa LTDA' };
  const manual = { id: 'm1', valor: 150.75, data_vencimento: '2026-10-10', fornecedor: 'Alfa Serviços', import_chave: null };

  it('casamento único com fornecedor compatível é adotado', () => {
    expect(planejarAdocao([titulo], [manual])).toEqual({ adotar: [{ manual_id: 'm1', import_chave: 'teorico:900' }], ambiguos: [] });
  });
  it('fornecedor diferente vai para revisão humana', () => {
    const r = planejarAdocao([titulo], [{ ...manual, fornecedor: 'Outra Coisa' }]);
    expect(r.adotar).toEqual([]);
    expect(r.ambiguos[0].motivo).toBe('fornecedor_diferente');
  });
  it('dois candidatos do mesmo lado nunca são adivinhados', () => {
    const r = planejarAdocao([titulo], [manual, { ...manual, id: 'm2' }]);
    expect(r.adotar).toEqual([]);
    expect(r.ambiguos[0].motivo).toBe('mais_de_um_candidato');
  });
  it('centavo diferente não casa (a chave é o valor ao centavo)', () => {
    expect(planejarAdocao([titulo], [{ ...manual, valor: 150.74 }])).toEqual({ adotar: [], ambiguos: [] });
  });
  it('manual que já tem import_chave fica de fora', () => {
    expect(planejarAdocao([titulo], [{ ...manual, import_chave: 'teorico:1' }])).toEqual({ adotar: [], ambiguos: [] });
  });
});
