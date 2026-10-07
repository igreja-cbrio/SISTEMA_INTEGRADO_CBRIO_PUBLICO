import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import * as avisoPcsReal from '../../backend/utils/aval360AvisoPcs.js';

const fonte = readFileSync(resolve(__dirname, '../../backend/routes/avaliacao360.js'), 'utf8');
const id = '12345678-1234-4567-8123-123456789012';
const outro = '22345678-1234-4567-8123-123456789012';
const eu = { id: '32345678-1234-4567-8123-123456789012', nome: 'Colaborador', area: 'Equipe', gestor_id: 'meu-gestor' };
type Handler = (req: any, res: any) => Promise<unknown>;


function carregar(respostas: Record<string, any[]> = {}, opcoes: { rpc?: any; rpcs?: any[]; ativos?: any[] } = {}) {
  const enviarEmail = vi.fn().mockResolvedValue({ ok: true });
  const rotas = new Map<string, any[]>();
  const router: any = { use: vi.fn() };
  for (const m of ['get', 'post', 'patch', 'put']) router[m] = (p: string, ...h: any[]) => rotas.set(`${m} ${p}`, h);
  const authorizeModule = vi.fn((modulo: string, nivel: number) => ({ gate: `${modulo}:${nivel}` }));
  const chamadas: { tabela: string; ops: any[][] }[] = [];
  const supabase = {
    rpc: opcoes.rpcs
      ? vi.fn().mockImplementation(() => Promise.resolve(opcoes.rpcs!.shift() ?? { data: null }))
      : vi.fn().mockResolvedValue(opcoes.rpc ?? { data: { ok: true } }),
    from: vi.fn((tabela: string) => {
      const registro = { tabela, ops: [] as any[][] };
      chamadas.push(registro);
      const b: any = {};
      for (const m of ['select', 'eq', 'is', 'in', 'order', 'range', 'insert', 'update', 'maybeSingle', 'single', 'limit']) {
        b[m] = (...a: any[]) => { registro.ops.push([m, ...a]); return b; };
      }
      b.then = (ok: any, erro: any) => Promise.resolve((respostas[tabela] || []).shift() ?? { data: [] }).then(ok, erro);
      return b;
    }),
  };
  runInNewContext(fonte, {
    module: { exports: {} },
    console: { error: vi.fn() },
    Intl, Date, Math, process: { env: {} },
    require: (dep: string) => {
      if (dep === 'express') return { Router: () => router };
      if (dep === '../middleware/auth') return { authenticate: vi.fn(), apenasColaborador: vi.fn(), authorizeModule };
      if (dep === '../utils/supabase') return { supabase };
      if (dep === '../utils/cronAuth') return { isAuthorizedCron: (r: any) => r?.headers?.authorization === 'Bearer segredo' };
      if (dep === '../services/email') return { enviarEmail };
      if (dep === '../services/notificar') return { notificar: vi.fn().mockResolvedValue(undefined) };
      if (dep === '../utils/aval360AvisoPcs') return avisoPcsReal;
      if (dep === '../services/avaliacao360') return {
        funcionarioDoLogin: vi.fn().mockResolvedValue({ funcionario: eu, erro: null }),
        listarAtivos: vi.fn().mockResolvedValue(opcoes.ativos ?? []),
      };
      throw new Error(`Import inesperado: ${dep}`);
    },
  });
  async function chamar(rota: string, req: any = {}) {
    const res: any = { statusCode: 200 };
    res.status = (s: number) => { res.statusCode = s; return res; };
    res.json = (b: any) => { res.body = b; return res; };
    const h = rotas.get(rota);
    if (!h) throw new Error(`Rota ausente: ${rota}`);
    await (h.at(-1) as Handler)({ params: { id }, user: { id: 'user', email: 'x@example.org' }, ...req }, res);
    return res;
  }
  return { chamar, rotas, supabase, chamadas, enviarEmail };
}
const op = (chamadas: any[], tabela: string, metodo: string) =>
  chamadas.filter((c) => c.tabela === tabela).flatMap((c) => c.ops).find((o: any[]) => o[0] === metodo)?.[1];

describe('360 · só o RH monta', () => {
  const admin = ['get /competencias', 'post /competencias', 'patch /competencias/:id', 'post /ciclos',
    'get /ciclos/:id', 'patch /ciclos/:id', 'put /ciclos/:id/perguntas', 'get /ciclos/:id/pessoa/:avaliadoId',
    'put /ciclos/:id/avaliados/:avaliadoId', 'post /ciclos/:id/avaliados/:avaliadoId/remover', 'post /ciclos/:id/status',
    'post /ciclos/:id/sugerir', 'get /ciclos/:id/avaliadores', 'post /ciclos/:id/avaliadores', 'get /ciclos/:id/adesao',
    'get /ciclos/:id/resultados', 'get /ciclos/:id/resultados/:avaliadoId', 'post /ciclos/:id/resultados/:avaliadoId/entrega',
    'post /ciclos/:id/avisar', 'post /ciclos/:id/resultados/:avaliadoId/calibragem', 'put /ciclos/:id/criterios/:competenciaId',
    'get /ciclos/:id/entregas', 'post /ciclos/:id/resultados/:avaliadoId/plano',
    'put /competencias/:id/peso-pcs', 'get /ciclos/:id/aviso-pcs', 'get /aviso-pcs/ultimo'];
  it.each(admin)('%s exige RH nível 3 na própria rota', (rota) => {
    const { rotas } = carregar();
    expect(rotas.get(rota)?.[0]).toEqual({ gate: 'rh:3' });
  });
  it('o colaborador só lista, abre e responde — não monta nada', () => {
    const { rotas } = carregar();
    const doColaborador = [...rotas.entries()].filter(([, h]) => h.length === 1).map(([r]) => r).sort();


    expect(doColaborador).toEqual(['get /convite/:id', 'get /cron/lembretes', 'get /minhas', 'get /resultados',
      'get /resultados/:cicloId/:avaliadoId', 'post /convite/:id/editar', 'post /convite/:id/responder',
      'post /resultados/:cicloId/:avaliadoId/entrega', 'post /resultados/:cicloId/:avaliadoId/plano']);
  });
});

describe('360 · critérios', () => {
  it('cria critério com código gerado e eixo validado', async () => {
    const { chamar, chamadas } = carregar({ rh_aval360_competencia: [{ data: { id } }] });
    const res = await chamar('post /competencias', { body: { nome: ' Serve com alegria ', eixo: 'comportamento', codigo: 'fz_x' } });
    expect(res.statusCode).toBe(201);
    const ins = op(chamadas, 'rh_aval360_competencia', 'insert');
    expect(ins).toMatchObject({ nome: 'Serve com alegria', eixo: 'comportamento', aplica_a: 'todos' });
    expect(ins.codigo).toMatch(/^rh_/);
  });
  it.each([[{ nome: '', eixo: 'resultado' }], [{ nome: 'X', eixo: 'outro' }], [{ nome: 'X', eixo: 'resultado', aplica_a: 'area' }]])(
    'recusa critério inválido %j', async (body) => {
      const { chamar, supabase } = carregar();
      expect((await chamar('post /competencias', { body })).statusCode).toBe(400);
      expect(supabase.from).not.toHaveBeenCalled();
    });
  it('não reescreve texto de critério já usado num ciclo enviado', async () => {
    const { chamar, chamadas } = carregar({ rh_aval360_ciclo_competencia: [{ data: [{ ciclo: { status: 'coleta', deleted_at: null } }] }] });
    const res = await chamar('patch /competencias/:id', { body: { nome: 'Outro texto' } });
    expect(res.statusCode).toBe(409);
    expect(op(chamadas, 'rh_aval360_competencia', 'update')).toBeUndefined();
  });
  it('desativar critério usado pode (não reescreve o histórico)', async () => {
    const { chamar, chamadas } = carregar({ rh_aval360_competencia: [{ data: { id, ativo: false } }] });
    const res = await chamar('patch /competencias/:id', { body: { ativo: false } });
    expect(res.statusCode).toBe(200);
    expect(op(chamadas, 'rh_aval360_competencia', 'update')).toEqual({ ativo: false });
  });
});

describe('360 · ciclo e escala', () => {
  const fz = ['fz_compreende_ama', 'fz_relacionamento', 'fz_postura_pessoal', 'fz_postura_profissional',
    'fz_postura_espiritual', 'fz_grandes_desafios', 'fz_perseveranca', 'fz_desenvolvimento'];
  it('ciclo novo: escala 1–6 com nomes padrão e uma pergunta por critério do Feedz', async () => {
    const { chamar, supabase, chamadas } = carregar({
      rh_aval360_ciclo: [{ data: { id, nome: 'C' } }],
      rh_aval360_competencia: [{ data: fz.map((codigo) => ({ id: `id-${codigo}`, codigo, nome: `Nome ${codigo}` })) }],
    });
    const res = await chamar('post /ciclos', { body: { nome: 'C', periodo_inicio: '2027-06-01', periodo_fim: '2027-06-30', status: 'coleta' } });
    expect(res.statusCode).toBe(201);
    const ins = op(chamadas, 'rh_aval360_ciclo', 'insert');
    expect(ins).toMatchObject({ escala_max: 6, status: 'rascunho' });
    expect(ins.escala_rotulos).toHaveLength(6);
    expect(supabase.rpc.mock.calls[0][0]).toBe('fn_aval360_salvar_perguntas');
    const itens = supabase.rpc.mock.calls[0][1].p_itens;
    expect(itens[0]).toEqual({ competencia_id: 'id-fz_relacionamento', texto: 'Nome fz_relacionamento' });
    expect(itens).toHaveLength(8);
  });
  it('escala personalizada: 1 a 4 com um nome por ponto', async () => {
    const { chamar, chamadas } = carregar({ rh_aval360_ciclo: [{ data: { id } }] });
    const escala_rotulos = ['Nunca', 'Raramente', 'Frequentemente', 'Sempre'];
    await chamar('post /ciclos', { body: { nome: 'C', periodo_inicio: '2027-06-01', periodo_fim: '2027-06-30', escala_max: 4, escala_rotulos } });
    expect(op(chamadas, 'rh_aval360_ciclo', 'insert')).toMatchObject({ escala_max: 4, escala_rotulos });
  });
  it.each([
    [{ escala_max: 4, escala_rotulos: ['a', 'b'] }],
    [{ escala_max: 4.5 }],
    [{ escala_max: 4, escala_rotulos: ['a', 'b', 'c', ' '] }],
  ])('recusa escala inconsistente %j', async (extra) => {
    const { chamar, chamadas } = carregar();
    const res = await chamar('post /ciclos', { body: { nome: 'C', periodo_inicio: '2027-06-01', periodo_fim: '2027-06-30', ...extra } });
    expect(res.statusCode).toBe(400);
    expect(op(chamadas, 'rh_aval360_ciclo', 'insert')).toBeUndefined();
  });
  it('mudar o número de pontos sem mandar nomes zera os nomes antigos', async () => {
    const { chamar, chamadas } = carregar({ rh_aval360_ciclo: [{ data: { id, status: 'rascunho', escala_max: 6 } }, { data: { id } }] });
    await chamar('patch /ciclos/:id', { body: { escala_max: 5 } });
    expect(op(chamadas, 'rh_aval360_ciclo', 'update')).toEqual({ escala_max: 5, escala_rotulos: null });
  });
  it('depois de enviado, só prazo e descrição mudam', async () => {
    const { chamar, chamadas } = carregar({ rh_aval360_ciclo: [{ data: { id, status: 'coleta', escala_max: 6 } }, { data: { id } }] });
    const res = await chamar('patch /ciclos/:id', { body: { escala_max: 10, peso_gestor: 1, coleta_ate: '2027-07-10' } });
    expect(op(chamadas, 'rh_aval360_ciclo', 'update')).toEqual({ coleta_ate: '2027-07-10' });
    expect(res.body.ignorados).toEqual(['escala_max', 'peso_gestor']);
  });
  it('status: indicação não existe mais; enviar = coleta', async () => {
    const { chamar, supabase } = carregar();
    expect((await chamar('post /ciclos/:id/status', { body: { para: 'indicacao' } })).statusCode).toBe(400);
    await chamar('post /ciclos/:id/status', { body: { para: 'coleta' } });
    expect(supabase.rpc).toHaveBeenCalledExactlyOnceWith('fn_aval360_mudar_status', { p_ciclo_id: id, p_para: 'coleta' });
  });
});

describe('360 · quem avalia quem', () => {
  it('editar passa exatamente o que o RH escolheu', async () => {
    const { chamar, supabase } = carregar();
    await chamar('post /ciclos/:id/avaliadores', { body: { avaliado_id: id, avaliador_id: outro, papel: 'par', incluir: true } });
    expect(supabase.rpc).toHaveBeenCalledExactlyOnceWith('fn_aval360_editar_avaliador', {
      p_ciclo_id: id, p_avaliado_id: id, p_avaliador_id: outro, p_papel: 'par', p_incluir: true,
    });
  });
  it.each([
    [{ avaliado_id: 'x', avaliador_id: outro, papel: 'par', incluir: true }],
    [{ avaliado_id: id, avaliador_id: outro, papel: 'chefe', incluir: true }],
    [{ avaliado_id: id, avaliador_id: outro, papel: 'par', incluir: 'sim' }],
  ])('recusa edição inválida antes do banco %j', async (body) => {
    const { chamar, supabase } = carregar();
    expect((await chamar('post /ciclos/:id/avaliadores', { body })).statusCode).toBe(400);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
  it('a lista por pessoa traz contagem, alertas e quem ficou fora do ciclo', async () => {
    const f = (i: string, extra = {}) => ({ id: i, nome: i.toUpperCase(), ...extra });
    const conv = (avaliado_id: string, avaliador: string, papel: string, extra = {}) =>
      ({ id: `${avaliado_id}-${avaliador}-${papel}`, avaliado_id, papel, origem: 'automatico', avaliador: f(avaliador), ...extra });
    const { chamar } = carregar({
      rh_aval360_ciclo: [{ data: { id, status: 'rascunho', piso_respondentes: 3 } }],
      rh_aval360_convite: [{ data: [
        conv('a', 'a', 'auto'), conv('a', 'g', 'gestor'), conv('a', 'b', 'par'), conv('a', 'c', 'par'),
        conv('a', 'd', 'par', { suprimido_em: 't', suprimido_motivo: 'removido_pelo_rh' }),
        conv('g', 'g', 'auto'),
      ] }],
    }, { ativos: [f('a'), f('g'), f('novo')] });
    const res = await chamar('get /ciclos/:id/avaliadores');
    const a = res.body.pessoas.find((p: any) => p.avaliado.id === 'a');
    expect(a.contagem).toEqual({ auto: 1, gestor: 1, par: 2, liderado: 0 });
    expect(a.alertas).toEqual(['par_abaixo_do_piso']);
    expect(a.removidos).toEqual([expect.objectContaining({ motivo: 'removido_pelo_rh' })]);
    const g = res.body.pessoas.find((p: any) => p.avaliado.id === 'g');
    expect(g.alertas).toEqual(['sem_gestor', 'sem_pares']);
    expect(res.body.fora_do_ciclo.map((p: any) => p.id)).toEqual(['novo']);
  });
  it('adesão agrupa supressões por motivo e não lê nota', async () => {
    const pessoa = (n: string) => ({ id: n, nome: n, area: null });
    const { chamar, chamadas } = carregar({ rh_aval360_convite: [{ data: [
      { papel: 'auto', respondido_em: 't', avaliador: pessoa('a') },
      { papel: 'gestor', respondido_em: null, avaliador: pessoa('g') },
      { papel: 'liderado', suprimido_em: 't', suprimido_motivo: 'abaixo_do_piso', avaliador: pessoa('x') },
    ] }] });
    const res = await chamar('get /ciclos/:id/adesao');
    expect(res.body.por_papel).toEqual({ auto: { total: 1, respondidos: 1 }, gestor: { total: 1, respondidos: 0 } });
    expect(res.body.suprimidos).toEqual({ abaixo_do_piso: 1 });
    expect(chamadas.map((c) => c.tabela)).not.toContain('rh_aval360_nota');
    expect(chamadas.map((c) => c.tabela)).not.toContain('rh_aval360_resposta');
  });
});

describe('360 · quem vê o resultado de quem', () => {
  const params = { cicloId: id, avaliadoId: outro };
  const publicado = () => ({ rh_aval360_ciclo: [{ data: { id, status: 'publicado' } }] });
  const resultado = { avaliado: { id: outro }, final: 4.5, entrega: { liberado_em: 't', devolutiva_obs: 'nota do gestor' } };
  it('o gestor do ciclo vê o liderado', async () => {
    const { chamar, supabase } = carregar(publicado(), { rpcs: [{ data: true }, { data: resultado }] });
    const res = await chamar('get /resultados/:cicloId/:avaliadoId', { params });
    expect(res.statusCode).toBe(200);
    expect(supabase.rpc.mock.calls[0]).toEqual(['fn_aval360_eh_gestor', { p_ciclo_id: id, p_avaliado_id: outro, p_gestor_id: eu.id }]);
    expect(res.body.entrega.devolutiva_obs).toBe('nota do gestor');
  });
  it('quem não é o gestor do ciclo recebe 403, sem o resultado', async () => {
    const { chamar, supabase } = carregar(publicado(), { rpcs: [{ data: false }] });
    const res = await chamar('get /resultados/:cicloId/:avaliadoId', { params });
    expect(res.statusCode).toBe(403);
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
  });
  it('ciclo ainda não publicado: nem o gestor vê', async () => {
    const { chamar, supabase } = carregar({ rh_aval360_ciclo: [{ data: { id, status: 'apuracao' } }] });
    expect((await chamar('get /resultados/:cicloId/:avaliadoId', { params })).statusCode).toBe(403);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
  it('o avaliado só vê o próprio depois de liberado, e sem a anotação do gestor', async () => {
    const meu = { cicloId: id, avaliadoId: eu.id };
    const antes = carregar({ ...publicado(), rh_aval360_entrega: [{ data: { liberado_em: null } }] });
    expect((await antes.chamar('get /resultados/:cicloId/:avaliadoId', { params: meu })).statusCode).toBe(403);
    expect(antes.supabase.rpc).not.toHaveBeenCalled();
    const depois = carregar({ rh_aval360_ciclo: [{ data: { id, status: 'publicado' } }], rh_aval360_entrega: [{ data: { liberado_em: 't' } }] },
      { rpcs: [{ data: resultado }] });
    const res = await depois.chamar('get /resultados/:cicloId/:avaliadoId', { params: meu });
    expect(res.statusCode).toBe(200);
    expect(res.body.entrega).toEqual({ liberado_em: 't' });
    expect(depois.supabase.rpc.mock.calls.map((c: any[]) => c[0])).toEqual(['fn_aval360_resultado']);
  });
  it('entrega pelo colaborador NUNCA vira entrega de RH', async () => {
    const { chamar, supabase } = carregar();
    await chamar('post /resultados/:cicloId/:avaliadoId/entrega', { params, body: { liberar: true, p_eh_rh: true } });
    expect(supabase.rpc).toHaveBeenCalledExactlyOnceWith('fn_aval360_entregar', {
      p_ciclo_id: id, p_avaliado_id: outro, p_por: eu.id, p_eh_rh: false, p_liberar: true, p_devolutiva_dia: null, p_devolutiva_obs: null,
    });
  });
  it.each([[{ liberar: 'sim' }], [{ devolutiva_dia: '20/09/2026' }], [{ devolutiva_obs: 5 }]])('entrega recusa corpo inválido %j', async (body) => {
    const { chamar, supabase } = carregar();
    expect((await chamar('post /resultados/:cicloId/:avaliadoId/entrega', { params, body })).statusCode).toBe(400);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});

describe('360 · avisos por e-mail', () => {
  const pessoa = (n: string, email: string | null = `${n}@example.org`) => ({ id: n, nome: `${n} Silva`, email });
  it('lembrete: um e-mail por pessoa com o número de pendências, sem dizer de quem', async () => {
    const { chamar, enviarEmail } = carregar({
      rh_aval360_ciclo: [{ data: { id, nome: 'Ciclo 2027', status: 'coleta', coleta_ate: '2027-07-10' } }],
      rh_aval360_convite: [{ data: [
        { avaliado_id: 'Fulano', avaliador: pessoa('ana') }, { avaliado_id: 'Beltrano', avaliador: pessoa('ana') },
        { avaliado_id: 'Fulano', avaliador: pessoa('bia', null) },
      ] }],
    });
    const res = await chamar('post /ciclos/:id/avisar', { body: { tipo: 'pendentes' } });
    expect(res.body).toEqual({ enviados: 1, sem_email: ['bia Silva'], falhas: [] });
    const [{ to, subject, html }] = enviarEmail.mock.calls[0];
    expect(to).toBe('ana@example.org');
    expect(subject).toContain('2 avaliações');
    expect(html).toContain('10/07/2027');
    expect(html).not.toMatch(/Fulano|Beltrano/);
  });
  it('lembrete fora da coleta e resultados antes de publicar são 409, sem enviar nada', async () => {
    const a = carregar({ rh_aval360_ciclo: [{ data: { id, nome: 'C', status: 'apuracao' } }] });
    expect((await a.chamar('post /ciclos/:id/avisar', { body: { tipo: 'pendentes' } })).statusCode).toBe(409);
    expect((await carregar({ rh_aval360_ciclo: [{ data: { id, nome: 'C', status: 'apuracao' } }] })
      .chamar('post /ciclos/:id/avisar', { body: { tipo: 'resultados' } })).statusCode).toBe(409);
    expect(a.enviarEmail).not.toHaveBeenCalled();
  });
});

describe('360 · calibragem', () => {
  const params = { id, avaliadoId: outro };
  it('passa a nota e a justificativa com o login como autor', async () => {
    const { chamar, supabase } = carregar();
    await chamar('post /ciclos/:id/resultados/:avaliadoId/calibragem', { params, body: { competencia_id: id, nota: 4.5, justificativa: 'Alinhado com o comitê.', p_por: 'x' } });
    expect(supabase.rpc).toHaveBeenCalledExactlyOnceWith('fn_aval360_calibrar', {
      p_ciclo_id: id, p_avaliado_id: outro, p_competencia_id: id, p_nota: 4.5, p_justificativa: 'Alinhado com o comitê.', p_por: eu.id,
    });
  });
  it('desfazer manda nota e justificativa nulas', async () => {
    const { chamar, supabase } = carregar();
    await chamar('post /ciclos/:id/resultados/:avaliadoId/calibragem', { params, body: { competencia_id: id, nota: null, justificativa: 'x' } });
    expect(supabase.rpc.mock.calls[0][1]).toMatchObject({ p_nota: null, p_justificativa: null });
  });
  it.each([[{ competencia_id: 'x', nota: 4 }], [{ competencia_id: id, nota: '4' }], [{ competencia_id: id, nota: 4 }]])(
    'recusa corpo inválido %j', async (body) => {
      const { chamar, supabase } = carregar();
      expect((await chamar('post /ciclos/:id/resultados/:avaliadoId/calibragem', { params, body })).statusCode).toBe(400);
      expect(supabase.rpc).not.toHaveBeenCalled();
    });
  it('o avaliado não recebe a justificativa da calibragem', async () => {
    const meu = { cicloId: id, avaliadoId: eu.id };
    const r = { avaliado: { id: eu.id }, entrega: { liberado_em: 't' }, criterios: [{ nome: 'X', final: 5, calibrado: true, justificativa: 'segredo do comitê' }] };
    const { chamar } = carregar({ rh_aval360_ciclo: [{ data: { id, status: 'publicado' } }], rh_aval360_entrega: [{ data: { liberado_em: 't' } }] },
      { rpcs: [{ data: r }] });
    const res = await chamar('get /resultados/:cicloId/:avaliadoId', { params: meu });
    expect(res.body.criterios[0]).toEqual({ nome: 'X', final: 5, calibrado: true });
  });
});

describe('360 · grupo do ciclo (piloto)', () => {
  const rasc = () => ({ rh_aval360_ciclo: [{ data: { id, status: 'rascunho', escala_max: 6 } }, { data: { id } }] });
  it('salva o grupo sem repetição', async () => {
    const { chamar, chamadas } = carregar(rasc());
    await chamar('patch /ciclos/:id', { body: { participantes: [id, outro, id] } });
    expect(op(chamadas, 'rh_aval360_ciclo', 'update')).toEqual({ participantes: [id, outro] });
  });
  it('null volta para todos os ativos', async () => {
    const { chamar, chamadas } = carregar(rasc());
    await chamar('patch /ciclos/:id', { body: { participantes: null } });
    expect(op(chamadas, 'rh_aval360_ciclo', 'update')).toEqual({ participantes: null });
  });
  it.each([[[]], [['x']], ['todos']])('recusa grupo inválido %j', async (participantes) => {
    const { chamar, chamadas } = carregar(rasc());
    expect((await chamar('patch /ciclos/:id', { body: { participantes } })).statusCode).toBe(400);
    expect(op(chamadas, 'rh_aval360_ciclo', 'update')).toBeUndefined();
  });
  it('depois de enviado o grupo não muda', async () => {
    const { chamar, chamadas } = carregar({ rh_aval360_ciclo: [{ data: { id, status: 'coleta', escala_max: 6 } }] });
    const res = await chamar('patch /ciclos/:id', { body: { participantes: [id] } });
    expect(res.statusCode).toBe(400);
    expect(op(chamadas, 'rh_aval360_ciclo', 'update')).toBeUndefined();
  });
});

describe('360 · montagem por pessoa (01/10)', () => {
  const params = { id, avaliadoId: outro };
  const terceiro = '42345678-1234-4567-8123-123456789012';
  it('o modal recebe a sugestão da hierarquia e a lista atual, sem a autoavaliação', async () => {
    const hier = [
      { avaliado_id: outro, avaliador_id: outro, papel: 'auto' },
      { avaliado_id: outro, avaliador_id: id, papel: 'gestor' },
      { avaliado_id: outro, avaliador_id: terceiro, papel: 'par' },
      { avaliado_id: terceiro, avaliador_id: outro, papel: 'par' },
    ];
    const { chamar } = carregar({ rh_aval360_convite: [{ data: [
      { avaliador_id: outro, papel: 'auto', origem: 'rh' }, { avaliador_id: terceiro, papel: 'liderado', origem: 'rh' },
      { avaliador_id: id, papel: 'gestor', origem: 'automatico', suprimido_em: 't' },
    ] }] }, { rpc: { data: hier }, ativos: [{ id: outro, nome: 'Marino' }, { id, nome: 'Gestor' }, { id: terceiro, nome: 'Colega' }] });
    const res = await chamar('get /ciclos/:id/pessoa/:avaliadoId', { params });
    expect(res.body.pessoa.nome).toBe('Marino');
    expect(res.body.sugestao.map((s: any) => [s.avaliador.nome, s.papel])).toEqual([['Gestor', 'gestor'], ['Colega', 'par']]);
    expect(res.body.atuais.map((s: any) => [s.avaliador.nome, s.papel])).toEqual([['Colega', 'liderado']]);
    expect(res.body.no_ciclo).toBe(true);
  });
  it('salvar define a lista e, se pedido, inclui os avaliadores como avaliados', async () => {
    const { chamar, supabase } = carregar({}, { rpcs: [{ data: { ok: true } }, { data: { incluidos: 1 } }] });
    const res = await chamar('put /ciclos/:id/avaliados/:avaliadoId', { params, body: {
      avaliadores: [{ avaliador_id: terceiro, papel: 'par', extra: 'x' }], incluir_avaliadores: true } });
    expect(res.body).toEqual({ ok: true, avaliadores: 1, incluidos: 1 });
    expect(supabase.rpc.mock.calls[0]).toEqual(['fn_aval360_definir_avaliadores',
      { p_ciclo_id: id, p_avaliado_id: outro, p_itens: [{ avaliador_id: terceiro, papel: 'par' }] }]);
    expect(supabase.rpc.mock.calls[1]).toEqual(['fn_aval360_incluir_padrao', { p_ciclo_id: id, p_avaliados: [terceiro] }]);
  });
  it('sem incluir_avaliadores não mexe em mais ninguém', async () => {
    const { chamar, supabase } = carregar();
    await chamar('put /ciclos/:id/avaliados/:avaliadoId', { params, body: { avaliadores: [{ avaliador_id: terceiro, papel: 'gestor' }] } });
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
  });
  it.each([[{ avaliadores: [{ avaliador_id: terceiro, papel: 'auto' }] }], [{ avaliadores: [{ avaliador_id: 'x', papel: 'par' }] }], [{}]])(
    'recusa lista inválida %j', async (body) => {
      const { chamar, supabase } = carregar();
      expect((await chamar('put /ciclos/:id/avaliados/:avaliadoId', { params, body })).statusCode).toBe(400);
      expect(supabase.rpc).not.toHaveBeenCalled();
    });
  it('remover chama a função do banco', async () => {
    const { chamar, supabase } = carregar();
    await chamar('post /ciclos/:id/avaliados/:avaliadoId/remover', { params });
    expect(supabase.rpc).toHaveBeenCalledExactlyOnceWith('fn_aval360_remover_avaliado', { p_ciclo_id: id, p_avaliado_id: outro });
  });
  it('perguntas: manda só competencia_id, texto e ajuda', async () => {
    const { chamar, supabase } = carregar();
    await chamar('put /ciclos/:id/perguntas', { params: { id }, body: { itens: [{ competencia_id: id, texto: 'Ouve?', ajuda: null, ordem: 9 }] } });
    expect(supabase.rpc).toHaveBeenCalledExactlyOnceWith('fn_aval360_salvar_perguntas',
      { p_ciclo_id: id, p_itens: [{ competencia_id: id, texto: 'Ouve?', ajuda: null }] });
  });
});

describe('360 · configurações da avaliação (01/10)', () => {
  const rasc = (config = {}) => ({ rh_aval360_ciclo: [{ data: { id, status: 'rascunho', escala_max: 6, config } }, { data: { id } }] });
  it('config chega parcial e é mesclada com a gravada', async () => {
    const { chamar, chamadas } = carregar(rasc({ devolutiva: false }));
    await chamar('patch /ciclos/:id', { body: { config: { exigir_comentario_auto: true } } });
    expect(op(chamadas, 'rh_aval360_ciclo', 'update')).toEqual({ config: { devolutiva: false, exigir_comentario_auto: true } });
  });
  it.each([[{ inventada: true }], [{ devolutiva: 'sim' }], [[true]]])('recusa config inválida %j', async (config) => {
    const { chamar, chamadas } = carregar(rasc());
    expect((await chamar('patch /ciclos/:id', { body: { config } })).statusCode).toBe(400);
    expect(op(chamadas, 'rh_aval360_ciclo', 'update')).toBeUndefined();
  });
  it('depois de enviado, a config ainda muda', async () => {
    const { chamar, chamadas } = carregar({ rh_aval360_ciclo: [{ data: { id, status: 'coleta', escala_max: 6, config: {} } }, { data: { id } }] });
    await chamar('patch /ciclos/:id', { body: { config: { participante_ve_quadrante: false } } });
    expect(op(chamadas, 'rh_aval360_ciclo', 'update')).toEqual({ config: { participante_ve_quadrante: false } });
  });
  it('critério: peso e visibilidade vão para a função do banco', async () => {
    const { chamar, supabase } = carregar();
    await chamar('put /ciclos/:id/criterios/:competenciaId', { params: { id, competenciaId: outro }, body: { peso: 2, visivel: false } });
    expect(supabase.rpc).toHaveBeenCalledExactlyOnceWith('fn_aval360_config_criterio', { p_ciclo_id: id, p_competencia_id: outro, p_peso: 2, p_visivel: false });
  });
});

describe('360 · o que cada um vê, segundo a configuração', () => {
  const base = (config: any) => ({
    ciclo: { config }, avaliado: { id: eu.id }, quadrante: 'Estrela', nivel_resultado: 'alto', nivel_comportamento: 'alto',
    papeis: { par: { respondentes: 3, visivel: true } }, entrega: { liberado_em: 't', devolutiva_obs: 'x' },
    criterios: [
      { competencia_id: 'c1', visivel: true, final: 5, auto: 6, gestor: 5, outros: 4, comentarios: [{ papel: 'par', texto: 'ok' }], justificativa: 'j' },
      { competencia_id: 'c2', visivel: false, final: 3, comentarios: [] },
    ],
  });
  const meu = { cicloId: id, avaliadoId: eu.id };
  const comoAvaliado = async (config: any) => (await carregar(
    { rh_aval360_ciclo: [{ data: { id, status: 'publicado' } }], rh_aval360_entrega: [{ data: { liberado_em: 't' } }] },
    { rpcs: [{ data: base(config) }] }).chamar('get /resultados/:cicloId/:avaliadoId', { params: meu })).body;
  it('critério oculto some para o avaliado (mas a nota final é a mesma)', async () => {
    const r = await comoAvaliado({});
    expect(r.criterios.map((c: any) => c.competencia_id)).toEqual(['c1']);
    expect(r.quadrante).toBe('Estrela');
  });
  it('sem quadrante e sem comentários para o participante', async () => {
    const r = await comoAvaliado({ participante_ve_quadrante: false, participante_ve_comentarios: false });
    expect(r).toMatchObject({ quadrante: null, nivel_resultado: null });
    expect(r.criterios[0].comentarios).toEqual([]);
  });
  it('só a nota final: some a nota de cada tipo de avaliador', async () => {
    const r = await comoAvaliado({ participante_so_nota_final: true });
    expect(r.criterios[0]).toEqual({ competencia_id: 'c1', visivel: true, final: 5 });
    expect(r.papeis).toEqual({});
  });
  it('gestor sem quadrante quando o ciclo manda', async () => {
    const { chamar } = carregar({ rh_aval360_ciclo: [{ data: { id, status: 'publicado' } }] },
      { rpcs: [{ data: true }, { data: base({ gestor_ve_quadrante: false }) }] });
    const r = (await chamar('get /resultados/:cicloId/:avaliadoId', { params: { cicloId: id, avaliadoId: outro } })).body;
    expect(r.quadrante).toBeNull();
    expect(r.criterios).toHaveLength(2);
  });
  it('gestor não libera quando o ciclo diz que é o RH', async () => {
    const { chamar, supabase } = carregar({ rh_aval360_ciclo: [{ data: { config: { gestor_libera: false } } }] });
    const res = await chamar('post /resultados/:cicloId/:avaliadoId/entrega', { params: { cicloId: id, avaliadoId: outro }, body: { liberar: true } });
    expect(res.statusCode).toBe(403);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
  it('sem devolutiva no ciclo, registrar devolutiva é 409', async () => {
    const { chamar } = carregar({ rh_aval360_ciclo: [{ data: { config: { devolutiva: false } } }] });
    const res = await chamar('post /ciclos/:id/resultados/:avaliadoId/entrega', { params: { id, avaliadoId: outro }, body: { devolutiva_dia: '2026-09-20' } });
    expect(res.statusCode).toBe(409);
  });
});

describe('360 · regra de resposta não muda no meio da coleta', () => {
  it('exigir comentário depois de enviado é 409', async () => {
    const { chamar, chamadas } = carregar({ rh_aval360_ciclo: [{ data: { id, status: 'coleta', escala_max: 6, config: {} } }] });
    const res = await chamar('patch /ciclos/:id', { body: { config: { exigir_comentario_auto: true } } });
    expect(res.statusCode).toBe(409);
    expect(op(chamadas, 'rh_aval360_ciclo', 'update')).toBeUndefined();
  });
});

describe('360 · exibir respostas pelos nomes (01/10)', () => {
  it('é configuração de TELA: muda mesmo com o ciclo aberto', async () => {
    const { chamar, chamadas } = carregar({ rh_aval360_ciclo: [{ data: { id, status: 'coleta', escala_max: 6, config: {} } }, { data: { id } }] });
    const res = await chamar('patch /ciclos/:id', { body: { config: { respostas_como_opcoes: true } } });
    expect(res.statusCode).toBe(200);
    expect(op(chamadas, 'rh_aval360_ciclo', 'update')).toEqual({ config: { respostas_como_opcoes: true } });
  });
  it('a lista do colaborador traz a config do ciclo para a tela decidir', async () => {
    const { chamar, chamadas } = carregar({ rh_aval360_convite: [{ data: [] }] });
    await chamar('get /minhas');
    const sel = chamadas.find((c) => c.tabela === 'rh_aval360_convite')?.ops.find((o: any[]) => o[0] === 'select')?.[1];
    expect(sel).toContain('config');
  });
});

describe('360 · lista de avaliações (01/10)', () => {
  it('cada ciclo vem com o resumo: pessoas, formulários, respondidos e perguntas', async () => {
    const { chamar, chamadas } = carregar({
      rh_aval360_ciclo: [{ data: [{ id: 'c1', nome: 'A', status: 'coleta' }, { id: 'c2', nome: 'B', status: 'rascunho' }] }],
      rh_aval360_convite: [{ data: [
        { ciclo_id: 'c1', avaliado_id: 'a', respondido_em: 't' }, { ciclo_id: 'c1', avaliado_id: 'a', respondido_em: null },
        { ciclo_id: 'c1', avaliado_id: 'b', respondido_em: null },
      ] }],
      rh_aval360_pergunta: [{ data: [{ ciclo_id: 'c1' }, { ciclo_id: 'c1' }, { ciclo_id: 'c2' }] }],
    });
    const res = await chamar('get /ciclos');
    expect(res.body.map((c: any) => [c.nome, c.resumo])).toEqual([
      ['A', { avaliados: 2, formularios: 3, respondidos: 1, perguntas: 2 }],
      ['B', { avaliados: 0, formularios: 0, respondidos: 0, perguntas: 1 }],
    ]);
    expect(chamadas.map((c) => c.tabela)).not.toContain('rh_aval360_nota');
  });
});

describe('360 · etapas: entregas e situação do próprio resultado (01/10)', () => {
  it('entregas agrupa por gestor do ciclo, com liberado/devolutiva e quem está sem gestor', async () => {
    const p = (id: string) => ({ id, nome: id.toUpperCase(), cargo: 'c' });
    const { chamar, chamadas } = carregar({
      rh_aval360_convite: [{ data: [
        { papel: 'auto', avaliado: p('a'), avaliador: p('a') }, { papel: 'auto', avaliado: p('b'), avaliador: p('b') },
        { papel: 'auto', avaliado: p('g'), avaliador: p('g') },
        { papel: 'gestor', avaliado: p('a'), avaliador: p('g') }, { papel: 'gestor', avaliado: p('b'), avaliador: p('g') },
      ] }],
      rh_aval360_entrega: [{ data: [{ avaliado_id: 'a', liberado_em: 't', devolutiva_dia: '2026-10-02' }] }],
    });
    const res = await chamar('get /ciclos/:id/entregas');
    expect(res.body.gestores).toHaveLength(1);
    expect(res.body.gestores[0]).toMatchObject({ gestor: { id: 'g' }, liberados: 1, devolutivas: 1 });
    expect(res.body.gestores[0].liderados.map((l: any) => [l.id, !!l.liberado_em])).toEqual([['a', true], ['b', false]]);
    expect(res.body.sem_gestor.map((l: any) => l.id)).toEqual(['g']);
    expect(chamadas.map((c) => c.tabela)).not.toContain('rh_aval360_nota');
  });
  it('a pessoa vê em que pé está o próprio resultado, sem nota', async () => {
    const { chamar } = carregar({
      rh_aval360_convite: [{ data: [
        { ciclo: { id: 'c1', nome: 'A', status: 'apuracao' } }, { ciclo: { id: 'c2', nome: 'B', status: 'publicado' } },
        { ciclo: { id: 'c3', nome: 'C', status: 'rascunho' } },
      ] }],
      rh_aval360_entrega: [{ data: [] }],
      rh_aval360_ciclo: [{ data: [] }],
    });
    const res = await chamar('get /resultados');
    expect(res.body.situacao.map((s: any) => [s.ciclo.nome, s.etapa])).toEqual([['A', 'apuracao'], ['B', 'aguardando_gestor']]);
  });
});

describe('360 · pacote 02/10 (rotas)', () => {
  it('editar a resposta usa a identidade do login', async () => {
    const { chamar, supabase } = carregar();
    await chamar('post /convite/:id/editar', { body: { notas: [{ pergunta_id: 'p', nota: 3 }], avaliador_id: 'outro' } });
    expect(supabase.rpc).toHaveBeenCalledExactlyOnceWith('fn_aval360_editar_resposta', { p_convite_id: id, p_avaliador_id: eu.id, p_notas: [{ pergunta_id: 'p', nota: 3 }] });
  });
  it('plano do gestor nunca vira plano de RH', async () => {
    const { chamar, supabase } = carregar();
    await chamar('post /resultados/:cicloId/:avaliadoId/plano', { params: { cicloId: id, avaliadoId: outro }, body: { plano: [{ texto: 'Ouvir mais', prazo: '2027-03-01', x: 1 }], p_eh_rh: true } });
    expect(supabase.rpc).toHaveBeenCalledExactlyOnceWith('fn_aval360_plano', { p_ciclo_id: id, p_avaliado_id: outro, p_por: eu.id, p_eh_rh: false, p_plano: [{ texto: 'Ouvir mais', prazo: '2027-03-01' }] });
  });
  it('ligar "mostrar abaixo de 3" reativa quem tinha saído', async () => {
    const { chamar, supabase } = carregar({ rh_aval360_ciclo: [{ data: { id, status: 'coleta', escala_max: 6, config: {} } }, { data: { id } }] });
    await chamar('patch /ciclos/:id', { body: { config: { mostrar_abaixo_do_piso: true } } });
    expect(supabase.rpc).toHaveBeenCalledExactlyOnceWith('fn_aval360_reativar_abaixo_piso', { p_ciclo_id: id });
  });
  it('cron sem o segredo é 401 e não lê nada', async () => {
    const { chamar, supabase } = carregar();
    const res = await chamar('get /cron/lembretes', { headers: {} });
    expect(res.statusCode).toBe(401);
    expect(supabase.from).not.toHaveBeenCalled();
  });
  it('cron com o segredo manda abertura uma vez só (registro antes do envio)', async () => {
    const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
    const { chamar, enviarEmail, chamadas } = carregar({
      rh_aval360_ciclo: [{ data: [{ id, nome: 'C', status: 'coleta', periodo_inicio: hoje, coleta_ate: '2999-01-01' }] }],
      rh_aval360_aviso: [{ data: null }, { data: null }, { data: null }],
      rh_aval360_convite: [{ data: [{ avaliado_id: 'x', avaliador: { id: 'a', nome: 'Ana Silva', email: 'ana@example.org' } }] }],
    });
    const res = await chamar('get /cron/lembretes', { headers: { authorization: 'Bearer segredo' } });
    expect(res.body.feitos).toEqual([expect.objectContaining({ tipo: 'abertura', enviados: 1 })]);
    expect(enviarEmail.mock.calls[0][0].subject).toContain('a avaliação começou');
    const insert = chamadas.filter((c) => c.tabela === 'rh_aval360_aviso').flatMap((c) => c.ops).find((o: any[]) => o[0] === 'insert');
    expect(insert?.[1]).toEqual({ ciclo_id: id, tipo: 'abertura' });
  });
  it('adesão por avaliado: o resultado de cada um sai completo?', async () => {
    const pess = (n: string) => ({ id: n, nome: n });
    const { chamar } = carregar({ rh_aval360_convite: [{ data: [
      { papel: 'auto', respondido_em: 't', avaliado: pess('a'), avaliador: pess('a') },
      { papel: 'gestor', respondido_em: null, avaliado: pess('a'), avaliador: pess('g') },
      { papel: 'par', respondido_em: 't', avaliado: pess('a'), avaliador: pess('b') },
      { papel: 'par', respondido_em: null, avaliado: pess('a'), avaliador: pess('c') },
    ] }] });
    const res = await chamar('get /ciclos/:id/adesao');
    expect(res.body.avaliados[0]).toMatchObject({ auto: true, gestor: { total: 1, respondidos: 0 }, par: { total: 2, respondidos: 1 } });
    expect(res.body.devendo).toEqual({ auto: 0, gestor: 1, outros: 1 });
  });
});

describe('360 · aviso de revisão de enquadramento no PCS (05/10)', () => {
  const ciclo = (status: string) => ({ data: { id, nome: 'Avaliação 2026', status, escala_max: 5 } });
  const ana = {
    avaliado: { id: outro, nome: 'Ana', cargo: 'Analista', area: 'Gestão' }, final: 4.25, gestor: 4.3, outros: 4.2,
    criterios: [{ competencia_id: 'e', nome: 'Entrega', final: 5 }, { competencia_id: 'p', nome: 'Postura', final: 3.5 }],
  };

  it('só existe com o ciclo publicado (a nota não muda mais)', async () => {
    const { chamar } = carregar({ rh_aval360_ciclo: [ciclo('apuracao')] });
    const res = await chamar('get /ciclos/:id/aviso-pcs');
    expect(res.statusCode).toBe(409);
  });

  it('o peso do critério no PCS entra na conta e o texto nunca fala em promoção', async () => {
    const { chamar } = carregar({
      rh_aval360_ciclo: [ciclo('publicado')],
      rh_aval360_competencia: [{ data: [{ id: 'e', nome: 'Entrega', peso_pcs: 3 }, { id: 'p', nome: 'Postura', peso_pcs: 1 }] }],
    }, { rpc: { data: [ana] } });
    const res = await chamar('get /ciclos/:id/aviso-pcs');
    expect(res.statusCode).toBe(200);
    const p = res.body.pessoas[0];
    expect(p.aviso).toBe('alta');
    expect(p.texto).toBe('Nota alta · verificar enquadramento no PCS');
    expect(JSON.stringify(res.body)).not.toMatch(/promo|salari/i);
    expect(res.body.peso_pcs_pendente).toBe(false);
  });

  it('sem a migration do peso (coluna ausente) todos pesam 1 e a tela é avisada', async () => {
    const { chamar } = carregar({
      rh_aval360_ciclo: [ciclo('publicado')],
      rh_aval360_competencia: [{ data: null, error: { code: '42703', message: 'column peso_pcs does not exist' } },
        { data: [{ id: 'e', nome: 'Entrega' }, { id: 'p', nome: 'Postura' }] }],
    }, { rpc: { data: [ana] } });
    const res = await chamar('get /ciclos/:id/aviso-pcs');
    expect(res.body.peso_pcs_pendente).toBe(true);
    expect(res.body.pessoas[0].aviso).toBeNull();
  });

  it('peso no PCS: de 0 a 5, de meio em meio', async () => {
    const { chamar } = carregar({ rh_aval360_competencia: [{ data: { id, peso_pcs: 2.5 } }] });
    expect((await chamar('put /competencias/:id/peso-pcs', { body: { peso_pcs: 0.3 } })).statusCode).toBe(400);
    expect((await chamar('put /competencias/:id/peso-pcs', { body: { peso_pcs: 6 } })).statusCode).toBe(400);
    const ok = await chamar('put /competencias/:id/peso-pcs', { body: { peso_pcs: 2.5 } });
    expect(ok.statusCode).toBe(200);
  });
});
