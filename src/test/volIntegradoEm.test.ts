













import { describe, it, expect } from 'vitest';
import { deveLimparCarimbo, diaIntegracaoBRT } from '../../backend/utils/volIntegradoEm.js';

describe('deveLimparCarimbo · sair de integrado limpa', () => {
  it('limpa ao voltar pra triagem', () => {
    expect(deveLimparCarimbo('integrado', 'inscrito')).toBe(true);
  });

  it('limpa ao voltar pro ministério', () => {
    expect(deveLimparCarimbo('integrado', 'enviado_ministerio')).toBe(true);
  });

  it('limpa ao registrar desistência de quem estava integrado', () => {
    expect(deveLimparCarimbo('integrado', 'desistente')).toBe(true);
  });

  it('NÃO limpa ao integrar (é quando o carimbo nasce)', () => {
    expect(deveLimparCarimbo('inscrito', 'integrado')).toBe(false);
    expect(deveLimparCarimbo('integrado', 'integrado')).toBe(false);
  });





  it('NÃO limpa quando a linha nunca foi integrada', () => {
    expect(deveLimparCarimbo('inscrito', 'enviado_ministerio')).toBe(false);
    expect(deveLimparCarimbo('enviado_ministerio', 'inscrito')).toBe(false);
    expect(deveLimparCarimbo('desistente', 'inscrito')).toBe(false);
    expect(deveLimparCarimbo(null, 'inscrito')).toBe(false);
    expect(deveLimparCarimbo(undefined, 'desistente')).toBe(false);
  });

  it('patch sem status (só feedback) não mexe no carimbo', () => {
    expect(deveLimparCarimbo('integrado', undefined)).toBe(false);
    expect(deveLimparCarimbo('integrado', null)).toBe(false);
    expect(deveLimparCarimbo('integrado', '')).toBe(false);
  });
});

describe('diaIntegracaoBRT · o dia é o da igreja', () => {
  it('22h de domingo em BRT ainda é domingo (em UTC já virou segunda)', () => {

    const agora = Date.parse('2026-08-18T01:00:00Z');
    expect(new Date(agora).toISOString().slice(0, 10)).toBe('2026-08-18');
    expect(diaIntegracaoBRT(agora)).toBe('2026-08-17');
  });

  it('meia-noite UTC ainda é o dia anterior no Rio', () => {
    expect(diaIntegracaoBRT(Date.parse('2026-08-17T00:00:00Z'))).toBe('2026-08-16');
  });

  it('meio-dia BRT bate com o dia UTC', () => {
    expect(diaIntegracaoBRT(Date.parse('2026-08-17T15:00:00Z'))).toBe('2026-08-17');
  });

  it('devolve sempre AAAA-MM-DD', () => {
    expect(diaIntegracaoBRT(Date.parse('2026-01-05T14:00:00Z'))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
