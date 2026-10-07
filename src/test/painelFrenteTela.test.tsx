import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { PortalContainerContext } from '@/hooks/useFullscreenContainer';
import PainelFrente from '../pages/marketing/linha/PainelFrente';
import { semComentariosJs } from './_semComentarios';






function Tela({ comContainer }: { comContainer: boolean }) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const arvore = (
    <div data-testid="raiz" ref={setEl}>
      <Dialog open>
        <DialogContent>
          <DialogTitle>Tarefa</DialogTitle>
          <DialogDescription>detalhe</DialogDescription>
          <p>conteúdo do modal</p>
        </DialogContent>
      </Dialog>
    </div>
  );
  return comContainer ? <PortalContainerContext.Provider value={el}>{arvore}</PortalContainerContext.Provider> : arvore;
}

describe('portal dos modais · dentro da tela de cobertura', () => {
  it('com o container declarado, o modal é renderizado DENTRO dele', async () => {
    render(<Tela comContainer />);
    await act(async () => {});
    expect(screen.getByTestId('raiz').contains(screen.getByText('conteúdo do modal'))).toBe(true);
  });

  it('sem o container, o modal vai para o body (era o que ficava por baixo)', async () => {
    render(<Tela comContainer={false} />);
    await act(async () => {});
    expect(screen.getByTestId('raiz').contains(screen.getByText('conteúdo do modal'))).toBe(false);
  });
});

const membros = [
  { id: 'm-pedro', nome: 'Pablo Pontal' },
  { id: 'm-leticia', nome: 'Letícia' },
  { id: 'm-caua', nome: 'Cauã' },
];
const semanas = [{ n: 40, inicio: '2026-09-27', fim: '2026-10-03' }, { n: 41, inicio: '2026-10-04', fim: '2026-10-10' }];

function dadosCom(lider: boolean) {
  return {
    ano: 2026, semana_atual: 40, semanas, membros,
    perfil: { lider },
    frentes: {
      ins: { status: 'verde', series: [] },
      sis: {
        status: 'vermelho',
        tarefas: [
          { id: 'camp-1', frente: 'sis', tipo: 'pedido', pedido_status: 'aguardando_alocacao', titulo: 'Arte do bazar', semana: 41, aberta: true, atrasada: false, itens: [] },
          { id: 'card-3', frente: 'sis', origem_req: 'externa', solicitacao_id: 'sol-9', titulo: 'Vídeo da campanha', atribuido_a: 'm-caua', semana: 40, aberta: true, itens: [{ id: 'e', feito: false, membro_id: 'm-caua' }] },

          { id: 'i-1', frente: 'sis', origem_req: 'interna', titulo: 'Organizar o drive', atribuido_a: 'm-leticia', semana: 41, aberta: true, itens: [] },
          { id: 'i-2', frente: 'sis', origem_req: 'interna', titulo: 'Fotos do culto', atribuido_a: 'm-caua', semana: 41, aberta: true, itens: [] },
        ],
      },
      rot: { status: 'verde', tarefas: [], marcavel: true },
      red: { status: 'verde', tarefas: [], marcavel: true },
      prd: {
        status: 'verde',
        tarefas: [{ id: 'p-1', frente: 'prd', titulo: 'Reels do culto', atribuido_a: 'm-caua', semana: 41, aberta: true, itens: [] }],
      },
    },
  };
}

function montar(frente: string, opts: { lider?: boolean; somenteLeitura?: boolean } = {}) {
  const fns = {
    onFechar: vi.fn(), onTrocarSerie: vi.fn(), onAbrirTarefa: vi.fn(), onEditar: vi.fn(),
    onNovaTarefa: vi.fn(), onGerenciarRotina: vi.fn(), onTrocarFrente: vi.fn(),
  };
  render(
    <PainelFrente
      dados={dadosCom(opts.lider ?? true)}
      frente={frente}
      serieId={null}
      somenteLeitura={!!opts.somenteLeitura}
      {...fns}
    />,
  );
  return fns;
}

describe('painel da frente · o que o líder vê e faz', () => {
  it('Requisições: lista as demandas e oferece "Nova tarefa" (entra como interna)', () => {
    const f = montar('sis');
    expect(screen.getByText('Organizar o drive')).toBeTruthy();
    expect(screen.getByText('Fotos do culto')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Nova tarefa/ }));
    expect(f.onNovaTarefa).toHaveBeenCalled();
  });

  it('clicar numa demanda abre ela; o lápis edita sem abrir', () => {
    const f = montar('sis');
    fireEvent.click(screen.getByText('Organizar o drive'));
    expect(f.onAbrirTarefa).toHaveBeenCalledWith(expect.objectContaining({ id: 'i-1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Editar Fotos do culto' }));
    expect(f.onEditar).toHaveBeenCalledWith(expect.objectContaining({ id: 'i-2' }));
    expect(f.onAbrirTarefa).toHaveBeenCalledTimes(1);
  });

  it('Requisições: o pedido aparece à parte, dizendo que espera alocação', () => {
    const f = montar('sis');
    expect(screen.getByText(/Pedidos do formulário/)).toBeTruthy();
    expect(screen.getByText('Esperando você alocar')).toBeTruthy();
    fireEvent.click(screen.getByText('Arte do bazar'));
    expect(f.onAbrirTarefa).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'pedido' }));
  });

  it('filtro de pessoa só para o líder', () => {
    montar('sis');
    expect(screen.getByRole('combobox')).toBeTruthy();
  });

  it('cada linha de Requisições diz a origem: Externa ou Interna', () => {
    montar('sis');
    expect(screen.getAllByText('Externa')).toHaveLength(2);
    expect(screen.getAllByText('Interna')).toHaveLength(2);
  });

  it('o filtro de origem separa as duas, com a contagem de cada', () => {
    montar('sis');
    expect(screen.getByRole('button', { name: /^Externas 2/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Internas 2/ }));
    expect(screen.getByText('Organizar o drive')).toBeTruthy();
    expect(screen.queryByText('Arte do bazar')).toBeNull();
    expect(screen.queryByText('Vídeo da campanha')).toBeNull();
  });

  it('fora de Requisições não há filtro de origem', () => {
    montar('rot');
    expect(screen.queryByRole('button', { name: /^Externas/ })).toBeNull();
  });

  it('Institucionais: o líder gerencia os compromissos da área daqui', () => {
    const f = montar('rot');
    fireEvent.click(screen.getByRole('button', { name: /Compromissos da rotina/ }));
    expect(f.onGerenciarRotina).toHaveBeenCalledWith('rot');
  });

  it('Redes · Rotina: o mesmo caminho, levando a área de Redes', () => {
    const f = montar('red');
    expect(screen.getByRole('heading', { name: 'Rotina' })).toBeTruthy();
    expect(screen.getByLabelText('Demandas de Redes · Rotina')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Compromissos da rotina/ }));
    expect(f.onGerenciarRotina).toHaveBeenCalledWith('red');
    expect(screen.queryByRole('button', { name: /Nova tarefa/ })).toBeNull();
  });

  it('Redes · Produção: tarefa avulsa da área, com "Nova tarefa" e sem compromissos de rotina', () => {
    const f = montar('prd');
    expect(screen.getByRole('heading', { name: 'Produção' })).toBeTruthy();
    expect(screen.getByText('Reels do culto')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Compromissos da rotina/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Nova tarefa/ }));
    expect(f.onNovaTarefa).toHaveBeenCalled();
  });

  it('dentro de Redes o painel troca de bloco sem voltar ao quadro', () => {
    const f = montar('prd');
    const abas = screen.getAllByRole('tab').map(b => [b.textContent, b.getAttribute('aria-selected')]);
    expect(abas).toEqual([['Rotina', 'false'], ['Produção', 'true']]);
    fireEvent.click(screen.getByRole('tab', { name: 'Rotina' }));
    expect(f.onTrocarFrente).toHaveBeenCalledWith('red');

    fireEvent.click(screen.getByRole('tab', { name: 'Produção' }));
    expect(f.onTrocarFrente).toHaveBeenCalledTimes(1);
  });

  it('Calendário: Rotina e Ciclos criativos são os dois blocos; Requisições não tem blocos', () => {
    montar('rot');
    expect(screen.getAllByRole('tab').map(b => b.textContent)).toEqual(['Rotina', 'Ciclos criativos']);
  });

  it('Requisições segue igual: sem troca de bloco', () => {
    montar('sis');
    expect(screen.queryByRole('tablist')).toBeNull();
  });
});

describe('painel da frente · liderado e "Visão"', () => {
  it('o liderado vê as demandas, sem ações de líder nem filtro de pessoa', () => {
    const f = montar('sis', { lider: false });
    expect(screen.getByText('Organizar o drive')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Nova tarefa/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Editar/ })).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByText(/Toque numa demanda para marcar as subtarefas/)).toBeTruthy();
    fireEvent.click(screen.getByText('Organizar o drive'));
    expect(f.onAbrirTarefa).toHaveBeenCalled();
  });

  it('em "Visão" (somente leitura) nada se edita, mesmo sendo líder', () => {
    montar('sis', { somenteLeitura: true });
    expect(screen.queryByRole('button', { name: /Nova tarefa/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Editar/ })).toBeNull();
    expect(screen.getByText(/só leitura/)).toBeTruthy();
  });
});

describe('guardas estáticas · a tela usa o container e os cliques abrem o painel', () => {
  const raiz = join(__dirname, '..', '..');
  const ler = (rel: string) => semComentariosJs(readFileSync(join(raiz, rel), 'utf8'));
  const tela = ler('src/pages/marketing/MarketingLinhaDoTempo.jsx');
  const quadro = ler('src/pages/marketing/linha/QuadroFrentes.jsx');
  const hook = ler('src/hooks/useFullscreenContainer.ts');

  it('o hook lê o container declarado (e o fullscreen continua vencendo)', () => {
    expect(hook).toMatch(/useContext\(PortalContainerContext\)/);
    expect(hook).toMatch(/return container \?\? declarado \?\? undefined/);
  });

  it('as Demandas declaram o próprio elemento como container dos portais', () => {
    expect(tela).toMatch(/<PortalContainerContext\.Provider value=\{raizEl\}>/);


    expect(tela).toMatch(/<div ref=\{setRaizEl\} className=\{?[`"][^`"]*fixed inset-0 z-\[900\]/);
  });

  it('quadrado, bloco fixo e série abrem o painel', () => {
    expect(tela).toMatch(/onToggle=\{clicarQuadro\}/);
    expect(tela).toMatch(/onAbrir=\{abrirSerie\}/);
    expect(tela).toMatch(/onAbrir=\{abrirSub\}/);
    expect(quadro).toMatch(/onClick=\{\(\) => onToggle\(q\.key\)\}/);
    expect(quadro).toMatch(/onClick=\{\(\) => onAbrir\?\.\(idDaSerie\(s\)\)\}/);
    expect(quadro).toMatch(/onClick=\{\(\) => onAbrir\?\.\(grupo\.sub\)\}/);
  });
});
