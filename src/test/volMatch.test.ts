





import { describe, it, expect } from 'vitest';
import { blocoDoServico } from '../pages/ministerial/voluntariado/volMatch';

describe('blocoDoServico · Domingo Manhã ganha o 09:30 (corte 24/08)', () => {
  it('"Domingo 09:30" (o culto novo) → Domingo Manhã', () => {
    expect(blocoDoServico('Domingo 09:30')).toBe('Domingo Manhã');
  });
  it('a grade ATUAL segue intacta (08:30/10:00/11:30 → manhã)', () => {
    expect(blocoDoServico('Domingo 08:30')).toBe('Domingo Manhã');
    expect(blocoDoServico('Domingo 10:00')).toBe('Domingo Manhã');
    expect(blocoDoServico('Domingo 11:30')).toBe('Domingo Manhã');
    expect(blocoDoServico('Domingo - Manhã')).toBe('Domingo Manhã');
    expect(blocoDoServico('CBKIDS - Manhã')).toBe('Domingo Manhã');
  });
  it('MUTANTE: 09 no bloco da NOITE seria check-in da manhã contado à noite', () => {


    expect(blocoDoServico('Domingo 09:30')).not.toBe('Domingo Noite');
    expect(blocoDoServico('Domingo 19:00')).toBe('Domingo Noite');
    expect(blocoDoServico('Domingo 18:00')).toBe('Domingo Noite');
  });
  it('os demais blocos não mudam', () => {
    expect(blocoDoServico('Quarta com Deus')).toBe('Quarta');
    expect(blocoDoServico('AMI')).toBe('AMI');
    expect(blocoDoServico('Bridge')).toBe('Bridge');
  });
  it('serviço fora de qualquer bloco segue null (linha própria no relatório)', () => {
    expect(blocoDoServico('GC 12 HORAS')).toBeNull();
    expect(blocoDoServico('')).toBeNull();
    expect(blocoDoServico(null)).toBeNull();
  });
});
