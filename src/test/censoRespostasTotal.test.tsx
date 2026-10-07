import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';















const respostasMock = vi.fn();
const respostaMock = vi.fn();
const removerMock = vi.fn();

vi.mock('../api', () => ({
  censo: {
    respostas: (...a: unknown[]) => respostasMock(...a),
    resposta: (...a: unknown[]) => respostaMock(...a),
    removerResposta: (...a: unknown[]) => removerMock(...a),
  },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { toast } from 'sonner';
import AbaRespostas from '../components/censo/AbaRespostas';

const linha = (i: number, nome?: string) => ({
  id: `r${i}`,
  nome: nome || `Pessoa ${i}`,
  na_base: true,
  contato: null,
  canal: 'qr',
  identificado_por: 'cpf_nascimento',
  concluida_em: '2026-09-13T12:50:00.000Z',
  duracao_seg: 199,
});
const pagina = (de: number, quantas: number, total: number) => ({
  total, offset: de, limite: 50,
  itens: Array.from({ length: quantas }, (_, i) => linha(de + i)),
});

describe('AbaRespostas · o total é do banco, a página tem 50', () => {
  beforeEach(() => {
    respostasMock.mockReset(); respostaMock.mockReset(); removerMock.mockReset();
  });

  it('anuncia o total do banco e pede a primeira página de 50', async () => {
    respostasMock.mockResolvedValue(pagina(0, 50, 812));
    render(<AbaRespostas pesquisaId="p1" podeApagar={false} />);
    const resumo = await screen.findByText(/resposta\(s\) concluída\(s\)/);
    expect(resumo.textContent).toMatch(/812 resposta\(s\) concluída\(s\)/);
    expect(respostasMock).toHaveBeenCalledWith('p1', 50, 0);
    expect(await screen.findByText('1–50 de 812')).toBeTruthy();
  });

  it('navega e mostra em que pedaço a pessoa está', async () => {
    respostasMock
      .mockResolvedValueOnce(pagina(0, 50, 812))
      .mockResolvedValueOnce(pagina(50, 50, 812));
    render(<AbaRespostas pesquisaId="p1" podeApagar={false} />);

    const anterior = await screen.findByRole('button', { name: /Anterior/ });
    expect(anterior).toHaveProperty('disabled', true);

    fireEvent.click(screen.getByRole('button', { name: /Próxima/ }));
    expect(await screen.findByText('51–100 de 812')).toBeTruthy();
    expect(respostasMock).toHaveBeenLastCalledWith('p1', 50, 50);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Anterior/ })).toHaveProperty('disabled', false);
    });
  });

  it('a busca olha TODAS as respostas, não a página na tela', async () => {
    respostasMock
      .mockResolvedValueOnce(pagina(0, 50, 812))
      .mockResolvedValueOnce({
        total: 812, offset: 0, limite: 1000,
        itens: [...Array.from({ length: 50 }, (_, i) => linha(i)), linha(700, 'José da Silva')],
      });
    render(<AbaRespostas pesquisaId="p1" podeApagar={false} />);
    await screen.findByText('1–50 de 812');


    fireEvent.change(screen.getByPlaceholderText(/Buscar por nome/), { target: { value: 'jose' } });

    expect(await screen.findByText('José da Silva')).toBeTruthy();
    expect(respostasMock).toHaveBeenLastCalledWith('p1', 1000, 0);


    await waitFor(() => {
      expect(screen.getByText(/resposta\(s\) concluída\(s\)/).textContent).toMatch(/1 encontrada\(s\)/);
    });

    expect(screen.queryByRole('button', { name: /Próxima/ })).toBeNull();
  });








  it('acha quem está DEPOIS das mil primeiras (o buraco de 24/09)', async () => {
    respostasMock
      .mockResolvedValueOnce(pagina(0, 50, 1410))
      .mockResolvedValueOnce({ total: 1410, offset: 0, limite: 1000,
        itens: Array.from({ length: 20 }, (_, i) => linha(i)) })
      .mockResolvedValueOnce({ total: 1410, offset: 1000, limite: 1000,
        itens: [
          ...Array.from({ length: 5 }, (_, i) => linha(1000 + i)),
          linha(1401, 'Juliane Milani Tavares'),
          linha(1402, 'Fernanda Figueredo Sarruf Sudré'),
        ] });

    render(<AbaRespostas pesquisaId="p1" podeApagar={false} />);
    await screen.findByText('1–50 de 1410');
    fireEvent.change(screen.getByPlaceholderText(/Buscar por nome/), { target: { value: 'juliane' } });


    expect(await screen.findByText('Juliane Milani Tavares')).toBeTruthy();
    expect(respostasMock).toHaveBeenCalledWith('p1', 1000, 0);
    expect(respostasMock).toHaveBeenCalledWith('p1', 1000, 1000);
  });




  it('a régua de acento vale também para quem veio do 2º lote', async () => {
    respostasMock
      .mockResolvedValueOnce(pagina(0, 50, 1410))
      .mockResolvedValueOnce({ total: 1410, offset: 0, limite: 1000,
        itens: Array.from({ length: 20 }, (_, i) => linha(i)) })
      .mockResolvedValueOnce({ total: 1410, offset: 1000, limite: 1000,
        itens: [linha(1402, 'Fernanda Figueredo Sarruf Sudré')] });

    render(<AbaRespostas pesquisaId="p1" podeApagar={false} />);
    await screen.findByText('1–50 de 1410');
    fireEvent.change(screen.getByPlaceholderText(/Buscar por nome/), { target: { value: 'sudre' } });
    expect(await screen.findByText('Fernanda Figueredo Sarruf Sudré')).toBeTruthy();
  });



  it('avisa quando a busca não alcançou tudo', async () => {
    respostasMock.mockResolvedValueOnce(pagina(0, 50, 34000));
    for (let i = 0; i < 20; i += 1) {



      respostasMock.mockResolvedValueOnce({ total: 34000, offset: i * 1000, limite: 1000,
        itens: Array.from({ length: 5 }, (_, k) => linha(i * 1000 + k)) });
    }

    render(<AbaRespostas pesquisaId="p1" podeApagar={false} />);
    await screen.findByText('1–50 de 34000');
    fireEvent.change(screen.getByPlaceholderText(/Buscar por nome/), { target: { value: 'pessoa' } });

    await waitFor(() => { expect(screen.getByText(/A busca varreu as/)).toBeTruthy(); },
      { timeout: 6000 });
    expect(screen.getByText(/não entra/)).toBeTruthy();
  });












  it('apaga alguém que veio da BUSCA, não da página (o bug de 24/09)', async () => {
    const alvo = linha(1401, 'Kevyn Ronaldo Vereda de Oliveira');
    respostasMock
      .mockResolvedValueOnce(pagina(0, 50, 1410))
      .mockResolvedValueOnce({ total: 1410, offset: 0, limite: 1000,
        itens: Array.from({ length: 20 }, (_, i) => linha(i)) })
      .mockResolvedValueOnce({ total: 1410, offset: 1000, limite: 1000, itens: [alvo] });
    respostaMock.mockResolvedValue({ ...alvo, itens: [], itens_sensiveis_ocultos: 0 });
    removerMock.mockResolvedValue({ ok: true });

    render(<AbaRespostas pesquisaId="p1" podeApagar />);
    await screen.findByText('1–50 de 1410');

    fireEvent.change(screen.getByPlaceholderText(/Buscar por nome/), { target: { value: 'kevyn' } });
    expect(await screen.findByText('Kevyn Ronaldo Vereda de Oliveira')).toBeTruthy();


    fireEvent.click(screen.getAllByRole('button', { name: /Ver/ })[0]);
    const apagarNoModal = await screen.findByRole('button', { name: /Apagar esta resposta/ });
    fireEvent.click(apagarNoModal);


    expect(await screen.findByText(/Apagar a resposta de Kevyn Ronaldo Vereda de Oliveira\?/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Apagar e liberar/ }));
    await waitFor(() => { expect(removerMock).toHaveBeenCalledWith(alvo.id); });
  });



  it('o botão da linha também abre a confirmação', async () => {
    respostasMock.mockResolvedValue(pagina(0, 3, 3));
    render(<AbaRespostas pesquisaId="p1" podeApagar />);
    await screen.findByText('Pessoa 0');

    const lixeiras = screen.getAllByRole('button').filter((b) => !b.textContent?.trim());
    fireEvent.click(lixeiras[0]);
    expect(await screen.findByText(/Apagar a resposta de Pessoa 0\?/)).toBeTruthy();
  });


  it('falha do servidor não some com a linha', async () => {
    respostasMock.mockResolvedValue(pagina(0, 3, 3));
    removerMock.mockRejectedValue(new Error('Sem permissão'));
    render(<AbaRespostas pesquisaId="p1" podeApagar />);
    await screen.findByText('Pessoa 0');

    const lixeiras = screen.getAllByRole('button').filter((b) => !b.textContent?.trim());
    fireEvent.click(lixeiras[0]);
    fireEvent.click(await screen.findByRole('button', { name: /Apagar e liberar/ }));

    await waitFor(() => { expect(toast.error).toHaveBeenCalledWith('Sem permissão'); });
    expect(screen.getByText('Pessoa 0')).toBeTruthy();
  });

  it('quando tudo cabe numa página, não desenha navegação', async () => {
    respostasMock.mockResolvedValue(pagina(0, 3, 3));
    render(<AbaRespostas pesquisaId="p1" podeApagar={false} />);
    const resumo = await screen.findByText(/resposta\(s\) concluída\(s\)/);
    expect(resumo.textContent).toMatch(/3 resposta/);
    expect(screen.queryByRole('button', { name: /Próxima/ })).toBeNull();
  });
});
