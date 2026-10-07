










import { describe, it, expect } from 'vitest';
import { montarSerie, TOLERANCIA } from '../../backend/utils/kpiSerie.js';

const AGOSTO = { periodo: '2026-08', numerador: 37, denominador: 61, valor: 60.66 };
const SETEMBRO = { periodo: '2026-09', numerador: 11, denominador: 31, valor: 35.48 };

describe('a tabela mostra o número inteiro, não só o resultado', () => {
  it('devolve numerador e denominador de cada mês', () => {
    const s = montarSerie([AGOSTO], []);
    expect(s.tem_partes).toBe(true);
    expect(s.linhas[0]).toMatchObject({ periodo: '2026-08', numerador: 37, denominador: 61, valor: 60.66 });
  });

  it('mês sem escala nenhuma aparece com zero, não some', () => {
    const s = montarSerie([{ periodo: '2026-04', numerador: 0, denominador: 0, valor: null }], []);
    expect(s.linhas).toHaveLength(1);
    expect(s.linhas[0].denominador).toBe(0);
    expect(s.linhas[0].valor).toBeNull();
  });

  it('converte texto numérico do Postgres (numeric vem string)', () => {
    const s = montarSerie([{ periodo: '2026-08', numerador: '37', denominador: '61', valor: '60.66' }], []);
    expect(s.linhas[0].numerador).toBe(37);
    expect(s.linhas[0].valor).toBe(60.66);
  });
});

describe('⚠️ a divergência entre o card e a verdade', () => {
  it('marca o mês em que o gravado ficou para trás do ao vivo', () => {
    const s = montarSerie([AGOSTO], [{ periodo_referencia: '2026-08', valor_calculado: '24.14' }]);
    expect(s.linhas[0].divergente).toBe(true);
    expect(s.linhas[0].valor_gravado).toBe(24.14);
    expect(s.divergencias).toBe(1);
  });

  it('não marca divergência quando os dois batem', () => {
    const s = montarSerie([AGOSTO], [{ periodo_referencia: '2026-08', valor_calculado: '60.66' }]);
    expect(s.linhas[0].divergente).toBe(false);
    expect(s.divergencias).toBe(0);
  });








  it('arredondamento (0,02) não vira alarme, mas 0,20 vira', () => {
    const perto = montarSerie([AGOSTO], [{ periodo_referencia: '2026-08', valor_calculado: '60.68' }]);
    expect(perto.linhas[0].divergente).toBe(false);
    const longe = montarSerie([AGOSTO], [{ periodo_referencia: '2026-08', valor_calculado: '60.86' }]);
    expect(longe.linhas[0].divergente).toBe(true);
    expect(TOLERANCIA).toBeGreaterThan(0);
  });



  it('mês sem valor gravado não é divergente', () => {
    const s = montarSerie([SETEMBRO], []);
    expect(s.linhas[0].valor_gravado).toBeNull();
    expect(s.linhas[0].divergente).toBe(false);
    expect(s.divergencias).toBe(0);
  });
});

describe('⚠️ sem ramo de partes, mostra o histórico gravado — não inventa', () => {
  const s = montarSerie([], [
    { periodo_referencia: '2026-07', valor_calculado: '38.41' },
    { periodo_referencia: '2026-06', valor_calculado: '41.79' },
  ]);

  it('marca que não tem partes e não finge numerador', () => {
    expect(s.tem_partes).toBe(false);
    expect(s.linhas.every((l: { numerador: number | null }) => l.numerador === null)).toBe(true);
  });

  it('ordena por período mesmo vindo fora de ordem', () => {
    expect(s.linhas.map((l: { periodo: string }) => l.periodo)).toEqual(['2026-06', '2026-07']);
  });

  it('não acusa divergência consigo mesmo', () => {
    expect(s.divergencias).toBe(0);
  });
});

describe('entrada torta não derruba a ficha', () => {
  it('aceita null nos dois lados', () => {
    expect(montarSerie(null as never, null as never)).toEqual({ tem_partes: false, linhas: [], divergencias: 0 });
  });

  it('ignora linha gravada sem período', () => {
    const s = montarSerie([], [{ periodo_referencia: null, valor_calculado: '10' }] as never);
    expect(s.linhas).toHaveLength(0);
  });
});








describe('⚠️⚠️ período futuro não entra na tabela', () => {
  const gravados = [
    { periodo_referencia: '2026-W37', valor_calculado: '1400' },
    { periodo_referencia: '2026-W38', valor_calculado: '1032' },
    { periodo_referencia: '2026-W39', valor_calculado: '0' },
    { periodo_referencia: '2026-W52', valor_calculado: '0' },
  ];

  it('corta as semanas que ainda não aconteceram', () => {
    const s = montarSerie([], gravados, '2026-W38');
    expect(s.linhas.map((l: { periodo: string }) => l.periodo)).toEqual(['2026-W37', '2026-W38']);
  });

  it('o próprio período corrente FICA — ele já começou', () => {
    const s = montarSerie([], gravados, '2026-W39');
    expect(s.linhas.map((l: { periodo: string }) => l.periodo)).toContain('2026-W39');
    expect(s.linhas.map((l: { periodo: string }) => l.periodo)).not.toContain('2026-W52');
  });

  it('corta também a série recalculada ao vivo', () => {
    const s = montarSerie(
      [{ periodo: '2026-08', numerador: 37, denominador: 61, valor: 60.66 },
       { periodo: '2026-12', numerador: 0, denominador: 0, valor: null }],
      [], '2026-09');
    expect(s.linhas).toHaveLength(1);
    expect(s.linhas[0].periodo).toBe('2026-08');
  });




  it('semana de um dígito não confunde a ordem (W09 < W10)', () => {
    const s = montarSerie([], [
      { periodo_referencia: '2026-W09', valor_calculado: '5' },
      { periodo_referencia: '2026-W10', valor_calculado: '7' },
    ], '2026-W09');
    expect(s.linhas.map((l: { periodo: string }) => l.periodo)).toEqual(['2026-W09']);
  });

  it('sem período corrente informado, nada é cortado (compatível)', () => {
    expect(montarSerie([], gravados).linhas).toHaveLength(4);
  });
});
