import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';





const update = vi.fn();
const marcarRotina = vi.fn();
const sessao = vi.fn();
const registrar = vi.fn();
const remover = vi.fn();
vi.mock('../api', () => ({
  marketing: { checklist: { update: (...a: unknown[]) => update(...a) } },
  marketingLinha: {
    marcarRotina: (...a: unknown[]) => marcarRotina(...a),
    desmarcarRotina: vi.fn(),
    entregas: {
      sessao: (...a: unknown[]) => sessao(...a),
      registrar: (...a: unknown[]) => registrar(...a),
      remover: (...a: unknown[]) => remover(...a),
    },
  },
}));

import ListaSubtarefas from '../pages/marketing/linha/ListaSubtarefas';

const dados = { membros: [], frentes: {}, hoje: '2026-10-05' };
const entrega = (extra: Record<string, unknown> = {}) => ({
  id: 'i1', texto: 'Thumbs', grupo: 'Execução Estratégica', feito: false, pode_marcar: true,
  aceita_arquivo: true, exige_arquivo: true, arquivos: [], ...extra,
});
const tarefaCiclo = (itens: unknown[]) => ({ id: 'k1', frente: 'ins', itens, pode_criar_item: false });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  for (const f of [update, marcarRotina, sessao, registrar, remover]) f.mockReset();
  update.mockResolvedValue({});
  sessao.mockResolvedValue({ upload_url: 'https://sp.example/up', drive_id: 'D1', pasta: 'Eventos/X/Fase_06', nome_arquivo: 'AMI_Thumbs_capa.png' });
  registrar.mockResolvedValue({ arquivo: { id: 'a1' }, feito: true, falta_registro: false });
  remover.mockResolvedValue({ ok: true, reaberta: true });
  fetchMock = vi.fn(async () => ({ ok: true, status: 201, json: async () => ({ id: 'sp-1', webUrl: 'https://sp/capa.png' }) }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('entrega com arquivo na lista de subtarefas', () => {
  it('⚠️ entrega SEM arquivo: o checkbox não marca, e a tela diz por quê', () => {
    render(<ListaSubtarefas tarefa={tarefaCiclo([entrega()])} dados={dados} onChanged={vi.fn()} />);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(update).not.toHaveBeenCalled();
    expect(screen.getByText(/Esta entrega fica feita com o arquivo/)).toBeTruthy();
    expect(screen.getByText(/entrega com arquivo/)).toBeTruthy();
  });

  it('enviar: abre a sessão da subtarefa, manda ao SharePoint e registra o item que voltou de lá', async () => {
    const onChanged = vi.fn();
    render(<ListaSubtarefas tarefa={tarefaCiclo([entrega()])} dados={dados} onChanged={onChanged} />);
    const arquivo = new File(['oi'], 'capa.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Arquivo de: Thumbs'), { target: { files: [arquivo] } });
    await waitFor(() => expect(registrar).toHaveBeenCalled());
    expect(sessao).toHaveBeenCalledWith({ item_id: 'i1' }, arquivo);
    expect(fetchMock).toHaveBeenCalledWith('https://sp.example/up', expect.objectContaining({ method: 'PUT' }));
    expect(registrar).toHaveBeenCalledWith({ item_id: 'i1' }, { drive_id: 'D1', sharepoint_item_id: 'sp-1' });
    await waitFor(() => expect(onChanged).toHaveBeenCalled());

    expect(update).not.toHaveBeenCalled();
  });

  it('o erro do envio aparece com o motivo, e nada é registrado', async () => {
    fetchMock.mockImplementation(async () => ({ ok: false, status: 403, json: async () => ({}) }));
    render(<ListaSubtarefas tarefa={tarefaCiclo([entrega()])} dados={dados} onChanged={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Arquivo de: Thumbs'), { target: { files: [new File(['x'], 'a.png')] } });
    expect(await screen.findByRole('alert')).toHaveTextContent(/recusou o envio \(403\)/);
    expect(registrar).not.toHaveBeenCalled();
  });

  it('entrega com arquivo mostra o link; tirar pede confirmação antes', async () => {
    const item = entrega({ feito: true, arquivos: [{ id: 'a1', nome: 'capa.png', web_url: 'https://sp/capa.png', tamanho: 2048 }] });
    render(<ListaSubtarefas tarefa={tarefaCiclo([item])} dados={dados} onChanged={vi.fn()} />);
    expect(screen.getByRole('link', { name: 'capa.png' }).getAttribute('href')).toBe('https://sp/capa.png');
    fireEvent.click(screen.getByRole('button', { name: 'Tirar capa.png' }));
    expect(remover).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Tirar' }));
    await waitFor(() => expect(remover).toHaveBeenCalledWith('a1'));
  });

  it('entrega que exige registro: o arquivo sobe e o campo do registro abre', async () => {
    registrar.mockResolvedValue({ arquivo: { id: 'a1' }, feito: false, falta_registro: true });
    render(<ListaSubtarefas tarefa={tarefaCiclo([entrega({ exige_registro: true })])} dados={dados} onChanged={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Arquivo de: Thumbs'), { target: { files: [new File(['x'], 'ata.pdf')] } });
    expect(await screen.findByLabelText('Registro (obrigatório para concluir)')).toBeTruthy();
  });

  it('anexo (06/10 · Requisições): "Anexar arquivo" discreto, e o checkbox segue marcando sem pedir arquivo', async () => {
    const item = { id: 'i8', texto: 'Briefing', feito: false, pode_marcar: true, aceita_arquivo: true, exige_arquivo: false, arquivos: [] };
    registrar.mockResolvedValue({ arquivo: { id: 'a8' }, feito: false, falta_registro: false });
    const onChanged = vi.fn();
    render(<ListaSubtarefas tarefa={{ id: 'k8', frente: 'sis', itens: [item] }} dados={dados} onChanged={onChanged} />);
    expect(screen.getByRole('button', { name: /Anexar arquivo/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Enviar arquivo/ })).toBeNull();
    expect(screen.queryByText(/entrega com arquivo/)).toBeNull();
    fireEvent.change(screen.getByLabelText('Arquivo de: Briefing'), { target: { files: [new File(['x'], 'briefing.pdf')] } });
    await waitFor(() => expect(registrar).toHaveBeenCalledWith({ item_id: 'i8' }, { drive_id: 'D1', sharepoint_item_id: 'sp-1' }));
    fireEvent.click(screen.getByRole('checkbox'));
    expect(update).toHaveBeenCalledWith('i8', { feito: true });
  });

  it('subtarefa que não é entrega (Requisições) segue igual: sem botão, o checkbox marca', () => {
    const item = { id: 'i9', texto: 'Arte', feito: false, pode_marcar: true };
    render(<ListaSubtarefas tarefa={{ id: 'k9', frente: 'sis', itens: [item] }} dados={dados} onChanged={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /Enviar arquivo/ })).toBeNull();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(update).toHaveBeenCalledWith('i9', { feito: true });
  });

  it('rotina que pede arquivo: a entrega é da pessoa naquela semana', async () => {
    const item = { id: 'c1|2026-10-04', compromisso_id: 'c1', membro_id: 'm1', texto: 'Captações', dia_semana: 0, feito: false, pode_marcar: true, aceita_arquivo: true, exige_arquivo: true, arquivos: [] };
    render(<ListaSubtarefas tarefa={{ id: 'rot-m1-40', frente: 'rot', semana_inicio: '2026-10-04', itens: [item] }} dados={dados} onChanged={vi.fn()} />);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(marcarRotina).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Arquivo de: Captações'), { target: { files: [new File(['x'], 'fotos.zip')] } });
    await waitFor(() => expect(sessao).toHaveBeenCalled());
    expect(sessao.mock.calls[0][0]).toEqual({ compromisso_id: 'c1', semana_inicio: '2026-10-04', membro_id: 'm1' });
  });

  it('quem não pode marcar também não envia (e a visão emprestada é só leitura)', () => {
    render(<ListaSubtarefas tarefa={tarefaCiclo([entrega({ pode_marcar: false })])} dados={dados} onChanged={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /Enviar arquivo/ })).toBeNull();
  });
});
