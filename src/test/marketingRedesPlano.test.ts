import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { join } from 'path';
import { semComentariosJs } from './_semComentarios';





const require = createRequire(import.meta.url);
const R = require('../../backend/utils/marketingRedesPlano.js');
const L = require('../../backend/utils/marketingLinha.js');

const raiz = join(__dirname, '..', '..');
const ler = (p: string) => readFileSync(join(raiz, p), 'utf8');
const RESP = '11111111-1111-4111-8111-111111111111';
const OUTRA = '22222222-2222-4222-8222-222222222222';

describe('semanas do mês · a semana é do mês da QUARTA-FEIRA', () => {
  it('outubro e novembro de 2026 têm 4 semanas; dezembro tem 5', () => {
    expect(R.semanasDoMes('2026-10').map((s: { inicio: string }) => s.inicio)).toEqual(['2026-10-04', '2026-10-11', '2026-10-18', '2026-10-25']);
    expect(R.semanasDoMes('2026-11').map((s: { inicio: string }) => s.inicio)).toEqual(['2026-11-01', '2026-11-08', '2026-11-15', '2026-11-22']);
    const dez = R.semanasDoMes('2026-12');
    expect(dez.map((s: { inicio: string }) => s.inicio)).toEqual(['2026-11-29', '2026-12-06', '2026-12-13', '2026-12-20', '2026-12-27']);

    expect(dez[0]).toMatchObject({ primeiro_dia: '2026-12-01', ultimo_dia: '2026-12-05' });
    expect(dez[4]).toMatchObject({ primeiro_dia: '2026-12-27', ultimo_dia: '2026-12-31' });
  });

  it('nenhuma semana é de dois meses (a de 27/09 a 03/10 é de setembro)', () => {
    const set = R.semanasDoMes('2026-09').map((s: { inicio: string }) => s.inicio);
    const out = R.semanasDoMes('2026-10').map((s: { inicio: string }) => s.inicio);
    expect(set).toContain('2026-09-27');
    expect(out).not.toContain('2026-09-27');
    expect(R.semanaDoMes('2026-09-27')).toEqual({ mes: '2026-09', n: 5, total: 5 });
  });

  it('vira o ano: a de 27/12 é a última de dezembro, a de 03/01 é a 1ª de janeiro', () => {
    expect(R.semanaDoMes('2026-12-27')).toEqual({ mes: '2026-12', n: 5, total: 5 });
    expect(R.semanaDoMes('2027-01-03')).toEqual({ mes: '2027-01', n: 1, total: 4 });
  });

  it('mês inválido não vira grade vazia: erra', () => {
    expect(() => R.semanasDoMes('2026-13')).toThrow(/mês inválido/);
  });
});

describe('rotina mensal · em que semana ela cai', () => {
  const analise = { frequencia: 'mensal', semana_do_mes: -3 };
  const plano = { frequencia: 'mensal', semana_do_mes: -2 };
  const ultima = { frequencia: 'mensal', semana_do_mes: -1 };
  const quinta = { frequencia: 'mensal', semana_do_mes: 5 };
  const cai = (c: object, mes: string) => R.semanasDoMes(mes).filter((s: { inicio: string }) => R.compromissoNaSemana(c, s.inicio)).map((s: { inicio: string }) => s.inicio);

  it('antepenúltima, penúltima e última (mês de 4 e de 5 semanas)', () => {
    expect(cai(analise, '2026-11')).toEqual(['2026-11-08']);
    expect(cai(plano, '2026-11')).toEqual(['2026-11-15']);
    expect(cai(ultima, '2026-11')).toEqual(['2026-11-22']);
    expect(cai(analise, '2026-12')).toEqual(['2026-12-13']);
    expect(cai(plano, '2026-12')).toEqual(['2026-12-20']);
  });

  it('"5ª semana" não existe em mês de 4; a semanal cai em todas', () => {
    expect(cai(quinta, '2026-11')).toEqual([]);
    expect(cai(quinta, '2026-12')).toEqual(['2026-12-27']);
    expect(cai({ frequencia: 'semanal' }, '2026-11')).toHaveLength(4);
    expect(cai({}, '2026-11')).toHaveLength(4);
    expect(cai({ frequencia: 'mensal', semana_do_mes: 9 }, '2026-11')).toEqual([]);
  });

  it('o planejamento feito numa semana é do mês SEGUINTE', () => {
    expect(R.mesDoPlanejamento('2026-11-15')).toBe('2026-12');
    expect(R.mesDoPlanejamento('2026-12-20')).toBe('2027-01');
  });
});

describe('produzir na semana ANTERIOR à da postagem', () => {
  it('a Semana 1 é produzida na última semana do mês anterior; a 2 na 1ª do mês', () => {
    expect(R.semanaDeProducao('2026-12', 1).inicio).toBe('2026-11-22');
    expect(R.semanaDeProducao('2026-12', 2).inicio).toBe('2026-11-29');
    expect(R.semanaDeProducao('2026-12', 5).inicio).toBe('2026-12-20');
    expect(R.semanaDeProducao('2027-01', 1).inicio).toBe('2026-12-27');
    expect(() => R.semanaDeProducao('2026-12', 6)).toThrow(/fora/);
  });
});

describe('validar o planejamento', () => {
  const post = (extra: Record<string, unknown> = {}) => ({
    semana: 1, dia_provavel: '2026-12-01', nome: 'Reels', ref_url: '', descricao: '', responsavel_membro_id: RESP, ref_arquivos: [], ...extra,
  });
  const v = (posts: unknown[], resp: string | null = RESP) => R.validarPlano({ posts, responsavel_membro_id: resp }, { mes: '2026-12' });

  it('a linha em branco de sobra não conta; o resto sai normalizado e com ordem', () => {
    const r = v([post(), post({ nome: '', dia_provavel: '2026-12-01' }), post({ nome: '  Carrossel  ', dia_provavel: '2026-12-03' }), post({ semana: 2, dia_provavel: '2026-12-06', nome: 'Live' })]);
    expect(r.ok).toBe(true);
    expect(r.posts.map((p: { nome: string; ordem: number; semana: number }) => `${p.semana}.${p.ordem} ${p.nome}`)).toEqual(['1.1 Reels', '1.2 Carrossel', '2.1 Live']);
  });

  it('falta de nome, dia fora da semana, link que não é link e sem responsável: recusa com o motivo', () => {
    expect(v([post({ nome: '', descricao: 'só a obs' })]).erro).toMatch(/Semana 1: falta o nome/);
    expect(v([post({ dia_provavel: '2026-11-30' })]).erro).toMatch(/entre 01\/12 e 05\/12/);
    expect(v([post({ dia_provavel: '2026-12-06' })]).erro).toMatch(/entre 01\/12 e 05\/12/);
    expect(v([post({ ref_url: 'drive interno' })]).erro).toMatch(/precisa ser um link/);
    expect(v([post({ ref_url: 'javascript:alert(1)' })]).erro).toMatch(/precisa ser um link/);
    expect(v([post({ responsavel_membro_id: null })]).erro).toMatch(/escolha o responsável/);
    expect(v([post({ semana: 6, dia_provavel: '2027-01-03' })]).erro).toMatch(/semana que este mês não tem/);
    expect(v([post({ id: 'abc' })]).erro).toMatch(/Postagem inválida/);
    expect(v([post()], null).erro).toMatch(/quem produz e posta/);
  });
});

describe('o que o planejamento vira em Redes · Produção', () => {
  const posts = [
    { id: 'p1', semana: 1, ordem: 1, dia_provavel: '2026-12-02', nome: 'Reels', responsavel_membro_id: OUTRA },
    { id: 'p2', semana: 1, ordem: 2, dia_provavel: '2026-12-04', nome: 'Carrossel', responsavel_membro_id: RESP },
    { id: 'p3', semana: 3, ordem: 1, dia_provavel: '2026-12-15', nome: 'Live', responsavel_membro_id: RESP },
  ];
  const cards = R.tarefasDoPlano({ mes: '2026-12', posts, responsavel_membro_id: RESP });

  it('dois cards por semana COM postagem (produzir · postar); semana vazia não tem card', () => {
    expect(cards.map((c: { semana: number; etapa: string }) => `${c.semana}-${c.etapa}`)).toEqual(['1-producao', '1-postagem', '3-producao', '3-postagem']);
  });

  it('produzir: na semana anterior, para quem produz e posta, cada item com o seu responsável', () => {
    const prod1 = cards[0];
    expect(prod1).toMatchObject({ titulo: 'Produzir posts · Semana 1 de Dezembro', data_inicio: '2026-11-22', data_fim: '2026-11-28', atribuido_a: RESP });
    expect(prod1.itens.map((i: { texto: string; membro_id: string; prazo: string }) => [i.texto, i.membro_id, i.prazo])).toEqual([
      ['Reels', OUTRA, '2026-11-28'], ['Carrossel', RESP, '2026-11-28'],
    ]);
    expect(cards[2]).toMatchObject({ data_inicio: '2026-12-06', data_fim: '2026-12-12' });
  });

  it('postar: na semana da postagem, cada item no dia provável, com quem posta', () => {
    const post1 = cards[1];
    expect(post1).toMatchObject({ titulo: 'Postar · Semana 1 de Dezembro', data_inicio: '2026-11-29', data_fim: '2026-12-05', atribuido_a: RESP });
    expect(post1.itens.map((i: { prazo: string; membro_id: string }) => [i.prazo, i.membro_id])).toEqual([['2026-12-02', RESP], ['2026-12-04', RESP]]);
  });

  it('o planejamento em branco: uma postagem por semana, no 1º dia dela no mês', () => {
    expect(R.planoEmBranco('2026-12', RESP).map((p: { semana: number; dia_provavel: string }) => `${p.semana}:${p.dia_provavel}`))
      .toEqual(['1:2026-12-01', '2:2026-12-06', '3:2026-12-13', '4:2026-12-20', '5:2026-12-27']);
  });
});

describe('arquivos de referência e o que a subtarefa mostra', () => {
  it('fica o que já estava gravado; o novo vai para conferência; o inventado sai', () => {
    const gravados = [{ item_id: 'sp1', nome: 'ref.png', web_url: 'https://sp/ref.png' }];
    const r = R.separarRefs([
      { item_id: 'sp1' },
      { item_id: 'sp-falso', nome: 'x', web_url: 'https://evil' },
      { drive_id: 'D1', sharepoint_item_id: 'sp2' },
    ], gravados);
    expect(r.manter).toEqual(gravados);
    expect(r.conferir).toEqual([{ drive_id: 'D1', sharepoint_item_id: 'sp2' }]);
  });

  it('a subtarefa gerada ganha a ref, os arquivos e a descrição da postagem', () => {
    const cards = [{ itens: [{ id: 's1' }, { id: 's2' }, { id: 's3' }] }];
    R.anotarPostagens(cards, [{
      dia_provavel: '2026-12-02', ref_url: 'https://ex.com', descricao: 'obs', subtarefa_producao_id: 's1', subtarefa_postagem_id: 's2',
      ref_arquivos: [{ nome: 'a.png', web_url: 'https://sp/a', item_id: 'x' }],
    }]);
    expect(cards[0].itens[0]).toMatchObject({ plano: { etapa: 'producao', ref_url: 'https://ex.com', descricao: 'obs', ref_arquivos: [{ nome: 'a.png', web_url: 'https://sp/a' }] } });
    expect(cards[0].itens[1]).toMatchObject({ plano: { etapa: 'postagem' } });
    expect(cards[0].itens[2]).not.toHaveProperty('plano');
  });
});

describe('a rotina mensal nas Demandas (tarefasDaRotina)', () => {
  const semanas = L.semanasDoAno(2026).filter((w: { inicio: string }) => w.inicio >= '2026-11-01' && w.inicio <= '2026-11-29');
  const comp = [
    { id: 'c1', descricao: 'Captações', participantes_ids: ['m1'], dia_semana: 0, duracao_h: 2 },
    { id: 'c2', descricao: 'Análise do YouTube · como foram os conteúdos (enviar o report)', participantes_ids: ['m1'], frequencia: 'mensal', semana_do_mes: -3, dia_semana: 1, duracao_h: 2 },
    { id: 'c3', descricao: 'Planejamento de postagens do próximo mês', participantes_ids: ['m1'], frequencia: 'mensal', semana_do_mes: -2, tipo: 'planejamento_postagens', dia_semana: 1, duracao_h: 4 },
  ];
  const t = L.tarefasDaRotina({ compromissos: comp, execucoes: [], semanas, ctx: { lider: true, meusMembroIds: [] }, frente: 'red' });

  it('a semanal segue num card por pessoa × semana; a mensal ganha card SÓ DELA, só na semana certa', () => {
    const semanais = t.filter((x: { mensal?: boolean }) => !x.mensal);
    expect(semanais).toHaveLength(5);
    expect(semanais.every((x: { itens: { compromisso_id: string }[] }) => x.itens.every(i => i.compromisso_id === 'c1'))).toBe(true);
    const mensais = t.filter((x: { mensal?: boolean }) => x.mensal);
    expect(mensais.map((x: { semana_inicio: string; titulo: string }) => `${x.semana_inicio} ${x.titulo}`)).toEqual([
      '2026-11-08 Análise do YouTube', '2026-11-15 Planejamento de postagens do próximo mês',
    ]);
  });

  it('o card do planejamento sabe de que mês é e abre o editor', () => {
    const p = t.find((x: { tipo_rotina?: string }) => x.tipo_rotina === 'planejamento_postagens');
    expect(p).toMatchObject({ mes_planejado: '2026-12', compromisso_id: 'c3' });
  });
});

describe('frequência vinda do Configurar', () => {
  it('semanal sem semana do mês; mensal com uma das semanas válidas; nada = nada muda', () => {
    expect(R.validarFrequencia({})).toEqual({ ok: true, campos: {} });
    expect(R.validarFrequencia({ frequencia: 'semanal', semana_do_mes: 3 })).toEqual({ ok: true, campos: { frequencia: 'semanal', semana_do_mes: null } });
    expect(R.validarFrequencia({ frequencia: 'mensal', semana_do_mes: '-3' })).toEqual({ ok: true, campos: { frequencia: 'mensal', semana_do_mes: -3 } });
    expect(R.validarFrequencia({ frequencia: 'mensal', semana_do_mes: 0 }).erro).toMatch(/semana do mês/);
    expect(R.validarFrequencia({ frequencia: 'anual' }).erro).toMatch(/Frequência inválida/);
  });

  it('o rótulo da tela do Configurar espelha o do servidor', () => {
    const tela = ler('src/pages/marketing/MarketingAdmin.jsx');
    for (const [k, v] of Object.entries(R.ROTULO_SEMANA_DO_MES)) {
      const chave = String(k).startsWith('-') ? `'${k}'` : k;
      expect(tela).toContain(`${chave}: '${v}'`);
    }
  });
});

describe('guardas de estrutura', () => {
  const linha = semComentariosJs(ler('backend/routes/marketingLinha.js'));
  const mkt = semComentariosJs(ler('backend/routes/marketing.js'));
  const migration = ler('supabase/migrations/20261005180000_mkt_redes_rotinas_mensais.sql');

  it('as rotas do planejamento existem, no módulo, e só quem planeja (ou o líder) salva', () => {
    expect(linha).toContain("router.get('/redes/planos/:mes', authorizeModule('marketing', 1)");
    expect(linha).toContain("router.put('/redes/planos/:mes', authorizeModule('marketing', 1)");
    expect(linha).toContain("router.post('/redes/planos/:mes/ref/sessao', authorizeModule('marketing', 1)");
    const put = linha.slice(linha.indexOf("router.put('/redes/planos/:mes'"));
    expect(put.indexOf('if (!pode) return res.status(403)')).toBeGreaterThan(-1);
    expect(put.indexOf('if (!pode) return res.status(403)')).toBeLessThan(put.indexOf('RP.validarPlano('));
  });

  it('⚠️ arquivo novo de referência é LIDO no SharePoint e conferido na pasta antes de gravar', () => {
    const put = linha.slice(linha.indexOf("router.put('/redes/planos/:mes'"));
    const iLer = put.indexOf('SE.lerItemDoDrive(');
    const iPasta = put.indexOf('E.itemNaPasta({ driveItem: sp, driveId, pasta })');
    const iGrava = put.indexOf("from('marketing_redes_plano_posts')");
    expect(iLer).toBeGreaterThan(-1);
    expect(iPasta).toBeGreaterThan(iLer);
    expect(iGrava).toBeGreaterThan(iPasta);
  });

  it('salvar: a subtarefa feita não é mexida, a que saiu só some se aberta, e a rotina fica feita', () => {
    const put = linha.slice(linha.indexOf("router.put('/redes/planos/:mes'"));
    expect(put).toContain('if (sub && sub.feito) continue;');
    expect(put).toMatch(/from\('marketing_card_checklist'\)\.delete\(\)\.eq\('id', sub\)\.eq\('feito', false\)/);
    expect(put).toMatch(/from\('marketing_rotina_execucoes'\)[\s\S]{0,40}\.upsert\(linhas/);
  });

  it('o card de planejamento não se marca no clique (fica feito ao salvar)', () => {
    const putRot = linha.slice(linha.indexOf("router.put('/rotina/:compromissoId/:semanaInicio'"));
    expect(putRot.slice(0, 1500)).toContain("codigo: 'planejamento_obrigatorio'");
  });

  it('o Configurar grava a frequência pela régua e diz quando falta a migration', () => {
    expect(mkt).toContain("const { validarFrequencia } = require('../utils/marketingRedesPlano');");
    expect((mkt.match(/validarFrequencia\(\{ frequencia: req\.body\?\.frequencia/g) || []).length).toBe(2);
    expect(mkt).toContain('MSG_MENSAL_SEM_MIGRATION');
  });

  it('a migration: colunas com CHECK, tabelas só do backend sem atribuições nominais no código público', () => {
    expect(migration).toContain("CHECK (frequencia IN ('semanal', 'mensal'))");
    expect(migration).toContain("semana_do_mes IN (1, 2, 3, 4, 5, -1, -2, -3)");

    expect(migration).toMatch(/frequencia = 'mensal' AND semana_do_mes IS NOT NULL/);
    expect(migration).toContain("CHECK (tipo IN ('comum', 'planejamento_postagens'))");
    for (const t of ['marketing_redes_planos', 'marketing_redes_plano_posts', 'marketing_redes_plano_cards']) {
      expect(migration).toContain(`CREATE TABLE IF NOT EXISTS public.${t}`);
      expect(migration).toContain(`ALTER TABLE public.${t}`);
    }
    expect(migration).not.toMatch(/p\.name\s+ILIKE/i);
    expect((migration.match(/TO anon, authenticated USING \(false\) WITH CHECK \(false\)/g) || []).length).toBe(3);
  });
});
