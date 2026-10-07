import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';






















const raiz = resolve(__dirname, '..', '..');
const ler = (p: string) => readFileSync(resolve(raiz, p), 'utf8');

describe('reservarCodigos · o caminho da chamada tem que existir de verdade', () => {
  it('a API define reservarCodigos DENTRO de totemKids.checkin', () => {
    const api = ler('src/api.js');
    const totem = api.slice(api.indexOf('export const totemKids = {'));
    const checkin = totem.slice(totem.indexOf('\n  checkin: {'));
    const fimDoCheckin = checkin.indexOf('\n  },');
    expect(fimDoCheckin).toBeGreaterThan(0);
    expect(checkin.slice(0, fimDoCheckin)).toContain('reservarCodigos:');
  });

  it('⚠️ o totem chama pelo caminho COMPLETO (totemKids.checkin.reservarCodigos)', () => {
    const tela = ler('src/pages/ministerial/totemKids/TotemKidsCheckin.tsx');
    expect(tela).toContain('totemKids.checkin.reservarCodigos(');
  });

  it('⚠️⚠️ e NUNCA pelo caminho curto, que é undefined e lança antes do fetch', () => {
    const tela = ler('src/pages/ministerial/totemKids/TotemKidsCheckin.tsx');

    expect(tela).not.toMatch(/totemKids\.reservarCodigos\s*\(/);
  });
});
