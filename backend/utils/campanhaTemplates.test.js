const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const T = require('./campanhaTemplates');
















let n = 0;
function t(nome, fn) { fn(); n += 1; console.log(`  ✓ ${nome}`); }


t('legado não aparece na lista de criação, mas continua resolvendo', () => {
  assert.ok(!T.listarTemplates().some((x) => x.id === 'legado'));
  assert.equal(T.templateDe({ template: 'legado' }).porta, null);
  assert.equal(T.templateDe({}).id, 'legado');
  assert.equal(T.templateDe({ template: 'xyz' }).id, 'legado');
  assert.deepEqual(T.templateDe({ template: 'legado' }).abas, ['geral', 'cronograma', 'disparos', 'doacoes']);
});
t('generosidade exige alvo em reais; pessoas exige alvo em pessoas', () => {
  assert.ok(T.validarNova({ template: 'generosidade', nome: 'X' }).erro);
  assert.ok(T.validarNova({ template: 'generosidade', nome: 'X', meta_centavos: 0 }).erro);
  const ok = T.validarNova({ template: 'generosidade', nome: 'X', meta_centavos: 100000 });
  assert.equal(ok.valores.meta_centavos, 100000);
  assert.equal(ok.valores.meta_pessoas, null);
  assert.equal(ok.valores.meses, 12, 'meses padrão do template');
  assert.equal(ok.valores.faixas.length, 5, 'faixas padrão do template');
  assert.ok(T.validarNova({ template: 'voluntariado', nome: 'V', meta_centavos: 5000, data_inicio: '2026-10-01', data_fim: '2026-10-31' }).erro,
    'voluntariado não aceita alvo em reais no lugar de pessoas');
  const v = T.validarNova({ template: 'voluntariado', nome: 'V', meta_pessoas: 80, data_inicio: '2026-10-01', data_fim: '2026-10-31' });
  assert.equal(v.valores.meta_pessoas, 80);
  assert.equal(v.valores.meta_centavos, null);
});
t('voluntariado sem janela é recusado (a janela define quem é da campanha)', () => {
  assert.ok(T.validarNova({ template: 'voluntariado', nome: 'V', meta_pessoas: 80 }).erro);
});
t('template inválido ou oculto é recusado', () => {
  assert.ok(T.validarNova({ template: 'legado', nome: 'X', meta_centavos: 1 }).erro);
  assert.ok(T.validarNova({ nome: 'X', meta_centavos: 1 }).erro);
});
t('faixas: rótulo obrigatório, sem repetição, centavos > 0, "outro" sem valor', () => {
  assert.ok(T.validarFaixas([{ rotulo: '', centavos: 1 }]).erro);
  assert.ok(T.validarFaixas([{ rotulo: 'A', centavos: 1 }, { rotulo: 'a', centavos: 2 }]).erro);
  assert.ok(T.validarFaixas([{ rotulo: 'A', centavos: 0 }]).erro);
  assert.deepEqual(T.validarFaixas([{ rotulo: 'Outro', outro: true }]).faixas, [{ rotulo: 'Outro', outro: true }]);
  assert.ok(T.validarFaixas(Array.from({ length: 9 }, (_, i) => ({ rotulo: `F${i}`, centavos: 100 }))).erro);
  assert.deepEqual(T.validarFaixas(undefined).faixas, []);
});


const FAIXAS = [{ rotulo: 'R$ 100 por mês', centavos: 10000 }, { rotulo: 'Outro valor', outro: true }];
t('compromisso vem da faixa; "outro" lê reais em qualquer grafia', () => {
  assert.equal(T.compromissoDe(FAIXAS, { faixa: 'R$ 100 por mês' }), 10000);
  assert.equal(T.compromissoDe(FAIXAS, { faixa: 'Outro valor', valor_outro: '150' }), 15000);
  assert.equal(T.compromissoDe(FAIXAS, { faixa: 'Outro valor', valor_outro: 'R$ 1.250,50' }), 125050);
  assert.equal(T.compromissoDe(FAIXAS, { faixa: 'Outro valor', valor_outro: 'abc' }), null);
  assert.equal(T.compromissoDe(FAIXAS, { faixa: 'Outro valor', valor_outro: '0' }), null);
  assert.equal(T.compromissoDe(FAIXAS, { faixa: 'não existe' }), null);
  assert.equal(T.compromissoDe(FAIXAS, {}), null);
  assert.equal(T.compromissoDe([], { faixa: 'R$ 100 por mês' }), null);
});
t('campos do evento de adesão: escolha + "outro" condicionado à faixa', () => {
  const c = T.camposAdesao(FAIXAS);
  assert.equal(c.length, 2);
  assert.equal(c[0].key, 'faixa');
  assert.equal(c[0].tipo, 'escolha');
  assert.deepEqual(c[0].opcoes, ['R$ 100 por mês', 'Outro valor']);
  assert.equal(c[1].key, 'valor_outro');
  assert.deepEqual(c[1].mostrar_se, { key: 'faixa', valores: ['Outro valor'] });
  assert.deepEqual(T.camposAdesao([]), []);
  assert.equal(T.camposAdesao([{ rotulo: 'A', centavos: 1 }]).length, 1, 'sem "outro" não há campo numérico');
});
t('espelho SQL: o trigger lê as MESMAS chaves (faixa · valor_outro · rotulo · centavos · outro)', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', '..', 'supabase', 'migrations',
    '20260928170000_campanhas_tres_reguas.sql'), 'utf8');
  for (const chave of ["'faixa'", "'valor_outro'", "'rotulo'", "'centavos'", "'outro'", 'contrato_minimo := true',
    'BEFORE INSERT OR UPDATE OF dados']) {
    assert.ok(sql.includes(chave), `migration sem ${chave}`);
  }


  assert.ok(/def !~ 'evento' OR def !~ 'retiro' OR def !~ 'adesao'/.test(sql));
  assert.ok(/def !~ 'doadores_campanha' OR def !~ 'aderentes_em_atraso'/.test(sql));
  assert.ok(sql.includes('NOT VALID'), 'CHECK do contrato entra NOT VALID + VALIDATE');
});


t('meses decorridos: início conta inteiro, teto em meses, antes do início = 0', () => {
  assert.equal(T.mesesDecorridos({ data_inicio: '2026-10-01', hoje: '2026-09-28', meses: 12 }), 0);
  assert.equal(T.mesesDecorridos({ data_inicio: '2026-10-01', hoje: '2026-10-01', meses: 12 }), 1);
  assert.equal(T.mesesDecorridos({ data_inicio: '2026-10-15', hoje: '2026-10-14', meses: 12 }), 0);
  assert.equal(T.mesesDecorridos({ data_inicio: '2026-10-01', hoje: '2026-12-31', meses: 12 }), 3);
  assert.equal(T.mesesDecorridos({ data_inicio: '2026-10-01', hoje: '2027-09-30', meses: 12 }), 12);
  assert.equal(T.mesesDecorridos({ data_inicio: '2026-10-01', hoje: '2027-10-01', meses: 12 }), 12, 'teto');
  assert.equal(T.mesesDecorridos({ data_inicio: '2026-10-01', hoje: '2027-10-01', meses: null }), 13, 'sem teto');
  assert.equal(T.mesesDecorridos({ data_inicio: null, hoje: '2027-10-01', meses: 12 }), 0);
});
t('réguas de dinheiro: alvo × prometido (total e até hoje) × realizado', () => {
  const r = T.reguas({
    campanha: { template: 'generosidade', meta_centavos: 1200000, meses: 12, data_inicio: '2026-10-01' },
    inscritos: [
      { compromisso_centavos: 10000 }, { compromisso_centavos: 20000 },
      { compromisso_centavos: 5000, status: 'cancelada' }, { compromisso_centavos: null },
    ],
    realizado: { total_centavos: 45000 },
    hoje: '2026-11-15',
  });
  assert.equal(r.unidade, 'centavos');
  assert.equal(r.alvo.valor, 1200000);
  assert.equal(r.inscritos.pessoas, 3, 'cancelada sai; sem compromisso conta como pessoa');
  assert.equal(r.inscritos.com_compromisso, 2);
  assert.equal(r.inscritos.compromisso_mensal_centavos, 30000);
  assert.equal(r.inscritos.prometido_total_centavos, 360000);
  assert.equal(r.inscritos.meses_decorridos, 2);
  assert.equal(r.inscritos.prometido_ate_hoje_centavos, 60000);
  assert.equal(r.realizado.valor, 45000);
  assert.equal(r.pct.inscritos_vs_alvo, 30);
  assert.equal(r.pct.realizado_vs_alvo, 3.8);
  assert.equal(r.pct.realizado_vs_prometido, 75);
});
t('réguas de pessoas: inscritos contra o alvo, realizado contra inscritos', () => {
  const r = T.reguas({
    campanha: { template: 'voluntariado', meta_pessoas: 80 },
    inscritos: [{}, {}, {}, { status: 'cancelada' }],
    realizado: { pessoas: 2 },
    hoje: '2026-10-20',
  });
  assert.equal(r.unidade, 'pessoas');
  assert.equal(r.alvo.valor, 80);
  assert.equal(r.inscritos.pessoas, 3);
  assert.equal(r.realizado.valor, 2);
  assert.equal(r.pct.inscritos_vs_alvo, 3.8);
  assert.equal(r.pct.realizado_vs_prometido, 66.7);
});
t('réguas sem alvo nem inscritos não dividem por zero', () => {
  const r = T.reguas({ campanha: { template: 'generosidade' }, hoje: '2026-10-01' });
  assert.equal(r.pct.inscritos_vs_alvo, 0);
  assert.equal(r.pct.realizado_vs_prometido, 0);
});


t('?qr= só vira etiqueta quando é slug de link curto', () => {
  assert.equal(T.qrSlugValido('vol-templo'), 'vol-templo');
  assert.equal(T.qrSlugValido('VOL-Templo'), 'vol-templo');
  assert.equal(T.qrSlugValido('a'), null);
  assert.equal(T.qrSlugValido('-abc'), null);
  assert.equal(T.qrSlugValido('abc-'), null);
  assert.equal(T.qrSlugValido('tem espaço'), null);
  assert.equal(T.qrSlugValido("x'); drop"), null);
  assert.equal(T.qrSlugValido(''), null);
  assert.equal(T.qrSlugValido(undefined), null);
});


t('slug de ativação cabe no CHECK do link_curto', () => {
  const s = T.slugAtivacao('generosidade-2027', 'Banner do lounge (entrada)');
  assert.equal(s, 'generosidade-2027-banner-do-lounge-entrada');
  assert.ok(T.SLUG_RE.test(s));
  const longo = T.slugAtivacao('uma-campanha-com-nome-bem-comprido-mesmo', 'story do instagram da semana de lançamento');
  assert.ok(longo.length <= 50 && T.SLUG_RE.test(longo), longo);
  assert.ok(T.SLUG_RE.test(T.slugAtivacao('', '')));
});


t('inscritos por ativação: conversão = inscritos ÷ acessos; sem QR fica separado', () => {
  const r = T.inscritosPorAtivacao(
    [{ slug: 'g-lounge', acessos: 40 }, { slug: 'g-story', acessos: 0 }],
    [{ qr_slug: 'g-lounge' }, { qr_slug: 'g-lounge' }, { qr_slug: null }, { qr_slug: 'desconhecido' }],
  );
  assert.equal(r.ativacoes[0].inscritos, 2);
  assert.equal(r.ativacoes[0].conversao_pct, 5);
  assert.equal(r.ativacoes[1].inscritos, 0);
  assert.equal(r.ativacoes[1].conversao_pct, 0);
  assert.equal(r.sem_qr, 2);
});
t('status do evento de adesão segue a campanha', () => {
  assert.equal(T.statusEventoAdesao('ativa'), 'publicado');
  assert.equal(T.statusEventoAdesao('rascunho'), 'rascunho');
  assert.equal(T.statusEventoAdesao('pausada'), 'encerrado');
  assert.equal(T.statusEventoAdesao('encerrada'), 'encerrado');
});

t('status do aderente: compromisso × meses decorridos contra o que o CPF trouxe', () => {
  const S = T.statusAderente;
  assert.equal(S({ compromisso_centavos: 10000, total_centavos: 0, meses_decorridos: 0 }), 'aguardando');
  assert.equal(S({ compromisso_centavos: 10000, total_centavos: 0, meses_decorridos: 1 }), 'sem_entrada');
  assert.equal(S({ compromisso_centavos: 10000, total_centavos: 10007, meses_decorridos: 1 }), 'em_dia');
  assert.equal(S({ compromisso_centavos: 10000, total_centavos: 10007, meses_decorridos: 2 }), 'atrasado');
  assert.equal(S({ compromisso_centavos: 10000, total_centavos: 20014, meses_decorridos: 2 }), 'em_dia');
  assert.equal(S({ compromisso_centavos: 0, total_centavos: 0, meses_decorridos: 3 }), 'sem_compromisso');

  assert.equal(S({ compromisso_centavos: 0, total_centavos: 5000, meses_decorridos: 3 }), 'em_dia');
  assert.equal(S({ compromisso_centavos: null, total_centavos: null, meses_decorridos: null }), 'sem_compromisso');
  assert.equal(T.aderenteEmAtraso('atrasado'), true);
  assert.equal(T.aderenteEmAtraso('sem_entrada'), true);
  assert.equal(T.aderenteEmAtraso('sem_compromisso'), false);
  assert.equal(T.aderenteEmAtraso('aguardando'), false);
});
t('resumo dos aderentes FECHA com o total e ignora cancelada', () => {
  const r = T.resumoAderentes([
    { status_aderente: 'em_dia', total_centavos: 10007 },
    { status_aderente: 'atrasado', total_centavos: 5000 },
    { status_aderente: 'sem_entrada', total_centavos: 0 },
    { status_aderente: 'em_dia', status: 'cancelada', total_centavos: 999 },
    { compromisso_centavos: 0, total_centavos: 0, meses_decorridos: 2 },
  ]);
  assert.equal(r.total, 4);
  assert.equal(r.em_dia + r.atrasado + r.sem_entrada + r.sem_compromisso + r.aguardando, r.total);
  assert.equal(r.sem_compromisso, 1);
  assert.equal(r.total_entradas_centavos, 15007);
});

t('valor → template: todo valor da mandala tem template ou diz que não tem', () => {
  for (const id of Object.keys(T.VALORES)) {
    const t = T.templatePorValor(id);
    assert.ok(t, id); assert.equal(t.valor, id); assert.ok(!t.oculto);
  }

  assert.deepEqual(Object.keys(T.VALORES).sort(), ['generosidade', 'grupos', 'investir', 'seguir', 'voluntarios']);
  assert.equal(T.VALORES.generosidade, 'Viver Generosamente');
  assert.equal(T.templatePorValor('decisoes'), null);
  const v = T.listarValores();
  assert.equal(v.length, Object.keys(T.VALORES).length);
  assert.ok(v.every((x) => x.indicador && x.indicador.manutencao));
});
t('com sinal × sem sinal: só generosidade promete antes de fazer', () => {
  assert.equal(T.TEMPLATES.generosidade.sinal, true);
  for (const id of ['voluntariado', 'grupos', 'seguir', 'investir']) assert.equal(T.TEMPLATES[id].sinal, false, id);
});
t('validarNova pelo VALOR: sem sinal exige janela; decisões não tem template', () => {
  assert.ok(T.validarNova({ valor: 'grupos', nome: 'Grupos 2027', meta_pessoas: 200 }).erro);
  const ok = T.validarNova({ valor: 'grupos', nome: 'Grupos 2027', meta_pessoas: 200, data_inicio: '2027-02-01', data_fim: '2027-03-15' });
  assert.equal(ok.erro, undefined); assert.equal(ok.template.id, 'grupos'); assert.equal(ok.valores.valor, 'grupos');
  assert.ok(/não tem template/.test(T.validarNova({ valor: 'decisoes', nome: 'x' }).erro));
  const gen = T.validarNova({ valor: 'generosidade', nome: 'G 2027', meta_centavos: 100000 });
  assert.equal(gen.erro, undefined); assert.equal(gen.template.id, 'generosidade');
});
t('série de 12 meses: mês BRT, zero explícito, marca a janela da campanha', () => {
  const s = T.serieMensal({
    ate: '2026-09', janela: { data_inicio: '2026-08-10', data_fim: '2026-09-20' },
    linhas: [
      { quando: '2026-09-01T01:30:00Z', qr_slug: 'vol-templo' },
      { quando: '2026-09-05', qr_slug: null },
      { quando: '2025-12-15', qr_slug: null },
      { quando: 'lixo' },
    ],
  });
  assert.equal(s.length, 12);
  assert.equal(s[0].mes, '2025-10'); assert.equal(s[11].mes, '2026-09');
  const ago = s.find((x) => x.mes === '2026-08'); const set = s.find((x) => x.mes === '2026-09');
  assert.equal(ago.total, 1); assert.equal(ago.com_qr, 1); assert.equal(ago.na_campanha, true);
  assert.equal(set.total, 1); assert.equal(set.com_qr, 0); assert.equal(set.na_campanha, true);
  assert.equal(s.find((x) => x.mes === '2026-07').na_campanha, false);
  assert.equal(s.find((x) => x.mes === '2026-03').total, 0);
  assert.deepEqual(T.serieMensal({ ate: 'x' }), []);
});
t('migration 20260929120000: programas, valor e ?qr= nas portas de grupos e batismo', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', '..', 'supabase', 'migrations', '20260929120000_campanhas_programas_valor.sql'), 'utf8');
  for (const trecho of ['CREATE TABLE IF NOT EXISTS public.camp_programas', 'programa_id uuid', 'camp_campanhas_programa_fk',
    'mem_grupo_pedidos ADD COLUMN IF NOT EXISTS qr_slug', 'batismo_inscricoes ADD COLUMN IF NOT EXISTS qr_slug', 'RAISE EXCEPTION']) {
    assert.ok(sql.includes(trecho), trecho);
  }

  for (const v of Object.keys(T.VALORES)) assert.ok(sql.includes(`'${v}'`), `valor ${v} fora do CHECK`);
});

t('comparativo (dinheiro): alvo ORIGINAL vem do histórico, por ativação soma prometido e trouxe', () => {
  const campanha = { template: 'generosidade', meta_centavos: 60000000, meses: 12, status: 'ativa', data_fim: '2026-12-31' };
  const inscritos = [
    { status: 'confirmada', qr_slug: 'gen-templo', compromisso_centavos: 10000, total_centavos: 30000 },
    { status: 'confirmada', qr_slug: 'gen-templo', compromisso_centavos: 5000, total_centavos: 0 },
    { status: 'confirmada', qr_slug: null, compromisso_centavos: 20000, total_centavos: 20000 },
    { status: 'cancelada', qr_slug: 'gen-templo', compromisso_centavos: 99999, total_centavos: 99999 },
  ];
  const r = T.reguas({ campanha, inscritos, realizado: { total_centavos: 50000 }, hoje: '2026-10-01' });
  const c = T.comparativoEncerramento({
    campanha, reguas: r, hoje: '2026-10-01',
    alvoHistorico: [
      { alterado_em: '2026-09-20T10:00:00Z', meta_centavos_anterior: 50000000, meta_centavos_novo: 55000000, motivo: 'a' },
      { alterado_em: '2026-09-10T10:00:00Z', meta_centavos_anterior: 40000000, meta_centavos_novo: 50000000, motivo: 'b' },
    ],
    porAtivacao: T.inscritosPorAtivacao([{ slug: 'gen-templo', titulo: 'Templo', acessos: 100 }], inscritos),
    inscritos,
  });
  assert.equal(c.alvo.original, 40000000); assert.equal(c.alvo.final, 60000000); assert.equal(c.alvo.mudou, true);
  assert.equal(c.alvo.historico[0].motivo, 'b');
  assert.equal(c.prometido, (10000 + 5000 + 20000) * 12); assert.equal(c.realizado, 50000);
  const templo = c.por_ativacao[0];
  assert.equal(templo.inscritos, 2); assert.equal(templo.prometido_centavos, 15000 * 12); assert.equal(templo.trouxe_centavos, 30000);
  assert.equal(c.sem_qr.inscritos, 1); assert.equal(c.sem_qr.trouxe_centavos, 20000);
  assert.equal(c.inscritos_resumo.total, 3);
  assert.equal(c.encerrada, false); assert.equal(c.janela_terminou, false);
});
t('comparativo (sem sinal): alvo original = final sem histórico; lift dos meses da campanha', () => {
  const campanha = { template: 'grupos', meta_pessoas: 100, status: 'encerrada', data_inicio: '2026-08-01', data_fim: '2026-09-30' };
  const inscritos = [{ status: 'pendente', qr_slug: 'g-templo' }, { status: 'aprovado', qr_slug: null }];
  const r = T.reguas({ campanha, inscritos, realizado: { pessoas: 1 }, hoje: '2026-10-05' });
  const serie = { serie: [
    { mes: '2026-06', total: 10, com_qr: 0, na_campanha: false }, { mes: '2026-07', total: 20, com_qr: 0, na_campanha: false },
    { mes: '2026-08', total: 40, com_qr: 30, na_campanha: true }, { mes: '2026-09', total: 50, com_qr: 45, na_campanha: true },
  ] };
  const c = T.comparativoEncerramento({ campanha, reguas: r, alvoHistorico: [], porAtivacao: T.inscritosPorAtivacao([{ slug: 'g-templo', titulo: 'T', acessos: 10 }], inscritos), inscritos, serie, hoje: '2026-10-05' });
  assert.equal(c.alvo.original, 100); assert.equal(c.alvo.mudou, false);
  assert.equal(c.prometido, 2); assert.equal(c.realizado, 1); assert.equal(c.dinheiro, false);
  assert.equal(c.por_ativacao[0].prometido_centavos, null);
  assert.equal(c.serie_resumo.meses_campanha, 2); assert.equal(c.serie_resumo.total_campanha, 90);
  assert.equal(c.serie_resumo.media_mes_fora, 15); assert.equal(c.serie_resumo.media_mes_campanha, 45);
  assert.equal(c.serie_resumo.lift_pct, 200);
  assert.equal(c.encerrada, true); assert.equal(c.janela_terminou, true);
  assert.equal(c.pct.realizado_vs_original, 1);
});
t('todo template com porta tem a aba comparativo; a legado (Kids) segue byte a byte', () => {
  for (const id of Object.keys(T.TEMPLATES)) {
    if (id === 'legado') assert.ok(!T.TEMPLATES[id].abas.includes('comparativo'));
    else assert.ok(T.TEMPLATES[id].abas.includes('comparativo'), id);
  }
});

t('migrations 30/09: PIX passa a ler recebido SEM dupla contagem; categoria Campanhas gera ciclo', () => {
  const dir = path.join(__dirname, '..', '..', 'supabase', 'migrations');
  const pix = fs.readFileSync(path.join(dir, '20260930120000_vw_doacoes_unificada_pix_recebido.sql'), 'utf8');
  assert.ok(pix.includes("'recebido'"), 'recebido');
  assert.ok(pix.includes('NOT EXISTS') && pix.includes('lancamento_bruto_id'), 'LEI nº 6: PIX conciliado não conta 2x');
  assert.ok(pix.includes('pg_get_viewdef') && pix.includes('RAISE EXCEPTION'), 'patch dinâmico com guarda');
  const ciclo = fs.readFileSync(path.join(dir, '20260930130000_campanhas_ciclo_criativo.sql'), 'utf8');
  assert.ok(ciclo.includes('marketing_categoria_cultos') && ciclo.includes("'cbrio'"), 'categoria Campanhas com culto');
  assert.ok(ciclo.includes('camp_campanhas_evento_fk'), 'FK em bloco próprio');
  assert.ok(ciclo.includes('ADD COLUMN IF NOT EXISTS evento_id'), 'coluna evento_id');
});

console.log(`\ncampanha-templates: ${n} testes ok`);
