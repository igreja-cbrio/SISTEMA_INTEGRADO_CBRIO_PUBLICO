






import { describe, it, expect } from 'vitest';
import {
  PCONTATO_OPCOES, PCONTATO_LABEL, PCONTATO_COR, PCONTATO_FEITO,
  PCONTATO_INALCANCAVEL, rotuloPrimeiroContato,
} from '../lib/primeiroContato';

describe('as opções oferecidas', () => {
  it('oferece "Contato impossível"', () => {
    const o = PCONTATO_OPCOES.find(x => x.v === 'contato_impossivel');
    expect(o).toBeDefined();
    expect(o!.label).toBe('Contato impossível');
  });


  it('"Não atendido" continua na lista', () => {
    expect(PCONTATO_OPCOES.some(x => x.v === 'nao_atendido')).toBe(true);
  });

  it('só um desfecho é positivo', () => {
    expect(PCONTATO_OPCOES.filter(x => x.positivo).map(x => x.v)).toEqual(['atendido_respondido']);
  });

  it('nenhum valor repetido, e todo valor tem rótulo e cor', () => {
    const vs = PCONTATO_OPCOES.map(x => x.v);
    expect(new Set(vs).size).toBe(vs.length);
    for (const v of vs) {
      expect(PCONTATO_LABEL[v], `rótulo de ${v}`).toBeTruthy();
      expect(PCONTATO_COR[v], `cor de ${v}`).toBeTruthy();
    }
  });
});

describe('contato FEITO', () => {


  it('"Contato impossível" NÃO conta como contato feito', () => {
    expect(PCONTATO_FEITO.has('contato_impossivel')).toBe(false);
  });

  it('número errado e sem retorno também não contam (régua do front)', () => {
    expect(PCONTATO_FEITO.has('numero_errado')).toBe(false);
    expect(PCONTATO_FEITO.has('sem_retorno')).toBe(false);
  });

  it('mensagem enviada conta, respondida ou não', () => {
    for (const v of ['contactada', 'nao_respondeu', 'nao_atendido', 'atendido_respondido']) {
      expect(PCONTATO_FEITO.has(v), v).toBe(true);
    }
  });
});

describe('inalcançável · sai do denominador do atendimento', () => {


  it('reúne número errado e contato impossível', () => {
    expect([...PCONTATO_INALCANCAVEL].sort()).toEqual(['contato_impossivel', 'numero_errado']);
  });

  it('quem recebeu mensagem nunca é inalcançável', () => {
    for (const v of ['contactada', 'nao_atendido', 'nao_respondeu', 'atendido_respondido']) {
      expect(PCONTATO_INALCANCAVEL.has(v), v).toBe(false);
    }
  });
});

describe('rotuloPrimeiroContato', () => {
  it('traduz o que a tela oferece', () => {
    expect(rotuloPrimeiroContato('contato_impossivel')).toBe('Contato impossível');
    expect(rotuloPrimeiroContato('nao_atendido')).toBe('Não atendido');
  });



  it('traduz os legados da planilha importada', () => {
    expect(rotuloPrimeiroContato('sem_retorno')).toBe('Sem retorno do responsável');
    expect(rotuloPrimeiroContato('nao_compareceu')).toBe('Não compareceu');
  });

  it('vazio vira travessão, nunca string vazia', () => {
    expect(rotuloPrimeiroContato(null)).toBe('—');
    expect(rotuloPrimeiroContato('')).toBe('—');
    expect(rotuloPrimeiroContato('   ')).toBe('—');
  });



  it('status desconhecido aparece cru, não some', () => {
    expect(rotuloPrimeiroContato('status_que_nao_existe')).toBe('status_que_nao_existe');
  });
});
