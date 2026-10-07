import { describe, it, expect } from 'vitest';

import {
  exigeDocumento,
  faltaDocumento,
  aplicarRecorteNoBanco,
} from '../../backend/utils/semDocumento.js';





describe('exigeDocumento · só saída se documenta', () => {
  it('receita NUNCA exige documento', () => {
    expect(exigeDocumento({ tipo: 'receita', classe_movimento: 'ordinaria' })).toBe(false);
    expect(exigeDocumento({ tipo: 'receita', classe_movimento: null })).toBe(false);
  });

  it('despesa ordinária exige', () => {
    expect(exigeDocumento({ tipo: 'despesa', classe_movimento: 'ordinaria' })).toBe(true);
  });

  it('transferência entre contas próprias NÃO exige (documentada pelos dois extratos)', () => {
    expect(exigeDocumento({ tipo: 'despesa', classe_movimento: 'transferencia' })).toBe(false);
  });

  it('estorno, empréstimo e extraordinária continuam exigindo (saída para terceiro)', () => {
    for (const classe of ['estorno', 'emprestimo', 'extraordinaria']) {
      expect(exigeDocumento({ tipo: 'despesa', classe_movimento: classe })).toBe(true);
    }
  });

  it('classe nula não tira a despesa da lista', () => {
    expect(exigeDocumento({ tipo: 'despesa', classe_movimento: null })).toBe(true);
    expect(exigeDocumento({ tipo: 'despesa' })).toBe(true);
  });

  it('linha ausente não exige', () => {
    expect(exigeDocumento(null)).toBe(false);
  });
});

describe('faltaDocumento · o pós-filtro da tela', () => {
  const comNf = new Set(['t-nf']);

  it('despesa sem anexo e sem NF entra', () => {
    expect(faltaDocumento({ id: 't1', tipo: 'despesa', anexos_url: [] }, comNf)).toBe(true);
    expect(faltaDocumento({ id: 't1', tipo: 'despesa', anexos_url: null }, comNf)).toBe(true);
  });

  it('despesa com anexo sai', () => {
    expect(faltaDocumento({ id: 't1', tipo: 'despesa', anexos_url: [{ url: 'x' }] }, comNf)).toBe(false);
  });

  it('despesa com NF vinculada sai', () => {
    expect(faltaDocumento({ id: 't-nf', tipo: 'despesa', anexos_url: [] }, comNf)).toBe(false);
  });

  it('receita sem anexo NÃO entra (era o defeito)', () => {
    expect(faltaDocumento({ id: 't2', tipo: 'receita', anexos_url: [] }, comNf)).toBe(false);
  });

  it('funciona sem conjunto de NF', () => {
    expect(faltaDocumento({ id: 't1', tipo: 'despesa', anexos_url: [] }, undefined)).toBe(true);
  });
});

describe('aplicarRecorteNoBanco · o recorte vai pra consulta', () => {
  it('filtra despesa e tira só a transferência, mantendo classe nula', () => {
    const chamadas: Array<[string, ...unknown[]]> = [];
    const q: any = {
      eq: (...a: unknown[]) => { chamadas.push(['eq', ...a]); return q; },
      or: (...a: unknown[]) => { chamadas.push(['or', ...a]); return q; },
    };
    aplicarRecorteNoBanco(q);
    expect(chamadas).toContainEqual(['eq', 'tipo', 'despesa']);
    expect(chamadas).toContainEqual(['or', 'classe_movimento.is.null,classe_movimento.neq.transferencia']);
  });
});
