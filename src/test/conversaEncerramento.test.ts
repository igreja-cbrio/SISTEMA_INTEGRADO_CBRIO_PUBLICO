

import { describe, it, expect } from 'vitest';
import {
  HORAS_TIMER, HORAS_JANELA, MARGEM_CRON_MIN, DIAS_INATIVIDADE,
  planoFinalizar, encerramentoPendente, encerraEm, pesquisaPermitida, motivoEncerramento,
} from '../../backend/utils/conversaEncerramento';

const AGORA = Date.parse('2026-09-28T15:00:00Z');
const H = 3_600_000;
const MIN = 60_000;
const iso = (msAtras: number) => new Date(AGORA - msAtras).toISOString();
const isoEm = (msDepois: number) => new Date(AGORA + msDepois).toISOString();

describe('planoFinalizar · o clique em Finalizar', () => {
  it('janela folgada → timer de 3h cheias', () => {
    const p = planoFinalizar({ resolvida: false, last_inbound_at: iso(1 * H) }, AGORA);
    expect(p.modo).toBe('timer');
    expect(p.encerraEm).toBe(isoEm(HORAS_TIMER * H));
    expect(p.reduzido).toBe(false);
  });
  it('janela acaba antes de 3h → timer REDUZIDO até o limite (janela − margem do cron)', () => {
    const p = planoFinalizar({ resolvida: false, last_inbound_at: iso(22 * H) }, AGORA);
    expect(p.modo).toBe('timer');
    expect(p.reduzido).toBe(true);
    expect(p.encerraEm).toBe(isoEm(2 * H - MARGEM_CRON_MIN * MIN));
  });
  it('janela ainda aberta mas sem folga pro cron → fecha agora COM pesquisa', () => {
    const p = planoFinalizar({ resolvida: false, last_inbound_at: iso(HORAS_JANELA * H - 30 * MIN) }, AGORA);
    expect(p.modo).toBe('agora_com_pesquisa');
  });
  it('janela já fechou → fecha agora SEM pesquisa', () => {
    const p = planoFinalizar({ resolvida: false, last_inbound_at: iso(30 * H) }, AGORA);
    expect(p.modo).toBe('agora_sem_pesquisa');
  });
  it('sem mensagem da pessoa → fecha agora sem pesquisa (não há janela)', () => {
    expect(planoFinalizar({ resolvida: false, last_inbound_at: null }, AGORA).modo).toBe('agora_sem_pesquisa');
  });
});

describe('timer armado', () => {
  it('a pessoa não escreveu → vale, e vence no prazo', () => {
    const c = { resolvida: false, encerrar_desde: iso(1 * H), last_inbound_at: iso(2 * H), last_message_at: iso(1 * H) };
    expect(encerramentoPendente(c)).toBe(true);
    expect(encerraEm(c)).toBe(isoEm(2 * H));
    expect(motivoEncerramento(c, AGORA)).toBeNull();
    expect(motivoEncerramento(c, AGORA + 2 * H)).toBe('finalizar');
  });
  it('a pessoa escreveu DEPOIS de armado → timer perde efeito, chat ativo', () => {
    const c = { resolvida: false, encerrar_desde: iso(4 * H), last_inbound_at: iso(1 * H), last_message_at: iso(1 * H) };
    expect(encerramentoPendente(c)).toBe(false);
    expect(encerraEm(c)).toBeNull();
    expect(motivoEncerramento(c, AGORA)).toBeNull();
  });
  it('o prazo do timer armado respeita a janela (a pesquisa sai antes dela fechar)', () => {
    const c = { resolvida: false, encerrar_desde: iso(0), last_inbound_at: iso(22 * H), last_message_at: iso(0) };
    const em = Date.parse(encerraEm(c)!);
    const janelaFim = AGORA - 22 * H + HORAS_JANELA * H;
    expect(em).toBeLessThanOrEqual(janelaFim - MARGEM_CRON_MIN * MIN);
    expect(pesquisaPermitida(c, em + 59 * MIN)).toBe(true);
  });
  it('conversa já finalizada nunca fecha de novo', () => {
    const c = { resolvida: true, encerrar_desde: iso(99 * H), last_inbound_at: iso(99 * H), last_message_at: iso(99 * 24 * H) };
    expect(encerramentoPendente(c)).toBe(false);
    expect(motivoEncerramento(c, AGORA)).toBeNull();
  });
});

describe('inatividade', () => {
  it('sem mensagem em nenhuma direção há 7 dias → fecha', () => {
    const c = { resolvida: false, encerrar_desde: null, last_inbound_at: iso(20 * 24 * H), last_message_at: iso(DIAS_INATIVIDADE * 24 * H) };
    expect(motivoEncerramento(c, AGORA)).toBe('inatividade');
  });
  it('mensagem recente (mesmo nossa) segura a conversa aberta', () => {
    const c = { resolvida: false, encerrar_desde: null, last_inbound_at: iso(20 * 24 * H), last_message_at: iso(DIAS_INATIVIDADE * 24 * H - MIN) };
    expect(motivoEncerramento(c, AGORA)).toBeNull();
  });
  it('fora da janela a pesquisa não é permitida', () => {
    expect(pesquisaPermitida({ last_inbound_at: iso(25 * H) }, AGORA)).toBe(false);
  });
});

describe('espelho da tela', () => {
  it('mesmo prazo que o backend', async () => {
    const tela = await import('../lib/waConversaEstado');
    expect(tela.HORAS_TIMER).toBe(HORAS_TIMER);
    expect(tela.MARGEM_CRON_MIN).toBe(MARGEM_CRON_MIN);
    const casos = [
      { resolvida: false, encerrar_desde: iso(1 * H), last_inbound_at: iso(2 * H), last_message_at: iso(1 * H) },
      { resolvida: false, encerrar_desde: iso(0), last_inbound_at: iso(22 * H), last_message_at: iso(0) },
      { resolvida: false, encerrar_desde: iso(4 * H), last_inbound_at: iso(1 * H), last_message_at: iso(1 * H) },
      { resolvida: false, encerrar_desde: iso(3 * H), last_inbound_at: null, last_message_at: iso(3 * H) },
      { resolvida: true, encerrar_desde: iso(3 * H), last_inbound_at: iso(9 * H), last_message_at: iso(9 * H) },
      { resolvida: false, encerrar_desde: null, last_inbound_at: iso(9 * H), last_message_at: iso(9 * H) },
    ];
    for (const c of casos) expect(tela.encerraEmFinalizar(c)).toBe(encerraEm(c));
  });
});
