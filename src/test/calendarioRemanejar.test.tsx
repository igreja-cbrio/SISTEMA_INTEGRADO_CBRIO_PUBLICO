import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';







vi.mock('@/components/ui/date-picker', () => ({
  DatePicker: ({ value }: { value: string }) => <input aria-label="nova data" readOnly value={value} />,
}));

import CalendarioExecucao from '../pages/execucaoPlanejamento/CalendarioExecucao';

const encontrao = (extra: Record<string, unknown> = {}) => ({
  id: 'rotina_fixa:encontrao', natureza: 'rotina_fixa', categoria: 'rotina_staff', nome: 'Encontrão',
  descricao: 'Encontro da equipe.', horarios: 'Quarta', pode_remanejar: true, ajustes: [], remanejadas: {},
  calendario: { dias: ['2026-03-11'], mesSemDia: null }, ...extra,
});

const base = (over: Record<string, unknown> = {}) => ({
  propostas: [], areas: [], carregando: false, mes: '2026-03', onMes: vi.fn(), dia: '2026-03-11', onDia: vi.fn(),
  selecionada: 'rotina_fixa:encontrao', onSelecionar: vi.fn(), onAbrir: vi.fn(),
  onRemanejar: vi.fn().mockResolvedValue(true), onDesfazer: vi.fn(), liturgicos: [encontrao()], ...over,
});

describe('Calendário · remanejar item fixo', () => {
  it('quem pode remanejar cancela a ocorrência (data_nova null, data original)', async () => {
    const props = base();
    render(<CalendarioExecucao {...props} />);
    fireEvent.click(screen.getByText('Não acontece neste dia'));
    await waitFor(() => expect(props.onRemanejar).toHaveBeenCalledWith(
      { item_id: 'rotina_fixa:encontrao', data_original: '2026-03-11', data_nova: null, motivo: '' },
    ));
  });

  it('quem só lê não vê o painel de remanejar', () => {
    render(<CalendarioExecucao {...base({ liturgicos: [encontrao({ pode_remanejar: false })] })} />);
    expect(screen.getByText('Encontro da equipe.')).toBeTruthy();
    expect(screen.queryByText('Não acontece neste dia')).toBeNull();
  });

  it('item adiado mostra de onde veio e volta pra data da regra', async () => {
    const props = base({
      dia: '2026-03-18',
      liturgicos: [encontrao({
        calendario: { dias: ['2026-03-18'], mesSemDia: null },
        remanejadas: { '2026-03-18': '2026-03-11' },
        ajustes: [{ data_original: '2026-03-11', data_nova: '2026-03-18', motivo: 'feriado' }],
      })],
    });
    render(<CalendarioExecucao {...props} />);
    expect(screen.getByText(/adiado de 11\/03/)).toBeTruthy();
    fireEvent.click(screen.getByText('Voltar para 11/03'));
    expect(props.onDesfazer).toHaveBeenCalledWith('rotina_fixa:encontrao', '2026-03-11');
  });

  it('lista as datas remanejadas, inclusive a que não acontece', () => {
    const props = base({
      selecionada: null, dia: null,
      liturgicos: [encontrao({
        calendario: { dias: [], mesSemDia: null },
        ajustes: [{ data_original: '2026-03-11', data_nova: null, motivo: 'retiro da equipe' }],
      })],
    });
    render(<CalendarioExecucao {...props} />);
    expect(screen.getByText(/11\/03 não acontece/)).toBeTruthy();
    fireEvent.click(screen.getByText('Desfazer'));
    expect(props.onDesfazer).toHaveBeenCalledWith('rotina_fixa:encontrao', '2026-03-11');
  });
});
