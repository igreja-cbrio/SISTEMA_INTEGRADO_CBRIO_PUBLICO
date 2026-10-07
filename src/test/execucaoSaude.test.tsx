import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';






const propostasMock = vi.fn();

vi.mock('../api', () => ({
  planejamentoAnual: {
    ciclos: { list: () => Promise.resolve([]) },
    areas: () => Promise.resolve([]),
    execucao: {
      propostas: (...a: unknown[]) => propostasMock(...a),
      liturgicos: () => Promise.resolve([]),
    },
  },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../components/layout/ModuleHeader', () => ({ default: () => null }));
vi.mock('../pages/execucaoPlanejamento/PropostaDetalhe', () => ({ default: () => <div>detalhe</div> }));

import ExecucaoPlanejamento from '../pages/execucaoPlanejamento/ExecucaoPlanejamento';

const prop = (id: string, nome: string, saude: Record<string, unknown>) => ({
  id, nome, natureza: 'evento', area: 'kids', lider_nome: 'Ana', data_inicio: '2027-05-10', precisao_inicio: 'dia',
  no_calendario: true, vinculo: { tipo: 'evento', id: `e-${id}` }, saude,
});

beforeEach(() => { propostasMock.mockReset(); window.history.replaceState(null, '', '/'); });

describe('Execução · farol de saúde', () => {
  it('mostra o farol em texto, o painel de atenção e filtra só o que precisa', async () => {
    propostasMock.mockResolvedValue([
      prop('a', 'Retiro dos jovens', { farol: 'vermelho', motivos: ['2 tarefa(s) bloqueada(s)'], avisos: [{ tipo: 'atraso', nivel: 'vermelho', texto: '3 tarefa(s) com prazo vencido' }] }),
      prop('b', 'Noite de louvor', { farol: 'amarelo', motivos: ['Ressalva pendente'], avisos: [] }),
      prop('c', 'Culto de Páscoa', { farol: 'verde', motivos: [], avisos: [] }),
    ]);
    render(<ExecucaoPlanejamento />);

    expect((await screen.findAllByText('Em risco')).length).toBeGreaterThan(0);
    expect(screen.getByText('Em dia')).toBeTruthy();
    expect(screen.getByText('3 tarefa(s) com prazo vencido')).toBeTruthy();
    expect(screen.getByText('Culto de Páscoa')).toBeTruthy();

    fireEvent.click(screen.getByLabelText(/Só o que precisa de atenção/));
    await waitFor(() => expect(screen.queryByText('Culto de Páscoa')).toBeNull());
    expect(screen.getAllByText('Retiro dos jovens').length).toBeGreaterThan(0);
    expect(screen.getByText('Noite de louvor')).toBeTruthy();
  });

  it('tudo em dia: sem painel de atenção', async () => {
    propostasMock.mockResolvedValue([prop('c', 'Culto de Páscoa', { farol: 'verde', motivos: [], avisos: [] })]);
    render(<ExecucaoPlanejamento />);
    expect(await screen.findByText('Culto de Páscoa')).toBeTruthy();
    expect(screen.queryByLabelText(/Só o que precisa de atenção/)).toBeNull();
  });
});
