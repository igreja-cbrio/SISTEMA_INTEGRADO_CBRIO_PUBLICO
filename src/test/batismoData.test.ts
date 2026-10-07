









import { describe, it, expect } from 'vitest';
import {
  DATAS_ABERTAS_PADRAO, dataIso, resolverDataBatismo, mensagemData,
} from '../../backend/utils/batismoData.js';


const ABERTAS = ['2026-09-27', '2026-10-25', '2026-11-22'];

describe('a data escolhida', () => {
  it('vale quando está na janela aberta', () => {
    expect(resolverDataBatismo('2026-11-22', ABERTAS)).toEqual({ data: '2026-11-22', motivo: null });
  });

  it('a primeira data continua valendo (o caso de hoje)', () => {
    expect(resolverDataBatismo('2026-09-27', ABERTAS).data).toBe('2026-09-27');
  });




  it('SEM data cai na primeira aberta, não em erro', () => {
    expect(resolverDataBatismo(undefined, ABERTAS)).toEqual({ data: '2026-09-27', motivo: null });
    expect(resolverDataBatismo(null, ABERTAS).data).toBe('2026-09-27');
    expect(resolverDataBatismo('', ABERTAS).data).toBe('2026-09-27');
  });



  it('lixo no campo é erro, não ausência', () => {
    expect(resolverDataBatismo('amanha', ABERTAS)).toEqual({ data: null, motivo: 'data_invalida' });
    expect(resolverDataBatismo('27/09/2026', ABERTAS).motivo).toBe('data_invalida');
  });

  it('data que existe no calendário mas não na janela é recusada', () => {
    expect(resolverDataBatismo('2026-12-27', ABERTAS))
      .toEqual({ data: null, motivo: 'data_fora_da_janela' });
  });




  it('data do passado não passa só por ser ISO válida', () => {
    expect(resolverDataBatismo('2020-01-05', ABERTAS).motivo).toBe('data_fora_da_janela');
  });


  it('sem datas abertas não grava nada', () => {
    expect(resolverDataBatismo('2026-11-22', [])).toEqual({ data: null, motivo: 'sem_datas_abertas' });
    expect(resolverDataBatismo(undefined, []).motivo).toBe('sem_datas_abertas');
    expect(resolverDataBatismo('2026-11-22', null as never).motivo).toBe('sem_datas_abertas');
  });
});

describe('a validação de data ISO', () => {
  it('aceita só YYYY-MM-DD real', () => {
    expect(dataIso('2026-11-22')).toBe('2026-11-22');
    expect(dataIso('2026-1-5')).toBeNull();
    expect(dataIso('22/11/2026')).toBeNull();
  });



  it('rejeita dia que não existe', () => {
    expect(dataIso('2026-02-31')).toBeNull();
    expect(dataIso('2026-13-01')).toBeNull();
    expect(dataIso('2026-04-31')).toBeNull();
  });

  it('aceita 29/02 em ano bissexto e recusa fora dele', () => {
    expect(dataIso('2028-02-29')).toBe('2028-02-29');
    expect(dataIso('2026-02-29')).toBeNull();
  });

  it('lista com datas tortas não contamina a janela', () => {
    expect(resolverDataBatismo('2026-11-22', ['lixo', '2026-11-22']).data).toBe('2026-11-22');
    expect(resolverDataBatismo('lixo', ['lixo', '2026-11-22']).motivo).toBe('data_invalida');
  });
});

describe('a frase que a pessoa lê', () => {
  it('cada motivo tem mensagem própria', () => {
    expect(mensagemData('sem_datas_abertas')).toContain('ainda não foram abertas');
    expect(mensagemData('data_fora_da_janela')).toContain('não está mais disponível');
    expect(mensagemData('data_invalida')).toContain('inválida');
    expect(mensagemData(null)).toBeNull();
  });
});

describe('o horizonte', () => {


  it('a janela padrão é de 3 datas', () => {
    expect(DATAS_ABERTAS_PADRAO).toBe(3);
  });
});
