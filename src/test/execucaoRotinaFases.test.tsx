import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';






const rotinaMock = vi.fn();
const iniciarMock = vi.fn();
const criarFaseMock = vi.fn();

vi.mock('../api', () => ({
  projects: {},
  cycles: {},
  planejamentoAnual: {
    execucao: {
      rotina: (...a: unknown[]) => rotinaMock(...a),
      iniciarFases: (...a: unknown[]) => iniciarMock(...a),
      criarFase: (...a: unknown[]) => criarFaseMock(...a),
    },
  },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import FasesKanban from '../pages/execucaoPlanejamento/FasesKanban';

const proposta = (o: Record<string, unknown> = {}) => ({
  id: 'p1', natureza: 'rotina', estado: 'aprovada', no_calendario: true,
  vinculo: { tipo: null, id: null }, pode_gerir: true, ...o,
});

beforeEach(() => { rotinaMock.mockReset(); iniciarMock.mockReset(); criarFaseMock.mockReset(); });

describe('FasesKanban · rotina com fases livres', () => {
  it('sem fases: não oferece "criar vínculo" e começa pelas fases sugeridas', async () => {
    rotinaMock.mockResolvedValue({ fases: [], tarefas: [] });
    iniciarMock.mockResolvedValue({ ok: true });
    render(<FasesKanban proposta={proposta()} />);
    const botao = await screen.findByText(/Começar com Preparação/);
    expect(screen.queryByText(/vinculado/)).toBeNull();
    fireEvent.click(botao);
    await waitFor(() => expect(iniciarMock).toHaveBeenCalledWith('p1'));
  });

  it('cria a primeira fase com nome livre', async () => {
    rotinaMock.mockResolvedValue({ fases: [], tarefas: [] });
    criarFaseMock.mockResolvedValue({ id: 'f1' });
    render(<FasesKanban proposta={proposta()} />);
    const campo = await screen.findByPlaceholderText(/nome da primeira fase/);
    fireEvent.change(campo, { target: { value: 'Trocar fornecedor' } });
    fireEvent.click(screen.getByText('Criar'));
    await waitFor(() => expect(criarFaseMock).toHaveBeenCalledWith('p1', 'Trocar fornecedor'));
  });

  it('com fases: mostra a tarefa com a fase; leitor não vê controles', async () => {
    rotinaMock.mockResolvedValue({
      fases: [{ id: 'f1', nome: 'Testar com a equipe', ordem: 1 }],
      tarefas: [{ id: 't1', titulo: 'Comprar amostras', status: 'pendente', fase_id: 'f1' }],
    });
    render(<FasesKanban proposta={proposta({ pode_gerir: false })} />);
    expect(await screen.findByText('Comprar amostras')).toBeTruthy();
    expect(screen.getAllByText('Testar com a equipe').length).toBeGreaterThan(0);
    expect(screen.queryByPlaceholderText('Nova fase')).toBeNull();
    expect(screen.queryByText('Tarefa')).toBeNull();
  });
});
