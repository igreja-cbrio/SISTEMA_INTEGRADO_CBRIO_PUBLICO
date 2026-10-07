





import { describe, it, expect } from 'vitest';
import { cotaDisponivel, tetoEfetivo, CAPACIDADE_24H, RESERVA_OPERACIONAL } from '../../backend/utils/cotaMeta.js';

describe('cota de 24h da Meta', () => {
  it('⚠️⚠️ a 2ª rodada do incidente de 26/08 é BLOQUEADA', () => {

    const r = tetoEfetivo({ tetoCanal: 200, unicos24h: 200 });
    expect(r.teto).toBe(0);
    expect(r.motivo).toBe('cota_24h_esgotada');
  });

  it('dia limpo: a rodada sai inteira, como antes', () => {
    const r = tetoEfetivo({ tetoCanal: 200, unicos24h: 0 });
    expect(r.teto).toBe(200);
    expect(r.motivo).toBe('teto_do_canal');
  });

  it('⚠️ com a cota parcialmente usada, a rodada ENCOLHE e diz por quê', () => {
    const r = tetoEfetivo({ tetoCanal: 200, unicos24h: 150 });
    expect(r.teto).toBe(50);
    expect(r.motivo).toBe('limitado_pela_cota_24h');
    expect(r.contatados_24h ?? r.unicos_24h).toBe(150);
  });

  it('⚠️⚠️ não conseguir CONTAR não libera nada (fail-CLOSED)', () => {

    expect(tetoEfetivo({ tetoCanal: 200, unicos24h: null }).teto).toBe(0);
    expect(tetoEfetivo({ tetoCanal: 200 }).teto).toBe(0);
    expect(tetoEfetivo({ tetoCanal: 200, unicos24h: null }).motivo).toBe('nao_deu_pra_conferir_a_cota');
    expect(cotaDisponivel({})).toBe(0);
  });

  it('⚠️⚠️ a RESERVA operacional é intocável por campanha', () => {


    expect(cotaDisponivel({ unicos24h: 0 })).toBe(CAPACIDADE_24H - RESERVA_OPERACIONAL);
    expect(cotaDisponivel({ unicos24h: CAPACIDADE_24H - RESERVA_OPERACIONAL })).toBe(0);

    expect(cotaDisponivel({ unicos24h: 210 })).toBe(0);
  });

  it('nunca devolve negativo', () => {
    expect(cotaDisponivel({ unicos24h: 9999 })).toBe(0);
    expect(tetoEfetivo({ tetoCanal: 200, unicos24h: 9999 }).teto).toBe(0);
  });

  it('aceita o texto que o banco devolve', () => {
    expect(cotaDisponivel({ unicos24h: '150' })).toBe(50);
  });

  it('valor absurdo é tratado como zero usado, não como cota infinita', () => {
    expect(cotaDisponivel({ unicos24h: -5 })).toBe(CAPACIDADE_24H - RESERVA_OPERACIONAL);
  });

  it('⚠️ o teto do CANAL continua valendo quando é o menor', () => {
    expect(tetoEfetivo({ tetoCanal: 20, unicos24h: 0 }).teto).toBe(20);
  });
});
