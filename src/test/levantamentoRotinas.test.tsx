import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';






const declararMock = vi.fn().mockResolvedValue({ ok: true });
const abrirMock = vi.fn().mockResolvedValue({});
vi.mock('../api', () => ({
  rotinas: {
    declarar: (...a: unknown[]) => declararMock(...a),
    abrirLevantamento: (...a: unknown[]) => abrirMock(...a),
    encerrarLevantamento: vi.fn().mockResolvedValue({}),
  },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import Levantamento from '../pages/rotinas/Levantamento';

const area = (o: Record<string, unknown>) => ({ area: 'kids', rotulo: 'Kids', lider_nome: 'Ana', rotinas: 0, itens: 0, status: 'pendente', concluida_em: null, pode: true, ...o });
const aberto = (areas: unknown[], extra: Record<string, unknown> = {}) => ({
  aberto: { id: 'l1', nome: 'Levantamento de rotinas 2026', aberto_em: '2026-10-02T12:00:00Z' }, ultimo: null, pode_gerir: false, areas, ...extra,
});

beforeEach(() => { declararMock.mockClear(); abrirMock.mockClear(); });

describe('Levantamento de rotinas', () => {
  it('sem levantamento: quem gerencia vê "Abrir"; quem não gerencia só vê o aviso', async () => {
    const { unmount } = render(<Levantamento dados={{ aberto: null, ultimo: null, pode_gerir: true, areas: [] }} onMudou={vi.fn()} onIrParaRotinas={vi.fn()} />);
    fireEvent.click(screen.getByText('Abrir levantamento de rotinas'));
    await waitFor(() => expect(abrirMock).toHaveBeenCalled());
    unmount();
    render(<Levantamento dados={{ aberto: null, ultimo: null, pode_gerir: false, areas: [] }} onMudou={vi.fn()} onIrParaRotinas={vi.fn()} />);
    expect(screen.queryByText('Abrir levantamento de rotinas')).toBeNull();
    expect(screen.getByText(/Quem abre o levantamento/)).toBeTruthy();
  });

  it('aberto: mostra quem concluiu, quem está em andamento e quem está pendente', () => {
    render(<Levantamento dados={aberto([
      area({ area: 'ami', rotulo: 'AMI' }),
      area({ area: 'kids', rotulo: 'Kids', rotinas: 2, itens: 5, status: 'em_andamento' }),
      area({ area: 'compras', rotulo: 'Compras', rotinas: 1, itens: 2, status: 'concluida', concluida_em: '2026-10-05T12:00:00Z' }),
    ])} onMudou={vi.fn()} onIrParaRotinas={vi.fn()} />);
    expect(screen.getByText('Pendente')).toBeTruthy();
    expect(screen.getByText('Em andamento')).toBeTruthy();
    expect(screen.getByText('Concluída')).toBeTruthy();
    expect(screen.getByText(/1 de 3 áreas concluíram/)).toBeTruthy();
  });

  it('a área conclui e reabre a própria declaração; sem permissão não tem botão', async () => {
    const onMudou = vi.fn();
    render(<Levantamento dados={aberto([
      area({ area: 'kids', rotulo: 'Kids', rotinas: 1, status: 'em_andamento' }),
      area({ area: 'compras', rotulo: 'Compras', status: 'concluida', concluida_em: '2026-10-05T12:00:00Z', pode: true }),
      area({ area: 'ami', rotulo: 'AMI', pode: false }),
    ])} onMudou={onMudou} onIrParaRotinas={vi.fn()} />);
    expect(screen.getAllByText('Concluí a declaração')).toHaveLength(1);
    fireEvent.click(screen.getByText('Concluí a declaração'));
    await waitFor(() => expect(declararMock).toHaveBeenCalledWith('kids', true));
    fireEvent.click(screen.getByText('Reabrir'));
    await waitFor(() => expect(declararMock).toHaveBeenCalledWith('compras', false));
  });
});
