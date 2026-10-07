import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { semComentariosJs } from './_semComentarios';





const raiz = join(__dirname, '..', '..');
const ler = (rel: string) => semComentariosJs(readFileSync(join(raiz, rel), 'utf8'));

describe('rotas · o Kanban redireciona para as Demandas', () => {
  const app = ler('src/App.tsx');




  it('/marketing/kanban e os endereços antigos levam às Demandas', () => {
    expect(app).toMatch(/path="\/marketing\/kanban" element=\{<Navigate to="\/marketing\/demandas" replace \/>\}/);
    for (const antigo of ['fila', 'ciclo-criativo', 'triagem']) {
      expect(app).toMatch(new RegExp(`path="/marketing/${antigo}" element=\\{<Navigate to="/marketing/demandas" replace />\\}`));
    }
    expect(app).not.toContain('MarketingKanban');
  });

  it('a aba saiu do menu do módulo e o arquivo da tela não existe mais', () => {
    expect(ler('src/pages/marketing/MarketingNav.jsx')).not.toContain("'/marketing/kanban'");
    expect(existsSync(join(raiz, 'src/pages/marketing/MarketingKanban.jsx'))).toBe(false);
  });

  it('o arrasto compartilhado continua (a Execução do Planejamento usa)', () => {
    expect(existsSync(join(raiz, 'src/pages/marketing/useArrastoKanban.js'))).toBe(true);
  });
});

describe('entregue_em · todo caminho de conclusão grava a primeira entrega', () => {
  const avisos = ler('backend/services/marketingAvisos.js');
  const rotaCards = ler('backend/routes/marketing.js');

  it('carimba só onde está vazio e só em card concluído', () => {
    const corpo = avisos.slice(avisos.indexOf('async function carimbarEntrega'), avisos.indexOf('async function avisarSeChecklistConcluiu'));
    expect(corpo).toContain(".is('entregue_em', null)");
    expect(corpo).toContain(".eq('estado', 'concluido')");
  });

  it('o checklist completo (caminho das Demandas) e o PATCH do card chamam o carimbo', () => {
    const checklist = avisos.slice(avisos.indexOf('async function avisarSeChecklistConcluiu'));
    expect(checklist).toMatch(/await carimbarEntrega\(card\.id\)/);
    expect(rotaCards).toMatch(/await carimbarEntrega\(data\.id\)/);
  });
});

describe('alocar · pedido triado que ficou sem tarefa tem caminho de volta', () => {
  const linha = ler('backend/routes/marketingLinha.js');
  const tela = ler('src/pages/marketing/MarketingLinhaDoTempo.jsx');

  it('o servidor aceita campanha ativa SEM tarefa viva e só devolve à triagem o que tirou de lá', () => {
    expect(linha).toContain(".eq('status', 'ativa')");
    expect(linha).toMatch(/if \(!count\) camp = ativa;/);
    expect(linha).toMatch(/if \(saiuDaTriagem\) \{/);
  });

  it('a tela abre o alocar também para "triado, sem tarefa"', () => {
    expect(tela).toMatch(/t\.pedido_status === 'sem_tarefa'/);
    expect(tela).not.toContain('no Kanban');
  });
});
