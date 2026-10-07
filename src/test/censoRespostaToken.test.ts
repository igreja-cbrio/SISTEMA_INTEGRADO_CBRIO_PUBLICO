import { describe, it, expect, beforeAll } from 'vitest';

import {
  gerarTokenIdentidade,
  verificarTokenIdentidade,
  gerarSegredoRetomada,
  hashRetomada,
  retomadaConfere,
} from '../../backend/utils/censoRespostaToken.js';
import { gerarTokenCenso } from '../../backend/utils/censoToken.js';






const MEMBRO = 'a1b2c3d4-e5f6-4718-8a9b-0c1d2e3f4a5b';

beforeAll(() => { process.env.CENSO_TOKEN_SECRET = 'segredo-de-teste-nao-usar-em-producao'; });

describe('token de identidade', () => {
  it('vai e volta no mesmo uuid', () => {
    const t = gerarTokenIdentidade(MEMBRO);
    expect(t).toMatch(/^[0-9a-f]{32}\.[0-9a-f]{20}$/);
    expect(verificarTokenIdentidade(t)).toBe(MEMBRO);
  });

  it('recusa assinatura adulterada — trocar o uuid no devtools não funciona', () => {
    const t = gerarTokenIdentidade(MEMBRO)!;
    const [, assinatura] = t.split('.');
    const outro = 'ffffffffffffffffffffffffffffffff';
    expect(verificarTokenIdentidade(`${outro}.${assinatura}`)).toBeNull();
  });

  it('recusa lixo e formato errado', () => {
    for (const v of ['', 'abc', `${MEMBRO}`, 'x.y', null, undefined]) {
      expect(verificarTokenIdentidade(v as string)).toBeNull();
    }
  });

  it('NÃO aceita token do censo cadastral — namespaces são separados de propósito', () => {


    const doOutroFluxo = gerarTokenCenso(MEMBRO);
    expect(doOutroFluxo).toBeTruthy();
    expect(verificarTokenIdentidade(doOutroFluxo as string)).toBeNull();
  });

  it('fail-closed sem segredo configurado', () => {
    const antes = process.env.CENSO_TOKEN_SECRET;
    const antesCron = process.env.CRON_SECRET;
    delete process.env.CENSO_TOKEN_SECRET;
    delete process.env.CRON_SECRET;
    try {
      expect(gerarTokenIdentidade(MEMBRO)).toBeNull();
      expect(verificarTokenIdentidade('a'.repeat(32) + '.' + 'b'.repeat(20))).toBeNull();
    } finally {
      if (antes) process.env.CENSO_TOKEN_SECRET = antes;
      if (antesCron) process.env.CRON_SECRET = antesCron;
    }
  });
});

describe('segredo de retomada', () => {
  it('gera 128 bits e o hash confere', () => {
    const s = gerarSegredoRetomada();
    expect(s).toMatch(/^[0-9a-f]{32}$/);
    expect(retomadaConfere(s, hashRetomada(s))).toBe(true);
  });

  it('segredo errado não reabre o rascunho', () => {
    const guardado = hashRetomada(gerarSegredoRetomada());
    expect(retomadaConfere(gerarSegredoRetomada(), guardado)).toBe(false);
  });

  it('o banco guarda o HASH, nunca o segredo — vazar a tabela não reabre nada', () => {
    const s = gerarSegredoRetomada();
    const guardado = hashRetomada(s)!;
    expect(guardado).not.toContain(s);

    expect(retomadaConfere(guardado, guardado)).toBe(false);
  });

  it('recusa segredo malformado em vez de aceitar por acidente', () => {
    expect(hashRetomada('curto')).toBeNull();
    expect(retomadaConfere('curto', hashRetomada(gerarSegredoRetomada()))).toBe(false);
    expect(retomadaConfere(gerarSegredoRetomada(), null as unknown as string)).toBe(false);
  });
});
