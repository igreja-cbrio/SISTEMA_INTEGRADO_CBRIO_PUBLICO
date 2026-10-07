import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';




const get = vi.fn();
const salvar = vi.fn();
vi.mock('../api', () => ({
  marketingLinha: { planos: { get: (...a: unknown[]) => get(...a), salvar: (...a: unknown[]) => salvar(...a), refSessao: vi.fn() } },
}));
const avisoToast = vi.fn();
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: (...a: unknown[]) => avisoToast(...a) } }));

import PlanejamentoPostagens from '../pages/marketing/linha/PlanejamentoPostagens';

const LET = '11111111-1111-4111-8111-111111111111';
const ALLAN = '22222222-2222-4222-8222-222222222222';
const semana = (n: number, inicio: string, fim: string, primeiro: string, ultimo: string, pIni: string, pFim: string) =>
  ({ n, inicio, fim, primeiro_dia: primeiro, ultimo_dia: ultimo, producao: { inicio: pIni, fim: pFim } });
const resposta = (extra: Record<string, unknown> = {}) => ({
  mes: '2026-12', nome_mes: 'dezembro',
  semanas: [
    semana(1, '2026-11-29', '2026-12-05', '2026-12-01', '2026-12-05', '2026-11-22', '2026-11-28'),
    semana(2, '2026-12-06', '2026-12-12', '2026-12-06', '2026-12-12', '2026-11-29', '2026-12-05'),
    semana(3, '2026-12-13', '2026-12-19', '2026-12-13', '2026-12-19', '2026-12-06', '2026-12-12'),
    semana(4, '2026-12-20', '2026-12-26', '2026-12-20', '2026-12-26', '2026-12-13', '2026-12-19'),
    semana(5, '2026-12-27', '2027-01-02', '2026-12-27', '2026-12-31', '2026-12-20', '2026-12-26'),
  ],
  plano: null, responsavel_membro_id: LET, pode_editar: true,
  posts: [1, 2, 3, 4, 5].map(n => ({ id: null, semana: n, ordem: 1, dia_provavel: ['2026-12-01', '2026-12-06', '2026-12-13', '2026-12-20', '2026-12-27'][n - 1], nome: '', ref_url: '', descricao: '', responsavel_membro_id: LET, ref_arquivos: [] })),
  ...extra,
});
const dados = { membros: [{ id: LET, nome: 'Letícia Baldner' }, { id: ALLAN, nome: 'Allan Sertania' }] };

beforeEach(() => {
  get.mockReset(); get.mockResolvedValue(resposta());
  salvar.mockReset(); salvar.mockResolvedValue({ ok: true, postagens: 2 });
});

describe('planejamento de postagens · o editor', () => {
  it('um bloco por semana do mês, com a semana de postar e a de produzir', async () => {
    render(<PlanejamentoPostagens mes="2026-12" dados={dados} onClose={vi.fn()} />);
    expect(await screen.findByText('Planejamento de postagens · Dezembro')).toBeTruthy();
    for (const n of [1, 2, 3, 4, 5]) expect(screen.getByRole('region', { name: `Semana ${n}` })).toBeTruthy();
    expect(screen.getByText(/posta de 01\/12 a 05\/12 · produz de 22\/11 a 28\/11/)).toBeTruthy();
    expect(get).toHaveBeenCalledWith('2026-12');
  });

  it('preenche, acrescenta uma postagem e salva: tudo vai ao servidor e a tela fecha', async () => {
    const onClose = vi.fn();
    const onSalvo = vi.fn();
    render(<PlanejamentoPostagens mes="2026-12" dados={dados} onClose={onClose} onSalvo={onSalvo} />);
    const s1 = await screen.findByRole('region', { name: 'Semana 1' });
    fireEvent.change(within(s1).getByLabelText('Nome (tarefa, vídeo ou post)'), { target: { value: 'Reels de abertura' } });
    const s2 = screen.getByRole('region', { name: 'Semana 2' });
    fireEvent.click(within(s2).getByRole('button', { name: 'Adicionar postagem na semana 2' }));
    const nomes = within(s2).getAllByLabelText('Nome (tarefa, vídeo ou post)');
    expect(nomes).toHaveLength(2);
    fireEvent.change(nomes[1], { target: { value: 'Vídeo do pastor' } });
    fireEvent.change(within(s2).getAllByLabelText('Responsável')[1], { target: { value: ALLAN } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar e gerar as tarefas/ }));
    await waitFor(() => expect(salvar).toHaveBeenCalled());
    const [mes, corpo] = salvar.mock.calls[0];
    expect(mes).toBe('2026-12');
    expect(corpo.responsavel_membro_id).toBe(LET);
    const cheios = corpo.posts.filter((p: { nome: string }) => p.nome);
    expect(cheios).toEqual([
      expect.objectContaining({ semana: 1, nome: 'Reels de abertura', dia_provavel: '2026-12-01', responsavel_membro_id: LET }),
      expect.objectContaining({ semana: 2, nome: 'Vídeo do pastor', dia_provavel: '2026-12-06', responsavel_membro_id: ALLAN }),
    ]);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onSalvo).toHaveBeenCalled();
  });

  it('plano salvo, referência fora da página Arquivos: o aviso do servidor aparece (06/10)', async () => {
    avisoToast.mockReset();
    salvar.mockResolvedValue({ ok: true, postagens: 1, aviso: 'O planejamento foi salvo, mas as referências não entraram na página Arquivos.' });
    const onClose = vi.fn();
    render(<PlanejamentoPostagens mes="2026-12" dados={dados} onClose={onClose} />);
    const s1 = await screen.findByRole('region', { name: 'Semana 1' });
    fireEvent.change(within(s1).getByLabelText('Nome (tarefa, vídeo ou post)'), { target: { value: 'Reels' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar e gerar as tarefas/ }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(avisoToast).toHaveBeenCalledWith('O planejamento foi salvo, mas as referências não entraram na página Arquivos.');
  });

  it('o motivo do servidor aparece e a tela fica aberta', async () => {
    salvar.mockRejectedValue(new Error('Semana 1 · Reels: o dia provável tem de ser entre 01/12 e 05/12 (é a semana da postagem).'));
    const onClose = vi.fn();
    render(<PlanejamentoPostagens mes="2026-12" dados={dados} onClose={onClose} />);
    const s1 = await screen.findByRole('region', { name: 'Semana 1' });
    fireEvent.change(within(s1).getByLabelText('Nome (tarefa, vídeo ou post)'), { target: { value: 'Reels' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar e gerar as tarefas/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/entre 01\/12 e 05\/12/);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('quem não planeja vê, mas não edita nem salva', async () => {
    get.mockResolvedValue(resposta({ pode_editar: false }));
    render(<PlanejamentoPostagens mes="2026-12" dados={dados} onClose={vi.fn()} />);
    const s1 = await screen.findByRole('region', { name: 'Semana 1' });
    expect((within(s1).getByLabelText('Nome (tarefa, vídeo ou post)') as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: /Salvar e gerar/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Adicionar postagem/ })).toBeNull();
  });

  it('⚠️ falhou a carga: diz o motivo, nunca mostra um planejamento vazio', async () => {
    get.mockRejectedValue(new Error('Falta aplicar a migration 20261005180000_mkt_redes_rotinas_mensais.sql.'));
    render(<PlanejamentoPostagens mes="2026-12" dados={dados} onClose={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/Falta aplicar a migration/);
    expect(screen.queryByRole('region', { name: 'Semana 1' })).toBeNull();
  });
});
