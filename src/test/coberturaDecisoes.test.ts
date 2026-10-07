import { describe, it, expect } from 'vitest';
import { conferirCobertura, textoDivergencia } from '../lib/coberturaDecisoes';






describe('conferirCobertura · nome × número por tipo', () => {




  it('a sobra de um tipo NÃO cancela a falta do outro', () => {
    const cob = conferirCobertura({
      declaradoPresencial: 8, declaradoOnline: 1,
      nomesPresencial: 0, nomesOnline: 2,
    });
    expect(cob.presencial.faltamNomes).toBe(8);
    expect(cob.online.sobramNomes).toBe(1);
    expect(cob.divergentes).toHaveLength(2);
  });



  it('nome online sem número nenhum é divergência declarada', () => {
    const cob = conferirCobertura({
      declaradoPresencial: 0, declaradoOnline: 0,
      nomesPresencial: 0, nomesOnline: 3,
    });
    expect(cob.nomesOnlineSemNumero).toBe(true);
    expect(cob.online.sobramNomes).toBe(3);
    expect(cob.presencial.gap).toBe(0);
  });




  it('número online parcial ainda deixa nome de fora', () => {
    const cob = conferirCobertura({
      declaradoPresencial: 7, declaradoOnline: 1,
      nomesPresencial: 7, nomesOnline: 3,
    });
    expect(cob.nomesOnlineSemNumero).toBe(true);
    expect(cob.online.sobramNomes).toBe(2);
    expect(cob.presencial.gap).toBe(0);
  });


  it('tudo conferido não vira divergência', () => {
    const cob = conferirCobertura({
      declaradoPresencial: 4, declaradoOnline: 0,
      nomesPresencial: 4, nomesOnline: 0,
    });
    expect(cob.divergentes).toHaveLength(0);
    expect(cob.nomesOnlineSemNumero).toBe(false);
    expect(textoDivergencia(cob)).toBeNull();
  });



  it('número online sem nome continua sendo falta de nome', () => {
    const cob = conferirCobertura({
      declaradoPresencial: 1, declaradoOnline: 3,
      nomesPresencial: 1, nomesOnline: 0,
    });
    expect(cob.online.faltamNomes).toBe(3);
    expect(cob.nomesOnlineSemNumero).toBe(false);
  });



  it('null e undefined contam como zero', () => {
    const cob = conferirCobertura({
      declaradoPresencial: null, declaradoOnline: undefined,
      nomesPresencial: 0, nomesOnline: 2,
    });
    expect(cob.online.sobramNomes).toBe(2);
    expect(cob.nomesOnlineSemNumero).toBe(true);
  });



  it('valor inválido não fabrica divergência', () => {
    const cob = conferirCobertura({
      declaradoPresencial: -5, declaradoOnline: NaN as unknown as number,
      nomesPresencial: 0, nomesOnline: 0,
    });
    expect(cob.divergentes).toHaveLength(0);
  });
});

describe('textoDivergencia', () => {



  it('no caso do nome online sem número, aponta o campo certo', () => {
    const t = textoDivergencia(conferirCobertura({
      declaradoPresencial: 0, declaradoOnline: 0,
      nomesPresencial: 0, nomesOnline: 3,
    }))!;
    expect(t).toContain('Online · chat e outros');
    expect(t).toContain('não soma sozinho');
    expect(t).toContain('3');
  });

  it('cobra nome faltando quando o número é maior', () => {
    const t = textoDivergencia(conferirCobertura({
      declaradoPresencial: 8, declaradoOnline: 0,
      nomesPresencial: 2, nomesOnline: 0,
    }))!;
    expect(t).toContain('6');
    expect(t).toContain('presencial');
  });



  it('declara os dois tipos quando os dois divergem', () => {
    const t = textoDivergencia(conferirCobertura({
      declaradoPresencial: 8, declaradoOnline: 1,
      nomesPresencial: 0, nomesOnline: 2,
    }))!;
    expect(t).toContain('online');
    expect(t).toContain('presencial');
    expect(t).toContain('8');
  });

  it('singular e plural', () => {
    const um = textoDivergencia(conferirCobertura({
      declaradoPresencial: 0, declaradoOnline: 0, nomesPresencial: 0, nomesOnline: 1,
    }))!;
    expect(um).toContain('1 nome online cadastrado não está');
    expect(um).not.toContain('nomes online cadastrados');
  });
});
