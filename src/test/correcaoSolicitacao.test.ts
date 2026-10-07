import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import {
  elegivelParaCorrecao as elegivelTela, camposCorrigiveis as camposTela, podeCorrigir,
  formInicial, camposAlterados, motivoBloqueioCorrecao, podeRetirarAjusteTela,
  STATUS_CORRIGIVEIS as STATUS_TELA, CAMPOS_CORRIGIVEIS as CAMPOS_TELA, ROTULO_CAMPO as ROTULO_TELA,
  MOTIVO_MIN as MOTIVO_MIN_TELA, MOTIVOS_DE_DEVOLUCAO as DEVOLUCAO_TELA,
} from '@/lib/correcaoSolicitacaoTela';

const require = createRequire(import.meta.url);
const back = require('../../backend/utils/correcaoSolicitacao.js');
const retirar = require('../../backend/utils/retirarAjuste.js');

const pago = {
  id: 's1', categoria: 'reembolso', status: 'concluido', pago_em: '2026-10-02T12:00:00Z',
  solicitante_id: 'quem-pediu', titulo: 'Reembolso de material', descricao: 'Cola e papel',
  justificativa: null, motivo_reembolso: 'Compra para o Kids', pagamento_forma: 'pix',
  pagamento_data: '2026-10-01', pago_valor: 120.5, pago_observacao: null, fin_transacao_id: null,
};
const executor = 'financeiro-1';
const hojeIso = '2026-10-02';
const motivo = 'O pagamento foi por transferência, não por Pix';

function montar(corpo: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return back.montarCorrecao({
    sol: { ...pago, ...(extra.sol as object || {}) },
    corpo: { motivo, ...corpo },
    temArquivo: !!extra.temArquivo,
    temComprovanteAtual: extra.temComprovanteAtual ?? true,
    executorId: (extra.executorId as string) ?? executor,
    hojeIso,
  });
}

describe('espelho do servidor', () => {
  it('constantes iguais', () => {
    expect(STATUS_TELA).toEqual(back.STATUS_CORRIGIVEIS);
    expect([...CAMPOS_TELA]).toEqual(back.CAMPOS_CORRIGIVEIS);
    expect(ROTULO_TELA).toEqual(back.ROTULO_CAMPO);
    expect(MOTIVO_MIN_TELA).toBe(back.MOTIVO_MIN);
    expect(DEVOLUCAO_TELA).toEqual(retirar.MOTIVOS_DE_DEVOLUCAO);
  });
  it('elegibilidade concorda em toda combinação de categoria × status × pago', () => {
    const categorias = ['reembolso', 'pagamento', 'compras', 'servico', 'ti', 'marketing'];
    const status = ['concluido', 'avaliado', 'aguardando_entrega', 'em_atendimento', 'rejeitado', 'cancelado', 'aguardando_ajuste'];
    for (const categoria of categorias) for (const st of status) for (const pagoEm of [null, '2026-10-01T10:00:00Z']) {
      const s = { ...pago, categoria, status: st, pago_em: pagoEm };
      expect(elegivelTela(s)).toBe(back.elegivelParaCorrecao(s).ok);
    }
  });
  it('campos oferecidos concordam (com e sem lançamento no razão)', () => {
    for (const categoria of ['reembolso', 'pagamento', 'compras']) for (const fin of [null, 'tx-1']) {
      const s = { ...pago, categoria, fin_transacao_id: fin };
      expect(camposTela(s)).toEqual(back.camposCorrigiveis(s));
    }
  });
  it('o que a tela libera, o servidor aceita', () => {
    const casos = [
      { pagamento_forma: 'transferencia_bancaria' },
      { pago_valor: '130,00' },
      { pagamento_data: '2026-09-30' },
      { titulo: 'Novo título' },
      { pago_observacao: 'Pago pela conta do Itaú' },
    ];
    for (const c of casos) {
      const form = { ...formInicial(pago), ...c, motivo };
      const tela = motivoBloqueioCorrecao({ sol: pago, form, temArquivo: false, temComprovanteAtual: true, hojeIso });
      const serv = back.montarCorrecao({ sol: pago, corpo: { ...camposAlterados(pago, form), motivo }, temArquivo: false, temComprovanteAtual: true, executorId: executor, hojeIso });
      expect(tela === null).toBe(serv.ok);
    }
  });
});

describe('elegibilidade', () => {
  it('só depois do pagamento', () => {
    expect(back.elegivelParaCorrecao({ ...pago, pago_em: null }).motivo).toBe('sem_pagamento');
  });
  it('rejeitada e cancelada são imutáveis mesmo pagas', () => {
    expect(back.elegivelParaCorrecao({ ...pago, status: 'rejeitado' }).motivo).toBe('imutavel');
    expect(back.elegivelParaCorrecao({ ...pago, status: 'cancelado' }).motivo).toBe('imutavel');
  });
  it('categoria que o financeiro não paga fica fora', () => {
    expect(back.elegivelParaCorrecao({ ...pago, categoria: 'ti' }).motivo).toBe('categoria');
  });
  it('compra paga aguardando entrega é corrigível', () => {
    expect(back.elegivelParaCorrecao({ ...pago, categoria: 'compras', status: 'aguardando_entrega' }).ok).toBe(true);
  });
  it('botão: quem pediu não corrige; quem não atende a área não vê', () => {
    expect(podeCorrigir(pago, { atendeArea: true, usuarioId: 'quem-pediu' })).toBe(false);
    expect(podeCorrigir(pago, { atendeArea: false, usuarioId: executor })).toBe(false);
    expect(podeCorrigir(pago, { atendeArea: true, usuarioId: executor })).toBe(true);
  });
});

describe('montarCorrecao', () => {
  it('manda só o que mudou e registra antes/depois', () => {
    const r = montar({ pagamento_forma: 'transferencia_bancaria', titulo: pago.titulo, pago_valor: '120,50' });
    expect(r.ok).toBe(true);
    expect(r.campos).toEqual({ pagamento_forma: 'transferencia_bancaria' });
    expect(r.alteracoes).toEqual({ pagamento_forma: { antes: 'pix', depois: 'transferencia_bancaria' } });
    expect(r.rotulos).toEqual(['forma de pagamento']);
  });
  it('nunca grava status, concluido_em ou pago_em', () => {
    const r = montar({ pago_valor: '99,90', pagamento_data: '2026-09-29', pago_observacao: 'x' });
    expect(r.ok).toBe(true);
    for (const k of ['status', 'concluido_em', 'pago_em', 'pago_por']) expect(r.campos).not.toHaveProperty(k);
    expect(r.campos.pago_valor).toBe(99.9);
  });
  it('favorecido, Pix, banco e valor aprovado são recusados', () => {
    for (const campo of ['favorecido_nome', 'chave_pix', 'banco', 'agencia', 'conta', 'valor_estimado', 'valor_cotado', 'forma_pagamento', 'status']) {
      const r = montar({ [campo]: 'qualquer' });
      expect(r.ok).toBe(false);
      expect(r.campo).toBe(campo);
    }
  });
  it('motivo curto é recusado', () => {
    const r = back.montarCorrecao({ sol: pago, corpo: { titulo: 'Outro', motivo: 'curto' }, temArquivo: false, temComprovanteAtual: true, executorId: executor, hojeIso });
    expect(r.ok).toBe(false);
    expect(r.campo).toBe('motivo');
  });
  it('quem pediu não corrige o próprio pagamento', () => {
    const r = montar({ titulo: 'Outro' }, { executorId: 'quem-pediu' });
    expect(r.ok).toBe(false);
    expect(r.campo).toBe('executor');
  });
  it('nada mudou é erro, não correção vazia', () => {
    const r = montar({ titulo: `  ${pago.titulo}  `, pago_valor: '120.50' });
    expect(r.ok).toBe(false);
    expect(r.campo).toBe('corpo');
  });
  it('só o comprovante novo já é correção', () => {
    const r = montar({}, { temArquivo: true });
    expect(r.ok).toBe(true);
    expect(r.campos).toEqual({});
    expect(r.rotulos).toEqual(['comprovante']);
  });
  it('lançada no razão: valor e data travados, texto livre', () => {
    const sol = { fin_transacao_id: 'tx-1' };
    expect(montar({ pago_valor: '10,00' }, { sol }).ok).toBe(false);
    expect(montar({ pagamento_data: '2026-09-01' }, { sol }).ok).toBe(false);
    expect(montar({ pago_valor: '120,50' }, { sol }).ok).toBe(false);
    expect(montar({ pago_observacao: 'ok' }, { sol }).ok).toBe(true);
  });
  it('valor e data inválidos', () => {
    expect(montar({ pago_valor: '0' }).campo).toBe('pago_valor');
    expect(montar({ pago_valor: 'abc' }).campo).toBe('pago_valor');
    expect(montar({ pagamento_data: '2026-13-01' }).campo).toBe('pagamento_data');
    expect(montar({ pagamento_data: '2026-02-30' }).campo).toBe('pagamento_data');
    expect(montar({ pagamento_data: '2026-10-03' }).campo).toBe('pagamento_data');
  });
  it('trocar dinheiro por Pix exige comprovante se não houver um', () => {
    const sol = { pagamento_forma: 'dinheiro' };
    const semComp = montar({ pagamento_forma: 'pix' }, { sol, temComprovanteAtual: false });
    expect(semComp.ok).toBe(false);
    expect(semComp.campo).toBe('arquivo');
    expect(montar({ pagamento_forma: 'pix' }, { sol, temComprovanteAtual: false, temArquivo: true }).ok).toBe(true);
  });
  it('forma fora da categoria é recusada (reembolso não paga boleto)', () => {
    expect(montar({ pagamento_forma: 'boleto' }).campo).toBe('pagamento_forma');
  });
  it('motivo_reembolso só existe em reembolso', () => {
    const r = montar({ motivo_reembolso: 'outro motivo' }, { sol: { categoria: 'pagamento' } });
    expect(r.ok).toBe(false);
  });
  it('título não pode ficar vazio', () => {
    expect(montar({ titulo: '   ' }).campo).toBe('titulo');
  });
});

describe('retirar pedido de ajuste (caso nº 109)', () => {
  const sol = { id: 's109', status: 'aguardando_ajuste', status_antes_ajuste: 'aguardando_aprovacao_financeira', vezes_refeita: 1 };
  const devolucao = { lado: 'responsavel', motivo: 'descricao' };
  const comentario = 'Pedi ajuste por engano, já paguei';

  it('a área retira o próprio pedido', () => {
    expect(retirar.podeRetirarAjuste({ sol, ultimoAjuste: devolucao, comentario }).ok).toBe(true);
    expect(retirar.montarRetirada(sol)).toEqual({
      status: 'aguardando_aprovacao_financeira', status_antes_ajuste: null, sla_pausado_em: null, vezes_refeita: 0,
    });
  });
  it('não retira o que o solicitante pediu', () => {
    expect(retirar.podeRetirarAjuste({ sol, ultimoAjuste: { lado: 'solicitante', motivo: 'escopo' }, comentario }).motivo).toBe('nao_foi_a_area');
  });
  it('não retira depois de uma resposta, nem sem saber o status anterior', () => {
    expect(retirar.podeRetirarAjuste({ sol, ultimoAjuste: { lado: 'responsavel', motivo: 'resposta' }, comentario }).ok).toBe(false);
    expect(retirar.podeRetirarAjuste({ sol: { ...sol, status_antes_ajuste: null }, ultimoAjuste: devolucao, comentario }).motivo).toBe('sem_status_anterior');
  });
  it('só em aguardando_ajuste e com comentário', () => {
    expect(retirar.podeRetirarAjuste({ sol: { ...sol, status: 'em_atendimento' }, ultimoAjuste: devolucao, comentario }).motivo).toBe('status');
    expect(retirar.podeRetirarAjuste({ sol, ultimoAjuste: devolucao, comentario: ' ' }).motivo).toBe('comentario');
  });
  it('vezes_refeita nunca fica negativo', () => {
    expect(retirar.montarRetirada({ ...sol, vezes_refeita: 0 }).vezes_refeita).toBe(0);
  });
  it('tela e servidor concordam (sem o comentário, que é do formulário)', () => {
    const ajustes = [devolucao, { lado: 'solicitante', motivo: 'escopo' }, { lado: 'responsavel', motivo: 'resposta' }, null];
    const sols = [sol, { ...sol, status: 'concluido' }, { ...sol, status_antes_ajuste: null }];
    for (const s of sols) for (const a of ajustes) {
      expect(podeRetirarAjusteTela({ sol: s, ultimoAjuste: a, atendeArea: true }))
        .toBe(retirar.podeRetirarAjuste({ sol: s, ultimoAjuste: a, comentario }).ok);
    }
  });
});

describe('autoridade de correção (achado da revisão: leitura não basta)', () => {
  it('perfil só leitura no financeiro NÃO corrige', () => {
    expect(back.temAutoridadeDeCorrecao({ role: 'assistente', finPerm: { leitura: 4, escrita: 0 } })).toBe(false);
    expect(back.temAutoridadeDeCorrecao({ role: 'assistente', finPerm: { leitura: 3, escrita: 2 } })).toBe(false);
  });
  it('escrita ≥ 3, responsável da área, admin/diretor e super-admin corrigem', () => {
    expect(back.temAutoridadeDeCorrecao({ role: 'assistente', finPerm: { leitura: 0, escrita: 3 } })).toBe(true);
    expect(back.temAutoridadeDeCorrecao({ role: 'assistente', finPerm: null, ehResponsavelFinanceiro: true })).toBe(true);
    expect(back.temAutoridadeDeCorrecao({ role: 'diretor', finPerm: null })).toBe(true);
    expect(back.temAutoridadeDeCorrecao({ role: 'assistente', superAdmin: true })).toBe(true);
    expect(back.temAutoridadeDeCorrecao({ role: 'assistente' })).toBe(false);
  });
  it('escopo por categoria: vazio = todas; configurado = só as liberadas', () => {
    expect(back.categoriaNoEscopo([], 'compras')).toBe(true);
    expect(back.categoriaNoEscopo(new Set(['reembolso']), 'compras')).toBe(false);
    expect(back.categoriaNoEscopo(['reembolso'], 'reembolso')).toBe(true);
  });
});

describe('texto do evento na linha do tempo', () => {
  it('usa rótulos acentuados, nunca o nome da coluna', () => {
    const r = montar({ titulo: 'Outro', pago_observacao: 'Pago pela conta do Itaú', pagamento_forma: 'transferencia_bancaria' });
    const txt = back.observacaoDoEvento({ rotulos: r.rotulos, temArquivo: false, temComprovanteAtual: true });
    expect(txt).toMatch(/título/);
    expect(txt).toMatch(/observação do pagamento/);
    expect(txt).not.toMatch(/pago_observacao|pagamento_forma|titulo\b/);
  });
  it('comprovante anexado × substituído', () => {
    expect(back.observacaoDoEvento({ rotulos: ['comprovante'], temArquivo: true, temComprovanteAtual: false })).toBe('Correção depois do pagamento · comprovante anexado');
    expect(back.observacaoDoEvento({ rotulos: ['comprovante'], temArquivo: true, temComprovanteAtual: true })).toBe('Correção depois do pagamento · comprovante substituído');
  });
});

describe('retirada: quem pediu não desfaz a devolução da área', () => {
  const sol = { id: 's1', solicitante_id: 'quem-pediu', status: 'aguardando_ajuste', status_antes_ajuste: 'em_atendimento', vezes_refeita: 1 };
  const devolucao = { lado: 'responsavel', motivo: 'escopo' };
  it('servidor e tela recusam o solicitante', () => {
    expect(retirar.podeRetirarAjuste({ sol, ultimoAjuste: devolucao, comentario: 'engano meu', usuarioId: 'quem-pediu' }).motivo).toBe('solicitante');
    expect(podeRetirarAjusteTela({ sol, ultimoAjuste: devolucao, atendeArea: true, usuarioId: 'quem-pediu' })).toBe(false);
    expect(podeRetirarAjusteTela({ sol, ultimoAjuste: devolucao, atendeArea: true, usuarioId: 'area' })).toBe(true);
  });
  it('devolução é só pedido de ajuste da área (correção e retirada não contam)', () => {
    expect(retirar.ehDevolucaoDaArea({ lado: 'responsavel', motivo: 'descricao' })).toBe(true);
    expect(retirar.ehDevolucaoDaArea({ lado: 'responsavel', motivo: 'edicao' })).toBe(false);
    expect(retirar.ehDevolucaoDaArea({ lado: 'responsavel', motivo: 'resposta' })).toBe(false);
    expect(retirar.ehDevolucaoDaArea({ lado: 'responsavel', motivo: 'cancelamento' })).toBe(false);
    expect(retirar.ehDevolucaoDaArea({ lado: 'solicitante', motivo: 'escopo' })).toBe(false);
  });
});

describe('PATCH genérico não mexe em solicitação encerrada', () => {
  const st = require('../../backend/utils/statusSolicitacao.js');
  it('encerrada não muda de status', () => {
    for (const atual of ['concluido', 'cancelado', 'rejeitado', 'avaliado']) {
      expect(st.patchPodeMudarStatus(atual, 'em_atendimento')).toBe(false);
      expect(st.patchPodeMudarStatus(atual, 'pendente')).toBe(false);
    }
  });
  it('sem status, ou o mesmo status, passa (NPS, observação, responsável)', () => {
    expect(st.patchPodeMudarStatus('concluido', undefined)).toBe(true);
    expect(st.patchPodeMudarStatus('concluido', 'concluido')).toBe(true);
  });
  it('em andamento continua livre', () => {
    expect(st.patchPodeMudarStatus('aguardando_entrega', 'concluido')).toBe(true);
    expect(st.patchPodeMudarStatus('pendente', 'em_analise')).toBe(true);
  });
});
