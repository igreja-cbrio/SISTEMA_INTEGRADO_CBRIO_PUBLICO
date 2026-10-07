










import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const reg = require('../../backend/utils/campanhaIdentidade.js');
const { validarNome, validarDescricaoCurta, mensagemDoMotivo, MAX_NOME, MAX_DESCRICAO_CURTA } = reg;

describe('campanhaIdentidade · nome', () => {
  it('nome normal passa, trimado', () => {
    expect(validarNome('  Reforma do Espaço Kids  '))
      .toEqual({ ok: true, nome: 'Reforma do Espaço Kids' });
  });

  it('⚠️⚠️ VAZIO é recusado — `""` passa no NOT NULL do banco', () => {
    for (const v of ['', '   ', '\t', '\n  \n']) {
      const r = validarNome(v);
      expect(r.ok).toBe(false);
      expect(r.motivo).toBe('nome_vazio');
    }
  });

  it('⚠️ espaço interno é COLAPSADO (não cria duas grafias do mesmo nome)', () => {
    expect(validarNome('Reforma   do  Kids').nome).toBe('Reforma do Kids');
  });

  it('não vindo no payload, NÃO mexe (undefined atravessa)', () => {
    expect(validarNome(undefined)).toEqual({ ok: true, nome: undefined });
  });

  it('tipo errado é recusado, sem estourar', () => {
    for (const v of [null, 42, {}, []]) {
      expect(validarNome(v as any).ok).toBe(false);
    }
  });

  it(`recusa acima de ${MAX_NOME} caracteres`, () => {
    expect(validarNome('x'.repeat(MAX_NOME)).ok).toBe(true);
    expect(validarNome('x'.repeat(MAX_NOME + 1)).motivo).toBe('nome_longo');
  });

  it('⚠️ o teto conta DEPOIS do trim (espaço não gasta o limite)', () => {
    expect(validarNome(`  ${'x'.repeat(MAX_NOME)}  `).ok).toBe(true);
  });

  it('acento e cedilha sobrevivem (é nome exibido, não slug)', () => {
    expect(validarNome('Ação Social · Reforma').nome).toBe('Ação Social · Reforma');
  });
});

describe('campanhaIdentidade · descrição curta', () => {
  it('texto passa trimado', () => {
    expect(validarDescricaoCurta('  transformar o espaço  ').descricao_curta)
      .toBe('transformar o espaço');
  });

  it('⚠️ VAZIO vira null (uma forma só de ausência)', () => {
    for (const v of ['', '   ']) {
      expect(validarDescricaoCurta(v)).toEqual({ ok: true, descricao_curta: null });
    }
  });

  it('null explícito apaga', () => {
    expect(validarDescricaoCurta(null).descricao_curta).toBeNull();
  });

  it('undefined não mexe', () => {
    expect(validarDescricaoCurta(undefined).descricao_curta).toBeUndefined();
  });

  it(`recusa acima de ${MAX_DESCRICAO_CURTA}`, () => {
    expect(validarDescricaoCurta('x'.repeat(MAX_DESCRICAO_CURTA)).ok).toBe(true);
    expect(validarDescricaoCurta('x'.repeat(MAX_DESCRICAO_CURTA + 1)).motivo).toBe('descricao_longa');
  });
});

describe('campanhaIdentidade · mensagem', () => {
  it('cada motivo tem frase própria', () => {
    for (const m of ['nome_vazio', 'nome_longo', 'nome_invalido', 'descricao_longa']) {
      expect(mensagemDoMotivo(m)).not.toBe('Não foi possível salvar.');
    }
  });
  it('⚠️ motivo desconhecido NÃO devolve undefined na tela', () => {
    expect(mensagemDoMotivo('coisa_nova')).toBe('Não foi possível salvar.');
    expect(mensagemDoMotivo(undefined)).toBe('Não foi possível salvar.');
  });
});

describe('campanhaIdentidade · guardas ESTÁTICAS do renomear', () => {
  const rota = readFileSync('backend/routes/campanhas.js', 'utf8');


  const semComentarios = rota
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').map((l) => l.replace(/(^|[^:])\/\/[^\n]*$/, '$1')).join('\n');

  it('⚠️⚠️ `slug` NÃO está entre os campos editáveis', () => {
    const bloco = semComentarios.match(/const CAMPOS_CAMPANHA = \[([\s\S]*?)\]/);
    expect(bloco).toBeTruthy();
    expect(bloco![1]).not.toContain('slug');

    expect(bloco![1]).toContain("'nome'");
  });

  it('⚠️ o PUT VALIDA o nome pela régua (não grava direto do body)', () => {
    expect(semComentarios).toContain('validarNome');
  });

  it('⚠️⚠️ o renomear NÃO reescreve o snapshot da doação', () => {


    expect(semComentarios).not.toMatch(/from\(['"]pag_cobrancas['"]\)[\s\S]{0,200}\.update\(/);
  });
});
