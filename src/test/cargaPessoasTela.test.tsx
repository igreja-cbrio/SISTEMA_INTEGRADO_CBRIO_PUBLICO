import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import CargaPessoas from '../pages/marketing/linha/CargaPessoas';
import { semComentariosJs } from './_semComentarios';






const celula = (extra = {}) => ({
  capacidade: 30, folga: null, rotina_h: 0, demandas_h: 0, livre: 30,
  tarefas: 0, sem_estimativa: 0, atrasadas: 0, ...extra,
});

function dados(pessoas: unknown[], semanas = [40, 41]) {
  return {
    semana_atual: 40,
    semanas: [
      { n: 40, inicio: '2026-09-27', fim: '2026-10-03' },
      { n: 41, inicio: '2026-10-04', fim: '2026-10-10' },
    ],
    pessoas_carga: { semanas, pessoas },
  };
}

describe('CargaPessoas · a tela', () => {
  it('sem carga no payload (quem não é líder), diz que é visão do líder', () => {
    render(<CargaPessoas dados={{ semana_atual: 40, semanas: [], pessoas_carga: null }} onVerPessoa={() => {}} />);
    expect(screen.getByText(/só na visão do líder/)).toBeTruthy();
  });

  it('mostra horas usadas de horas disponíveis, a rotina, o que sobra e a semana atual', () => {
    render(<CargaPessoas onVerPessoa={() => {}} dados={dados([{
      id: 'm1', nome: 'Letícia', habilidade: 'designer', horas_semanais: 30,
      semanas: {
        40: celula({ rotina_h: 4, demandas_h: 6, livre: 20, tarefas: 1 }),
        41: celula(),
      },
    }])} />);
    expect(screen.getByText('Letícia')).toBeTruthy();
    expect(screen.getByText(/Semana 40 · atual/)).toBeTruthy();
    expect(screen.getByText('27/09 a 03/10')).toBeTruthy();
    expect(screen.getByText('10h')).toBeTruthy();
    expect(screen.getByText(/rotina 4h/)).toBeTruthy();
    expect(screen.getByText('livre 20h')).toBeTruthy();
  });

  it('acima da capacidade pinta de vermelho e diz quanto passou', () => {
    const { container } = render(<CargaPessoas onVerPessoa={() => {}} dados={dados([{
      id: 'm1', nome: 'Cauã', habilidade: null, horas_semanais: 20,
      semanas: { 40: celula({ capacidade: 20, demandas_h: 26, livre: -6, tarefas: 3 }), 41: celula() },
    }])} />);
    expect(screen.getByText('passou 6h')).toBeTruthy();
    expect(container.querySelector('.bg-red-500')).toBeTruthy();
  });

  it('folga de 0h com trabalho marcado também é sobrecarga', () => {
    const { container } = render(<CargaPessoas onVerPessoa={() => {}} dados={dados([{
      id: 'm1', nome: 'Allan', habilidade: null, horas_semanais: 30,
      semanas: {
        40: celula({ capacidade: 0, folga: { horas: 0, motivo: 'Férias' }, demandas_h: 2, livre: -2, tarefas: 1 }),
        41: celula(),
      },
    }])} />);
    expect(screen.getByText(/Folga: 0h · Férias/)).toBeTruthy();
    expect(container.querySelector('.bg-red-500')).toBeTruthy();
  });

  it('abaixo de 85% é verde; entre 85% e 100% é âmbar', () => {
    const { container } = render(<CargaPessoas onVerPessoa={() => {}} dados={dados([{
      id: 'm1', nome: 'Luciana', habilidade: null, horas_semanais: 20,
      semanas: {
        40: celula({ capacidade: 20, demandas_h: 10, livre: 10, tarefas: 1 }),
        41: celula({ capacidade: 20, demandas_h: 18, livre: 2, tarefas: 2 }),
      },
    }])} />);
    expect(container.querySelector('.bg-\\[\\#00B39D\\]')).toBeTruthy();
    expect(container.querySelector('.bg-amber-500')).toBeTruthy();
    expect(container.querySelector('.bg-red-500')).toBeNull();
  });

  it('subtarefa sem horas é declarada (não pesa na carga e não pode sumir)', () => {
    render(<CargaPessoas onVerPessoa={() => {}} dados={dados([{
      id: 'm1', nome: 'Letícia', habilidade: null, horas_semanais: 30,
      semanas: { 40: celula({ sem_estimativa: 2, tarefas: 1 }), 41: celula({ sem_estimativa: 1 }) },
    }])} />);
    expect(screen.getByText(/3 subtarefas ainda não têm horas/)).toBeTruthy();
    expect(screen.getByText('2 sem horas')).toBeTruthy();
  });

  it('clicar no nome abre o quadro como a pessoa vê', () => {
    const ver = vi.fn();
    render(<CargaPessoas onVerPessoa={ver} dados={dados([{
      id: 'm-caua', nome: 'Cauã', habilidade: null, horas_semanais: 30,
      semanas: { 40: celula(), 41: celula() },
    }])} />);
    fireEvent.click(screen.getByText('Cauã'));
    expect(ver).toHaveBeenCalledWith('m-caua');
  });
});

describe('o Planner virou a visão Por pessoa · guardas', () => {
  const raiz = join(__dirname, '..', '..');
  const ler = (rel: string) => semComentariosJs(readFileSync(join(raiz, rel), 'utf8'));

  it('a tela do Planner não existe mais', () => {
    expect(existsSync(join(raiz, 'src/pages/marketing/MarketingPlanner.jsx'))).toBe(false);
  });

  it('/marketing/planner redireciona para as Demandas em modo pessoa', () => {
    const app = ler('src/App.tsx');
    expect(app).toMatch(/path="\/marketing\/planner" element=\{<Navigate to="\/marketing\/demandas\?modo=pessoa" replace \/>\}/);
    expect(app).not.toContain('MarketingPlanner');
  });

  it('o menu do Marketing não oferece mais o Planner', () => {
    expect(ler('src/pages/marketing/MarketingNav.jsx')).not.toContain('/marketing/planner');
  });

  it('a visão por pessoa é do líder, na visão dele, e vem do endereço', () => {
    const tela = ler('src/pages/marketing/MarketingLinhaDoTempo.jsx');



    expect(tela).toContain("useState(() => (searchParams.get('modo') === 'pessoa' ? 'pessoa' : 'demanda'))");
    expect(tela).not.toMatch(/=== 'fluxo'/);
    expect(tela).toContain("const porPessoa = modo === 'pessoa' && lider && !vendoComo;");
    expect(tela).toMatch(/\{dados && porPessoa && \(\s*<CargaPessoas/);
    expect(tela).toContain('{dados && painel && !porPessoa && (');
  });

  it('o servidor só calcula a carga por pessoa para o líder e lê as horas da equipe', () => {
    const rota = ler('backend/routes/marketingLinha.js');
    expect(rota).toContain('pessoas_carga: pessoasCarga');
    const ini = rota.indexOf('let pessoasCarga = null;');
    const abre = rota.indexOf('if (ctx.lider) {', ini);
    const fim = rota.indexOf('const porFrente', abre);
    expect(ini).toBeGreaterThan(-1);
    expect(abre).toBeGreaterThan(ini);
    expect(rota.slice(abre, fim)).toContain('pessoasCarga = CP.cargaPorPessoa(');
    expect(rota.match(/pessoasCarga = CP\./g)).toHaveLength(1);
    expect(rota).toMatch(/from\('marketing_membros'\)\.select\('[^']*horas_semanais/);
  });
});
