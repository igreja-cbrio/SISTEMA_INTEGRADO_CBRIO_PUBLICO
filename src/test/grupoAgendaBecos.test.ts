import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';



















const semComentarios = (fonte: string) =>
  fonte
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/(^|[^:])\/\/[^\n]*/, '$1'))
    .join('\n');

const ler = (p: string) => semComentarios(readFileSync(p, 'utf8'));

const SERVICO = ler('backend/services/grupoAgendaExcecao.js');
const APP = ler('backend/routes/app.js');
const GRUPOS = ler('backend/routes/grupos.js');

describe('beco 1 · "não aconteceu" com chamada é ação de dois passos', () => {
  it('o serviço recebe a confirmação e só apaga com ela', () => {
    expect(SERVICO).toContain('confirmarApagarChamada = false');

    expect(SERVICO).toContain("codigo: 'tem_chamada'");


    expect(SERVICO).toContain('apagarEncontroGrupo(encontroNaData.id)');
  });



  it('as duas portas exigem o booleano `true`, nada de truthy', () => {
    for (const rota of [APP, GRUPOS]) {
      expect(rota).toContain('confirmarApagarChamada: confirmar_apagar_chamada === true');
    }
  });

  it('o 409 leva quantas presenças se perdem, pra a pergunta ser concreta', () => {
    expect(SERVICO).toContain('presentes');
    for (const rota of [APP, GRUPOS]) {
      expect(rota).toContain('corpo.presentes = r.presentes');
    }
  });





  it('apaga a chamada ANTES de escrever a exceção', () => {
    const iApagar = SERVICO.indexOf('apagarEncontroGrupo(encontroNaData.id)');
    const iGravar = SERVICO.indexOf('mem_grupo_agenda_excecoes');
    const iUpsert = SERVICO.lastIndexOf('upsert');
    expect(iApagar).toBeGreaterThan(0);
    expect(iApagar).toBeLessThan(Math.max(iGravar, iUpsert));
  });
});

describe('beco 2 · a data ocupada some da janela antes de alguém escolher', () => {
  it('o serviço passa as datas com chamada para a régua', () => {
    expect(SERVICO).toContain('datasComChamada(grupoId, dataOriginal)');
    expect(SERVICO).toContain('ocupadas:');

    expect(SERVICO).toContain("codigo: 'data_ocupada'");
  });

  it('o app manda as bloqueadas para a tela apagar do calendário', () => {
    expect(APP).toContain('corrigir_bloqueadas');
    expect(APP).toContain('ocupadas:');
  });
});

describe('beco 3 · as recusas que sobraram dizem o CAMINHO', () => {
  it('corrigir para o futuro aponta a agenda, não uma tela genérica', () => {
    expect(SERVICO).toContain("codigo: 'correcao_no_futuro'");
    expect(SERVICO).toMatch(/n[ãa]o aconteceu/i);
  });

  it('janela sem data livre manda marcar "não aconteceu"', () => {
    expect(SERVICO).toMatch(/Não sobra nenhuma data livre/);
  });
});
