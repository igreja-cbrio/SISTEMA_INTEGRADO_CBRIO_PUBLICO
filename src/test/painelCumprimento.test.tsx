import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';




const painelMock = vi.fn();
vi.mock('../api', () => ({ rotinas: { painel: (...a: unknown[]) => painelMock(...a) } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import PainelCumprimento from '../pages/rotinas/PainelCumprimento';

const resumo = (o: Record<string, unknown> = {}) => ({ previstas: 4, cumpridas: 2, naoCumpridas: 2, emAberto: 1, pct: 50, ...o });
const dados = () => ({
  periodo: '30d', de: '2026-09-09', ate: '2026-10-08', hoje: '2026-10-08',
  geral: resumo({ pct: 75, cumpridas: 3, naoCumpridas: 1 }),
  areas: [{
    area: 'kids', rotulo: 'Kids', ...resumo(),
    rotinas: [{ id: 'r1', nome: 'Estoque', area: 'kids', ...resumo(), itens: [
      { id: 'i1', titulo: 'Conferir estoque', responsavel_nome: 'Ana', ...resumo() },
    ] }],
  }],
  naoCumpridas: [{ data: '2026-10-02', item: 'Conferir estoque', responsavel_nome: 'Ana', rotina: 'Estoque', area: 'Kids' }],
  totalNaoCumpridas: 1,
});

beforeEach(() => { painelMock.mockReset(); painelMock.mockResolvedValue(dados()); });

describe('Painel de cumprimento', () => {
  it('mostra o geral, a área com % e a lista de não cumpridas', async () => {
    render(<PainelCumprimento />);
    expect(await screen.findByText('75%')).toBeTruthy();
    expect(screen.getByText(/▸ Kids/)).toBeTruthy();
    expect(screen.getByText('50%')).toBeTruthy();
    expect(screen.getByText('Não cumpridas (1)')).toBeTruthy();
    expect(screen.getByText('02/10')).toBeTruthy();
  });

  it('clicar na área abre a rotina e o item com o responsável', async () => {
    render(<PainelCumprimento />);
    const linha = (await screen.findByText(/▸ Kids/)).closest('tr') as HTMLElement;
    fireEvent.click(linha);
    expect(await screen.findByText('Estoque')).toBeTruthy();
    expect(screen.getAllByText(/Conferir estoque/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Ana/).length).toBeGreaterThan(1);
  });

  it('trocar o período pede o painel de novo', async () => {
    render(<PainelCumprimento />);
    await screen.findByText('75%');
    fireEvent.change(screen.getByLabelText('Período'), { target: { value: 'semana' } });
    await waitFor(() => expect(painelMock).toHaveBeenLastCalledWith('semana'));
  });

  it('sem rotinas: explica o que fazer', async () => {
    painelMock.mockResolvedValue({ ...dados(), areas: [], naoCumpridas: [], totalNaoCumpridas: 0, geral: resumo({ previstas: 0, cumpridas: 0, naoCumpridas: 0, emAberto: 0, pct: null }) });
    render(<PainelCumprimento />);
    expect(await screen.findByText(/Cadastre uma rotina/)).toBeTruthy();
  });
});
