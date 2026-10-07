import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';





const updateMock = vi.fn().mockResolvedValue({});
vi.mock('../api', () => ({
  tarefas: {
    list: () => Promise.resolve([
      { id: 'p1', titulo: 'Conferir estoque do Kids', tipo: 'planejada', status: 'a_fazer', data: '2099-01-05', prioridade: 'media' },
      { id: 'n1', titulo: 'Ligar pro fornecedor', tipo: 'pessoal', status: 'a_fazer', data: '2099-01-05', prioridade: 'media' },
    ]),
    update: (...a: unknown[]) => updateMock(...a),
    reordenar: vi.fn(), remove: vi.fn(), create: vi.fn(),
  },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import MinhasTarefas from '../pages/MinhasTarefas';

const renderizar = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MinhasTarefas />
  </QueryClientProvider>,
);

describe('Minhas Tarefas · planejadas', () => {
  it('planejada tem selo e não tem editar/excluir; pode concluir', async () => {
    renderizar();
    const linhaP = (await screen.findByText('Conferir estoque do Kids')).closest('div.group') as HTMLElement;
    const linhaN = screen.getByText('Ligar pro fornecedor').closest('div.group') as HTMLElement;
    expect(linhaP.textContent).toContain('rotina');
    expect(linhaP.querySelector('[title="Editar"]')).toBeNull();
    expect(linhaP.querySelector('[title="Excluir"]')).toBeNull();
    expect(linhaN.querySelector('[title="Editar"]')).not.toBeNull();
    fireEvent.click(linhaP.querySelector('button[role="checkbox"]') as HTMLElement);
    await waitFor(() => expect(updateMock).toHaveBeenCalledWith('p1', { status: 'concluida' }));
  });

  it('filtro separa planejadas e não planejadas', async () => {
    renderizar();
    await screen.findByText('Conferir estoque do Kids');
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Não planejadas' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Não planejadas' }));
    await waitFor(() => expect(screen.queryByText('Conferir estoque do Kids')).toBeNull());
    expect(screen.getByText('Ligar pro fornecedor')).toBeTruthy();
  });
});
