import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';




function clicarAba(rotulo: RegExp) {
  const aba = screen.getByRole('tab', { name: rotulo });
  fireEvent.mouseDown(aba, { button: 0, ctrlKey: false });
  fireEvent.pointerDown(aba, { button: 0, ctrlKey: false, pointerType: 'mouse' });
  fireEvent.click(aba);
  return aba;
}













vi.mock('../api', () => ({
  censo: {
    aux: vi.fn(async () => ({
      tipos_pergunta: ['secao', 'texto_curto'], tipos_pesquisa: ['censo'],
      formatos: ['texto'], cuidado_tipos: ['oracao'],
      consentimento_default: 'aviso', nivel: 5, pode_ver_sensivel: false,
    })),
    pesquisas: vi.fn(async () => ([{
      pesquisa_id: 'p1', slug: 'censo-cbrio-2026', titulo: 'Censo CBRio 2026',
      tipo: 'censo', status: 'rascunho', total_perguntas: 106,
      iniciadas: 0, concluidas: 0, identificadas: 0, anonimas: 0,
      taxa_conclusao: 0, duracao_media_seg: null, ultima_resposta_em: null,
    }])),
    cuidadoResumo: vi.fn(async () => []),
    cuidado: vi.fn(async () => []),
    pendentes: vi.fn(async () => ({ pendentes: 0, com_erro: 0 })),
    relatorio: vi.fn(async () => ({})),
    potencialResumo: vi.fn(async () => ({ totais: {}, familias_distintas: 0, base: 0, esperado: 0, truncado: false })),
    potencial: vi.fn(async () => ({ totais: {}, familias_distintas: 0, base: 0, esperado: 0, truncado: false })),
    pesquisa: vi.fn(async () => ({})),
    cobertura: vi.fn(async () => ({
      pesquisa: { titulo: 'Censo CBRio 2026', status: 'aberta', total_perguntas: 108, ultima_resposta_em: null },
      iniciadas: 120, concluidas: 100, abandonadas: 20, taxa_conclusao: 83,
      duracao_media_seg: 540, identificadas: 90, anonimas: 10,
      membros_ativos: 1798, cobertura_pct: 5,
      por_canal: [{ canal: 'qr', iniciadas: 120, concluidas: 100, identificadas: 90 }],
      por_dia: [{ dia: '2026-08-09', iniciadas: 60, concluidas: 50 },
                { dia: '2026-08-10', iniciadas: 60, concluidas: 50 }],
      abandono: [{ pergunta_id: 'x', pergunta_texto: 'Pergunta cansativa', respostas: 40, pct_do_total: 40 }],
    })),
    perfilMapa: vi.fn(async () => ({
      bairros: [{ bairro: 'Barra da Tijuca', norm: 'barra da tijuca', total: 40, lat: -23, lng: -43 }],
      total: 100, pessoas_no_mapa: 40, pessoas_sem_bairro: 30,
      pessoas_sem_coordenada: 30, pessoas_sem_cadastro: 0, pessoas_fora_da_base: 0,
    })),

    perfilCruzamento: vi.fn(async () => ({
      dicionario: { acompanhamento_lideranca: ['Sim', 'Não'] },
      pessoas: [
        { id: 'r1', nome: 'Ana Souza', membro: true, bn: 'barra da tijuca',
          d: { faixa_etaria: '25-34', genero: 'feminino', estado_civil: 'casado', bairro: 'Barra da Tijuca', status_membro: 'membro_ativo' },
          a: { acompanhamento_lideranca: [0] },
          v: { seguir: true, conectar: true, investir: false, servir: true } },
        { id: 'r2', nome: 'Bruno Lima', membro: true, bn: null,
          d: { faixa_etaria: '35-44', genero: 'masculino', estado_civil: 'solteiro', bairro: '(não informado)', status_membro: 'visitante' },
          a: { acompanhamento_lideranca: [1] },
          v: { seguir: false, conectar: false, investir: false, servir: false } },
      ],
      sensiveis_fora: true, generosidade_visivel: false, valores_indisponiveis: [], valores_desde: '2025-10-01',
    })),
    perfil: vi.fn(async () => ({
      titulo: 'Censo CBRio 2026', respondentes: 100,
      graficos: [
        { tipo: 'secao', id: 'b1', texto: '1 — Identificação' },
        { tipo: 'opcao_unica', id: 'acompanhamento_lideranca', texto: 'Tem acompanhamento?',
          sensivel: false, base: 90, neutras: 10, total: 100, media: null, aberta: false,
          valores: [
            { valor: 'Sim', total: 40, pct: 44.4, neutra: false },
            { valor: 'Não', total: 30, pct: 33.3, neutra: false },
            { valor: 'Às vezes', total: 20, pct: 22.2, neutra: false },
            { valor: 'Não se aplica', total: 10, pct: 10, neutra: true },
          ] },
        { tipo: 'texto_longo', id: 'comentario', texto: 'Comentário livre',
          base: 30, neutras: 0, total: 30, media: null, aberta: true, valores: [] },
      ],
      demografia: {
        faixa_etaria: [{ valor: '25-34', total: 40 }, { valor: '35-44', total: 60 }],
        genero: [{ valor: 'feminino', total: 60 }, { valor: 'masculino', total: 40 }],
        estado_civil: [], bairro: [], status_membro: [],
      },
    })),
    ia: {
      obter: vi.fn(async () => ({
        leitura: null, respostas_na_base: 100, desatualizada: false,
        novas_desde: 100, pode_gerar: true, ia_configurada: true,
      })),
      gerar: vi.fn(),
    },
  },
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ getAccessLevel: () => 5 }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));





vi.mock('../components/membresia/MapaBairros', () => ({
  default: ({ bairros }: { bairros: unknown[] }) =>
    <div data-testid="mapa-bairros">mapa com {bairros.length}</div>,
}));

import Censo from '../pages/censo/Censo';

describe('página /censo', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('carrega sem estourar e mostra a pesquisa', async () => {
    render(<Censo />);
    expect(await screen.findByText('Censo CBRio 2026')).toBeTruthy();
  });

  it('CLICAR EM CADA ABA não derruba a página (o bug de 07/08)', async () => {


    const erros: unknown[] = [];
    const original = console.error;
    console.error = (...a: unknown[]) => { erros.push(a[0]); };
    try {
      render(<Censo />);
      await screen.findByText('Censo CBRio 2026');

      for (const rotulo of ['Potencial', 'Cobertura', 'Perfil', 'Relatório', 'Pesquisas']) {
        const aba = clicarAba(new RegExp(rotulo));

        await waitFor(() => expect(aba).toHaveAttribute('data-state', 'active'));
      }
    } finally { console.error = original; }

    const reactErrors = erros.filter((e) => String(e).match(/Minified React error|not valid as a React child/i));
    expect(reactErrors).toEqual([]);
  });

  it('Cobertura mostra o DENOMINADOR, não só a contagem', async () => {


    render(<Censo />);
    await screen.findByText('Censo CBRio 2026');
    clicarAba(/Cobertura/);


    expect((await screen.findAllByText(/1798 membros ativos/)).length).toBeGreaterThan(0);
    expect(screen.getByText('5%')).toBeTruthy();
  });

  it('Cobertura avisa quando a amostra ainda não representa a igreja', async () => {


    render(<Censo />);
    await screen.findByText('Censo CBRio 2026');
    clicarAba(/Cobertura/);
    expect(await screen.findByText(/ainda não representa a igreja/i)).toBeTruthy();
  });








  it('Perfil · clicar numa resposta filtra, reconta e mostra quem são', async () => {
    render(<Censo />);
    await screen.findByText('Censo CBRio 2026');
    clicarAba(/Perfil/);


    await screen.findByRole('button', { name: /Filtro e 5 valores/ });
    await screen.findByText('Tem acompanhamento?');
    await waitFor(() => expect(screen.getAllByRole('button')
      .some((b) => b.getAttribute('title') === 'Filtrar por esta resposta')).toBe(true));

    const sim = screen.getAllByRole('button').find((b) => b.getAttribute('title') === 'Filtrar por esta resposta'
      && b.textContent?.startsWith('Sim'));
    expect(sim).toBeTruthy();
    fireEvent.click(sim!);

    expect(await screen.findByText(/respostas · filtradas/)).toBeTruthy();

    expect(await screen.findByText('Ana Souza')).toBeTruthy();
    expect(screen.queryByText('Bruno Lima')).toBeNull();

    const card = screen.getByRole('heading', { name: 'Tem acompanhamento?' }).closest('.p-4') as HTMLElement;
    expect(within(card).getByText('1 · 100%')).toBeTruthy();

    expect(within(card).getAllByText('0 · 0%')).toHaveLength(3);
  });

  it('Perfil · nível 1 vê a aba agregada, sem filtro e sem nomes', async () => {
    const { censo } = await import('../api');
    vi.mocked(censo.aux).mockResolvedValueOnce({
      tipos_pergunta: ['secao'], tipos_pesquisa: ['censo'], formatos: ['texto'],
      cuidado_tipos: ['oracao'], consentimento_default: 'aviso', nivel: 1, pode_ver_sensivel: false,
    } as never);
    render(<Censo />);
    await screen.findByText('Censo CBRio 2026');
    clicarAba(/Perfil/);
    await screen.findByText('Tem acompanhamento?');
    expect(screen.queryByText(/Toque numa resposta para filtrar/)).toBeNull();
    expect(screen.queryByRole('button', { name: /Filtro e 5 valores/ })).toBeNull();
    expect(screen.queryByRole('button', { pressed: false })).toBeNull();
    expect(vi.mocked(censo.perfilCruzamento)).not.toHaveBeenCalled();
  });

  it('Perfil desenha na ordem recebida (não reordena) e separa a opção neutra', async () => {
    render(<Censo />);
    await screen.findByText('Censo CBRio 2026');
    clicarAba(/Perfil/);
    await screen.findByText('Tem acompanhamento?');

    const corpo = document.body.textContent || '';
    const pos = ['Sim', 'Não', 'Às vezes', 'Não se aplica'].map((v) => corpo.indexOf(v));
    expect(pos.every((p, i) => i === 0 || p > pos[i - 1])).toBe(true);


    expect(screen.getByText(/44.4%/)).toBeTruthy();
    expect(await screen.findByText(/ficam? fora\s+da base|fica fora/i)).toBeTruthy();
  });

  it('Perfil não desenha barra para texto livre — manda para a Leitura da IA', async () => {
    render(<Censo />);
    await screen.findByText('Censo CBRio 2026');
    clicarAba(/Perfil/);
    expect(await screen.findByText(/Barra não diz nada sobre texto aberto/i)).toBeTruthy();
  });


  it('Leitura da IA (dentro do Relatório) oferece gerar quando ainda não há síntese', async () => {
    render(<Censo />);
    await screen.findByText('Censo CBRio 2026');
    clicarAba(/Relatório/);
    expect(await screen.findByText(/ainda não foram lidas/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Gerar leitura/ })).toBeTruthy();
  });






  it('nível 1 vê só o agregado — as abas nominais não aparecem', async () => {
    const { censo } = await import('../api');
    vi.mocked(censo.aux).mockResolvedValueOnce({
      tipos_pergunta: ['secao', 'texto_curto'], tipos_pesquisa: ['censo'],
      formatos: ['texto'], cuidado_tipos: ['oracao'],
      consentimento_default: 'aviso', nivel: 1, pode_ver_sensivel: false,
    });
    render(<Censo />);
    await screen.findByText('Censo CBRio 2026');

    expect(screen.queryByRole('tab', { name: /Respostas/ })).toBeNull();
    expect(screen.queryByRole('tab', { name: /Cuidado/ })).toBeNull();

    expect(screen.getByRole('tab', { name: /Pesquisas/ })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Cobertura/ })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Perfil/ })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Relatório/ })).toBeTruthy();
  });

  it('Cuidado e Leitura da IA não são mais abas — moram no Potencial e no Relatório', async () => {
    render(<Censo />);
    await screen.findByText('Censo CBRio 2026');
    expect(screen.queryByRole('tab', { name: /Cuidado/ })).toBeNull();
    expect(screen.queryByRole('tab', { name: /Leitura da IA/ })).toBeNull();
    expect(screen.getByRole('tab', { name: /Potencial/ })).toBeTruthy();
  });

  it('quem não está na equipe de cuidado vê a explicação, não os nomes', async () => {
    render(<Censo />);
    await screen.findByText('Censo CBRio 2026');
    clicarAba(/Potencial/);
    expect(await screen.findByText('Pediram cuidado')).toBeTruthy();

    expect(await screen.findByText(/Nenhum pedido ainda|nomes ficam com a equipe/i)).toBeTruthy();
  });
});
