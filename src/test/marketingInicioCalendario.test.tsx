import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';









const dados = {
  hoje: '2026-09-29',
  mes: '2026-09',
  mes_anterior: '2026-08',
  mes_seguinte: '2026-10',
  avisos: [],
  equipe: [],
  minhas_tarefas: { itens: [], total: 0, atrasadas: 0, sem_prazo: 0, sou_membro: true },
  solicitacoes: { serie: [{ mes: '2026-09', criadas: 3, resolvidas: 2 }], proximas: [] },
  semanas: [{
    idx: 0,
    eh_semana_atual: true,
    dias: ['27', '28', '29', '30'].map(d => ({ data: `2026-09-${d}`, no_mes: true, eh_hoje: d === '29' }))
      .concat(['01', '02', '03'].map(d => ({ data: `2026-10-${d}`, no_mes: false, eh_hoje: false }))),
  }],
  ciclo: {
    linhas: [{
      id: 'e1', nome: 'Série Parábolas', cor: '#16a34a', cor_excedente: false,
      celulas: [{ semana_idx: 0, fase_id: 'f1', numero_fase: 3, nome_fase: 'Brainstorming', mkt_pendentes: 2, mkt_total: 3 }],
    }],
    fora_da_janela: 0, sem_data: 0, eventos_sem_cor_propria: 0, ciclos_ativos: 1, cores_disponiveis: 6,
  },
};



const comCiclosConferidos = (extra: Record<string, unknown> = {}) => ({
  ...dados,
  ciclo: {
    ...dados.ciclo,
    rolando_ok: true,
    linhas: [
      { ...dados.ciclo.linhas[0], mkt_abertas: 4 },
      {
        id: 'e2', nome: 'Série Advento 2027', cor: '#2563eb', cor_excedente: false, mkt_abertas: 0,
        celulas: [{ semana_idx: 0, fase_id: 'f9', numero_fase: 1, nome_fase: 'Pré Briefing' }],
      },
    ],
    ...extra,
  },
});


const linhaDados = {
  semana_atual: 40,
  perfil: { lider: true },
  minha_semana: {
    semana: 40, tarefas: 15, atrasadas: 3, sem_estimativa: 2, demandas_h: 0,
    por_frente: { ins: 12, sis: 3 }, rotina: { total: 4, feitas: 1 },
    rotina_por_frente: { rot: { total: 3, feitas: 1 }, red: { total: 1, feitas: 0 } },
  },
  frentes: {
    rot: {
      tarefas: [{
        semana: 40, membro_id: 'm1',
        itens: [
          { dia_semana: 0, texto: 'Captações' },
          { dia_semana: 1, texto: 'Reunião (preliminar · refinar com a equipe)' },
        ],
      }],
    },
  },
};


const avisosLider = {
  disponivel: true,
  hoje: '2026-09-29',
  pode_editar: true,
  lider_conferido: true,
  vigentes: [{ id: 'a1', texto: 'Quinta tem reunião geral às 10h.', inicio: '2026-09-28', fim: '2026-10-02', estado: 'vigente' }],
  agendados: [{ id: 'a2', texto: 'Semana que vem: fotos da equipe.', inicio: '2026-10-05', fim: '2026-10-09', estado: 'agendado' }],
};
const avisosLiderado = { ...avisosLider, pode_editar: false, agendados: [] };

const get = vi.fn();
const getLinha = vi.fn();
const listarAvisos = vi.fn();
const criarAviso = vi.fn();
const removerAviso = vi.fn();
vi.mock('../api', () => ({
  marketing: {
    dashboard: { get: (...a: unknown[]) => get(...a), fase: vi.fn() },
    atualizarCard: vi.fn(),
    avisosInicio: {
      list: (...a: unknown[]) => listarAvisos(...a),
      criar: (...a: unknown[]) => criarAviso(...a),
      atualizar: vi.fn(),
      remover: (...a: unknown[]) => removerAviso(...a),
    },
  },
  marketingLinha: { get: (...a: unknown[]) => getLinha(...a) },
}));
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    isAdmin: false,
    modulePerms: { marketing: { leitura: 1, escrita: 1 } },
    profile: { name: 'Pablo Henrique Pontal' },
  }),
}));

import MarketingInicio from '../pages/marketing/MarketingInicio';
import MarketingCalendario from '../pages/marketing/MarketingCalendario';

const montar = (rota: string, ui: React.ReactNode) =>
  render(<MemoryRouter initialEntries={[rota]}>{ui}</MemoryRouter>);

beforeEach(() => {
  get.mockReset(); get.mockResolvedValue(dados);
  getLinha.mockReset(); getLinha.mockResolvedValue(linhaDados);
  listarAvisos.mockReset(); listarAvisos.mockResolvedValue(avisosLiderado);
  criarAviso.mockReset(); criarAviso.mockResolvedValue({ id: 'a3' });
  removerAviso.mockReset(); removerAviso.mockResolvedValue({ ok: true });
});

describe('Início do Marketing', () => {
  it('⚠️ 02/10: sem "Minhas próximas entregas" e sem "Solicitações para o Marketing" — e sem o calendário', async () => {
    montar('/marketing', <MarketingInicio />);
    expect(await screen.findByText('15')).toBeTruthy();
    expect(screen.queryByText('Minhas próximas entregas')).toBeNull();
    expect(screen.queryByText('Solicitações para o Marketing')).toBeNull();
    expect(screen.queryByText('Série Parábolas')).toBeNull();
    expect(get).toHaveBeenCalledWith({});
  });

  it('o menu marca o Início como a aba atual', async () => {
    montar('/marketing', <MarketingInicio />);
    await screen.findByText('Pablo Pontal');
    expect(screen.getByRole('button', { name: 'Início' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('button', { name: 'Calendário' }).getAttribute('aria-current')).toBeNull();
  });

  it('⚠️ o /dashboard falhou: os ciclos dizem que não carregaram (nunca "Carregando…" para sempre)', async () => {
    get.mockReset();
    get.mockRejectedValue(new Error('dashboard fora do ar'));
    montar('/marketing', <MarketingInicio />);
    expect(await screen.findByText('O ciclo criativo não carregou.')).toBeTruthy();
    expect(screen.getByText(/dashboard fora do ar/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeTruthy();
  });
});

describe('Início · a abertura no desenho do Pablo', () => {
  it('aviso, ciclos, rotinas, o número da semana e o nome', async () => {
    montar('/marketing', <MarketingInicio />);
    expect(await screen.findByText('15')).toBeTruthy();
    expect(screen.getByText('Aviso Importante!', { exact: false })).toBeTruthy();
    expect(screen.getByText('Pablo Pontal')).toBeTruthy();

    expect(screen.getByText('Série Parábolas - Brainstorming')).toBeTruthy();

    const dias = screen.getAllByText(/^(Segunda|Domingo) - /).map(el => el.textContent);
    expect(dias).toEqual(['Segunda - Reunião', 'Domingo - Captações']);

    expect(screen.getByText(/do calendário/)).toBeTruthy();
    expect(screen.getByText(/de redes/)).toBeTruthy();
    expect(getLinha).toHaveBeenCalledTimes(1);
  });

  it('⚠️ sem a linha das Demandas o número é "—" (nunca 0) e o aviso não inventa fila', async () => {
    getLinha.mockReset();
    getLinha.mockRejectedValue(new Error('linha fora do ar'));
    montar('/marketing', <MarketingInicio />);
    await waitFor(() => expect(screen.getByText('—')).toBeTruthy());
    expect(screen.queryByText('15')).toBeNull();
    expect(screen.getByText(/checar sua fila institucional, de redes, rotinas/)).toBeTruthy();
  });

  it('quem não é da equipe vê "—" em vez de zero', async () => {
    getLinha.mockReset();
    getLinha.mockResolvedValue({ ...linhaDados, minha_semana: null });
    montar('/marketing', <MarketingInicio />);
    await waitFor(() => expect(screen.getByText('—')).toBeTruthy());
  });

  it('o cartão leva para as Demandas', async () => {
    montar('/marketing', <MarketingInicio />);
    const cartao = await screen.findByRole('link', { name: 'Acesse aqui suas demandas' });
    expect(cartao.getAttribute('href')).toBe('/marketing/demandas');
  });
});

describe('Início · ciclos só com tarefa rolando (02/10)', () => {
  it('ciclo com fase na semana mas SEM tarefa aberta não entra (os de 2027 lançados com antecedência)', async () => {
    get.mockReset(); get.mockResolvedValue(comCiclosConferidos());
    montar('/marketing', <MarketingInicio />);
    expect(await screen.findByText('Série Parábolas - Brainstorming')).toBeTruthy();
    expect(screen.queryByText(/Advento 2027/)).toBeNull();
  });

  it('nenhum rolando: a frase diz "tarefa rolando", não "fase"', async () => {
    const semNada = comCiclosConferidos();
    semNada.ciclo.linhas = semNada.ciclo.linhas.map(l => ({ ...l, mkt_abertas: 0 }));
    get.mockReset(); get.mockResolvedValue(semNada);
    montar('/marketing', <MarketingInicio />);
    expect(await screen.findByText('Nenhum ciclo com tarefa rolando nesta semana.')).toBeTruthy();
  });

  it('⚠️ a conta das tarefas falhou: volta à régua da fase e AVISA (erro nunca esconde ciclo)', async () => {
    get.mockReset(); get.mockResolvedValue(comCiclosConferidos({ rolando_ok: false }));
    montar('/marketing', <MarketingInicio />);
    expect(await screen.findByText('Série Advento 2027 - Pré Briefing')).toBeTruthy();
    expect(screen.getByText('Série Parábolas - Brainstorming')).toBeTruthy();
    expect(screen.getByText(/Não deu para conferir as tarefas abertas/)).toBeTruthy();
  });
});

describe('Início · avisos com período do líder (02/10)', () => {
  it('o aviso no ar aparece para todo mundo; o liderado não vê o botão', async () => {
    montar('/marketing', <MarketingInicio />);
    expect(await screen.findByText('Quinta tem reunião geral às 10h.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Adicionar aviso/ })).toBeNull();

    expect(screen.queryByText(/fotos da equipe/)).toBeNull();
  });

  it('o líder vê "Adicionar aviso" e quantos estão no ar e agendados', async () => {
    listarAvisos.mockReset(); listarAvisos.mockResolvedValue(avisosLider);
    montar('/marketing', <MarketingInicio />);
    expect(await screen.findByRole('button', { name: /Adicionar aviso/ })).toBeTruthy();
    expect(screen.getByText('1 no ar · 1 agendado')).toBeTruthy();
  });

  it('⚠️ os avisos não carregaram: a abertura diz, com o motivo, e deixa tentar de novo', async () => {
    listarAvisos.mockReset();
    listarAvisos.mockRejectedValueOnce(new Error('avisos fora do ar')).mockResolvedValue(avisosLiderado);
    montar('/marketing', <MarketingInicio />);
    expect(await screen.findByText(/Os avisos do líder não carregaram \(avisos fora do ar\)/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('Quinta tem reunião geral às 10h.')).toBeTruthy();
    expect(screen.queryByText(/Os avisos do líder não carregaram/)).toBeNull();
  });

  it('publicar: as datas já vêm de hoje (do SERVIDOR) a +6 dias, e a lista recarrega', async () => {
    listarAvisos.mockReset(); listarAvisos.mockResolvedValue(avisosLider);
    montar('/marketing', <MarketingInicio />);
    fireEvent.click(await screen.findByRole('button', { name: /Adicionar aviso/ }));
    const dialogo = await screen.findByRole('dialog');
    expect((within(dialogo).getByLabelText('Aparece de') as HTMLInputElement).value).toBe('2026-09-29');
    expect((within(dialogo).getByLabelText('Até') as HTMLInputElement).value).toBe('2026-10-05');
    const publicar = within(dialogo).getByRole('button', { name: 'Publicar aviso' });
    expect((publicar as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(dialogo).getByLabelText('Novo aviso'), { target: { value: 'Sexta é dia de foto.' } });
    fireEvent.click(publicar);
    await waitFor(() => expect(criarAviso).toHaveBeenCalledWith({ texto: 'Sexta é dia de foto.', inicio: '2026-09-29', fim: '2026-10-05' }));
    await waitFor(() => expect(listarAvisos).toHaveBeenCalledTimes(2));
  });

  it('o erro do servidor aparece no diálogo, com o motivo dele', async () => {
    listarAvisos.mockReset(); listarAvisos.mockResolvedValue(avisosLider);
    criarAviso.mockReset(); criarAviso.mockRejectedValue(new Error('A data final vem antes da inicial.'));
    montar('/marketing', <MarketingInicio />);
    fireEvent.click(await screen.findByRole('button', { name: /Adicionar aviso/ }));
    const dialogo = await screen.findByRole('dialog');
    fireEvent.change(within(dialogo).getByLabelText('Novo aviso'), { target: { value: 'Teste' } });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Publicar aviso' }));
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent('A data final vem antes da inicial.');
  });

  it('tirar pede confirmação na própria tela antes de apagar', async () => {
    listarAvisos.mockReset(); listarAvisos.mockResolvedValue(avisosLider);
    montar('/marketing', <MarketingInicio />);
    fireEvent.click(await screen.findByRole('button', { name: /Adicionar aviso/ }));
    const dialogo = await screen.findByRole('dialog');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Tirar o aviso de 05/10/2026' }));
    expect(removerAviso).not.toHaveBeenCalled();
    expect(within(dialogo).getByText('Tirar do Início?')).toBeTruthy();
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Tirar' }));
    await waitFor(() => expect(removerAviso).toHaveBeenCalledWith('a2'));
  });

  it('sem a migration: o líder vê o motivo em vez de um formulário que falharia', async () => {
    listarAvisos.mockReset();
    listarAvisos.mockResolvedValue({
      disponivel: false, motivo: 'falta aplicar a migration 20261002150000', hoje: '2026-09-29',
      pode_editar: true, lider_conferido: true, vigentes: [], agendados: [],
    });
    montar('/marketing', <MarketingInicio />);
    expect(await screen.findByText(/Ainda indisponível: falta aplicar a migration dos avisos/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Adicionar aviso/ }));
    const dialogo = await screen.findByRole('dialog');
    expect(within(dialogo).getByText(/falta aplicar a migration 20261002150000/)).toBeTruthy();
    expect((within(dialogo).getByLabelText('Novo aviso') as HTMLTextAreaElement).disabled).toBe(true);
  });
});

describe('Calendário do Marketing', () => {
  it('desenha o mês e a faixa do ciclo na semana', async () => {
    montar('/marketing/calendario', <MarketingCalendario />);

    expect(await screen.findAllByText('Série Parábolas')).toHaveLength(2);
    expect(screen.getByText('Setembro 2026')).toBeTruthy();
    expect(screen.getByText(/Fase 3 · Brainstorming/)).toBeTruthy();
    expect(screen.getByText('2 a entregar')).toBeTruthy();
  });

  it('não mostra o bloco de entregas, e pede o mês de hoje ao servidor', async () => {
    montar('/marketing/calendario', <MarketingCalendario />);
    await screen.findAllByText('Série Parábolas');
    expect(screen.queryByText('Minhas próximas entregas')).toBeNull();

    expect(get).toHaveBeenCalledWith(undefined);
    expect(screen.getByRole('button', { name: 'Calendário' }).getAttribute('aria-current')).toBe('page');
  });

  it('⚠️ erro de carregamento aparece, nunca vira calendário vazio', async () => {
    get.mockReset();
    get.mockRejectedValue(new Error('falhou a leitura das fases'));
    montar('/marketing/calendario', <MarketingCalendario />);
    await waitFor(() => expect(screen.getByText(/falhou a leitura das fases/)).toBeTruthy());
  });

  it('⚠️ o Calendário NÃO filtra pelos ciclos rolando: o mês mostra todo ciclo com fase', async () => {
    get.mockReset(); get.mockResolvedValue(comCiclosConferidos());
    montar('/marketing/calendario', <MarketingCalendario />);
    expect((await screen.findAllByText('Série Advento 2027')).length).toBeGreaterThan(0);
  });
});
