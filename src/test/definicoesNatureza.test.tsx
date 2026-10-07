import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NATUREZAS, DefinicaoNatureza } from '../pages/planejamentoAnual/comum';


describe('definições das naturezas', () => {
  it('as três naturezas têm definição e características gerais', () => {
    expect(NATUREZAS.map((n) => n.valor)).toEqual(['evento', 'projeto', 'rotina']);
    NATUREZAS.forEach((n) => { expect(n.definicao).toBeTruthy(); expect(n.caracteristicas).toBeTruthy(); });
  });
  it('mostra uma (com valor) ou as três (sem valor)', () => {
    const { unmount } = render(<DefinicaoNatureza valor="rotina" />);
    expect(screen.getByText(/dinâmica de funcionamento da igreja/)).toBeTruthy();
    expect(screen.queryByText(/duração limitada no tempo/)).toBeNull();
    unmount();
    render(<DefinicaoNatureza />);
    expect(screen.getByText(/duração limitada no tempo/)).toBeTruthy();
    expect(screen.getByText(/senso de pertencimento/)).toBeTruthy();
  });
});
