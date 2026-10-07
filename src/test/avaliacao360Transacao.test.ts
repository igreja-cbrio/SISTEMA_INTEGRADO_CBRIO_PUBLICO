// @vitest-environment node

import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const employee = uid(1), cycle = uid(2), invite = uid(3), competence = uid(4), question = uid(8);
let db: PGlite;

const notes = () => [{ pergunta_id: question, nota: 4, comentario: 'Feedback sintético.' }];
const submit = (payload: unknown = notes(), owner = employee) => db.query(
  'select fn_aval360_responder($1, $2, $3::jsonb) as resultado', [invite, owner, JSON.stringify(payload)],
);
const form = () => db.query<{ resultado: { perguntas: { id: string }[] } }>(
  'select fn_aval360_formulario($1, $2) as resultado', [invite, employee],
);
const counts = async () => (await db.query(`select
  (select count(*)::int from rh_aval360_resposta) respostas,
  (select count(*)::int from rh_aval360_nota) notas,
  (select count(*)::int from rh_aval360_convite where respondido_em is not null) carimbos`)).rows[0];

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table rh_funcionarios(id uuid primary key, nome text, email text, cargo text, area text,
      gestor_id uuid references rh_funcionarios(id), status text default 'ativo', deleted_at timestamptz);`);
  const foundation = readFileSync(resolve(root, 'supabase/migrations/20260916120000_avaliacao_360.sql'), 'utf8');

  await db.exec(foundation.slice(foundation.indexOf('CREATE TABLE IF NOT EXISTS public.rh_aval360_ciclo ('),
    foundation.indexOf('ALTER TABLE public.rh_aval360_ciclo')));
  await db.exec(readFileSync(resolve(root, 'supabase/migrations/20260926160000_avaliacao360_resposta_atomica.sql'), 'utf8'));

  for (const m of ['20260928150000_avaliacao360_ciclo.sql', '20260929120000_avaliacao360_resultados.sql',
    '20260929150000_avaliacao360_calibragem.sql', '20260929180000_avaliacao360_grupo.sql', '20261001120000_avaliacao360_perguntas.sql']) {
    await db.exec(readFileSync(resolve(root, 'supabase/migrations', m), 'utf8'));
  }
}, 30000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec(`truncate rh_funcionarios, rh_aval360_ciclo, rh_aval360_competencia cascade;
    insert into rh_funcionarios(id,nome,area) values('${employee}','Pessoa sintética','Gestão');
    insert into rh_aval360_ciclo(id,nome,periodo_inicio,periodo_fim,status,coleta_ate)
      values('${cycle}','Ciclo sintético',(now() at time zone 'America/Sao_Paulo')::date,(now() at time zone 'America/Sao_Paulo')::date,'coleta',(now() at time zone 'America/Sao_Paulo')::date + 1);
    insert into rh_aval360_competencia(id,codigo,nome) values('${competence}','teste','Competência sintética');
    insert into rh_aval360_ciclo_competencia(ciclo_id,competencia_id) values('${cycle}','${competence}');
    insert into rh_aval360_pergunta(id,ciclo_id,competencia_id,texto) values('${question}','${cycle}','${competence}','Pergunta sintética');
    insert into rh_aval360_convite(id,ciclo_id,avaliado_id,avaliador_id,papel)
      values('${invite}','${cycle}','${employee}','${employee}','auto');`);
});

describe('avaliação 360 executada no PostgreSQL local', () => {
  it('salva todas as partes e rejeita uma segunda submissão', async () => {
    await submit();
    expect(await counts()).toEqual({ respostas: 1, notas: 1, carimbos: 1 });
    await expect(submit()).rejects.toMatchObject({ code: 'P0409' });
    expect(await counts()).toEqual({ respostas: 1, notas: 1, carimbos: 1 });
  });
  it.each(['rh_aval360_nota', 'rh_aval360_convite'])('reverte tudo se %s falhar e permite nova tentativa', async (table) => {
    await db.exec(`create function falha_teste() returns trigger language plpgsql as $$ begin raise exception 'falha injetada'; end $$;
      create trigger falha before ${table.endsWith('nota') ? 'insert' : 'update'} on ${table} for each row execute function falha_teste();`);
    try {
      await expect(submit()).rejects.toThrow('falha injetada');
      expect(await counts()).toEqual({ respostas: 0, notas: 0, carimbos: 0 });
    } finally { await db.exec(`drop trigger falha on ${table}; drop function falha_teste();`); }
    await submit();
    expect(await counts()).toEqual({ respostas: 1, notas: 1, carimbos: 1 });
  });
  it.each([
    null, {}, [], [{ pergunta_id: uid(999), nota: 4 }], [...notes(), ...notes()],
    [{ pergunta_id: question, nota: '4' }], [{ pergunta_id: question, nota: true }],
    [{ pergunta_id: question, nota: 0 }], [{ pergunta_id: question, nota: 6 }],
    [{ pergunta_id: question, nota: 2.5 }], [{ pergunta_id: question, nota: 4, comentario: {} }],
    [{ pergunta_id: question, nota: 4, comentario: 'x'.repeat(5001) }],
  ])('recusa payload inválido sem deixar resposta parcial: %#', async (payload) => {
    await expect(submit(payload)).rejects.toMatchObject({ code: 'P0400' });
    expect(await counts()).toEqual({ respostas: 0, notas: 0, carimbos: 0 });
  });
  it('recusa conjunto incompleto', async () => {
    await db.exec(`insert into rh_aval360_pergunta(ciclo_id,competencia_id,texto) values('${cycle}','${competence}','Outra pergunta');`);
    await expect(submit()).rejects.toMatchObject({ code: 'P0400' });
  });
  it('recusa convite de outra pessoa antes de revelar formulário', async () => {
    await expect(submit(notes(), uid(999))).rejects.toMatchObject({ code: 'P0403' });
    await expect(db.query('select fn_aval360_formulario($1,$2)', [invite, uid(999)])).rejects.toMatchObject({ code: 'P0403' });
  });
  it.each([
    "update rh_aval360_convite set suprimido_em=now()",
    "update rh_aval360_convite set deleted_at=now()",
    "update rh_aval360_ciclo set deleted_at=now()",
    "update rh_aval360_ciclo set status='apuracao'",
    "update rh_aval360_ciclo set coleta_ate=(now() at time zone 'America/Sao_Paulo')::date-2",
  ])('recusa convites indisponíveis: %s', async (sql) => {
    await db.exec(sql);
    await expect(submit()).rejects.toMatchObject({ code: expect.stringMatching(/^P040[39]$/) });
    await expect(form()).rejects.toMatchObject({ code: expect.stringMatching(/^P040[39]$/) });
  });
  it('aceita o último dia da coleta no fuso de São Paulo', async () => {
    await db.exec("update rh_aval360_ciclo set coleta_ate=(now() at time zone 'America/Sao_Paulo')::date");
    await submit();
  });
  it.each([

    "update rh_aval360_competencia set deleted_at=now()",
    "update rh_aval360_pergunta set deleted_at=now()",
    "update rh_aval360_competencia set aplica_a='area', area='Outra área'",
    "update rh_aval360_competencia set aplica_a='gestores'",
  ])('formulário e resposta aplicam a mesma exclusão: %s', async (sql) => {
    await db.exec(sql);
    expect((await form()).rows[0].resultado.perguntas).toEqual([]);
    await expect(submit()).rejects.toMatchObject({ code: 'P0400' });
  });
  it('inclui competência da área e competência de gestor elegível', async () => {
    await db.exec("update rh_aval360_competencia set aplica_a='area', area='Gestão'");
    expect((await form()).rows[0].resultado.perguntas).toHaveLength(1);
    await db.exec(`update rh_aval360_competencia set aplica_a='gestores';
      insert into rh_funcionarios(id,nome,gestor_id) values('${uid(6)}','Liderado sintético','${employee}');`);
    expect((await form()).rows[0].resultado.perguntas).toHaveLength(1);
    await submit();
  });
  it('par não aprovado ou abaixo do piso não coleta', async () => {
    await db.exec(`insert into rh_funcionarios(id,nome) values('${uid(6)}','Outra pessoa');
      update rh_aval360_convite set papel='par',avaliado_id='${uid(6)}';`);
    await expect(form()).rejects.toMatchObject({ code: 'P0409' });
    await db.exec('update rh_aval360_convite set aprovado_em=now()');
    await expect(submit()).rejects.toMatchObject({ code: 'P0409' });
  });
  it('nega execução direta aos clientes e permite somente service_role', async () => {
    for (const fn of ['fn_aval360_formulario(uuid,uuid)', 'fn_aval360_responder(uuid,uuid,jsonb)',
      'fn_aval360_hierarquia()', 'fn_aval360_sugerir_avaliadores(uuid)',
      'fn_aval360_editar_avaliador(uuid,uuid,uuid,text,boolean)', 'fn_aval360_mudar_status(uuid,text)',
      'fn_aval360_salvar_perguntas(uuid,jsonb)', 'fn_aval360_definir_avaliadores(uuid,uuid,jsonb)',
      'fn_aval360_remover_avaliado(uuid,uuid)', 'fn_aval360_incluir_padrao(uuid,uuid[])']) {
      const r = await db.query(`select has_function_privilege('anon',$1,'execute') anon,
        has_function_privilege('authenticated',$1,'execute') autenticado,
        has_function_privilege('service_role',$1,'execute') backend`, [fn]);
      expect(r.rows[0]).toEqual({ anon: false, autenticado: false, backend: true });
    }
  });



  it('comentário obrigatório quando o ciclo exige (01/10)', async () => {
    await db.exec(`update rh_aval360_ciclo set config = '{"exigir_comentario_auto": true}'`);
    expect((await form()).rows[0].resultado).toMatchObject({ comentario_obrigatorio: true });
    await expect(submit([{ pergunta_id: question, nota: 4 }])).rejects.toThrow(/comentário é obrigatório/);
    await expect(submit([{ pergunta_id: question, nota: 4, comentario: '  ' }])).rejects.toMatchObject({ code: 'P0400' });
    await submit();
  });
  it('exigir dos avaliadores não vale para a autoavaliação', async () => {
    await db.exec(`update rh_aval360_ciclo set config = '{"exigir_comentario_avaliadores": true}'`);
    await submit([{ pergunta_id: question, nota: 4 }]);
  });
});
