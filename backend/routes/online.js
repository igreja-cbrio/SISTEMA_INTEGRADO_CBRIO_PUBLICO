const router = require('express').Router();
const crypto = require('crypto');
const { authenticate, authorize, authorizeModule } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { syncCanal } = require('../services/youtubeCollector');
const yt = require('../services/youtubeAnalytics');
const collectors = require('../services/onlineCollectors');
const { semanaAnteriorBRT, somarViews, compararSemanas } = require('../utils/semanaOnline');
const canalSerie = require('../utils/canalSerie');
const arrec = require('../utils/arrecadacaoOnline');

const CRON_SECRET = process.env.CRON_SECRET;
const { isAuthorizedCron } = require('../utils/cronAuth');


async function autorizaCron(req, res, next) {
  if (!isAuthorizedCron(req)) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

router.get('/cron/sync', autorizaCron, async (_req, res) => {
  try {
    const log = await syncCanal();
    res.json({ ok: true, log });
  } catch (e) {
    console.error('[online/cron/sync]', e.message);
    res.status(500).json({ error: e.message });
  }
});


router.get('/cron/live-monitor', autorizaCron, async (_req, res) => {
  try { res.json(await collectors.liveMonitor()); }
  catch (e) { console.error('[live-monitor]', e.message); res.status(500).json({ error: e.message }); }
});
router.get('/cron/ds-collect', autorizaCron, async (_req, res) => {
  try {
    const ds = await collectors.dsCollector();




    let views = null;
    try {
      views = await collectors.viewsDiaCollector({ dias: 5 });
    } catch (e) {
      console.error('[ds-collect/views-dia]', e.message);
      views = { ok: false, erro: e.message.slice(0, 200) };
    }
    res.json({ ...ds, views_dia: views });
  } catch (e) { console.error('[ds-collect]', e.message); res.status(500).json({ error: e.message }); }
});



router.get('/cron/views-dia-collect', autorizaCron, async (req, res) => {
  try { res.json(await collectors.viewsDiaCollector({ dias: Number(req.query.dias) || 5 })); }
  catch (e) { console.error('[views-dia-collect]', e.message); res.status(500).json({ error: e.message }); }
});
router.get('/cron/ddus-collect', autorizaCron, async (_req, res) => {
  try { res.json(await collectors.ddusCollector()); }
  catch (e) { console.error('[ddus-collect]', e.message); res.status(500).json({ error: e.message }); }
});
router.get('/cron/subs-collect', autorizaCron, async (_req, res) => {
  try { res.json(await collectors.subsCollector()); }
  catch (e) { console.error('[subs-collect]', e.message); res.status(500).json({ error: e.message }); }
});
router.get('/cron/trafego-collect', autorizaCron, async (_req, res) => {
  try { res.json(await collectors.traficoCollector()); }
  catch (e) { console.error('[trafego-collect]', e.message); res.status(500).json({ error: e.message }); }
});
router.get('/cron/retencao-curva-collect', autorizaCron, async (_req, res) => {
  try { res.json(await collectors.retencaoCurvaCollector()); }
  catch (e) { console.error('[retencao-curva-collect]', e.message); res.status(500).json({ error: e.message }); }
});
router.get('/cron/sub-status-collect', autorizaCron, async (_req, res) => {
  try { res.json(await collectors.subStatusCollector()); }
  catch (e) { console.error('[sub-status-collect]', e.message); res.status(500).json({ error: e.message }); }
});
router.get('/cron/backfill-cultos', autorizaCron, async (_req, res) => {
  try { res.json(await collectors.backfillCultoVideoIds()); }
  catch (e) { console.error('[backfill-cultos]', e.message); res.status(500).json({ error: e.message }); }
});
router.get('/cron/catch-up', autorizaCron, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 5, 20);
    res.json(await collectors.catchUpMetricas({ limit }));
  } catch (e) { console.error('[catch-up]', e.message); res.status(500).json({ error: e.message }); }
});


router.get('/cron/engajamento-collect', autorizaCron, async (_req, res) => {
  try { res.json(await collectors.engajamentoCollector({ mesesRecentes: 2 })); }
  catch (e) { console.error('[engajamento-collect]', e.message); res.status(500).json({ error: e.message }); }
});




router.get('/cron/verificar', autorizaCron, async (_req, res) => {
  try {
    let selfHeal = null;
    try { selfHeal = await collectors.catchUpMetricas({ limit: 10 }); }
    catch (e) { selfHeal = { erro: e.message }; }
    const relatorio = await collectors.verificarColetaOnline();
    const { gerarNotificacoesOnline } = require('../services/notificacaoGenerator');
    const notificacoes = await gerarNotificacoesOnline();
    res.json({ ok: true, selfHeal, relatorio, notificacoes });
  } catch (e) {
    console.error('[online/cron/verificar]', e.message);
    res.status(500).json({ error: e.message });
  }
});



function signState(payload) {

  if (!CRON_SECRET) throw new Error('CRON_SECRET não configurada — OAuth state não pode ser assinado');
  const json = JSON.stringify(payload);
  const sig = crypto.createHmac('sha256', CRON_SECRET).update(json).digest('hex').slice(0, 16);
  return Buffer.from(json).toString('base64url') + '.' + sig;
}
function verifyState(state) {
  try {
    if (!CRON_SECRET) return null;
    const [b64, sig] = (state || '').split('.');
    if (!b64 || !sig) return null;
    const json = Buffer.from(b64, 'base64url').toString();
    const expected = crypto.createHmac('sha256', CRON_SECRET).update(json).digest('hex').slice(0, 16);
    if (expected !== sig) return null;
    const payload = JSON.parse(json);
    if (Date.now() - (payload.ts || 0) > 10 * 60 * 1000) return null;
    return payload;
  } catch { return null; }
}

function getRedirectUri() {
  const base = process.env.FRONTEND_URL || `https://${process.env.VERCEL_URL}` || 'http://localhost:3000';
  return `${base.replace(/\/$/, '')}/api/online/oauth/callback`;
}

router.get('/oauth/callback', async (req, res) => {
  const { code, state, error } = req.query;
  if (error) return res.redirect(`/online?oauth_error=${encodeURIComponent(String(error))}`);
  const payload = verifyState(String(state || ''));
  if (!payload) return res.redirect('/online?oauth_error=state_invalido');
  try {
    const { tokens, channel } = await yt.exchangeCode(String(code), getRedirectUri());
    if (!tokens.refresh_token) {
      return res.redirect('/online?oauth_error=sem_refresh_token');
    }
    await yt.saveTokens({ channel, tokens, userId: payload.userId });
    res.redirect(`/online?oauth_ok=1&canal=${encodeURIComponent(channel.title || '')}`);
  } catch (e) {
    console.error('[oauth/callback]', e.message);
    res.redirect(`/online?oauth_error=${encodeURIComponent(e.message.slice(0, 100))}`);
  }
});


router.use(authenticate);


router.get('/oauth/authorize', authorize('admin', 'diretor'), (req, res) => {
  const state = signState({ userId: req.user?.id || null, ts: Date.now(), nonce: crypto.randomBytes(8).toString('hex') });
  res.json({ url: yt.getAuthUrl(state, getRedirectUri()) });
});



router.get('/debug/canais-autorizados', authorize('admin', 'diretor'), async (_req, res) => {
  try {
    const canais = await yt.listAuthorizedChannels();
    res.json({ ok: true, canais, total: canais.length });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});



router.get('/debug/analytics-test', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { video_id, start, end } = req.query;
    if (!video_id) return res.status(400).json({ error: 'video_id obrigatorio' });
    const startDate = start || new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
    const endDate   = end   || new Date().toISOString().slice(0, 10);
    const result = await yt.debugAnalyticsCall(String(video_id), String(startDate), String(endDate));
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.get('/oauth/status', async (_req, res) => {


  let { data } = await supabase
    .from('vw_online_oauth_status')
    .select('*')
    .is('revoked_at', null)
    .order('connected_at', { ascending: false })
    .limit(1)
    .maybeSingle();


  if (!data) {
    const r = await supabase
      .from('vw_online_oauth_status')
      .select('*')
      .order('connected_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    data = r.data;
  }
  res.json(data || { conectado: false });
});

router.post('/oauth/disconnect', authorize('admin', 'diretor'), async (_req, res) => {
  const { data } = await supabase.from('online_oauth_tokens').select('channel_id').is('revoked_at', null).maybeSingle();
  if (data?.channel_id) await yt.disconnect(data.channel_id);
  res.json({ ok: true });
});


















router.post('/coletar/live', authorizeModule('online', 3), async (_req, res) => {
  try { res.json(await collectors.liveMonitor()); } catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/coletar/ds', authorizeModule('online', 3), async (_req, res) => {
  try {


    const backfill = await collectors.backfillCultoVideoIds().catch((e) => ({ erro: e.message }));
    const ds = await collectors.dsCollector();
    res.json({ ...ds, backfill });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/coletar/ddus', authorizeModule('online', 3), async (_req, res) => {
  try {
    const backfill = await collectors.backfillCultoVideoIds().catch((e) => ({ erro: e.message }));
    const ddus = await collectors.ddusCollector();
    res.json({ ...ddus, backfill });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/coletar/subs', authorizeModule('online', 3), async (_req, res) => {
  try { res.json(await collectors.subsCollector()); } catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/coletar/trafego', authorizeModule('online', 3), async (_req, res) => {
  try { res.json(await collectors.traficoCollector()); } catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/coletar/retencao-curva', authorizeModule('online', 3), async (_req, res) => {
  try { res.json(await collectors.retencaoCurvaCollector()); } catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/coletar/sub-status', authorizeModule('online', 3), async (_req, res) => {
  try { res.json(await collectors.subStatusCollector()); } catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/coletar/backfill-range', authorizeModule('online', 3), async (req, res) => {
  const { data_inicio, data_fim } = req.body || {};
  if (!data_inicio || !data_fim) return res.status(400).json({ error: 'data_inicio e data_fim obrigatórios' });
  try { res.json(await collectors.backfillRange(data_inicio, data_fim)); } catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/coletar/backfill-cultos', authorizeModule('online', 3), async (_req, res) => {
  try { res.json(await collectors.backfillCultoVideoIds()); } catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/coletar/catch-up', authorizeModule('online', 3), async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 5, 20);
    res.json(await collectors.catchUpMetricas({ limit }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
















router.post('/coletar/views-dia', authorizeModule('online', 3), async (req, res) => {
  try { res.json(await collectors.viewsDiaCollector({ dias: Number(req.query.dias) || 5 })); }
  catch (e) { console.error('[coletar/views-dia]', e.message); res.status(500).json({ error: e.message }); }
});
router.post('/coletar/engajamento', authorizeModule('online', 3), async (req, res) => {
  try {
    const ano = req.query.ano ? Number(req.query.ano) : undefined;
    res.json(await collectors.engajamentoCollector({ ano }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});








router.get('/engajamento', async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('online_engajamento')
      .select('mes, retencao_media_pct, taxa_compartilhamento_pct, cliques_series_pct, fonte, observacao, collected_at')
      .order('mes', { ascending: false })
      .limit(1);
    if (error) throw error;
    const row = (data || [])[0] || null;
    const mesLabel = row?.mes
      ? new Date(row.mes + 'T00:00:00').toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric' })
      : null;
    res.json({
      mes: row?.mes ?? null,
      mes_label: mesLabel,
      retencao: Number(row?.retencao_media_pct ?? 0),
      compartilhamento: Number(row?.taxa_compartilhamento_pct ?? 0),
      cliques_series: Number(row?.cliques_series_pct ?? 0),
      fonte: row?.fonte ?? null,
      observacao: row?.observacao ?? null,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});















router.get('/canal-serie', async (req, res) => {
  const janela = canalSerie.janelaDoPeriodo(req.query?.dias);
  const avisos = [];
  let serie = null;
  let trafego = null;

  try {
    const { data, error } = await supabase
      .from('online_canal_views_dia')
      .select('data, views, watch_minutos')
      .gte('data', janela.inicio)
      .lte('data', janela.fim)
      .order('data', { ascending: true });
    if (error) throw error;
    serie = canalSerie.montarSerie(data, janela);
  } catch (e) {
    console.error('[online/canal-serie]', e.message);
    avisos.push('Não foi possível carregar a série do canal.');
  }

  try {



    const { data, error } = await supabase
      .from('online_video_trafico')
      .select('video_id, fonte, views')
      .gte('periodo_fim', janela.inicio)
      .limit(4000);
    if (error) throw error;
    trafego = canalSerie.agregarTrafego(data);
  } catch (e) {
    console.error('[online/canal-serie/trafego]', e.message);
    avisos.push('Não foi possível carregar as fontes de tráfego.');
  }

  res.json({
    ...janela,
    periodos: canalSerie.PERIODOS,
    serie,
    trafego,
    fonte: 'YouTube Analytics',
    avisos,
  });
});






















router.get('/arrecadacao', async (req, res) => {
  if (!arrec.podeVerArrecadacaoOnline(req.user)) {
    return res.status(403).json({
      error: 'Sem permissão para ver valores de arrecadação.',
      reason: 'arrecadacao_online_requerido',
    });
  }

  const hoje = arrec.hojeBRT();
  const anoHoje = Number(hoje.slice(0, 4));
  const anoPedido = Number(req.query?.ano);


  const ano = Number.isInteger(anoPedido) && anoPedido >= 2022 && anoPedido <= anoHoje
    ? anoPedido
    : anoHoje;

  const inicio = `${ano}-01-01`;


  const fim = ano === anoHoje ? hoje : `${ano}-12-31`;

  const avisos = [];
  let dados = null;
  let anterior = null;

  try {
    const { data, error } = await supabase.rpc('fn_online_arrecadacao', {
      p_inicio: inicio, p_fim: fim,
    });
    if (error) throw error;
    dados = data;
  } catch (e) {
    console.error('[online/arrecadacao]', e.message);


    return res.status(500).json({
      error: 'Não foi possível carregar a arrecadação.',
      detalhe: e.message,
    });
  }

  try {
    const { data, error } = await supabase.rpc('fn_online_arrecadacao', {
      p_inicio: `${ano - 1}-01-01`, p_fim: `${ano - 1}-12-31`,
    });
    if (error) throw error;
    anterior = data;
  } catch (e) {
    console.error('[online/arrecadacao/anoAnterior]', e.message);


    avisos.push('Não foi possível carregar o ano anterior para comparação.');
  }

  const corte = dados?.corte || null;
  const semanas = arrec.anotarSerie(dados?.semanas, { hoje, corte });
  const meses = arrec.compararComAnoAnterior(
    arrec.anotarSerie(dados?.meses, { hoje, corte, campoFim: 'mes' }),
    anterior?.meses,
  );

  res.json({
    ano,
    anos: Array.from({ length: anoHoje - 2022 + 1 }, (_, i) => 2022 + i),
    inicio, fim, corte,
    total: dados?.total ?? null,
    lancamentos: dados?.lancamentos ?? null,
    ticket_mediano: dados?.ticket_mediano ?? null,
    ticket_medio: dados?.ticket_medio ?? null,
    semanas,
    meses,
    semana_atual: arrec.ultimoFechado(semanas),
    composicao: dados?.composicao || [],
    concentracao: dados?.concentracao || null,
    conferencia: arrec.conferencia(dados?.total, dados?.fora_do_recorte),
    fora_do_recorte: dados?.fora_do_recorte || [],
    ano_anterior: anterior
      ? { ano: ano - 1, total: anterior.total, lancamentos: anterior.lancamentos }
      : null,
    avisos,
  });
});



router.get('/dashboard', async (_req, res) => {
  try {

    const { data: snaps } = await supabase
      .from('online_canal_snapshot')
      .select('*')
      .order('data', { ascending: false })
      .limit(60);

    const atual = (snaps || [])[0] || null;
    const ha30 = (snaps || []).find(s => {
      const d = new Date(s.data);
      const limite = new Date();
      limite.setDate(limite.getDate() - 30);
      return d <= limite;
    }) || null;

    const delta = atual && ha30 ? {
      subscriber: atual.subscriber_count - ha30.subscriber_count,
      view: atual.view_count - ha30.view_count,
      video: atual.video_count - ha30.video_count,
    } : null;


    const hoje = new Date();
    const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString();

    const { data: topViews } = await supabase
      .from('online_videos')
      .select('id, video_id, titulo, thumbnail_url, view_count, like_count, comment_count, taxa_engajamento, publicado_em, serie:online_series(id, titulo)')
      .gte('publicado_em', inicioMes)
      .order('view_count', { ascending: false })
      .limit(5);

    const { data: topEngajamento } = await supabase
      .from('online_videos')
      .select('id, video_id, titulo, thumbnail_url, view_count, like_count, comment_count, taxa_engajamento, publicado_em, serie:online_series(id, titulo)')
      .gte('publicado_em', inicioMes)
      .not('taxa_engajamento', 'is', null)
      .order('taxa_engajamento', { ascending: false })
      .limit(5);

    const { data: topAllTime } = await supabase
      .from('online_videos')
      .select('id, video_id, titulo, thumbnail_url, view_count, like_count, taxa_engajamento, publicado_em')
      .order('view_count', { ascending: false })
      .limit(5);


    const { data: series } = await supabase
      .from('vw_online_series_kpi')
      .select('*')
      .order('total_views', { ascending: false })
      .limit(12);


    const { data: kpisOnline } = await supabase
      .from('kpi_indicadores_taticos')
      .select('id, indicador, valores, area')
      .eq('ativo', true)
      .eq('area', 'online');

    const { data: trajs } = await supabase
      .from('vw_kpi_trajetoria_atual')
      .select('kpi_id, status_trajetoria, ultimo_valor, ultimo_periodo, checkpoint_meta, percentual_meta');
    const trajByKpi = {};
    (trajs || []).forEach(t => { trajByKpi[t.kpi_id] = t; });

    const matrizOnline = {};
    for (const k of kpisOnline || []) {
      for (const v of (Array.isArray(k.valores) ? k.valores : [])) {
        if (!matrizOnline[v]) matrizOnline[v] = [];
        matrizOnline[v].push({
          kpi_id: k.id,
          indicador: k.indicador,
          ...(trajByKpi[k.id] || {}),
        });
      }
    }








    let semana = null;
    try {
      const janela = semanaAnteriorBRT();
      const anterior = semanaAnteriorBRT(Date.parse(`${janela.inicio}T12:00:00Z`));

      const { data: linhas, error: errV } = await supabase
        .from('online_canal_views_dia')
        .select('data, views, watch_minutos')
        .gte('data', anterior.inicio)
        .lte('data', janela.fim);
      if (errV) throw new Error(errV.message);

      const atualSem = somarViews(linhas, janela.inicio, janela.fim);
      const antSem = somarViews(linhas, anterior.inicio, anterior.fim);






      let cultos = [];
      try {
        const { data: cs, error: errC } = await supabase
          .from('cultos')
          .select('id, data, hora, online_ds, online_ddus, online_pico, youtube_video_id, service_type_id')
          .gte('data', janela.inicio)
          .lte('data', janela.fim)
          .order('data')
          .order('hora');
        if (errC) throw new Error(errC.message);

        const tipos = {};
        const ids = [...new Set((cs || []).map((c) => c.service_type_id).filter(Boolean))];
        if (ids.length) {
          const { data: ts } = await supabase
            .from('vol_service_types').select('id, name').in('id', ids);
          for (const t of ts || []) tipos[t.id] = t.name;
        }

        cultos = (cs || []).map((c) => ({
          id: c.id,
          data: c.data,
          hora: typeof c.hora === 'string' ? c.hora.slice(0, 5) : null,
          nome: tipos[c.service_type_id] || 'Culto',


          ds: c.online_ds,
          ddus: c.online_ddus,
          pico: c.online_pico,


          sem_video: !c.youtube_video_id,
        }));
      } catch (e) {
        console.error('[online/dashboard/semana/cultos]', e.message);
        cultos = null;
      }




      const diasDaSemana = (linhas || [])
        .filter((l) => {
          const d = typeof l?.data === 'string' ? l.data.slice(0, 10) : null;
          return d && d >= janela.inicio && d <= janela.fim;
        })
        .map((l) => ({ data: String(l.data).slice(0, 10), views: l.views, watch_minutos: l.watch_minutos }))
        .sort((a, b) => (a.data < b.data ? -1 : 1));

      semana = {
        ...janela,
        ...atualSem,
        dias_detalhe: diasDaSemana,
        cultos,
        fonte: 'YouTube Analytics · views do canal',



        anterior: antSem.views === null ? null : {
          rotulo: anterior.rotulo,
          views: antSem.views,
          dias_com_dado: antSem.dias_com_dado,
        },



        comparacao: compararSemanas(atualSem, antSem),
      };
    } catch (e) {
      console.error('[online/dashboard/semana]', e.message);
      semana = { erro: 'Não foi possível carregar as views da semana.', detalhe: e.message.slice(0, 160) };
    }

    res.json({
      canal: atual,
      delta,
      top_views_mes: topViews || [],
      top_engajamento_mes: topEngajamento || [],
      top_all_time: topAllTime || [],
      series: series || [],
      matriz_online: matrizOnline,
      semana,
    });
  } catch (e) {
    console.error('[online/dashboard]', e.message);
    res.status(500).json({ error: e.message });
  }
});




router.get('/series', async (req, res) => {
  try {
    const order = req.query.order || 'views';
    let q = supabase.from('vw_online_series_kpi').select('*');
    if (order === 'engajamento') q = q.order('taxa_engajamento_media', { ascending: false, nullsFirst: false });
    else if (order === 'recente') q = q.order('ultimo_video_em', { ascending: false, nullsFirst: false });
    else q = q.order('total_views', { ascending: false });
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});




router.get('/series/:id', async (req, res) => {
  try {
    const { data: serie, error } = await supabase
      .from('vw_online_series_kpi')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();
    if (error) throw error;
    if (!serie) return res.status(404).json({ error: 'Série não encontrada' });

    const { data: videos } = await supabase
      .from('online_videos')
      .select('id, video_id, titulo, thumbnail_url, view_count, like_count, comment_count, taxa_engajamento, duration_seconds, publicado_em, culto_id')
      .eq('serie_id', req.params.id)
      .order('publicado_em', { ascending: false });

    res.json({ serie, videos: videos || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});






router.get('/cultos-metricas', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 24, 100);
    const { data: cultos, error } = await supabase
      .from('cultos')
      .select(`
        id, data, youtube_video_id,
        online_pico, online_ds, online_ddus,
        online_watch_minutes_ds, online_watch_minutes_ddus,
        online_retencao_pct_ds, online_retencao_pct_ddus,
        online_subs_ganhos, online_subs_perdidos,
        online_views_inscritos, online_views_nao_inscritos,
        vol_service_types(name, recurrence_time)
      `)
      .not('youtube_video_id', 'is', null)
      .order('data', { ascending: false })
      .limit(limit);
    if (error) throw error;

    const videoIds = (cultos || []).map(c => c.youtube_video_id).filter(Boolean);
    if (!videoIds.length) return res.json([]);


    const { data: traficoRows } = await supabase
      .from('online_video_trafico')
      .select('video_id, fonte, views, watch_minutes')
      .in('video_id', videoIds);
    const traficoByVideo = {};
    for (const r of (traficoRows || [])) {
      if (!traficoByVideo[r.video_id]) traficoByVideo[r.video_id] = [];
      traficoByVideo[r.video_id].push({ fonte: r.fonte, views: r.views, watch_minutes: r.watch_minutes });
    }
    for (const vId of Object.keys(traficoByVideo)) {
      traficoByVideo[vId].sort((a, b) => b.views - a.views);
    }











    const curvaRows = [];
    const PAGINA = 1000;
    for (let de = 0; ; de += PAGINA) {
      const { data: pagina, error: erroCurva } = await supabase
        .from('online_video_retencao_curva')
        .select('video_id, ratio_pct, audience_watch_ratio')
        .in('video_id', videoIds)
        .order('video_id', { ascending: true })
        .order('ratio_pct', { ascending: true })
        .range(de, de + PAGINA - 1);
      if (erroCurva) throw erroCurva;
      if (!pagina?.length) break;
      curvaRows.push(...pagina);
      if (pagina.length < PAGINA) break;
    }
    const curvaByVideo = {};
    for (const r of curvaRows) {
      if (!curvaByVideo[r.video_id]) curvaByVideo[r.video_id] = [];
      curvaByVideo[r.video_id].push({ ratio_pct: r.ratio_pct, audience_watch_ratio: Number(r.audience_watch_ratio) });
    }


    const { data: videoRows } = await supabase
      .from('online_videos')
      .select('video_id, actual_start_time, actual_end_time, titulo')
      .in('video_id', videoIds);
    const videoMeta = {};
    for (const v of (videoRows || [])) videoMeta[v.video_id] = v;

    const result = (cultos || []).map(c => ({
      id: c.id,
      data: c.data,
      youtube_video_id: c.youtube_video_id,
      service_type_name: c.vol_service_types?.name || null,
      recurrence_time: c.vol_service_types?.recurrence_time || null,
      online_pico: c.online_pico,
      online_ds: c.online_ds,
      online_ddus: c.online_ddus,
      online_watch_minutes_ds: c.online_watch_minutes_ds,
      online_watch_minutes_ddus: c.online_watch_minutes_ddus,
      online_retencao_pct_ds: c.online_retencao_pct_ds,
      online_retencao_pct_ddus: c.online_retencao_pct_ddus,
      online_subs_ganhos: c.online_subs_ganhos,
      online_subs_perdidos: c.online_subs_perdidos,
      online_views_inscritos: c.online_views_inscritos,
      online_views_nao_inscritos: c.online_views_nao_inscritos,
      trafico: traficoByVideo[c.youtube_video_id] || [],
      retencao_curva: curvaByVideo[c.youtube_video_id] || [],
      actual_start_time: videoMeta[c.youtube_video_id]?.actual_start_time || null,
      actual_end_time:   videoMeta[c.youtube_video_id]?.actual_end_time   || null,
      video_titulo:      videoMeta[c.youtube_video_id]?.titulo || null,
    }));

    res.json(result);
  } catch (e) {
    console.error('[online/cultos-metricas]', e.message);
    res.status(500).json({ error: e.message });
  }
});




router.post('/sync', authorize('admin', 'diretor'), async (_req, res) => {
  try {
    const log = await syncCanal();
    res.json({ ok: true, log });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


















router.get('/aceitacoes', async (req, res) => {
  try {
    const dias = Math.min(Math.max(parseInt(req.query.dias, 10) || 90, 1), 365);
    const desde = new Date(Date.now() - 3 * 3600e3 - dias * 86400e3).toISOString().slice(0, 10);




    const { data, error } = await supabase
      .from('cui_convertidos')
      .select('id, nome, telefone, membro_id, data_culto, culto_id, primeiro_contato_em, primeiro_contato_status, created_at, cultos(data, vol_service_types(name))')
      .eq('area', 'online')
      .is('deleted_at', null)
      .gte('data_culto', desde)
      .order('data_culto', { ascending: false })
      .limit(500);
    if (error) throw error;

    const itens = (data || []).map((c) => {
      const dataCultoOrigem = c.cultos?.data || null;



      const replay = !!(dataCultoOrigem && c.data_culto && dataCultoOrigem !== c.data_culto);
      return {
        id: c.id,
        nome: c.nome,
        telefone: c.telefone,
        membro_id: c.membro_id,

        decidiu_em: c.data_culto,
        contatado_em: c.primeiro_contato_em,
        replay,
        culto: dataCultoOrigem
          ? { data: dataCultoOrigem, nome: c.cultos?.vol_service_types?.name || 'Culto' }
          : null,
      };
    });

    const filtrados = req.query.replay === '1' ? itens.filter((i) => i.replay)
      : req.query.replay === '0' ? itens.filter((i) => !i.replay)
      : itens;

    res.json({
      dias,
      itens: filtrados,
      total: itens.length,
      de_replay: itens.filter((i) => i.replay).length,
      sem_contato: itens.filter((i) => !i.contatado_em).length,
    });
  } catch (e) {
    console.error('[online/aceitacoes]', e.message);
    res.status(500).json({ error: 'Erro ao carregar as aceitações online' });
  }
});









router.get('/qr-cultos', async (req, res) => {
  try {
    const { montarLinkDecisao } = require('../utils/decisaoToken');
    const ISO = /^\d{4}-\d{2}-\d{2}$/;
    const inicio = String(req.query.inicio || '').slice(0, 10);
    const fim = String(req.query.fim || '').slice(0, 10);
    if (!ISO.test(inicio) || !ISO.test(fim)) {
      return res.status(400).json({ error: 'Informe inicio e fim no formato AAAA-MM-DD.' });
    }
    if (fim < inicio) return res.status(400).json({ error: 'O fim não pode ser anterior ao início.' });

    const { data, error } = await supabase
      .from('vw_culto_stats')
      .select('id, data, hora, nome, service_type_name, service_type_has_online')
      .gte('data', inicio)
      .lte('data', fim)
      .order('data', { ascending: true })
      .order('hora', { ascending: true })
      .limit(100);
    if (error) throw error;



    const cultos = (data || [])
      .filter((c) => c.service_type_has_online)
      .map((c) => ({
        id: c.id,
        data: c.data,
        hora: c.hora,
        nome: c.service_type_name || c.nome || 'Culto',


        link: montarLinkDecisao(c.id),
      }));

    res.json({ inicio, fim, cultos });
  } catch (e) {
    console.error('[online/qr-cultos]', e.message);
    res.status(500).json({ error: 'Erro ao gerar os QRs dos cultos' });
  }
});















router.get('/link-membresia', async (req, res) => {
  try {
    const { basePublica } = require('../utils/linkInscricaoApp');
    const { OUTROS_FORMULARIOS } = require('./links');

    const porta = (OUTROS_FORMULARIOS || []).find((f) => f.chave === 'cadastro_membresia');


    if (!porta?.caminho) {
      return res.status(503).json({
        error: 'O catálogo de formulários públicos não trouxe o cadastro de membresia.',
      });
    }

    res.json({
      link: `${basePublica()}${porta.caminho}?origem=online`,
      nome: porta.nome,
    });
  } catch (e) {
    console.error('[online/link-membresia]', e.message);


    res.status(500).json({ error: 'Erro ao montar o link do cadastro de membresia' });
  }
});




























router.post('/comunidade-mensal', authorizeModule('online', 3), async (req, res) => {
  try {
    const { mes, valor } = req.body || {};
    if (!mes || !/^\d{4}-\d{2}/.test(String(mes))) {
      return res.status(400).json({ error: 'Informe o mês no formato AAAA-MM.' });
    }


    let n = null;
    if (valor !== null && valor !== undefined && String(valor).trim() !== '') {
      n = Number(valor);
      if (!Number.isInteger(n) || n < 0 || n > 1000000) {
        return res.status(400).json({ error: 'Informe um número inteiro de pessoas.' });
      }
    }
    const { data, error } = await supabase
      .from('cultura_mensal')


      .upsert({
        mes: `${String(mes).slice(0, 7)}-01`,
        investir_comunidade_online: n,
        updated_at: new Date().toISOString(),
        updated_by: req.user?.id || null,
      }, { onConflict: 'mes' })
      .select('mes, investir_comunidade_online')
      .single();
    if (error) throw error;
    res.json({ ok: true, ...data });
  } catch (e) {
    console.error('[ONLINE] comunidade-mensal:', e.message);
    res.status(500).json({ error: 'Não foi possível salvar o número da comunidade.' });
  }
});

module.exports = router;
