import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { semComentariosJs } from './_semComentarios';
import {
  rotuloFaixa, janelaFaixa, alturaRelativa, faixaRotulada, textoHero, progressoCiclo, quandoDiaD,
  eixoDias, posicionarPontos, medidorPct, formatoValorKpi, textoMeta, plural, nomeKpi,
} from '../pages/marketing/painel/reguaPainel';





describe('régua de apresentação', () => {
  it('rótulo e janela de cada coluna do horizonte', () => {
    expect(rotuloFaixa({ chave: 'vencidas' })).toBe('Vencidas');
    expect(rotuloFaixa({ chave: 0, inicio: '2026-09-27' })).toBe('Esta semana');
    expect(rotuloFaixa({ chave: 1, inicio: '2026-10-04' })).toBe('04/10');
    expect(rotuloFaixa({ chave: 'depois', inicio: '2026-11-29' })).toBe('Depois');
    expect(janelaFaixa({ chave: 2, inicio: '2026-10-11', fim: '2026-10-17' })).toBe('11/10 a 17/10');
    expect(janelaFaixa({ chave: 'vencidas', fim: '2026-09-26' })).toBe('prazo até 26/09');
  });

  it('barra com valor nunca some; barra sem valor não aparece', () => {
    expect(alturaRelativa(1, 400)).toBe(3);
    expect(alturaRelativa(0, 40)).toBe(0);
    expect(alturaRelativa(36, 36)).toBe(100);
    expect(alturaRelativa(5, 0)).toBe(0);
  });

  it('só vencidas, esta semana e o pico levam o número escrito', () => {
    expect(faixaRotulada({ chave: 'vencidas', total: 11 }, 4)).toBe(true);
    expect(faixaRotulada({ chave: 0, total: 27 }, 4)).toBe(true);
    expect(faixaRotulada({ chave: 4, total: 36 }, 4)).toBe(true);
    expect(faixaRotulada({ chave: 1, total: 30 }, 4)).toBe(false);
    expect(faixaRotulada({ chave: 'vencidas', total: 0 }, 4)).toBe(false);
  });

  it('abertura: sem topo não existe "0 com atraso"', () => {
    expect(textoHero(null)).toBeNull();
    const nenhum = textoHero({ com_atraso: 0, pecas_vencidas: 0, demandas_abertas: 3, com_atraso_por_frente: {} });
    expect(nenhum).toMatchObject({ alerta: false, titulo: 'Nenhuma demanda com atraso' });
    const um = textoHero({ com_atraso: 1, pecas_vencidas: 1, demandas_abertas: 1, com_atraso_por_frente: { sis: 1 } });
    expect(um.titulo).toBe('demanda com atraso');
    expect(um.detalhe).toBe('1 peça vencida · de 1 demanda aberta');
    expect(um.frentes).toEqual([{ chave: 'sis', rotulo: 'Requisições', n: 1 }]);
  });

  it('ciclo: proporções limitadas a 0–100; sem tarefa não há barra', () => {
    expect(progressoCiclo({ total: 0 })).toBeNull();
    expect(progressoCiclo({ total: 27, prontas: 6, deviam: 9 })).toEqual({ total: 27, pct_prontas: 22, pct_devia: 33 });
    expect(quandoDiaD({ dia_d: '2026-10-04', dias_ate_dia_d: 4 })).toBe('Dia D 04/10 · em 4 dias');
    expect(quandoDiaD({ dia_d: '2026-09-30', dias_ate_dia_d: 0 })).toBe('Dia D hoje (30/09)');
    expect(quandoDiaD({ dia_d: null })).toBe('sem Dia D');
  });

  it('eixo da fila: múltiplo de 15, mínimo 30, sempre além do mais antigo', () => {
    expect(eixoDias(null)).toBe(45);
    expect(eixoDias(70)).toBe(75);
    expect(eixoDias(75)).toBe(90);
    expect(eixoDias(10)).toBe(45);
  });

  it('pontos quase no mesmo lugar da mesma linha sobem um nível; de linhas diferentes, não', () => {
    const r = posicionarPontos([
      { id: 'a', area: 'kids', dias: 70 },
      { id: 'b', area: 'kids', dias: 68 },
      { id: 'c', area: 'ami', dias: 69 },
      { id: 'd', area: 'kids', dias: 10 },
      { id: 'e', area: 'kids', dias: null },
    ], 75);
    const por = Object.fromEntries(r.map(p => [p.id, p.nivel]));
    expect(por).toEqual({ a: 0, b: 1, c: 0, d: 0 });
  });

  it('medidor sem total é null, nunca 0%', () => {
    expect(medidorPct(0, 0)).toBeNull();
    expect(medidorPct(32, 131)).toBe(24);
  });

  it('valor e meta dos indicadores', () => {
    expect(formatoValorKpi(null, '%')).toBe('sem medição');
    expect(formatoValorKpi(71.5, '%')).toBe('71,5%');
    expect(formatoValorKpi(0, 'cards')).toBe('0 cards');
    expect(textoMeta(7, 'dias', 'menor_melhor')).toBe('meta ≤ 7 dias');
    expect(textoMeta(85, '%', 'maior_melhor')).toBe('meta ≥ 85%');
    expect(textoMeta(null, '%', 'maior_melhor')).toBe('sem meta');
    expect(nomeKpi({ id: 'MKT-LEAD', nome: 'Lead time medio' })).toBe('Lead time do pedido à entrega');
    expect(nomeKpi({ id: 'X', nome: 'Outro' })).toBe('Outro');
    expect(plural(1, 'dia', 'dias')).toBe('1 dia');
  });
});


const painel = () => ({
  hoje: '2026-09-30',
  semana: { inicio: '2026-09-27', fim: '2026-10-03' },
  perfil: { lider: false },
  avisos: [],
  topo: {
    demandas_abertas: 54, com_atraso: 5, com_atraso_por_frente: { ins: 3, sis: 2 },
    pecas_vencidas: 11, pecas_nesta_semana: 27, sem_prazo: 7,
    pedidos_esperando: 7, pedido_mais_antigo_dias: 70, pedidos_no_diretor: 0,
  },
  horizonte: {
    semanas: 8, total: 49, sem_prazo: 1, pico: 1,
    faixas: [
      { chave: 'vencidas', inicio: null, fim: '2026-09-26', total: 11, por_culto: { cbrio: 11 }, por_frente: { ins: 11 } },
      { chave: 0, inicio: '2026-09-27', fim: '2026-10-03', total: 27, por_culto: { ami: 27 }, por_frente: { ins: 27 } },
      { chave: 1, inicio: '2026-10-04', fim: '2026-10-10', total: 10, por_culto: {}, por_frente: { int: 10 } },
      { chave: 'depois', inicio: '2026-10-11', fim: null, total: 0, por_culto: {}, por_frente: {} },
    ],
  },
  pedidos: {
    pontos: [{ id: 'p1', status: 'aguardando_alocacao', area: 'kids', desde: '2026-07-22', dias: 70, para: null, urgente: false, titulo: null }],
    areas: [{ area: 'kids', total: 1, esperando: 1, max_dias: 70 }],
    esperando: 1, no_diretor: 0, mediana_dias: 70, mais_antigo_dias: 70,
    sem_solicitacao_viva: { total: 2, itens: [] },
  },
  ciclos: {
    linhas: [{ event_id: 'e1', nome: 'Série: Pelos Olhos de Quem Vê', dia_d: '2026-11-29', dias_ate_dia_d: 60, total: 27, prontas: 6, deviam: 9, vencidas: 3, nesta_semana: 0, sem_prazo: 0, proximo_prazo: '2026-10-10' }],
    a_encerrar: [{ event_id: 'e9', nome: 'Série: O Mundo não vai acabar', dia_d: '2026-09-06', tarefas: 0 }],
  },
  prontidao: {
    subtarefas: { total: 131, com_dono: 32, com_horas: 0 },
    capacidade: { pessoas: 6, com_horas: 6, horas_semana: 196 },
    matriz: { total: 25, com_horas: 0 },
    rotina: { compromissos: 8, esperadas: 8, marcadas: 0 },
  },
  kpis: {
    marco: '2026-W40', marco_inicio: '2026-09-28', semana_atual: '2026-W40', semanas_fechadas: 0,
    semanas_calibracao: 6, calibrado: false, farol_desde: '2026-11-09',
    indicadores: [{ id: 'MKT-THROUGHPUT', nome: 'Throughput semanal', unidade: 'cards', meta: 5, sentido: 'maior_melhor', serie: [], atual: { periodo: '2026-W40', inicio: '2026-09-28', valor: 0, observacao: null, em_andamento: true }, ultima_fechada: null, farol: null }],
  },
});

const getPainel = vi.fn();
const getAprov = vi.fn();
vi.mock('../api', () => ({
  marketing: {
    painel: (...a: unknown[]) => getPainel(...a),
    analytics: { aprovacoesOrigem: (...a: unknown[]) => getAprov(...a) },
  },
}));

import MarketingAnalytics from '../pages/marketing/MarketingAnalytics';

const montar = () => render(<MemoryRouter initialEntries={['/marketing/dashboard']}><MarketingAnalytics /></MemoryRouter>);

beforeEach(() => {
  localStorage.clear();
  getPainel.mockReset(); getPainel.mockResolvedValue(painel());
  getAprov.mockReset(); getAprov.mockResolvedValue([{ diretor_id: 'd1', diretor_nome: 'Pablo Paulo', total: 9, tempo_medio_h: 32.8, rejeitadas: 0, gargalo: true }]);
});

describe('a tela do Dashboard', () => {
  it('abre com o atraso, o horizonte, a fila, os ciclos e os indicadores', async () => {
    montar();
    expect(await screen.findByText('demandas com atraso')).toBeTruthy();
    expect(screen.getByText('11 peças vencidas · de 54 demandas abertas')).toBeTruthy();

    expect(screen.getAllByRole('button', { name: /^Vencidas, prazo até 26\/09: 11 peças/ })).toHaveLength(2);
    expect(screen.getByText('Pelos Olhos de Quem Vê')).toBeTruthy();
    expect(screen.getByText('3 vencidas')).toBeTruthy();
    expect(screen.getByText('Encerrar em Eventos →')).toBeTruthy();
    expect(screen.getByText('Entregas por semana')).toBeTruthy();
    expect(await screen.findByText('32,8 h')).toBeTruthy();
  });

  it('⚠️ quem não é líder não vê título de pedido — nem se o servidor mandasse', async () => {
    const p = painel();
    p.pedidos.pontos[0].titulo = 'QR codes' as any;
    getPainel.mockResolvedValue(p);
    montar();
    await screen.findByText('Fila de pedidos');
    expect(screen.getByRole('button', { name: 'Kids: 70 dias na fila · esperando alocação' })).toBeTruthy();
    expect(screen.queryByText('QR codes')).toBeNull();
  });

  it('o líder vê o título do pedido', async () => {
    const p = painel();
    p.perfil.lider = true;
    p.pedidos.pontos[0].titulo = 'QR codes' as any;
    getPainel.mockResolvedValue(p);
    montar();
    await screen.findByText('Fila de pedidos');
    expect(screen.getByRole('button', { name: 'QR codes. Kids: 70 dias na fila · esperando alocação' })).toBeTruthy();
  });

  it('o modo Tabela troca os gráficos por tabelas e fica lembrado', async () => {
    montar();
    await screen.findByText('Horizonte de prazos');
    fireEvent.click(screen.getByRole('button', { name: 'Tabela' }));
    expect(await screen.findByText('Período')).toBeTruthy();
    expect(screen.getByText('a partir de 11/10')).toBeTruthy();
    expect(localStorage.getItem('cbrio.marketing.dashboard.modo')).toBe('tabela');
  });

  it('⚠️ bloco que falhou vira aviso e some; o resto da tela fica de pé', async () => {
    const p = painel();
    p.pedidos = null as any;
    p.topo.pedidos_esperando = null as any;
    p.avisos = ['A fila de pedidos não carregou: timeout'];
    getPainel.mockResolvedValue(p);
    montar();
    expect(await screen.findByText('A fila de pedidos não carregou: timeout')).toBeTruthy();
    expect(screen.queryByText('Fila de pedidos')).toBeNull();
    expect(screen.getByText('a fila de pedidos não carregou')).toBeTruthy();
    expect(screen.getByText('Horizonte de prazos')).toBeTruthy();
  });

  it('⚠️ erro no painel é dito, nunca vira tela de zeros', async () => {
    getPainel.mockRejectedValue(new Error('servidor fora'));
    montar();
    expect(await screen.findByText('servidor fora', { exact: false })).toBeTruthy();
    await waitFor(() => expect(screen.queryByText('Horizonte de prazos')).toBeNull());
  });
});

describe('o que saiu da tela', () => {
  const tela = semComentariosJs(readFileSync(join(__dirname, '..', 'pages', 'marketing', 'MarketingAnalytics.jsx'), 'utf8'));

  it('sem o gráfico de 4 unidades no mesmo eixo e sem a série antiga', () => {
    expect(tela).not.toContain('recharts');
    expect(tela).not.toContain('analytics.kpis');
    expect(tela).toContain('api.painel()');
  });
});
