


import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const correcao = require('../../backend/utils/correcaoSolicitacao.js');
const conclusao = require('../../backend/utils/conclusaoPagamento.js');
const doacoes = require('../../backend/utils/doacoesDoador.js');

const sql = readFileSync(resolve(__dirname, '../../supabase/migrations/20261002190000_solicitacao_correcao_e_doadores.sql'), 'utf8');
const semComentarios = sql.split('\n').map((l) => l.replace(/--[^\n]*/, '')).join('\n');
const listaSql = (re: RegExp) => {
  const m = re.exec(semComentarios);
  if (!m) throw new Error(`não achei ${re}`);
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
};

describe('fn_solicitacao_corrigir × correcaoSolicitacao.js', () => {
  it('status corrigíveis iguais', () => {
    expect(listaSql(/v_sol\.status NOT IN \(([^)]*)\)/)).toEqual(correcao.STATUS_CORRIGIVEIS);
  });
  it('categorias iguais às que o financeiro paga', () => {
    expect(listaSql(/v_sol\.categoria NOT IN \(([^)]*)\)/).sort()).toEqual([...conclusao.CATEGORIAS_PAGAS_PELO_FINANCEIRO].sort());
  });
  it('motivo mínimo igual', () => {
    const m = /length\(btrim\(coalesce\(p_motivo, ''\)\)\) < (\d+)/.exec(semComentarios);
    expect(Number(m?.[1])).toBe(correcao.MOTIVO_MIN);
  });
  it('toda chave aceita pela régua JS tem ramo no UPDATE da RPC', () => {
    for (const campo of correcao.CAMPOS_CORRIGIVEIS) {
      expect(semComentarios).toContain(`v_campos ? '${campo}'`);
    }
  });
});

describe('RPCs de doador × doacoesDoador.js', () => {
  it('teto de chaves igual', () => {
    const m = /cardinality\(p_chaves\) > (\d+)/.exec(semComentarios);
    expect(Number(m?.[1])).toBe(doacoes.CHAVES_MAX);
  });
  it('classes chegam por parâmetro (uma fonte só) e a trava fixa barra empréstimo', () => {
    expect((semComentarios.match(/classe_movimento = ANY \(p_classes\)/g) || []).length).toBe(2);
    expect((semComentarios.match(/classe_movimento NOT IN \('emprestimo', 'transferencia', 'estorno'\)/g) || []).length).toBe(2);
    expect(doacoes.CLASSES_DOACAO).not.toContain('emprestimo');
  });
  it('a chave colapsa espaços ANTES de aparar (NBSP na ponta)', () => {
    expect(semComentarios).toMatch(/NULLIF\(btrim\(regexp_replace\(public\.fn_nome_norm/);
  });
  it('mínimo de letras da busca igual ao da régua JS, sem contar espaços', () => {
    const m = /length\(replace\(v_q, ' ', ''\)\) < (\d+)/.exec(semComentarios);
    expect(Number(m?.[1])).toBe(doacoes.BUSCA_MIN);
  });
});
