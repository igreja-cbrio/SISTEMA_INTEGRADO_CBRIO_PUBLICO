import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { semComentariosJs } from './_semComentarios';






const require = createRequire(import.meta.url);
const GS = require('../../backend/utils/marketingSolicitacaoGestao.js');

const sol = (o: Record<string, unknown> = {}) => ({ id: 's1', status: 'aprovado', created_at: '2026-09-01T12:00:00Z', ...o });
const card = (o: Record<string, unknown> = {}) => ({ id: `c${Math.random()}`, estado: 'producao', deleted_at: null, ...o });

describe('etapaDaSolicitacao', () => {
  it('sem solicitação não há etapa', () => {
    expect(GS.etapaDaSolicitacao({ solicitacao: null })).toBeNull();
  });

  it('recusada (pela solicitação ou pela campanha cancelada) vem antes de tudo', () => {
    expect(GS.etapaDaSolicitacao({ solicitacao: sol({ status: 'rejeitado' }), cards: [card()] })).toBe('recusada');
    expect(GS.etapaDaSolicitacao({ solicitacao: sol({ status: 'cancelado' }) })).toBe('recusada');
    expect(GS.etapaDaSolicitacao({ solicitacao: sol(), campanha: { status: 'cancelada' }, cards: [card()] })).toBe('recusada');
  });

  it('concluída em /solicitacoes vale MESMO com a tarefa ainda aberta (é o caso de fechar_tarefa)', () => {
    expect(GS.etapaDaSolicitacao({ solicitacao: sol({ status: 'concluido' }), cards: [card({ estado: 'pesquisa' })] })).toBe('concluida');
    expect(GS.etapaDaSolicitacao({ solicitacao: sol({ status: 'avaliado' }) })).toBe('concluida');
  });

  it('no portão de origem, espera o diretor', () => {
    expect(GS.etapaDaSolicitacao({ solicitacao: sol({ status: 'aguardando_aprovacao_origem' }) })).toBe('aguardando_aprovacao');
  });

  it('sem tarefa: triagem = esperando alocação; o resto = triada sem tarefa', () => {
    expect(GS.etapaDaSolicitacao({ solicitacao: sol(), campanha: { status: 'triagem' } })).toBe('aguardando_alocacao');
    expect(GS.etapaDaSolicitacao({ solicitacao: sol(), campanha: { status: 'ativa' } })).toBe('sem_tarefa');
    expect(GS.etapaDaSolicitacao({ solicitacao: sol() })).toBe('sem_tarefa');
  });

  it('tarefa APAGADA não conta como tarefa', () => {
    const apagada = card({ deleted_at: '2026-09-10T10:00:00Z' });
    expect(GS.etapaDaSolicitacao({ solicitacao: sol(), campanha: { status: 'triagem' }, cards: [apagada] })).toBe('aguardando_alocacao');
  });

  it('revisão aberta vence produção; tudo concluído = entregue', () => {
    expect(GS.etapaDaSolicitacao({ solicitacao: sol(), cards: [card(), card({ estado: 'revisao' })] })).toBe('em_revisao');
    expect(GS.etapaDaSolicitacao({ solicitacao: sol(), cards: [card({ estado: 'backlog' })] })).toBe('em_producao');
    expect(GS.etapaDaSolicitacao({ solicitacao: sol(), cards: [card({ estado: 'concluido' })] })).toBe('entregue');
  });
});

describe('acoesPermitidas', () => {
  const c = { id: 'camp' };

  it('quem não é o líder não age, em etapa nenhuma', () => {
    for (const etapa of Object.keys(GS.ETAPAS)) {
      expect(GS.acoesPermitidas({ etapa, lider: false, campanha: c, cards: [card()] })).toEqual([]);
    }
  });

  it('alocar só existe com campanha (sem ela, a tela não oferece botão que falha)', () => {
    expect(GS.acoesPermitidas({ etapa: 'aguardando_alocacao', lider: true, campanha: c })).toEqual(['alocar', 'recusar']);
    expect(GS.acoesPermitidas({ etapa: 'sem_tarefa', lider: true, campanha: null })).toEqual(['recusar']);
  });

  it('em produção e em revisão: entregar · entregue: encerrar ou reabrir', () => {
    expect(GS.acoesPermitidas({ etapa: 'em_producao', lider: true })).toEqual(['entregar']);
    expect(GS.acoesPermitidas({ etapa: 'em_revisao', lider: true })).toEqual(['entregar']);
    expect(GS.acoesPermitidas({ etapa: 'entregue', lider: true })).toEqual(['encerrar', 'reabrir']);
  });

  it('concluída só oferece fechar a tarefa quando sobrou tarefa ABERTA', () => {
    expect(GS.acoesPermitidas({ etapa: 'concluida', lider: true, cards: [card()] })).toEqual(['fechar_tarefa']);
    expect(GS.acoesPermitidas({ etapa: 'concluida', lider: true, cards: [card({ estado: 'concluido' })] })).toEqual([]);
    expect(GS.acoesPermitidas({ etapa: 'concluida', lider: true, cards: [card({ deleted_at: 'x' })] })).toEqual([]);
  });

  it('aguardando o diretor e recusada: nada a fazer pelas Demandas', () => {
    expect(GS.acoesPermitidas({ etapa: 'aguardando_aprovacao', lider: true, campanha: c })).toEqual([]);
    expect(GS.acoesPermitidas({ etapa: 'recusada', lider: true, campanha: c, cards: [card()] })).toEqual([]);
  });

  it('toda ação oferecida tem descrição (é o que a tela mostra antes de confirmar)', () => {
    for (const etapa of Object.keys(GS.ETAPAS)) {
      for (const a of GS.acoesPermitidas({ etapa, lider: true, campanha: c, cards: [card()] })) {
        expect(typeof GS.ACOES[a]).toBe('string');
      }
    }
  });
});

describe('validarAcao', () => {
  it('ação desconhecida é recusada — inclusive nome herdado de Object', () => {
    expect(GS.validarAcao({ acao: 'apagar' }).erro).toBeTruthy();
    expect(GS.validarAcao({ acao: 'toString' }).erro).toBeTruthy();
    expect(GS.validarAcao({ acao: 42 }).erro).toBeTruthy();
    expect(GS.validarAcao().erro).toBeTruthy();
  });

  it('recusar exige motivo de verdade, contado DEPOIS de aparar', () => {
    expect(GS.validarAcao({ acao: 'recusar', motivo: '   curto   ' }).erro).toBeTruthy();
    expect(GS.validarAcao({ acao: 'recusar', motivo: 'x'.repeat(GS.MOTIVO_MIN - 1) }).erro).toBeTruthy();
    expect(GS.validarAcao({ acao: 'recusar', motivo: `  ${'x'.repeat(GS.MOTIVO_MIN)}  ` })).toEqual({ acao: 'recusar', motivo: 'x'.repeat(GS.MOTIVO_MIN) });
    expect(GS.validarAcao({ acao: 'recusar', motivo: 'x'.repeat(GS.TEXTO_MAX + 1) }).erro).toBeTruthy();
  });

  it('encerrar: observação opcional (vazia vira null) e com teto', () => {
    expect(GS.validarAcao({ acao: 'encerrar' })).toEqual({ acao: 'encerrar', observacao: null });
    expect(GS.validarAcao({ acao: 'encerrar', observacao: '  ok  ' })).toEqual({ acao: 'encerrar', observacao: 'ok' });
    expect(GS.validarAcao({ acao: 'encerrar', observacao: 'x'.repeat(GS.TEXTO_MAX + 1) }).erro).toBeTruthy();
  });

  it('as outras ações não carregam texto', () => {
    expect(GS.validarAcao({ acao: 'entregar', motivo: 'ignorado' })).toEqual({ acao: 'entregar' });
    expect(GS.validarAcao({ acao: 'fechar_tarefa' })).toEqual({ acao: 'fechar_tarefa' });
  });
});

describe('linhaDoTempo', () => {
  it('só o que tem data, em ordem cronológica, com a 1ª entrega das tarefas vivas', () => {
    const ev = GS.linhaDoTempo({
      solicitacao: sol({
        status: 'concluido', created_at: '2026-09-01T12:00:00Z', concluido_em: '2026-09-20T12:00:00Z',
        aprovacao_origem_status: 'aprovada', aprovacao_origem_em: '2026-09-02T12:00:00Z',
      }),
      campanha: { triada_em: '2026-09-05T12:00:00Z' },
      cards: [
        card({ entregue_em: '2026-09-18T12:00:00Z' }),
        card({ entregue_em: '2026-09-15T12:00:00Z' }),
        card({ entregue_em: '2026-09-01T00:00:00Z', deleted_at: 'x' }),
      ],
    });
    expect(ev.map((e: { rotulo: string }) => e.rotulo)).toEqual([
      'Pedido feito', 'Aprovado pelo diretor da área', 'Alocado para a equipe', 'Entregue', 'Concluída',
    ]);
    expect(ev[3].quando).toBe('2026-09-15T12:00:00Z');
  });

  it('aprovação de origem não aprovada e conclusão de solicitação aberta não aparecem', () => {
    const ev = GS.linhaDoTempo({
      solicitacao: sol({ aprovacao_origem_status: 'dispensada', aprovacao_origem_em: '2026-09-02T12:00:00Z', concluido_em: '2026-09-20T12:00:00Z' }),
    });
    expect(ev.map((e: { rotulo: string }) => e.rotulo)).toEqual(['Pedido feito']);
  });
});

describe('subtarefasAbertas', () => {
  it('conta só itens abertos de tarefas abertas', () => {
    const tarefas = [
      { estado: 'producao', itens: [{ feito: false }, { feito: true }, { feito: false }] },
      { estado: 'concluido', itens: [{ feito: false }] },
      { estado: 'revisao' },
    ];
    expect(GS.subtarefasAbertas(tarefas)).toBe(2);
    expect(GS.subtarefasAbertas(null)).toBe(0);
  });
});

describe('guardas estáticas · uma régua, um serviço de conclusão', () => {
  const raiz = join(__dirname, '..', '..');
  const ler = (p: string) => semComentariosJs(readFileSync(join(raiz, p), 'utf8'));
  const linha = ler('backend/routes/marketingLinha.js');
  const marketing = ler('backend/routes/marketing.js');
  const conclusao = ler('backend/services/marketingConclusao.js');
  const avisos = ler('backend/services/marketingAvisos.js');
  const modal = ler('src/pages/marketing/linha/ModalSolicitacao.jsx');

  it('o GET oferece pela régua e o POST relê a régua antes de agir (409 se mudou)', () => {
    expect(linha).toContain('GS.acoesPermitidas({ etapa, lider: ctx.lider, campanha, cards })');
    expect(linha).toContain('GS.acoesPermitidas({ etapa, lider: true, campanha, cards }).includes(v.acao)');
    expect(linha).toMatch(/exigirLider\(req, res\)/);
  });

  it('a aprovação pelo solicitante e o encerramento pela coordenação usam o MESMO serviço', () => {
    expect(marketing).toContain('concluirSolicitacaoMarketing({');
    expect(linha).toContain('concluirSolicitacaoMarketing({');
  });

  it('fechar a tarefa de solicitação já concluída NÃO avisa ninguém', () => {
    const ini = linha.indexOf("v.acao === 'fechar_tarefa'");
    const fim = linha.indexOf("v.acao === 'recusar'");
    expect(ini).toBeGreaterThan(0);
    expect(fim).toBeGreaterThan(ini);
    const bloco = linha.slice(ini, fim);
    expect(bloco).not.toContain('avisarEntregue');
    expect(bloco).not.toContain('notificar(');
  });

  it('todo aviso é AGUARDADO (em serverless o aviso solto se perde)', () => {
    for (const [nome, txt] of [['marketingLinha', linha], ['marketing', marketing], ['marketingAvisos', avisos]] as const) {
      const chamadas = txt.match(/avisarEntregue\(/g) || [];
      const aguardadas = txt.match(/await avisarEntregue\(/g) || [];
      const definicao = nome === 'marketingAvisos' ? 1 : 0;
      expect({ nome, soltas: chamadas.length - aguardadas.length - definicao }).toEqual({ nome, soltas: 0 });
    }
    expect(avisos).toMatch(/return notificar\(\{/);
    expect((conclusao.match(/await notificar\(/g) || []).length).toBe(2);
  });

  it('o modal manda alocar pelo editor, nunca pela rota de ação, e não usa confirm nativo', () => {
    expect(modal).toMatch(/if \(acao === 'alocar'\)/);
    expect(modal).toContain('onAlocar?.(');
    expect(modal).not.toMatch(/window\.confirm|\bconfirm\(/);
  });
});
