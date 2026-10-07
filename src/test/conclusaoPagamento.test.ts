import { describe, it, expect } from 'vitest';

import {
  formasDaCategoria,
  exigeComprovante,
  statusAposPagamento,
  prontaParaPagar,
  validarConclusao,
  reaisParaCentavos,
  divergeDaPreferencia,
  PASTA_POR_CATEGORIA,
} from '../../backend/utils/conclusaoPagamento.js';




const BASE = {
  categoria: 'reembolso',
  forma: 'pix',
  temArquivo: true,
  valorPagoCentavos: 12345,
  dataPagamento: '2026-10-01',
  hojeIso: '2026-10-01',
  executorId: 'tesouraria',
  solicitanteId: 'pessoa',
};

describe('formas por categoria', () => {
  it('reembolso não se paga por boleto (é dinheiro devolvido a uma pessoa)', () => {
    expect(formasDaCategoria('reembolso')).toEqual(['pix', 'transferencia_bancaria', 'dinheiro']);
  });
  it('pagamento, compra e serviço aceitam boleto', () => {
    for (const c of ['pagamento', 'compras', 'servico']) expect(formasDaCategoria(c)).toContain('boleto');
  });
  it('cartão de crédito nunca é forma do financeiro (quem compra no cartão é a logística)', () => {
    for (const c of ['reembolso', 'pagamento', 'compras', 'servico']) {
      expect(formasDaCategoria(c).some((f: string) => /cartao/.test(f))).toBe(false);
    }
  });
  it('categoria desconhecida não tem forma nenhuma', () => {
    expect(formasDaCategoria('ti')).toEqual([]);
  });
});

describe('comprovante · dinheiro dispensa, o resto exige', () => {
  it('dinheiro não exige', () => expect(exigeComprovante('dinheiro')).toBe(false));
  it('pix e transferência exigem', () => {
    expect(exigeComprovante('pix')).toBe(true);
    expect(exigeComprovante('transferencia_bancaria')).toBe(true);
  });
  it('pix SEM arquivo é recusado, com o campo certo', () => {
    const r = validarConclusao({ ...BASE, temArquivo: false });
    expect(r).toMatchObject({ ok: false, campo: 'arquivo' });
  });
  it('dinheiro sem arquivo passa', () => {
    expect(validarConclusao({ ...BASE, forma: 'dinheiro', temArquivo: false })).toEqual({ ok: true });
  });
});

describe('separação de funções e dados', () => {
  it('quem pediu não registra o próprio pagamento', () => {
    expect(validarConclusao({ ...BASE, executorId: 'x', solicitanteId: 'x' })).toMatchObject({ ok: false, campo: 'executor' });
  });
  it('forma fora da categoria é recusada (boleto em reembolso)', () => {
    expect(validarConclusao({ ...BASE, forma: 'boleto' })).toMatchObject({ ok: false, campo: 'forma' });
  });
  it('data no futuro é recusada; hoje passa', () => {
    expect(validarConclusao({ ...BASE, dataPagamento: '2026-10-02' })).toMatchObject({ ok: false, campo: 'data' });
    expect(validarConclusao(BASE)).toEqual({ ok: true });
  });
  it('data impossível é recusada', () => {
    expect(validarConclusao({ ...BASE, dataPagamento: '2026-13-40' })).toMatchObject({ ok: false, campo: 'data' });
  });
  it('valor zero, negativo ou ilegível é recusado', () => {
    for (const v of [0, -100, Number.NaN, 12.5]) {
      expect(validarConclusao({ ...BASE, valorPagoCentavos: v })).toMatchObject({ ok: false, campo: 'valor' });
    }
  });
});

describe('reaisParaCentavos', () => {
  it('lê vírgula, ponto de milhar, R$ e número', () => {
    expect(reaisParaCentavos('1.234,56')).toBe(123456);
    expect(reaisParaCentavos('R$ 50,10')).toBe(5010);
    expect(reaisParaCentavos('80.5')).toBe(8050);
    expect(reaisParaCentavos(19.99)).toBe(1999);
  });
  it('vazio é null (não veio nada); lixo é NaN (a validação recusa)', () => {
    expect(reaisParaCentavos('')).toBeNull();
    expect(reaisParaCentavos(null)).toBeNull();
    expect(Number.isNaN(reaisParaCentavos('abc'))).toBe(true);
  });
});

describe('estado da solicitação', () => {
  const pronta = { categoria: 'reembolso', status: 'em_atendimento', area_responsavel: 'financeiro', pago_em: null };
  it('a que está na fila do financeiro pode ser paga', () => {
    expect(prontaParaPagar(pronta)).toEqual({ ok: true });
  });
  it('já paga não paga de novo', () => {
    expect(prontaParaPagar({ ...pronta, pago_em: '2026-10-01T10:00:00Z' })).toMatchObject({ ok: false, motivo: 'ja_pago' });
  });
  it('fora do financeiro ou sem aprovação financeira não entra', () => {
    expect(prontaParaPagar({ ...pronta, area_responsavel: 'logistica' })).toMatchObject({ ok: false, motivo: 'status' });
    expect(prontaParaPagar({ ...pronta, precisa_aprovacao_financeira: true })).toMatchObject({ ok: false, motivo: 'sem_aprovacao' });
  });
  it('reembolso e pagamento concluem; compra segue para a entrega', () => {
    expect(statusAposPagamento('reembolso')).toBe('concluido');
    expect(statusAposPagamento('pagamento')).toBe('concluido');
    expect(statusAposPagamento('compras')).toBe('aguardando_entrega');
  });
  it('cada categoria tem pasta de comprovante', () => {
    expect(PASTA_POR_CATEGORIA).toMatchObject({ reembolso: 'reembolso', pagamento: 'pagamento', compras: 'compra', servico: 'compra' });
  });
  it('divergência da preferência é declarada; transferência do formulário equivale à bancária', () => {
    expect(divergeDaPreferencia('dinheiro', 'pix')).toBe(true);
    expect(divergeDaPreferencia('transferencia_bancaria', 'transferencia')).toBe(false);
    expect(divergeDaPreferencia('pix', null)).toBe(false);
  });
});
