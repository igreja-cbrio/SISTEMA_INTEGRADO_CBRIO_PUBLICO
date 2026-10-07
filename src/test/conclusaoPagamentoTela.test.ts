import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import {
  ROTULO_FORMA, rotuloForma, exigeComprovante, formaInicial, hojeBrtIso,
  motivoBloqueio, textoBotao, valorSugerido,
  FORMAS_POR_CATEGORIA, CATEGORIAS_SO_CONCLUEM_PAGANDO, statusAposPagamento,
  prontaParaPagar, paraConcluirPagamento,
} from '@/lib/conclusaoPagamentoTela';

const require = createRequire(import.meta.url);
const back = require('../../backend/utils/conclusaoPagamento.js');

const base = { forma: 'pix', data: '2026-10-01', temArquivo: true, podePagar: true, permitidas: ['pix', 'transferencia_bancaria', 'dinheiro'], hojeIso: '2026-10-01' };

describe('espelho do servidor', () => {
  it('rótulos iguais aos do backend', () => {
    expect(ROTULO_FORMA).toEqual(back.ROTULO_FORMA);
  });
  it('exigeComprovante concorda com o backend em toda forma', () => {
    for (const f of [...Object.keys(back.ROTULO_FORMA), '', null, 'cartao_credito']) {
      expect(exigeComprovante(f as string)).toBe(back.exigeComprovante(f));
    }
  });
  it('o que a tela libera, o servidor aceita (forma × arquivo × categoria)', () => {
    for (const categoria of back.CATEGORIAS_PAGAS_PELO_FINANCEIRO) {
      const permitidas = back.formasDaCategoria(categoria);
      for (const forma of [...permitidas, 'cartao_credito', '']) {
        for (const temArquivo of [true, false]) {
          const tela = motivoBloqueio({ ...base, forma, temArquivo, permitidas });
          const serv = back.validarConclusao({ categoria, forma, temArquivo, dataPagamento: '2026-10-01', hojeIso: '2026-10-01' });
          expect(tela === null).toBe(serv.ok);
        }
      }
    }
  });
});

describe('motivoBloqueio', () => {
  it('dinheiro sem arquivo pode concluir', () => {
    expect(motivoBloqueio({ ...base, forma: 'dinheiro', temArquivo: false })).toBeNull();
  });
  it('pix sem arquivo bloqueia dizendo o motivo', () => {
    expect(motivoBloqueio({ ...base, temArquivo: false })).toMatch(/Pix exige o comprovante/);
  });
  it('sem forma bloqueia', () => {
    expect(motivoBloqueio({ ...base, forma: '' })).toMatch(/Escolha a forma/);
  });
  it('quem pediu não paga', () => {
    expect(motivoBloqueio({ ...base, podePagar: false })).toMatch(/próprio pagamento/);
  });
  it('data no futuro bloqueia', () => {
    expect(motivoBloqueio({ ...base, data: '2026-10-02' })).toMatch(/futuro/);
  });
});

describe('formaInicial', () => {
  it('usa a preferência quando permitida, normalizando "transferencia"', () => {
    expect(formaInicial('transferencia', ['pix', 'transferencia_bancaria'])).toBe('transferencia_bancaria');
    expect(formaInicial('pix', ['pix'])).toBe('pix');
  });
  it('não escolhe por ninguém quando a preferência não é permitida', () => {
    expect(formaInicial('cartao_credito', ['pix', 'dinheiro'])).toBe('');
    expect(formaInicial(null, ['pix'])).toBe('');
  });
});

describe('demais', () => {
  it('hoje em BRT: 23h do Rio ainda é o mesmo dia', () => {
    expect(hojeBrtIso(new Date('2026-10-02T02:30:00Z'))).toBe('2026-10-01');
  });
  it('texto do botão não promete conclusão de compra', () => {
    expect(textoBotao('concluido')).toBe('Concluir solicitação');
    expect(textoBotao('aguardando_entrega')).toBe('Marcar como pago');
  });
  it('valor sugerido: cotado vence estimado, em reais com vírgula', () => {
    expect(valorSugerido({ valor_cotado: 120.5, valor_estimado: 100 })).toBe('120,50');
    expect(valorSugerido({ valor_estimado: '80' })).toBe('80,00');
    expect(valorSugerido({})).toBe('');
  });
  it('rótulo de forma desconhecida volta cru, nunca vazio', () => {
    expect(rotuloForma('cheque')).toBe('cheque');
    expect(rotuloForma('transferencia')).toBe('Transferência bancária');
  });
});

describe('em pagamento pelo financeiro · espelho do servidor', () => {
  it('formas e status pós-pagamento iguais aos do backend', () => {
    expect(FORMAS_POR_CATEGORIA).toEqual(back.FORMAS_POR_CATEGORIA);
    expect(CATEGORIAS_SO_CONCLUEM_PAGANDO).toEqual(back.CATEGORIAS_SO_CONCLUEM_PAGANDO);
    for (const c of ['reembolso', 'pagamento', 'compras', 'servico', 'ti', null]) {
      expect(statusAposPagamento(c as string)).toBe(back.statusAposPagamento(c));
    }
  });
  it('prontaParaPagar concorda com o servidor em toda combinação', () => {
    const combos: Record<string, unknown>[] = [];
    for (const categoria of ['reembolso', 'compras', 'ti'])
      for (const status of ['em_atendimento', 'aprovado'])
        for (const area_responsavel of ['financeiro', 'logistica_compras'])
          for (const pago_em of [null, '2026-10-01'])
            for (const precisa of [true, false])
              for (const aprov of [null, '2026-09-30'])
                combos.push({ categoria, status, area_responsavel, pago_em, precisa_aprovacao_financeira: precisa, aprovado_financeiro_em: aprov, deleted_at: null });
    for (const s of combos) expect(prontaParaPagar(s)).toBe(back.prontaParaPagar(s).ok);
  });
  it('quem pediu não ganha o botão de pagar', () => {
    const s = { categoria: 'reembolso', solicitante_id: 'u1' };
    expect(paraConcluirPagamento(s, 'u1').pode_pagar).toBe(false);
    expect(paraConcluirPagamento(s, 'u2').pode_pagar).toBe(true);
    expect(paraConcluirPagamento(s, 'u2').formas_permitidas).toEqual(['pix', 'transferencia_bancaria', 'dinheiro']);
  });
});
