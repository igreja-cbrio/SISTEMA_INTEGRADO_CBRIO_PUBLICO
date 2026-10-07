









import { describe, it, expect } from 'vitest';
import { resolverTelefoneVoluntario, ORIGENS } from '../../backend/utils/telefoneVoluntario.js';

const TEL_OK = '21999990000';
const TEL_OK2 = '2133334444';
const TEL_SUICO = '41000000018';
const TEL_CURTO = '900000015';

describe('resolverTelefoneVoluntario · ordem da cadeia', () => {
  it('prefere o telefone do próprio cadastro do voluntariado', () => {
    const r = resolverTelefoneVoluntario({
      nome: 'Fernando Monnerat',
      perfilTelefone: TEL_OK,
      membro: { id: 'm1', nome: 'Fernando Monnerat', telefone: TEL_OK2 },
    });
    expect(r.telefone).toBe(TEL_OK);
    expect(r.origem).toBe(ORIGENS.PERFIL);
  });

  it('cai no cadastro da PESSOA quando o perfil não tem telefone (o caso de 43 das 87 escalas)', () => {
    const r = resolverTelefoneVoluntario({
      nome: 'Anderson Roxo',
      perfilTelefone: null,
      membro: { id: 'm1', nome: 'Anderson Roxo', telefone: TEL_OK },
    });
    expect(r.telefone).toBe(TEL_OK);
    expect(r.origem).toBe(ORIGENS.MEMBRO);
    expect(r.membro_id).toBe('m1');
    expect(r.rotulo).toBeTruthy();
  });

  it('cai no CPF quando não há vínculo de membresia', () => {
    const r = resolverTelefoneVoluntario({
      nome: 'Alvaro Santos',
      membroPorCpf: { id: 'm9', nome: 'Álvaro Santos', telefone: TEL_OK },
    });
    expect(r.origem).toBe(ORIGENS.CPF);
    expect(r.membro_id).toBe('m9');
  });

  it('cai no formulário de voluntariado por último antes do contato secundário (os 16 casos)', () => {
    const r = resolverTelefoneVoluntario({
      nome: 'Elisa Sertania',
      inscricoes: [{ nome: 'Elisa dos Santos Sertania Sereno', telefone: TEL_OK }],
    });
    expect(r.telefone).toBe(TEL_OK);
    expect(r.origem).toBe(ORIGENS.INSCRICAO);
  });

  it('usa contato secundário só quando nada antes resolveu', () => {
    const r = resolverTelefoneVoluntario({
      nome: 'Katia Tercinal',
      membro: { id: 'm2', nome: 'Katia Tercinal', telefone: null },
      contatos: [{ telefone: TEL_OK }],
    });
    expect(r.origem).toBe(ORIGENS.CONTATO);
  });

  it('devolve vazio — e não inventa — quando ninguém tem telefone (os 28 restantes)', () => {
    const r = resolverTelefoneVoluntario({
      nome: 'Alguém Sem Contato',
      membro: { id: 'm3', nome: 'Alguém Sem Contato', telefone: null },
      inscricoes: [],
      contatos: [],
    });
    expect(r.telefone).toBeNull();
    expect(r.origem).toBeNull();
  });
});

describe('resolverTelefoneVoluntario · nome ABREVIADO é a mesma pessoa', () => {




  const PARES_REAIS: Array<[string, string]> = [
    ['Elisa Sertania', 'Elisa dos Santos Sertania Sereno'],
    ['Priscíla Figueiral', 'Priscíla Clariana Avelar Figueiral'],
    ['Katia Tercinal', 'Katia Figueira Dias Tercinal'],
    ['Flavio Goncal', 'FLAVIO GONCAL DOS SANTOS'],
    ['Carla Samira', 'Carla Samira de Mural'],
    ['Fabricio Monteiral', 'FABRICIO MONTEIRAL DOS SANTOS'],
    ['João Pablo Fronteiral', 'João Pablo Fronteiral dos Santos'],
    ['Vitorino Montinho', 'Vitorino Muralho Montinho'],
    ['Alvaro Santos', 'Álvaro Santos'],
    ['Lívia Quintal', 'Livia Quintal'],
  ];

  it.each(PARES_REAIS)('aceita "%s" × "%s"', (escala, inscricao) => {
    const r = resolverTelefoneVoluntario({ nome: escala, inscricoes: [{ nome: inscricao, telefone: TEL_OK }] });
    expect(r.telefone).toBe(TEL_OK);
  });
});

describe('resolverTelefoneVoluntario · não manda mensagem pra outra pessoa', () => {



  const PARENTES: Array<[string, string]> = [
    ['Ana Souza Lima', 'João Souza Lima'],
    ['Maria Silva', 'João Maria Silva'],
    ['Pablo Avelar', 'Paulo Avelar'],
    ['Fabricio Monteiral', 'Fernanda Monteiral dos Santos'],
    ['Ana Lima', 'Ana Pereiral Souza'],
  ];

  it.each(PARENTES)('recusa o telefone de "%s" quando o formulário é de "%s"', (escala, inscricao) => {
    const r = resolverTelefoneVoluntario({ nome: escala, inscricoes: [{ nome: inscricao, telefone: TEL_OK }] });
    expect(r.telefone).toBeNull();
  });

  it('exige nome dos DOIS lados no canal do formulário (ausência não é permissão)', () => {
    expect(resolverTelefoneVoluntario({ nome: '', inscricoes: [{ nome: 'Ana Souza', telefone: TEL_OK }] }).telefone).toBeNull();
    expect(resolverTelefoneVoluntario({ nome: 'Ana Souza', inscricoes: [{ nome: '', telefone: TEL_OK }] }).telefone).toBeNull();
  });

  it('VETA o cadastro vinculado quando os nomes são incompatíveis', () => {


    const r = resolverTelefoneVoluntario({
      nome: 'Ana Souza Lima',
      membro: { id: 'm1', nome: 'João Souza Lima', telefone: TEL_OK },
    });
    expect(r.telefone).toBeNull();
    expect(r.descartados.some((d: any) => d.motivo === 'nome_divergente')).toBe(true);
  });

  it('VETA o cadastro achado por CPF quando os nomes são incompatíveis', () => {
    const r = resolverTelefoneVoluntario({
      nome: 'Ana Souza Lima',
      membroPorCpf: { id: 'm1', nome: 'João Souza Lima', telefone: TEL_OK },
    });
    expect(r.telefone).toBeNull();
  });

  it('nome ausente num lado NÃO é divergência — o canal forte segue valendo', () => {


    const r = resolverTelefoneVoluntario({
      nome: '',
      membro: { id: 'm1', nome: 'Fernando Monnerat', telefone: TEL_OK },
    });
    expect(r.telefone).toBe(TEL_OK);
    expect(r.origem).toBe(ORIGENS.MEMBRO);
  });
});

describe('resolverTelefoneVoluntario · número que o envio não alcança é descartado', () => {




  it('descarta o número suíço, declarando o motivo', () => {
    const r = resolverTelefoneVoluntario({ nome: 'Priscila Künzler', perfilTelefone: TEL_SUICO });
    expect(r.telefone).toBeNull();
    expect(r.descartados[0].motivo).toBe('numero_errado');
  });

  it('descarta os 9 dígitos sem DDD', () => {
    expect(resolverTelefoneVoluntario({ nome: 'Desiree', perfilTelefone: TEL_CURTO }).telefone).toBeNull();
  });

  it('número ruim no perfil NÃO impede achar o bom no cadastro da pessoa', () => {
    const r = resolverTelefoneVoluntario({
      nome: 'Desiree Avelar',
      perfilTelefone: TEL_CURTO,
      membro: { id: 'm1', nome: 'Desiree Avelar', telefone: TEL_OK },
    });
    expect(r.telefone).toBe(TEL_OK);
    expect(r.origem).toBe(ORIGENS.MEMBRO);
  });

  it('aceita fixo de 10 dígitos e celular com DDI 55', () => {
    expect(resolverTelefoneVoluntario({ nome: 'X Y', perfilTelefone: TEL_OK2 }).telefone).toBe(TEL_OK2);
    expect(resolverTelefoneVoluntario({ nome: 'X Y', perfilTelefone: `55${TEL_OK}` }).telefone).toBe(`55${TEL_OK}`);
  });

  it('entrada vazia não explode', () => {
    expect(resolverTelefoneVoluntario().telefone).toBeNull();
    expect(resolverTelefoneVoluntario({}).telefone).toBeNull();
  });
});
