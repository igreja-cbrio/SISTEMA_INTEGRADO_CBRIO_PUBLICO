






import { describe, it, expect } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const svc = require('../../backend/services/appIdentidade.js');

describe('mascararTelefone', () => {
  it('mostra só DDD e os 4 últimos dígitos', () => {
    expect(svc.mascararTelefone('(21) 90000-4388')).toBe('(21) *****-4388');
    expect(svc.mascararTelefone('21900000022')).toBe('(21) *****-0022');
  });

  it('NUNCA devolve o telefone completo (nenhum dígito do meio)', () => {
    const alvos = ['21900004388', '(21) 90000-4388', '5521900004388', '2133334444'];
    for (const t of alvos) {
      const m = svc.mascararTelefone(t) as string;
      const digitos = m.replace(/\D/g, '');

      expect(digitos.length).toBeLessThanOrEqual(6);
      expect(m).toContain('*');

      expect(m).not.toContain('9512');
    }
  });

  it('devolve null quando não é telefone', () => {
    expect(svc.mascararTelefone('')).toBeNull();
    expect(svc.mascararTelefone('123')).toBeNull();
    expect(svc.mascararTelefone(null)).toBeNull();
  });
});

describe('mascararNome', () => {
  it('mantém só o primeiro nome inteiro', () => {
    expect(svc.mascararNome('Mauricio Paulo Douradal de Amostral')).toBe('Mauricio P. D. de A.');
    expect(svc.mascararNome('Nadia Laboratorio')).toBe('Nadia L.');
  });

  it('não vaza sobrenome completo de ninguém', () => {
    const m = svc.mascararNome('Maria Vitória Laboratorio Modelo') as string;
    expect(m).not.toContain('Laboratorio');
    expect(m).not.toContain('Modelo');
    expect(m.startsWith('Maria ')).toBe(true);
  });

  it('partículas ficam legíveis (de/da/dos), não viram "d."', () => {
    expect(svc.mascararNome('Ana da Silva dos Santos')).toBe('Ana da S. dos S.');
  });

  it('tolera vazio', () => {
    expect(svc.mascararNome('')).toBeNull();
    expect(svc.mascararNome(null)).toBeNull();
  });
});

describe('mascararEmail', () => {
  it('mostra pontas + domínio, esconde o miolo', () => {
    expect(svc.mascararEmail('pessoa.teste@example.test')).toBe('pes***te@example.test');
    expect(svc.mascararEmail('ana@cbrio.org')).toBe('a***@cbrio.org');
  });

  it('nunca devolve o endereço completo', () => {
    const alvos = ['pessoa.ficticia@example.test', 'nadia@example.test', 'jose@example.test'];
    for (const e of alvos) {
      const m = svc.mascararEmail(e) as string;
      expect(m).not.toBe(e);
      expect(m).toContain('***');

      expect(m).not.toContain(e.split('@')[0]);
    }
  });

  it('tolera lixo', () => {
    expect(svc.mascararEmail('')).toBeNull();
    expect(svc.mascararEmail('sem-arroba')).toBeNull();
    expect(svc.mascararEmail(null)).toBeNull();
  });
});

describe('janela do código', () => {
  it('expira em poucos minutos (código de acesso não é link de 30 dias)', () => {
    expect(svc.CODIGO_TTL_MIN).toBeGreaterThan(0);
    expect(svc.CODIGO_TTL_MIN).toBeLessThanOrEqual(15);
  });
});
