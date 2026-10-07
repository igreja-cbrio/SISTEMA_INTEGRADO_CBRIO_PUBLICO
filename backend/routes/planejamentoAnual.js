












const router = require('express').Router();
const { authenticate, authorizeModule, isSuperAdminEmail } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { notificar } = require('../services/notificar');
const { enqueueSync } = require('../services/cerebroSync');
const { semFalhar } = require('../utils/semFalhar');
const { isAuthorizedCron } = require('../utils/cronAuth');
const PA = require('../services/planejamentoAnualRegras');
const PAInsights = require('../services/planejamentoAnualInsights');
const { criarSolicitacaoRotina, gerarSolicitacoesRotinaCompras } = require('../services/planejamentoAnualSolicitacoes');

const MOD = 'planejamento-anual';





const ROTULO_ESTADO = {
  rascunho: 'rascunho', enviada: 'enviada', em_avaliacao: 'em avaliação',
  ranqueada: 'aguardando decisão', aprovada: 'aprovada',
  aprovada_ressalvas: 'aprovada com ressalvas', reprovada: 'devolvida com exigência',
  retificada: 'retificada · com o Pastor', arquivada: 'arquivada',
};
const rotuloEstado = (e) => ROTULO_ESTADO[e] || e;

function hojeSaoPaulo() {

  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}










router.get('/cron/gerar-solicitacoes-rotina', async (req, res) => {
  if (!isAuthorizedCron(req)) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const r = await gerarSolicitacoesRotinaCompras();
    console.log(`[planejamento-anual/cron/gerar-solicitacoes-rotina] ${hojeSaoPaulo()} · ${r.avaliadas} avaliadas · ${r.gerados} geradas · ${r.erros.length} erros`);
    res.json({ ok: true, ...r });
  } catch (e) {
    console.error('[planejamento-anual/cron/gerar-solicitacoes-rotina]', e.message);
    res.status(500).json({ error: 'Erro ao gerar solicitações de rotina' });
  }
});

router.use(authenticate);





async function ehPastorOuSuper(req) {
  if (req.user?.granular?.cargoSlug === 'pastor-presidente') return true;
  if (req.user?.is_super_admin === true) return true;
  return isSuperAdminEmail(req.user?.email);
}









function ehDiretoria(req) {
  return Boolean(req.user?.is_diretoria_geral);
}

async function carregarCiclo(cicloId) {
  const { data, error } = await supabase.from('plan_ciclos').select('*').eq('id', cicloId).single();
  if (error) return null;
  return data;
}

async function carregarAvaliadores(cicloId) {
  const { data } = await supabase
    .from('plan_ciclo_avaliadores')
    .select('id, diretoria, profile_id, profiles:profile_id (id, name, email)')
    .eq('ciclo_id', cicloId);
  return data || [];
}

async function carregarLocais() {
  const { data } = await supabase.from('plan_locais').select('*').order('ordem');
  const porId = {};
  (data || []).forEach((l) => { porId[l.id] = l; });
  return { lista: data || [], porId };
}

async function carregarProposta(id) {
  const { data, error } = await supabase
    .from('plan_propostas').select('*').eq('id', id).is('deleted_at', null).single();
  if (error) return null;
  return data;
}










async function avaliacoesPorProposta(propostaIds, diretoriasValidas) {
  if (!propostaIds.length) return {};
  const grupos = {};
  let query = supabase
    .from('plan_avaliacoes').select('*')
    .in('proposta_id', propostaIds).is('deleted_at', null);
  if (diretoriasValidas) query = query.in('diretoria', diretoriasValidas.length ? diretoriasValidas : ['__nenhuma__']);
  const { data } = await query;
  (data || []).forEach((a) => {
    (grupos[a.proposta_id] = grupos[a.proposta_id] || []).push(a);
  });
  return grupos;
}

async function decisoesPorProposta(propostaIds) {
  if (!propostaIds.length) return {};
  const grupos = {};


  let data = [];
  try {
    data = await emLotes(propostaIds, (lote) => supabase
      .from('plan_decisoes').select('*').in('proposta_id', lote));
  } catch (e) {
    console.error('[planejamento-anual] erro ao ler decisões:', e.message);
  }
  data.forEach((d) => {
    (grupos[d.proposta_id] = grupos[d.proposta_id] || []).push(d);
  });
  return grupos;
}

function papelPara(req, avaliadores, proposta, pastorFlag) {
  if (pastorFlag) return { papel: 'pastor', minhaDiretoria: null };
  const assento = avaliadores.find((a) => a.profile_id === req.user.id);
  if (assento) return { papel: 'avaliador', minhaDiretoria: assento.diretoria };
  const uid = req.user.id;
  if (proposta && [proposta.lider_id, proposta.preenchido_por_id, proposta.created_by].includes(uid)) {
    return { papel: 'proponente', minhaDiretoria: null };
  }
  return { papel: 'observador', minhaDiretoria: null };
}

const proponenteIds = (p) => [...new Set([p.lider_id, p.preenchido_por_id, p.created_by].filter(Boolean))];


router.get('/aux/locais', authorizeModule(MOD, 1), async (_req, res) => {
  const { lista } = await carregarLocais();
  res.json(lista.filter((l) => l.ativo !== false));
});

router.get('/aux/areas', authorizeModule(MOD, 1), async (_req, res) => {



  const base = await supabase
    .from('plan_areas_diretoria').select('area, diretoria, rotulo, ativo').order('area');
  const lista = (base.data || []).filter((a) => a.ativo !== false);
  const comLider = await supabase.from('plan_areas_diretoria').select('area, lider_id');
  if (!comLider.error) {
    const porArea = new Map((comLider.data || []).map((r) => [r.area, r.lider_id]));
    for (const a of lista) a.lider_id = porArea.get(a.area) || null;
  }
  res.json(lista);
});

router.get('/aux/constantes', authorizeModule(MOD, 1), (_req, res) => {
  res.json({
    criterios: PA.CRITERIOS,
    valores: PA.VALORES_IGREJA,
    campos_apontaveis: PA.CAMPOS_APONTAVEIS,
    suposicoes: PA.SUPOSICOES,
  });
});


router.get('/ciclos', authorizeModule(MOD, 1), async (_req, res) => {
  const { data, error } = await supabase.from('plan_ciclos').select('*').order('ano', { ascending: false });
  if (error) return res.status(500).json({ error: 'Erro ao listar ciclos' });
  res.json(data || []);
});

router.get('/ciclos/:id', authorizeModule(MOD, 1), async (req, res) => {
  const ciclo = await carregarCiclo(req.params.id);
  if (!ciclo) return res.status(404).json({ error: 'Ciclo não encontrado' });
  const avaliadores = await carregarAvaliadores(ciclo.id);
  res.json({
    ...ciclo,
    avaliadores: avaliadores.map((a) => ({
      diretoria: a.diretoria,
      profile_id: a.profile_id,
      nome: a.profiles?.name || null,
    })),
    quorum: avaliadores.length,
    meu_papel: papelPara(req, avaliadores, null, await ehPastorOuSuper(req)).papel,






    sou_responsavel_orcamento: await ehResponsavelOrcamento(req, ciclo.id),
  });
});

router.post('/ciclos', authorizeModule(MOD, 5), async (req, res) => {








  if (!(await ehPastorOuSuper(req))) return res.status(403).json({ error: 'Criar ciclo é exclusivo do Pastor presidente' });
  const ano = parseInt(req.body?.ano, 10);
  if (!Number.isInteger(ano) || ano < 2026 || ano > 2100) {
    return res.status(400).json({ error: 'Ano inválido' });
  }
  const { data, error } = await supabase.from('plan_ciclos').insert({ ano }).select().single();
  if (error) return res.status(400).json({ error: 'Não foi possível criar o ciclo (ano já existe?)' });
  res.status(201).json(data);
});


router.patch('/ciclos/:id/janelas', authorizeModule(MOD, 1), async (req, res) => {
  if (!(await ehPastorOuSuper(req))) return res.status(403).json({ error: 'Abrir e fechar janelas é exclusivo do Pastor presidente' });
  const patch = {};
  if (typeof req.body?.submissao_aberta === 'boolean') patch.submissao_aberta = req.body.submissao_aberta;
  if (typeof req.body?.avaliacao_aberta === 'boolean') patch.avaliacao_aberta = req.body.avaliacao_aberta;
  if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nada a alterar' });
  const { data, error } = await supabase.from('plan_ciclos').update(patch).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: 'Erro ao atualizar as janelas' });
  res.json(data);
});

router.put('/ciclos/:id/avaliadores', authorizeModule(MOD, 5), async (req, res) => {


  if (!(await ehPastorOuSuper(req))) return res.status(403).json({ error: 'Gerir os assentos de avaliação é exclusivo do Pastor presidente' });
  const itens = Array.isArray(req.body?.avaliadores) ? req.body.avaliadores : [];
  const resultados = [];
  for (const item of itens) {
    if (!item?.diretoria || !item?.profile_id) continue;
    const { error } = await supabase
      .from('plan_ciclo_avaliadores')
      .upsert({ ciclo_id: req.params.id, diretoria: item.diretoria, profile_id: item.profile_id }, { onConflict: 'ciclo_id,diretoria' });
    resultados.push({ diretoria: item.diretoria, ok: !error });
  }
  res.json({ resultados });
});




router.delete('/ciclos/:id/avaliadores/:diretoria', authorizeModule(MOD, 5), async (req, res) => {
  if (!(await ehPastorOuSuper(req))) return res.status(403).json({ error: 'Gerir os assentos de avaliação é exclusivo do Pastor presidente' });
  const { error } = await supabase
    .from('plan_ciclo_avaliadores')
    .delete().eq('ciclo_id', req.params.id).eq('diretoria', req.params.diretoria);
  if (error) return res.status(500).json({ error: 'Erro ao remover o assento' });
  res.json({ ok: true });
});



router.get('/ciclos/:id/orcamento/responsaveis', authorizeModule(MOD, 5), async (req, res) => {
  const { data, error } = await supabase
    .from('plan_orcamento_responsaveis')
    .select('id, profile_id, profiles:profile_id (id, name, email)')
    .eq('ciclo_id', req.params.id);
  if (error) return res.status(500).json({ error: 'Erro ao listar os responsáveis pelo orçamento' });
  res.json((data || []).map((r) => ({ id: r.id, profile_id: r.profile_id, nome: r.profiles?.name || null, email: r.profiles?.email || null })));
});

router.put('/ciclos/:id/orcamento/responsaveis', authorizeModule(MOD, 5), async (req, res) => {
  const profileIds = Array.isArray(req.body?.profile_ids) ? req.body.profile_ids.filter(Boolean) : [];
  const { error: eDel } = await supabase
    .from('plan_orcamento_responsaveis').delete().eq('ciclo_id', req.params.id);
  if (eDel) return res.status(500).json({ error: 'Erro ao atualizar os responsáveis pelo orçamento' });
  if (profileIds.length) {
    const { error: eIns } = await supabase
      .from('plan_orcamento_responsaveis')
      .insert(profileIds.map((profile_id) => ({ ciclo_id: req.params.id, profile_id })));
    if (eIns) return res.status(500).json({ error: 'Erro ao salvar os responsáveis pelo orçamento' });
  }
  res.json({ ok: true });
});


router.get('/ciclos/:id/propostas', authorizeModule(MOD, 1), async (req, res) => {
  const ciclo = await carregarCiclo(req.params.id);
  if (!ciclo) return res.status(404).json({ error: 'Ciclo não encontrado' });
  const avaliadores = await carregarAvaliadores(ciclo.id);
  const quorum = avaliadores.length;
  const pastorFlag = await ehPastorOuSuper(req);
  const podeVerTudo = pastorFlag || ehDiretoria(req);

  let query = supabase.from('plan_propostas').select('*')
    .eq('ciclo_id', ciclo.id).is('deleted_at', null).order('created_at');
  if (!podeVerTudo || req.query.minhas === 'true') {
    query = query.or(`lider_id.eq.${req.user.id},preenchido_por_id.eq.${req.user.id},created_by.eq.${req.user.id}`);
  }
  const { data: propostas, error } = await query;
  if (error) return res.status(500).json({ error: 'Erro ao listar propostas' });

  const ids = (propostas || []).map((p) => p.id);
  const avs = await avaliacoesPorProposta(ids, avaliadores.map((a) => a.diretoria));
  const decs = await decisoesPorProposta(ids);


  const lista = (propostas || []).map((p) => {
    const { papel, minhaDiretoria } = papelPara(req, avaliadores, p, pastorFlag);
    const souProponente = proponenteIds(p).includes(req.user.id);
    const proj = PA.projetarProposta({
      proposta: p,
      avaliacoes: avs[p.id] || [],
      decisoes: decs[p.id] || [],
      apontamentos: [],
      quorum,
      papel,
      minhaDiretoria,
      souProponente,
    });
    return {
      id: p.id, nome: p.nome, natureza: p.natureza, area: p.area,
      lider_id: p.lider_id, data_inicio: p.data_inicio, precisao_inicio: p.precisao_inicio,
      estado: p.estado, estado_derivado: proj.estado_derivado,
      retificacao_prazo: p.retificacao_prazo,
      situacao_decisao: proj.situacao_decisao,
      avaliacoes_recebidas: proj.avaliacoes_recebidas, quorum,
      custo: p.custo, liquido: proj.liquido, custeio: proj.custeio,
      minha_avaliacao_enviada: papel === 'avaliador' ? Boolean(proj.minha_avaliacao) : undefined,
      meu_papel: papel,




      sou_proponente: souProponente,
    };
  });
  res.json(lista);
});

router.post('/propostas', authorizeModule(MOD, 2), async (req, res) => {
  const b = req.body || {};
  const ciclo = await carregarCiclo(b.ciclo_id);
  if (!ciclo) return res.status(400).json({ error: 'Ciclo inválido' });
  const insert = {
    ciclo_id: ciclo.id,
    nome: b.nome || 'Sem nome',
    natureza: b.natureza,
    area: b.area,
    lider_id: b.lider_id,
    preenchido_por_id: b.preenchido_por_id || req.user.id,
    data_inicio: b.data_inicio,
    precisao_inicio: b.precisao_inicio || 'mes',
    multi_dia: Boolean(b.multi_dia),
    data_fim: b.multi_dia ? (b.data_fim || null) : null,
    precisao_fim: b.multi_dia ? (b.precisao_fim || null) : null,
    recorrencia: b.recorrencia || 'unica',
    dia_semana: b.dia_semana ?? null,
    hora_inicio: b.hora_inicio || null,
    hora_fim: b.hora_fim || null,
    local_id: b.local_id,
    locais_adicionais_ids: Array.isArray(b.locais_adicionais_ids) ? b.locais_adicionais_ids : [],
    local_fora_detalhe: b.local_fora_detalhe || null,
    publico_alvo: b.publico_alvo || null,
    descricao: b.descricao || null,
    alcance_pct: b.alcance_pct ?? null,
    publico_considerado: b.publico_considerado || 'igreja_inteira',
    pertencimento: b.pertencimento || null,
    valores: Array.isArray(b.valores) ? b.valores : [],
    visao_explique: b.visao_explique || null,
    impacto: b.impacto || null,
    custo: Number(b.custo) || 0,
    tem_arrecadacao: Boolean(b.tem_arrecadacao),
    arrecadacao_prevista: Number(b.arrecadacao_prevista) || 0,
    estado: 'rascunho',
    created_by: req.user.id,
  };
  const { data, error } = await supabase.from('plan_propostas').insert(insert).select().single();
  if (error) {
    console.error('[planejamento-anual] erro ao criar proposta:', error.message);
    return res.status(400).json({ error: 'Não foi possível criar a proposta (verifique área, local e líder)' });
  }
  res.status(201).json(data);
});

router.get('/propostas/:id', authorizeModule(MOD, 1), async (req, res) => {
  const p = await carregarProposta(req.params.id);
  if (!p) return res.status(404).json({ error: 'Proposta não encontrada' });
  const pastorFlag = await ehPastorOuSuper(req);



  if (!pastorFlag && !ehDiretoria(req) && !proponenteIds(p).includes(req.user.id)) {
    return res.status(404).json({ error: 'Proposta não encontrada' });
  }
  const avaliadores = await carregarAvaliadores(p.ciclo_id);
  let { papel, minhaDiretoria } = papelPara(req, avaliadores, p, pastorFlag);








  if (req.query.como === 'avaliador') {
    const assento = avaliadores.find((a) => a.profile_id === req.user.id);
    if (assento) { papel = 'avaliador'; minhaDiretoria = assento.diretoria; }
  }
  const souProponente = proponenteIds(p).includes(req.user.id);
  const avs = await avaliacoesPorProposta([p.id], avaliadores.map((a) => a.diretoria));
  const decs = await decisoesPorProposta([p.id]);
  const { data: apontamentos } = await supabase
    .from('plan_apontamentos').select('*').eq('proposta_id', p.id);
  res.json(PA.projetarProposta({
    proposta: p,
    avaliacoes: avs[p.id] || [],
    decisoes: decs[p.id] || [],
    apontamentos: apontamentos || [],
    quorum: avaliadores.length,
    papel,
    minhaDiretoria,
    souProponente,
  }));
});

router.put('/propostas/:id', authorizeModule(MOD, 2), async (req, res) => {
  const p = await carregarProposta(req.params.id);
  if (!p) return res.status(404).json({ error: 'Proposta não encontrada' });
  if (!proponenteIds(p).includes(req.user.id) && !(await ehPastorOuSuper(req))) {
    return res.status(403).json({ error: 'Só o proponente edita a proposta' });
  }
  if (p.estado !== 'rascunho') {
    return res.status(409).json({ error: 'Proposta enviada não pode ser editada (use retificação quando devolvida)' });
  }
  const permitidos = [
    'nome', 'natureza', 'area', 'lider_id', 'preenchido_por_id', 'data_inicio', 'precisao_inicio',
    'multi_dia', 'data_fim', 'precisao_fim', 'recorrencia', 'dia_semana', 'hora_inicio', 'hora_fim',
    'local_id', 'locais_adicionais_ids', 'local_fora_detalhe',
    'publico_alvo', 'descricao', 'alcance_pct', 'publico_considerado', 'pertencimento',
    'valores', 'visao_explique', 'impacto', 'custo', 'tem_arrecadacao', 'arrecadacao_prevista',
  ];
  const patch = {};
  permitidos.forEach((c) => { if (req.body[c] !== undefined) patch[c] = req.body[c]; });
  const { data, error } = await supabase.from('plan_propostas').update(patch).eq('id', p.id).select().single();
  if (error) return res.status(400).json({ error: 'Não foi possível salvar a proposta' });
  res.json(data);
});





router.delete('/propostas/:id', authorizeModule(MOD, 2), async (req, res) => {
  const p = await carregarProposta(req.params.id);
  if (!p) return res.status(404).json({ error: 'Proposta não encontrada' });
  if (!proponenteIds(p).includes(req.user.id) && !(await ehPastorOuSuper(req))) {
    return res.status(403).json({ error: 'Só o proponente descarta a proposta' });
  }
  if (p.estado !== 'rascunho') {
    return res.status(409).json({ error: 'Só um rascunho pode ser descartado' });
  }
  const { error } = await supabase.from('plan_propostas')
    .update({ deleted_at: new Date().toISOString() }).eq('id', p.id);
  if (error) return res.status(500).json({ error: 'Não foi possível descartar o rascunho' });
  res.json({ ok: true });
});







router.get('/propostas/:id/config-rotina', authorizeModule(MOD, 1), async (req, res) => {
  const p = await carregarProposta(req.params.id);
  if (!p) return res.status(404).json({ error: 'Proposta não encontrada' });
  if (!proponenteIds(p).includes(req.user.id) && !(await ehPastorOuSuper(req))) {
    return res.status(403).json({ error: 'Só o proponente vê a configuração de rotina' });
  }
  const { data } = await supabase
    .from('plan_propostas_rotina_solicitacao').select('*').eq('proposta_id', p.id).maybeSingle();
  res.json(data || null);
});

router.put('/propostas/:id/config-rotina', authorizeModule(MOD, 2), async (req, res) => {
  const p = await carregarProposta(req.params.id);
  if (!p) return res.status(404).json({ error: 'Proposta não encontrada' });
  if (!proponenteIds(p).includes(req.user.id) && !(await ehPastorOuSuper(req))) {
    return res.status(403).json({ error: 'Só o proponente edita a configuração de rotina' });
  }
  if (p.natureza !== 'rotina') {
    return res.status(422).json({ error: 'Esta configuração só existe para propostas de natureza "rotina"' });
  }
  const categoria = req.body?.categoria;
  if (!['compras', 'reserva_espaco', 'outros'].includes(categoria)) {
    return res.status(400).json({ error: 'Categoria inválida (compras · reserva_espaco · outros)' });
  }
  const dados = categoria === 'outros' ? {} : (req.body?.dados && typeof req.body.dados === 'object' ? req.body.dados : {});
  const { data, error } = await supabase
    .from('plan_propostas_rotina_solicitacao')
    .upsert({ proposta_id: p.id, categoria, dados, ativo: true }, { onConflict: 'proposta_id' })
    .select().single();
  if (error) {
    console.error('[planejamento-anual] erro ao salvar config de rotina:', error.message);
    return res.status(400).json({ error: 'Não foi possível salvar a configuração de rotina' });
  }
  res.json(data);
});


router.post('/propostas/:id/enviar', authorizeModule(MOD, 2), async (req, res) => {
  const p = await carregarProposta(req.params.id);
  if (!p) return res.status(404).json({ error: 'Proposta não encontrada' });
  if (!proponenteIds(p).includes(req.user.id)) {
    return res.status(403).json({ error: 'Só o proponente envia a proposta' });
  }
  if (!PA.podeTransicionar(p.estado, 'enviada')) {
    return res.status(409).json({ error: `Proposta em "${rotuloEstado(p.estado)}" não pode ser enviada` });
  }
  const ciclo = await carregarCiclo(p.ciclo_id);
  const erros = PA.validarEnvio(p, ciclo);
  if (erros.length) return res.status(422).json({ error: erros[0], erros });

  const { data, error } = await supabase.from('plan_propostas')
    .update({ estado: 'enviada', enviada_em: new Date().toISOString() })
    .eq('id', p.id).eq('estado', p.estado).select().single();
  if (error) return res.status(500).json({ error: 'Erro ao enviar a proposta' });

  const avaliadores = await carregarAvaliadores(p.ciclo_id);
  notificar({
    modulo: MOD,
    tipo: 'pa_proposta_enviada',
    titulo: 'Nova proposta para avaliar',
    mensagem: `"${p.nome}" entrou no ciclo de planejamento e aguarda a pontuação da sua diretoria.`,
    link: '/planejamento-anual',
    chaveDedup: `pa_enviada_${p.id}`,
    targetIds: avaliadores.map((a) => a.profile_id),
  }).catch(() => {});
  res.json(data);
});


router.put('/propostas/:id/avaliacao', authorizeModule(MOD, 1), async (req, res) => {
  const p = await carregarProposta(req.params.id);
  if (!p) return res.status(404).json({ error: 'Proposta não encontrada' });



  if (proponenteIds(p).includes(req.user.id)) {
    return res.status(403).json({ error: 'Quem propôs não avalia a própria proposta' });
  }
  const avaliadores = await carregarAvaliadores(p.ciclo_id);

  const assento = avaliadores.find((a) => a.profile_id === req.user.id);
  if (!assento) return res.status(403).json({ error: 'Você não tem assento de avaliação neste ciclo' });

  const ciclo = await carregarCiclo(p.ciclo_id);
  if (!ciclo?.avaliacao_aberta) return res.status(409).json({ error: 'A janela de avaliação está fechada' });
  if (p.estado !== 'enviada') return res.status(409).json({ error: 'Esta proposta não está em avaliação' });

  const erros = PA.validarAvaliacao(req.body || {});
  if (erros.length) return res.status(422).json({ error: 'Os sete critérios são obrigatórios.', erros });

  const linha = {
    proposta_id: p.id,
    diretoria: assento.diretoria,
    avaliador_id: req.user.id,
    coment_criterios: req.body.coment_criterios || {},
    comentario_geral: req.body.comentario_geral || null,
    enviado_em: new Date().toISOString(),
  };
  PA.CRITERIOS.forEach((c) => { linha['nota_' + c.chave] = req.body['nota_' + c.chave]; });


  const { data: existente } = await supabase
    .from('plan_avaliacoes').select('id')
    .eq('proposta_id', p.id).eq('diretoria', assento.diretoria).is('deleted_at', null)
    .maybeSingle();








  if (existente) {
    const jaAvaliaram = await avaliacoesPorProposta([p.id], avaliadores.map((a) => a.diretoria));
    if ((jaAvaliaram[p.id] || []).length >= avaliadores.length) {
      return res.status(409).json({ error: 'O quórum já fechou e as notas foram reveladas — a pontuação não pode mais ser alterada.' });
    }
  }

  let error;
  if (existente) {
    ({ error } = await supabase.from('plan_avaliacoes').update(linha).eq('id', existente.id));
  } else {
    ({ error } = await supabase.from('plan_avaliacoes').insert(linha));
  }
  if (error) {
    console.error('[planejamento-anual] erro ao salvar avaliação:', error.message);
    return res.status(500).json({ error: 'Erro ao salvar a avaliação' });
  }

  const avs = await avaliacoesPorProposta([p.id], avaliadores.map((a) => a.diretoria));
  const recebidas = (avs[p.id] || []).length;
  if (recebidas >= avaliadores.length) {
    notificar({
      modulo: MOD,
      tipo: 'pa_quorum_completo',
      titulo: 'Proposta pronta para decisão',
      mensagem: `As ${avaliadores.length} diretorias pontuaram "${p.nome}". A proposta entrou no ranking.`,
      link: '/planejamento-anual',
      chaveDedup: `pa_quorum_${p.id}_v${p.versao}`,
    }).catch(() => {});
  }
  res.json({ ok: true, avaliacoes_recebidas: recebidas, quorum: avaliadores.length });
});


router.get('/ciclos/:id/ranking', authorizeModule(MOD, 1), async (req, res) => {
  if (!(await ehPastorOuSuper(req))) return res.status(403).json({ error: 'O ranking de decisão é exclusivo do Pastor presidente' });
  const avaliadores = await carregarAvaliadores(req.params.id);
  const { data: propostas } = await supabase
    .from('plan_propostas').select('*').eq('ciclo_id', req.params.id).is('deleted_at', null);
  const ids = (propostas || []).map((p) => p.id);
  const avs = await avaliacoesPorProposta(ids, avaliadores.map((a) => a.diretoria));
  const decs = await decisoesPorProposta(ids);
  const ranking = PA.montarRanking({
    propostas: propostas || [],
    avaliacoesPorProposta: avs,
    quorum: avaliadores.length,
    diretorias: avaliadores.map((a) => a.diretoria),
  });
  res.json({
    ...ranking,
    ranqueadas: ranking.ranqueadas.map((r) => ({
      ...r,
      situacao_decisao: PA.decisaoVigente(decs[r.proposta.id] || [])?.decisao || null,
      no_calendario: PA.noCalendario(r.proposta, decs[r.proposta.id] || []),
    })),
  });
});


async function aplicarDecisao({ proposta, corpo, pastorId }) {
  const tipo = corpo.decisao;
  if (!['aprovada', 'aprovada_ressalvas', 'reprovada', 'arquivada'].includes(tipo)) {
    return { erro: 'Decisão inválida' };
  }
  if (!PA.podeTransicionar(proposta.estado, tipo)) {
    return { erro: `Proposta em "${rotuloEstado(proposta.estado)}" não aceita a decisão "${rotuloEstado(tipo)}"` };
  }











  if (tipo === 'arquivada' && proposta.estado === 'reprovada') {
    const { data: ativa } = await supabase.from('plan_decisoes')
      .select('id').eq('proposta_id', proposta.id).eq('rodada', proposta.versao)
      .is('revogada_em', null).maybeSingle();
    if (ativa) {
      await supabase.from('plan_decisoes')
        .update({ revogada_em: new Date().toISOString(), revogada_por: pastorId })
        .eq('id', ativa.id);
    }
  }

  const hoje = hojeSaoPaulo();
  const linha = {
    proposta_id: proposta.id,
    rodada: proposta.versao,
    decisao: tipo,
    decidido_por: pastorId,
  };
  if (tipo === 'aprovada_ressalvas') {
    if (!corpo.ressalva?.texto?.trim()) return { erro: 'Escreva a ressalva.' };
    if (!corpo.ressalva?.responsavel_id) return { erro: 'Ressalva exige um responsável.' };
    linha.ressalva_texto = corpo.ressalva.texto.trim();
    linha.ressalva_responsavel_id = corpo.ressalva.responsavel_id;
    linha.ressalva_prazo = corpo.ressalva.prazo || PA.somarDias(hoje, PA.SUPOSICOES.prazoDias);
  }
  if (tipo === 'reprovada') {
    if (!corpo.exigencia?.texto?.trim()) return { erro: 'Escreva a exigência.' };
    linha.exigencia_texto = corpo.exigencia.texto.trim();
    linha.exigencia_prazo = corpo.exigencia.prazo || PA.somarDias(hoje, PA.SUPOSICOES.prazoDias);
  }

  const { data: decisao, error: e1 } = await supabase.from('plan_decisoes').insert(linha).select().single();
  if (e1) {
    console.error('[planejamento-anual] erro ao registrar decisão:', e1.message);
    return { erro: 'Não foi possível registrar a decisão (já existe decisão ativa nesta rodada?)' };
  }

  const patch = { estado: tipo === 'arquivada' ? 'arquivada' : tipo };
  if (tipo === 'reprovada') patch.retificacao_prazo = linha.exigencia_prazo;
  const { error: e2 } = await supabase.from('plan_propostas').update(patch).eq('id', proposta.id);
  if (e2) {

    await supabase.from('plan_decisoes')
      .update({ revogada_em: new Date().toISOString(), revogada_por: pastorId })
      .eq('id', decisao.id);
    return { erro: 'Erro ao atualizar o estado da proposta · decisão desfeita' };
  }





  if (['aprovada', 'aprovada_ressalvas'].includes(tipo) && proposta.natureza === 'rotina') {
    try {
      const { data: cfg } = await supabase
        .from('plan_propostas_rotina_solicitacao').select('*')
        .eq('proposta_id', proposta.id).eq('categoria', 'reserva_espaco').eq('ativo', true)
        .is('ultima_geracao_em', null).maybeSingle();
      if (cfg) {
        const r = await criarSolicitacaoRotina({ proposta, categoria: 'reserva_espaco', dados: cfg.dados || {} });
        if (r.solicitacao) {
          await supabase.from('plan_propostas_rotina_solicitacao')
            .update({ ultima_geracao_em: new Date().toISOString(), ativo: false })
            .eq('id', cfg.id);
        } else if (r.erro) {
          console.error('[planejamento-anual] rotina reserva_espaco não gerada:', r.erro);
        }
      }
    } catch (e) {
      console.error('[planejamento-anual] exceção ao gerar rotina de reserva de espaço:', e.message);
    }
  }

  return { decisao };
}

router.post('/propostas/:id/decisao', authorizeModule(MOD, 1), async (req, res) => {
  if (!(await ehPastorOuSuper(req))) return res.status(403).json({ error: 'Decidir é exclusivo do Pastor presidente' });
  const p = await carregarProposta(req.params.id);
  if (!p) return res.status(404).json({ error: 'Proposta não encontrada' });


  const avaliadores = await carregarAvaliadores(p.ciclo_id);
  const avs = await avaliacoesPorProposta([p.id], avaliadores.map((a) => a.diretoria));
  if (p.estado === 'enviada' && (avs[p.id] || []).length < avaliadores.length) {
    return res.status(409).json({ error: 'Proposta sem quórum de avaliação não pode ser decidida' });
  }

  const r = await aplicarDecisao({ proposta: p, corpo: req.body || {}, pastorId: req.user.id });
  if (r.erro) return res.status(422).json({ error: r.erro });

  notificar({
    modulo: MOD,
    tipo: 'pa_decisao',
    titulo: 'Sua proposta recebeu uma decisão',
    mensagem: `"${p.nome}": ${req.body.decisao === 'aprovada' ? 'aprovada' : req.body.decisao === 'aprovada_ressalvas' ? 'aprovada com ressalvas' : req.body.decisao === 'reprovada' ? 'devolvida com exigência (você tem uma rodada e cinco dias)' : 'arquivada'}.`,
    link: '/planejamento-anual',
    chaveDedup: `pa_decisao_${p.id}_r${p.versao}`,
    targetIds: proponenteIds(p),
  }).catch(() => {});
  res.json(r.decisao);
});


router.post('/ciclos/:id/decisoes-lote', authorizeModule(MOD, 1), async (req, res) => {
  if (!(await ehPastorOuSuper(req))) return res.status(403).json({ error: 'Decidir é exclusivo do Pastor presidente' });
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  const tipo = req.body?.decisao;
  if (!ids.length || !['aprovada', 'reprovada'].includes(tipo)) {
    return res.status(400).json({ error: 'Informe ids e a decisão (aprovada|reprovada)' });
  }
  if (tipo === 'reprovada' && !req.body?.exigencia?.texto?.trim()) {
    return res.status(422).json({ error: 'Escreva a exigência (será aplicada a todas as marcadas).' });
  }
  const avaliadoresPorCiclo = await carregarAvaliadores(req.params.id);
  const resultados = [];
  for (const id of ids) {
    const p = await carregarProposta(id);
    if (!p || p.ciclo_id !== req.params.id) { resultados.push({ id, ok: false, erro: 'não encontrada' }); continue; }
    const avs = await avaliacoesPorProposta([p.id], avaliadoresPorCiclo.map((a) => a.diretoria));
    if (p.estado === 'enviada' && (avs[p.id] || []).length < avaliadoresPorCiclo.length) {
      resultados.push({ id, ok: false, erro: 'sem quórum' });
      continue;
    }
    const r = await aplicarDecisao({ proposta: p, corpo: { decisao: tipo, exigencia: req.body.exigencia }, pastorId: req.user.id });
    resultados.push({ id, ok: !r.erro, erro: r.erro });
    if (!r.erro) {
      notificar({
        modulo: MOD, tipo: 'pa_decisao', titulo: 'Sua proposta recebeu uma decisão',
        mensagem: `"${p.nome}": ${tipo === 'aprovada' ? 'aprovada' : 'devolvida com exigência (você tem uma rodada e cinco dias)'}.`,
        link: '/planejamento-anual', chaveDedup: `pa_decisao_${p.id}_r${p.versao}`, targetIds: proponenteIds(p),
      }).catch(() => {});
    }
  }
  res.json({ resultados });
});


router.post('/propostas/:id/ressalva/verificar', authorizeModule(MOD, 1), async (req, res) => {
  if (!(await ehPastorOuSuper(req))) return res.status(403).json({ error: 'Gerir ressalvas é exclusivo do Pastor presidente' });
  const p = await carregarProposta(req.params.id);
  if (!p || p.estado !== 'aprovada_ressalvas') return res.status(409).json({ error: 'Proposta não está aprovada com ressalvas' });
  const decs = await decisoesPorProposta([p.id]);
  const vigente = PA.decisaoVigente(decs[p.id] || []);
  if (!vigente || vigente.decisao !== 'aprovada_ressalvas') return res.status(409).json({ error: 'Sem ressalva vigente' });
  const { error } = await supabase.from('plan_decisoes')
    .update({ ressalva_cumprida_em: new Date().toISOString(), ressalva_verificada_por: req.user.id })
    .eq('id', vigente.id);
  if (error) return res.status(500).json({ error: 'Erro ao verificar a ressalva' });
  res.json({ ok: true });
});

router.post('/propostas/:id/ressalva/reabrir', authorizeModule(MOD, 1), async (req, res) => {
  if (!(await ehPastorOuSuper(req))) return res.status(403).json({ error: 'Gerir ressalvas é exclusivo do Pastor presidente' });
  const decs = await decisoesPorProposta([req.params.id]);
  const vigente = PA.decisaoVigente(decs[req.params.id] || []);
  if (!vigente || vigente.decisao !== 'aprovada_ressalvas') return res.status(409).json({ error: 'Sem ressalva vigente' });
  const { error } = await supabase.from('plan_decisoes')
    .update({ ressalva_cumprida_em: null, ressalva_verificada_por: null })
    .eq('id', vigente.id);
  if (error) return res.status(500).json({ error: 'Erro ao reabrir a ressalva' });
  res.json({ ok: true });
});


router.post('/propostas/:id/retirar', authorizeModule(MOD, 1), async (req, res) => {
  if (!(await ehPastorOuSuper(req))) return res.status(403).json({ error: 'Retirar do calendário é exclusivo do Pastor presidente' });
  const p = await carregarProposta(req.params.id);
  if (!p || !PA.podeTransicionar(p.estado, 'enviada')) {
    return res.status(409).json({ error: 'Esta proposta não está no calendário' });
  }
  const decs = await decisoesPorProposta([p.id]);
  const vigente = PA.decisaoVigente(decs[p.id] || []);
  if (vigente) {
    await supabase.from('plan_decisoes')
      .update({ revogada_em: new Date().toISOString(), revogada_por: req.user.id })
      .eq('id', vigente.id);
  }
  const { error } = await supabase.from('plan_propostas').update({ estado: 'enviada' }).eq('id', p.id);
  if (error) return res.status(500).json({ error: 'Erro ao retirar a proposta' });
  await revogarAceitesDaProposta(p.id, p.ciclo_id);





  let aviso = null;
  try {
    const vinculo = (await vinculosAtivos([p.id]))[p.id];
    if (vinculo) {
      const nomeTipo = vinculo.tipo === 'projeto' ? 'projeto' : 'evento';
      aviso = `Esta proposta já tinha um ${nomeTipo} criado. Ele continua ativo e aparece na Execução do Planejamento como "fora do plano".`;
      if (p.lider_id) {
        notificar({
          modulo: EXEC_MOD, tipo: 'pa_execucao_fora_do_plano',
          titulo: `Proposta retirada do calendário: ${p.nome}`,
          mensagem: `O Pastor retirou "${p.nome}" do calendário do ciclo. O ${nomeTipo} vinculado continua ativo — decida se ele segue, pausa ou é encerrado.`,
          link: `/planejamento-execucao?proposta=${p.id}`,
          chaveDedup: `pa_fora_do_plano_${p.id}_${hojeSaoPaulo()}`,
          targetIds: [p.lider_id],
        }).catch(() => {});
      }
    }
  } catch (e) {
    console.error('[planejamento-anual] retirar: erro ao conferir vínculo da execução:', e.message);
  }
  res.json({ ok: true, aviso });
});


router.post('/propostas/:id/retificar', authorizeModule(MOD, 2), async (req, res) => {
  const p = await carregarProposta(req.params.id);
  if (!p) return res.status(404).json({ error: 'Proposta não encontrada' });
  if (!proponenteIds(p).includes(req.user.id)) {
    return res.status(403).json({ error: 'Só o proponente retifica a proposta' });
  }
  const erros = PA.validarRetificacao(p, hojeSaoPaulo());
  if (erros.length) return res.status(422).json({ error: erros[0], erros });

  const permitidos = [
    'nome', 'data_inicio', 'precisao_inicio', 'multi_dia', 'data_fim', 'precisao_fim',
    'recorrencia', 'dia_semana', 'hora_inicio', 'hora_fim', 'local_id',
    'locais_adicionais_ids', 'local_fora_detalhe', 'publico_alvo',
    'descricao', 'alcance_pct', 'publico_considerado', 'pertencimento', 'valores',
    'visao_explique', 'impacto', 'custo', 'tem_arrecadacao', 'arrecadacao_prevista',
  ];
  const patch = {
    versao: 2,
    versao_anterior: PA.snapshotRetificacao(p),
    retificada_em: new Date().toISOString(),
    estado: 'retificada',
  };
  permitidos.forEach((c) => { if (req.body[c] !== undefined) patch[c] = req.body[c]; });









  const cicloRetif = await carregarCiclo(p.ciclo_id);
  const errosCampos = PA.validarCamposObrigatorios({ ...p, ...patch }, cicloRetif);
  if (errosCampos.length) return res.status(422).json({ error: errosCampos[0], erros: errosCampos });

  const { data, error } = await supabase.from('plan_propostas')
    .update(patch).eq('id', p.id).eq('versao', 1).select().single();
  if (error) return res.status(409).json({ error: 'Não foi possível retificar (rodada já usada?)' });
  await revogarAceitesDaProposta(p.id, p.ciclo_id);

  notificar({
    modulo: MOD, tipo: 'pa_retificada',
    titulo: 'Proposta retificada aguarda sua reavaliação',
    mensagem: `"${p.nome}" foi retificada pelo proponente. Você reavalia sozinho, com as notas da versão anterior.`,
    link: '/planejamento-anual',
    chaveDedup: `pa_retificada_${p.id}`,
  }).catch(() => {});
  res.json(data);
});


router.post('/propostas/:id/decisao-retificacao', authorizeModule(MOD, 1), async (req, res) => {
  if (!(await ehPastorOuSuper(req))) return res.status(403).json({ error: 'Reavaliar retificação é exclusivo do Pastor presidente' });
  const p = await carregarProposta(req.params.id);
  if (!p || p.estado !== 'retificada') return res.status(409).json({ error: 'Proposta não está retificada' });

  const tipo = req.body?.decisao;

  if (tipo === 'reaberta_diretores') {

    const agora = new Date().toISOString();
    await supabase.from('plan_avaliacoes')
      .update({ deleted_at: agora })
      .eq('proposta_id', p.id).is('deleted_at', null);
    const decs = await decisoesPorProposta([p.id]);
    for (const d of (decs[p.id] || []).filter((x) => !x.revogada_em)) {
      await supabase.from('plan_decisoes')
        .update({ revogada_em: agora, revogada_por: req.user.id }).eq('id', d.id);
    }
    const { error } = await supabase.from('plan_propostas').update({ estado: 'enviada' }).eq('id', p.id);
    if (error) return res.status(500).json({ error: 'Erro ao reabrir a avaliação' });
    const avaliadores = await carregarAvaliadores(p.ciclo_id);
    notificar({
      modulo: MOD, tipo: 'pa_reaberta',
      titulo: 'Proposta reaberta para nova avaliação',
      mensagem: `O Pastor reabriu "${p.nome}" · as notas anteriores foram apagadas e a proposta voltou ao painel de avaliação.`,
      link: '/planejamento-anual',
      chaveDedup: `pa_reaberta_${p.id}`,
      targetIds: avaliadores.map((a) => a.profile_id),
    }).catch(() => {});
    return res.json({ ok: true, estado: 'enviada' });
  }

  if (tipo === 'reprovada') {

    req.body.decisao = 'arquivada';
  }
  const r = await aplicarDecisao({ proposta: p, corpo: req.body || {}, pastorId: req.user.id });
  if (r.erro) return res.status(422).json({ error: r.erro });
  notificar({
    modulo: MOD, tipo: 'pa_decisao', titulo: 'Sua proposta retificada recebeu a decisão final',
    mensagem: `"${p.nome}": ${req.body.decisao === 'aprovada' ? 'aprovada' : req.body.decisao === 'aprovada_ressalvas' ? 'aprovada com ressalvas' : 'arquivada em definitivo'}.`,
    link: '/planejamento-anual', chaveDedup: `pa_decisao_${p.id}_r2`, targetIds: proponenteIds(p),
  }).catch(() => {});
  res.json(r.decisao);
});


router.post('/propostas/:id/apontamentos', authorizeModule(MOD, 1), async (req, res) => {
  if (!(await ehPastorOuSuper(req))) return res.status(403).json({ error: 'Apontar respostas é prerrogativa do Pastor presidente' });
  const campo = req.body?.campo;
  const texto = (req.body?.texto || '').trim();
  if (!PA.CAMPOS_APONTAVEIS.some((c) => c.chave === campo)) return res.status(400).json({ error: 'Campo inválido' });
  if (!texto) return res.status(422).json({ error: 'Escreva o apontamento.' });
  const { data, error } = await supabase.from('plan_apontamentos')
    .insert({ proposta_id: req.params.id, campo, texto, criado_por: req.user.id })
    .select().single();
  if (error) return res.status(400).json({ error: 'Não foi possível criar o apontamento' });
  const p = await carregarProposta(req.params.id);
  if (p) {
    notificar({
      modulo: MOD, tipo: 'pa_apontamento', titulo: 'Novo apontamento na sua proposta',
      mensagem: `O Pastor apontou o campo "${PA.CAMPOS_APONTAVEIS.find((c) => c.chave === campo).rotulo}" em "${p.nome}".`,
      link: '/planejamento-anual', chaveDedup: `pa_apont_${data.id}`, targetIds: proponenteIds(p),
    }).catch(() => {});
  }
  res.status(201).json(data);
});








const CAMPOS_APONTAMENTO_PASTOR = ['custo', 'recorrencia', 'data'];
router.put('/propostas/:id/apontamento-pastor', authorizeModule(MOD, 1), async (req, res) => {
  if (!(await ehPastorOuSuper(req))) return res.status(403).json({ error: 'Apontar custo/recorrência/data é prerrogativa do Pastor presidente' });
  const p = await carregarProposta(req.params.id);
  if (!p) return res.status(404).json({ error: 'Proposta não encontrada' });
  const campo = req.body?.campo;
  if (!CAMPOS_APONTAMENTO_PASTOR.includes(campo)) {
    return res.status(400).json({ error: 'Campo inválido (use custo, recorrencia ou data)' });
  }
  const valor = req.body?.valor === undefined ? null : req.body.valor;
  const patch = { apontamento_pastor_em: new Date().toISOString(), apontamento_pastor_por: req.user.id };
  if (campo === 'custo') {
    if (valor !== null && (Number.isNaN(Number(valor)) || Number(valor) < 0)) {
      return res.status(422).json({ error: 'Custo apontado inválido' });
    }
    patch.custo_apontado = valor === null ? null : Number(valor);
  } else if (campo === 'recorrencia') {
    const validas = ['unica', 'diaria', 'semanal', 'mensal', 'trimestral', 'semestral', 'personalizada'];
    if (valor !== null && !validas.includes(valor)) {
      return res.status(422).json({ error: 'Recorrência apontada inválida' });
    }
    patch.recorrencia_apontada = valor;


    if (valor === null) {
      patch.dia_semana_apontado = null;
    } else if (req.body.dia_semana !== undefined) {
      const ds = req.body.dia_semana === null ? null : Number(req.body.dia_semana);
      if (ds !== null && (Number.isNaN(ds) || ds < 0 || ds > 6)) {
        return res.status(422).json({ error: 'Dia da semana apontado inválido (0-6)' });
      }
      patch.dia_semana_apontado = ds;
    }
  } else if (campo === 'data') {
    if (valor !== null && !/^\d{4}-\d{2}-\d{2}$/.test(String(valor))) {
      return res.status(422).json({ error: 'Data apontada inválida (YYYY-MM-DD)' });
    }
    patch.data_inicio_apontada = valor;
    patch.precisao_inicio_apontada = valor === null ? null : (req.body.precisao || 'dia');
  }
  const { data, error } = await supabase.from('plan_propostas').update(patch).eq('id', p.id).select().single();
  if (error) return res.status(500).json({ error: 'Erro ao gravar o apontamento' });
  res.json(data);
});

router.delete('/apontamentos/:id', authorizeModule(MOD, 1), async (req, res) => {
  if (!(await ehPastorOuSuper(req))) return res.status(403).json({ error: 'Remover apontamento é prerrogativa do Pastor presidente' });
  const { error } = await supabase.from('plan_apontamentos')
    .update({ deleted_at: new Date().toISOString() }).eq('id', req.params.id);
  if (error) return res.status(500).json({ error: 'Erro ao remover o apontamento' });
  res.json({ ok: true });
});












async function revogarAceitesDaProposta(propostaId, cicloId) {
  await supabase.from('plan_conflitos_aceitos')
    .delete().eq('ciclo_id', cicloId)
    .or(`proposta_a.eq.${propostaId},proposta_b.eq.${propostaId}`);
}

async function contextoCalendario(cicloId) {
  const [{ porId: locaisById }, avaliadores] = await Promise.all([carregarLocais(), carregarAvaliadores(cicloId)]);
  const { data: propostas } = await supabase
    .from('plan_propostas').select('*').eq('ciclo_id', cicloId).is('deleted_at', null);
  const ids = (propostas || []).map((p) => p.id);
  const [avs, decs, { data: aceites }] = await Promise.all([
    avaliacoesPorProposta(ids, avaliadores.map((a) => a.diretoria)),
    decisoesPorProposta(ids),
    supabase.from('plan_conflitos_aceitos').select('*').eq('ciclo_id', cicloId),
  ]);
  return { locaisById, avaliadores, propostas: propostas || [], avs, decs, aceites: aceites || [] };
}






router.get('/ciclos/:id/conflitos', authorizeModule(MOD, 1), async (req, res) => {
  if (!(ehDiretoria(req) || await ehPastorOuSuper(req))) {
    return res.status(403).json({ error: 'Os conflitos do calendário são visíveis só para a diretoria e o Pastor presidente' });
  }
  const ctx = await contextoCalendario(req.params.id);
  const emCalendario = ctx.propostas.filter((p) => PA.noCalendario(p, ctx.decs[p.id] || []));
  const conflitos = PA.aplicarAceites(PA.detectarConflitos(emCalendario, ctx.locaisById), ctx.aceites);
  res.json(conflitos.map((c) => ({
    proposta_a: { id: c.a.id, nome: c.a.nome, natureza: c.a.natureza },
    proposta_b: { id: c.b.id, nome: c.b.nome, natureza: c.b.natureza },
    tipo: c.tipo,
    firme: c.firme,
    aceite: c.aceite ? { id: c.aceite.id, justificativa: c.aceite.justificativa, aceito_em: c.aceite.aceito_em } : null,
  })));
});

router.post('/ciclos/:id/conflitos/aceitar', authorizeModule(MOD, 1), async (req, res) => {
  if (!(await ehPastorOuSuper(req))) return res.status(403).json({ error: 'Aceitar conflito é exclusivo do Pastor presidente' });
  const justificativa = (req.body?.justificativa || '').trim();
  if (justificativa.length < 5) return res.status(422).json({ error: 'Por que esta coincidência é tolerável? (justificativa obrigatória)' });
  const [a, b] = [req.body?.proposta_a, req.body?.proposta_b].sort();
  const { data, error } = await supabase.from('plan_conflitos_aceitos')
    .insert({ ciclo_id: req.params.id, proposta_a: a, proposta_b: b, tipo: req.body?.tipo, justificativa, aceito_por: req.user.id })
    .select().single();
  if (error) return res.status(400).json({ error: 'Não foi possível aceitar (já aceito?)' });
  res.status(201).json(data);
});

router.delete('/ciclos/:id/conflitos/aceites/:aceiteId', authorizeModule(MOD, 1), async (req, res) => {
  if (!(await ehPastorOuSuper(req))) return res.status(403).json({ error: 'Reabrir conflito é exclusivo do Pastor presidente' });
  const { error } = await supabase.from('plan_conflitos_aceitos')
    .delete().eq('id', req.params.aceiteId).eq('ciclo_id', req.params.id);
  if (error) return res.status(500).json({ error: 'Erro ao reabrir o conflito' });
  res.json({ ok: true });
});






router.get('/ciclos/:id/insights', authorizeModule(MOD, 1), async (req, res) => {
  const ciclo = await carregarCiclo(req.params.id);
  if (!ciclo) return res.status(404).json({ error: 'Ciclo não encontrado' });
  if (!(ehDiretoria(req) || await ehPastorOuSuper(req))) {
    return res.status(403).json({ error: 'Os insights de IA são visíveis só para a diretoria e o Pastor presidente' });
  }
  try {
    const ctx = await contextoCalendario(ciclo.id);
    const insights = await PAInsights.montarInsights(ctx);
    res.json(insights);
  } catch (e) {
    console.error('[planejamento-anual] erro ao montar insights:', e.message);
    res.status(500).json({ error: 'Erro ao montar os insights' });
  }
});

const CAMPOS_DIVERGENCIA = ['data_inicio', 'precisao_inicio', 'hora_inicio', 'hora_fim', 'recorrencia', 'dia_semana'];




router.get('/ciclos/:id/calendario', authorizeModule(MOD, 1), async (req, res) => {
  if (!(ehDiretoria(req) || await ehPastorOuSuper(req))) {
    return res.status(403).json({ error: 'O calendário do ciclo é visível só para a diretoria e o Pastor presidente' });
  }
  const ciclo = await carregarCiclo(req.params.id);
  if (!ciclo) return res.status(404).json({ error: 'Ciclo não encontrado' });
  const ctx = await contextoCalendario(ciclo.id);
  const { porId: locaisById } = { porId: ctx.locaisById };

  const emCalendario = ctx.propostas.filter((p) => PA.noCalendario(p, ctx.decs[p.id] || []));
  const conflitos = PA.aplicarAceites(PA.detectarConflitos(emCalendario, locaisById), ctx.aceites);


  let definitivo = null;
  if (ciclo.publicacao_versao > 0) {
    const { data: itens } = await supabase
      .from('plan_calendario_itens').select('*')
      .eq('ciclo_id', ciclo.id).eq('publicacao_versao', ciclo.publicacao_versao);
    const vivasPorId = {};
    emCalendario.forEach((p) => { vivasPorId[p.id] = p; });
    const divergencias = [];
    (itens || []).forEach((item) => {
      const atual = vivasPorId[item.proposta_id];
      if (!atual) { divergencias.push({ nome: item.nome, tipo: 'saiu_do_calendario' }); return; }
      const mudou = CAMPOS_DIVERGENCIA.some((c) => String(item[c] ?? '') !== String(atual[c] ?? ''))
        || item.local_nome !== (locaisById[atual.local_id]?.nome || item.local_nome);
      if (mudou) divergencias.push({ nome: item.nome, tipo: 'alterada' });
      delete vivasPorId[item.proposta_id];
    });
    Object.values(vivasPorId).forEach((p) => divergencias.push({ nome: p.nome, tipo: 'aprovada_depois' }));
    definitivo = { itens: itens || [], publicado_em: ciclo.publicado_em, versao: ciclo.publicacao_versao, divergencias };
  }

  res.json({
    planejamento: {
      itens: emCalendario.map((p) => ({
        ...p,
        local_nome: locaisById[p.local_id]?.nome || null,
        liquido: PA.liquido(p),
      })),
      conflitos: conflitos.map((c) => ({
        proposta_a: { id: c.a.id, nome: c.a.nome }, proposta_b: { id: c.b.id, nome: c.b.nome },
        tipo: c.tipo, firme: c.firme,



        aceite: c.aceite ? { id: c.aceite.id, justificativa: c.aceite.justificativa, aceito_em: c.aceite.aceito_em } : null,
      })),
    },
    definitivo,
  });
});


router.put('/propostas/:id/remanejar', authorizeModule(MOD, 1), async (req, res) => {
  if (!(await ehPastorOuSuper(req))) return res.status(403).json({ error: 'Remanejar é exclusivo do Pastor presidente' });
  const p = await carregarProposta(req.params.id);
  if (!p) return res.status(404).json({ error: 'Proposta não encontrada' });
  const permitidos = ['data_inicio', 'precisao_inicio', 'multi_dia', 'data_fim', 'precisao_fim', 'recorrencia', 'dia_semana', 'hora_inicio', 'hora_fim', 'local_id'];
  const patch = {};
  permitidos.forEach((c) => { if (req.body[c] !== undefined) patch[c] = req.body[c]; });
  if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nada a remanejar' });
  const { data, error } = await supabase.from('plan_propostas').update(patch).eq('id', p.id).select().single();
  if (error) return res.status(400).json({ error: 'Não foi possível remanejar' });
  await revogarAceitesDaProposta(p.id, p.ciclo_id);
  res.json(data);
});


router.get('/ciclos/:id/travas', authorizeModule(MOD, 1), async (req, res) => {
  if (!(await ehPastorOuSuper(req))) return res.status(403).json({ error: 'Publicação é exclusiva do Pastor presidente' });
  const ctx = await contextoCalendario(req.params.id);
  const travas = PA.validarTravas({
    propostas: ctx.propostas,
    avaliacoesPorProposta: ctx.avs,
    decisoesPorProposta: ctx.decs,
    quorum: ctx.avaliadores.length,
    locaisById: ctx.locaisById,
    aceites: ctx.aceites,
  });
  res.json({
    bloqueada: travas.bloqueada,
    motivos: travas.motivos,
    itens_no_calendario: travas.detalhe.itensCalendario.length,
    conflitos_aceitos: ctx.aceites.length,
  });
});

router.post('/ciclos/:id/publicar', authorizeModule(MOD, 1), async (req, res) => {
  if (!(await ehPastorOuSuper(req))) return res.status(403).json({ error: 'Publicar o calendário é exclusivo do Pastor presidente' });

  const ctx = await contextoCalendario(req.params.id);
  const travas = PA.validarTravas({
    propostas: ctx.propostas,
    avaliacoesPorProposta: ctx.avs,
    decisoesPorProposta: ctx.decs,
    quorum: ctx.avaliadores.length,
    locaisById: ctx.locaisById,
    aceites: ctx.aceites,
  });
  if (travas.bloqueada) {
    return res.status(409).json({ error: 'A publicação está bloqueada', motivos: travas.motivos });
  }
  const { data, error } = await supabase.rpc('fn_plan_publicar_ciclo', {
    p_ciclo_id: req.params.id,
    p_publicado_por: req.user.id,
  });
  if (error) {
    console.error('[planejamento-anual] publicação bloqueada/falhou:', error.message);
    return res.status(409).json({ error: 'A publicação foi bloqueada na verificação final', detalhe: error.message });
  }
  notificar({
    modulo: MOD, tipo: 'pa_publicado', titulo: 'Calendário do ciclo publicado',
    mensagem: `O calendário definitivo foi publicado (versão ${data?.versao}, ${data?.itens} itens).`,
    link: '/planejamento-anual', chaveDedup: `pa_publicado_${req.params.id}_v${data?.versao}`,
  }).catch(() => {});
  res.json(data);
});









async function assentoFinanceiro(req, cicloId) {
  const avaliadores = await carregarAvaliadores(cicloId);
  return avaliadores.find((a) => a.diretoria === 'financeiro' && a.profile_id === req.user.id) || null;
}

async function ehResponsavelOrcamento(req, cicloId) {
  const { data } = await supabase
    .from('plan_orcamento_responsaveis')
    .select('id').eq('ciclo_id', cicloId).eq('profile_id', req.user.id).maybeSingle();
  return Boolean(data);
}

async function podeCompoOrcamento(req, cicloId) {
  if (await assentoFinanceiro(req, cicloId)) return true;
  return ehResponsavelOrcamento(req, cicloId);
}

router.get('/ciclos/:id/orcamento', authorizeModule(MOD, 1), async (req, res) => {
  const pode = await podeCompoOrcamento(req, req.params.id);
  if (!pode && !(await ehPastorOuSuper(req))) {
    return res.status(403).json({ error: 'O orçamento do ciclo é preenchido pela diretoria Financeira e avaliado pelo Pastor presidente.' });
  }
  const [{ data: header }, { data: valores }] = await Promise.all([
    supabase.from('plan_orcamentos').select('*').eq('ciclo_id', req.params.id).maybeSingle(),
    supabase.from('plan_orcamento_valores').select('linha, mes, valor').eq('ciclo_id', req.params.id),
  ]);
  res.json({
    header: header || null,
    valores: valores || [],
    caixa_livre: PA.caixaLivreMensal(valores || []),
    linhas: PA.LINHAS_ORCAMENTO,
  });
});

router.put('/ciclos/:id/orcamento', authorizeModule(MOD, 1), async (req, res) => {
  if (!(await podeCompoOrcamento(req, req.params.id))) {
    return res.status(403).json({ error: 'Só a diretoria Financeira compõe o orçamento do ciclo' });
  }

  const valores = Array.isArray(req.body?.valores) ? req.body.valores : [];
  for (const v of valores) {
    if (!PA.LINHAS_ORCAMENTO.includes(v.linha) || !(v.mes >= 1 && v.mes <= 12)) {
      return res.status(422).json({ error: `Linha/mês inválido: ${v.linha}/${v.mes}` });
    }
  }
  const { error: e1 } = await supabase.from('plan_orcamentos').upsert({
    ciclo_id: req.params.id,
    obs: req.body?.obs ?? null,
    premissas: Array.isArray(req.body?.premissas) ? req.body.premissas : [],
  }, { onConflict: 'ciclo_id' });
  if (e1) return res.status(500).json({ error: 'Erro ao salvar o orçamento' });





  const falhas = [];
  for (const v of valores) {
    const { error } = await supabase.from('plan_orcamento_valores').upsert({
      ciclo_id: req.params.id, linha: v.linha, mes: v.mes, valor: Number(v.valor) || 0,
    }, { onConflict: 'ciclo_id,linha,mes' });
    if (error) falhas.push({ linha: v.linha, mes: v.mes, erro: error.message });
  }
  const { data: atuais } = await supabase.from('plan_orcamento_valores')
    .select('linha, mes, valor').eq('ciclo_id', req.params.id);
  if (falhas.length) {
    console.error('[planejamento-anual] orçamento: falha parcial ao salvar valores:', falhas);




    return res.json({
      ok: false,
      error: `${falhas.length} de ${valores.length} valor(es) não foram salvos`,
      falhas,
      caixa_livre: PA.caixaLivreMensal(atuais || []),
    });
  }
  res.json({ ok: true, caixa_livre: PA.caixaLivreMensal(atuais || []) });
});

router.post('/ciclos/:id/orcamento/enviar', authorizeModule(MOD, 1), async (req, res) => {
  if (!(await podeCompoOrcamento(req, req.params.id))) {
    return res.status(403).json({ error: 'Só a diretoria Financeira envia o orçamento ao Pastor' });
  }
  const { error } = await supabase.from('plan_orcamentos').upsert({
    ciclo_id: req.params.id,
    enviado_em: new Date().toISOString(),
    enviado_por: req.user.id,
  }, { onConflict: 'ciclo_id' });
  if (error) return res.status(500).json({ error: 'Erro ao enviar o orçamento' });
  notificar({
    modulo: MOD, tipo: 'pa_orcamento', titulo: 'Orçamento do ciclo enviado',
    mensagem: 'A diretoria Financeira enviou (ou reenviou) o orçamento do ciclo para sua referência de decisão.',
    link: '/planejamento-anual', chaveDedup: `pa_orcamento_${req.params.id}_${hojeSaoPaulo()}`,
  }).catch(() => {});
  res.json({ ok: true });
});


router.get('/ciclos/:id/orcamento/pastor', authorizeModule(MOD, 1), async (req, res) => {
  if (!(await ehPastorOuSuper(req))) return res.status(403).json({ error: 'Esta visão é exclusiva do Pastor presidente' });
  const [{ data: header }, { data: valores }] = await Promise.all([
    supabase.from('plan_orcamentos').select('*').eq('ciclo_id', req.params.id).maybeSingle(),
    supabase.from('plan_orcamento_valores').select('linha, mes, valor').eq('ciclo_id', req.params.id),
  ]);
  const semOrcamento = !header?.enviado_em;




  const ctx = await contextoCalendario(req.params.id);
  const caixa = semOrcamento ? null : PA.caixaLivreMensal(valores || []);

  let propostas = ctx.propostas;
  const simular = req.query.simular;
  if (simular) {
    propostas = ctx.propostas.filter((p) => {
      const pendente = p.estado === 'enviada';
      return !pendente || p.id === simular;
    });
  }
  const visao = PA.orcamentoDoPastor({
    propostas,
    avaliacoesPorProposta: ctx.avs,
    decisoesPorProposta: ctx.decs,
    quorum: ctx.avaliadores.length,
    caixaLivre: caixa,
  });




  const comprometidoComApontamento = PA.custoMensalAprovadas(visao.aprovadas);



  const todasPropostas = PA.custoMensalTodasPropostas(ctx.propostas);
  res.json({
    sem_orcamento: semOrcamento,
    mensagem: semOrcamento
      ? 'A diretoria Financeira ainda não enviou o orçamento do ciclo. Sem ele, não há referência de caixa livre — mas as linhas de "todas as propostas" e "aprovado em tempo real" abaixo já refletem os dados do ciclo.'
      : null,
    caixa_livre: caixa,
    comprometido: comprometidoComApontamento,
    todas_propostas: todasPropostas,
    propostos: visao.propostos,
    saldo: semOrcamento ? null : visao.saldo,
    meses_negativos: semOrcamento ? null : visao.mesesNegativos,
    enviado_por: header?.enviado_por || null,
    enviado_em: header?.enviado_em || null,
    premissas: header?.premissas || [],
    obs: header?.obs || null,
    itens: visao.aprovadas.map((p) => ({ id: p.id, nome: p.nome, rateio: PA.distribuirCustoPorMes(p, { usarApontamento: true }) })),
    pendentes: visao.pendentes.map((p) => ({ id: p.id, nome: p.nome, rateio: PA.rateioMensal(p) })),
  });
});











const EXEC_MOD = 'planejamento-execucao';




const FASES_PADRAO_PROJETO = [
  'Concepção', 'Planejamento', 'Mobilização', 'Comunicação',
  'Execução', 'Monitoramento', 'Encerramento',
];



async function emLotes(ids, consulta) {
  const out = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await consulta(ids.slice(i, i + 200));
    if (error) throw error;
    out.push(...(data || []));
  }
  return out;
}




async function vinculosAtivos(propostaIds) {
  const porProposta = {};
  if (!propostaIds.length) return porProposta;
  const [projs, evs] = await Promise.all([
    emLotes(propostaIds, (lote) => supabase.from('projects').select('id, proposta_id')
      .in('proposta_id', lote).is('deleted_at', null)),
    emLotes(propostaIds, (lote) => supabase.from('events').select('id, proposta_id').in('proposta_id', lote)),
  ]);
  projs.forEach((r) => { porProposta[r.proposta_id] = { tipo: 'projeto', id: r.id }; });
  evs.forEach((r) => { porProposta[r.proposta_id] = { tipo: 'evento', id: r.id }; });
  return porProposta;
}

const ESTADOS_NO_PLANO = ['aprovada', 'aprovada_ressalvas'];




async function saudeDasPropostas(propostas, decs, vinculoPorProposta) {
  const hoje = hojeSaoPaulo();
  const resumo = (linhas, prazoCampo, statusCampo) => {
    const t = { total: 0, abertas: 0, concluidas: 0, atrasadas: 0, bloqueadas: 0, vencendo7: 0 };
    const limite = PA.somarDias(hoje, 7);
    linhas.forEach((l) => {
      t.total += 1;
      if (l[statusCampo] === 'concluida') { t.concluidas += 1; return; }
      t.abertas += 1;
      if (l[statusCampo] === 'bloqueada') t.bloqueadas += 1;
      const prazo = l[prazoCampo] ? String(l[prazoCampo]).slice(0, 10) : null;
      if (prazo && prazo < hoje) t.atrasadas += 1;
      else if (prazo && prazo <= limite) t.vencendo7 += 1;
    });
    return t;
  };
  const seguro = async (nome, fn) => {
    try { return await fn(); } catch (e) { console.error(`[planejamento-execucao] saúde: erro ao ler ${nome}:`, e.message); return []; }
  };

  const projIds = []; const evIds = []; const rotinaIds = [];
  propostas.forEach((p) => {
    const v = vinculoPorProposta[p.id];
    if (p.natureza === 'rotina') rotinaIds.push(p.id);
    else if (v?.tipo === 'projeto') projIds.push(v.id);
    else if (v?.tipo === 'evento') evIds.push(v.id);
  });
  const [tProj, tEv, tRot, fRot, pubs] = await Promise.all([
    seguro('tarefas de projeto', () => emLotes(projIds, (l) => supabase.from('project_tasks').select('project_id, deadline, status').in('project_id', l))),
    seguro('tarefas de evento', () => emLotes(evIds, (l) => supabase.from('cycle_phase_tasks').select('event_id, prazo, status').in('event_id', l))),
    seguro('tarefas de rotina', () => emLotes(rotinaIds, (l) => supabase.from('plan_execucao_tarefas').select('proposta_id, prazo, status').in('proposta_id', l))),
    seguro('fases de rotina', () => emLotes(rotinaIds, (l) => supabase.from('plan_execucao_fases').select('proposta_id').in('proposta_id', l))),
    seguro('calendário publicado', () => emLotes(propostas.map((p) => p.id), (l) => supabase.from('plan_calendario_itens')
      .select('proposta_id, publicacao_versao, data_inicio, data_fim, recorrencia, dia_semana').in('proposta_id', l))),
  ]);
  const agrupar = (linhas, chave) => linhas.reduce((m, l) => { (m[l[chave]] = m[l[chave]] || []).push(l); return m; }, {});
  const porProj = agrupar(tProj, 'project_id'); const porEv = agrupar(tEv, 'event_id');
  const porRot = agrupar(tRot, 'proposta_id'); const fasesRot = agrupar(fRot, 'proposta_id');
  const publicado = {};
  pubs.forEach((r) => { if (!publicado[r.proposta_id] || r.publicacao_versao > publicado[r.proposta_id].publicacao_versao) publicado[r.proposta_id] = r; });

  const saida = {};
  propostas.forEach((p) => {
    const v = vinculoPorProposta[p.id];
    let tarefas; let temVinculo;
    if (p.natureza === 'rotina') { tarefas = resumo(porRot[p.id] || [], 'prazo', 'status'); temVinculo = Boolean(fasesRot[p.id]?.length); }
    else if (v?.tipo === 'projeto') { tarefas = resumo(porProj[v.id] || [], 'deadline', 'status'); temVinculo = true; }
    else if (v?.tipo === 'evento') { tarefas = resumo(porEv[v.id] || [], 'prazo', 'status'); temVinculo = true; }
    else { tarefas = resumo([], 'prazo', 'status'); temVinculo = false; }
    const vigente = PA.decisaoVigente(decs[p.id] || []);
    const ressalva = vigente && vigente.decisao === 'aprovada_ressalvas'
      ? { texto: vigente.ressalva_texto, prazo: vigente.ressalva_prazo ? String(vigente.ressalva_prazo).slice(0, 10) : null, cumprida: Boolean(vigente.ressalva_cumprida_em) }
      : null;
    saida[p.id] = PA.saudeExecucao(p, {
      hoje, foraDoPlano: !ESTADOS_NO_PLANO.includes(p.estado), temVinculo, tarefas, ressalva, publicado: publicado[p.id] || null,
    });
  });
  return saida;
}

router.get('/execucao/propostas', authorizeModule(EXEC_MOD, 1), async (req, res) => {
  const filtrar = (q) => {
    let query = q.is('deleted_at', null);
    if (req.query.ciclo_id) query = query.eq('ciclo_id', req.query.ciclo_id);
    if (req.query.natureza) query = query.eq('natureza', req.query.natureza);
    if (req.query.area) query = query.eq('area', req.query.area);
    return query;
  };
  const { data: aprovadas, error } = await filtrar(
    supabase.from('plan_propostas').select('*').in('estado', ESTADOS_NO_PLANO)
  ).order('data_inicio');
  if (error) return res.status(500).json({ error: 'Erro ao listar as propostas aprovadas' });





  let foraDoPlano = [];
  try {
    const [{ data: projsLig }, { data: evsLig }] = await Promise.all([
      supabase.from('projects').select('proposta_id').not('proposta_id', 'is', null).is('deleted_at', null),
      supabase.from('events').select('proposta_id').not('proposta_id', 'is', null),
    ]);
    const idsAprovadas = new Set((aprovadas || []).map((p) => p.id));
    const orfas = [...new Set([...(projsLig || []), ...(evsLig || [])].map((r) => r.proposta_id))]
      .filter((id) => !idsAprovadas.has(id));
    if (orfas.length) {
      foraDoPlano = await emLotes(orfas, (lote) => filtrar(supabase.from('plan_propostas').select('*').in('id', lote)));
    }
  } catch (e) {
    console.error('[planejamento-execucao] erro ao ler propostas fora do plano:', e.message);
  }

  const propostas = [...(aprovadas || []), ...foraDoPlano];
  const ids = propostas.map((p) => p.id);
  const decs = await decisoesPorProposta(ids);
  const gestor = await gestorDaExecucao(req);



  const liderIds = [...new Set(propostas.map((p) => p.lider_id).filter(Boolean))];
  const lideres = {};
  if (liderIds.length) {
    try {
      const rows = await emLotes(liderIds, (lote) => supabase.from('profiles').select('id, name').in('id', lote));
      rows.forEach((r) => { lideres[r.id] = r.name; });
    } catch (e) {
      console.error('[planejamento-execucao] erro ao ler líderes:', e.message);
    }
  }



  let vinculoPorProposta = {};
  try {
    vinculoPorProposta = await vinculosAtivos(ids);
  } catch (e) {
    console.error('[planejamento-execucao] erro ao ler vínculos:', e.message);
  }

  const saude = await saudeDasPropostas(propostas, decs, vinculoPorProposta);

  res.json(propostas.map((p) => ({
    id: p.id, nome: p.nome, natureza: p.natureza, area: p.area,
    lider_id: p.lider_id, lider_nome: lideres[p.lider_id] || null,

    saude: gestor.pode(p) ? saude[p.id] : { farol: saude[p.id].farol },
    data_inicio: p.data_inicio, precisao_inicio: p.precisao_inicio,
    multi_dia: p.multi_dia, data_fim: p.data_fim, precisao_fim: p.precisao_fim,
    estado: p.estado, ciclo_id: p.ciclo_id,


    descricao: p.descricao, hora_inicio: p.hora_inicio, hora_fim: p.hora_fim,
    recorrencia: p.recorrencia, dia_semana: p.dia_semana,
    calendario: PA.datasNoCalendario(p),

    ...(gestor.pode(p) ? { custo: p.custo } : {}),
    pode_gerir: gestor.pode(p),
    no_calendario: PA.noCalendario(p, decs[p.id] || []),
    fora_do_plano: !ESTADOS_NO_PLANO.includes(p.estado),
    vinculo: vinculoPorProposta[p.id] || { tipo: null, id: null },
  })));
});








router.get('/execucao/liturgicos', authorizeModule(EXEC_MOD, 1), async (req, res) => {
  const ano = parseInt(req.query.ano, 10);
  if (!Number.isFinite(ano) || ano < 2020 || ano > 2100) return res.status(400).json({ error: 'Ano inválido' });
  const itens = itensFixosDoAno(ano, req.query.cultos === '1');


  let ajustes = [];
  const de = `${ano}-01-01`; const ate = `${ano}-12-31`;
  const { data, error } = await supabase.from('plan_calendario_ajustes')
    .select('item_id, data_original, data_nova, motivo')
    .or(`and(data_original.gte.${de},data_original.lte.${ate}),and(data_nova.gte.${de},data_nova.lte.${ate})`);
  if (error) console.error('[planejamento-execucao] ajustes do calendário:', error.message);
  else ajustes = data || [];
  const podeRemanejar = (await ehPastorOuSuper(req)) || (await ehPmo(req));
  res.json(PA.aplicarAjustes(itens, ajustes, ano).map((i) => ({ ...i, pode_remanejar: podeRemanejar })));
});


function itensFixosDoAno(ano, comCultos) {
  const itens = [...PA.liturgicosDoAno(ano), PA.encontraoDoAno(ano)];
  if (comCultos) itens.push(...PA.cultosDoAno(ano));
  return itens;
}



router.put('/execucao/calendario/ajustes', authorizeModule(EXEC_MOD, 1), async (req, res) => {
  if (!((await ehPastorOuSuper(req)) || (await ehPmo(req)))) {
    return res.status(403).json({ error: 'Só o PMO ou o Pastor remanejam datas do calendário' });
  }
  const { item_id: itemId, data_original: original, data_nova: nova } = req.body || {};
  const motivo = String(req.body?.motivo || '').trim().slice(0, 300);
  if (!PA.ehDataISO(original)) return res.status(422).json({ error: 'Data original inválida' });
  if (nova != null && !PA.ehDataISO(nova)) return res.status(422).json({ error: 'Nova data inválida' });
  if (nova === original) return res.status(422).json({ error: 'A nova data é igual à original' });
  const item = itensFixosDoAno(Number(original.slice(0, 4)), true).find((i) => i.id === itemId);
  if (!item || !item.calendario.dias.includes(original)) {
    return res.status(422).json({ error: 'Esse item não acontece nessa data pela regra' });
  }
  const { data, error } = await supabase.from('plan_calendario_ajustes')
    .upsert({ item_id: itemId, data_original: original, data_nova: nova ?? null, motivo, created_by: req.user.id },
      { onConflict: 'item_id,data_original' })
    .select('item_id, data_original, data_nova, motivo').single();
  if (error) {
    console.error('[planejamento-execucao] erro ao remanejar:', error.message);
    return res.status(500).json({ error: 'Não foi possível remanejar a data' });
  }
  res.json(data);
});

router.delete('/execucao/calendario/ajustes', authorizeModule(EXEC_MOD, 1), async (req, res) => {
  if (!((await ehPastorOuSuper(req)) || (await ehPmo(req)))) {
    return res.status(403).json({ error: 'Só o PMO ou o Pastor remanejam datas do calendário' });
  }
  const { item_id: itemId, data_original: original } = req.query;
  if (!itemId || !PA.ehDataISO(original)) return res.status(422).json({ error: 'Informe item_id e data_original' });
  const { error } = await supabase.from('plan_calendario_ajustes').delete().eq('item_id', itemId).eq('data_original', original);
  if (error) return res.status(500).json({ error: 'Não foi possível desfazer o ajuste' });
  res.json({ ok: true });
});

router.get('/execucao/propostas/:id', authorizeModule(EXEC_MOD, 1), async (req, res) => {
  const p = await carregarProposta(req.params.id);
  if (!p) return res.status(404).json({ error: 'Proposta não encontrada' });

  let vinculo = { tipo: null, id: null };
  try {
    vinculo = (await vinculosAtivos([p.id]))[p.id] || vinculo;
  } catch (e) {
    console.error('[planejamento-execucao] erro ao ler vínculo:', e.message);
  }
  const foraDoPlano = !ESTADOS_NO_PLANO.includes(p.estado);
  if (foraDoPlano && !vinculo.tipo) return res.status(404).json({ error: 'Proposta não encontrada' });

  const decs = await decisoesPorProposta([p.id]);

  let liderNome = null;
  if (p.lider_id) {
    const { data } = await supabase.from('profiles').select('name').eq('id', p.lider_id).maybeSingle();
    liderNome = data?.name || null;
  }
  let localNome = null;
  if (p.local_id) {
    const { data } = await supabase.from('plan_locais').select('nome').eq('id', p.local_id).maybeSingle();
    localNome = data?.nome || null;
  }
  const gestor = await gestorDaExecucao(req);
  let rotinaConfig = null;
  if (p.natureza === 'rotina' && gestor.pode(p)) {
    const { data } = await supabase
      .from('plan_propostas_rotina_solicitacao').select('*').eq('proposta_id', p.id).maybeSingle();
    rotinaConfig = data || null;
  }

  const noCalendario = PA.noCalendario(p, decs[p.id] || []);
  const saudeCompleta = (await saudeDasPropostas([p], decs, { [p.id]: vinculo }))[p.id];








  if (!gestor.pode(p)) {
    return res.json({
      resumo: true, pode_gerir: false,
      id: p.id, nome: p.nome, natureza: p.natureza, area: p.area, estado: p.estado, ciclo_id: p.ciclo_id,
      lider_id: p.lider_id, lider_nome: liderNome, local_nome: localNome, local_fora_detalhe: p.local_fora_detalhe,
      data_inicio: p.data_inicio, precisao_inicio: p.precisao_inicio, multi_dia: p.multi_dia,
      data_fim: p.data_fim, precisao_fim: p.precisao_fim, hora_inicio: p.hora_inicio, hora_fim: p.hora_fim,
      recorrencia: p.recorrencia, dia_semana: p.dia_semana,
      descricao: p.descricao, publico_alvo: p.publico_alvo,
      no_calendario: noCalendario, fora_do_plano: foraDoPlano, vinculo,
      saude: { farol: saudeCompleta.farol },
    });
  }

  res.json({
    ...p,
    pode_gerir: true,
    lider_nome: liderNome,
    local_nome: localNome,
    no_calendario: noCalendario,
    fora_do_plano: foraDoPlano,
    valores_execucao: PA.valoresMaterializacao(p),
    saude: saudeCompleta,
    vinculo,
    rotina_config: rotinaConfig,
  });
});




router.post('/propostas/:id/materializar', authorizeModule(EXEC_MOD, 1), async (req, res) => {
  const tipo = req.body?.tipo;
  if (!['projeto', 'evento'].includes(tipo)) {
    return res.status(400).json({ error: 'Tipo inválido (informe "projeto" ou "evento")' });
  }
  const p = await carregarProposta(req.params.id);
  if (!p) return res.status(404).json({ error: 'Proposta não encontrada' });
  if (!(await gestorDaExecucao(req)).pode(p)) return res.status(403).json({ error: MSG_SEM_GESTAO });
  if (p.natureza !== tipo) {
    return res.status(422).json({ error: `Esta proposta é de natureza "${p.natureza}" — não pode virar ${tipo}` });
  }
  const decs = await decisoesPorProposta([p.id]);
  if (!PA.noCalendario(p, decs[p.id] || [])) {
    return res.status(409).json({ error: 'A proposta ainda não entrou no calendário (só propostas aprovadas, com ou sem ressalvas, podem virar projeto ou evento)' });
  }






  const [{ data: projsDaProposta }, { data: evExistente }] = await Promise.all([
    supabase.from('projects').select('id, deleted_at, notes').eq('proposta_id', p.id),
    supabase.from('events').select('id').eq('proposta_id', p.id).maybeSingle(),
  ]);
  const projAtivo = (projsDaProposta || []).find((r) => !r.deleted_at);
  if (projAtivo || evExistente) {
    return res.status(409).json({ error: 'Esta proposta já tem um Projeto/Evento vinculado' });
  }
  for (const apagado of (projsDaProposta || []).filter((r) => r.deleted_at)) {
    await supabase.from('projects').update({
      proposta_id: null,
      notes: `${apagado.notes ? `${apagado.notes}\n` : ''}[Execução do Planejamento] Desvinculado da proposta "${p.nome}" em ${hojeSaoPaulo()} (projeto excluído; proposta recriada).`,
    }).eq('id', apagado.id);
  }

  let liderNome = '';
  if (p.lider_id) {
    const { data } = await supabase.from('profiles').select('name').eq('id', p.lider_id).maybeSingle();
    liderNome = data?.name || '';
  }



  const v = PA.valoresMaterializacao(p);
  const anoInicio = parseInt(String(v.dataInicio || '').slice(0, 4), 10) || new Date().getFullYear();
  const vigente = PA.decisaoVigente(decs[p.id] || []);
  const ressalvaTexto = vigente?.decisao === 'aprovada_ressalvas' ? (vigente.ressalva_texto || '').trim() : '';


  const notas = [
    `Criado a partir da proposta "${p.nome}" do Planejamento Anual.`,
    v.precisaoMes ? `Data de início com precisão de mês (${String(v.dataInicio).slice(0, 7)}) — o dia ainda não foi definido.` : null,
    p.recorrencia && p.recorrencia !== 'unica' ? `Recorrência da proposta: ${p.recorrencia}.` : null,
    ressalvaTexto ? `Aprovada com ressalva: ${ressalvaTexto}` : null,
  ].filter(Boolean).join('\n');

  const unicoViolado = (err) => err?.code === '23505';

  if (tipo === 'projeto') {
    const insert = {
      name: p.nome, year: anoInicio, description: p.descricao || '', status: 'no-prazo',
      responsible: liderNome, responsible_id: p.lider_id,
      leader: liderNome, leader_id: p.lider_id,
      area: p.area || '',
      date_start: v.dataInicio, date_end: v.dataFim,
      budget_planned: v.custoAnual,
      budget_revenue: v.arrecadacaoAnual,
      budget_church_cost: v.custoIgreja,
      publico_alvo: p.publico_alvo || null,
      priority: 'media', notes: notas,
      criacao_origem: 'ciclo_planejamento',
      created_by: req.user.id, proposta_id: p.id,
    };
    const { data, error } = await supabase.from('projects').insert(insert).select().single();
    if (error) {
      if (unicoViolado(error)) return res.status(409).json({ error: 'Esta proposta já tem um Projeto/Evento vinculado' });
      console.error('[planejamento-execucao] erro ao criar projeto:', error.message);
      return res.status(500).json({ error: 'Não foi possível criar o projeto vinculado' });
    }













    try {
      const { error: eFases } = await supabase.from('project_phases').insert(
        FASES_PADRAO_PROJETO.map((name, i) => ({
          project_id: data.id, name, phase_order: i + 1, status: 'pendente',
        }))
      );
      if (eFases) throw new Error(eFases.message);
    } catch (e) {
      console.error('[planejamento-execucao] erro ao criar fases padrão:', e.message);
    }

    if (ressalvaTexto) {
      const { error: eRisco } = await supabase.from('project_risks').insert({
        project_id: data.id, title: 'Ressalva da aprovação', description: ressalvaTexto,
        probability: 3, impact: 3, score: 9, owner_name: liderNome || null, status: 'aberto',
      });
      if (eRisco) console.error('[planejamento-execucao] erro ao registrar a ressalva como risco:', eRisco.message);
    }
    enqueueSync('projeto', data.id, 'upsert').catch(() => {});
    return res.status(201).json({ tipo, id: data.id });
  }


  let localNome = '';
  if (p.local_id) {
    const { data } = await supabase.from('plan_locais').select('nome').eq('id', p.local_id).maybeSingle();
    localNome = data?.nome || '';
  }

  let categoryId = null;
  if (req.body?.category_id) {
    const { data: cat } = await supabase.from('event_categories').select('id').eq('id', req.body.category_id).maybeSingle();
    if (!cat) return res.status(400).json({ error: 'Categoria de evento inválida' });
    categoryId = cat.id;
  }
  const horario = p.hora_inicio ? `${String(p.hora_inicio).slice(0, 5)}${p.hora_fim ? `–${String(p.hora_fim).slice(0, 5)}` : ''}` : null;
  const notasEvento = [
    notas,
    v.dataFim ? `Termina em ${v.dataFim}.` : null,
    horario ? `Horário previsto: ${horario}.` : null,
  ].filter(Boolean).join('\n');
  const insertEvento = {
    name: p.nome, date: v.dataInicio, description: p.descricao || '',
    category_id: categoryId,
    location: localNome, responsible: liderNome,
    budget_planned: v.custoAnual,
    recurrence: PA.RECORRENCIA_EVENTO[v.recorrencia] || 'unico',
    notes: notasEvento, criacao_origem: 'ciclo_planejamento',
    created_by: req.user.id, proposta_id: p.id,
  };
  const { data, error } = await supabase.from('events').insert(insertEvento).select().single();
  if (error) {
    if (unicoViolado(error)) return res.status(409).json({ error: 'Esta proposta já tem um Projeto/Evento vinculado' });
    console.error('[planejamento-execucao] erro ao criar evento:', error.message);
    return res.status(500).json({ error: 'Não foi possível criar o evento vinculado' });
  }



  const ocorrencias = PA.datasOcorrencias(p);
  if (ocorrencias.length) {
    const { error: eOcc } = await supabase.from('event_occurrences')
      .insert(ocorrencias.map((date, i) => ({ event_id: data.id, date, sort_order: i })));
    if (eOcc) console.error('[planejamento-execucao] erro ao criar ocorrências:', eOcc.message);
  }
  if (ressalvaTexto) {
    const { error: eRisco } = await supabase.from('event_risks').insert({
      event_id: data.id, title: 'Ressalva da aprovação', description: ressalvaTexto, category: 'other',
      probability: 3, impact: 3, score: 9, owner_id: p.lider_id || null, owner_name: liderNome || null,
      status: 'aberto', created_by: req.user.id,
    });
    if (eRisco) console.error('[planejamento-execucao] erro ao registrar a ressalva como risco:', eRisco.message);
  }



  await semFalhar(supabase.from('audit_log').insert({
    table_name: 'events', record_id: data.id, event_id: data.id, action: 'create',
    description: `Evento criado a partir da proposta "${p.nome}" (Execução do Planejamento)`,
    changed_by: req.user.id, changed_by_name: req.user.name || null,
  }), '[planejamento-execucao]');
  notificar({
    modulo: 'eventos', tipo: 'evento_criado', titulo: `Novo evento: ${data.name}`,
    mensagem: `O evento "${data.name}" foi criado a partir do Planejamento Anual para ${data.date}${localNome ? ` em ${localNome}` : ''}.`,
    link: `/eventos/${data.id}`, severidade: 'info', chaveDedup: `evento_criado_${data.id}`,
  }).catch(() => {});
  enqueueSync('evento', data.id, 'upsert').catch(() => {});

  res.status(201).json({ tipo, id: data.id });
});











async function ehPmo(req) {
  const { data } = await supabase.from('plan_execucao_gestores').select('id')
    .eq('profile_id', req.user.id).eq('papel', 'pmo').eq('ativo', true).maybeSingle();
  return Boolean(data);
}



async function gestorDaExecucao(req) {
  const [pastor, pmo, areasRes] = await Promise.all([
    ehPastorOuSuper(req),
    ehPmo(req),
    supabase.from('plan_areas_diretoria').select('area').eq('lider_id', req.user.id),
  ]);
  const areasLider = new Set((areasRes.data || []).map((a) => a.area));
  return {
    pastor, pmo, areasLider,
    pode: (p) => PA.gestorPode({ pastor, pmo, areasLider, userId: req.user.id }, p),
  };
}

const MSG_SEM_GESTAO = 'Só o líder da proposta, o líder da área, o PMO ou o Pastor gerenciam a execução';



async function contextoGestao(req, res, { exigeVinculo = true } = {}) {
  const p = await carregarProposta(req.params.id);
  if (!p) { res.status(404).json({ error: 'Proposta não encontrada' }); return null; }
  if (!(await gestorDaExecucao(req)).pode(p)) { res.status(403).json({ error: MSG_SEM_GESTAO }); return null; }


  if (p.natureza === 'rotina') {
    if (!ESTADOS_NO_PLANO.includes(p.estado)) { res.status(409).json({ error: 'A rotina não está no plano (precisa estar aprovada)' }); return null; }
    return { p, vinculo: { tipo: 'rotina', id: p.id } };
  }
  const vinculo = (await vinculosAtivos([p.id]))[p.id] || { tipo: null, id: null };
  if (exigeVinculo && !vinculo.tipo) { res.status(409).json({ error: 'Esta proposta ainda não tem Projeto/Evento vinculado' }); return null; }
  return { p, vinculo };
}

const STATUS_TAREFA = ['pendente', 'em-andamento', 'concluida', 'bloqueada'];
const PRIORIDADE_TAREFA_PROJETO = ['urgente', 'alta', 'media', 'baixa'];
const PRIORIDADE_TAREFA_EVENTO = ['baixa', 'normal', 'alta'];
const AREAS_TAREFA_EVENTO = ['marketing', 'adm', 'compras', 'financeiro', 'manutencao', 'limpeza', 'cozinha', 'producao'];
const ehUuid = (v) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const dataOuNull = (v) => (v ? String(v).slice(0, 10) : null);




function payloadTarefa(tipo, b, { parcial = false } = {}) {
  const payload = {};
  const define = (campo, valor) => { if (!parcial || b[campo] !== undefined) payload[campo] = valor; };
  if (b.status !== undefined && !STATUS_TAREFA.includes(b.status)) return { erro: 'Status inválido' };
  if (tipo === 'projeto') {
    if (!parcial && !String(b.name || '').trim()) return { erro: 'Nome da tarefa é obrigatório' };
    if (b.priority !== undefined && !PRIORIDADE_TAREFA_PROJETO.includes(b.priority)) return { erro: 'Prioridade inválida' };
    if (b.name !== undefined || !parcial) define('name', String(b.name || '').trim());
    define('responsible', b.responsible || '');
    define('responsible_id', ehUuid(b.responsible_id) ? b.responsible_id : null);
    define('area', b.area || '');
    define('start_date', dataOuNull(b.start_date));
    define('deadline', dataOuNull(b.deadline));
    define('status', b.status || 'pendente');
    define('priority', b.priority || 'media');
    define('description', b.description || '');
    return { payload };
  }
  if (tipo === 'rotina') {
    if (!parcial && !String(b.titulo || '').trim()) return { erro: 'Título da tarefa é obrigatório' };
    if (b.prioridade !== undefined && !PRIORIDADE_TAREFA_PROJETO.includes(b.prioridade)) return { erro: 'Prioridade inválida' };
    if (b.titulo !== undefined || !parcial) define('titulo', String(b.titulo || '').trim());
    define('fase_id', ehUuid(b.fase_id) ? b.fase_id : null);
    define('prazo', dataOuNull(b.prazo));
    define('responsavel_nome', b.responsavel_nome || '');
    define('responsavel_id', ehUuid(b.responsavel_id) ? b.responsavel_id : null);
    define('status', b.status || 'pendente');
    define('prioridade', b.prioridade || 'media');
    define('descricao', b.descricao || '');
    return { payload };
  }
  if (!parcial && !String(b.titulo || '').trim()) return { erro: 'Título da tarefa é obrigatório' };
  if (b.area !== undefined && !AREAS_TAREFA_EVENTO.includes(b.area)) return { erro: 'Área inválida' };
  if (!parcial && !AREAS_TAREFA_EVENTO.includes(b.area)) return { erro: 'Área é obrigatória' };
  if (b.prioridade !== undefined && !PRIORIDADE_TAREFA_EVENTO.includes(b.prioridade)) return { erro: 'Prioridade inválida' };
  if (b.titulo !== undefined || !parcial) define('titulo', String(b.titulo || '').trim());
  define('area', b.area);
  define('prazo', dataOuNull(b.prazo));
  define('responsavel_nome', b.responsavel_nome || '');
  define('responsavel_id', ehUuid(b.responsavel_id) ? b.responsavel_id : null);
  define('status', b.status || 'pendente');
  define('prioridade', b.prioridade || 'normal');
  define('descricao', b.descricao || '');
  if (b.event_phase_id !== undefined) payload.event_phase_id = b.event_phase_id;
  return { payload };
}

const TABELA_TAREFA = {
  projeto: { tabela: 'project_tasks', chave: 'project_id' },
  evento: { tabela: 'cycle_phase_tasks', chave: 'event_id' },
  rotina: { tabela: 'plan_execucao_tarefas', chave: 'proposta_id' },
};


async function faseDaRotinaValida(propostaId, faseId) {
  if (faseId == null) return true;
  const { data } = await supabase.from('plan_execucao_fases').select('id')
    .eq('id', faseId).eq('proposta_id', propostaId).maybeSingle();
  return Boolean(data);
}



async function tarefaDoVinculo(vinculo, taskId) {
  if (!ehUuid(taskId)) return false;
  const { tabela, chave } = TABELA_TAREFA[vinculo.tipo];
  const { data } = await supabase.from(tabela).select('id').eq('id', taskId).eq(chave, vinculo.id).maybeSingle();
  return Boolean(data);
}






router.post('/execucao/propostas/:id/fases/iniciar', authorizeModule(EXEC_MOD, 1), async (req, res) => {
  const ctx = await contextoGestao(req, res);
  if (!ctx) return;
  const { vinculo } = ctx;
  if (vinculo.tipo === 'rotina') {
    const { count } = await supabase.from('plan_execucao_fases').select('id', { count: 'exact', head: true }).eq('proposta_id', vinculo.id);
    if (count > 0) return res.status(409).json({ error: 'Esta rotina já tem fases' });
    const { error } = await supabase.from('plan_execucao_fases').insert(
      PA.FASES_INICIAIS_ROTINA.map((nome, i) => ({ proposta_id: vinculo.id, nome, ordem: i + 1, created_by: req.user.id }))
    );
    if (error) {
      console.error('[planejamento-execucao] erro ao iniciar fases da rotina:', error.message);
      return res.status(500).json({ error: 'Não foi possível criar as fases' });
    }
    return res.json({ ok: true, tipo: 'rotina' });
  }
  if (vinculo.tipo === 'projeto') {
    const { count } = await supabase.from('project_phases').select('id', { count: 'exact', head: true }).eq('project_id', vinculo.id);
    if (count > 0) return res.status(409).json({ error: 'As fases deste projeto já foram iniciadas' });
    const { error } = await supabase.from('project_phases').insert(
      FASES_PADRAO_PROJETO.map((name, i) => ({ project_id: vinculo.id, name, phase_order: i + 1, status: 'pendente' }))
    );
    if (error) {
      console.error('[planejamento-execucao] erro ao iniciar fases:', error.message);
      return res.status(500).json({ error: 'Não foi possível iniciar as fases do projeto' });
    }
    return res.json({ ok: true, tipo: 'projeto' });
  }
  try {
    const { activateCycleForEvent } = require('./cycles');
    await activateCycleForEvent(vinculo.id, req.user.id);
    return res.json({ ok: true, tipo: 'evento' });
  } catch (e) {

    return res.status(422).json({ error: e.message || 'Não foi possível ativar o ciclo do evento' });
  }
});

router.post('/execucao/propostas/:id/tarefas', authorizeModule(EXEC_MOD, 1), async (req, res) => {
  const ctx = await contextoGestao(req, res);
  if (!ctx) return;
  const { vinculo } = ctx;
  const { erro, payload } = payloadTarefa(vinculo.tipo, req.body || {});
  if (erro) return res.status(422).json({ error: erro });
  const { tabela, chave } = TABELA_TAREFA[vinculo.tipo];
  if (vinculo.tipo === 'evento') {
    const { data: fase } = await supabase.from('event_cycle_phases').select('id')
      .eq('id', payload.event_phase_id).eq('event_id', vinculo.id).maybeSingle();
    if (!fase) return res.status(422).json({ error: 'Escolha uma fase do ciclo deste evento' });
  }
  if (vinculo.tipo === 'rotina' && !(await faseDaRotinaValida(vinculo.id, payload.fase_id))) {
    return res.status(422).json({ error: 'Fase não encontrada nesta rotina' });
  }
  const { data, error } = await supabase.from(tabela)
    .insert({ ...payload, [chave]: vinculo.id, created_by: req.user.id }).select().single();
  if (error) {
    console.error('[planejamento-execucao] erro ao criar tarefa:', error.message);
    return res.status(500).json({ error: 'Não foi possível criar a tarefa' });
  }
  res.status(201).json(data);
});

router.put('/execucao/propostas/:id/tarefas/:taskId', authorizeModule(EXEC_MOD, 1), async (req, res) => {
  const ctx = await contextoGestao(req, res);
  if (!ctx) return;
  const { vinculo } = ctx;
  if (!(await tarefaDoVinculo(vinculo, req.params.taskId))) return res.status(404).json({ error: 'Tarefa não encontrada nesta proposta' });
  const { erro, payload } = payloadTarefa(vinculo.tipo, req.body || {}, { parcial: true });
  if (erro) return res.status(422).json({ error: erro });
  if (vinculo.tipo === 'evento' && payload.event_phase_id !== undefined) {
    const { data: fase } = await supabase.from('event_cycle_phases').select('id')
      .eq('id', payload.event_phase_id).eq('event_id', vinculo.id).maybeSingle();
    if (!fase) return res.status(422).json({ error: 'Escolha uma fase do ciclo deste evento' });
  }
  if (vinculo.tipo === 'rotina' && payload.fase_id !== undefined && !(await faseDaRotinaValida(vinculo.id, payload.fase_id))) {
    return res.status(422).json({ error: 'Fase não encontrada nesta rotina' });
  }
  if (!Object.keys(payload).length) return res.status(400).json({ error: 'Nada a atualizar' });
  const { tabela } = TABELA_TAREFA[vinculo.tipo];
  const { data, error } = await supabase.from(tabela).update(payload).eq('id', req.params.taskId).select().single();
  if (error) return res.status(500).json({ error: 'Não foi possível salvar a tarefa' });
  res.json(data);
});

router.patch('/execucao/propostas/:id/tarefas/:taskId/status', authorizeModule(EXEC_MOD, 1), async (req, res) => {
  const ctx = await contextoGestao(req, res);
  if (!ctx) return;
  const { vinculo } = ctx;
  if (!STATUS_TAREFA.includes(req.body?.status)) return res.status(422).json({ error: 'Status inválido' });
  if (!(await tarefaDoVinculo(vinculo, req.params.taskId))) return res.status(404).json({ error: 'Tarefa não encontrada nesta proposta' });
  const { tabela } = TABELA_TAREFA[vinculo.tipo];
  const { data, error } = await supabase.from(tabela).update({ status: req.body.status }).eq('id', req.params.taskId).select().single();
  if (error) return res.status(500).json({ error: 'Não foi possível mover a tarefa' });
  res.json(data);
});

router.delete('/execucao/propostas/:id/tarefas/:taskId', authorizeModule(EXEC_MOD, 1), async (req, res) => {
  const ctx = await contextoGestao(req, res);
  if (!ctx) return;
  const { vinculo } = ctx;
  if (!(await tarefaDoVinculo(vinculo, req.params.taskId))) return res.status(404).json({ error: 'Tarefa não encontrada nesta proposta' });
  if (vinculo.tipo === 'rotina') {
    const { error } = await supabase.from('plan_execucao_tarefas').delete().eq('id', req.params.taskId);
    if (error) return res.status(500).json({ error: 'Não foi possível excluir a tarefa' });
  } else if (vinculo.tipo === 'projeto') {
    await supabase.from('project_task_subtasks').delete().eq('task_id', req.params.taskId);
    const { error } = await supabase.from('project_tasks').delete().eq('id', req.params.taskId);
    if (error) return res.status(500).json({ error: 'Não foi possível excluir a tarefa' });
  } else {
    await supabase.from('card_completions').delete().eq('task_id', req.params.taskId);
    await supabase.from('cycle_task_subtasks').delete().eq('task_id', req.params.taskId);
    const { error } = await supabase.from('cycle_phase_tasks').delete().eq('id', req.params.taskId);
    if (error) return res.status(500).json({ error: 'Não foi possível excluir a tarefa' });
  }
  res.json({ ok: true });
});




router.get('/execucao/propostas/:id/rotina', authorizeModule(EXEC_MOD, 1), async (req, res) => {
  const p = await carregarProposta(req.params.id);
  if (!p || p.natureza !== 'rotina') return res.status(404).json({ error: 'Rotina não encontrada' });
  const [{ data: fases, error: e1 }, { data: tarefas, error: e2 }, { data: operacional }] = await Promise.all([
    supabase.from('plan_execucao_fases').select('*').eq('proposta_id', p.id).order('ordem').order('created_at'),
    supabase.from('plan_execucao_tarefas').select('*').eq('proposta_id', p.id).order('created_at'),

    supabase.from('rotinas').select('id, nome, ativa').eq('proposta_id', p.id).is('deleted_at', null).maybeSingle(),
  ]);
  if (e1 || e2) return res.status(500).json({ error: 'Erro ao carregar as fases da rotina' });
  res.json({ fases: fases || [], tarefas: tarefas || [], operacional: operacional || null });
});




router.post('/execucao/propostas/:id/operacao', authorizeModule(EXEC_MOD, 1), async (req, res) => {
  const ctx = await contextoGestao(req, res);
  if (!ctx) return;
  if (ctx.vinculo.tipo !== 'rotina') return res.status(422).json({ error: 'Só proposta de rotina entra em operação' });
  const { data: tarefas } = await supabase.from('plan_execucao_tarefas').select('status').eq('proposta_id', ctx.p.id);
  const abertas = (tarefas || []).filter((t) => t.status !== 'concluida').length;
  if (!(tarefas || []).length) return res.status(409).json({ error: 'A implantação ainda não tem tarefas' });
  if (abertas) return res.status(409).json({ error: `Conclua a implantação antes (${abertas} tarefa(s) em aberto)` });
  const { data: existente } = await supabase.from('rotinas').select('id').eq('proposta_id', ctx.p.id).is('deleted_at', null).maybeSingle();
  if (existente) return res.status(409).json({ error: 'Esta rotina já está em operação', id: existente.id });
  const { data, error } = await supabase.from('rotinas').insert({
    nome: ctx.p.nome, descricao: ctx.p.descricao || '', area: ctx.p.area,
    origem: 'proposta', proposta_id: ctx.p.id, created_by: req.user.id,
  }).select('id').single();
  if (error) {
    console.error('[planejamento-execucao] erro ao colocar rotina em operação:', error.message);
    return res.status(500).json({ error: 'Não foi possível colocar a rotina em operação' });
  }
  res.status(201).json(data);
});

router.post('/execucao/propostas/:id/fases', authorizeModule(EXEC_MOD, 1), async (req, res) => {
  const ctx = await contextoGestao(req, res);
  if (!ctx) return;
  if (ctx.vinculo.tipo !== 'rotina') return res.status(422).json({ error: 'Fases livres só existem para rotina' });
  const nome = PA.nomeFaseRotina(req.body?.nome);
  if (!nome) return res.status(422).json({ error: 'Nome da fase é obrigatório (até 80 caracteres)' });
  const { data: ultima } = await supabase.from('plan_execucao_fases').select('ordem')
    .eq('proposta_id', ctx.p.id).order('ordem', { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await supabase.from('plan_execucao_fases')
    .insert({ proposta_id: ctx.p.id, nome, ordem: (ultima?.ordem || 0) + 1, created_by: req.user.id }).select().single();
  if (error) return res.status(500).json({ error: 'Não foi possível criar a fase' });
  res.status(201).json(data);
});

router.put('/execucao/propostas/:id/fases/:faseId', authorizeModule(EXEC_MOD, 1), async (req, res) => {
  const ctx = await contextoGestao(req, res);
  if (!ctx) return;
  if (ctx.vinculo.tipo !== 'rotina' || !ehUuid(req.params.faseId) || !(await faseDaRotinaValida(ctx.p.id, req.params.faseId))) {
    return res.status(404).json({ error: 'Fase não encontrada nesta rotina' });
  }
  const nome = PA.nomeFaseRotina(req.body?.nome);
  if (!nome) return res.status(422).json({ error: 'Nome da fase é obrigatório (até 80 caracteres)' });
  const { data, error } = await supabase.from('plan_execucao_fases').update({ nome }).eq('id', req.params.faseId).select().single();
  if (error) return res.status(500).json({ error: 'Não foi possível renomear a fase' });
  res.json(data);
});


router.delete('/execucao/propostas/:id/fases/:faseId', authorizeModule(EXEC_MOD, 1), async (req, res) => {
  const ctx = await contextoGestao(req, res);
  if (!ctx) return;
  if (ctx.vinculo.tipo !== 'rotina' || !ehUuid(req.params.faseId) || !(await faseDaRotinaValida(ctx.p.id, req.params.faseId))) {
    return res.status(404).json({ error: 'Fase não encontrada nesta rotina' });
  }
  const { error } = await supabase.from('plan_execucao_fases').delete().eq('id', req.params.faseId);
  if (error) return res.status(500).json({ error: 'Não foi possível excluir a fase' });
  res.json({ ok: true });
});

module.exports = router;
