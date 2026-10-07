

















import { describe, it, expect } from 'vitest';
import {
  normalizarFlagsTipoCulto, FLAGS_BOOLEANAS, DEFAULT_AO_CRIAR,
} from '../../backend/utils/tipoCultoFlags';

const criar = (body: any) => normalizarFlagsTipoCulto(body, { modo: 'criar' });
const atualizar = (body: any) => normalizarFlagsTipoCulto(body, { modo: 'atualizar' });

describe('criação: o default seguro', () => {
  it('sem flag nenhuma, o tipo nasce SEM materializar culto', () => {
    const r: any = criar({ name: 'Culto novo' });
    expect(r.ok).toBe(true);


    expect(r.patch.has_online_stream).toBe(false);
  });

  it('não inventa valor para as flags que a coluna já protege', () => {
    const r: any = criar({ name: 'Culto novo' });
    expect(r.patch).not.toHaveProperty('has_kids');
    expect(r.patch).not.toHaveProperty('has_online');
    expect(r.patch).not.toHaveProperty('presencial_label');
  });

  it('respeita quem LIGOU a materialização de propósito', () => {
    const r: any = criar({ has_online_stream: true });
    expect(r.patch.has_online_stream).toBe(true);
  });

  it('aceita as três flags juntas', () => {
    const r: any = criar({ has_kids: true, has_online: true, has_online_stream: true });
    expect(r.patch).toEqual({ has_kids: true, has_online: true, has_online_stream: true });
  });

  it('ignora campo desconhecido (não vaza pro UPDATE)', () => {
    const r: any = criar({ name: 'x', is_active: false, meta_duracao_min: 60, apagar_tudo: true });
    expect(Object.keys(r.patch)).toEqual(['has_online_stream']);
  });
});

describe('atualização: ausente NUNCA é escrita', () => {
  it('corpo sem flags não toca em nada', () => {
    const r: any = atualizar({ name: 'Renomeado' });
    expect(r.ok).toBe(true);


    expect(r.patch).toEqual({});
  });

  it('false EXPLÍCITO desliga (é a pessoa decidindo)', () => {
    const r: any = atualizar({ has_kids: false });
    expect(r.patch).toEqual({ has_kids: false });
  });

  it('é o caminho que conserta um tipo que nasceu errado', () => {
    const r: any = atualizar({ has_kids: true, has_online: true, presencial_label: 'Sede' });
    expect(r.patch).toEqual({ has_kids: true, has_online: true, presencial_label: 'Sede' });
  });
});

describe('valor inválido é RECUSADO, nunca coagido', () => {


  const invalidos: Array<[unknown, string]> = [
    ['true', 'string que parece verdadeira'],
    ['false', 'string que parece falsa'],
    [1, 'número 1'],
    [0, 'número 0'],
    [null, 'null explícito'],
    [{}, 'objeto'],
  ];
  it.each(invalidos)('recusa %j (%s)', (valor) => {
    const r: any = criar({ has_kids: valor });
    expect(r.ok).toBe(false);
    expect(r.campo).toBe('has_kids');
    expect(r.erro).toContain('has_kids');
  });

  it('nomeia a flag certa quando há várias', () => {
    const r: any = criar({ has_kids: true, has_online: 'sim' });
    expect(r.ok).toBe(false);
    expect(r.campo).toBe('has_online');
  });
});

describe('presencial_label', () => {
  it('faz trim', () => {
    const r: any = criar({ presencial_label: '  Sede  ' });
    expect(r.patch.presencial_label).toBe('Sede');
  });


  it.each(['', '   '])('recusa em branco (%j)', (valor) => {
    const r: any = criar({ presencial_label: valor });
    expect(r.ok).toBe(false);
    expect(r.campo).toBe('presencial_label');
  });

  it('recusa não-texto', () => {
    const r: any = criar({ presencial_label: 42 });
    expect(r.ok).toBe(false);
    expect(r.campo).toBe('presencial_label');
  });
});

describe('bordas', () => {
  it.each([null, undefined, 'texto', 42])('corpo %j não explode', (body) => {
    const r: any = criar(body);
    expect(r.ok).toBe(true);
    expect(r.patch).toEqual({ has_online_stream: false });
  });

  it('modo inválido é erro de programação, não de payload', () => {
    expect(() => normalizarFlagsTipoCulto({}, { modo: 'zoiado' } as any)).toThrow();
    expect(() => (normalizarFlagsTipoCulto as any)({}, undefined)).toThrow();
  });

  it('o catálogo de flags não muda sem alguém revisar esta régua', () => {
    expect(FLAGS_BOOLEANAS).toEqual(['has_kids', 'has_online', 'has_online_stream']);
    expect(DEFAULT_AO_CRIAR).toEqual({ has_online_stream: false });
  });
});
