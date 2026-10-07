











const router = require('express').Router();
const { authenticate, isSuperAdminEmail } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { isAuthorizedCron } = require('../utils/cronAuth');
const R = require('../services/rotinasRegras');
const G = require('../services/rotinasGeracao');

const ehUuid = (v) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);



router.get('/cron/gerar', async (req, res) => {
  if (!isAuthorizedCron(req)) return res.status(401).json({ error: 'Unauthorized' });
  try {
    res.json({ ok: true, ...(await G.gerarTarefasDeRotinas()) });
  } catch (e) {
    console.error('[rotinas/cron/gerar]', e.message);
    res.status(500).json({ error: 'Erro ao gerar as tarefas das rotinas' });
  }
});

router.use(authenticate);


async function contexto(req) {
  const uid = req.user.userId || req.user.id;
  const geral = req.user?.granular?.cargoSlug === 'pastor-presidente'
    || req.user?.is_super_admin === true
    || Boolean(req.user?.is_diretoria_geral)
    || isSuperAdminEmail(req.user?.email);
  const [{ data: areas }, { data: pmoRow }, { data: ciclo }] = await Promise.all([
    supabase.from('plan_areas_diretoria').select('area, rotulo, diretoria, lider_id').eq('ativo', true).order('rotulo'),
    supabase.from('plan_execucao_gestores').select('id').eq('profile_id', uid).eq('papel', 'pmo').eq('ativo', true).maybeSingle(),
    supabase.from('plan_ciclos').select('id').order('ano', { ascending: false }).limit(1).maybeSingle(),
  ]);
  let diretorias = new Set();
  if (ciclo?.id) {
    const { data: assentos } = await supabase.from('plan_ciclo_avaliadores').select('diretoria')
      .eq('ciclo_id', ciclo.id).eq('profile_id', uid);
    diretorias = new Set((assentos || []).map((a) => a.diretoria));
  }
  const lista = areas || [];
  const ctx = {
    uid, geral, pmo: Boolean(pmoRow), diretorias,
    areasLider: new Set(lista.filter((a) => a.lider_id === uid).map((a) => a.area)),
  };
  const vis = R.areasVisiveis(ctx, lista);
  return {
    ...ctx,
    areas: lista,
    areasVisiveis: lista.filter((a) => vis === null || vis.has(a.area)),
    pode: (area) => R.podeGerirArea(ctx, lista, area),
  };
}

async function exigirEscopo(req, res) {
  const ctx = await contexto(req);
  if (!ctx.areasVisiveis.length) {
    res.status(403).json({ error: 'Acompanhamento de Rotinas é para líderes de área, diretores, PMO e Pastor' });
    return null;
  }
  return ctx;
}

async function carregarRotina(id) {
  if (!ehUuid(id)) return null;
  const { data } = await supabase.from('rotinas').select('*').eq('id', id).is('deleted_at', null).maybeSingle();
  return data || null;
}


router.get('/escopo', async (req, res) => {
  const ctx = await contexto(req);
  res.json({
    pode_ver: ctx.areasVisiveis.length > 0,
    geral: ctx.geral || ctx.pmo,
    areas: ctx.areasVisiveis.map((a) => ({ area: a.area, rotulo: a.rotulo, diretoria: a.diretoria })),
  });
});


router.get('/pessoas', async (req, res) => {
  const ctx = await exigirEscopo(req, res);
  if (!ctx) return;
  const { data, error } = await supabase.from('profiles').select('id, name, email')
    .not('is_membro_only', 'is', true).not('active', 'is', false).order('name');
  if (error) return res.status(500).json({ error: 'Erro ao listar a equipe' });
  res.json((data || []).map((p) => ({ id: p.id, nome: p.name || p.email })));
});




router.get('/painel', async (req, res) => {
  const ctx = await exigirEscopo(req, res);
  if (!ctx) return;
  const hoje = G.hojeSaoPaulo();
  const periodo = ['semana', 'mes', '30d'].includes(req.query.periodo) ? req.query.periodo : '30d';
  const { de, ate } = R.periodoDoPainel(periodo, hoje);
  const areas = ctx.areasVisiveis.map((a) => a.area);


  const { data: rotinas, error } = await supabase.from('rotinas').select('id, nome, area')
    .is('deleted_at', null).eq('acompanhamento_ativo', true).in('area', areas);
  if (error) return res.status(500).json({ error: 'Erro ao montar o painel' });
  const rotinaIds = (rotinas || []).map((r) => r.id);
  let itens = [];
  let tarefas = [];
  if (rotinaIds.length) {

    const ri = await supabase.from('rotina_itens')
      .select('id, rotina_id, titulo, frequencia, dia_semana, dia_mes, responsavel_id').in('rotina_id', rotinaIds);
    if (ri.error) return res.status(500).json({ error: 'Erro ao montar o painel' });
    itens = ri.data || [];
    const pessoasIds = [...new Set(itens.map((i) => i.responsavel_id))];
    const nomes = {};
    if (pessoasIds.length) {
      const { data } = await supabase.from('profiles').select('id, name').in('id', pessoasIds);
      (data || []).forEach((p) => { nomes[p.id] = p.name; });
    }
    itens = itens.map((i) => ({ ...i, responsavel_nome: nomes[i.responsavel_id] || null }));

    const itemIds = itens.map((i) => i.id);
    for (let i = 0; i < itemIds.length; i += 100) {
      for (let from = 0; ; from += 1000) {
        const { data, error: e } = await supabase.from('tarefas_pessoais')
          .select('rotina_item_id, data, status').in('rotina_item_id', itemIds.slice(i, i + 100))
          .gte('data', de).lte('data', ate).order('data').range(from, from + 999);
        if (e) return res.status(500).json({ error: 'Erro ao ler as tarefas das rotinas' });
        tarefas.push(...(data || []));
        if ((data || []).length < 1000) break;
      }
    }
  }
  res.json({
    periodo, de, ate, hoje,
    ...R.montarPainel({ rotinas: rotinas || [], itens, tarefas, areas: ctx.areasVisiveis, hoje }),
  });
});


router.get('/', async (req, res) => {
  const ctx = await exigirEscopo(req, res);
  if (!ctx) return;
  const areas = ctx.areasVisiveis.map((a) => a.area);
  const { data: rotinas, error } = await supabase.from('rotinas').select('*')
    .is('deleted_at', null).in('area', areas).order('nome');
  if (error) return res.status(500).json({ error: 'Erro ao listar as rotinas' });
  const ids = (rotinas || []).map((r) => r.id);
  let itens = [];
  if (ids.length) {
    const r = await supabase.from('rotina_itens').select('*').in('rotina_id', ids).eq('ativo', true).order('ordem').order('created_at');
    if (r.error) return res.status(500).json({ error: 'Erro ao listar os itens das rotinas' });
    itens = r.data || [];
  }
  const pessoasIds = [...new Set(itens.map((i) => i.responsavel_id))];
  const nomes = {};
  if (pessoasIds.length) {
    const { data } = await supabase.from('profiles').select('id, name').in('id', pessoasIds);
    (data || []).forEach((p) => { nomes[p.id] = p.name; });
  }
  res.json((rotinas || []).map((r) => ({
    ...r,
    pode_gerir: ctx.pode(r.area),
    itens: itens.filter((i) => i.rotina_id === r.id).map((i) => ({ ...i, responsavel_nome: nomes[i.responsavel_id] || null })),
  })));
});


router.post('/', async (req, res) => {
  const ctx = await exigirEscopo(req, res);
  if (!ctx) return;
  const nome = String(req.body?.nome || '').trim().replace(/\s+/g, ' ');
  const area = String(req.body?.area || '');
  if (!nome || nome.length > 160) return res.status(422).json({ error: 'Nome é obrigatório (até 160 caracteres)' });
  if (!ctx.areas.some((a) => a.area === area)) return res.status(422).json({ error: 'Escolha a área' });
  if (!ctx.pode(area)) return res.status(403).json({ error: 'Você não gerencia esta área' });



  const lev = await levantamentoAberto();
  const { data, error } = await supabase.from('rotinas').insert({
    nome, area, descricao: String(req.body?.descricao || '').trim().slice(0, 2000), origem: 'direta', created_by: ctx.uid,
    ...(lev ? { levantamento_id: lev.id, linha_base: true, acompanhamento_ativo: false } : {}),
  }).select().single();
  if (error) return res.status(500).json({ error: 'Não foi possível criar a rotina' });
  res.status(201).json(data);
});


async function levantamentoAberto() {
  const { data, error } = await supabase.from('rotinas_levantamentos').select('*').eq('aberto', true).maybeSingle();
  if (error) { console.error('[rotinas] levantamento aberto:', error.message); return null; }
  return data || null;
}


router.get('/levantamento', async (req, res) => {
  const ctx = await exigirEscopo(req, res);
  if (!ctx) return;
  const lev = await levantamentoAberto();
  const { data: ultimo } = lev ? { data: null } : await supabase.from('rotinas_levantamentos')
    .select('id, nome, encerrado_em').order('aberto_em', { ascending: false }).limit(1).maybeSingle();
  const gerencia = ctx.geral || ctx.pmo;
  const base = { aberto: lev ? { id: lev.id, nome: lev.nome, aberto_em: lev.aberto_em } : null, ultimo: ultimo || null, pode_gerir: gerencia };
  if (!lev) return res.json({ ...base, areas: [] });

  const areasDoQuadro = gerencia ? ctx.areas : ctx.areasVisiveis;
  const areas = areasDoQuadro.map((a) => a.area);
  const [{ data: rotinas }, { data: decl }] = await Promise.all([
    supabase.from('rotinas').select('id, area').eq('levantamento_id', lev.id).is('deleted_at', null).in('area', areas),
    supabase.from('rotinas_declaracoes').select('area, concluida_em').eq('levantamento_id', lev.id),
  ]);
  const ids = (rotinas || []).map((r) => r.id);
  const { data: itens } = ids.length
    ? await supabase.from('rotina_itens').select('rotina_id').in('rotina_id', ids).eq('ativo', true)
    : { data: [] };
  const lideres = {};
  const liderIds = [...new Set(areasDoQuadro.map((a) => a.lider_id).filter(Boolean))];
  if (liderIds.length) {
    const { data } = await supabase.from('profiles').select('id, name').in('id', liderIds);
    (data || []).forEach((p) => { lideres[p.id] = p.name; });
  }
  res.json({
    ...base,
    areas: R.quadroLevantamento({
      areas: areasDoQuadro.map((a) => ({ area: a.area, rotulo: a.rotulo, diretoria: a.diretoria, lider_nome: lideres[a.lider_id] || null, pode: ctx.pode(a.area) })),
      rotinas: rotinas || [], itens: itens || [], declaracoes: decl || [],
    }),
  });
});

router.post('/levantamento/abrir', async (req, res) => {
  const ctx = await exigirEscopo(req, res);
  if (!ctx) return;
  if (!(ctx.geral || ctx.pmo)) return res.status(403).json({ error: 'Só o PMO, a Diretoria Geral ou o Pastor abrem o levantamento' });
  if (await levantamentoAberto()) return res.status(409).json({ error: 'Já existe um levantamento aberto' });
  const nome = String(req.body?.nome || '').trim().slice(0, 120) || `Levantamento de rotinas ${new Date().getFullYear()}`;
  const { data, error } = await supabase.from('rotinas_levantamentos').insert({ nome, aberto_por: ctx.uid }).select().single();
  if (error) return res.status(500).json({ error: 'Não foi possível abrir o levantamento' });
  res.status(201).json(data);
});

router.post('/levantamento/encerrar', async (req, res) => {
  const ctx = await exigirEscopo(req, res);
  if (!ctx) return;
  if (!(ctx.geral || ctx.pmo)) return res.status(403).json({ error: 'Só o PMO, a Diretoria Geral ou o Pastor encerram o levantamento' });
  const lev = await levantamentoAberto();
  if (!lev) return res.status(409).json({ error: 'Não há levantamento aberto' });
  const { error } = await supabase.from('rotinas_levantamentos').update({ aberto: false, encerrado_em: new Date().toISOString() }).eq('id', lev.id);
  if (error) return res.status(500).json({ error: 'Não foi possível encerrar o levantamento' });
  res.json({ ok: true });
});


router.post('/levantamento/declarar', async (req, res) => {
  const ctx = await exigirEscopo(req, res);
  if (!ctx) return;
  const lev = await levantamentoAberto();
  if (!lev) return res.status(409).json({ error: 'Não há levantamento aberto' });
  const area = String(req.body?.area || '');
  if (!ctx.areas.some((a) => a.area === area)) return res.status(422).json({ error: 'Área inválida' });
  if (!ctx.pode(area)) return res.status(403).json({ error: 'Você não gerencia esta área' });
  if (req.body?.concluida === false) {
    const { error } = await supabase.from('rotinas_declaracoes').delete().eq('levantamento_id', lev.id).eq('area', area);
    if (error) return res.status(500).json({ error: 'Não foi possível reabrir a declaração' });
    return res.json({ ok: true, concluida: false });
  }
  const { error } = await supabase.from('rotinas_declaracoes')
    .upsert({ levantamento_id: lev.id, area, concluida_por: ctx.uid, concluida_em: new Date().toISOString() }, { onConflict: 'levantamento_id,area' });
  if (error) return res.status(500).json({ error: 'Não foi possível concluir a declaração' });
  res.json({ ok: true, concluida: true });
});



router.put('/:id/acompanhamento', async (req, res) => {
  const ctx = await exigirEscopo(req, res);
  if (!ctx) return;
  const rot = await carregarRotina(req.params.id);
  if (!rot) return res.status(404).json({ error: 'Rotina não encontrada' });
  if (!ctx.pode(rot.area)) return res.status(403).json({ error: 'Você não gerencia esta área' });
  const ativo = req.body?.ativo !== false;
  const { data, error } = await supabase.from('rotinas').update({ acompanhamento_ativo: ativo }).eq('id', rot.id).select().single();
  if (error) return res.status(500).json({ error: 'Não foi possível alterar o acompanhamento' });
  let geracao = null;
  try {
    const { data: its } = await supabase.from('rotina_itens').select('id').eq('rotina_id', rot.id).eq('ativo', true);
    const ids = (its || []).map((i) => i.id);
    if (ativo && rot.ativa && ids.length) geracao = await G.gerarTarefasDeRotinas({ itemIds: ids });
    if (!ativo) await G.limparFuturas(ids);
  } catch (e) { console.error('[rotinas] tarefas após alterar acompanhamento:', e.message); }
  res.json({ ...data, geracao });
});

router.put('/:id', async (req, res) => {
  const ctx = await exigirEscopo(req, res);
  if (!ctx) return;
  const rot = await carregarRotina(req.params.id);
  if (!rot) return res.status(404).json({ error: 'Rotina não encontrada' });
  if (!ctx.pode(rot.area)) return res.status(403).json({ error: 'Você não gerencia esta área' });
  const patch = {};
  if (req.body?.nome !== undefined) {
    const nome = String(req.body.nome || '').trim().replace(/\s+/g, ' ');
    if (!nome || nome.length > 160) return res.status(422).json({ error: 'Nome é obrigatório (até 160 caracteres)' });
    patch.nome = nome;
  }
  if (req.body?.descricao !== undefined) patch.descricao = String(req.body.descricao || '').trim().slice(0, 2000);
  if (req.body?.ativa !== undefined) patch.ativa = Boolean(req.body.ativa);
  if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nada a atualizar' });
  const { data, error } = await supabase.from('rotinas').update(patch).eq('id', rot.id).select().single();
  if (error) return res.status(500).json({ error: 'Não foi possível salvar a rotina' });
  try {
    const { data: its } = await supabase.from('rotina_itens').select('id').eq('rotina_id', rot.id).eq('ativo', true);
    const ids = (its || []).map((i) => i.id);
    if (patch.ativa === false) await G.limparFuturas(ids);
    else if (patch.ativa === true && ids.length && rot.acompanhamento_ativo !== false) await G.gerarTarefasDeRotinas({ itemIds: ids });
  } catch (e) { console.error('[rotinas] ajuste de tarefas após editar rotina:', e.message); }
  res.json(data);
});


router.delete('/:id', async (req, res) => {
  const ctx = await exigirEscopo(req, res);
  if (!ctx) return;
  const rot = await carregarRotina(req.params.id);
  if (!rot) return res.status(404).json({ error: 'Rotina não encontrada' });
  if (!ctx.pode(rot.area)) return res.status(403).json({ error: 'Você não gerencia esta área' });
  const { error } = await supabase.from('rotinas').update({ deleted_at: new Date().toISOString(), ativa: false }).eq('id', rot.id);
  if (error) return res.status(500).json({ error: 'Não foi possível excluir a rotina' });
  try {
    const { data: its } = await supabase.from('rotina_itens').select('id').eq('rotina_id', rot.id);
    await G.limparFuturas((its || []).map((i) => i.id));
  } catch (e) { console.error('[rotinas] limpar tarefas após excluir rotina:', e.message); }
  res.json({ ok: true });
});


async function contextoItem(req, res) {
  const ctx = await exigirEscopo(req, res);
  if (!ctx) return null;
  const rot = await carregarRotina(req.params.id);
  if (!rot) { res.status(404).json({ error: 'Rotina não encontrada' }); return null; }
  if (!ctx.pode(rot.area)) { res.status(403).json({ error: 'Você não gerencia esta área' }); return null; }
  return { ctx, rot };
}

router.post('/:id/itens', async (req, res) => {
  const c = await contextoItem(req, res);
  if (!c) return;
  const { erro, item } = R.normalizarItem(req.body || {});
  if (erro) return res.status(422).json({ error: erro });
  const { data, error } = await supabase.from('rotina_itens')
    .insert({ ...item, rotina_id: c.rot.id, created_by: c.ctx.uid }).select().single();
  if (error) return res.status(500).json({ error: 'Não foi possível criar o item' });
  let geracao = null;
  try { if (c.rot.ativa && c.rot.acompanhamento_ativo !== false) geracao = await G.gerarTarefasDeRotinas({ itemIds: [data.id] }); }
  catch (e) { console.error('[rotinas] gerar após criar item:', e.message); }
  res.status(201).json({ ...data, geracao });
});

router.put('/:id/itens/:itemId', async (req, res) => {
  const c = await contextoItem(req, res);
  if (!c) return;
  if (!ehUuid(req.params.itemId)) return res.status(404).json({ error: 'Item não encontrado' });
  const { data: atual } = await supabase.from('rotina_itens').select('*')
    .eq('id', req.params.itemId).eq('rotina_id', c.rot.id).eq('ativo', true).maybeSingle();
  if (!atual) return res.status(404).json({ error: 'Item não encontrado nesta rotina' });

  const { erro, item } = R.normalizarItem({ ...atual, ...(req.body || {}) });
  if (erro) return res.status(422).json({ error: erro });
  const { data, error } = await supabase.from('rotina_itens').update(item).eq('id', atual.id).select().single();
  if (error) return res.status(500).json({ error: 'Não foi possível salvar o item' });

  try {
    await G.limparFuturas([atual.id]);
    if (c.rot.ativa && c.rot.acompanhamento_ativo !== false) await G.gerarTarefasDeRotinas({ itemIds: [atual.id] });
  } catch (e) { console.error('[rotinas] regerar após editar item:', e.message); }
  res.json(data);
});


router.delete('/:id/itens/:itemId', async (req, res) => {
  const c = await contextoItem(req, res);
  if (!c) return;
  if (!ehUuid(req.params.itemId)) return res.status(404).json({ error: 'Item não encontrado' });
  const { data, error } = await supabase.from('rotina_itens').update({ ativo: false })
    .eq('id', req.params.itemId).eq('rotina_id', c.rot.id).select('id').maybeSingle();
  if (error) return res.status(500).json({ error: 'Não foi possível remover o item' });
  if (!data) return res.status(404).json({ error: 'Item não encontrado nesta rotina' });
  try { await G.limparFuturas([data.id]); } catch (e) { console.error('[rotinas] limpar após remover item:', e.message); }
  res.json({ ok: true });
});

module.exports = router;
