// @vitest-environment node

import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const mig = (n: string) => readFileSync(resolve(root, 'supabase/migrations', n), 'utf8');
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const topo = uid(1), g = uid(2), [a, b, c, d] = [uid(3), uid(4), uid(5), uid(6)], x = uid(7);
const ciclo = uid(20), cRes = uid(31), cComp = uid(32), pRes = uid(41), pComp = uid(42);
let db: PGlite;

const q = <T = any>(sql: string, p: unknown[] = []) => db.query<T>(sql, p).then((r) => r.rows);
const convite = async (avaliado: string, avaliador: string, papel: string) =>
  (await q<{ id: string }>(`select id from rh_aval360_convite where avaliado_id=$1 and avaliador_id=$2 and papel=$3`,
    [avaliado, avaliador, papel]))[0].id;
const responder = async (avaliado: string, avaliador: string, papel: string, n1: number, n2: number, com1: string | null = null) =>
  q('select fn_aval360_responder($1,$2,$3::jsonb)', [await convite(avaliado, avaliador, papel), avaliador,
    JSON.stringify([{ pergunta_id: pRes, nota: n1, comentario: com1 }, { pergunta_id: pComp, nota: n2 }])]);
const status = (para: string) => q('select fn_aval360_mudar_status($1,$2)', [ciclo, para]);
const resultado = async (avaliado = a) => (await q<{ r: any }>('select fn_aval360_resultado($1,$2) r', [ciclo, avaliado]))[0].r;
const entregar = (por: string, rh: boolean, liberar: boolean, dia: string | null = null, obs: string | null = null) =>
  q('select fn_aval360_entregar($1,$2,$3,$4,$5,$6::date,$7)', [ciclo, a, por, rh, liberar, dia, obs]);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table rh_funcionarios(id uuid primary key, nome text, email text, cargo text, area text,
      gestor_id uuid references rh_funcionarios(id), status text default 'ativo', deleted_at timestamptz);`);
  const f = mig('20260916120000_avaliacao_360.sql');
  await db.exec(f.slice(f.indexOf('CREATE TABLE IF NOT EXISTS public.rh_aval360_ciclo ('), f.indexOf('ALTER TABLE public.rh_aval360_ciclo')));
  await db.exec(mig('20260926160000_avaliacao360_resposta_atomica.sql'));
  await db.exec(mig('20260928150000_avaliacao360_ciclo.sql'));
  await db.exec(mig('20260929120000_avaliacao360_resultados.sql'));
  await db.exec(mig('20260929150000_avaliacao360_calibragem.sql'));
  await db.exec(mig('20260929180000_avaliacao360_grupo.sql'));
  await db.exec(mig('20261001120000_avaliacao360_perguntas.sql'));
  await db.exec(mig('20261001180000_avaliacao360_reabrir.sql'));
  await db.exec(mig('20261002120000_avaliacao360_pacote.sql'));
}, 30000);
afterAll(async () => { await db?.close(); });

beforeEach(async () => {
  await db.exec(`truncate rh_funcionarios, rh_aval360_ciclo cascade;
    delete from rh_aval360_competencia where codigo like 't\\_%';
    insert into rh_funcionarios(id,nome) values ('${topo}','Topo');
    insert into rh_funcionarios(id,nome,gestor_id) values ('${g}','Gestor','${topo}');
    ${[a, b, c, d].map((p, i) => `insert into rh_funcionarios(id,nome,gestor_id) values ('${p}','P${i}','${g}');`).join('\n')}
    insert into rh_funcionarios(id,nome,gestor_id) values ('${x}','X','${a}');
    insert into rh_aval360_ciclo(id,nome,periodo_inicio,periodo_fim,coleta_ate,escala_max)
      values ('${ciclo}','Ciclo',(now() at time zone 'America/Sao_Paulo')::date,(now() at time zone 'America/Sao_Paulo')::date,(now() at time zone 'America/Sao_Paulo')::date+5,6);
    insert into rh_aval360_competencia(id,codigo,nome,eixo) values
      ('${cRes}','t_res','Relacionamento','resultado'), ('${cComp}','t_comp','Perseverança','comportamento');
    insert into rh_aval360_ciclo_competencia(ciclo_id,competencia_id,ordem) values ('${ciclo}','${cRes}',0),('${ciclo}','${cComp}',1);
    insert into rh_aval360_pergunta(id,ciclo_id,competencia_id,texto,ordem) values
      ('${pRes}','${ciclo}','${cRes}','Ouve os colegas?',0), ('${pComp}','${ciclo}','${cComp}','Persiste quando dá errado?',1);`);
  await q('select fn_aval360_sugerir_avaliadores($1)', [ciclo]);
  await status('coleta');

  await responder(a, a, 'auto', 6, 6, 'Me dedico muito');
  await responder(a, g, 'gestor', 4, 5, 'Precisa ouvir mais');
  await responder(a, b, 'par', 5, 4, 'Ótimo colega');
  await responder(a, c, 'par', 3, 2);
});

describe('apuração · média ponderada e 9box', () => {
  it('nada antes de encerrar as respostas — nem para o RH', async () => {
    await responder(a, d, 'par', 4, 3, 'Ajuda sempre');
    await expect(resultado()).rejects.toMatchObject({ code: 'P0409' });
  });
  it('15/70/15 por critério, eixos e quadrante como no Feedz', async () => {
    await responder(a, d, 'par', 4, 3, 'Ajuda sempre');
    await status('apuracao');
    const r = await resultado();
    const [res, comp] = r.criterios;
    expect(res).toMatchObject({ auto: 6, gestor: 4, outros: 4, par: 4, final: 4.3 });
    expect(comp).toMatchObject({ auto: 6, gestor: 5, outros: 3, final: 4.85 });
    expect(r).toMatchObject({ eixo_resultado: 4.3, eixo_comportamento: 4.85, final: 4.58,
      nivel_resultado: 'medio', nivel_comportamento: 'alto', quadrante: 'Forte desempenho' });
    expect(r.ciclo).toMatchObject({ corte_baixo: 2.3, corte_alto: 4.8 });
    expect(r.papeis.par).toEqual({ respondentes: 3, visivel: true });
  });
  it('par com menos de 3 RESPOSTAS fica oculto e o peso vai para quem respondeu', async () => {
    await status('apuracao');
    const r = await resultado();
    expect(r.papeis.par).toEqual({ respondentes: 2, visivel: false });
    expect(r.criterios[0]).toMatchObject({ par: null, outros: null, final: 4.35 });
    expect(r.criterios[0].comentarios.map((c: any) => c.papel).sort()).toEqual(['auto', 'gestor']);
  });
  it('escala 1–4 recalcula os cortes proporcionais', async () => {
    await status('apuracao');
    await db.exec(`update rh_aval360_ciclo set escala_max = 4, escala_rotulos = null`);
    expect((await resultado()).ciclo).toMatchObject({ corte_baixo: 1.78, corte_alto: 3.28 });
  });
});

describe('⚠️⚠️ anonimato no que sai do banco', () => {
  beforeEach(async () => { await responder(a, d, 'par', 4, 3, 'Ajuda sempre'); await status('apuracao'); });
  it('não sai id de avaliador, convite, resposta nem dia', async () => {
    const texto = JSON.stringify(await resultado());
    for (const quem of [b, c, d]) expect(texto).not.toContain(quem);
    for (const chave of ['resposta_id', 'convite_id', 'avaliador', 'respondido']) expect(texto).not.toContain(chave);
  });
  it('comentário sai só com papel e texto — sem a nota junto', async () => {
    const r = await resultado();
    const coms = r.criterios.flatMap((cr: any) => cr.comentarios);

    expect(coms.every((cm: any) => Object.keys(cm).sort().join() === 'papel,pergunta,texto')).toBe(true);
    expect(coms.find((cm: any) => cm.texto === 'Ótimo colega').pergunta).toBe('Ouve os colegas?');
    expect(coms.filter((cm: any) => cm.papel === 'par').map((cm: any) => cm.texto).sort()).toEqual(['Ajuda sempre', 'Ótimo colega']);
  });
  it('resumo do ciclo não carrega comentários nem critérios', async () => {
    const lista = (await q<{ r: any[] }>('select fn_aval360_resultados_ciclo($1) r', [ciclo]))[0].r;
    expect(lista).toHaveLength(7);
    expect(JSON.stringify(lista)).not.toContain('Ajuda sempre');
    expect(lista.find((l) => l.avaliado.id === a)).toMatchObject({ quadrante: 'Forte desempenho' });
  });
  it('nega execução direta aos clientes', async () => {
    for (const fn of ['fn_aval360_resultado(uuid,uuid)', 'fn_aval360_resultados_ciclo(uuid)',
      'fn_aval360_entregar(uuid,uuid,uuid,boolean,boolean,date,text)', 'fn_aval360_eh_gestor(uuid,uuid,uuid)']) {
      const [r] = await q(`select has_function_privilege('authenticated',$1,'execute') aut,
        has_function_privilege('anon',$1,'execute') anon, has_function_privilege('service_role',$1,'execute') srv`, [fn]);
      expect(r).toEqual({ aut: false, anon: false, srv: true });
    }
  });
});

describe('entrega · o gestor libera e registra a devolutiva', () => {
  beforeEach(async () => { await status('apuracao'); });
  it('só depois de o RH publicar', async () => {
    await expect(entregar(g, false, true)).rejects.toMatchObject({ code: 'P0409' });
  });
  it('gestor do ciclo libera; colega não; RH pode', async () => {
    await status('publicado');
    await expect(entregar(b, false, true)).rejects.toMatchObject({ code: 'P0403' });
    await entregar(g, false, true);
    expect((await resultado()).entrega.liberado_em).not.toBeNull();
    await entregar(topo, true, true);
  });
  it('devolutiva exige liberação, não aceita data futura e guarda a observação', async () => {
    await status('publicado');
    await expect(entregar(g, false, false, '2000-01-01')).rejects.toThrow(/Libere o resultado/);
    await expect(entregar(g, false, true, '2999-01-01')).rejects.toMatchObject({ code: 'P0400' });
    await entregar(g, false, true, '2026-09-20', ' Conversamos sobre escuta. ');
    expect((await resultado()).entrega).toMatchObject({ devolutiva_dia: '2026-09-20', devolutiva_obs: 'Conversamos sobre escuta.' });
  });
  it('eh_gestor segue quem avaliou NO ciclo, não o gestor de hoje', async () => {
    await db.exec(`update rh_funcionarios set gestor_id = '${topo}' where id = '${a}'`);
    const [r] = await q<{ v: boolean }>('select fn_aval360_eh_gestor($1,$2,$3) v', [ciclo, a, g]);
    expect(r.v).toBe(true);
  });
});

describe('calibragem pelo RH na apuração', () => {
  const calibrar = (comp: string, nota: number | null, just: string | null = 'Alinhado na reunião de calibragem.') =>
    q('select fn_aval360_calibrar($1,$2,$3,$4,$5,$6)', [ciclo, a, comp, nota, just, topo]);
  beforeEach(async () => { await responder(a, d, 'par', 4, 3, 'Ajuda sempre'); await status('apuracao'); });
  it('a calibrada substitui o final do critério, os eixos e o quadrante; as médias por papel ficam', async () => {
    await calibrar(cRes, 5);
    const r = await resultado();
    expect(r.criterios[0]).toMatchObject({ auto: 6, gestor: 4, outros: 4, calculado: 4.3, final: 5, calibrado: true,
      justificativa: 'Alinhado na reunião de calibragem.' });
    expect(r).toMatchObject({ eixo_resultado: 5, final: 4.93, quadrante: 'Estrela', calibrado: true });
  });
  it('desfazer volta à calculada; desfazer de novo é 409', async () => {
    await calibrar(cRes, 5);
    await calibrar(cRes, null);
    expect((await resultado()).criterios[0]).toMatchObject({ final: 4.3, calibrado: false });
    await expect(calibrar(cRes, null)).rejects.toMatchObject({ code: 'P0409' });
  });
  it.each([
    ['sem justificativa', () => calibrar(cRes, 5, 'curta')],
    ['acima da escala', () => calibrar(cRes, 7)],
    ['abaixo de 1', () => calibrar(cRes, 0.5)],
    ['3 casas', () => calibrar(cRes, 4.555)],
    ['critério fora do ciclo', () => calibrar(uid(99), 5)],
  ])('recusa %s', async (_n, acao) => {
    await expect(acao()).rejects.toMatchObject({ code: 'P0400' });
  });
  it('só na apuração — depois de publicado não muda mais', async () => {
    await status('publicado');
    await expect(calibrar(cRes, 5)).rejects.toMatchObject({ code: 'P0409' });
  });
  it('o resumo do ciclo traz o final por critério, sem comentários', async () => {
    await calibrar(cComp, 2);
    const lista = (await q<{ r: any[] }>('select fn_aval360_resultados_ciclo($1) r', [ciclo]))[0].r;
    const pa = lista.find((l) => l.avaliado.id === a);
    expect(pa.criterios.map((c: any) => [c.nome, c.final, c.calibrado])).toEqual([['Relacionamento', 4.3, false], ['Perseverança', 2, true]]);
    expect(JSON.stringify(lista)).not.toMatch(/Ajuda sempre|justificativa/);
  });
});

describe('duas perguntas no mesmo critério (01/10)', () => {
  it('o critério é a média das perguntas e cada pergunta aparece com a própria média', async () => {

    await db.exec(`delete from rh_aval360_nota; delete from rh_aval360_resposta; update rh_aval360_convite set respondido_em = null`);
    await db.exec(`update rh_aval360_ciclo set status = 'rascunho'`);
    await db.exec(`insert into rh_aval360_pergunta(id,ciclo_id,competencia_id,texto,ordem) values ('${uid(43)}','${ciclo}','${cRes}','Dá retorno com clareza?',2)`);
    await status('coleta');
    const resp = async (avaliador: string, papel: string, r1: number, r2: number, c: number) =>
      q('select fn_aval360_responder($1,$2,$3::jsonb)', [await convite(a, avaliador, papel), avaliador,
        JSON.stringify([{ pergunta_id: pRes, nota: r1 }, { pergunta_id: uid(43), nota: r2 }, { pergunta_id: pComp, nota: c }])]);
    await resp(g, 'gestor', 4, 6, 5);
    await status('apuracao');
    const r = await resultado();
    const rel = r.criterios.find((c: any) => c.competencia_id === cRes);
    expect(rel.gestor).toBe(5);
    expect(rel.perguntas.map((p: any) => [p.texto, p.gestor])).toEqual([['Ouve os colegas?', 4], ['Dá retorno com clareza?', 6]]);
  });
});

describe('resultado traz peso, visibilidade e configuração (01/10)', () => {
  it('critério oculto continua na nota e vem marcado', async () => {
    await responder(a, d, 'par', 4, 3);
    await q('select fn_aval360_config_criterio($1,$2,$3,$4)', [ciclo, cComp, null, false]);
    await db.exec(`update rh_aval360_ciclo set config = '{"participante_ve_quadrante": false}'`);
    await status('apuracao');
    const r = await resultado();
    expect(r.criterios.find((c: any) => c.competencia_id === cComp)).toMatchObject({ visivel: false, final: 4.85 });
    expect(r.final).toBe(4.58);
    expect(r.ciclo.config).toEqual({ participante_ve_quadrante: false });
  });
});

describe('pacote 02/10 · mostrar abaixo de 3, edição, plano, resumo por visão', () => {
  const cfg = (c: any) => db.exec(`update rh_aval360_ciclo set config = '${JSON.stringify(c)}'`);
  it('desligado: par com 2 respostas fica oculto; ligado: aparece', async () => {
    await status('apuracao');
    expect((await resultado()).papeis.par.visivel).toBe(false);
    await cfg({ mostrar_abaixo_do_piso: true });
    const r = await resultado();
    expect(r.papeis.par).toEqual({ respondentes: 2, visivel: true });
    expect(r.criterios[0].par).toBe(4);
  });
  it('ligar com respostas abertas reativa quem saiu por estar abaixo de 3', async () => {
    const antes = (await q<{ n: number }>(`select count(*)::int n from rh_aval360_convite where suprimido_motivo = 'abaixo_do_piso'`))[0].n;
    expect(antes).toBeGreaterThan(0);
    const [r] = await q<{ r: any }>('select fn_aval360_reativar_abaixo_piso($1) r', [ciclo]);
    expect(r.r.reativados).toBe(antes);
    await cfg({ mostrar_abaixo_do_piso: true });
    const xa = await convite(a, x, 'liderado');
    const [f] = await q<{ r: any }>('select fn_aval360_formulario($1,$2) r', [xa, x]);
    expect(f.r.convite.papel).toBe('liderado');
  });
  it('editar: só com a opção ligada; troca as notas da mesma resposta', async () => {
    const id = await convite(a, b, 'par');
    const novas = JSON.stringify([{ pergunta_id: pRes, nota: 2, comentario: 'Mudei de ideia' }, { pergunta_id: pComp, nota: 2 }]);
    await expect(q('select fn_aval360_editar_resposta($1,$2,$3::jsonb)', [id, b, novas])).rejects.toThrow(/não está liberada/);
    await cfg({ permitir_edicao: true });
    const [f] = await q<{ r: any }>('select fn_aval360_formulario($1,$2) r', [id, b]);
    expect(f.r.pode_editar).toBe(true);
    expect(f.r.minhas_notas.find((n: any) => n.pergunta_id === pRes)).toMatchObject({ nota: 5, comentario: 'Ótimo colega' });
    await q('select fn_aval360_editar_resposta($1,$2,$3::jsonb)', [id, b, novas]);
    const [g] = await q<{ r: any }>('select fn_aval360_formulario($1,$2) r', [id, b]);
    expect(g.r.minhas_notas.find((n: any) => n.pergunta_id === pRes)).toMatchObject({ nota: 2, comentario: 'Mudei de ideia' });
    expect((await q<{ n: number }>(`select count(*)::int n from rh_aval360_resposta where convite_id = $1`, [id]))[0].n).toBe(1);
    await status('apuracao');
    await expect(q('select fn_aval360_editar_resposta($1,$2,$3::jsonb)', [id, b, novas])).rejects.toMatchObject({ code: 'P0409' });
  });
  it('plano de ação: gestor do ciclo registra depois de publicar e aparece na entrega', async () => {
    await status('apuracao');
    const plano = JSON.stringify([{ texto: 'Ouvir mais a equipe antes de decidir', prazo: '2027-03-31' }, { texto: 'Curso de liderança', prazo: null }]);
    await expect(q('select fn_aval360_plano($1,$2,$3,$4,$5::jsonb)', [ciclo, a, g, false, plano])).rejects.toMatchObject({ code: 'P0409' });
    await status('publicado');
    await expect(q('select fn_aval360_plano($1,$2,$3,$4,$5::jsonb)', [ciclo, a, b, false, plano])).rejects.toMatchObject({ code: 'P0403' });
    await q('select fn_aval360_plano($1,$2,$3,$4,$5::jsonb)', [ciclo, a, g, false, plano]);
    expect((await resultado()).entrega.plano).toEqual([{ texto: 'Ouvir mais a equipe antes de decidir', prazo: '2027-03-31' }, { texto: 'Curso de liderança', prazo: null }]);
    await expect(q('select fn_aval360_plano($1,$2,$3,$4,$5::jsonb)', [ciclo, a, g, false, JSON.stringify([{ texto: 'x' }])])).rejects.toMatchObject({ code: 'P0400' });
  });
  it('resumo do ciclo traz a média de cada visão por pessoa', async () => {
    await responder(a, d, 'par', 4, 3);
    await status('apuracao');
    const lista = (await q<{ r: any[] }>('select fn_aval360_resultados_ciclo($1) r', [ciclo]))[0].r;
    expect(lista.find((l) => l.avaliado.id === a)).toMatchObject({ auto: 6, gestor: 4.5, outros: 3.5, par: 3.5 });
  });
  it('enviar com a opção ligada não retira ninguém', async () => {
    await db.exec(`update rh_aval360_convite set suprimido_em = null, suprimido_motivo = null where suprimido_motivo = 'abaixo_do_piso';
      update rh_aval360_ciclo set status = 'rascunho', config = '{"mostrar_abaixo_do_piso": true}'`);
    const r = await q<{ r: any }>('select fn_aval360_mudar_status($1,$2) r', [ciclo, 'coleta']);
    expect(r[0].r.suprimidos_abaixo_do_piso).toBe(0);
  });
});
