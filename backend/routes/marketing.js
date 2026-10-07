




















const router = require('express').Router();
const multer = require('multer');
const { authenticate, authorizeModule } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { notificar } = require('../services/notificar');
const spMarketing = require('../services/sharepointMarketing');
const arrecadacaoCampanhas = require('../services/campanhaArrecadacao');
const campanhaMarketing = require('../utils/campanhaMarketing');
const regraSubtarefa = require('../utils/marketingChecklist');
const {
  CAMPANHA_INICIO,
  agruparArrecadacaoMensal,
  combinarComReceitaTotal,
  calcularGenerosidade,
} = require('../services/marketingGenerosidade');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: spMarketing.MAX_BYTES },
});

router.use(authenticate);





const { levelOf, contextoSubtarefa, exigirLiderNaEscrita } = require('../services/marketingContexto');
const { propagarEsforcoDoPadrao } = require('../services/marketingPropagarEsforco');
const { avisarEntregue, avisarSeChecklistConcluiu, avisarPrazoAjustado, carimbarEntrega } = require('../services/marketingAvisos');
const { concluirSolicitacaoMarketing } = require('../services/marketingConclusao');
const { semanaIso: semanaIsoPainel } = require('../utils/marketingPainel');




router.use('/admin', exigirLiderNaEscrita);

function isAdminLike(req) {
  if (['admin', 'diretor'].includes(req.user.role)) return true;
  return levelOf(req) >= 5;
}

async function meuMembroId(req) {


  const { data } = await supabase
    .from('marketing_membros')
    .select('id')
    .eq('profile_id', req.user.userId)
    .eq('ativo', true)
    .is('deleted_at', null);
  return (data || []).map(m => m.id);
}


function diasUteisInclusive(inicioStr, fimStr) {
  if (!inicioStr || !fimStr) return null;
  let d = new Date(String(inicioStr).slice(0, 10) + 'T00:00:00');
  const fim = new Date(String(fimStr).slice(0, 10) + 'T00:00:00');
  if (isNaN(d) || isNaN(fim) || fim < d) return null;
  let n = 0;
  while (d <= fim) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) n++;
    d = new Date(d.getTime() + 86400000);
  }
  return Math.max(1, n);
}

async function enrichCards(cards) {
  if (!cards?.length) return cards || [];


  const tipoIds     = [...new Set(cards.map(c => c.etiqueta_tipo_id).filter(Boolean))];
  const destinoIds  = [...new Set(cards.map(c => c.etiqueta_destino_id).filter(Boolean))];
  const membroIds   = [...new Set(cards.map(c => c.atribuido_a).filter(Boolean))];
  const solicIds    = [...new Set(cards.map(c => c.solicitacao_id).filter(Boolean))];
  const cycleTaskIds= [...new Set(cards.map(c => c.cycle_phase_task_id).filter(Boolean))];

  const faseIds     = [...new Set(cards.filter(c => !c.cycle_phase_task_id && c.event_phase_id).map(c => c.event_phase_id))];
  const { data: fasesDiretas } = faseIds.length
    ? await supabase.from('event_cycle_phases')
        .select('id, event_id, nome_fase, numero_fase, data_inicio_prevista, data_fim_prevista, events:event_id(id, name)')
        .in('id', faseIds)
    : { data: [] };
  const faseMap = Object.fromEntries((fasesDiretas || []).map(f => [f.id, f]));

  const [tipos, destinos, membros, solics, cycleTasks] = await Promise.all([
    tipoIds.length    ? supabase.from('marketing_etiquetas_tipo').select('id, slug, nome, cor, habilidade_padrao, esforco_max_h').in('id', tipoIds) : Promise.resolve({ data: [] }),
    destinoIds.length ? supabase.from('marketing_etiquetas_destino').select('id, slug, nome, cor').in('id', destinoIds) : Promise.resolve({ data: [] }),
    membroIds.length  ? supabase.from('marketing_membros').select('id, profile_id, habilidade, nome_display').in('id', membroIds) : Promise.resolve({ data: [] }),
    solicIds.length   ? supabase.from('solicitacoes').select('id, titulo, solicitante_id, eh_urgente, urgencia_decisao').in('id', solicIds) : Promise.resolve({ data: [] }),



    cycleTaskIds.length ? supabase.from('cycle_phase_tasks')
      .select('id, event_id, event_phase_id, is_critical, prioridade, events:event_id(id, name), event_cycle_phases:event_phase_id(id, nome_fase, numero_fase, data_inicio_prevista, data_fim_prevista)')
      .in('id', cycleTaskIds) : Promise.resolve({ data: [] }),
  ]);

  const tipoMap     = Object.fromEntries((tipos.data    || []).map(t => [t.id, t]));
  const destinoMap  = Object.fromEntries((destinos.data || []).map(d => [d.id, d]));
  const membroMap   = Object.fromEntries((membros.data  || []).map(m => [m.id, m]));
  const solicMap    = Object.fromEntries((solics.data   || []).map(s => [s.id, s]));
  const cycleMap    = Object.fromEntries((cycleTasks.data || []).map(t => [t.id, t]));


  const profileIds = [
    ...Object.values(membroMap).map(m => m.profile_id),
    ...Object.values(solicMap).map(s => s.solicitante_id),
  ].filter(Boolean);
  let profileMap = {};
  if (profileIds.length) {
    const { data: profs } = await supabase.from('profiles').select('id, name, email').in('id', [...new Set(profileIds)]);
    profileMap = Object.fromEntries((profs || []).map(p => [p.id, p]));
  }


  const cardIds = cards.map(c => c.id);
  const campanhaIds = [...new Set(cards.map(c => c.campanha_id).filter(Boolean))];
  const checklistMap = {};
  let campanhaMap = {};
  if (cardIds.length) {
    const { data: cl } = await supabase.from('marketing_card_checklist').select('card_id, feito').in('card_id', cardIds);
    for (const it of (cl || [])) {
      if (!checklistMap[it.card_id]) checklistMap[it.card_id] = { total: 0, feitos: 0 };
      checklistMap[it.card_id].total++;
      if (it.feito) checklistMap[it.card_id].feitos++;
    }
  }
  if (campanhaIds.length) {
    const { data: camps } = await supabase.from('marketing_campanhas').select('id, prazo_entrega, titulo').in('id', campanhaIds);
    campanhaMap = Object.fromEntries((camps || []).map(k => [k.id, k]));
  }

  return cards.map(c => ({
    ...c,
    etiqueta_tipo: tipoMap[c.etiqueta_tipo_id] || null,
    etiqueta_destino: destinoMap[c.etiqueta_destino_id] || null,
    atribuido: c.atribuido_a ? (() => {
      const m = membroMap[c.atribuido_a];
      if (!m) return null;
      const prof = profileMap[m.profile_id] || null;

      return { ...m, profile: prof || (m.nome_display ? { id: null, name: m.nome_display, email: null } : null) };
    })() : null,
    solicitacao: c.solicitacao_id ? {
      ...solicMap[c.solicitacao_id],
      solicitante: profileMap[solicMap[c.solicitacao_id]?.solicitante_id] || null,
    } : null,
    cycle_phase_task: !c.cycle_phase_task_id && c.event_phase_id ? (() => {

      const f = faseMap[c.event_phase_id];
      if (!f) return null;
      return {
        id: null, event_id: f.event_id, event_name: f.events?.name || null,
        fase: `${f.numero_fase}. ${f.nome_fase}`, fase_id: f.id,
        numero_fase: f.numero_fase, nome_fase: f.nome_fase,
        fase_de: f.data_inicio_prevista || null, fase_ate: f.data_fim_prevista || null,
        is_critical: false, prioridade: c.prioridade || 'normal',
        link: f.event_id ? `/eventos/${f.event_id}` : null,
      };
    })() : c.cycle_phase_task_id ? (() => {
      const t = cycleMap[c.cycle_phase_task_id];
      if (!t) return null;
      const f = t.event_cycle_phases || null;
      return {
        id: t.id,
        event_id: t.event_id,
        event_name: t.events?.name || null,
        fase: f ? `${f.numero_fase}. ${f.nome_fase}` : null,
        fase_id: f?.id || null,
        numero_fase: f?.numero_fase ?? null,
        nome_fase: f?.nome_fase || null,
        fase_de: f?.data_inicio_prevista || null,
        fase_ate: f?.data_fim_prevista || null,
        is_critical: t.is_critical,
        prioridade: t.prioridade,
        link: t.event_id ? `/eventos/${t.event_id}` : null,
      };
    })() : null,
    checklist: checklistMap[c.id] || null,
    campanha: c.campanha_id ? (campanhaMap[c.campanha_id] || null) : null,
  }));
}



async function carregarGenerosidadeDoBalanco(inicio, fim) {
  const { data: planos, error: planosError } = await supabase
    .from('fin_plano_contas')
    .select('id, codigo')
    .or('codigo.eq.3.01,codigo.like.3.01.%');
  if (planosError) throw planosError;

  const planoIds = (planos || []).map((plano) => plano.id);
  if (!planoIds.length) return [];

  const linhas = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('fin_transacoes')
      .select('id, data_competencia, valor')
      .not('codigo_legado', 'is', null)
      .eq('tipo', 'receita')
      .neq('status', 'cancelado')
      .in('classe_movimento', ['ordinaria', 'extraordinaria'])
      .in('plano_contas_id', planoIds)
      .gte('data_competencia', inicio)
      .lt('data_competencia', fim)
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw error;
    linhas.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }

  const mensal = agruparArrecadacaoMensal(linhas);








  try {
    const { data: totais, error } = await supabase
      .from('vw_fin_decendio')
      .select('mes, receita, receita_extraordinaria')
      .gte('mes', inicio.slice(0, 7))
      .lt('mes', fim.slice(0, 7));
    if (error) throw error;
    return combinarComReceitaTotal(mensal, totais || []);
  } catch (e) {
    console.warn('[MARKETING] receita total indisponível:', e.message);
    return mensal;
  }
}

router.get('/generosidade', authorizeModule('marketing', 1), async (req, res) => {
  try {
    const anoAtual = new Date().getFullYear();
    const anoInicio = Number(CAMPANHA_INICIO.slice(0, 4));
    const ano = req.query.ano === undefined ? anoAtual : Number(req.query.ano);

    if (!Number.isInteger(ano) || ano < anoInicio || ano > anoAtual) {
      return res.status(400).json({
        error: `O ano deve estar entre ${anoInicio} e ${anoAtual}.`,
      });
    }

    const inicio = `${CAMPANHA_INICIO}-01`;
    const fim = `${ano + 1}-01-01`;

    const [mensalRows, uploadResult] = await Promise.all([
      carregarGenerosidadeDoBalanco(inicio, fim),
      supabase
        .from('fin_uploads')
        .select('concluido_em, data_inicio, data_fim')
        .eq('tipo', 'balanco')
        .eq('status', 'concluido')
        .order('concluido_em', { ascending: false })
        .limit(1),
    ]);
    if (uploadResult.error) throw uploadResult.error;

    const snapshot = calcularGenerosidade(mensalRows, ano);
    const ultimoBalanco = uploadResult.data?.[0] || null;

    res.set('Cache-Control', 'private, no-store');
    return res.json({
      ...snapshot,
      atualizado_em: ultimoBalanco?.concluido_em || null,
      periodo_ultimo_balanco: ultimoBalanco
        ? { inicio: ultimoBalanco.data_inicio, fim: ultimoBalanco.data_fim }
        : null,
      fonte: 'balanco_financeiro',
    });
  } catch (e) {
    console.error('[MARKETING] generosidade:', e.message);
    return res.status(500).json({
      error: 'Não foi possível carregar os dados de generosidade.',
    });
  }
});



























async function templatesDasCampanhas(ids) {
  const mapa = new Map();
  for (let i = 0; i < ids.length; i += 200) {
    const lote = ids.slice(i, i + 200);
    const { data, error } = await supabase
      .from('camp_campanhas')
      .select('id, template, meta_pessoas')
      .in('id', lote);
    if (error) {
      if (error.code === '42703' || /column .* does not exist/i.test(error.message || '')) return new Map();
      throw error;
    }
    for (const r of data || []) mapa.set(r.id, { template: r.template ?? null, meta_pessoas: r.meta_pessoas ?? null });
  }
  return mapa;
}

router.get('/resultado-campanhas', authorizeModule('marketing', 1), async (req, res) => {
  try {
    const lista = await arrecadacaoCampanhas.listar({ incluirEncerradas: true });
    const ids = [...new Set((lista || []).map(c => c.id ?? c.campanha_id).filter(Boolean))];
    let extras;
    let aviso = null;
    try {
      extras = await templatesDasCampanhas(ids);
    } catch (e) {
      console.error('[MARKETING] resultado-campanhas · template:', e.message);
      extras = null;
      aviso = 'Não deu para conferir o tipo de cada campanha agora: as campanhas medidas em pessoas podem aparecer sem o alvo.';
    }
    res.set('Cache-Control', 'private, no-store');
    return res.json({ campanhas: campanhaMarketing.listaDaAba(lista, extras), aviso });
  } catch (e) {
    console.error('[MARKETING] resultado-campanhas:', e.message);
    return res.status(500).json({ error: 'Não foi possível carregar as campanhas.', detalhe: e.message });
  }
});



router.get('/etiquetas', authorizeModule('marketing', 1), async (req, res) => {
  try {
    const [tipos, destinos] = await Promise.all([
      supabase.from('marketing_etiquetas_tipo').select('*').eq('ativo', true).order('ordem'),
      supabase.from('marketing_etiquetas_destino').select('*').eq('ativo', true).order('ordem'),
    ]);
    res.json({
      tipos: tipos.data || [],
      destinos: destinos.data || [],
    });
  } catch (e) {
    console.error('[MARKETING] etiquetas:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.get('/membros', authorizeModule('marketing', 1), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('marketing_membros')
      .select('*')
      .is('deleted_at', null)
      .eq('ativo', true);
    if (error) throw error;

    const profileIds = [...new Set((data || []).map(m => m.profile_id).filter(Boolean))];
    let profileMap = {};
    if (profileIds.length) {
      const { data: profs } = await supabase.from('profiles').select('id, name, email, avatar_url').in('id', profileIds);
      profileMap = Object.fromEntries((profs || []).map(p => [p.id, p]));
    }
    res.json((data || []).map(m => ({
      ...m,
      profile: profileMap[m.profile_id]
        || (m.nome_display ? { id: null, name: m.nome_display, email: null, avatar_url: null } : null),
    })));
  } catch (e) {
    console.error('[MARKETING] membros:', e.message);
    res.status(500).json({ error: e.message });
  }
});






router.get('/compromissos-recorrentes', authorizeModule('marketing', 1), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('marketing_compromissos_recorrentes')
      .select('*')
      .is('deleted_at', null)
      .eq('ativo', true)
      .order('dia_semana')
      .order('hora_inicio');
    if (error) throw error;


    const ids = (data || []).map(r => r.id);
    let partMap = {};
    if (ids.length) {
      const { data: parts } = await supabase
        .from('marketing_recorrentes_participantes')
        .select('compromisso_id, membro_id')
        .in('compromisso_id', ids);
      partMap = (parts || []).reduce((acc, p) => {
        if (!acc[p.compromisso_id]) acc[p.compromisso_id] = [];
        acc[p.compromisso_id].push(p.membro_id);
        return acc;
      }, {});
    }
    const enriched = (data || []).map(r => ({
      ...r,
      participantes_ids: partMap[r.id] || [],
    }));
    res.json(enriched);
  } catch (e) {
    console.error('[MARKETING] recorrentes:', e.message);
    res.status(500).json({ error: e.message });
  }
});



router.get('/cards', authorizeModule('marketing', 1), async (req, res) => {
  try {
    const { estado, origem, etiqueta_tipo, etiqueta_destino, atribuido_a, raia_rapida } = req.query;

    let q = supabase
      .from('marketing_kanban_cards')
      .select('*')
      .is('deleted_at', null)
      .order('raia_rapida', { ascending: false })
      .order('ordem_fila', { ascending: true });

    if (estado) q = q.eq('estado', estado);
    if (origem) q = q.eq('origem', origem);
    if (etiqueta_tipo) q = q.eq('etiqueta_tipo_id', etiqueta_tipo);
    if (etiqueta_destino) q = q.eq('etiqueta_destino_id', etiqueta_destino);
    if (atribuido_a) q = q.eq('atribuido_a', atribuido_a);
    if (raia_rapida === 'true') q = q.eq('raia_rapida', true);

    const { data, error } = await q;
    if (error) throw error;

    const ctx = await contextoSubtarefa(req);
    const visiveis = (data || []).filter(c => ctx.lider || c.visibilidade !== 'so_lider');
    const enriched = await enrichCards(visiveis);
    res.json(enriched);
  } catch (e) {
    console.error('[MARKETING] list cards:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.get('/cards/:id', authorizeModule('marketing', 1), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('marketing_kanban_cards')
      .select('*')
      .eq('id', req.params.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Card não encontrado' });

    const enriched = await enrichCards([data]);

    const { data: entregaveis } = await supabase
      .from('marketing_entregaveis')
      .select('*')
      .eq('card_id', data.id)
      .is('deleted_at', null)
      .order('enviado_em', { ascending: false });

    res.json({ ...enriched[0], entregaveis: entregaveis || [] });
  } catch (e) {
    console.error('[MARKETING] get card:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/cards', authorizeModule('marketing', 5), async (req, res) => {
  try {
    const { titulo, descricao, etiqueta_tipo_id, etiqueta_destino_id, atribuido_a,
            prazo_confirmado, raia_rapida } = req.body || {};
    if (!titulo) return res.status(400).json({ error: 'Titulo obrigatorio' });

    const payload = {
      origem: 'interna',
      titulo,
      descricao: descricao || null,
      etiqueta_tipo_id: etiqueta_tipo_id || null,
      etiqueta_destino_id: etiqueta_destino_id || null,
      atribuido_a: atribuido_a || null,
      prazo_confirmado: prazo_confirmado || null,
      raia_rapida: !!raia_rapida,
      criado_por: req.user.userId,
    };

    const { data, error } = await supabase
      .from('marketing_kanban_cards')
      .insert(payload)
      .select('*')
      .single();
    if (error) throw error;


    if (data.atribuido_a) {
      const { data: membro } = await supabase
        .from('marketing_membros')
        .select('profile_id')
        .eq('id', data.atribuido_a)
        .maybeSingle();
      if (membro?.profile_id) {
        notificar({
          modulo: 'marketing',
          tipo: 'marketing_card_atribuido',
          titulo: `Nova task: ${data.titulo}`,
          mensagem: `A equipe de Marketing atribuiu uma task interna pra você.`,
          link: '/marketing',
          severidade: 'info',
          chaveDedup: `marketing_card_atribuido_${data.id}_${membro.profile_id}`,
          targetIds: [membro.profile_id],
        }).catch(err => console.error('[MARKETING] notify atribuido:', err.message));
      }
    }

    const enriched = await enrichCards([data]);
    res.status(201).json(enriched[0]);
  } catch (e) {
    console.error('[MARKETING] create card:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.patch('/cards/:id', authorizeModule('marketing', 3), async (req, res) => {
  try {
    const { data: atual } = await supabase
      .from('marketing_kanban_cards')
      .select('*')
      .eq('id', req.params.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (!atual) return res.status(404).json({ error: 'Card não encontrado' });



    const admin = isAdminLike(req);
    const meusMembroIds = await meuMembroId(req);
    const ehDoProdutor = atual.atribuido_a && meusMembroIds.includes(atual.atribuido_a);
    if (!admin && !ehDoProdutor) {
      return res.status(403).json({ error: 'Você so pode editar cards atribuídos a você' });
    }



    const update = {};
    if (admin) {
      const { titulo, descricao, etiqueta_tipo_id, etiqueta_destino_id,
              atribuido_a, prazo_preliminar, prazo_confirmado, prazo_producao, estado,
              raia_rapida, motivo_revisao, data_inicio, data_fim, pode_paralelo } = req.body || {};
      if (titulo !== undefined) update.titulo = titulo;
      if (descricao !== undefined) update.descricao = descricao;
      if (etiqueta_tipo_id !== undefined) update.etiqueta_tipo_id = etiqueta_tipo_id;
      if (etiqueta_destino_id !== undefined) update.etiqueta_destino_id = etiqueta_destino_id;
      if (atribuido_a !== undefined) update.atribuido_a = atribuido_a;
      if (prazo_preliminar !== undefined) update.prazo_preliminar = prazo_preliminar;
      if (prazo_confirmado !== undefined) update.prazo_confirmado = prazo_confirmado;




      if (prazo_producao !== undefined) update.prazo_producao = prazo_producao;
      if (estado !== undefined) update.estado = estado;
      if (raia_rapida !== undefined) update.raia_rapida = !!raia_rapida;
      if (motivo_revisao !== undefined) update.motivo_revisao = motivo_revisao;

      if (data_inicio !== undefined) update.data_inicio = data_inicio;
      if (data_fim !== undefined) update.data_fim = data_fim;
      if (pode_paralelo !== undefined) update.pode_paralelo = !!pode_paralelo;
      if (data_inicio !== undefined || data_fim !== undefined) {
        const dd = diasUteisInclusive(
          data_inicio !== undefined ? data_inicio : atual.data_inicio,
          data_fim !== undefined ? data_fim : atual.data_fim);
        if (dd) update.duracao_dias = dd;
      }
    } else {


      const { estado } = req.body || {};
      if (estado) update.estado = estado;
    }


    const pedeCamposLider = ['culto', 'prioridade', 'visibilidade'].some(k => (req.body || {})[k] !== undefined);
    if (pedeCamposLider) {
      const ctx = await contextoSubtarefa(req);
      if (!ctx.lider) return res.status(403).json({ error: 'Só o líder do Marketing muda culto, prioridade e visibilidade' });
      const { campos, erro } = regraSubtarefa.camposCardLider(req.body);
      if (erro) return res.status(400).json({ error: erro });
      Object.assign(update, campos);
    }

    if (!Object.keys(update).length) return res.status(400).json({ error: 'Nada para atualizar' });

    update.atualizado_por = req.user.userId;

    const { data, error } = await supabase
      .from('marketing_kanban_cards')
      .update(update)
      .eq('id', req.params.id)
      .select('*')
      .single();
    if (error) throw error;


    if (update.atribuido_a && update.atribuido_a !== atual.atribuido_a) {
      const { data: membro } = await supabase
        .from('marketing_membros')
        .select('profile_id')
        .eq('id', update.atribuido_a)
        .maybeSingle();
      if (membro?.profile_id) {
        notificar({
          modulo: 'marketing',
          tipo: 'marketing_card_atribuido',
          titulo: `Card atribuido: ${data.titulo}`,
          mensagem: 'Você foi atribuído a um card no Kanban Marketing.',
          link: '/marketing',
          severidade: 'info',
          chaveDedup: `marketing_card_atribuido_${data.id}_${membro.profile_id}`,
          targetIds: [membro.profile_id],
        }).catch(err => console.error('[MARKETING] notify atribuido:', err.message));
      }
    }







    let solDoCard = null;
    const precisaAvisarSolicitante =
      (update.estado === 'concluido' && atual.estado !== 'concluido')
      || (update.prazo_confirmado !== undefined && update.prazo_confirmado !== atual.prazo_confirmado)
      || (update.estado === 'aguardando_solicitante' && atual.estado !== 'aguardando_solicitante');
    if (precisaAvisarSolicitante) {
      try {
        const r = await solicitanteDoCard(data);
        if (r?.erro) console.error('[MARKETING] solicitante do card (não avisou):', r.motivo);
        else solDoCard = r;
      } catch (e) { console.error('[MARKETING] solicitante do card:', e.message); }
    }


    if (update.estado === 'concluido' && atual.estado !== 'concluido') {
      await carimbarEntrega(data.id);
      if (solDoCard) await avisarEntregue(data, solDoCard);
    }


    if (update.prazo_confirmado !== undefined
        && update.prazo_confirmado !== atual.prazo_confirmado
        && solDoCard) {
      const sol = { solicitante_id: solDoCard.solicitante_id, titulo: solDoCard.titulo_solicitacao };
      if (sol?.solicitante_id && data.prazo_confirmado) {
        const prazoStr = new Date(data.prazo_confirmado).toLocaleDateString('pt-BR');
        notificar({
          modulo: 'marketing',
          tipo: 'marketing_prazo_confirmado',
          titulo: `Prazo confirmado: ${sol.titulo}`,
          mensagem: `Marketing definiu prazo de entrega: ${prazoStr}.`,
          link: '/solicitacoes',
          severidade: 'info',
          chaveDedup: `marketing_prazo_confirmado_${data.id}_${data.prazo_confirmado}`,
          targetIds: [sol.solicitante_id],
        }).catch(err => console.error('[MARKETING] notify prazo:', err.message));
      }
    }


    if (update.estado === 'aguardando_solicitante' && atual.estado !== 'aguardando_solicitante'
        && solDoCard) {
      const sol = { solicitante_id: solDoCard.solicitante_id, titulo: solDoCard.titulo_solicitacao };
      if (sol?.solicitante_id) {
        notificar({
          modulo: 'marketing',
          tipo: 'marketing_card_preview',
          titulo: `Preview pronto: ${sol.titulo}`,
          mensagem: 'Equipe Marketing finalizou um preview. Aprove ou sugira revisão em /solicitacoes.',
          link: '/solicitacoes',
          severidade: 'info',
          chaveDedup: `marketing_card_preview_${data.id}_${atual.estado_atualizado_em || ''}`,
          targetIds: [sol.solicitante_id],
        }).catch(err => console.error('[MARKETING] notify preview:', err.message));
      }
    }

    const enriched = await enrichCards([data]);
    res.json(enriched[0]);
  } catch (e) {
    console.error('[MARKETING] patch card:', e.message);
    res.status(500).json({ error: e.message });
  }
});






router.patch('/cards/:id/aprovar-entrega', async (req, res) => {
  try {
    const { data: card } = await supabase
      .from('marketing_kanban_cards')
      .select('*, solicitacao:solicitacoes(id, solicitante_id, titulo)')
      .eq('id', req.params.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (!card) return res.status(404).json({ error: 'Card não encontrado' });


    const isSolicitante = card.solicitacao?.solicitante_id === req.user.userId;
    const isAdminMkt = isAdminLike(req);
    if (!isSolicitante && !isAdminMkt) {
      return res.status(403).json({ error: 'Apenas o solicitante (ou admin) pode aprovar a entrega.' });
    }
    if (!['aguardando_solicitante', 'em_producao'].includes(card.estado)) {
      return res.status(400).json({ error: 'Card não esta em estado aguardando_solicitante' });
    }

    const { data: novo, error } = await supabase
      .from('marketing_kanban_cards')
      .update({ estado: 'concluido' })
      .eq('id', req.params.id)
      .select('*')
      .single();
    if (error) throw error;


    if (card.atribuido_a) {
      const { data: membro } = await supabase
        .from('marketing_membros')
        .select('profile_id')
        .eq('id', card.atribuido_a)
        .maybeSingle();
      if (membro?.profile_id) {
        notificar({
          modulo: 'marketing',
          tipo: 'marketing_entrega_aprovada',
          titulo: `Entrega aprovada: ${card.titulo}`,
          mensagem: 'Solicitante aprovou · card concluído. Avalia pelo NPS agora.',
          link: '/marketing',
          severidade: 'info',
          chaveDedup: `marketing_entrega_aprovada_${card.id}`,
          targetIds: [membro.profile_id],
        }).catch(err => console.error('[MARKETING] notify entrega aprovada:', err.message));
      }
    }





    const solAprovada = await solicitanteDoCard(card).catch(() => null);
    if (solAprovada?.solicitacao_id) {
      await supabase
        .from('solicitacoes')
        .update({ status: 'concluido', concluido_em: new Date().toISOString() })
        .eq('id', solAprovada.solicitacao_id)
        .neq('status', 'concluido');
    }

    res.json(novo);
  } catch (e) {
    console.error('[MARKETING] aprovar-entrega:', e.message);
    res.status(500).json({ error: e.message });
  }
});




router.patch('/cards/:id/sugerir-revisao', async (req, res) => {
  try {
    const { motivo } = req.body || {};
    if (!motivo || motivo.trim().length < 5) {
      return res.status(400).json({ error: 'Motivo da revisão obrigatório (>= 5 chars)' });
    }

    const { data: atual } = await supabase
      .from('marketing_kanban_cards')
      .select('*')
      .eq('id', req.params.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (!atual) return res.status(404).json({ error: 'Card não encontrado' });
    if (atual.tem_revisao) {
      return res.status(400).json({ error: 'Card já teve revisão (1 máximo · D-14)' });
    }


    const admin = isAdminLike(req);
    let podeSugerir = admin;



    if (!podeSugerir) {
      podeSugerir = await ehSolicitanteDoCard(atual, req.user.userId);
    }
    if (!podeSugerir) {
      const meusMembroIds = await meuMembroId(req);
      if (meusMembroIds.includes(atual.atribuido_a)) podeSugerir = true;
    }
    if (!podeSugerir) return res.status(403).json({ error: 'Sem permissão para sugerir revisão' });

    const { data, error } = await supabase
      .from('marketing_kanban_cards')
      .update({
        tem_revisao: true,
        motivo_revisao: motivo.trim(),
        estado: 'em_producao',
      })
      .eq('id', req.params.id)
      .select('*')
      .single();
    if (error) throw error;


    if (data.atribuido_a) {
      const { data: membro } = await supabase
        .from('marketing_membros')
        .select('profile_id')
        .eq('id', data.atribuido_a)
        .maybeSingle();
      if (membro?.profile_id) {
        notificar({
          modulo: 'marketing',
          tipo: 'marketing_card_revisao',
          titulo: `Revisao pedida: ${data.titulo}`,
          mensagem: `Solicitante pediu revisão · "${motivo.trim()}". Card foi pro fim da fila.`,
          link: '/marketing',
          severidade: 'alta',
          chaveDedup: `marketing_card_revisao_${data.id}`,
          targetIds: [membro.profile_id],
        }).catch(err => console.error('[MARKETING] notify revisao:', err.message));
      }
    }

    const enriched = await enrichCards([data]);
    res.json(enriched[0]);
  } catch (e) {
    console.error('[MARKETING] sugerir-revisao:', e.message);
    res.status(500).json({ error: e.message });
  }
});


router.get('/ciclo-criativo', authorizeModule('marketing', 1), async (req, res) => {
  try {

    const { data: cards, error } = await supabase
      .from('marketing_kanban_cards')
      .select('*')
      .eq('origem', 'evento')
      .not('cycle_phase_task_id', 'is', null)
      .is('deleted_at', null);
    if (error) throw error;

    const enriched = await enrichCards(cards || []);


    const grupos = {};
    for (const c of enriched) {
      const ct = c.cycle_phase_task;
      if (!ct) continue;
      const key = `${ct.event_id}::${ct.fase || 'sem_fase'}`;
      if (!grupos[key]) {
        grupos[key] = {
          event_id: ct.event_id,
          event_name: ct.event_name,
          fase: ct.fase,
          tarefas: [],
        };
      }
      grupos[key].tarefas.push(c);
    }


    const lista = Object.values(grupos).sort((a, b) => {
      if (a.event_name !== b.event_name) return (a.event_name || '').localeCompare(b.event_name || '');
      return (a.fase || '').localeCompare(b.fase || '');
    });

    res.json(lista);
  } catch (e) {
    console.error('[MARKETING] ciclo-criativo:', e.message);
    res.status(500).json({ error: e.message });
  }
});


router.patch('/ciclo-criativo/batch', authorizeModule('marketing', 5), async (req, res) => {
  try {
    const { card_ids, etiqueta_tipo_id, atribuido_a } = req.body || {};
    if (!Array.isArray(card_ids) || card_ids.length === 0) {
      return res.status(400).json({ error: 'card_ids deve ser array com >=1 id' });
    }
    const update = {};
    if (etiqueta_tipo_id !== undefined) update.etiqueta_tipo_id = etiqueta_tipo_id || null;
    if (atribuido_a !== undefined) update.atribuido_a = atribuido_a || null;
    if (!Object.keys(update).length) return res.status(400).json({ error: 'envie etiqueta_tipo_id ou atribuido_a' });

    const { error, count } = await supabase
      .from('marketing_kanban_cards')
      .update(update)
      .in('id', card_ids)
      .is('deleted_at', null)
      .select('id', { count: 'exact', head: true });
    if (error) throw error;

    res.json({ ok: true, atualizados: count || card_ids.length });
  } catch (e) {
    console.error('[MARKETING] ciclo-criativo batch:', e.message);
    res.status(500).json({ error: e.message });
  }
});

















const {
  hojeBRT: hojeBRTMkt,
  montarSemanas,
  semanasDoMesGrade,
  mesVizinho,
  montarCalendario,
  diasSobrepostos,
} = require('../utils/marketingSemanas');
const { corDoEvento, ehExcedente, CORES_EVENTO } = require('../utils/marketingCores');

const { ehEntregaDeCiclo } = require('../utils/marketingEntregaArquivo');
const { contarArquivos: contarArquivosDaEntrega } = require('../services/marketingEntregaArquivo');
const { abertasPorCiclo } = require('../utils/marketingCicloAberto');



const { solicitanteDoCard, ehSolicitanteDoCard } = require('../services/marketingSolicitante');


const {
  OCUPACOES_DIAS, calcularDataFim, proximoDiaUtil, diasUteisNoIntervalo,
} = require('../utils/marketingOcupacao');



const SOLIC_ENTREGUE = new Set(['concluido', 'avaliado']);


const SOLIC_ABORTADA = new Set(['cancelado', 'rejeitado']);


const TAREFA_FEITA = new Set(['concluida', 'concluido']);





function prazoDoCard(c) {
  return c.prazo_producao || c.prazo_confirmado || c.data_fim || null;
}



function limitarInteiro(valor, padrao, min, max) {
  const n = Number.parseInt(valor, 10);
  if (!Number.isFinite(n)) return padrao;
  return Math.min(Math.max(n, min), max);
}




async function lerEmLotes(tabela, cols, coluna, valores) {
  const unicos = [...new Set((valores || []).filter(Boolean))];
  const out = [];
  for (let i = 0; i < unicos.length; i += 200) {
    const { data, error } = await supabase.from(tabela).select(cols).in(coluna, unicos.slice(i, i + 200));
    if (error) throw new Error(`${tabela}: ${error.message}`);
    out.push(...(data || []));
  }
  return out;
}




async function lerEmLotesPaginado(tabela, cols, coluna, valores, filtrar = (q) => q) {
  const unicos = [...new Set((valores || []).filter(Boolean))];
  const out = [];
  for (let i = 0; i < unicos.length; i += 200) {
    const lote = unicos.slice(i, i + 200);
    for (let de = 0; ; de += 1000) {
      const { data, error } = await filtrar(supabase.from(tabela).select(cols).in(coluna, lote))
        .order('id').range(de, de + 999);
      if (error) throw new Error(`${tabela}: ${error.message}`);
      out.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
  }
  return out;
}

router.get('/dashboard', authorizeModule('marketing', 1), async (req, res) => {
  const hoje = hojeBRTMkt();



  const mes = /^\d{4}-\d{2}$/.test(String(req.query.mes || ''))
    ? String(req.query.mes)
    : hoje.slice(0, 7);



  const semanas = semanasDoMesGrade(mes, { primeiroDiaSemana: 0, hoje });
  const coord = isAdminLike(req);




  const resposta = {
    hoje,
    mes,
    mes_anterior: mesVizinho(mes, -1),
    mes_seguinte: mesVizinho(mes, 1),
    semanas,
    avisos: [],
  };


  try {
    const meus = await meuMembroId(req);

    let alvo = meus;
    let membroAlvo = null;
    if (req.query.membro_id && coord) {
      alvo = [req.query.membro_id];
      membroAlvo = req.query.membro_id;
    }

    if (!alvo.length) {


      resposta.minhas_tarefas = { itens: [], total: 0, sem_prazo: 0, sou_membro: false, membro_id: null };
    } else {
      const { data, error } = await supabase
        .from('marketing_kanban_cards')
        .select('id, titulo, estado, origem, atribuido_a, prazo_producao, prazo_confirmado, data_fim, ordem_fila, raia_rapida, campanha_id, solicitacao_id')
        .in('atribuido_a', alvo)
        .neq('origem', 'evento')
        .not('estado', 'in', '("concluido")')
        .is('deleted_at', null);
      if (error) throw error;

      const comPrazo = [];
      const semPrazo = [];
      for (const c of data || []) {
        const item = {
          id: c.id, titulo: c.titulo, estado: c.estado, origem: c.origem,
          prazo: prazoDoCard(c), raia_rapida: !!c.raia_rapida, ordem_fila: c.ordem_fila,
          atrasado: false,
        };
        if (item.prazo) { item.atrasado = item.prazo < hoje; comPrazo.push(item); }
        else semPrazo.push(item);
      }


      comPrazo.sort((a, b) => (a.prazo < b.prazo ? -1 : a.prazo > b.prazo ? 1 : 0));
      semPrazo.sort((a, b) => (Number(b.raia_rapida) - Number(a.raia_rapida)) || ((a.ordem_fila ?? 1e9) - (b.ordem_fila ?? 1e9)));
      const todas = [...comPrazo, ...semPrazo];

      resposta.minhas_tarefas = {
        itens: todas.slice(0, 10),
        total: todas.length,
        sem_prazo: semPrazo.length,
        atrasadas: comPrazo.filter(i => i.atrasado).length,
        sou_membro: !membroAlvo,
        membro_id: membroAlvo,
      };
    }






    if (coord) {
      const { data: eq } = await supabase
        .from('marketing_membros')
        .select('id, profile_id, nome_display, habilidade')
        .eq('ativo', true)
        .is('deleted_at', null);
      const profIds = (eq || []).map(m => m.profile_id).filter(Boolean);
      let nomes = {};
      if (profIds.length) {
        const { data: profs } = await supabase.from('profiles').select('id, name').in('id', profIds);
        nomes = Object.fromEntries((profs || []).map(p => [p.id, p.name]));
      }
      resposta.equipe = (eq || [])
        .map(m => ({
          id: m.id,
          nome: nomes[m.profile_id] || m.nome_display || m.habilidade || '—',
          habilidade: m.habilidade,
        }))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    }
  } catch (e) {
    console.error('[MARKETING] dashboard/minhas-tarefas:', e.message);
    resposta.minhas_tarefas = { itens: [], total: 0, erro: 'Não foi possível carregar suas tarefas' };
    resposta.avisos.push('As suas tarefas não carregaram (o resto da tela está atualizado).');
  }


  try {



    const inicioSerie = (() => {
      const d = new Date(hoje + 'T00:00:00Z');
      d.setUTCMonth(d.getUTCMonth() - 5, 1);
      return d.toISOString().slice(0, 10);
    })();

    const { data: sols, error } = await supabase
      .from('solicitacoes')
      .select('id, titulo, status, eh_urgente, created_at, concluido_em, data_necessaria, sla_resolucao_deadline, solicitante_id, area_cliente')
      .eq('categoria', 'marketing')
      .is('deleted_at', null)
      .order('created_at', { ascending: true });
    if (error) throw error;

    const meses = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(hoje + 'T00:00:00Z');
      d.setUTCMonth(d.getUTCMonth() - i, 1);
      meses.push(d.toISOString().slice(0, 7));
    }
    const serie = Object.fromEntries(meses.map(m => [m, { mes: m, criadas: 0, resolvidas: 0 }]));
    for (const s of sols || []) {
      const mc = (s.created_at || '').slice(0, 7);
      if (serie[mc]) serie[mc].criadas++;
      if (SOLIC_ENTREGUE.has(s.status) && s.concluido_em) {
        const mf = s.concluido_em.slice(0, 7);
        if (serie[mf]) serie[mf].resolvidas++;
      }
    }

    const abertas = (sols || []).filter(s => !SOLIC_ENTREGUE.has(s.status) && !SOLIC_ABORTADA.has(s.status));







    const proximas = abertas.map(s => {
      const pedida = s.data_necessaria ? String(s.data_necessaria).slice(0, 10) : null;
      const sla = s.sla_resolucao_deadline ? String(s.sla_resolucao_deadline).slice(0, 10) : null;
      const prazo = pedida || sla;
      return {
        id: s.id, titulo: s.titulo, status: s.status, eh_urgente: !!s.eh_urgente,
        criada_em: (s.created_at || '').slice(0, 10),
        prazo, prazo_origem: pedida ? 'pedida' : (sla ? 'sla' : null),
        sla_vencido: !!(sla && sla < hoje),
        atrasada: !!(prazo && prazo < hoje),
        area_cliente: s.area_cliente || null,
      };
    }).sort((a, b) => {
      if (a.eh_urgente !== b.eh_urgente) return a.eh_urgente ? -1 : 1;
      if (!a.prazo) return 1;
      if (!b.prazo) return -1;
      return a.prazo < b.prazo ? -1 : a.prazo > b.prazo ? 1 : 0;
    });

    resposta.solicitacoes = {
      serie: meses.map(m => serie[m]),
      proximas: proximas.slice(0, 8),
      abertas: abertas.length,
      atrasadas: proximas.filter(p => p.atrasada).length,
      total_historico: (sols || []).length,
      resolvidas_historico: (sols || []).filter(s => SOLIC_ENTREGUE.has(s.status)).length,
      janela: { de: inicioSerie, ate: hoje, meses: 6 },
    };
  } catch (e) {
    console.error('[MARKETING] dashboard/solicitacoes:', e.message);
    resposta.solicitacoes = { serie: [], proximas: [], erro: 'Não foi possível carregar as solicitações' };
    resposta.avisos.push('O pulso das solicitações não carregou (o resto da tela está atualizado).');
  }


  try {
    const { data: ciclos, error: eCiclos } = await supabase
      .from('event_cycles')
      .select('event_id, data_dia_d, events(id, name, status, date, event_categories(name))')
      .eq('status', 'ativo');
    if (eCiclos) throw eCiclos;

    const ativos = (ciclos || []).filter(c => c.events && c.events.status !== 'concluido');
    const eventIds = ativos.map(c => c.event_id);

    if (!eventIds.length) {
      resposta.ciclo = { linhas: [], sem_data: 0, ciclos_ativos: 0 };
    } else {
      const fases = await lerEmLotes('event_cycle_phases',
        'id, event_id, template_id, numero_fase, nome_fase, area, status, data_inicio_prevista, data_fim_prevista',
        'event_id', eventIds);



      const tarefas = (await lerEmLotes('cycle_phase_tasks',
        'id, event_id, event_phase_id, area, status', 'event_id', eventIds))
        .filter(t => t.area === 'marketing');


      const cards = (await lerEmLotes('marketing_kanban_cards',
        'id, estado, atribuido_a, cycle_phase_task_id, deleted_at',
        'cycle_phase_task_id', tarefas.map(t => t.id)))
        .filter(c => !c.deleted_at);
      const cardDaTarefa = Object.fromEntries(cards.map(c => [c.cycle_phase_task_id, c]));





      const porFase = {};
      for (const t of tarefas) {
        const b = porFase[t.event_phase_id] || (porFase[t.event_phase_id] = { total: 0, pendentes: 0, sem_dono: 0 });
        b.total++;
        const c = cardDaTarefa[t.id];
        const feito = c ? c.estado === 'concluido' : TAREFA_FEITA.has(t.status);
        if (!feito) b.pendentes++;
        if (c && !c.atribuido_a) b.sem_dono++;
      }

      const fasesPorEvento = {};
      for (const f of fases) (fasesPorEvento[f.event_id] || (fasesPorEvento[f.event_id] = [])).push(f);



      const eventos = ativos
        .slice()
        .sort((a, b) => String(a.data_dia_d || a.events.date || '').localeCompare(String(b.data_dia_d || b.events.date || '')))
        .map((c, i) => ({
          id: c.event_id,
          nome: c.events.name,
          categoria: c.events.event_categories?.name || null,
          dia_d: c.data_dia_d || c.events.date || null,
          cor: corDoEvento(i),
          cor_excedente: ehExcedente(i),
        }));

      const { linhas, sem_data } = montarCalendario({ eventos, fasesPorEvento, semanas });


      for (const l of linhas) {
        for (const cel of l.celulas) {
          if (cel.vazio) continue;
          const b = porFase[cel.fase_id] || { total: 0, pendentes: 0, sem_dono: 0 };
          cel.mkt_total = b.total;
          cel.mkt_pendentes = b.pendentes;
          cel.mkt_sem_dono = b.sem_dono;
        }
      }







      let rolandoOk;
      if (linhas.length && semanas.some(s => s.eh_semana_atual)) {
        try {
          const ids = new Set(linhas.map(l => l.id));
          const cardsCiclo = await lerEmLotesPaginado('marketing_kanban_cards',
            'id, event_id, estado', 'event_id', [...ids], q => q.is('deleted_at', null));
          const espelhos = tarefas.filter(t => ids.has(t.event_id)).map(t => cardDaTarefa[t.id]).filter(Boolean);
          const itens = await lerEmLotesPaginado('marketing_card_checklist', 'id, card_id, feito', 'card_id',
            [...cardsCiclo, ...espelhos].filter(c => c.estado !== 'concluido').map(c => c.id));
          const itensPorCard = {};
          for (const i of itens) (itensPorCard[i.card_id] ||= []).push(i);
          const abertas = abertasPorCiclo({
            cards: cardsCiclo, tarefasLegado: tarefas, cardDaTarefa, itensPorCard,
            tarefaFeita: (s) => TAREFA_FEITA.has(s),
          });
          for (const l of linhas) l.mkt_abertas = abertas[l.id] || 0;
          rolandoOk = true;
        } catch (e) {
          console.error('[MARKETING] dashboard/ciclo-aberto:', e.message);
          rolandoOk = false;
        }
      }

      resposta.ciclo = {
        linhas,
        sem_data,
        ciclos_ativos: ativos.length,
        rolando_ok: rolandoOk,

        cores_disponiveis: CORES_EVENTO.length,
        eventos_sem_cor_propria: linhas.filter(l => l.cor_excedente).length,


        fora_da_janela: ativos.length - linhas.length,
      };
    }
  } catch (e) {
    console.error('[MARKETING] dashboard/ciclo:', e.message);
    resposta.ciclo = { linhas: [], sem_data: 0, erro: 'Não foi possível carregar o ciclo criativo' };
    resposta.avisos.push('O calendário do ciclo criativo não carregou (o resto da tela está atualizado).');
  }

  res.json(resposta);
});




















router.get('/kanban', authorizeModule('marketing', 1), async (req, res) => {
  try {
    const hoje = hojeBRTMkt();
    const semanas = limitarInteiro(req.query.janela_semanas, 2, 1, 12);
    const janelaSemanas = montarSemanas(hoje, { retro: 0, adiante: semanas - 1 });
    const janela = {
      de: janelaSemanas[0]?.ini || hoje,
      ate: janelaSemanas[janelaSemanas.length - 1]?.fim || hoje,
      semanas,
    };

    const { data, error } = await supabase
      .from('marketing_kanban_cards')
      .select('*')
      .is('deleted_at', null)
      .order('raia_rapida', { ascending: false })
      .order('ordem_fila', { ascending: true });
    if (error) throw error;


    const ctxKanban = await contextoSubtarefa(req);
    const cards = await enrichCards((data || []).filter(c => ctxKanban.lider || c.visibilidade !== 'so_lider'));

    let foraDaJanela = 0;
    let semDataDaFase = 0;
    for (const c of cards) {
      if (c.origem !== 'evento') { c.na_janela = true; continue; }
      const f = c.cycle_phase_task;
      if (!f || !f.fase_de || !f.fase_ate) {
        c.na_janela = null;
        semDataDaFase++;
        continue;
      }
      c.na_janela = diasSobrepostos(f.fase_de, f.fase_ate, janela.de, janela.ate) > 0;
      if (!c.na_janela) foraDaJanela++;
    }

    res.json({
      hoje,
      janela,
      semanas: janelaSemanas,
      cards,
      fora_da_janela: foraDaJanela,
      sem_data_da_fase: semDataDaFase,
      total: cards.length,
    });
  } catch (e) {
    console.error('[MARKETING] kanban:', e.message);
    res.status(500).json({ error: e.message });
  }
});




router.get('/dashboard/fase/:faseId', authorizeModule('marketing', 1), async (req, res) => {
  try {
    const { data: fase, error } = await supabase
      .from('event_cycle_phases')
      .select('id, event_id, template_id, numero_fase, nome_fase, area, status, momento_chave, data_inicio_prevista, data_fim_prevista, data_conclusao, observacoes, events(id, name)')
      .eq('id', req.params.faseId)
      .maybeSingle();
    if (error) throw error;
    if (!fase) return res.status(404).json({ error: 'Fase não encontrada' });




    let entregas_padrao = null;
    let descricao_fase = null;
    if (fase.template_id) {
      const { data: tpl } = await supabase
        .from('cycle_phase_templates')
        .select('entregas_padrao, descricao')
        .eq('id', fase.template_id)
        .maybeSingle();
      entregas_padrao = tpl?.entregas_padrao || null;
      descricao_fase = tpl?.descricao || null;
    }

    const { data: tarefas, error: eT } = await supabase
      .from('cycle_phase_tasks')
      .select('id, titulo, descricao, area, status, prazo, prioridade, is_critical, responsavel_nome, entrega, observacoes')
      .eq('event_phase_id', fase.id)
      .eq('area', 'marketing')
      .order('prazo', { ascending: true, nullsFirst: false });
    if (eT) throw eT;

    const cards = (await lerEmLotes('marketing_kanban_cards',
      'id, titulo, estado, atribuido_a, etiqueta_tipo_id, prazo_producao, prazo_confirmado, data_fim, cycle_phase_task_id, deleted_at',
      'cycle_phase_task_id', (tarefas || []).map(t => t.id)))
      .filter(c => !c.deleted_at);
    const enriquecidos = await enrichCards(cards);
    const cardDaTarefa = Object.fromEntries(enriquecidos.map(c => [c.cycle_phase_task_id, c]));

    const itens = (tarefas || []).map(t => {
      const c = cardDaTarefa[t.id];
      return {
        tarefa_id: t.id,
        titulo: t.titulo,
        descricao: t.descricao || null,
        entrega: t.entrega || null,
        prazo: t.prazo ? String(t.prazo).slice(0, 10) : null,
        prioridade: t.prioridade || null,
        is_critical: !!t.is_critical,
        responsavel_eventos: t.responsavel_nome || null,
        status_eventos: t.status,


        card: c ? {
          id: c.id, titulo: c.titulo, estado: c.estado,
          dono: c.atribuido?.profile?.name || c.atribuido?.nome_display || null,


          atribuido_a: c.atribuido_a || null,
          etiqueta: c.etiqueta_tipo?.nome || null,
          prazo: prazoDoCard(c),
        } : null,
        feito: c ? c.estado === 'concluido' : TAREFA_FEITA.has(t.status),
      };
    });

    const pendentes = itens.filter(i => !i.feito);

    res.json({
      fase: {
        id: fase.id, numero_fase: fase.numero_fase, nome_fase: fase.nome_fase,
        area: fase.area, status: fase.status, momento_chave: fase.momento_chave || null,
        de: fase.data_inicio_prevista, ate: fase.data_fim_prevista,
        concluida_em: fase.data_conclusao || null,
        observacoes: fase.observacoes || null,
      },
      evento: { id: fase.event_id, nome: fase.events?.name || null, link: `/eventos/${fase.event_id}` },
      entregas_padrao,
      descricao_fase,
      itens,
      total: itens.length,
      pendentes: pendentes.length,
      vazio: itens.length === 0,
      motivo_vazio: itens.length === 0
        ? (fase.area === 'marketing'
          ? 'Esta fase é do Marketing, mas não há nenhuma tarefa de marketing cadastrada nela.'
          : `Esta fase é de "${fase.area || 'outra área'}" — não há atividade do Marketing programada para essa etapa.`)
        : null,
    });
  } catch (e) {
    console.error('[MARKETING] dashboard/fase:', e.message);
    res.status(500).json({ error: e.message });
  }
});









router.get('/fila/posicao/:cardId', async (req, res) => {
  try {
    const { data: card } = await supabase
      .from('marketing_kanban_cards')
      .select('id, ordem_fila, estado, solicitacao_id, solicitacoes:solicitacao_id(solicitante_id)')
      .eq('id', req.params.cardId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!card) return res.status(404).json({ error: 'Card não encontrado' });

    const isOwner = card.solicitacoes?.solicitante_id === req.user.userId;
    const isMktMember = (req.user.granular?.modulePerms?.marketing?.leitura || 0) >= 1;
    if (!isOwner && !isMktMember && !['admin', 'diretor'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Sem permissão' });
    }

    if (!['fila', 'em_producao'].includes(card.estado)) {
      return res.json({ posicao: null, total: 0, estado: card.estado });
    }

    const { count: total } = await supabase
      .from('marketing_kanban_cards')
      .select('id', { count: 'exact', head: true })
      .in('estado', ['fila', 'em_producao'])
      .is('deleted_at', null);

    const { count: na_frente } = await supabase
      .from('marketing_kanban_cards')
      .select('id', { count: 'exact', head: true })
      .in('estado', ['fila', 'em_producao'])
      .is('deleted_at', null)
      .lt('ordem_fila', card.ordem_fila);

    res.json({
      posicao: (na_frente || 0) + 1,
      total: total || 0,
      estado: card.estado,
    });
  } catch (e) {
    console.error('[MARKETING] fila posicao:', e.message);
    res.status(500).json({ error: e.message });
  }
});



router.get('/cards/:id/entregaveis', authorizeModule('marketing', 1), async (req, res) => {
  try {




    const lvl = levelOf(req);
    const ehEquipe = lvl >= 3 || ['admin', 'diretor'].includes(req.user.role);
    if (!ehEquipe) {
      const { data: card } = await supabase
        .from('marketing_kanban_cards')
        .select('id')
        .eq('id', req.params.id)
        .is('deleted_at', null)
        .maybeSingle();
      if (!card) return res.status(404).json({ error: 'Card não encontrado' });
      if (!(await ehSolicitanteDoCard(req.params.id, req.user.userId))) {
        return res.status(403).json({ error: 'Sem permissão' });
      }
    }

    const entregaveis = await spMarketing.listarEntregaveis(req.params.id);


    res.json(ehEquipe ? entregaveis : (entregaveis || []).filter(e => e.tipo !== 'referencia'));
  } catch (e) {
    console.error('[MARKETING] entregaveis list:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/cards/:id/entregaveis',
  authorizeModule('marketing', 3),
  upload.single('arquivo'),
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'Arquivo (campo "arquivo") obrigatorio · multipart/form-data' });

      const tipo = req.body?.tipo === 'referencia' ? 'referencia' : 'entregavel';
      const result = await spMarketing.uploadEntregavel({
        cardId: req.params.id,
        userId: req.user.userId,
        file: req.file,
        tipo,
      });


      try {
        const { data: card } = await supabase
          .from('marketing_kanban_cards')
          .select('id, estado, solicitacao_id, campanha_id, titulo')
          .eq('id', req.params.id)
          .maybeSingle();

        const solUp = (tipo !== 'referencia' && card?.estado === 'concluido')
          ? await solicitanteDoCard(card)
          : null;
        if (solUp && !solUp.erro) {
          const sol = { solicitante_id: solUp.solicitante_id, titulo: solUp.titulo_solicitacao };
          if (sol?.solicitante_id) {
            notificar({
              modulo: 'marketing',
              tipo: 'marketing_entregavel_anexado',
              titulo: `Arquivo final: ${sol.titulo}`,
              mensagem: `${req.file.originalname} anexado ao seu pedido · disponível pra download.`,
              link: '/solicitacoes',
              severidade: 'info',
              chaveDedup: `marketing_entregavel_${result.id}`,
              targetIds: [sol.solicitante_id],
            }).catch(err => console.error('[MARKETING] notify entregavel:', err.message));
          }
        }
      } catch (notifyErr) {
        console.error('[MARKETING] notify entregavel block:', notifyErr.message);
      }

      res.status(201).json(result);
    } catch (e) {
      console.error('[MARKETING] entregaveis upload:', e.message);
      const status = /excede|invalido|nao encontrado/i.test(e.message || '') ? 400 : 500;
      res.status(status).json({ error: e.message });
    }
  }
);

router.get('/entregaveis/:id/download', authorizeModule('marketing', 1), async (req, res) => {
  try {




    const lvl = levelOf(req);
    if (lvl < 3 && !['admin', 'diretor'].includes(req.user.role)) {
      const { data: ent } = await supabase
        .from('marketing_entregaveis')
        .select('card_id, tipo')
        .eq('id', req.params.id)
        .is('deleted_at', null)
        .maybeSingle();
      if (!ent) return res.status(404).json({ error: 'Entregavel não encontrado' });

      if (ent.tipo === 'referencia') return res.status(403).json({ error: 'Sem permissão' });
      if (!(await ehSolicitanteDoCard(ent.card_id, req.user.userId))) {
        return res.status(403).json({ error: 'Sem permissão' });
      }
    }

    const info = await spMarketing.getDownloadUrl(req.params.id);

    res.redirect(302, info.url);
  } catch (e) {
    console.error('[MARKETING] entregavel download:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.delete('/entregaveis/:id', authorizeModule('marketing', 5), async (req, res) => {
  try {
    await spMarketing.removerEntregavel(req.params.id, req.user.userId);
    res.json({ ok: true });
  } catch (e) {
    console.error('[MARKETING] entregavel delete:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.delete('/cards/:id', authorizeModule('marketing', 5), async (req, res) => {
  try {
    const { data, error } = await supabase
      .rpc('app_soft_delete', {
        p_table_name: 'marketing_kanban_cards',
        p_row_id: req.params.id,
        p_deleted_by: req.user.userId,
      });
    if (error) throw error;
    if (data === false) return res.status(404).json({ error: 'Card não encontrado ou já excluido' });
    res.json({ ok: true });
  } catch (e) {
    console.error('[MARKETING] soft delete:', e.message);
    res.status(500).json({ error: e.message });
  }
});



router.patch('/cards/:id/decidir-urgencia', authorizeModule('marketing', 5), async (req, res) => {
  try {
    const { decisao, motivo_recusa } = req.body || {};
    if (!['aceita', 'recusada'].includes(decisao)) {
      return res.status(400).json({ error: 'decisão deve ser "aceita" ou "recusada"' });
    }
    if (decisao === 'recusada' && (!motivo_recusa || motivo_recusa.trim().length < 5)) {
      return res.status(400).json({ error: 'motivo_recusa obrigatório (>= 5 chars) quando recusar' });
    }

    const { data: atual } = await supabase
      .from('marketing_kanban_cards')
      .select('*, solicitacao:solicitacoes(id, solicitante_id, eh_urgente, urgencia_decisao, titulo)')
      .eq('id', req.params.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (!atual) return res.status(404).json({ error: 'Card não encontrado' });
    if (!atual.solicitacao_id) {
      return res.status(400).json({ error: 'Card sem solicitação linkada · urgência decidida no próprio card eh raia_rapida (use PATCH)' });
    }

    const solUpdate = {
      urgencia_decisao: decisao,
      urgencia_decidida_por: req.user.userId,
      urgencia_decidida_em: new Date().toISOString(),
    };
    if (decisao === 'recusada') solUpdate.urgencia_motivo_recusa = motivo_recusa.trim();

    await supabase
      .from('solicitacoes')
      .update(solUpdate)
      .eq('id', atual.solicitacao_id);


    const cardUpdate = { raia_rapida: decisao === 'aceita' };
    const { data: novoCard, error } = await supabase
      .from('marketing_kanban_cards')
      .update(cardUpdate)
      .eq('id', req.params.id)
      .select('*')
      .single();
    if (error) throw error;

    const sol = atual.solicitacao;
    if (sol?.solicitante_id) {
      notificar({
        modulo: 'marketing',
        tipo: 'marketing_urgencia_decisao',
        titulo: decisao === 'aceita' ? `Urgencia aceita: ${sol.titulo}` : `Urgencia recusada: ${sol.titulo}`,
        mensagem: decisao === 'aceita'
          ? 'Pedro aceitou a urgência · entrou na raia rapida.'
          : `Pedro recusou a urgência · ${motivo_recusa.trim()}. Segue o fluxo normal.`,
        link: '/solicitacoes',
        severidade: decisao === 'aceita' ? 'info' : 'alta',
        chaveDedup: `marketing_urgencia_${atual.solicitacao_id}_${decisao}`,
        targetIds: [sol.solicitante_id],
      }).catch(err => console.error('[MARKETING] notify urgencia:', err.message));
    }

    const enriched = await enrichCards([novoCard]);
    res.json(enriched[0]);
  } catch (e) {
    console.error('[MARKETING] decidir-urgencia:', e.message);
    res.status(500).json({ error: e.message });
  }
});





router.get('/analytics/kpis', authorizeModule('marketing', 1), async (req, res) => {
  try {




    const semanas = Math.min(52, parseInt(req.query.semanas) || 12);
    const desde = new Date();
    desde.setDate(desde.getDate() - semanas * 7);

    const { data, error } = await supabase
      .from('kpi_registros')
      .select('indicador_id, periodo_referencia, valor_realizado, observacoes, data_preenchimento')
      .in('indicador_id', ['MKT-PRAZO', 'MKT-LEAD', 'MKT-THROUGHPUT', 'MKT-DEM-CAP'])
      .gte('periodo_referencia', semanaIsoPainel(desde.toISOString().slice(0, 10)))
      .lte('periodo_referencia', semanaIsoPainel(new Date().toISOString().slice(0, 10)))
      .order('periodo_referencia', { ascending: true });
    if (error) throw error;




    const ultimo = new Map();
    for (const r of data || []) {
      const k = `${r.indicador_id}|${r.periodo_referencia}`;
      const atual = ultimo.get(k);
      if (!atual || String(r.data_preenchimento || '') > String(atual.data_preenchimento || '')) ultimo.set(k, r);
    }

    const norm = [...ultimo.values()].sort((a, b) => String(a.periodo_referencia).localeCompare(String(b.periodo_referencia))).map(r => ({
      kpi_id: r.indicador_id,
      periodo: r.periodo_referencia,
      valor: r.valor_realizado,
      observacao: r.observacoes || null,
    }));

    const byKpi = { 'MKT-PRAZO': [], 'MKT-LEAD': [], 'MKT-THROUGHPUT': [], 'MKT-DEM-CAP': [] };
    norm.forEach(r => {
      if (byKpi[r.kpi_id]) byKpi[r.kpi_id].push(r);
    });


    const snapshot = {};
    Object.entries(byKpi).forEach(([id, arr]) => {
      const last = arr[arr.length - 1];
      snapshot[id] = last ? { valor: last.valor, periodo: last.periodo, observacao: last.observacao } : null;
    });

    res.json({ snapshot, serie: byKpi });
  } catch (e) {
    console.error('[MARKETING] analytics kpis:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.get('/analytics/aprovacoes-origem', authorizeModule('marketing', 1), async (req, res) => {
  try {


    const dias = Math.min(365, parseInt(req.query.dias) || 90);
    const desde = new Date();
    desde.setDate(desde.getDate() - dias);

    const { data, error } = await supabase
      .from('solicitacoes')
      .select('aprovacao_origem_diretor_id, aprovacao_origem_em, aprovacao_origem_status, created_at')
      .eq('area_responsavel', 'marketing')
      .gte('created_at', desde.toISOString())
      .not('aprovacao_origem_diretor_id', 'is', null)
      .in('aprovacao_origem_status', ['aprovada', 'rejeitada']);
    if (error) throw error;

    const agg = new Map();
    (data || []).forEach(s => {
      if (!s.aprovacao_origem_em) return;
      const id = s.aprovacao_origem_diretor_id;
      const horas = (new Date(s.aprovacao_origem_em).getTime() - new Date(s.created_at).getTime()) / 3600000;
      if (!agg.has(id)) agg.set(id, { diretor_id: id, total: 0, soma_horas: 0, rejeitadas: 0 });
      const a = agg.get(id);
      a.total++;
      a.soma_horas += horas;
      if (s.aprovacao_origem_status === 'rejeitada') a.rejeitadas++;
    });

    const lista = [...agg.values()].map(a => ({
      diretor_id: a.diretor_id,
      total: a.total,
      tempo_medio_h: Math.round((a.soma_horas / a.total) * 10) / 10,
      rejeitadas: a.rejeitadas,
      gargalo: (a.soma_horas / a.total) > 24,
    })).sort((a, b) => b.tempo_medio_h - a.tempo_medio_h);


    if (lista.length > 0) {
      const ids = lista.map(x => x.diretor_id);
      const { data: profs } = await supabase.from('profiles').select('id, name').in('id', ids);
      const byId = Object.fromEntries((profs || []).map(p => [p.id, p]));
      lista.forEach(x => { x.diretor_nome = byId[x.diretor_id]?.name || 'Diretor'; });
    }
    res.json(lista);
  } catch (e) {
    console.error('[MARKETING] aprovacoes-origem:', e.message);
    res.status(500).json({ error: e.message });
  }
});







router.get('/admin/membros', authorizeModule('marketing', 5), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('marketing_membros')
      .select('*')
      .is('deleted_at', null)
      .order('habilidade');
    if (error) throw error;
    const profileIds = [...new Set((data || []).map(m => m.profile_id).filter(Boolean))];
    let profileMap = {};
    if (profileIds.length) {
      const { data: profs } = await supabase.from('profiles').select('id, name, email').in('id', profileIds);
      profileMap = Object.fromEntries((profs || []).map(p => [p.id, p]));
    }
    res.json((data || []).map(m => ({
      ...m,
      profile: profileMap[m.profile_id]
        || (m.nome_display ? { id: null, name: m.nome_display, email: null } : null),
    })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/admin/membros', authorizeModule('marketing', 5), async (req, res) => {
  try {
    const { profile_id, habilidade, horas_semanais, slots_dia, observacao, nome_display } = req.body || {};
    if (!habilidade) return res.status(400).json({ error: 'habilidade obrigatoria' });
    if (!profile_id && !nome_display) {
      return res.status(400).json({ error: 'profile_id OU nome_display obrigatório (use nome_display pra pessoas sem login)' });
    }
    const { data, error } = await supabase
      .from('marketing_membros')
      .insert({
        profile_id: profile_id || null,
        nome_display: nome_display || null,
        habilidade,
        horas_semanais: horas_semanais ?? 30,
        slots_dia: slots_dia ?? 3,
        observacao: observacao || null,
        ativo: true,
      })
      .select('*')
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    if (/duplicate key/i.test(e.message)) {
      return res.status(409).json({ error: 'Este profile já tem essa habilidade · use PATCH pra editar.' });
    }
    res.status(500).json({ error: e.message });
  }
});

router.patch('/admin/membros/:id', authorizeModule('marketing', 5), async (req, res) => {
  try {
    const update = {};
    const { habilidade, horas_semanais, slots_dia, observacao, ativo, nome_display } = req.body || {};
    if (habilidade !== undefined) update.habilidade = habilidade;
    if (horas_semanais !== undefined) update.horas_semanais = horas_semanais;
    if (slots_dia !== undefined) update.slots_dia = slots_dia;
    if (observacao !== undefined) update.observacao = observacao;
    if (nome_display !== undefined) update.nome_display = nome_display || null;
    if (ativo !== undefined) update.ativo = !!ativo;
    update.updated_at = new Date().toISOString();
    const { data, error } = await supabase
      .from('marketing_membros')
      .update(update)
      .eq('id', req.params.id)
      .select('*')
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/admin/membros/:id', authorizeModule('marketing', 5), async (req, res) => {
  try {
    const { error } = await supabase.rpc('app_soft_delete', {
      p_table_name: 'marketing_membros',
      p_row_id: req.params.id,
      p_deleted_by: req.user.userId,
    });
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});



router.get('/admin/etiquetas/tipo', authorizeModule('marketing', 5), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('marketing_etiquetas_tipo')
      .select('*')
      .order('ordem');
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/admin/etiquetas/tipo', authorizeModule('marketing', 5), async (req, res) => {
  try {
    const { slug, nome, habilidade_padrao, esforco_max_h, cor, ordem, grupo } = req.body || {};
    if (!slug || !nome) return res.status(400).json({ error: 'slug e nome obrigatórios' });
    const { data, error } = await supabase
      .from('marketing_etiquetas_tipo')
      .insert({ slug, nome, habilidade_padrao, esforco_max_h, cor, ordem: ordem ?? 100, grupo: grupo || null, ativo: true })
      .select('*').single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/admin/etiquetas/tipo/:id', authorizeModule('marketing', 5), async (req, res) => {
  try {
    const update = {};
    const { nome, habilidade_padrao, esforco_max_h, cor, ordem, ativo, grupo } = req.body || {};
    if (nome !== undefined) update.nome = nome;
    if (habilidade_padrao !== undefined) update.habilidade_padrao = habilidade_padrao;
    if (esforco_max_h !== undefined) update.esforco_max_h = esforco_max_h;
    if (cor !== undefined) update.cor = cor;
    if (ordem !== undefined) update.ordem = ordem;
    if (ativo !== undefined) update.ativo = !!ativo;
    if (grupo !== undefined) update.grupo = grupo || null;
    const { data, error } = await supabase
      .from('marketing_etiquetas_tipo')
      .update(update)
      .eq('id', req.params.id)
      .select('*').single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});



router.get('/admin/etiquetas/destino', authorizeModule('marketing', 5), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('marketing_etiquetas_destino')
      .select('*')
      .order('ordem');
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/admin/etiquetas/destino', authorizeModule('marketing', 5), async (req, res) => {
  try {
    const { slug, nome, cor, ordem } = req.body || {};
    if (!slug || !nome) return res.status(400).json({ error: 'slug e nome obrigatórios' });
    const { data, error } = await supabase
      .from('marketing_etiquetas_destino')
      .insert({ slug, nome, cor, ordem: ordem ?? 100, ativo: true })
      .select('*').single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/admin/etiquetas/destino/:id', authorizeModule('marketing', 5), async (req, res) => {
  try {
    const update = {};
    const { nome, cor, ordem, ativo } = req.body || {};
    if (nome !== undefined) update.nome = nome;
    if (cor !== undefined) update.cor = cor;
    if (ordem !== undefined) update.ordem = ordem;
    if (ativo !== undefined) update.ativo = !!ativo;
    const { data, error } = await supabase
      .from('marketing_etiquetas_destino')
      .update(update)
      .eq('id', req.params.id)
      .select('*').single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});



router.get('/admin/recorrentes', authorizeModule('marketing', 5), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('marketing_compromissos_recorrentes')
      .select('*')
      .is('deleted_at', null)
      .order('dia_semana').order('hora_inicio');
    if (error) throw error;

    const ids = (data || []).map(r => r.id);
    let partMap = {};
    if (ids.length) {
      const { data: parts } = await supabase
        .from('marketing_recorrentes_participantes')
        .select('compromisso_id, membro_id')
        .in('compromisso_id', ids);
      partMap = (parts || []).reduce((acc, p) => {
        if (!acc[p.compromisso_id]) acc[p.compromisso_id] = [];
        acc[p.compromisso_id].push(p.membro_id);
        return acc;
      }, {});
    }
    res.json((data || []).map(r => ({ ...r, participantes_ids: partMap[r.id] || [] })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});




const AREAS_ROTINA_VALIDAS = new Set(Object.keys(require('../utils/marketingLinha').AREAS_ROTINA));
const colunaAreaAusente = (e) => e && (e.code === '42703' || e.code === 'PGRST204');
const MSG_AREA_SEM_MIGRATION = 'A área da rotina ainda não pode ser gravada: falta aplicar a migration 20261001140000.';

const MSG_ARQUIVO_SEM_MIGRATION = 'O "exige arquivo" ainda não pode ser gravado: falta aplicar a migration 20261005150000.';
const ERRO_EXIGE_ARQUIVO = 'exige_arquivo tem de ser verdadeiro ou falso.';

const { validarFrequencia } = require('../utils/marketingRedesPlano');
const MSG_MENSAL_SEM_MIGRATION = 'A rotina mensal ainda não pode ser gravada: falta aplicar a migration 20261005180000.';

router.post('/admin/recorrentes', authorizeModule('marketing', 5), async (req, res) => {
  try {
    const { participantes_ids, dia_semana, hora_inicio, duracao_h, descricao, area, exige_arquivo } = req.body || {};
    if (!Array.isArray(participantes_ids) || participantes_ids.length === 0 ||
        dia_semana == null || !hora_inicio || !duracao_h || !descricao) {
      return res.status(400).json({ error: 'participantes_ids (array, >=1), dia_semana, hora_inicio, duracao_h, descricao obrigatorios' });
    }
    if (area != null && !AREAS_ROTINA_VALIDAS.has(area)) {
      return res.status(400).json({ error: `Área inválida: use ${[...AREAS_ROTINA_VALIDAS].join(' ou ')}.` });
    }
    if (exige_arquivo !== undefined && typeof exige_arquivo !== 'boolean') return res.status(400).json({ error: ERRO_EXIGE_ARQUIVO });
    const vf = validarFrequencia({ frequencia: req.body?.frequencia, semana_do_mes: req.body?.semana_do_mes });
    if (!vf.ok) return res.status(400).json({ error: vf.erro });

    if (vf.campos.frequencia === 'mensal') {
      const { error: eF } = await supabase.from('marketing_compromissos_recorrentes').select('frequencia').limit(1);
      if (eF && colunaAreaAusente(eF)) return res.status(409).json({ error: MSG_MENSAL_SEM_MIGRATION });
      if (eF) throw eF;
    }

    if (exige_arquivo === true) {
      const { error: eCol } = await supabase.from('marketing_compromissos_recorrentes').select('exige_arquivo').limit(1);
      if (eCol && colunaAreaAusente(eCol)) return res.status(409).json({ error: MSG_ARQUIVO_SEM_MIGRATION });
      if (eCol) throw eCol;
    }
    const base = {
      dia_semana, hora_inicio, duracao_h, descricao, ativo: true,
      ...(exige_arquivo === true ? { exige_arquivo: true } : {}),
      ...(vf.campos.frequencia === 'mensal' ? vf.campos : {}),
    };
    let { data, error } = await supabase
      .from('marketing_compromissos_recorrentes')
      .insert(area ? { ...base, area } : base)
      .select('*').single();



    if (error && area && colunaAreaAusente(error)) {
      if (area !== 'institucional') return res.status(409).json({ error: MSG_AREA_SEM_MIGRATION });
      ({ data, error } = await supabase.from('marketing_compromissos_recorrentes')
        .insert(base).select('*').single());
    }
    if (error) throw error;


    const rows = participantes_ids.map(membro_id => ({ compromisso_id: data.id, membro_id }));
    const { error: partErr } = await supabase
      .from('marketing_recorrentes_participantes')
      .insert(rows);
    if (partErr) {

      await supabase.from('marketing_compromissos_recorrentes')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', data.id);
      throw partErr;
    }

    res.status(201).json({ ...data, participantes_ids });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/admin/recorrentes/:id', authorizeModule('marketing', 5), async (req, res) => {
  try {
    const update = {};
    const { participantes_ids, dia_semana, hora_inicio, duracao_h, descricao, ativo, area, exige_arquivo } = req.body || {};
    if (exige_arquivo !== undefined) {
      if (typeof exige_arquivo !== 'boolean') return res.status(400).json({ error: ERRO_EXIGE_ARQUIVO });
      update.exige_arquivo = exige_arquivo;
    }
    const vf = validarFrequencia({ frequencia: req.body?.frequencia, semana_do_mes: req.body?.semana_do_mes });
    if (!vf.ok) return res.status(400).json({ error: vf.erro });
    Object.assign(update, vf.campos);
    if (dia_semana !== undefined) update.dia_semana = dia_semana;
    if (hora_inicio !== undefined) update.hora_inicio = hora_inicio;
    if (duracao_h !== undefined) update.duracao_h = duracao_h;
    if (descricao !== undefined) update.descricao = descricao;
    if (ativo !== undefined) update.ativo = !!ativo;
    if (area !== undefined) {
      if (!AREAS_ROTINA_VALIDAS.has(area)) {
        return res.status(400).json({ error: `Área inválida: use ${[...AREAS_ROTINA_VALIDAS].join(' ou ')}.` });
      }
      update.area = area;
    }

    if (Object.keys(update).length > 0) {
      const { error } = await supabase
        .from('marketing_compromissos_recorrentes')
        .update(update)
        .eq('id', req.params.id);
      if (error && 'frequencia' in update && colunaAreaAusente(error) && /frequencia|semana_do_mes/i.test(error.message || '')) {
        return res.status(409).json({ error: MSG_MENSAL_SEM_MIGRATION });
      }
      if (error && 'exige_arquivo' in update && colunaAreaAusente(error) && /exige_arquivo/i.test(error.message || '')) {
        return res.status(409).json({ error: MSG_ARQUIVO_SEM_MIGRATION });
      }
      if (error && update.area && colunaAreaAusente(error)) {
        return res.status(409).json({ error: MSG_AREA_SEM_MIGRATION });
      }
      if (error) throw error;
    }


    if (Array.isArray(participantes_ids)) {
      if (participantes_ids.length === 0) {
        return res.status(400).json({ error: 'participantes_ids nao pode ser array vazio · use DELETE no compromisso pra remover' });
      }
      const { error: delErr } = await supabase
        .from('marketing_recorrentes_participantes')
        .delete()
        .eq('compromisso_id', req.params.id);
      if (delErr) throw delErr;
      const rows = participantes_ids.map(membro_id => ({ compromisso_id: req.params.id, membro_id }));
      const { error: insErr } = await supabase
        .from('marketing_recorrentes_participantes')
        .insert(rows);
      if (insErr) throw insErr;
    }

    const { data: novo } = await supabase
      .from('marketing_compromissos_recorrentes')
      .select('*').eq('id', req.params.id).single();
    const { data: parts } = await supabase
      .from('marketing_recorrentes_participantes')
      .select('membro_id').eq('compromisso_id', req.params.id);
    res.json({ ...novo, participantes_ids: (parts || []).map(p => p.membro_id) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/admin/recorrentes/:id', authorizeModule('marketing', 5), async (req, res) => {
  try {
    const { error } = await supabase.rpc('app_soft_delete', {
      p_table_name: 'marketing_compromissos_recorrentes',
      p_row_id: req.params.id,
      p_deleted_by: req.user.userId,
    });
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});



router.get('/admin/overrides', authorizeModule('marketing', 5), async (req, res) => {
  try {
    const { desde, ate } = req.query;
    let q = supabase
      .from('marketing_capacidade_override')
      .select('*')
      .is('deleted_at', null)
      .order('semana_inicio', { ascending: false });
    if (desde) q = q.gte('semana_inicio', desde);
    if (ate)   q = q.lte('semana_inicio', ate);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/admin/overrides', authorizeModule('marketing', 5), async (req, res) => {
  try {
    const { membro_id, semana_inicio, horas_disponiveis, motivo } = req.body || {};
    if (!membro_id || !semana_inicio || horas_disponiveis == null) {
      return res.status(400).json({ error: 'membro_id, semana_inicio, horas_disponiveis obrigatorios' });
    }
    const { data, error } = await supabase
      .from('marketing_capacidade_override')
      .insert({ membro_id, semana_inicio, horas_disponiveis, motivo: motivo || null, created_by: req.user.userId })
      .select('*').single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    if (/duplicate key/i.test(e.message)) {
      return res.status(409).json({ error: 'Já existe override pra esse membro nessa semana · use PATCH' });
    }
    res.status(500).json({ error: e.message });
  }
});

router.patch('/admin/overrides/:id', authorizeModule('marketing', 5), async (req, res) => {
  try {
    const update = {};
    const { horas_disponiveis, motivo } = req.body || {};
    if (horas_disponiveis !== undefined) update.horas_disponiveis = horas_disponiveis;
    if (motivo !== undefined) update.motivo = motivo;
    const { data, error } = await supabase
      .from('marketing_capacidade_override')
      .update(update)
      .eq('id', req.params.id)
      .select('*').single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/admin/overrides/:id', authorizeModule('marketing', 5), async (req, res) => {
  try {
    const { error } = await supabase.rpc('app_soft_delete', {
      p_table_name: 'marketing_capacidade_override',
      p_row_id: req.params.id,
      p_deleted_by: req.user.userId,
    });
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


router.get('/cards/:id/checklist', authorizeModule('marketing', 1), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('marketing_card_checklist')
      .select('*')
      .eq('card_id', req.params.id)
      .order('ordem', { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/cards/:id/checklist', authorizeModule('marketing', 3), async (req, res) => {
  try {
    const { texto, grupo } = req.body || {};
    if (!texto || !texto.trim()) return res.status(400).json({ error: 'texto obrigatorio' });
    const { campos, erro } = regraSubtarefa.camposSubtarefa(req.body || {});
    if (erro) return res.status(400).json({ error: erro });
    delete campos.registro;
    const { data: card, error: eCard } = await supabase
      .from('marketing_kanban_cards').select('id, visibilidade')
      .eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (eCard) throw eCard;
    if (!card) return res.status(404).json({ error: 'Card não encontrado' });
    const ctx = await contextoSubtarefa(req);
    if (!regraSubtarefa.podeEditarItem({ lider: ctx.lider, nivel: ctx.nivel, card })) {
      return res.status(403).json({ error: 'Só o líder do Marketing altera esta tarefa' });
    }
    const { data, error } = await supabase
      .from('marketing_card_checklist')
      .insert({ card_id: req.params.id, texto: texto.trim(), grupo: (grupo && grupo.trim()) || null, ...campos })
      .select('*').single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});




router.patch('/checklist/:itemId', authorizeModule('marketing', 1), async (req, res) => {
  try {
    const body = req.body || {};
    const { data: item, error: eItem } = await supabase
      .from('marketing_card_checklist').select('*').eq('id', req.params.itemId).maybeSingle();
    if (eItem) throw eItem;
    if (!item) return res.status(404).json({ error: 'Item não encontrado' });
    const { data: card, error: eCard } = await supabase
      .from('marketing_kanban_cards').select('id, atribuido_a, visibilidade, estado, origem, event_phase_id')
      .eq('id', item.card_id).is('deleted_at', null).maybeSingle();
    if (eCard) throw eCard;
    if (!card) return res.status(404).json({ error: 'Card não encontrado' });
    const ctx = await contextoSubtarefa(req);

    const { campos, erro } = regraSubtarefa.camposSubtarefa(body);
    if (erro) return res.status(400).json({ error: erro });
    const { registro, ...estrutura } = campos;

    const mexeEstrutura = Object.keys(estrutura).length > 0
      || body.texto !== undefined || body.grupo !== undefined || body.ordem !== undefined;
    const marca = body.feito !== undefined || registro !== undefined;

    if (mexeEstrutura && !regraSubtarefa.podeEditarItem({ lider: ctx.lider, nivel: ctx.nivel, card })) {
      return res.status(403).json({ error: 'Só o líder do Marketing altera esta subtarefa' });
    }
    if (marca && !regraSubtarefa.podeMarcarItem({ ...ctx, item, card })) {
      return res.status(403).json({ error: card.visibilidade === 'equipe'
        ? 'Só quem faz esta subtarefa ou o responsável da tarefa pode marcar'
        : 'Nesta etapa quem marca é o líder do Marketing' });
    }

    const update = { ...estrutura };
    const { texto, feito, grupo, ordem } = body;
    if (texto !== undefined) update.texto = texto;
    if (feito !== undefined) update.feito = !!feito;
    if (grupo !== undefined) update.grupo = (grupo && grupo.trim()) || null;
    if (ordem !== undefined) update.ordem = ordem;
    if (registro !== undefined) update.registro = registro;

    const feitoFinal = update.feito !== undefined ? update.feito : item.feito;
    const exigeFinal = update.exige_registro !== undefined ? update.exige_registro : item.exige_registro;
    const registroFinal = update.registro !== undefined ? update.registro : item.registro;
    if (regraSubtarefa.faltaRegistro({ exigeRegistro: exigeFinal, feito: feitoFinal, registro: registroFinal })) {
      return res.status(400).json({ error: 'Escreva o registro antes de concluir este item', codigo: 'registro_obrigatorio' });
    }



    if (update.feito === true && !item.feito && ehEntregaDeCiclo(card)
        && (await contarArquivosDaEntrega({ itemId: item.id })) === 0) {
      return res.status(400).json({ error: 'Esta entrega precisa do arquivo: use "Enviar arquivo".', codigo: 'arquivo_obrigatorio' });
    }
    if (update.feito === true && !item.feito) update.concluido_por = req.user.userId;
    update.updated_at = new Date().toISOString();
    const { data, error } = await supabase
      .from('marketing_card_checklist')
      .update(update)
      .eq('id', req.params.itemId)
      .select('*').single();
    if (error) throw error;


    if (update.feito !== undefined) await avisarSeChecklistConcluiu(card.id, card.estado);
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/checklist/:itemId', authorizeModule('marketing', 3), async (req, res) => {
  try {

    const { data: item } = await supabase
      .from('marketing_card_checklist').select('card_id').eq('id', req.params.itemId).maybeSingle();
    const { data: cardAntes } = item
      ? await supabase.from('marketing_kanban_cards').select('estado').eq('id', item.card_id).maybeSingle()
      : { data: null };
    const { error } = await supabase
      .from('marketing_card_checklist')
      .delete()
      .eq('id', req.params.itemId);
    if (error) throw error;
    if (item) await avisarSeChecklistConcluiu(item.card_id, cardAntes?.estado);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});







const categoriaDoPadrao = (v) => (v && v !== 'global' ? v : null);

router.get('/admin/ciclo-padroes', authorizeModule('marketing', 5), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('marketing_ciclo_padroes')
      .select('*')
      .order('nome_fase');
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});


router.get('/admin/ciclo-padroes/categorias', authorizeModule('marketing', 5), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('event_categories')
      .select('id, name, active, sort_order')
      .eq('active', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});



router.get('/admin/ciclo-padroes/fases', authorizeModule('marketing', 5), async (req, res) => {
  try {
    const category_id = categoriaDoPadrao(req.query.category_id);
    let data = [];
    if (category_id) {
      const { data: proprias, error } = await supabase
        .from('cycle_phase_templates')
        .select('numero, nome, area')
        .eq('category_id', category_id)
        .order('numero', { ascending: true });
      if (error) throw error;
      data = proprias || [];
    }

    if (!data.length) {
      const { data: padrao, error: e2 } = await supabase
        .from('cycle_phase_templates').select('numero, nome, area')
        .is('category_id', null).order('numero', { ascending: true });
      if (e2) throw e2;
      data = padrao || [];
    }
    const seen = new Set();
    const fases = [];
    for (const t of data) {
      if (t.nome && !seen.has(t.nome)) { seen.add(t.nome); fases.push({ numero: t.numero, nome: t.nome, area: t.area }); }
    }
    res.json(fases);
  } catch (e) { res.status(500).json({ error: e.message }); }
});


router.post('/admin/ciclo-padroes/aplicar', authorizeModule('marketing', 5), async (req, res) => {
  try {
    const { category_id } = req.body || {};
    const { data, error } = await supabase.rpc('fn_marketing_aplicar_padroes_ciclo', {
      p_category_id: category_id || null,
    });
    if (error) throw error;
    res.json({ ok: true, atualizados: data ?? 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/admin/ciclo-padroes', authorizeModule('marketing', 5), async (req, res) => {
  try {
    const { nome_fase, etiqueta_tipo_id, atribuido_a } = req.body || {};
    const category_id = categoriaDoPadrao(req.body?.category_id);
    if (!nome_fase) return res.status(400).json({ error: 'nome_fase obrigatório' });
    if (!etiqueta_tipo_id && !atribuido_a) return res.status(400).json({ error: 'informe ao menos etiqueta ou dono' });
    const { campos: extra, erro } = regraSubtarefa.camposCardLider({
      culto: req.body?.culto === '' ? null : req.body?.culto,
      visibilidade: req.body?.visibilidade,
    });
    if (erro) return res.status(400).json({ error: erro });
    const { data, error } = await supabase
      .from('marketing_ciclo_padroes')
      .insert({
        category_id,
        nome_fase,
        etiqueta_tipo_id: etiqueta_tipo_id || null,
        atribuido_a: atribuido_a || null,
        ativo: true,
        ...extra,
      })
      .select('*').single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    if (/duplicate key/i.test(e.message)) {
      return res.status(409).json({ error: 'Já existe padrão pra essa categoria + fase + culto · edite o existente.' });
    }
    res.status(500).json({ error: e.message });
  }
});

router.patch('/admin/ciclo-padroes/:id', authorizeModule('marketing', 5), async (req, res) => {
  try {
    const update = {};
    const { nome_fase, etiqueta_tipo_id, atribuido_a, ativo } = req.body || {};
    const { campos: extra, erro } = regraSubtarefa.camposCardLider({
      culto: req.body?.culto === '' ? null : req.body?.culto,
      visibilidade: req.body?.visibilidade,
    });
    if (erro) return res.status(400).json({ error: erro });
    Object.assign(update, extra);
    if (nome_fase !== undefined) update.nome_fase = nome_fase;
    if (etiqueta_tipo_id !== undefined) update.etiqueta_tipo_id = etiqueta_tipo_id || null;
    if (atribuido_a !== undefined) update.atribuido_a = atribuido_a || null;
    if (ativo !== undefined) update.ativo = !!ativo;
    update.updated_at = new Date().toISOString();
    const { data, error } = await supabase
      .from('marketing_ciclo_padroes')
      .update(update)
      .eq('id', req.params.id)
      .select('*').single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/admin/ciclo-padroes/:id', authorizeModule('marketing', 5), async (req, res) => {
  try {
    const { error } = await supabase
      .from('marketing_ciclo_padroes')
      .delete()
      .eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});





router.get('/admin/ciclo-itens', authorizeModule('marketing', 5), async (req, res) => {
  try {
    let q = supabase.from('marketing_ciclo_itens_padrao').select('*')
      .order('nome_fase').order('ordem').order('created_at');
    if (req.query.category_id === 'global') q = q.is('category_id', null);
    else if (req.query.category_id) q = q.eq('category_id', req.query.category_id);
    const { data, error } = await q;
    if (error) {
      if (error.code === '42P01') return res.json([]);
      throw error;
    }
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

function camposItemPadrao(body = {}) {
  const { campos, erro } = regraSubtarefa.camposSubtarefa(body);
  if (erro) return { erro };
  delete campos.prazo; delete campos.registro;
  if (body.texto !== undefined) {
    if (typeof body.texto !== 'string' || !body.texto.trim()) return { erro: 'texto obrigatório' };
    campos.texto = body.texto.trim();
  }
  if (body.culto !== undefined) {
    const c = body.culto === '' ? null : body.culto;
    if (c !== null && !regraSubtarefa.CULTOS.includes(c)) return { erro: 'culto inválido' };
    campos.culto = c;
  }
  if (body.ordem !== undefined) {
    if (!Number.isInteger(body.ordem)) return { erro: 'ordem deve ser inteiro' };
    campos.ordem = body.ordem;
  }
  if (body.ativo !== undefined) campos.ativo = body.ativo === true;
  return { campos };
}

router.post('/admin/ciclo-itens', authorizeModule('marketing', 5), async (req, res) => {
  try {
    const { nome_fase } = req.body || {};
    const category_id = categoriaDoPadrao(req.body?.category_id);
    if (!nome_fase) return res.status(400).json({ error: 'nome_fase obrigatório' });
    const { campos, erro } = camposItemPadrao(req.body);
    if (erro) return res.status(400).json({ error: erro });
    if (!campos.texto) return res.status(400).json({ error: 'texto obrigatório' });
    const { data, error } = await supabase.from('marketing_ciclo_itens_padrao')
      .insert({ category_id, nome_fase, ...campos }).select('*').single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/admin/ciclo-itens/:id', authorizeModule('marketing', 5), async (req, res) => {
  try {
    const { campos, erro } = camposItemPadrao(req.body);
    if (erro) return res.status(400).json({ error: erro });
    if (!Object.keys(campos).length) return res.status(400).json({ error: 'Nada para atualizar' });


    const { data: antigo, error: eAntigo } = await supabase.from('marketing_ciclo_itens_padrao')
      .select('*').eq('id', req.params.id).maybeSingle();
    if (eAntigo) throw eAntigo;
    if (!antigo) return res.status(404).json({ error: 'Subtarefa padrão não encontrada' });
    campos.updated_at = new Date().toISOString();
    const { data, error } = await supabase.from('marketing_ciclo_itens_padrao')
      .update(campos).eq('id', req.params.id).select('*').maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Subtarefa padrão não encontrada' });


    let propagacao = { subtarefas: 0 };
    if ('esforco_valor' in campos || 'esforco_unidade' in campos) {
      try {
        propagacao = { subtarefas: (await propagarEsforcoDoPadrao(antigo, data)).atualizadas };
      } catch (e) {
        console.error('[MARKETING] propagar esforço:', e.message);
        propagacao = { subtarefas: 0, erro: 'A matriz foi salva, mas as tarefas abertas não receberam o esforço novo agora.' };
      }
    }
    res.json({ ...data, propagacao });
  } catch (e) { res.status(500).json({ error: e.message }); }
});



router.delete('/admin/ciclo-itens/:id', authorizeModule('marketing', 5), async (req, res) => {
  try {
    const { data, error } = await supabase.from('marketing_ciclo_itens_padrao')
      .update({ ativo: false, updated_at: new Date().toISOString() })
      .eq('id', req.params.id).select('id').maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Subtarefa padrão não encontrada' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});





router.get('/campanhas', authorizeModule('marketing', 1), async (req, res) => {
  try {
    const { status } = req.query;
    let q = supabase.from('marketing_campanhas').select('*').is('deleted_at', null);
    if (status) q = q.eq('status', status);
    const { data: camps, error } = await q.order('created_at', { ascending: false });
    if (error) throw error;
    const lista = camps || [];
    const solIds = [...new Set(lista.map(c => c.solicitante_id).filter(Boolean))];
    let profMap = {};
    if (solIds.length) {
      const { data: profs } = await supabase.from('profiles').select('id, name').in('id', solIds);
      profMap = Object.fromEntries((profs || []).map(p => [p.id, p.name]));
    }

    const reqIds = [...new Set(lista.map(c => c.solicitacao_id).filter(Boolean))];
    let solMap = {};
    if (reqIds.length) {
      const { data: sols } = await supabase.from('solicitacoes').select('id, data_necessaria, eh_urgente').in('id', reqIds);
      solMap = Object.fromEntries((sols || []).map(s => [s.id, s]));
    }
    const ids = lista.map(c => c.id);
    const countMap = {};
    if (ids.length) {
      const { data: cards } = await supabase
        .from('marketing_kanban_cards').select('campanha_id')
        .in('campanha_id', ids).is('deleted_at', null);
      for (const c of (cards || [])) countMap[c.campanha_id] = (countMap[c.campanha_id] || 0) + 1;
    }
    res.json(lista.map(c => ({
      ...c,
      solicitante_nome: profMap[c.solicitante_id] || null,
      total_cards: countMap[c.id] || 0,
      data_pedida: solMap[c.solicitacao_id]?.data_necessaria || null,
      eh_urgente: solMap[c.solicitacao_id]?.eh_urgente || false,
    })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/campanhas/:id', authorizeModule('marketing', 1), async (req, res) => {
  try {
    const { data: camp, error } = await supabase
      .from('marketing_campanhas').select('*').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (error) throw error;
    if (!camp) return res.status(404).json({ error: 'Campanha não encontrada' });

    let data_pedida = null, eh_urgente = false;
    if (camp.solicitacao_id) {
      const { data: sol } = await supabase.from('solicitacoes')
        .select('data_necessaria, eh_urgente').eq('id', camp.solicitacao_id).maybeSingle();
      data_pedida = sol?.data_necessaria || null;
      eh_urgente = sol?.eh_urgente || false;
    }
    const { data: cards } = await supabase
      .from('marketing_kanban_cards').select('*')
      .eq('campanha_id', camp.id).is('deleted_at', null).order('data_inicio', { ascending: true, nullsFirst: false });
    const enriched = await enrichCards(cards || []);

    const memIds = [...new Set(enriched.map(c => c.atribuido_a).filter(Boolean))];
    let memMap = {};
    if (memIds.length) {
      const { data: mems } = await supabase.from('marketing_membros').select('id, profile_id, nome_display').in('id', memIds);
      const pIds = [...new Set((mems || []).map(m => m.profile_id).filter(Boolean))];
      let pMap = {};
      if (pIds.length) {
        const { data: profs } = await supabase.from('profiles').select('id, name').in('id', pIds);
        pMap = Object.fromEntries((profs || []).map(p => [p.id, p.name]));
      }
      memMap = Object.fromEntries((mems || []).map(m => [m.id, pMap[m.profile_id] || m.nome_display || null]));
    }
    const cardsComDono = enriched.map(c => ({ ...c, dono_nome: memMap[c.atribuido_a] || null }));
    res.json({ ...camp, cards: cardsComDono, data_pedida, eh_urgente });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/campanhas/:id', authorizeModule('marketing', 5), async (req, res) => {
  try {
    const update = {};
    const { titulo, dor_descricao, publico_alvo, complexidade, prazo_entrega, status } = req.body || {};
    if (titulo !== undefined) update.titulo = titulo;
    if (dor_descricao !== undefined) update.dor_descricao = dor_descricao;
    if (publico_alvo !== undefined) update.publico_alvo = publico_alvo;
    if (complexidade !== undefined) update.complexidade = complexidade || null;
    if (prazo_entrega !== undefined) update.prazo_entrega = prazo_entrega || null;
    if (status !== undefined) update.status = status;
    update.updated_at = new Date().toISOString();
    const { data, error } = await supabase
      .from('marketing_campanhas').update(update).eq('id', req.params.id).select('*').single();
    if (error) throw error;

    if (prazo_entrega !== undefined) await avisarPrazoAjustado(data);
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/campanhas/:id', authorizeModule('marketing', 5), async (req, res) => {
  try {
    const { error } = await supabase
      .from('marketing_campanhas').update({ deleted_at: new Date().toISOString() }).eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});



router.post('/campanhas/:id/cards', authorizeModule('marketing', 5), async (req, res) => {
  try {
    const { titulo, descricao, etiqueta_tipo_id, atribuido_a, pode_paralelo, ocupa_dias } = req.body || {};
    let { data_inicio, data_fim } = req.body || {};
    if (!titulo || !titulo.trim()) return res.status(400).json({ error: 'título do entregavel obrigatório' });
    const { data: camp } = await supabase
      .from('marketing_campanhas').select('id, status').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!camp) return res.status(404).json({ error: 'Campanha não encontrada' });





    if (ocupa_dias != null && ocupa_dias !== '') {
      const n = Number(ocupa_dias);
      if (!Number.isFinite(n) || n <= 0) {
        return res.status(400).json({ error: 'ocupa_dias deve ser um número de dias úteis maior que zero' });
      }
      const ini = proximoDiaUtil(data_inicio) || data_inicio;
      const fim = calcularDataFim(ini, n);
      if (!fim) return res.status(400).json({ error: 'não foi possível calcular o fim (confira a data de início)' });
      data_inicio = ini;
      data_fim = fim;
    }

    const dur = diasUteisInclusive(data_inicio, data_fim);
    const { data, error } = await supabase
      .from('marketing_kanban_cards')
      .insert({
        origem: 'interna',
        campanha_id: req.params.id,
        titulo: titulo.trim(),
        descricao: descricao || null,
        etiqueta_tipo_id: etiqueta_tipo_id || null,
        atribuido_a: atribuido_a || null,
        data_inicio: data_inicio || null,
        data_fim: data_fim || null,
        duracao_dias: dur,
        pode_paralelo: pode_paralelo === undefined ? true : !!pode_paralelo,
        prazo_producao: data_fim ? new Date(data_fim + 'T18:00:00').toISOString() : null,
        estado: 'backlog',
        criado_por: req.user.userId,
      })
      .select('*').single();
    if (error) throw error;

    if (camp.status === 'triagem') {
      await supabase.from('marketing_campanhas')
        .update({ status: 'ativa', updated_at: new Date().toISOString() })
        .eq('id', req.params.id);
    }
    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});



router.post('/campanhas/:id/aprovar', async (req, res) => {
  try {
    const { data: camp } = await supabase
      .from('marketing_campanhas')
      .select('id, titulo, status, solicitante_id, solicitacao_id')
      .eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!camp) return res.status(404).json({ error: 'Campanha não encontrada' });
    if (camp.solicitante_id !== req.user.userId && !isAdminLike(req)) {
      return res.status(403).json({ error: 'Apenas o solicitante (ou coordenacao) pode aprovar a entrega.' });
    }
    if (camp.status === 'concluida') return res.status(400).json({ error: 'Campanha já concluída' });

    const { data: cards } = await supabase
      .from('marketing_kanban_cards')
      .select('id, estado, atribuido_a').eq('campanha_id', camp.id).is('deleted_at', null);
    const ativos = cards || [];
    if (!ativos.length) return res.status(400).json({ error: 'Campanha ainda não tem entregaveis' });
    const pendentes = ativos.filter(c => c.estado !== 'concluido').length;
    if (pendentes > 0) return res.status(400).json({ error: `Ainda ha ${pendentes} entregavel(is) não concluído(s)` });




    await concluirSolicitacaoMarketing({
      campanha: camp, cards: ativos,
      porCoordenacao: camp.solicitante_id !== req.user.userId,
    });
    res.json({ ok: true, status: 'concluida' });
  } catch (e) {
    console.error('[MARKETING] aprovar campanha:', e.message);
    res.status(500).json({ error: e.message });
  }
});




router.post('/campanhas/:id/revisar', async (req, res) => {
  try {
    const { motivo } = req.body || {};
    if (!motivo || motivo.trim().length < 5) {
      return res.status(400).json({ error: 'Motivo da revisão obrigatório (>= 5 chars)' });
    }
    const { data: camp } = await supabase
      .from('marketing_campanhas')
      .select('id, titulo, solicitante_id')
      .eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!camp) return res.status(404).json({ error: 'Campanha não encontrada' });
    if (camp.solicitante_id !== req.user.userId && !isAdminLike(req)) {
      return res.status(403).json({ error: 'Apenas o solicitante (ou coordenacao) pode pedir revisão.' });
    }
    const { data: cards } = await supabase
      .from('marketing_kanban_cards')
      .select('id, estado, tem_revisao, atribuido_a').eq('campanha_id', camp.id).is('deleted_at', null);
    const ativos = cards || [];
    if (ativos.some(c => c.tem_revisao)) {
      return res.status(400).json({ error: 'Esta demanda já teve uma revisão (1 máximo)' });
    }
    const concluidos = ativos.filter(c => c.estado === 'concluido');
    if (!concluidos.length) return res.status(400).json({ error: 'Nada concluído para revisar ainda' });

    for (const c of concluidos) {
      await supabase.from('marketing_kanban_cards')
        .update({ estado: 'revisao', tem_revisao: true, motivo_revisao: motivo.trim() }).eq('id', c.id);
    }
    const donoIds = [...new Set(concluidos.map(c => c.atribuido_a).filter(Boolean))];
    if (donoIds.length) {
      const { data: ms } = await supabase.from('marketing_membros').select('profile_id').in('id', donoIds);
      const pids = [...new Set((ms || []).map(m => m.profile_id).filter(Boolean))];
      if (pids.length) {
        notificar({
          modulo: 'marketing', tipo: 'marketing_campanha_revisao',
          titulo: `Revisao pedida: ${camp.titulo}`,
          mensagem: `O solicitante pediu ajustes: "${motivo.trim().slice(0, 140)}"`,
          link: '/marketing', severidade: 'info',
          chaveDedup: `marketing_campanha_revisao_${camp.id}`, targetIds: pids,
        }).catch(err => console.error('[MARKETING] notify campanha revisao:', err.message));
      }
    }
    res.json({ ok: true, reabertos: concluidos.length });
  } catch (e) {
    console.error('[MARKETING] revisar campanha:', e.message);
    res.status(500).json({ error: e.message });
  }
});









router.get('/capacidade-dia', authorizeModule('marketing', 1), async (req, res) => {
  try {
    const { membro_id, inicio, ocupa_dias } = req.query;
    let { fim } = req.query;
    if (membro_id && inicio && !fim && ocupa_dias) {
      fim = calcularDataFim(inicio, Number(ocupa_dias));
      if (!fim) return res.status(400).json({ error: 'ocupa_dias inválido' });
    }
    if (!membro_id || !inicio || !fim) return res.status(400).json({ error: 'membro_id, início e (fim OU ocupa_dias) obrigatórios' });
    const { data: membro } = await supabase
      .from('marketing_membros').select('id, slots_dia').eq('id', membro_id).maybeSingle();
    const slots_dia = membro?.slots_dia || 3;
    const { data: cards, error } = await supabase
      .from('marketing_kanban_cards')
      .select('id, titulo, data_inicio, data_fim, pode_paralelo')
      .eq('atribuido_a', membro_id)
      .is('deleted_at', null)
      .neq('estado', 'concluido')
      .not('data_inicio', 'is', null)
      .not('data_fim', 'is', null)
      .lte('data_inicio', fim)
      .gte('data_fim', inicio);
    if (error) throw error;
    const lo = new Date(inicio + 'T00:00:00'), hi = new Date(fim + 'T00:00:00');
    const dias = {};
    for (const c of (cards || [])) {
      let d = new Date(c.data_inicio + 'T00:00:00');
      const end = new Date(c.data_fim + 'T00:00:00');
      while (d <= end) {
        const dow = d.getDay();
        if (d >= lo && d <= hi && dow !== 0 && dow !== 6) {
          const k = d.toISOString().slice(0, 10);
          if (!dias[k]) dias[k] = { ocupados: 0, cards: [] };
          dias[k].ocupados += c.pode_paralelo ? 1 : slots_dia;
          dias[k].cards.push(c.titulo);
        }
        d = new Date(d.getTime() + 86400000);
      }
    }


    const diasCheios = Object.values(dias).filter(d => d.ocupados >= slots_dia).length;
    res.json({
      slots_dia, dias,
      data_inicio: proximoDiaUtil(inicio) || inicio,
      data_fim: fim,
      dias_uteis: diasUteisNoIntervalo(proximoDiaUtil(inicio) || inicio, fim),
      dias_cheios: diasCheios,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});




router.get('/planner', authorizeModule('marketing', 1), async (req, res) => {
  try {
    const { inicio, fim } = req.query;
    if (!inicio || !fim) return res.status(400).json({ error: 'início e fim obrigatórios' });
    const { data: membrosRaw } = await supabase
      .from('marketing_membros')
      .select('id, profile_id, habilidade, nome_display, slots_dia')
      .eq('ativo', true).neq('habilidade', 'coordenador').is('deleted_at', null);
    const profIds = [...new Set((membrosRaw || []).map(m => m.profile_id).filter(Boolean))];
    let profMap = {};
    if (profIds.length) {
      const { data: profs } = await supabase.from('profiles').select('id, name').in('id', profIds);
      profMap = Object.fromEntries((profs || []).map(p => [p.id, p.name]));
    }
    const membros = (membrosRaw || []).map(m => ({
      id: m.id, slots_dia: m.slots_dia || 3, habilidade: m.habilidade,
      nome: profMap[m.profile_id] || m.nome_display || '(sem nome)',
    }));





    const { data: cardsRaw, error } = await supabase
      .from('marketing_kanban_cards')
      .select('id, titulo, atribuido_a, data_inicio, data_fim, pode_paralelo, duracao_dias, estado, origem, campanha_id, etiqueta_tipo_id, cycle_phase_task_id')
      .is('deleted_at', null).neq('estado', 'concluido')
      .not('atribuido_a', 'is', null);
    if (error) throw error;






    const idsTarefaCiclo = [...new Set((cardsRaw || [])
      .filter(c => !c.data_inicio || !c.data_fim)
      .map(c => c.cycle_phase_task_id).filter(Boolean))];




    const faseDaTarefa = {};
    if (idsTarefaCiclo.length) {
      const tarefas = await lerEmLotes(
        'cycle_phase_tasks',
        'id, event_phase_id, event_cycle_phases:event_phase_id(id, numero_fase, nome_fase, data_inicio_prevista, data_fim_prevista)',
        'id', idsTarefaCiclo,
      );
      for (const t of tarefas || []) {
        const f = t.event_cycle_phases;
        if (f?.data_inicio_prevista && f?.data_fim_prevista) faseDaTarefa[t.id] = f;
      }
    }

    const dentroDaJanela = (de, ate) => !!de && !!ate && de <= fim && ate >= inicio;
    const tipoIds = [...new Set((cardsRaw || []).map(c => c.etiqueta_tipo_id).filter(Boolean))];
    let corMap = {};
    if (tipoIds.length) {
      const { data: tipos } = await supabase.from('marketing_etiquetas_tipo').select('id, cor').in('id', tipoIds);
      corMap = Object.fromEntries((tipos || []).map(t => [t.id, t.cor]));
    }
    const idsComRaia = new Set(membros.map(m => m.id));
    const cards = [];
    const semPlano = [];





    const semRaia = [];
    for (const c of cardsRaw || []) {
      let de = c.data_inicio;
      let ate = c.data_fim;
      let plano = 'proprio';


      if ((!de || !ate) && c.cycle_phase_task_id) {
        const f = faseDaTarefa[c.cycle_phase_task_id];
        if (f?.data_inicio_prevista && f?.data_fim_prevista) {
          de = f.data_inicio_prevista;
          ate = f.data_fim_prevista;
          plano = 'fase';
        }
      }

      if (!de || !ate) {


        semPlano.push({ id: c.id, titulo: c.titulo, atribuido_a: c.atribuido_a, origem: c.origem });
        continue;
      }
      if (!dentroDaJanela(de, ate)) continue;

      if (!idsComRaia.has(c.atribuido_a)) {
        semRaia.push({ id: c.id, titulo: c.titulo, origem: c.origem, data_inicio: de, data_fim: ate });
        continue;
      }

      cards.push({
        id: c.id, titulo: c.titulo, atribuido_a: c.atribuido_a,
        data_inicio: de, data_fim: ate,
        pode_paralelo: c.pode_paralelo,

        ocupa_dias: c.duracao_dias ?? null,
        estado: c.estado, origem: c.origem, campanha_id: c.campanha_id,


        plano,
        cor: corMap[c.etiqueta_tipo_id] || null,
      });
    }

    res.json({ membros, cards, sem_plano: semPlano, sem_raia: semRaia });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
