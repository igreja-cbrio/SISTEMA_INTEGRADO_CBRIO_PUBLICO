import { describe, it, expect } from 'vitest';
import {
  CATEGORIAS_GRUPO, normalizarCategoria, normalizarHorario, validarEdicaoGrupoApp,
} from '../../backend/utils/grupoEdicaoApp.js';







describe('categoria · é REGRA DE NEGÓCIO, não rótulo', () => {
  it('normaliza caixa e acento pro valor canônico', () => {



    expect(normalizarCategoria('casais')).toBe('Casais');
    expect(normalizarCategoria('  CASAIS ')).toBe('Casais');
    expect(normalizarCategoria('CONEXÃO')).toBe('Conexao');
    expect(normalizarCategoria('conexao')).toBe('Conexao');
    expect(normalizarCategoria('jornada 180')).toBe('Jornada 180');
  });

  it('recusa o que não está na lista fechada', () => {
    expect(normalizarCategoria('Casal')).toBeNull();
    expect(normalizarCategoria('Homens e Mulheres')).toBeNull();
    expect(normalizarCategoria('qualquer coisa')).toBeNull();
  });

  it('categoria inválida vira ERRO com a lista na mensagem', () => {
    const { erros, valores } = validarEdicaoGrupoApp({ categoria: 'Casal' });
    expect(erros.categoria).toContain('Casais');
    expect('categoria' in valores).toBe(false);
  });

  it('categoria vazia LIMPA o campo (edição legítima)', () => {
    expect(validarEdicaoGrupoApp({ categoria: '' }).valores.categoria).toBeNull();
  });

  it('as categorias de produção medidas em 06/08 todas passam', () => {

    for (const c of ['Misto', 'Mulheres', 'Casais', 'Jovens', 'Homens', 'Estudo']) {
      expect(normalizarCategoria(c)).toBe(c);
      expect(CATEGORIAS_GRUPO).toContain(c);
    }
  });
});

describe('horário · a coluna é `time` e a tela manda texto livre', () => {
  it('aceita os formatos que a pessoa digita', () => {
    expect(normalizarHorario('19:30')).toBe('19:30');
    expect(normalizarHorario('1930')).toBe('19:30');
    expect(normalizarHorario('19h30')).toBe('19:30');
    expect(normalizarHorario('19:30:00')).toBe('19:30');
    expect(normalizarHorario('9:5')).toBe('09:05');
    expect(normalizarHorario('20')).toBe('20:00');
    expect(normalizarHorario('930')).toBe('09:30');
  });

  it('recusa o que não é hora, em vez de deixar o Postgres estourar', () => {


    expect(normalizarHorario('à noite')).toBeNull();
    expect(normalizarHorario('25:00')).toBeNull();
    expect(normalizarHorario('19:75')).toBeNull();
    expect(normalizarHorario('99999')).toBeNull();
  });

  it('horário vazio limpa o campo; horário inválido é ERRO', () => {
    expect(validarEdicaoGrupoApp({ horario: '' }).valores.horario).toBeNull();
    expect(validarEdicaoGrupoApp({ horario: 'à noite' }).erros.horario).toBeTruthy();
  });
});

describe('dia_semana · domingo é 0, e 0 é falsy', () => {
  it('⚠️ domingo (0) é PRESERVADO', () => {


    const { erros, valores } = validarEdicaoGrupoApp({ dia_semana: 0 });
    expect(erros).toEqual({});
    expect(valores.dia_semana).toBe(0);
  });

  it('aceita 0..6 e recusa fora da faixa', () => {
    for (let d = 0; d <= 6; d += 1) {
      expect(validarEdicaoGrupoApp({ dia_semana: d }).valores.dia_semana).toBe(d);
    }
    expect(validarEdicaoGrupoApp({ dia_semana: 7 }).erros.dia_semana).toBeTruthy();
    expect(validarEdicaoGrupoApp({ dia_semana: -1 }).erros.dia_semana).toBeTruthy();
    expect(validarEdicaoGrupoApp({ dia_semana: 2.5 }).erros.dia_semana).toBeTruthy();
  });

  it('null/vazio = grupo sem dia fixo (diário)', () => {
    expect(validarEdicaoGrupoApp({ dia_semana: null }).valores.dia_semana).toBeNull();
    expect(validarEdicaoGrupoApp({ dia_semana: '' }).valores.dia_semana).toBeNull();
  });
});

describe('semântica de PATCH · é o que separa este endpoint do PUT do web', () => {
  it('só devolve o que VEIO no body', () => {



    const { valores } = validarEdicaoGrupoApp({ nome: 'GC Barra' });
    expect(Object.keys(valores)).toEqual(['nome']);
  });

  it('NUNCA aceita campo fora da allowlist', () => {
    const { valores } = validarEdicaoGrupoApp({
      nome: 'GC Barra',
      lider_id: 'outra-pessoa', ativo: false, temporada: 'T1-2020',
      supervisor_id: 'x', aceitando_inscricoes: false, modo_inscricao: 'fechado',
      lat: 0, lng: 0, foto_url: 'http://x', codigo: 'XPTO', capacidade: 999,
    });
    expect(valores).toEqual({ nome: 'GC Barra' });
  });

  it('nome vazio é ERRO (a coluna é NOT NULL)', () => {

    expect(validarEdicaoGrupoApp({ nome: '   ' }).erros.nome).toBeTruthy();
    expect(validarEdicaoGrupoApp({ nome: null }).erros.nome).toBeTruthy();
  });

  it('texto é trimado e espaço colapsado; vazio vira null', () => {
    const { valores } = validarEdicaoGrupoApp({
      tema: '  Romanos   8 ', local: '', endereco: ' Rua A,  10 ',
    });
    expect(valores.tema).toBe('Romanos 8');
    expect(valores.local).toBeNull();
    expect(valores.endereco).toBe('Rua A, 10');
  });

  it('avisa quando o ENDEREÇO mudou (o pino do mapa fica velho)', () => {


    expect(validarEdicaoGrupoApp({ endereco: 'Rua Nova, 1' }).mudouEndereco).toBe(true);
    expect(validarEdicaoGrupoApp({ bairro: 'Recreio' }).mudouEndereco).toBe(true);
    expect(validarEdicaoGrupoApp({ tema: 'Romanos' }).mudouEndereco).toBe(false);
  });

  it('body vazio não gera nada (o endpoint responde "nada para atualizar")', () => {
    const r = validarEdicaoGrupoApp({});
    expect(r.valores).toEqual({});
    expect(r.erros).toEqual({});
  });

  it('NUNCA lança — body null/undefined/tipo estranho', () => {
    expect(() => validarEdicaoGrupoApp(undefined)).not.toThrow();
    expect(() => validarEdicaoGrupoApp(null)).not.toThrow();
    expect(() => validarEdicaoGrupoApp({ horario: { h: 19 } })).not.toThrow();
  });
});
