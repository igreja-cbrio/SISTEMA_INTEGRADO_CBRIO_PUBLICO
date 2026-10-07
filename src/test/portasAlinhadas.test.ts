import { describe, it, expect } from 'vitest';
import { PERGUNTAS_SAUDE, normalizarSaude, precisaPagerPorInclusao } from '../../backend/utils/saudeCrianca.js';
import { sexoPara, patchDoCadastro, faltaDoContrato } from '../../backend/utils/dadosDoCadastro.js';












describe('saúde da criança · a régua ÚNICA das duas portas', () => {
  it('são as 3 que movem a operação de domingo, com o par sim/detalhe', () => {
    expect(PERGUNTAS_SAUDE.map((p) => p.campo)).toEqual([
      'tem_alergia', 'tem_espectro', 'tem_limitacao_fisica',
    ]);
    for (const p of PERGUNTAS_SAUDE) expect(p.detalhe).toBe(`${p.campo.replace('tem_', '')}_qual`);
  });




  it('pergunta não respondida NÃO vira "não"', () => {
    expect(normalizarSaude({})).toEqual({});
    expect(normalizarSaude({ tem_alergia: null })).toEqual({});
    expect(normalizarSaude({ tem_alergia: 'sim' })).toEqual({});
    expect(normalizarSaude(undefined)).toEqual({});
  });

  it('"sim" guarda o detalhe e "não" o LIMPA', () => {
    expect(normalizarSaude({ tem_alergia: true, alergia_qual: '  amendoim ' }))
      .toEqual({ tem_alergia: true, alergia_qual: 'amendoim' });


    expect(normalizarSaude({ tem_alergia: false, alergia_qual: 'amendoim' }))
      .toEqual({ tem_alergia: false, alergia_qual: null });

    expect(normalizarSaude({ tem_espectro: true })).toEqual({ tem_espectro: true });
  });

  it('o pager de inclusão segue TEA ou limitação física — e nunca o desconhecido', () => {
    expect(precisaPagerPorInclusao({ tem_espectro: true })).toBe(true);
    expect(precisaPagerPorInclusao({ tem_limitacao_fisica: true })).toBe(true);
    expect(precisaPagerPorInclusao({ tem_alergia: true })).toBe(false);

    expect(precisaPagerPorInclusao({ tem_espectro: null })).toBe(false);
    expect(precisaPagerPorInclusao({})).toBe(false);
    expect(precisaPagerPorInclusao(null)).toBe(false);
  });
});

describe('sexoPara · os dois vocabulários do sistema', () => {



  it('aceita canônico na entrada — que é o que a base guarda', () => {
    expect(sexoPara('curto', 'masculino')).toBe('M');
    expect(sexoPara('curto', 'feminino')).toBe('F');
    expect(sexoPara('canonico', 'masculino')).toBe('masculino');
  });

  it('aceita o curto também, e normaliza caixa e espaço', () => {
    expect(sexoPara('curto', 'm')).toBe('M');
    expect(sexoPara('canonico', ' F ')).toBe('feminino');
  });

  it('o que não é sexo vira null, nunca um chute', () => {
    for (const v of [null, undefined, '', 'outro', 'X', 'nao informado']) {
      expect(sexoPara('canonico', v)).toBeNull();
      expect(sexoPara('curto', v)).toBeNull();
    }
  });
});

describe('patchDoCadastro · preenche, nunca sobrescreve', () => {
  const membro = {
    cpf: '111.444.777-35', data_nascimento: '1990-05-02', genero: 'masculino',
    email: '  Fulano@CBRio.com.br ', telefone: '(21) 99999-8888',
  };
  const MAPA = { cpf: 'cpf', data_nascimento: 'data_nascimento', sexo: 'sexo' };

  it('preenche só o que está vazio e normaliza o valor', () => {
    const linha = { cpf: null, data_nascimento: '', sexo: null };
    expect(patchDoCadastro(linha, membro, MAPA)).toEqual({
      cpf: '11144477735', data_nascimento: '1990-05-02', sexo: 'masculino',
    });
  });



  it('NÃO toca no que a pessoa (ou a equipe) já preencheu', () => {
    const linha = { cpf: '11144477735', data_nascimento: '1985-01-01', sexo: 'feminino' };
    expect(patchDoCadastro(linha, membro, MAPA)).toEqual({});
  });

  it('cada destino recebe o vocabulário DELE', () => {
    const vazia = { cpf: null, data_nascimento: null, sexo: null };
    expect(patchDoCadastro(vazia, membro, MAPA, { sexo: 'curto' }).sexo).toBe('M');
    expect(patchDoCadastro(vazia, membro, MAPA, { sexo: 'canonico' }).sexo).toBe('masculino');
  });




  it('ignora campo cuja coluna não veio na linha', () => {
    const semSexo = { cpf: null, data_nascimento: null };
    expect(patchDoCadastro(semSexo, membro, MAPA)).toEqual({
      cpf: '11144477735', data_nascimento: '1990-05-02',
    });
  });

  it('cadastro sem o dado não inventa valor', () => {
    const linha = { cpf: null, data_nascimento: null, sexo: null };
    expect(patchDoCadastro(linha, { cpf: null, data_nascimento: null, genero: null }, MAPA)).toEqual({});
  });

  it('faltaDoContrato aponta só o que a linha realmente tem vazio', () => {
    expect(faltaDoContrato({ cpf: null, data_nascimento: '1990-05-02' }, MAPA)).toEqual(['cpf']);
    expect(faltaDoContrato({ cpf: '11144477735', data_nascimento: '1990-05-02' }, MAPA)).toEqual([]);
  });
});
