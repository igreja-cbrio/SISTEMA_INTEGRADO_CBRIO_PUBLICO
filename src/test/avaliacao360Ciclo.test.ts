// @vitest-environment node

import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const topo = uid(1), gestor = uid(2), [a, b, c, d] = [uid(3), uid(4), uid(5), uid(6)], x = uid(7), inativo = uid(8);
const ciclo = uid(20), comp = uid(30);
let db: PGlite;

type Convite = { avaliado_id: string; avaliador_id: string; papel: string; origem: string;
  aprovado_em: string | null; suprimido_motivo: string | null };
const convites = async (onde = 'true') => (await db.query<Convite>(
  `select avaliado_id, avaliador_id, papel, origem, aprovado_em, suprimido_motivo
   from rh_aval360_convite where ${onde} order by papel, avaliado_id, avaliador_id`)).rows;
const ativos = (lista: Convite[]) => lista.filter((l) => !l.suprimido_motivo);
const sugerir = () => db.query<{ r: { gravados: number; obsoletos: number; fora_do_grupo?: number } }>(
  'select fn_aval360_sugerir_avaliadores($1) r', [ciclo]).then((q) => q.rows[0].r);
const editar = (avaliado: string, avaliador: string, papel: string, incluir: boolean) => db.query(
  'select fn_aval360_editar_avaliador($1, $2, $3, $4, $5) r', [ciclo, avaliado, avaliador, papel, incluir]);
const mudar = (para: string) => db.query<{ r: { suprimidos_abaixo_do_piso: number } }>(
  'select fn_aval360_mudar_status($1, $2) r', [ciclo, para]).then((q) => q.rows[0].r);
const status = async () => (await db.query<{ status: string }>(
  'select status from rh_aval360_ciclo where id = $1', [ciclo])).rows[0].status;

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
  await db.exec(`truncate rh_funcionarios, rh_aval360_ciclo cascade;
    delete from rh_aval360_competencia where codigo = 'teste';
    insert into rh_funcionarios(id, nome) values ('${topo}', 'Topo');
    insert into rh_funcionarios(id, nome, gestor_id) values ('${gestor}', 'Gestor', '${topo}');
    ${[a, b, c, d].map((p, i) => `insert into rh_funcionarios(id, nome, gestor_id) values ('${p}', 'P${i}', '${gestor}');`).join('\n')}
    insert into rh_funcionarios(id, nome, gestor_id) values ('${x}', 'X', '${a}');
    insert into rh_funcionarios(id, nome, gestor_id, status) values ('${inativo}', 'Inativo', '${gestor}', 'inativo');
    insert into rh_aval360_ciclo(id, nome, periodo_inicio, periodo_fim, status, coleta_ate, escala_max)
      values ('${ciclo}', 'Ciclo sintético', (now() at time zone 'America/Sao_Paulo')::date, (now() at time zone 'America/Sao_Paulo')::date, 'rascunho', (now() at time zone 'America/Sao_Paulo')::date + 5, 6);
    insert into rh_aval360_competencia(id, codigo, nome) values ('${comp}', 'teste', 'Critério sintético');
    insert into rh_aval360_ciclo_competencia(ciclo_id, competencia_id) values ('${ciclo}', '${comp}');
    insert into rh_aval360_pergunta(ciclo_id, competencia_id, texto) values ('${ciclo}', '${comp}', 'Pergunta sintética');`);
});

describe('schema do ciclo', () => {
  it('nasce com os pesos do Feedz 2026 e recusa soma diferente de 1', async () => {
    const { rows } = await db.query<{ a: string; g: string; o: string }>(
      'select peso_auto a, peso_gestor g, peso_outros o from rh_aval360_ciclo where id = $1', [ciclo]);
    expect(rows[0]).toEqual({ a: '0.150', g: '0.700', o: '0.150' });
    await expect(db.query('update rh_aval360_ciclo set peso_gestor = 0.8 where id = $1', [ciclo]))
      .rejects.toThrow(/pesos_ck/);
  });
  it('rótulos da escala: um por ponto, ou nenhum', async () => {
    await db.query(`update rh_aval360_ciclo set escala_max = 3, escala_rotulos = '["Nunca","Às vezes","Sempre"]' where id = $1`, [ciclo]);
    await expect(db.query(`update rh_aval360_ciclo set escala_max = 4 where id = $1`, [ciclo])).rejects.toThrow(/rotulos_ck/);
    await db.query(`update rh_aval360_ciclo set escala_max = 4, escala_rotulos = null where id = $1`, [ciclo]);
  });
  it('semeia os 8 critérios do Feedz nos dois eixos', async () => {
    const { rows } = await db.query<{ eixo: string; n: number }>(
      `select eixo, count(*)::int n from rh_aval360_competencia where codigo like 'fz\\_%' group by eixo order by eixo`);
    expect(rows).toEqual([{ eixo: 'comportamento', n: 4 }, { eixo: 'resultado', n: 4 }]);
  });
  it('a função antiga de geração estrita saiu', async () => {
    const { rows } = await db.query(`select 1 from pg_proc where proname = 'fn_aval360_gerar_convites'`);
    expect(rows).toHaveLength(0);
  });
});

describe('sugestão pela hierarquia', () => {
  it('auto + gestor + liderados + pares do mesmo gestor, sem inativo', async () => {
    const r = await sugerir();
    const todos = await convites();
    const por = (papel: string) => todos.filter((t) => t.papel === papel);
    expect(por('auto')).toHaveLength(7);
    expect(por('gestor').map((t) => [t.avaliado_id, t.avaliador_id]))
      .toEqual(expect.arrayContaining([[gestor, topo], [a, gestor], [x, a]]));
    expect(por('gestor')).toHaveLength(6);

    expect(por('liderado').filter((t) => t.avaliado_id === gestor)).toHaveLength(4);
    expect(por('liderado')).toHaveLength(6);

    expect(por('par')).toHaveLength(12);
    expect(por('par').every((t) => t.aprovado_em !== null)).toBe(true);
    expect(todos.some((t) => t.avaliado_id === inativo || t.avaliador_id === inativo)).toBe(false);
    expect(r).toMatchObject({ ok: true, gravados: 31, obsoletos: 0 });
  });
  it('é idempotente e não ressuscita quem o RH removeu', async () => {
    await sugerir();
    await editar(a, b, 'par', false);
    expect(await sugerir()).toMatchObject({ gravados: 0, obsoletos: 0 });
    const ab = await convites(`avaliado_id = '${a}' and avaliador_id = '${b}'`);
    expect(ab[0].suprimido_motivo).toBe('removido_pelo_rh');
  });
  it('mudança de gestor suprime o automático que perdeu base e cria o novo', async () => {
    await sugerir();
    await db.exec(`update rh_funcionarios set gestor_id = '${topo}' where id = '${d}'`);
    const r = await sugerir();
    expect(r.obsoletos).toBe(2 * 3 + 2);
    const dPar = ativos(await convites(`papel = 'par' and avaliado_id = '${d}'`));
    expect(dPar.map((t) => t.avaliador_id)).toEqual([gestor]);
  });
  it('não toca no que o RH incluiu à mão', async () => {
    await sugerir();
    await editar(x, b, 'par', true);
    await db.exec(`update rh_funcionarios set gestor_id = '${topo}' where id = '${b}'`);
    await sugerir();
    const xb = await convites(`avaliado_id = '${x}' and avaliador_id = '${b}'`);
    expect(xb[0]).toMatchObject({ origem: 'rh', suprimido_motivo: null });
  });
  it('só em rascunho', async () => {
    await db.exec(`update rh_aval360_ciclo set status = 'coleta'`);
    await expect(sugerir()).rejects.toMatchObject({ code: 'P0409' });
  });
});

describe('o RH edita quem avalia quem', () => {
  beforeEach(async () => { await sugerir(); });
  it('inclui par de outro time já aprovado, remove e reinclui', async () => {
    await editar(x, c, 'par', true);
    expect((await convites(`avaliado_id = '${x}' and avaliador_id = '${c}'`))[0])
      .toMatchObject({ origem: 'rh', suprimido_motivo: null });
    expect((await convites(`avaliado_id = '${x}' and avaliador_id = '${c}'`))[0].aprovado_em).not.toBeNull();
    await editar(x, c, 'par', false);
    expect((await convites(`avaliado_id = '${x}' and avaliador_id = '${c}'`))[0].suprimido_motivo).toBe('removido_pelo_rh');
    await editar(x, c, 'par', true);
    expect((await convites(`avaliado_id = '${x}' and avaliador_id = '${c}'`))[0].suprimido_motivo).toBeNull();
  });
  it('uma pessoa avalia outra em um papel só', async () => {
    await expect(editar(a, gestor, 'par', true)).rejects.toThrow(/já avalia como gestor/);
  });
  it.each([
    ['auto de outra pessoa', () => editar(a, b, 'auto', true), 'P0400'],
    ['par consigo mesmo', () => editar(a, a, 'par', true), 'P0400'],
    ['papel inventado', () => editar(a, b, 'chefe', true), 'P0400'],
    ['avaliador inativo', () => editar(a, inativo, 'par', true), 'P0400'],
    ['remover quem não está', () => editar(x, d, 'par', false), 'P0409'],
  ])('recusa %s', async (_n, acao, code) => {
    await expect(acao()).rejects.toMatchObject({ code });
  });
  it('só em rascunho', async () => {
    await db.exec(`update rh_aval360_ciclo set status = 'coleta'`);
    await expect(editar(x, c, 'par', true)).rejects.toMatchObject({ code: 'P0409' });
  });
});

describe('enviar e fases', () => {
  it('anda numa via só e recusa pular ou voltar', async () => {
    await sugerir();
    await expect(mudar('apuracao')).rejects.toMatchObject({ code: 'P0409' });
    await expect(mudar('indicacao')).rejects.toMatchObject({ code: 'P0409' });
    await mudar('coleta');
    await expect(mudar('rascunho')).rejects.toMatchObject({ code: 'P0409' });
    await mudar('apuracao');
    await mudar('publicado');
    await mudar('encerrado');
    expect(await status()).toBe('encerrado');
  });
  it('ao enviar, par/liderado abaixo do piso sai com motivo; o resto abre', async () => {
    await sugerir();
    const r = await mudar('coleta');

    expect(r.suprimidos_abaixo_do_piso).toBe(2);
    const liderados = await convites(`papel = 'liderado'`);
    expect(liderados.filter((l) => l.suprimido_motivo === 'abaixo_do_piso')).toHaveLength(2);
    expect(ativos(liderados).every((l) => l.avaliado_id === gestor)).toBe(true);

    const { rows } = await db.query<{ id: string }>(
      `select id from rh_aval360_convite where papel = 'par' and avaliado_id = $1 and avaliador_id = $2`, [a, b]);
    const f = await db.query<{ r: { convite: { papel: string }; escala_max: number } }>(
      'select fn_aval360_formulario($1, $2) r', [rows[0].id, b]);
    expect(f.rows[0].r).toMatchObject({ convite: { papel: 'par' }, escala_max: 6 });
  });
  it('não envia sem critérios, sem prazo válido ou sem avaliadores', async () => {
    await expect(mudar('coleta')).rejects.toThrow(/lista de avaliadores/);
    await sugerir();
    await db.exec(`update rh_aval360_ciclo set coleta_ate = (now() at time zone 'America/Sao_Paulo')::date - 1`);
    await expect(mudar('coleta')).rejects.toThrow(/prazo de respostas/);
    await db.exec(`update rh_aval360_ciclo set coleta_ate = (now() at time zone 'America/Sao_Paulo')::date + 1; delete from rh_aval360_pergunta`);
    await expect(mudar('coleta')).rejects.toThrow(/perguntas/);
  });
  it('o formulário devolve os nomes da escala', async () => {
    await db.exec(`update rh_aval360_ciclo set escala_max = 3, escala_rotulos = '["Nunca","Às vezes","Sempre"]'`);
    await sugerir();
    await mudar('coleta');
    const { rows } = await db.query<{ id: string }>(`select id from rh_aval360_convite where papel = 'auto' and avaliado_id = $1`, [x]);
    const f = await db.query<{ r: { escala_rotulos: string[] } }>('select fn_aval360_formulario($1, $2) r', [rows[0].id, x]);
    expect(f.rows[0].r.escala_rotulos).toEqual(['Nunca', 'Às vezes', 'Sempre']);
  });
});

describe('perguntas do ciclo (critério = etiqueta · 01/10)', () => {
  const salvar = (itens: unknown) => db.query('select fn_aval360_salvar_perguntas($1, $2::jsonb) r', [ciclo, JSON.stringify(itens)]);
  const perguntas = async () => (await db.query<{ texto: string; competencia_id: string; ordem: number }>(
    'select texto, competencia_id, ordem from rh_aval360_pergunta where ciclo_id = $1 and deleted_at is null order by ordem', [ciclo])).rows;
  const criterios = async () => (await db.query<{ competencia_id: string }>(
    'select competencia_id from rh_aval360_ciclo_competencia where ciclo_id = $1 order by ordem', [ciclo])).rows.map((r) => r.competencia_id);
  it('várias perguntas no mesmo critério; os critérios do ciclo seguem as perguntas', async () => {
    const [res, comp2] = (await db.query<{ id: string }>(
      `select id from rh_aval360_competencia where codigo in ('fz_relacionamento','fz_perseveranca') order by ordem`)).rows.map((r) => r.id);
    await salvar([
      { competencia_id: res, texto: 'Ouve os colegas antes de decidir?' },
      { competencia_id: comp2, texto: 'Persiste quando dá errado?', ajuda: 'Pense nos últimos 6 meses' },
      { competencia_id: res, texto: ' Trata bem sob pressão? ' },
    ]);
    expect((await perguntas()).map((q) => q.texto)).toEqual(['Ouve os colegas antes de decidir?', 'Persiste quando dá errado?', 'Trata bem sob pressão?']);
    expect(await criterios()).toEqual([res, comp2]);
  });
  it.each([
    ['vazia', []],
    ['texto curto', [{ competencia_id: comp, texto: 'x' }]],
    ['critério inexistente', [{ competencia_id: uid(99), texto: 'Pergunta válida?' }]],
    ['sem critério', [{ texto: 'Pergunta válida?' }]],
  ])('recusa lista %s', async (_n, itens) => {
    await expect(salvar(itens)).rejects.toMatchObject({ code: 'P0400' });
    expect(await perguntas()).toHaveLength(1);
  });
  it('só antes de enviar', async () => {
    await db.exec(`update rh_aval360_ciclo set status = 'coleta'`);
    await expect(salvar([{ competencia_id: comp, texto: 'Pergunta válida?' }])).rejects.toMatchObject({ code: 'P0409' });
  });
  it('o rascunho do #2955 sai do catálogo (desativado, não apagado)', () => {

    const mig = readFileSync(resolve(root, 'supabase/migrations/20261001120000_avaliacao360_perguntas.sql'), 'utf8');
    expect(mig).toMatch(/UPDATE public\.rh_aval360_competencia SET ativo = false\s+WHERE codigo IN \('combinado'/);
    expect(mig).not.toMatch(/DELETE FROM public\.rh_aval360_competencia/);
  });
});

describe('montagem por pessoa (organograma · 01/10)', () => {
  const definir = (avaliado: string, itens: unknown) => db.query('select fn_aval360_definir_avaliadores($1,$2,$3::jsonb) r', [ciclo, avaliado, JSON.stringify(itens)]);
  const incluir = (ids: string[]) => db.query<{ r: { incluidos: number } }>('select fn_aval360_incluir_padrao($1,$2::uuid[]) r', [ciclo, ids]).then((q) => q.rows[0].r);
  const de = async (avaliado: string) => ativos(await convites(`avaliado_id = '${avaliado}'`)).map((t) => [t.papel, t.avaliador_id, t.origem]);
  it('define o conjunto exato de quem avalia; a autoavaliação vem junto; origem diz se veio da hierarquia', async () => {
    await definir(a, [{ avaliador_id: gestor, papel: 'gestor' }, { avaliador_id: b, papel: 'par' }, { avaliador_id: x, papel: 'par' }]);
    expect(await de(a)).toEqual([['auto', a, 'rh'], ['gestor', gestor, 'automatico'], ['par', b, 'automatico'], ['par', x, 'rh']]);
  });
  it('quem sai vira removido_pelo_rh; trocar o papel de alguém funciona', async () => {
    await definir(a, [{ avaliador_id: gestor, papel: 'gestor' }, { avaliador_id: b, papel: 'par' }]);
    await definir(a, [{ avaliador_id: b, papel: 'liderado' }]);
    expect(await de(a)).toEqual([['auto', a, 'rh'], ['liderado', b, 'rh']]);
    const fora = await convites(`avaliado_id = '${a}' and suprimido_motivo = 'removido_pelo_rh'`);
    expect(fora.map((f) => f.papel).sort()).toEqual(['gestor', 'par']);
  });
  it.each([
    ['a própria pessoa', [{ avaliador_id: a, papel: 'par' }]],
    ['papel auto na lista', [{ avaliador_id: b, papel: 'auto' }]],
    ['repetido em dois papéis', [{ avaliador_id: b, papel: 'par' }, { avaliador_id: b, papel: 'gestor' }]],
    ['inativo', [{ avaliador_id: inativo, papel: 'par' }]],
  ])('recusa %s', async (_n, itens) => {
    await expect(definir(a, itens)).rejects.toMatchObject({ code: 'P0400' });
  });
  it('avaliado inativo: mensagem clara', async () => {
    await expect(definir(inativo, [])).rejects.toThrow(/não está ativa no RH/);
  });
  it('incluir os avaliadores como avaliados usa a hierarquia e não mexe em quem já está', async () => {
    await definir(a, [{ avaliador_id: gestor, papel: 'gestor' }, { avaliador_id: b, papel: 'par' }]);
    const r = await incluir([gestor, b, a]);
    expect(r.incluidos).toBe(2);
    expect((await de(b)).map((t) => t[0]).sort()).toEqual(['auto', 'gestor', 'par', 'par', 'par']);
    expect((await de(a))).toHaveLength(3);
  });
  it('remover tira a pessoa da avaliação, mas ela segue avaliando os outros', async () => {
    await definir(a, [{ avaliador_id: b, papel: 'par' }]);
    await definir(b, [{ avaliador_id: a, papel: 'par' }]);
    const { rows } = await db.query<{ r: { removidos: number } }>('select fn_aval360_remover_avaliado($1,$2) r', [ciclo, a]);
    expect(rows[0].r.removidos).toBe(2);
    expect(await de(a)).toEqual([]);
    expect(await de(b)).toContainEqual(['par', a, 'automatico']);
  });
  it('só antes de enviar', async () => {
    await db.exec(`update rh_aval360_ciclo set status = 'coleta'`);
    await expect(definir(a, [])).rejects.toMatchObject({ code: 'P0409' });
    await expect(incluir([a])).rejects.toMatchObject({ code: 'P0409' });
  });
});

describe('ciclo para um grupo (piloto · 20260929180000)', () => {
  const grupo = (ids: string[] | null) => db.query('update rh_aval360_ciclo set participantes = $1 where id = $2', [ids, ciclo]);
  it('só monta dentro do grupo: o gestor de fora não entra', async () => {
    await grupo([a, b, c]);
    const r = await sugerir();
    const todos = ativos(await convites());
    expect(todos.every((t) => [a, b, c].includes(t.avaliado_id) && [a, b, c].includes(t.avaliador_id))).toBe(true);
    expect(todos.filter((t) => t.papel === 'auto')).toHaveLength(3);
    expect(todos.filter((t) => t.papel === 'par')).toHaveLength(6);
    expect(todos.some((t) => t.papel === 'gestor')).toBe(false);
    expect(r).toMatchObject({ gravados: 9 });
  });
  it('reduzir o grupo suprime como fora_do_grupo; ampliar reativa; remoção do RH não volta', async () => {
    await grupo([a, b, c, d]);
    await sugerir();
    await editar(a, b, 'par', false);
    await grupo([a, b, c]);
    const r = await sugerir();
    expect(r.fora_do_grupo).toBe(7);
    await grupo([a, b, c, d]);
    await sugerir();
    const atv = ativos(await convites());
    expect(atv.filter((t) => t.avaliado_id === d || t.avaliador_id === d)).toHaveLength(7);
    expect((await convites(`avaliado_id = '${a}' and avaliador_id = '${b}'`))[0].suprimido_motivo).toBe('removido_pelo_rh');
  });
  it('grupo vazio é recusado; sem grupo volta a ser a casa inteira', async () => {
    await grupo([]);
    await expect(sugerir()).rejects.toMatchObject({ code: 'P0400' });
    await grupo(null);
    expect((await sugerir()).gravados).toBe(31);
  });
});

describe('critério no ciclo: peso e visibilidade (01/10)', () => {
  const cfg = (peso: number | null, visivel: boolean | null, competencia = comp) =>
    db.query('select fn_aval360_config_criterio($1,$2,$3,$4) r', [ciclo, competencia, peso, visivel]);
  const linha = async () => (await db.query<{ peso: string; visivel: boolean }>(
    'select peso, visivel from rh_aval360_ciclo_competencia where ciclo_id = $1 and competencia_id = $2', [ciclo, comp])).rows[0];
  it('ajusta peso e visibilidade, e salvar as perguntas NÃO zera o ajuste', async () => {
    await cfg(2.5, false);
    await db.query('select fn_aval360_salvar_perguntas($1,$2::jsonb)', [ciclo, JSON.stringify([{ competencia_id: comp, texto: 'Outra redação?' }])]);
    expect(await linha()).toEqual({ peso: '2.500', visivel: false });
  });
  it('peso só antes de enviar; visibilidade muda depois também', async () => {
    await db.exec(`update rh_aval360_ciclo set status = 'apuracao'`);
    await expect(cfg(2, null)).rejects.toMatchObject({ code: 'P0409' });
    await cfg(null, false);
    expect((await linha()).visivel).toBe(false);
  });
  it.each([[0], [10], [-1]])('recusa peso %s', async (peso) => {
    await expect(cfg(peso, null)).rejects.toMatchObject({ code: 'P0400' });
  });
  it('critério fora do ciclo é recusado', async () => {
    await expect(cfg(1, true, uid(99))).rejects.toMatchObject({ code: 'P0400' });
  });
});

describe('reabrir as respostas (20261001180000)', () => {
  beforeAll(async () => {
    await db.exec(readFileSync(resolve(root, 'supabase/migrations/20261001180000_avaliacao360_reabrir.sql'), 'utf8'));
  });
  it('apuração volta para respostas com prazo novo; sem prazo válido, não', async () => {
    await sugerir();
    await mudar('coleta');
    await mudar('apuracao');
    await db.exec(`update rh_aval360_ciclo set coleta_ate = (now() at time zone 'America/Sao_Paulo')::date - 1`);
    await expect(mudar('coleta')).rejects.toThrow(/novo prazo/);
    await db.exec(`update rh_aval360_ciclo set coleta_ate = (now() at time zone 'America/Sao_Paulo')::date + 3`);
    const antes = (await convites()).filter((c) => c.suprimido_motivo).length;
    await mudar('coleta');
    expect(await status()).toBe('coleta');
    expect((await convites()).filter((c) => c.suprimido_motivo).length).toBe(antes);
  });
  it('depois de publicado não reabre', async () => {
    await sugerir();
    await mudar('coleta'); await mudar('apuracao'); await mudar('publicado');
    await expect(mudar('coleta')).rejects.toMatchObject({ code: 'P0409' });
  });
});
