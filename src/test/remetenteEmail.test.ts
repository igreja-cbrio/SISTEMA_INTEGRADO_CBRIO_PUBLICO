









import { describe, it, expect } from 'vitest';
import {
  REMETENTE_NOME_PADRAO, nomeDeExibicao, remetenteResend,
} from '../../backend/utils/remetenteEmail.js';

describe('nome de exibição', () => {
  it('sem fromName, o nome é nosso — nunca o da caixa', () => {


    expect(nomeDeExibicao(undefined)).toBe('CBRio');
    expect(nomeDeExibicao(null as unknown as string)).toBe('CBRio');
    expect(REMETENTE_NOME_PADRAO).toBe('CBRio');
  });

  it('quem pede nome próprio continua mandando', () => {

    expect(nomeDeExibicao('Voluntariado CBRio')).toBe('Voluntariado CBRio');
    expect(nomeDeExibicao('  Equipe Next  ')).toBe('Equipe Next');
  });

  it('string vazia conta como "não pediu"', () => {


    expect(nomeDeExibicao('')).toBe('CBRio');
    expect(nomeDeExibicao('   ')).toBe('CBRio');
  });
});

describe('remetente do Resend (fallback)', () => {
  it('carimba o nome mantendo o endereço configurado', () => {
    expect(remetenteResend('CBRio <noreply@cbrio.org>', 'Voluntariado CBRio'))
      .toBe('Voluntariado CBRio <noreply@cbrio.org>');
    expect(remetenteResend('noreply@cbrio.org', undefined))
      .toBe('CBRio <noreply@cbrio.org>');
  });

  it('⚠️ NUNCA troca o endereço', () => {


    const saida = remetenteResend('Email Automático - CBRio <noreply@cbrio.org>', 'CBRio');
    expect(saida).toContain('<noreply@cbrio.org>');
    expect(saida).toBe('CBRio <noreply@cbrio.org>');
    expect(remetenteResend('x <a@b.com>', 'Nome <hacker@mal.com>')).toContain('<a@b.com>');
  });

  it('sem remetente configurado, devolve vazio (o chamador decide)', () => {
    expect(remetenteResend('', 'CBRio')).toBe('');
    expect(remetenteResend(undefined as unknown as string, 'CBRio')).toBe('');
  });
});
