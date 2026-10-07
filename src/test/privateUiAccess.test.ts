import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
const require_ = createRequire(import.meta.url);
const { privateUiAccess, emailNaLista } = require_('../../backend/utils/privateUiAccess.js');

afterEach(() => vi.unstubAllEnvs());

describe('configuração privada de acesso', () => {
  it('nega todos os indicadores sem configuração, inclusive para identidade vazia', () => {
    for (const key of ['UI_DEV_EMAILS', 'FIN_SAIDAS_EMAILS', 'MONITOR_OWNER_EMAIL']) vi.stubEnv(key, '');
    for (const email of ['', null, undefined, 'colaborador@example.test']) {
      expect(privateUiAccess(email)).toEqual({ isDev: false, financeiroSaidas: false, monitor: false });
    }
  });

  it('não concede acesso a quem compartilha apenas o domínio', () => {
    vi.stubEnv('UI_DEV_EMAILS', 'permitido@example.test');
    expect(emailNaLista('outra.pessoa@example.test', 'UI_DEV_EMAILS')).toBe(false);
    expect(emailNaLista('permitido@example.test.evil.invalid', 'UI_DEV_EMAILS')).toBe(false);
  });

  it('preserva listas independentes e entrega apenas os indicadores da própria identidade', () => {
    vi.stubEnv('UI_DEV_EMAILS', ' dev@example.test , ');
    vi.stubEnv('FIN_SAIDAS_EMAILS', 'financeiro@example.test');
    vi.stubEnv('MONITOR_OWNER_EMAIL', 'monitor@example.test');
    expect(privateUiAccess('DEV@EXAMPLE.TEST')).toEqual({ isDev: true, financeiroSaidas: false, monitor: false });
    expect(privateUiAccess('financeiro@example.test')).toEqual({ isDev: false, financeiroSaidas: true, monitor: false });
    expect(privateUiAccess('monitor@example.test')).toEqual({ isDev: false, financeiroSaidas: false, monitor: true });
    expect(JSON.stringify(privateUiAccess('dev@example.test'))).not.toContain('@');
  });
});
