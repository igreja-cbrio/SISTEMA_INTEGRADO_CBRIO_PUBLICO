import { beforeEach, describe, expect, it, vi } from 'vitest';
const { verificar } = vi.hoisted(() => ({ verificar: vi.fn() }));
vi.mock('../api', () => ({ totemKids: { editSenha: { verificar } } }));
import { senhaTotemValida } from '../lib/totemSenha';
beforeEach(() => { verificar.mockReset(); });

describe('senha de operação do totem', () => {
  it('não consulta nem libera senha vazia', async () => {
    expect(await senhaTotemValida('   ')).toBe(false);
    expect(verificar).not.toHaveBeenCalled();
  });
  it('só libera após confirmação explícita do servidor', async () => {
    verificar.mockResolvedValue({ ok: true });
    expect(await senhaTotemValida(' senha-de-teste ')).toBe(true);
    expect(verificar).toHaveBeenCalledWith('senha-de-teste');
  });
  it.each([{}, { ok: false }, { naoDefinida: true }, { ok: 'true' }])('nega resposta não confirmada: %j', async (resposta) => {
    verificar.mockResolvedValue(resposta);
    expect(await senhaTotemValida('senha-de-teste')).toBe(false);
  });
  it('nega em falha de rede, sem fallback local fixo', async () => {
    verificar.mockRejectedValue(new Error('indisponível'));
    expect(await senhaTotemValida('senha-de-teste')).toBe(false);
  });
});
