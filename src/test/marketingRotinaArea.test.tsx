import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { semComentariosJs } from './_semComentarios';






const api = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  membros: vi.fn(),
}));

vi.mock('../api', () => ({
  marketing: {
    membros: (...a: unknown[]) => api.membros(...a),
    admin: {
      recorrentes: {
        list: (...a: unknown[]) => api.list(...a),
        create: (...a: unknown[]) => api.create(...a),
        update: (...a: unknown[]) => api.update(...a),
        remove: (...a: unknown[]) => api.remove(...a),
      },
    },
  },
}));
vi.mock('../supabaseClient', () => ({ supabase: {} }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import CartaoTarefa from '../pages/marketing/linha/CartaoTarefa';
import { AbaRecorrentes } from '../pages/marketing/MarketingAdmin';

const membros = [{ id: 'm-leticia', nome: 'Letícia', profile: { name: 'Letícia Souza' } }];
const no = (tarefa: Record<string, unknown>) => ({ tarefa, x: 0, y: 0, h: 112, fut: false });

describe('cartão do quadro · a etiqueta de origem e a rotina por área', () => {
  it('Requisições externa: a etiqueta "Externa" na linha de baixo, com o pedido', () => {
    render(<CartaoTarefa no={no({ id: 'c1', frente: 'sis', origem_req: 'externa', titulo: 'Arte do batismo', pedido: { titulo: 'Batismo de outubro' }, semana: 40, aberta: true, itens: [] })} membros={membros} onAbrir={vi.fn()} />);
    expect(screen.getByText('Externa')).toBeTruthy();
    expect(screen.getByText(/Batismo de outubro/)).toBeTruthy();
  });

  it('Requisições interna: a etiqueta "Interna", com a descrição da demanda', () => {
    render(<CartaoTarefa no={no({ id: 'c2', frente: 'sis', origem_req: 'interna', titulo: 'Organizar o drive', descricao: 'Pastas do mês', semana: 40, aberta: true, itens: [] })} membros={membros} onAbrir={vi.fn()} />);
    expect(screen.getByText('Interna')).toBeTruthy();
    expect(screen.getByText(/Pastas do mês/)).toBeTruthy();
  });

  it('Calendário e rotina não ganham etiqueta de origem', () => {
    render(<CartaoTarefa no={no({ id: 'c3', frente: 'ins', titulo: 'KV', culto: 'ami', semana: 40, aberta: true, itens: [] })} membros={membros} onAbrir={vi.fn()} />);
    expect(screen.queryByText('Externa')).toBeNull();
    expect(screen.queryByText('Interna')).toBeNull();
  });

  it('a rotina de Redes diz a área e a pessoa no título', () => {
    render(<CartaoTarefa no={no({ id: 'red-m-leticia-40', frente: 'red', membro_id: 'm-leticia', semana: 40, aberta: true, itens: [{ id: 'i', feito: false }] })} membros={[{ id: 'm-leticia', nome: 'Letícia' }]} onAbrir={vi.fn()} />);
    expect(screen.getAllByText('Rotina de redes · Letícia').length).toBeGreaterThan(0);
    expect(screen.getByText(/1 compromisso na semana/)).toBeTruthy();
  });
});

const comp = (id: string, area: string | undefined, descricao: string, dia = 1) => {
  const r: Record<string, unknown> = { id, dia_semana: dia, hora_inicio: '09:00:00', duracao_h: 2, descricao, participantes_ids: [] };
  if (area !== undefined) r.area = area;
  return r;
};

describe('Configurar → Rotina · cada compromisso é de uma área', () => {
  beforeEach(() => {
    api.list.mockReset(); api.update.mockReset(); api.remove.mockReset(); api.membros.mockReset();
    api.membros.mockResolvedValue([]);
  });

  it('separa por área, cada uma com a sua contagem', async () => {
    api.list.mockResolvedValue([
      comp('a', 'institucional', 'Cobertura cultos domingo'),
      comp('b', 'redes', 'Atendimento redes sociais'),
      comp('c', 'institucional', 'Gravação de vídeos'),
    ]);
    render(<AbaRecorrentes />);
    await waitFor(() => expect(screen.getByText('Cobertura cultos domingo')).toBeTruthy());
    const titulos = screen.getAllByRole('heading', { level: 4 }).map(h => h.textContent);
    expect(titulos).toEqual(['Institucional (2)', 'Redes (1)']);
    expect(screen.getAllByRole('combobox', { name: 'Área do compromisso' })).toHaveLength(3);
  });

  it('vindo do quadrado de Redes, Redes aparece primeiro', async () => {
    api.list.mockResolvedValue([comp('a', 'institucional', 'Cobertura'), comp('b', 'redes', 'Atendimento')]);
    render(<AbaRecorrentes areaInicial="redes" />);
    await waitFor(() => expect(screen.getByText('Atendimento')).toBeTruthy());
    expect(screen.getAllByRole('heading', { level: 4 }).map(h => h.textContent)).toEqual(['Redes (1)', 'Institucional (1)']);
  });

  it('⚠️ sem a migration a área não vem: a tela diz, e não oferece o seletor', async () => {
    api.list.mockResolvedValue([comp('a', undefined, 'Cobertura'), comp('b', undefined, 'Atendimento redes sociais')]);
    render(<AbaRecorrentes />);
    await waitFor(() => expect(screen.getByText('Cobertura')).toBeTruthy());
    expect(screen.getByText(/falta aplicar a migration 20261001140000/)).toBeTruthy();
    expect(screen.queryByRole('combobox', { name: 'Área do compromisso' })).toBeNull();

    expect(screen.getAllByRole('heading', { level: 4 }).map(h => h.textContent)).toEqual(['Institucional (2)', 'Redes (0)']);
  });

  it('remover pede confirmação na própria linha (nada de diálogo nativo)', async () => {
    const confirmar = vi.spyOn(window, 'confirm');
    api.list.mockResolvedValue([comp('a', 'institucional', 'Cobertura')]);
    api.remove.mockResolvedValue({});
    render(<AbaRecorrentes />);
    await waitFor(() => expect(screen.getByText('Cobertura')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Remover este compromisso' }));
    expect(api.remove).not.toHaveBeenCalled();
    expect(screen.getByText('Remover?')).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Sim' })); });
    expect(api.remove).toHaveBeenCalledWith('a');
    expect(confirmar).not.toHaveBeenCalled();
    confirmar.mockRestore();
  });
});

describe('guardas estáticas · o Admin grava a área pela régua das Demandas', () => {
  const rota = semComentariosJs(readFileSync(join(__dirname, '..', '..', 'backend', 'routes', 'marketing.js'), 'utf8'));

  it('a lista de áreas válidas vem de utils/marketingLinha, não de uma cópia', () => {
    expect(rota).toContain("new Set(Object.keys(require('../utils/marketingLinha').AREAS_ROTINA))");
  });

  it('⚠️ sem a migration, Redes vira 409 — nunca cai calada em Institucionais', () => {
    expect(rota).toMatch(/if \(area !== 'institucional'\) return res\.status\(409\)/);
    expect(rota).toMatch(/if \(error && update\.area && colunaAreaAusente\(error\)\) \{\s*return res\.status\(409\)/);
  });
});
