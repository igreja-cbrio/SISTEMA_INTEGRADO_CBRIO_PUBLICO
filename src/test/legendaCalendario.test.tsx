import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import LegendaCalendario, { LEGENDA, categoriaDe, corDe } from '../pages/planejamentoAnual/legendaCalendario';



describe('legenda dos calendários', () => {
  it('mostra as 6 categorias com os nomes combinados', () => {
    render(<LegendaCalendario />);
    ['Rotina Staff', 'Rotina de Liturgia', 'Feriado', 'Evento especial', 'Geracional', 'Aniversários', 'Grupos']
      .forEach((nome) => expect(screen.getByText(nome)).toBeTruthy());
    expect(LEGENDA).toHaveLength(7);
  });

  it('natureza → categoria', () => {
    expect(categoriaDe({ natureza: 'rotina' })).toBe('rotina_staff');
    expect(categoriaDe({ natureza: 'liturgico' })).toBe('rotina_liturgia');
    expect(categoriaDe({ natureza: 'culto' })).toBe('rotina_liturgia');
    expect(categoriaDe({ natureza: 'evento' })).toBe('evento_especial');
    expect(categoriaDe({ natureza: 'projeto' })).toBe('evento_especial');
    expect(corDe({ natureza: 'rotina' })).not.toBe(corDe({ natureza: 'liturgico' }));
  });

  it('categoria explícita vence; sem ela, natureza e depois área (Kids/AMI = geracional, Grupos = grupos)', () => {
    expect(categoriaDe({ natureza: 'liturgico', categoria: 'geracional' })).toBe('geracional');
    expect(categoriaDe({ natureza: 'rotina_fixa', categoria: 'rotina_staff' })).toBe('rotina_staff');
    expect(categoriaDe({ natureza: 'feriado' })).toBe('feriado');
    expect(categoriaDe({ natureza: 'evento', area: 'kids' })).toBe('geracional');
    expect(categoriaDe({ natureza: 'evento', area: 'ami' })).toBe('geracional');
    expect(categoriaDe({ natureza: 'evento', area: 'grupos' })).toBe('grupos');
    expect(categoriaDe({ natureza: 'rotina', area: 'kids' })).toBe('rotina_staff');
    expect(categoriaDe({ natureza: 'projeto', area: 'marketing' })).toBe('evento_especial');
  });
});
