


import { describe, it, expect } from 'vitest';
import { botPodeResponder, webhookDesligado } from '../../backend/utils/freioBot.js';

describe('freio do bot · respostas_automaticas', () => {
  it('freio LIGADO no banco: o bot cala', () => {
    expect(botPodeResponder({ cfg: { respostas_automaticas: false } })).toBe(false);
  });

  it('freio DESLIGADO no banco: o bot responde', () => {
    expect(botPodeResponder({ cfg: { respostas_automaticas: true } })).toBe(true);
  });

  it('⚠️⚠️ ERRO ao ler a config → NÃO responde (fail-CLOSED)', () => {

    expect(botPodeResponder({ cfg: null, erroConfig: { message: 'timeout' } })).toBe(false);

    expect(botPodeResponder({ cfg: { respostas_automaticas: true }, erroConfig: { message: 'x' } })).toBe(false);
  });

  it('⚠️ config ausente também não libera', () => {
    expect(botPodeResponder({ cfg: null })).toBe(false);
    expect(botPodeResponder({})).toBe(false);
  });

  it('⚠️ coluna AUSENTE mantém o comportamento histórico (responde)', () => {


    expect(botPodeResponder({ cfg: { ia_ativa: true } })).toBe(true);
  });

  it('⚠️ valor estranho não é lido como freio', () => {

    expect(botPodeResponder({ cfg: { respostas_automaticas: 0 } })).toBe(true);
    expect(botPodeResponder({ cfg: { respostas_automaticas: null } })).toBe(true);
  });
});

describe('freio de emergência · ia_ativa', () => {
  it('só um false EXPLÍCITO corta o webhook', () => {
    expect(webhookDesligado({ cfg: { ia_ativa: false } })).toBe(true);
    expect(webhookDesligado({ cfg: { ia_ativa: true } })).toBe(false);
  });

  it('⚠️⚠️ FAIL-OPEN de propósito — direção OPOSTA à do outro freio', () => {


    expect(webhookDesligado({ cfg: null })).toBe(false);
    expect(webhookDesligado({})).toBe(false);
  });

  it('as duas direções são OPOSTAS no mesmo cenário de falha', () => {
    const semConfig = { cfg: null };
    expect(botPodeResponder(semConfig)).toBe(false);
    expect(webhookDesligado(semConfig)).toBe(false);
  });
});
