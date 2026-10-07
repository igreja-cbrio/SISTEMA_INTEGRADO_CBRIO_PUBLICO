import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';





const api = vi.hoisted(() => ({
  solicitacao: vi.fn(),
  acaoSolicitacao: vi.fn(),
  checklistCreate: vi.fn(),
  checklistUpdate: vi.fn(),
}));

vi.mock('../api', () => ({
  marketingLinha: {
    solicitacao: api.solicitacao,
    acaoSolicitacao: api.acaoSolicitacao,
    marcarRotina: vi.fn(),
    desmarcarRotina: vi.fn(),
  },
  marketing: { checklist: { create: api.checklistCreate, update: api.checklistUpdate } },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import ModalSolicitacao from '../pages/marketing/linha/ModalSolicitacao';

const dados = { membros: [{ id: 'm1', nome: 'Letícia' }], hoje: '2026-10-01', frentes: {} };

function resposta(o: Record<string, unknown> = {}) {
  return {
    solicitacao: {
      id: 'sol-1', titulo: 'Arte do batismo', descricao: 'Preciso de um post para o batismo', status: 'aprovado',
      data_necessaria: '2026-10-10', created_at: '2026-09-20T12:00:00Z', concluido_em: null,
      solicitante: 'Ana Souza', area: 'Integração', eh_urgente: false, justificativa_urgencia: null,
      nps_nota: null, nps_comentario: null,
    },
    campanha: {
      id: 'camp-1', status: 'ativa', titulo: 'Arte', dor_descricao: null, publico_alvo: null,
      prazo_entrega: '2026-10-08', triada_em: '2026-09-21T12:00:00Z', sugerido_membro_id: 'm1',
    },
    tarefas: [{
      id: 'card-1', frente: 'sis', titulo: 'Post do batismo', estado: 'producao', atribuido_a: 'm1', prazo: '2026-10-05',
      itens: [{ id: 'i1', texto: 'Rascunho do post', feito: false, membro_id: 'm1', pode_marcar: true }],
      pode_criar_item: true,
    }],
    etapa: 'em_producao', etapa_rotulo: 'Em produção',
    acoes: [{ acao: 'entregar', descricao: 'Concluir a tarefa e avisar quem pediu que foi entregue' }],
    linha_do_tempo: [{ quando: '2026-09-20T12:00:00Z', rotulo: 'Pedido feito' }],
    subtarefas_abertas: 1,
    lider: true,
    ...o,
  };
}

function abrir(props: Record<string, unknown> = {}) {
  const onClose = vi.fn();
  const onChanged = vi.fn().mockResolvedValue(undefined);
  const onAlocar = vi.fn();
  const onEditar = vi.fn();
  render(
    <ModalSolicitacao solicitacaoId="sol-1" dados={dados} onClose={onClose} onChanged={onChanged}
      onAlocar={onAlocar} onEditar={onEditar} {...props} />,
  );
  return { onClose, onChanged, onAlocar, onEditar };
}

beforeEach(() => {
  api.solicitacao.mockReset();
  api.acaoSolicitacao.mockReset();
});

describe('ModalSolicitacao', () => {
  it('mostra quem pediu, a etapa, a tarefa com as subtarefas e só a ação que o servidor mandou', async () => {
    api.solicitacao.mockResolvedValue(resposta());
    abrir();
    expect(await screen.findByText('Arte do batismo')).toBeTruthy();

    expect(screen.getAllByText('Em produção').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Ana Souza · Integração')).toBeTruthy();
    expect(screen.getByText('Post do batismo')).toBeTruthy();
    expect(screen.getByText('Rascunho do post')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Adicionar uma tarefa no fim da lista' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Concluir e entregar' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Recusar' })).toBeNull();
    expect(api.solicitacao).toHaveBeenCalledWith('sol-1');
  });

  it('entregar pede confirmação, diz o efeito e relê o modal e o quadro depois', async () => {
    api.solicitacao.mockResolvedValue(resposta());
    api.acaoSolicitacao.mockResolvedValue({ ok: true, acao: 'entregar', afetadas: 1 });
    const { onChanged } = abrir();
    fireEvent.click(await screen.findByRole('button', { name: 'Concluir e entregar' }));
    expect(screen.getByText(/avisa Ana Souza que foi entregue/)).toBeTruthy();
    expect(screen.getByText(/1 subtarefa aberta fica como está/)).toBeTruthy();
    expect(api.acaoSolicitacao).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar · Concluir e entregar' }));
    await waitFor(() => expect(api.acaoSolicitacao).toHaveBeenCalledWith('sol-1', { acao: 'entregar' }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(api.solicitacao).toHaveBeenCalledTimes(2);
  });

  it('recusar só confirma com um motivo de verdade, e o motivo vai no corpo', async () => {
    api.solicitacao.mockResolvedValue(resposta({
      tarefas: [], etapa: 'aguardando_alocacao', etapa_rotulo: 'Esperando alocação',
      acoes: [{ acao: 'alocar', descricao: 'a' }, { acao: 'recusar', descricao: 'r' }],
    }));
    api.acaoSolicitacao.mockResolvedValue({ ok: true });
    abrir();
    expect(await screen.findByText('Ainda não virou tarefa da equipe.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Recusar' }));
    const confirmar = screen.getByRole('button', { name: 'Confirmar · Recusar' }) as HTMLButtonElement;
    expect(confirmar.disabled).toBe(true);
    const campo = screen.getByPlaceholderText('Motivo da recusa (quem pediu vai ler)');
    fireEvent.change(campo, { target: { value: 'curto' } });
    expect(confirmar.disabled).toBe(true);
    fireEvent.change(campo, { target: { value: '  Sem equipe nesta semana  ' } });
    expect(confirmar.disabled).toBe(false);
    fireEvent.click(confirmar);
    await waitFor(() => expect(api.acaoSolicitacao).toHaveBeenCalledWith('sol-1', { acao: 'recusar', motivo: 'Sem equipe nesta semana' }));
  });

  it('alocar abre o editor do pedido (nunca a rota de ação)', async () => {
    api.solicitacao.mockResolvedValue(resposta({
      tarefas: [], etapa: 'aguardando_alocacao', etapa_rotulo: 'Esperando alocação',
      acoes: [{ acao: 'alocar', descricao: 'a' }, { acao: 'recusar', descricao: 'r' }],
    }));
    const { onAlocar } = abrir();
    fireEvent.click(await screen.findByRole('button', { name: 'Alocar' }));
    expect(onAlocar).toHaveBeenCalledWith(expect.objectContaining({
      id: 'camp-1', campanha_id: 'camp-1', solicitacao_id: 'sol-1', titulo: 'Arte do batismo',
      solicitante: 'Ana Souza', data_necessaria: '2026-10-10', sugerido_membro_id: 'm1',
    }));
    expect(api.acaoSolicitacao).not.toHaveBeenCalled();
  });

  it('quem não é o líder vê a solicitação e marca a subtarefa, mas não tem ação nem editar', async () => {
    api.solicitacao.mockResolvedValue(resposta({ acoes: [], lider: false }));
    abrir();
    expect(await screen.findByText('Post do batismo')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Concluir e entregar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull();
    expect((screen.getByRole('checkbox') as HTMLInputElement).disabled).toBe(false);
  });

  it('"+ tarefa" cria no fim da lista, com o responsável da tarefa, e o campo fica aberto para a próxima', async () => {
    api.solicitacao.mockResolvedValue(resposta());
    api.checklistCreate.mockResolvedValue({ id: 'i2' });
    abrir();
    fireEvent.click(await screen.findByRole('button', { name: 'Adicionar uma tarefa no fim da lista' }));
    const campo = screen.getByRole('textbox', { name: 'Nova tarefa' });
    fireEvent.change(campo, { target: { value: '  Revisar o texto  ' } });
    fireEvent.keyDown(campo, { key: 'Enter' });
    await waitFor(() => expect(api.checklistCreate).toHaveBeenCalledWith('card-1', { texto: 'Revisar o texto', membro_id: 'm1' }));
    expect(screen.getByRole('textbox', { name: 'Nova tarefa' })).toBeTruthy();
  });

  it('sem permissão do servidor (pode_criar_item) o "+ tarefa" nem aparece', async () => {
    const r = resposta();
    r.tarefas[0].pode_criar_item = false;
    api.solicitacao.mockResolvedValue(r);
    abrir();
    expect(await screen.findByText('Post do batismo')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Adicionar uma tarefa no fim da lista' })).toBeNull();
  });

  it('Esc com o campo do "+ tarefa" aberto fecha só o campo, não o modal', async () => {
    api.solicitacao.mockResolvedValue(resposta());
    const { onClose } = abrir();
    fireEvent.click(await screen.findByRole('button', { name: 'Adicionar uma tarefa no fim da lista' }));
    const campo = screen.getByRole('textbox', { name: 'Nova tarefa' });
    fireEvent.keyDown(campo, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Nova tarefa' })).toBeNull());
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('Arte do batismo')).toBeTruthy();
  });

  it('erro ao carregar diz o motivo e oferece tentar de novo — nunca vira modal vazio', async () => {
    api.solicitacao.mockRejectedValue(new Error('boom'));
    abrir();
    expect(await screen.findByText(/Não foi possível carregar a solicitação: boom/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Tentar de novo/ })).toBeTruthy();
    expect(screen.queryByText('Ainda não virou tarefa da equipe.')).toBeNull();
  });

  it('409 (o estado mudou entre abrir e clicar) mostra o motivo e relê o modal', async () => {
    api.solicitacao.mockResolvedValue(resposta());
    api.acaoSolicitacao.mockRejectedValue(Object.assign(new Error('Esta ação não vale mais: a solicitação está em "Concluída". Recarregue.'), { status: 409 }));
    abrir();
    fireEvent.click(await screen.findByRole('button', { name: 'Concluir e entregar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar · Concluir e entregar' }));
    expect(await screen.findByText(/Esta ação não vale mais/)).toBeTruthy();
    await waitFor(() => expect(api.solicitacao).toHaveBeenCalledTimes(2));
  });
});
