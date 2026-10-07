import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const {
  DIAS_PARA_FREQUENTADORA, DIAS_DE_PRAZO,
  devePromover, prazoDe, patchAposCheckin,
} = require_('../../backend/utils/kidsVisitante.js');












describe('kids · promoção de visitante', () => {
  it('promove no 3º dia com check-in', () => {
    expect(DIAS_PARA_FREQUENTADORA).toBe(3);
    expect(devePromover(3, true)).toBe(true);
    expect(devePromover(4, true)).toBe(true);
  });

  it('NÃO promove no 1º nem no 2º', () => {
    expect(devePromover(1, true)).toBe(false);
    expect(devePromover(2, true)).toBe(false);
  });

  it('quem já é frequentadora não é reavaliada — promoção é definitiva', () => {


    expect(devePromover(9, false)).toBe(false);
    expect(patchAposCheckin({ eVisitante: false, diasComCheckin: 1, hojeISO: '2026-08-20' })).toBeNull();
  });

  it('⚠️ entrada inválida não promove (fail-closed)', () => {



    expect(devePromover(undefined, true)).toBe(false);
    expect(devePromover(null, true)).toBe(false);
    expect(devePromover('três' as unknown as number, true)).toBe(false);



    expect(devePromover(Infinity, true)).toBe(false);
  });
});

describe('kids · prazo do cadastro de visitante', () => {
  it('são 4 semanas a partir do dia informado', () => {
    expect(DIAS_DE_PRAZO).toBe(28);
    expect(prazoDe('2026-08-20')).toBe('2026-09-17');
  });

  it('atravessa virada de mês e de ano', () => {
    expect(prazoDe('2026-12-20')).toBe('2027-01-17');
    expect(prazoDe('2028-02-10')).toBe('2028-03-09');
  });

  it('⚠️ o dia vem de FORA, nunca do relógio da máquina', () => {



    expect(prazoDe('2026-08-20')).toBe(prazoDe('2026-08-20'));
  });

  it('⚠️ dia inválido devolve null — sem prazo inventado', () => {
    for (const v of ['', null, undefined, 'ontem', '20/08/2026', '2026-8-20']) {
      expect(prazoDe(v as unknown as string), String(v)).toBeNull();
    }
  });
});

describe('⚠️⚠️ kids · o prazo ROLA a cada check-in (é o que viabiliza a régua de 3)', () => {
  it('1º check-in: segue visitante e ganha prazo', () => {
    const p = patchAposCheckin({ eVisitante: true, diasComCheckin: 1, hojeISO: '2026-08-20' });
    expect(p).toEqual({ data_limite: '2026-09-17', promovida: false });
  });

  it('2º check-in: segue visitante e o prazo é RENOVADO', () => {



    const p = patchAposCheckin({ eVisitante: true, diasComCheckin: 2, hojeISO: '2026-09-03' });
    expect(p).toEqual({ data_limite: '2026-10-01', promovida: false });
  });

  it('3º check-in: PROMOVE e limpa prazo e relação', () => {
    const p = patchAposCheckin({ eVisitante: true, diasComCheckin: 3, hojeISO: '2026-09-17' });
    expect(p).toEqual({ visitante: false, data_limite: null, visitante_relacao: null, promovida: true });
  });

  it('⚠️ promover LIMPA o data_limite — senão a varredura inativa depois', () => {


    const p = patchAposCheckin({ eVisitante: true, diasComCheckin: 5, hojeISO: '2026-09-17' });
    expect(p.data_limite).toBeNull();
    expect(p.visitante).toBe(false);
  });

  it('⚠️ o cenário QUINZENAL inteiro: 3 visitas, ninguém desativado', () => {

    const visitas = ['2026-08-02', '2026-08-16', '2026-08-30'];
    let prazo: string | null = null;
    visitas.forEach((dia, i) => {
      const p = patchAposCheckin({ eVisitante: true, diasComCheckin: i + 1, hojeISO: dia });

      if (prazo) expect(dia <= prazo, `visita ${dia} depois do prazo ${prazo}`).toBe(true);
      prazo = p.data_limite;
    });
    expect(prazo).toBeNull();
  });

  it('dia inválido não apaga o prazo que existe', () => {


    expect(patchAposCheckin({ eVisitante: true, diasComCheckin: 1, hojeISO: 'xx' })).toBeNull();
  });
});
