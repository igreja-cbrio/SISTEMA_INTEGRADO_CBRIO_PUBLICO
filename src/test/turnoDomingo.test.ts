import { describe, it, expect } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { turnoPorHorario, montarTurnos } = require('../../backend/utils/turnoDomingo');
import { turnoDoCulto, LIMITE_MANHA } from '../lib/turnoCulto';

describe('turnoPorHorario', () => {
  it('manhã até 12h; a partir dela noite', () => {
    expect(turnoPorHorario('08:30:00')).toBe('manha');
    expect(turnoPorHorario('11:59')).toBe('manha');
    expect(turnoPorHorario('12:00')).toBe('noite');
    expect(turnoPorHorario('19:00:00')).toBe('noite');
  });
  it('hora inválida devolve null — nunca "manhã"', () => {
    expect(turnoPorHorario(null)).toBeNull();
    expect(turnoPorHorario('manhã')).toBeNull();
    expect(turnoPorHorario('')).toBeNull();
  });
  it('⚠️ é ESPELHO da régua do gráfico (src/lib/turnoCulto)', () => {
    for (const h of ['08:30', '09:30', '10:00', '11:30', '11:59', '12:00', '19:00']) {
      expect(turnoPorHorario(`${h}:00`))
        .toBe(turnoDoCulto({ nome: 'x', recurrence_day: 0, recurrence_time: h }));
    }
    expect(LIMITE_MANHA).toBe('12:00');
  });
});









describe('montarTurnos · o número que estava errado', () => {
  const T = { '0830': 'a', '0930': 'e', '1000': 'b', '1130': 'c', '1900': 'd' };
  const turnoPorTipo = new Map<string, string>([
    [T['0830'], 'manha'], [T['0930'], 'manha'], [T['1000'], 'manha'],
    [T['1130'], 'manha'], [T['1900'], 'noite'],
  ]);


  const linhasHist = [
    ...[33, 34].flatMap((sem) => [
      { service_type_id: T['0830'], semana_iso: sem, valor: 200 },
      { service_type_id: T['1000'], semana_iso: sem, valor: 450 },
      { service_type_id: T['1130'], semana_iso: sem, valor: 620 },
      { service_type_id: T['1900'], semana_iso: sem, valor: 360 },
    ]),
    { service_type_id: T['0930'], semana_iso: 35, valor: 376 },
    { service_type_id: T['1130'], semana_iso: 35, valor: 616 },
    { service_type_id: T['1900'], semana_iso: 35, valor: 327 },
  ];
  const linhasSemana = [
    { service_type_id: T['0930'], valor: 376 },
    { service_type_id: T['1130'], valor: 616 },
    { service_type_id: T['1900'], valor: 327 },
  ];

  const out = montarTurnos({
    linhasSemana, linhasHist, turnoPorTipo, capacidade: 1050, usaOcupacao: true,
  });
  const m = out.find((x: any) => x.turno === 'manha');
  const n = out.find((x: any) => x.turno === 'noite');

  it('a semana é a soma dos cultos que rodaram', () => {
    expect(m.valor_absoluto).toBe(376 + 616);
    expect(n.valor_absoluto).toBe(327);
  });

  it('⚠️⚠️ a média INCLUI os cultos que encerraram — é a média das SOMAS semanais', () => {


    expect(m.media).toBe(1177);


    expect(m.media).toBeGreaterThan(996);
  });

  it('declara quantas semanas entraram na média', () => {
    expect(m.semanas_na_media).toBe(3);
    expect(m.cultos_na_semana).toBe(2);
  });

  it('⚠️ ocupação sobre os lugares OFERECIDOS na semana (2 cultos = 2100)', () => {

    expect(m.taxa_ocupacao).toBe(47.2);
    expect(n.taxa_ocupacao).toBe(31.1);
  });

  it('turno que não rodou na semana não vira barra', () => {
    const so = montarTurnos({
      linhasSemana: [{ service_type_id: T['1130'], valor: 100 }],
      linhasHist, turnoPorTipo, capacidade: 1050, usaOcupacao: true,
    });
    expect(so.map((x: any) => x.turno)).toEqual(['manha']);
  });

  it('sem ocupação pedida, a taxa é null (não zero)', () => {
    const o = montarTurnos({ linhasSemana, linhasHist, turnoPorTipo, capacidade: 1050, usaOcupacao: false });
    expect(o[0].taxa_ocupacao).toBeNull();
  });

  it('culto fora do mapa de turno é ignorado, não somado na manhã', () => {
    const o = montarTurnos({
      linhasSemana: [...linhasSemana, { service_type_id: 'kids', valor: 500 }],
      linhasHist, turnoPorTipo, capacidade: 1050, usaOcupacao: true,
    });
    expect(o.find((x: any) => x.turno === 'manha').valor_absoluto).toBe(992);
  });

  it('entrada vazia devolve vazio', () => {
    expect(montarTurnos({})).toEqual([]);
  });
});
