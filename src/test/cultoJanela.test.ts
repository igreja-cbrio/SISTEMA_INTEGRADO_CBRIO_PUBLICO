














import { describe, it, expect } from 'vitest';
import {
  DIAS_JANELA, hojeBRT, diasDesde, estadoJanelaCulto, dataBR,
} from '../../backend/utils/cultoJanela.js';

const CULTO = '2026-08-16';

describe('estadoJanelaCulto', () => {
  it('antes do culto: NÃO abre, e o estado é próprio', () => {

    expect(estadoJanelaCulto(CULTO, '2026-08-12')).toEqual({ estado: 'antes', dias: -4 });

    expect(estadoJanelaCulto(CULTO, '2026-08-15').estado).toBe('antes');
  });

  it('no dia do culto: aberto', () => {
    expect(estadoJanelaCulto(CULTO, CULTO)).toEqual({ estado: 'aberto', dias: 0 });
  });

  it('segue aberto por mais 2 dias — o atraso que a porta existe pra encurtar', () => {
    expect(estadoJanelaCulto(CULTO, '2026-08-17').estado).toBe('aberto');
    expect(estadoJanelaCulto(CULTO, '2026-08-18').estado).toBe('aberto');
    expect(DIAS_JANELA).toBe(2);
  });

  it('a partir do 3º dia vai pro conferente', () => {
    expect(estadoJanelaCulto(CULTO, '2026-08-19')).toEqual({ estado: 'encerrado', dias: 3 });

    expect(estadoJanelaCulto(CULTO, '2026-08-25').estado).toBe('encerrado');
  });

  it('data ilegível é FAIL-CLOSED (encerrado), nunca liberada', () => {
    expect(estadoJanelaCulto('', '2026-08-16').estado).toBe('encerrado');
    expect(estadoJanelaCulto('16/08/2026', '2026-08-16').estado).toBe('encerrado');
    expect(estadoJanelaCulto(CULTO, 'ontem').estado).toBe('encerrado');
  });

  it('atravessa a virada do mês e do ano sem se perder', () => {
    expect(estadoJanelaCulto('2026-12-31', '2027-01-02').estado).toBe('aberto');
    expect(estadoJanelaCulto('2026-12-31', '2027-01-03').estado).toBe('encerrado');
    expect(estadoJanelaCulto('2027-01-01', '2026-12-31').estado).toBe('antes');
  });
});

describe('hojeBRT · o dia é o da igreja, não o do servidor', () => {
  it('às 21h do Rio o dia UTC já virou — e o culto de domingo à noite está nessa faixa', () => {

    const agora = Date.parse('2026-08-17T00:30:00Z');
    expect(hojeBRT(agora)).toBe('2026-08-16');
    expect(estadoJanelaCulto(CULTO, hojeBRT(agora)).estado).toBe('aberto');
  });

  it('meio-dia no Rio dá o dia corrente', () => {
    expect(hojeBRT(Date.parse('2026-08-16T15:00:00Z'))).toBe('2026-08-16');
  });

  it('logo depois da meia-noite no Rio já é o dia seguinte', () => {
    expect(hojeBRT(Date.parse('2026-08-17T03:10:00Z'))).toBe('2026-08-17');
  });
});

describe('diasDesde', () => {
  it('negativo quando o culto ainda vai acontecer', () => {
    expect(diasDesde(CULTO, '2026-08-14')).toBe(-2);
    expect(diasDesde(CULTO, '2026-08-16')).toBe(0);
    expect(diasDesde(CULTO, '2026-08-20')).toBe(4);
  });

  it('data inválida devolve null, não 0', () => {

    expect(diasDesde('xx', '2026-08-16')).toBeNull();
  });
});

describe('dataBR', () => {
  it('formata pro texto que a pessoa lê', () => {
    expect(dataBR('2026-08-16')).toBe('16/08/2026');
  });
  it('data ausente não vira "undefined/undefined"', () => {
    expect(dataBR(null as any)).toBe('');
    expect(dataBR('2026-08')).toBe('');
  });
});
