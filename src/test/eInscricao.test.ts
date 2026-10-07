














import { describe, expect, it } from 'vitest';
import * as ei from '../../backend/utils/eInscricao.js';

const CSV = [
  '"Nome";"Tipo do documento";"Número do documento";"Email";"Código da inscrição";"Status";"Cancelada?";"Data da inscrição";"Valor";"Categoria";"Cupom";"Forma de pagamento";"Quantidade de parcelas";"Gênero";"Data de Nascimento:";"Endereço Completo:";"Telefone para Contato:";"Informe 2 contatos (nome + telefone), para casos de emergência:";"\tJá aceitou Jesus como seu salvador?";"Já é batizado?";"É membro AMI/CBRio?";"Caso não seja membro AMI/CBRio, qual a sua igreja? (Se tiver)";"Possui alguma restrição alimentar ou motora? Qual/quais?";"Termos de responsabilidade - Menor de Idade";"Informações Sobre o Retiro";"Faz uso de algum medicamento controlado? Qual/quais?";"Possui alergia medicamentosa?";"Qual medicamento? (caso sim)";"Nome Completo do Responsável (caso de menores de idade):";"CPF do Responsável (caso de menores de idade):";"Grau de Parentesco com o Menor (caso de menores de idade):";"Celular do Responsável (caso de menores de idade):";"Email do Responsável (caso de menores de idade):";"Cancelamento, desistência ou não comparecimento";"Caso menor de 18 anos pelo qual é responsável, tenha interesse em se batizar no retiro, você autoriza?";"Quem realizou a inscrição";"Email de quem realizou a inscrição";"Check-in em"',

  '"Davi Teste da Silva";"CPF";"123.456.789-09";"Davi@Exemplo.com";"TESTE-001";"Ok";"Não";"06-09-2026 09:00:22";"850.0";"Lote 1";"";"cartao";"5";"Masculino";"08102010";"Rua A, 1";"+55 21 90000-3163";"Raphael - 21 90000-0012; Ana - 21 90000-0000";"Sim";"Não";"Sim";"";"Não";"Aceito (versão 98af68ba)";"Aceito (versão 77eec477)";"Não";"Sim";"dipirona";"Raphael Pessoa";"111.444.777-35";"Pai";"21 90000-0012";"Rapha@Exemplo.com";"Aceito (versão a68b23a7)";"Sim";"Davi";"davi@exemplo.com";""',

  '"PABLO TESTE PINTO";"CPF";"123.456.789-09";"pedro@exemplo.com";"TESTE-002";"Ok";"Sim";"27-08-2026 22:28:59";"850.0";"Lote 1";"";"";"";"Masculino";"10/07/2007";"Rua B, 2";"21900000811";"Micheli 21 900008647";"Sim";"Sim";"Sim";"X";"X";"Aceito (versão 98af68ba)";"Aceito (versão 77eec477)";"X";"Não";"X";"X";"X";"X";"X";"X";"Aceito (versão a68b23a7)";"Não";"pedro";"pedro@exemplo.com";""',
].join('\r\n');

describe('eInscricao · dinheiro', () => {
  it('R$ 850 bruto com 5,5% de taxa = R$ 803,25 líquidos', () => {
    expect(ei.reaisParaCentavos('850.0')).toBe(85000);
    expect(ei.reaisParaCentavos('1.250,50')).toBe(125050);
    expect(ei.liquidoCentavos(85000)).toBe(80325);
    expect(ei.liquidoCentavos(85000, 5.5)).toBeLessThan(85000);
  });
  it('arredonda ao centavo (não trunca)', () => {

    expect(ei.liquidoCentavos(88000)).toBe(83160);
    expect(ei.liquidoCentavos(90000)).toBe(85050);
    expect(ei.liquidoCentavos(33333)).toBe(31500);
    expect(ei.liquidoCentavos('abc')).toBeNull();
  });
});

describe('eInscricao · parsers', () => {
  it('nascimento com barra, com hífen e digitado sem barra', () => {
    expect(ei.parseDataBR('25/02/2008')).toBe('2008-02-25');
    expect(ei.parseDataBR('25-02-2008')).toBe('2008-02-25');
    expect(ei.parseDataBR('12062012')).toBe('2012-06-12');
    expect(ei.parseDataBR('31/02/2012')).toBeNull();
    expect(ei.parseDataBR('')).toBeNull();
  });
  it('data/hora da compra é horário de Brasília', () => {
    const iso = ei.parseDataHoraBRT('31-08-2026 16:43:27');
    expect(iso).toBe('2026-08-31T16:43:27-03:00');
    expect(new Date(iso!).toISOString()).toBe('2026-08-31T19:43:27.000Z');
    expect(ei.parseDataHoraBRT('2026-08-31')).toBeNull();
  });
  it('telefone vira digits-only com DDD, sem o 55', () => {
    expect(ei.telefoneDigits('+55 21 90000-3163')).toBe('21900003163');
    expect(ei.telefoneDigits('21.90000-2864')).toBe('21900002864');
    expect(ei.telefoneDigits('diego 21 90000-0080 Eduarda 21 900003802')).toBe('21900000080');
    expect(ei.telefoneDigits('Simone +55 21 90000-7924')).toBe('21900007924');
    expect(ei.telefoneDigits('2133334444')).toBe('2133334444');
    expect(ei.telefoneDigits('')).toBeNull();
  });
  it('sim/não tri-estado e sexo canônico', () => {
    expect(ei.simNao('Sim')).toBe(true);
    expect(ei.simNao('Não')).toBe(false);
    expect(ei.simNao('NAO')).toBe(false);
    expect(ei.simNao('')).toBeNull();
    expect(ei.simNao('Sim, Não')).toBeNull();
    expect(ei.sexoCanonico('Feminino')).toBe('feminino');
    expect(ei.sexoCanonico('masculino')).toBe('masculino');
    expect(ei.sexoCanonico('')).toBeNull();
  });
});

describe('eInscricao · CSV → inscrição', () => {
  const recs = ei.parseCsvEInscricao(CSV);
  it('lê o CSV da plataforma (`;`, aspas, TAB no cabeçalho)', () => {
    expect(recs).toHaveLength(2);
    expect(recs[0]['Nome']).toBe('Davi Teste da Silva');
    expect(recs[0]['Já aceitou Jesus como seu salvador?']).toBe('Sim');
    expect(recs[0]['Informe 2 contatos (nome + telefone), para casos de emergência:']).toContain(';');
  });
  it('menor: contrato completo, bloco do responsável, respostas nas keys do evento', () => {
    const l = ei.mapearLinhaEInscricao(recs[0], { arquivo: 'teste.csv', importadoEm: '2026-09-09T12:00:00Z' });
    expect(l.avisos).toEqual([]);
    expect(l.origem).toBe('e_inscricao');
    expect(l.status).toBe('confirmada');
    expect(l.cpf).toBe('12345678909');
    expect(l.email).toBe('davi@exemplo.com');
    expect(l.telefone).toBe('21900003163');
    expect(l.data_nascimento).toBe('2010-10-08');
    expect(l.sexo).toBe('masculino');
    expect(l.valor_cobrado_centavos).toBe(80325);
    expect(l.created_at).toBe('2026-09-06T09:00:22-03:00');
    expect(l.responsavel_nome).toBe('Raphael Pessoa');
    expect(l.responsavel_cpf).toBe('11144477735');
    expect(l.responsavel_parentesco).toBe('Pai');
    expect(l.responsavel_telefone).toBe('21900000012');
    expect(l.responsavel_email).toBe('rapha@exemplo.com');
    expect(l.responsavel_autoriza_batismo).toBe(true);
    expect(l.dados.c_retiro_jesus).toBe('Sim');
    expect(l.dados.c_retiro_batizado).toBe('Não');
    expect(l.dados.c_retiro_alergia).toBe('Sim');
    expect(l.dados.c_retiro_qual_med).toBe('dipirona');
    expect(l.dados.c_retiro_igreja).toBeUndefined();
    expect(l.dados.e_inscricao).toMatchObject({
      plataforma: 'E-Inscrição', codigo: 'TESTE-001', forma_pagamento: 'cartao', parcelas: 5,
      valor_bruto_centavos: 85000, taxa_pct: 5.5, valor_liquido_centavos: 80325,
      arquivo: 'teste.csv', importado_em: '2026-09-09T12:00:00Z',
    });
    expect(l.dados.e_inscricao.aceites.info_retiro).toBe('Aceito (versão 77eec477)');
  });
  it('adulto: "X" não vira responsável nem resposta; cancelada vira status cancelada', () => {
    const l = ei.mapearLinhaEInscricao(recs[1]);
    expect(l.avisos).toEqual([]);
    expect(l.status).toBe('cancelada');
    expect(l.responsavel_nome).toBeNull();
    expect(l.responsavel_autoriza_batismo).toBeNull();
    expect(l.dados.c_retiro_igreja).toBeUndefined();
    expect(l.dados.c_retiro_restricao).toBeUndefined();
    expect(l.dados.e_inscricao.forma_pagamento).toBeNull();
    expect(l.dados.e_inscricao.parcelas).toBeNull();
    expect(l.dados.e_inscricao.cancelada).toBe(true);
  });
  it('avisa (não inventa) quando um campo do contrato não é reconhecido', () => {
    const l = ei.mapearLinhaEInscricao({ ...recs[0], 'Data de Nascimento:': '99/99/9999', 'Telefone para Contato:': 'sem' });
    expect(l.data_nascimento).toBeNull();
    expect(l.telefone).toBeNull();
    expect(l.avisos).toContain('data de nascimento não reconhecida');
    expect(l.avisos).toContain('telefone não reconhecido');
  });
});

describe('eInscricao · placar por plataforma', () => {
  it('separa E-Inscrição × sistema, ignora cancelada e soma o líquido', () => {
    const r = ei.resumoPorPlataforma([
      { origem: 'e_inscricao', status: 'confirmada', valor_cobrado_centavos: 80325 },
      { origem: 'e_inscricao', status: 'confirmada', valor_cobrado_centavos: 80325 },
      { origem: 'e_inscricao', status: 'cancelada', valor_cobrado_centavos: 80325 },
      { origem: 'formulario_publico', status: 'confirmada', valor_cobrado_centavos: 83000 },
      { origem: 'formulario_publico', status: 'recebida', valor_cobrado_centavos: 83000 },
      { origem: 'balcao', status: 'cancelada', valor_cobrado_centavos: null },
    ], 83000);
    expect(r.externo.inscritos).toBe(2);
    expect(r.externo.valor_liquido_centavos).toBe(160650);
    expect(r.sistema.inscritos).toBe(2);
    expect(r.sistema.arrecadado_centavos).toBe(83000);
    expect(r.total_inscritos).toBe(4);
    expect(r.total_centavos).toBe(243650);
  });
  it('sem arrecadado do sistema o total fica null (não finge zero)', () => {
    const r = ei.resumoPorPlataforma([{ origem: 'e_inscricao', status: 'confirmada', valor_cobrado_centavos: 1 }], null);
    expect(r.total_centavos).toBeNull();
    expect(r.externo.valor_liquido_centavos).toBe(1);
  });
});
