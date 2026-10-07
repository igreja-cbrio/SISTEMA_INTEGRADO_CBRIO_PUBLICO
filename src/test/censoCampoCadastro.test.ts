















import { describe, it, expect } from 'vitest';
import {
  traduzirParaCadastro, ehCampoDeCadastro, destinosParaUI, CAMPOS_CADASTRO,
} from '../../backend/utils/censoCampoCadastro.js';
import { DESTINO_CADASTRO_LABEL } from '../lib/censoDestinos';

const VOCAB_ESTADO_CIVIL = ['solteiro', 'casado', 'divorciado', 'viuvo', 'uniao_estavel'];

describe('estado civil · rótulo do formulário → vocabulário do CHECK', () => {

  const REAIS: Array<[string, string]> = [
    ['Solteiro(a)', 'solteiro'],
    ['Casado(a)', 'casado'],
    ['União estável', 'uniao_estavel'],
    ['Divorciado(a)', 'divorciado'],
    ['Viúvo(a)', 'viuvo'],
  ];

  it.each(REAIS)('%s → %s', (rotulo, esperado) => {
    expect(traduzirParaCadastro('estado_civil', rotulo)).toEqual({ ok: true, valor: esperado });
  });

  it('toda tradução cai no vocabulário que o CHECK do banco aceita', () => {
    for (const [rotulo] of REAIS) {
      const r = traduzirParaCadastro('estado_civil', rotulo);
      expect(r.ok).toBe(true);
      expect(VOCAB_ESTADO_CIVIL).toContain((r as { valor: string }).valor);
    }
  });

  it('valor que JÁ está canônico passa igual (idempotente)', () => {


    for (const v of VOCAB_ESTADO_CIVIL) {
      expect(traduzirParaCadastro('estado_civil', v)).toEqual({ ok: true, valor: v });
    }
  });

  it('rótulo desconhecido NÃO é gravado cru', () => {



    expect(traduzirParaCadastro('estado_civil', 'Noivo(a)')).toEqual({
      ok: false, motivo: 'nao_reconhecido',
    });
  });

  it('ignora caixa, acento e espaço', () => {
    expect(traduzirParaCadastro('estado_civil', '  UNIAO ESTAVEL ')).toEqual({ ok: true, valor: 'uniao_estavel' });
    expect(traduzirParaCadastro('estado_civil', 'viúvo')).toEqual({ ok: true, valor: 'viuvo' });
  });
});

describe('escolaridade · coluna nova, sem CHECK', () => {

  it.each([
    ['Ensino Fundamental', 'fundamental'],
    ['Ensino Médio', 'medio'],
    ['Superior completo', 'superior_completo'],
    ['Pós graduação', 'pos_graduacao'],
  ])('%s → %s', (rotulo, esperado) => {
    expect(traduzirParaCadastro('escolaridade', rotulo)).toEqual({ ok: true, valor: esperado });
  });







  it.each(['Superior', 'Superior completo', 'Ensino Superior', 'Graduação', 'Faculdade'])(
    '"%s" é a mesma escolaridade de sempre', (rotulo) => {
      expect(traduzirParaCadastro('escolaridade', rotulo)).toEqual({ ok: true, valor: 'superior_completo' });
    },
  );

  it('incompleto NÃO vira completo', () => {
    expect(traduzirParaCadastro('escolaridade', 'Superior incompleto'))
      .toEqual({ ok: true, valor: 'superior_incompleto' });
  });

  it('opção nova não se perde: cai no slug', () => {



    expect(traduzirParaCadastro('escolaridade', 'Mestrado')).toEqual({ ok: true, valor: 'mestrado' });
    expect(traduzirParaCadastro('escolaridade', 'Curso livre X')).toEqual({ ok: true, valor: 'curso_livre_x' });
  });
});

describe('sexo · o CHECK do banco manda', () => {
  it('traduz o que a porta de pessoa oferece', () => {
    expect(traduzirParaCadastro('genero', 'Masculino')).toEqual({ ok: true, valor: 'masculino' });
    expect(traduzirParaCadastro('genero', 'feminino')).toEqual({ ok: true, valor: 'feminino' });
  });

  it('"Outro" NÃO entra', () => {


    expect(traduzirParaCadastro('genero', 'Outro').ok).toBe(false);
  });
});

describe('CEP', () => {
  it('grava só dígitos', () => {
    expect(traduzirParaCadastro('cep', '22640-100')).toEqual({ ok: true, valor: '22640100' });
  });

  it('recusa CEP incompleto', () => {

    expect(traduzirParaCadastro('cep', '2264')).toEqual({ ok: false, motivo: 'cep_invalido' });
    expect(traduzirParaCadastro('cep', '226401000')).toEqual({ ok: false, motivo: 'cep_invalido' });
  });
});

describe('guardas gerais', () => {
  it('campo fora do catálogo é recusado', () => {


    expect(traduzirParaCadastro('grupo', 'Grupo Barra')).toEqual({ ok: false, motivo: 'campo_desconhecido' });
    expect(traduzirParaCadastro('status', 'membro_ativo')).toEqual({ ok: false, motivo: 'campo_desconhecido' });
    expect(ehCampoDeCadastro('escolaridade')).toBe(true);
    expect(ehCampoDeCadastro('ministerio')).toBe(false);
  });

  it('múltipla escolha (array) nunca vira valor de coluna', () => {
    expect(traduzirParaCadastro('escolaridade', ['Superior', 'Mestrado']).ok).toBe(false);
    expect(traduzirParaCadastro('bairro', ['Barra', 'Recreio']).ok).toBe(false);
  });

  it('vazio é "não informou", não erro', () => {
    for (const v of [null, undefined, '', '   ']) {
      expect(traduzirParaCadastro('bairro', v as unknown as string)).toEqual({ ok: false, motivo: 'vazio' });
    }
  });

  it('campo de texto guarda o que a pessoa escreveu, só sem as pontas', () => {
    expect(traduzirParaCadastro('bairro', '  Barra Olímpica ')).toEqual({ ok: true, valor: 'Barra Olímpica' });
    expect(traduzirParaCadastro('profissao', 'Sommelier')).toEqual({ ok: true, valor: 'Sommelier' });
  });

  it('todo destino do catálogo aparece na UI do construtor', () => {


    const naUI = destinosParaUI().map((d) => d.campo).sort();
    expect(naUI).toEqual(Object.keys(CAMPOS_CADASTRO).sort());
    for (const d of destinosParaUI()) expect(d.label.length).toBeGreaterThan(1);
  });

  it('o espelho do front bate com o catálogo do backend', () => {



    expect(Object.keys(DESTINO_CADASTRO_LABEL).sort()).toEqual(Object.keys(CAMPOS_CADASTRO).sort());
    for (const [campo, label] of Object.entries(DESTINO_CADASTRO_LABEL)) {
      expect(label).toBe((CAMPOS_CADASTRO as Record<string, { label: string }>)[campo].label);
    }
  });
});
