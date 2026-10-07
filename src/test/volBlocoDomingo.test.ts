
















import { describe, it, expect } from 'vitest';
import { blocoDoServico } from '../pages/ministerial/voluntariado/volMatch';

describe('blocoDoServico · cultos de domingo (grade nova e antiga)', () => {
  it('reconhece os quatro horários da grade ANTIGA como manhã/noite', () => {
    expect(blocoDoServico('Domingo 08:30')).toBe('Domingo Manhã');
    expect(blocoDoServico('Domingo 10:00')).toBe('Domingo Manhã');
    expect(blocoDoServico('Domingo 11:30')).toBe('Domingo Manhã');
    expect(blocoDoServico('Domingo 19:00')).toBe('Domingo Noite');
  });

  it('reconhece o 09:30 da grade NOVA — o motivo deste arquivo existir', () => {


    expect(blocoDoServico('Domingo 09:30')).toBe('Domingo Manhã');
  });

  it('continua reconhecendo os serviços de TURNO do Planning Center', () => {

    expect(blocoDoServico('Domingo - Manhã')).toBe('Domingo Manhã');
    expect(blocoDoServico('CBKIDS - Manhã Domingo')).toBe('Domingo Manhã');
    expect(blocoDoServico('Domingo - Noite')).toBe('Domingo Noite');
    expect(blocoDoServico('CBKIDS - Noite')).toBe('Domingo Noite');
  });

  it('não confunde os outros cultos da semana', () => {
    expect(blocoDoServico('Quarta Com Deus')).toBe('Quarta');
    expect(blocoDoServico('Culto AMI')).toBe('AMI');
    expect(blocoDoServico('AMI')).toBe('AMI');
    expect(blocoDoServico('Bridge')).toBe('Bridge');
  });

  it('devolve null para serviço que NÃO é culto — e isso é o correto', () => {


    expect(blocoDoServico('GC 12 HORAS')).toBeNull();
    expect(blocoDoServico('')).toBeNull();
    expect(blocoDoServico(null)).toBeNull();
    expect(blocoDoServico(undefined)).toBeNull();
  });

  it('é insensível a caixa e a espaço nas pontas', () => {
    expect(blocoDoServico('  DOMINGO 09:30  ')).toBe('Domingo Manhã');
    expect(blocoDoServico('domingo 09:30')).toBe('Domingo Manhã');
  });

  it('exige o prefixo — não casa horário no meio do nome', () => {


    expect(blocoDoServico('Ensaio Domingo 09:30')).toBeNull();
  });
});

describe('a manhã de domingo inteira cai num turno só', () => {
  it('grade nova: 09:30 e 11:30 no MESMO bloco', () => {


    const novos = ['Domingo 09:30', 'Domingo 11:30'].map(blocoDoServico);
    expect(new Set(novos)).toEqual(new Set(['Domingo Manhã']));
  });

  it('grade antiga: os 3 da manhã também', () => {
    const antigos = ['Domingo 08:30', 'Domingo 10:00', 'Domingo 11:30'].map(blocoDoServico);
    expect(new Set(antigos)).toEqual(new Set(['Domingo Manhã']));
  });
});
