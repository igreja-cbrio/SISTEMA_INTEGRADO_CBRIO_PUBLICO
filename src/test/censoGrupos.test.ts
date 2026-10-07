










import { describe, it, expect } from 'vitest';
import { montarPessoasEmGrupoSemCenso, SEM_CATEGORIA } from '../../backend/utils/censoGrupos.js';
import { mensagemConvite } from '../../backend/utils/censoVoluntarios.js';

const LINK = 'https://www.cbrio.org/censo/p/censo-2026';
const grupo = (id: string, over: Record<string, unknown> = {}) =>
  ({ id, nome: `Grupo ${id}`, categoria: 'Mulheres', lider_id: 'lider1', dia_semana: 2, horario: '19:30:00', ...over });
const vinc = (membro_id: string, grupo_id = 'g1', over: Record<string, unknown> = {}) =>
  ({ id: `v-${membro_id}-${grupo_id}`, grupo_id, membro_id, funcao: 'frequentador', ...over });
const membro = (id: string, over: Record<string, unknown> = {}) =>
  ({ id, nome: `Pessoa ${id}`, cpf: null, telefone: '21999990000', telefone_fonte: 'cadastro', ...over });

function monta(over: Record<string, unknown> = {}) {
  return montarPessoasEmGrupoSemCenso({
    vinculos: [vinc('m1')],
    grupos: { g1: grupo('g1') },
    membros: { m1: membro('m1', { cpf: '12345678909' }), lider1: membro('lider1', { nome: 'Líder Um', cpf: '11144477735' }) },
    respostas: [],
    link: LINK,
    titulo: 'Censo 2026',
    nominal: true,
    ...over,
  });
}

describe('"respondeu" é a união membro_id ∪ CPF (a mesma dos voluntários)', () => {
  it('ninguém respondeu ⇒ a pessoa falta, no grupo dela', () => {
    const r = monta();
    expect(r.totais.sem_censo).toBe(1);
    expect(r.grupos[0].pessoas[0].nome).toBe('Pessoa m1');
    expect(r.grupos[0].sem_censo).toBe(1);
  });

  it('respondeu pelo membro_id ⇒ some', () => {
    const r = monta({ respostas: [{ membro_id: 'm1', cpf: null }] });
    expect(r.totais.sem_censo).toBe(0);
    expect(r.totais.responderam).toBe(1);
    expect(r.grupos[0].pessoas).toEqual([]);
  });

  it('⚠️ respondeu SÓ pelo CPF digitado (ainda na fila do cron) ⇒ também some', () => {
    const r = monta({ respostas: [{ membro_id: null, cpf: '123.456.789-09' }] });
    expect(r.totais.sem_censo, 'cobrar censo de quem respondeu no domingo queima quem liga').toBe(0);
  });

  it('CPF de outra pessoa não conta', () => {
    const r = monta({ respostas: [{ membro_id: 'm9', cpf: '11144477735' }] });
    expect(r.totais.sem_censo).toBe(1);
  });
});

describe('a unidade é PESSOA, o agrupamento é por grupo', () => {
  it('quem está em 2 grupos conta 1 vez no total e aparece nos 2, citando o outro', () => {
    const r = monta({
      vinculos: [vinc('m1', 'g1'), vinc('m1', 'g2')],
      grupos: { g1: grupo('g1'), g2: grupo('g2', { nome: 'Grupo dois' }) },
    });
    expect(r.totais.pessoas).toBe(1);
    expect(r.totais.sem_censo).toBe(1);
    expect(r.grupos).toHaveLength(2);
    expect(r.grupos.map((g) => g.sem_censo)).toEqual([1, 1]);

    expect(r.grupos.map((g) => g.nome)).toEqual(['Grupo dois', 'Grupo g1']);
    expect(r.grupos[1].pessoas[0].outros_grupos).toEqual(['Grupo dois']);
    expect(r.grupos[0].pessoas[0].outros_grupos).toEqual(['Grupo g1']);
  });

  it('vínculo duplicado no MESMO grupo não vira duas pessoas', () => {
    const r = monta({ vinculos: [vinc('m1'), { ...vinc('m1'), id: 'outro' }] });
    expect(r.grupos[0].total).toBe(1);
    expect(r.grupos[0].pessoas).toHaveLength(1);
  });

  it('o papel no roster sai escrito (líder do roster é PESSOA, não "o líder")', () => {
    const r = monta({ vinculos: [vinc('m1', 'g1', { funcao: 'lider_treinamento' })] });
    expect(r.grupos[0].pessoas[0].papel).toBe('líder em treinamento');
    expect(r.grupos[0].lider.membro_id).toBe('lider1');
  });

  it('grupos saem em ordem alfabética e pessoas também', () => {
    const r = monta({
      vinculos: [vinc('m1', 'gb'), vinc('m2', 'gb'), vinc('m3', 'ga')],
      grupos: { gb: grupo('gb', { nome: 'Zebra' }), ga: grupo('ga', { nome: 'Alfa' }) },
      membros: { m1: membro('m1', { nome: 'Zé' }), m2: membro('m2', { nome: 'Ana' }), m3: membro('m3'), lider1: membro('lider1') },
    });
    expect(r.grupos.map((g) => g.nome)).toEqual(['Alfa', 'Zebra']);
    expect(r.grupos[1].pessoas.map((p) => p.nome)).toEqual(['Ana', 'Zé']);
  });

  it('categorias contam grupos e vínculos, com "Sem categoria" por último', () => {
    const r = monta({
      vinculos: [vinc('m1', 'g1'), vinc('m2', 'g2')],
      grupos: { g1: grupo('g1', { categoria: null }), g2: grupo('g2', { categoria: 'Casais' }) },
      membros: { m1: membro('m1'), m2: membro('m2'), lider1: membro('lider1') },
    });
    expect(r.categorias.map((c) => c.categoria)).toEqual(['Casais', SEM_CATEGORIA]);
    expect(r.categorias[1]).toMatchObject({ grupos: 1, total: 1, sem_censo: 1 });
  });
});

describe('o líder ao lado do grupo', () => {
  it('líder que também não respondeu é marcado, e conta nos totais', () => {
    const r = monta();
    expect(r.grupos[0].lider).toMatchObject({ nome: 'Líder Um', sem_censo: true, telefone: '21999990000' });
    expect(r.totais.lideres_sem_censo).toBe(1);
  });

  it('líder que respondeu pelo CPF não é marcado', () => {
    const r = monta({ respostas: [{ membro_id: null, cpf: '11144477735' }] });
    expect(r.grupos[0].lider.sem_censo).toBe(false);
    expect(r.totais.lideres_sem_censo).toBe(0);
  });

  it('⚠️ sem líder (ou líder apagado) o campo é null — "não sei" nunca vira "não respondeu"', () => {
    const semLider = monta({ grupos: { g1: grupo('g1', { lider_id: null }) } });
    expect(semLider.grupos[0].lider).toMatchObject({ membro_id: null, nome: null, sem_censo: null });
    const apagado = monta({ membros: { m1: membro('m1') } });
    expect(apagado.grupos[0].lider).toMatchObject({ membro_id: 'lider1', nome: null, sem_censo: null });
    expect(apagado.totais.lideres_sem_censo).toBe(0);
    expect(apagado.lideres_sem_censo).toEqual([]);
  });

  it('QUEM SÃO: a lista nomeia o líder, com telefone, os grupos dele e a mensagem citando o grupo', () => {
    const r = monta();
    expect(r.lideres_sem_censo).toHaveLength(1);
    expect(r.lideres_sem_censo[0]).toMatchObject({
      membro_id: 'lider1', nome: 'Líder Um', telefone: '21999990000', telefone_fonte: 'cadastro', grupos: ['Grupo g1'],
    });
    expect(r.lideres_sem_censo[0].mensagem).toBe(mensagemConvite({
      nome: 'Líder Um', link: LINK, titulo: 'Censo 2026', papel: 'como líder do grupo Grupo g1',
    }));
  });

  it('⚠️ o mesmo líder em 2 grupos é UMA pessoa: 1 linha com os 2 grupos, e conta 1 no total', () => {
    const r = monta({
      vinculos: [vinc('m1', 'g1'), vinc('m1', 'g2')],
      grupos: { g1: grupo('g1'), g2: grupo('g2') },
    });
    expect(r.grupos.filter((g) => g.lider.sem_censo === true)).toHaveLength(2);
    expect(r.totais.lideres_sem_censo).toBe(1);
    expect(r.lideres_sem_censo).toHaveLength(1);
    expect(r.lideres_sem_censo[0].grupos).toEqual(['Grupo g1', 'Grupo g2']);
    expect(r.lideres_sem_censo[0].mensagem).toContain('como líder dos grupos Grupo g1 e Grupo g2');
  });

  it('líder que respondeu não entra na lista', () => {
    const r = monta({ respostas: [{ membro_id: 'lider1', cpf: null }] });
    expect(r.lideres_sem_censo).toEqual([]);
  });

  it('o líder que está no próprio roster é contado como pessoa do grupo também', () => {
    const r = monta({ vinculos: [vinc('m1'), vinc('lider1', 'g1', { funcao: 'lider' })] });
    expect(r.grupos[0].total).toBe(2);
    expect(r.grupos[0].pessoas.find((p) => p.membro_id === 'lider1')?.papel).toBe('líder');
  });
});

describe('o que fica de fora é DECLARADO', () => {
  it('vínculo em grupo inativo/apagado não cobra ninguém, e é contado', () => {
    const r = monta({ vinculos: [vinc('m1', 'g-inativo')] });
    expect(r.totais.sem_censo).toBe(0);
    expect(r.grupos).toEqual([]);
    expect(r.totais.vinculos_grupo_inativo).toBe(1);
  });

  it('vínculo com cadastro apagado não cobra ninguém, e é contado', () => {
    const r = monta({ vinculos: [vinc('m-apagado')] });
    expect(r.totais.sem_censo).toBe(0);
    expect(r.totais.vinculos_sem_cadastro).toBe(1);
  });

  it('sem telefone alcançável a pessoa continua na lista, sem número, e é contada', () => {
    const r = monta({ membros: { m1: membro('m1', { telefone: null, telefone_fonte: null }), lider1: membro('lider1') } });
    expect(r.grupos[0].pessoas[0].telefone).toBeNull();
    expect(r.totais.sem_telefone).toBe(1);
  });

  it('grupo com todo mundo respondido continua na lista com sem_censo 0 (é o filtro da tela que esconde)', () => {
    const r = monta({ respostas: [{ membro_id: 'm1', cpf: null }] });
    expect(r.grupos[0]).toMatchObject({ total: 1, sem_censo: 0 });
    expect(r.totais.grupos_com_faltante).toBe(0);
  });
});

describe('a mensagem', () => {
  it('cita o grupo e leva o link genérico da pesquisa', () => {
    const r = monta();
    const m = r.grupos[0].pessoas[0].mensagem!;
    expect(m).toContain('como parte do grupo Grupo g1');
    expect(m).toContain(LINK);
    expect(m).not.toContain('?censo=1');
    expect(m).not.toContain('voluntário');
  });

  it('sem link não há mensagem', () => {
    const r = monta({ link: null });
    expect(r.grupos[0].pessoas[0].mensagem).toBeNull();
  });

  it('mensagemConvite sem papel continua a dos voluntários (não mudou o texto de quem já usa)', () => {
    expect(mensagemConvite({ nome: 'Ana', link: LINK })).toContain('como voluntário(a)');
  });
});

describe('nível 2 (nominal=false) nunca recebe dado pessoal', () => {
  it('contagens e nome do líder saem; pessoas e telefone do líder não', () => {
    const r = monta({ nominal: false });
    expect(r.nominal).toBe(false);
    expect(r.grupos[0].sem_censo).toBe(1);
    expect(r.grupos[0].pessoas).toEqual([]);
    expect(r.grupos[0].lider.nome).toBe('Líder Um');
    expect(r.grupos[0].lider.telefone).toBeNull();

    expect(r.lideres_sem_censo[0]).toMatchObject({ nome: 'Líder Um', telefone: null, telefone_fonte: null, mensagem: null, grupos: ['Grupo g1'] });
    expect(JSON.stringify(r)).not.toContain('21999990000');
  });
});
