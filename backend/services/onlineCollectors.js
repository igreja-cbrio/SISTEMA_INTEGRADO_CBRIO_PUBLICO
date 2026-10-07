








const { supabase } = require('../utils/supabase');
const { patchDiagOnline } = require('../utils/onlineDiag');
const yt = require('./youtubeAnalytics');
const dsOnline = require('../utils/dsOnline');

const JANELA_LIVE_MIN_ANTES = 30;
const JANELA_LIVE_MIN_DEPOIS = 240;






const PICO_ANALYTICS_DELAY_DIAS = 3;







const DS_CRON_HORA_UTC = 10;





const FALLBACK_GRACE_MIN = 720;

function fmtData(d) {
  return d.toISOString().slice(0, 10);
}


function diasDesdeData(dataStr) {
  const dt = new Date(dataStr + 'T00:00:00');
  return Math.floor((Date.now() - dt.getTime()) / 86400000);
}

function dataMaisDias(base, dias) {
  const d = new Date(base);
  d.setDate(d.getDate() + dias);
  return d;
}








function horarioCultoBRT(dataStr, recurrenceTime) {
  const [h, m] = (recurrenceTime || '').split(':').map(Number);
  if (isNaN(h)) return null;
  const hh = String(h).padStart(2, '0');
  const mm = String(m || 0).padStart(2, '0');
  return new Date(`${dataStr}T${hh}:${mm}:00-03:00`);
}














function escolherVideoMaisProximo(videos, horario, usados) {
  const inicio = horario.getTime() - JANELA_LIVE_MIN_ANTES * 60_000;
  const fim = horario.getTime() + JANELA_LIVE_MIN_DEPOIS * 60_000;
  let melhor = null;
  let melhorDist = Infinity;
  for (const v of videos || []) {
    if (!v?.video_id || !v.actual_start_time) continue;
    if (usados && usados.has(v.video_id)) continue;
    const t = new Date(v.actual_start_time).getTime();
    if (isNaN(t) || t < inicio || t > fim) continue;
    const dist = Math.abs(t - horario.getTime());
    if (dist < melhorDist) { melhor = v; melhorDist = dist; }
  }
  return melhor;
}








async function findCultoAtual({ fallbackUltimoDoDia = false } = {}) {
  const now = new Date();
  const hojeStr = fmtData(now);

  const ontemStr = fmtData(dataMaisDias(now, -1));

  const { data: cultos } = await supabase
    .from('cultos')
    .select('id, data, service_type_id, vol_service_types(name, recurrence_time, has_online), online_pico, online_views_live, youtube_video_id')
    .in('data', [hojeStr, ontemStr])
    .order('data', { ascending: false });

  if (!cultos?.length) return null;


  const comHorario = [];
  for (const c of cultos) {
    const st = c.vol_service_types;
    if (!st?.has_online) continue;
    const horario = horarioCultoBRT(c.data, st.recurrence_time);
    if (!horario) continue;
    comHorario.push({ culto: c, horario, minutosDoInicio: (now - horario) / 60000 });
  }
  if (!comHorario.length) return null;





  const naJanela = comHorario
    .filter((x) => x.minutosDoInicio >= -JANELA_LIVE_MIN_ANTES && x.minutosDoInicio <= JANELA_LIVE_MIN_DEPOIS)
    .sort((a, b) => b.horario - a.horario);
  if (naJanela.length) return naJanela[0].culto;



  if (fallbackUltimoDoDia) {
    const posLive = comHorario
      .filter((x) => x.minutosDoInicio > JANELA_LIVE_MIN_DEPOIS && x.minutosDoInicio <= FALLBACK_GRACE_MIN)
      .sort((a, b) => b.horario - a.horario);
    if (posLive.length) return posLive[0].culto;
  }

  return null;
}













async function registrarDiagToken(patch) {
  try {
    await supabase.from('online_oauth_tokens')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .is('revoked_at', null);
  } catch {                                              }
}












async function escolherVideoDoCulto(culto) {
  const st = culto.vol_service_types;
  const horario = horarioCultoBRT(culto.data, st?.recurrence_time);
  if (!horario) return { error: 'sem_horario_culto' };

  const inicio = new Date(horario.getTime() - JANELA_LIVE_MIN_ANTES * 60_000);
  const fim = new Date(horario.getTime() + JANELA_LIVE_MIN_DEPOIS * 60_000);


  const { data: irmaos } = await supabase
    .from('cultos')
    .select('youtube_video_id')
    .eq('data', culto.data)
    .neq('id', culto.id)
    .not('youtube_video_id', 'is', null);
  const usados = new Set((irmaos || []).map((r) => r.youtube_video_id));


  const candidatos = new Map();
  const { data: vids } = await supabase
    .from('online_videos')
    .select('video_id, actual_start_time, titulo')
    .not('actual_start_time', 'is', null)
    .gte('actual_start_time', inicio.toISOString())
    .lte('actual_start_time', fim.toISOString());
  for (const v of (vids || [])) candidatos.set(v.video_id, v);



  let broadcast = null;
  try {
    broadcast = await yt.findActiveBroadcast();
  } catch (e) {

    if (!candidatos.size) return { error: `broadcast: ${(e?.message || String(e)).slice(0, 120)}` };
  }
  if (broadcast?.video_id) {
    const existente = candidatos.get(broadcast.video_id);
    candidatos.set(broadcast.video_id, {
      video_id: broadcast.video_id,
      actual_start_time: broadcast.started_at || existente?.actual_start_time || null,
      titulo: broadcast.title || existente?.titulo || null,
    });
  }

  if (!candidatos.size) return { error: 'sem_live_ativa' };


  const melhor = escolherVideoMaisProximo([...candidatos.values()], horario, usados);
  if (!melhor) return { error: 'sem_video_compativel' };
  return { video_id: melhor.video_id, titulo: melhor.titulo };
}




async function liveMonitor() {
  const culto = await findCultoAtual();
  if (!culto) return { skipped: true, reason: 'fora_de_janela' };

  const agora = new Date().toISOString();
  try {



    let videoId = culto.youtube_video_id;
    if (!videoId) {
      const escolha = await escolherVideoDoCulto(culto);
      if (escolha.error) {
        await registrarDiagToken(patchDiagOnline(escolha.error, agora));
        return { skipped: true, reason: escolha.error, culto_id: culto.id };
      }
      videoId = escolha.video_id;
      await supabase.from('cultos')
        .update({ youtube_video_id: videoId })
        .eq('id', culto.id);
    }




    const snap = await yt.fetchLiveSnapshot(null, videoId);
    const viewers = snap?.viewers ?? null;





    const viewsLive = dsOnline.maiorViewCount(culto.online_views_live, snap?.viewCount);
    if (viewsLive !== null && viewsLive !== (culto.online_views_live ?? null)) {


















      const { error: eViews } = await supabase.from('cultos')
        .update({ online_views_live: viewsLive })
        .eq('id', culto.id);
      if (eViews) console.error('[live-monitor] online_views_live:', eViews.message);
    }

    if (viewers === null) {
      await registrarDiagToken(patchDiagOnline('live_encerrada_ou_sem_dado', agora));
      return { skipped: true, reason: 'live_encerrada_ou_sem_dado', culto_id: culto.id, video_id: videoId };
    }


    await coletarChatDecisoes(culto.id).catch(() => {});


    const picoAtual = culto.online_pico || 0;
    if (viewers > picoAtual) {
      await supabase.from('cultos')
        .update({ online_pico: viewers })
        .eq('id', culto.id);
      await registrarDiagToken({ last_check_at: agora, last_error: null });
      return { ok: true, culto_id: culto.id, video_id: videoId, viewers, pico_anterior: picoAtual, atualizou: true };
    }
    await registrarDiagToken({ last_check_at: agora, last_error: null });
    return { ok: true, culto_id: culto.id, video_id: videoId, viewers, pico_atual: picoAtual, atualizou: false };
  } catch (e) {


    const msg = (e?.message || String(e)).slice(0, 250);
    await registrarDiagToken(patchDiagOnline(`live_monitor: ${msg}`, agora));
    return { skipped: true, reason: 'erro', culto_id: culto.id, error: msg };
  }
}







const CHAT_GATILHOS = /(aceito jesus|eu aceito|aceito a jesus|entrego minha vida|quero aceitar|decido por jesus|recebo jesus|jesus (e|é) o senhor)/i;

async function coletarChatDecisoes(cultoId) {
  const broadcast = await yt.findActiveBroadcast();
  if (!broadcast?.live_chat_id) return { skipped: true, reason: 'sem_live_chat_id' };

  const { data: c } = await supabase
    .from('cultos')
    .select('online_decisoes_chat, online_chat_page_token')
    .eq('id', cultoId)
    .maybeSingle();

  const { mensagens, nextPageToken } = await yt.fetchLiveChatMessages(
    null, broadcast.live_chat_id, c?.online_chat_page_token || undefined
  );

  const novos = (mensagens || []).filter((m) => CHAT_GATILHOS.test(m)).length;
  const total = (c?.online_decisoes_chat || 0) + novos;

  await supabase.from('cultos')
    .update({ online_decisoes_chat: total, online_chat_page_token: nextPageToken })
    .eq('id', cultoId);

  return { ok: true, novos, total };
}






async function dsCollector() {
  const seteDias = fmtData(dataMaisDias(new Date(), -7));
  const ontem = fmtData(dataMaisDias(new Date(), -1));
  const { data: cultos } = await supabase
    .from('cultos')
    .select('id, data, youtube_video_id, online_ds, online_pico, online_views_live')
    .gte('data', seteDias).lte('data', ontem)
    .not('youtube_video_id', 'is', null)
    .or('online_ds.is.null,online_ds.eq.0');

  if (!cultos?.length) return { ok: true, processados: 0, coletados: 0, motivo: 'sem_cultos_com_video_vinculado' };

  const resultados = [];
  let coletados = 0;
  for (const c of cultos) {





    if (!c.online_pico && diasDesdeData(c.data) >= PICO_ANALYTICS_DELAY_DIAS) {
      try {
        const live = await yt.fetchLivePeakConcurrentViewers(null, c.youtube_video_id, c.data, c.data);
        if (live.peak) {
          await supabase.from('cultos').update({ online_pico: live.peak }).eq('id', c.id);
        }
      } catch (e) {
        resultados.push({ culto_id: c.id, pico_error: e.message });
      }
    }

    if (c.online_ds && c.online_ds > 0) {
      resultados.push({ culto_id: c.id, skipped: true, reason: 'ja_preenchido' });
      continue;
    }
    try {





      const stats = await yt.fetchVideoStatistics(null, c.youtube_video_id);





      const { ds, regra } = dsOnline.calcularDs({
        viewCountD1: stats?.viewCount, viewsLive: c.online_views_live,
      });
      const update = { online_ds: ds ?? 0 };
      try {
        const a = await yt.fetchVideoViews(null, c.youtube_video_id, c.data, c.data);
        update.online_watch_minutes_ds = Math.round(a.watch_minutes || 0) || null;
        update.online_retencao_pct_ds = a.avg_view_percentage ? Number(a.avg_view_percentage.toFixed(2)) : null;
      } catch (e) {
        resultados.push({ culto_id: c.id, analytics_pendente: e.message.slice(0, 80) });
      }
      await supabase.from('cultos').update(update).eq('id', c.id);
      coletados++;
      resultados.push({ culto_id: c.id, video_id: c.youtube_video_id, online_ds: update.online_ds, regra, views_live: c.online_views_live ?? null });
    } catch (e) {
      resultados.push({ culto_id: c.id, error: e.message });
    }
  }
  return { ok: true, processados: cultos.length, coletados, resultados };
}




async function backfillRange(dataInicio, dataFim) {
  const { data: cultos } = await supabase
    .from('cultos')
    .select('id, data, youtube_video_id, online_ds, online_ddus, online_pico, online_watch_minutes_ds, online_watch_minutes_ddus')
    .gte('data', dataInicio).lte('data', dataFim)
    .not('youtube_video_id', 'is', null)
    .order('data', { ascending: true });

  if (!cultos?.length) return { ok: true, processados: 0, motivo: 'sem_cultos_com_video_no_range' };

  const hoje = new Date();
  const resultados = [];
  for (const c of cultos) {
    const dt = new Date(c.data + 'T00:00:00');
    const diasDesde = Math.floor((hoje - dt) / 86400000);
    const itemResult = { culto_id: c.id, data: c.data, video_id: c.youtube_video_id };



    if (!c.online_pico && diasDesde >= PICO_ANALYTICS_DELAY_DIAS) {
      try {
        const live = await yt.fetchLivePeakConcurrentViewers(null, c.youtube_video_id, c.data, c.data);
        if (live?.peak) {
          await supabase.from('cultos').update({ online_pico: live.peak }).eq('id', c.id);
          itemResult.pico = live.peak;
        }
      } catch (e) {
        itemResult.pico_error = e.message.slice(0, 100);
      }
    }


    if (!c.online_ds && diasDesde >= 1) {
      try {
        const stats = await yt.fetchVideoViews(null, c.youtube_video_id, c.data, c.data);
        await supabase.from('cultos').update({
          online_ds: stats.views,
          online_watch_minutes_ds: Math.round(stats.watch_minutes || 0) || null,
          online_retencao_pct_ds: stats.avg_view_percentage ? Number(stats.avg_view_percentage.toFixed(2)) : null,
        }).eq('id', c.id);
        itemResult.ds = stats.views;
      } catch (e) { itemResult.ds_error = e.message.slice(0, 100); }
    }


    if (!c.online_ddus && diasDesde >= 7) {
      try {
        const inicio = fmtData(dataMaisDias(dt, 1));
        const fim    = fmtData(dataMaisDias(dt, 7));
        const stats = await yt.fetchVideoViews(null, c.youtube_video_id, inicio, fim);
        await supabase.from('cultos').update({
          online_ddus: stats.views,
          online_watch_minutes_ddus: Math.round(stats.watch_minutes || 0) || null,
          online_retencao_pct_ddus: stats.avg_view_percentage ? Number(stats.avg_view_percentage.toFixed(2)) : null,
        }).eq('id', c.id);
        itemResult.ddus = stats.views;
      } catch (e) { itemResult.ddus_error = e.message.slice(0, 100); }
    }
    resultados.push(itemResult);
  }
  return { ok: true, processados: cultos.length, resultados };
}




async function ddusCollector() {


  const trintaDias = fmtData(dataMaisDias(new Date(), -30));
  const seteDias = fmtData(dataMaisDias(new Date(), -7));
  const { data: cultos } = await supabase
    .from('cultos')
    .select('id, data, youtube_video_id, online_ddus, online_ds')
    .gte('data', trintaDias).lte('data', seteDias)
    .not('youtube_video_id', 'is', null)
    .or('online_ddus.is.null,online_ddus.eq.0');

  if (!cultos?.length) return { ok: true, processados: 0, coletados: 0, motivo: 'sem_cultos_d7_com_video' };

  const resultados = [];
  let coletados = 0;
  for (const c of cultos) {
    if (c.online_ddus && c.online_ddus > 0) {
      resultados.push({ culto_id: c.id, skipped: true, reason: 'ja_preenchido' });
      continue;
    }


    if (c.online_ds == null) {
      resultados.push({ culto_id: c.id, skipped: true, reason: 'ds_ausente' });
      continue;
    }
    try {



      const stats = await yt.fetchVideoStatistics(null, c.youtube_video_id);
      const totalAgora = stats?.viewCount ?? 0;
      const ddus = Math.max(0, totalAgora - (c.online_ds || 0));
      const update = { online_ddus: ddus };

      try {
        const inicio = fmtData(dataMaisDias(new Date(c.data + 'T00:00:00'), 1));
        const fim    = fmtData(dataMaisDias(new Date(c.data + 'T00:00:00'), 7));
        const a = await yt.fetchVideoViews(null, c.youtube_video_id, inicio, fim);
        update.online_watch_minutes_ddus = Math.round(a.watch_minutes || 0) || null;
        update.online_retencao_pct_ddus = a.avg_view_percentage ? Number(a.avg_view_percentage.toFixed(2)) : null;
      } catch (e) {
        resultados.push({ culto_id: c.id, analytics_pendente: e.message.slice(0, 80) });
      }
      await supabase.from('cultos').update(update).eq('id', c.id);
      coletados++;
      resultados.push({ culto_id: c.id, video_id: c.youtube_video_id, online_ddus: ddus, total_agora: totalAgora, ds: c.online_ds });
    } catch (e) {
      resultados.push({ culto_id: c.id, error: e.message });
    }
  }
  return { ok: true, processados: cultos.length, coletados, resultados };
}





async function subsCollector() {
  const setedias = fmtData(dataMaisDias(new Date(), -7));
  const { data: cultos } = await supabase
    .from('cultos')
    .select('id, data, youtube_video_id, online_subs_ganhos')
    .eq('data', setedias)
    .not('youtube_video_id', 'is', null);

  if (!cultos?.length) return { ok: true, processados: 0, motivo: 'sem_cultos_d7_com_video' };

  const resultados = [];
  for (const c of cultos) {
    if (c.online_subs_ganhos !== null && c.online_subs_ganhos !== undefined) {
      resultados.push({ culto_id: c.id, skipped: true, reason: 'ja_preenchido' });
      continue;
    }
    try {
      const inicio = c.data;
      const fim    = fmtData(dataMaisDias(new Date(c.data + 'T00:00:00'), 7));
      const stats = await yt.fetchVideoSubsChange(null, c.youtube_video_id, inicio, fim);
      await supabase.from('cultos')
        .update({
          online_subs_ganhos: stats.gained,
          online_subs_perdidos: stats.lost,
        })
        .eq('id', c.id);
      resultados.push({
        culto_id: c.id,
        video_id: c.youtube_video_id,
        subs_ganhos: stats.gained,
        subs_perdidos: stats.lost,
        periodo: `${inicio}..${fim}`,
      });
    } catch (e) {
      resultados.push({ culto_id: c.id, error: e.message });
    }
  }
  return { ok: true, processados: cultos.length, resultados };
}





async function traficoCollector() {
  const setedias = fmtData(dataMaisDias(new Date(), -7));
  const { data: cultos } = await supabase
    .from('cultos')
    .select('id, data, youtube_video_id')
    .eq('data', setedias)
    .not('youtube_video_id', 'is', null);

  if (!cultos?.length) return { ok: true, processados: 0, motivo: 'sem_cultos_d7_com_video' };

  const resultados = [];
  for (const c of cultos) {
    try {
      const inicio = c.data;
      const fim    = fmtData(dataMaisDias(new Date(c.data + 'T00:00:00'), 7));
      const fontes = await yt.fetchVideoTrafficSources(null, c.youtube_video_id, inicio, fim);
      if (!fontes.length) {
        resultados.push({ culto_id: c.id, video_id: c.youtube_video_id, fontes: 0 });
        continue;
      }
      const rows = fontes.map(f => ({
        video_id: c.youtube_video_id,
        fonte: f.fonte,
        views: f.views,
        watch_minutes: f.watch_minutes,
        periodo_inicio: inicio,
        periodo_fim: fim,
        collected_at: new Date().toISOString(),
      }));
      const { error } = await supabase
        .from('online_video_trafico')
        .upsert(rows, { onConflict: 'video_id,fonte' });
      if (error) throw error;
      resultados.push({
        culto_id: c.id,
        video_id: c.youtube_video_id,
        fontes: fontes.length,
        top: fontes.slice(0, 3).map(f => `${f.fonte}:${f.views}`).join(', '),
      });
    } catch (e) {
      resultados.push({ culto_id: c.id, error: e.message });
    }
  }
  return { ok: true, processados: cultos.length, resultados };
}





async function retencaoCurvaCollector() {
  const setedias = fmtData(dataMaisDias(new Date(), -7));
  const { data: cultos } = await supabase
    .from('cultos')
    .select('id, data, youtube_video_id')
    .eq('data', setedias)
    .not('youtube_video_id', 'is', null);

  if (!cultos?.length) return { ok: true, processados: 0, motivo: 'sem_cultos_d7_com_video' };

  const resultados = [];
  for (const c of cultos) {
    try {
      const inicio = c.data;
      const fim    = fmtData(dataMaisDias(new Date(c.data + 'T00:00:00'), 7));
      const curva = await yt.fetchVideoRetentionCurve(null, c.youtube_video_id, inicio, fim);
      if (!curva.length) {
        resultados.push({ culto_id: c.id, video_id: c.youtube_video_id, pontos: 0 });
        continue;
      }
      const rows = curva.map(p => ({
        video_id: c.youtube_video_id,
        ratio_pct: p.ratio_pct,
        audience_watch_ratio: p.audience_watch_ratio,
        periodo_inicio: inicio,
        periodo_fim: fim,
        collected_at: new Date().toISOString(),
      }));
      const { error } = await supabase
        .from('online_video_retencao_curva')
        .upsert(rows, { onConflict: 'video_id,ratio_pct' });
      if (error) throw error;
      resultados.push({
        culto_id: c.id,
        video_id: c.youtube_video_id,
        pontos: curva.length,
        primeira: curva[0]?.audience_watch_ratio,
        ultima: curva[curva.length - 1]?.audience_watch_ratio,
      });
    } catch (e) {
      resultados.push({ culto_id: c.id, error: e.message });
    }
  }
  return { ok: true, processados: cultos.length, resultados };
}





async function subStatusCollector() {
  const setedias = fmtData(dataMaisDias(new Date(), -7));
  const { data: cultos } = await supabase
    .from('cultos')
    .select('id, data, youtube_video_id, online_views_inscritos')
    .eq('data', setedias)
    .not('youtube_video_id', 'is', null);

  if (!cultos?.length) return { ok: true, processados: 0, motivo: 'sem_cultos_d7_com_video' };

  const resultados = [];
  for (const c of cultos) {
    if (c.online_views_inscritos !== null && c.online_views_inscritos !== undefined) {
      resultados.push({ culto_id: c.id, skipped: true, reason: 'ja_preenchido' });
      continue;
    }
    try {
      const inicio = c.data;
      const fim    = fmtData(dataMaisDias(new Date(c.data + 'T00:00:00'), 7));
      const stats = await yt.fetchVideoViewsBySubStatus(null, c.youtube_video_id, inicio, fim);
      await supabase.from('cultos')
        .update({
          online_views_inscritos: stats.subscribed,
          online_views_nao_inscritos: stats.unsubscribed,
        })
        .eq('id', c.id);
      resultados.push({
        culto_id: c.id,
        video_id: c.youtube_video_id,
        inscritos: stats.subscribed,
        nao_inscritos: stats.unsubscribed,
        periodo: `${inicio}..${fim}`,
      });
    } catch (e) {
      resultados.push({ culto_id: c.id, error: e.message });
    }
  }
  return { ok: true, processados: cultos.length, resultados };
}











async function backfillCultoVideoIds() {
  const horizonte = fmtData(dataMaisDias(new Date(), -180));


  const { data: cultos, error: cErr } = await supabase
    .from('cultos')
    .select('id, data, vol_service_types(recurrence_time, has_online)')
    .is('youtube_video_id', null)
    .gte('data', horizonte)
    .order('data', { ascending: false });
  if (cErr) throw cErr;
  if (!cultos?.length) return { ok: true, linkados: 0, motivo: 'sem_cultos_pendentes' };


  const { data: videos, error: vErr } = await supabase
    .from('online_videos')
    .select('video_id, actual_start_time, titulo')
    .not('actual_start_time', 'is', null)
    .gte('actual_start_time', new Date(Date.now() - 180 * 24 * 3600_000).toISOString())
    .order('actual_start_time', { ascending: false });
  if (vErr) throw vErr;
  if (!videos?.length) return { ok: true, linkados: 0, motivo: 'sem_videos_com_actual_start' };






  const { data: jaLinkados } = await supabase
    .from('cultos')
    .select('youtube_video_id')
    .not('youtube_video_id', 'is', null)
    .gte('data', horizonte);
  const usados = new Set((jaLinkados || []).map((r) => r.youtube_video_id));
  const resultados = [];

  for (const c of cultos) {
    const st = c.vol_service_types;
    if (!st?.has_online) continue;
    const horario = horarioCultoBRT(c.data, st.recurrence_time);
    if (!horario) continue;

    const match = escolherVideoMaisProximo(videos, horario, usados);

    if (match) {
      usados.add(match.video_id);
      const { error } = await supabase
        .from('cultos')
        .update({ youtube_video_id: match.video_id })
        .eq('id', c.id);
      if (error) {
        resultados.push({ culto_id: c.id, error: error.message });
      } else {
        resultados.push({ culto_id: c.id, data: c.data, video_id: match.video_id, titulo: match.titulo });
      }
    }
  }
  return { ok: true, linkados: resultados.filter(r => !r.error).length, total_cultos: cultos.length, resultados };
}









async function catchUpMetricas({ limit = 5 } = {}) {




  const horizonte = fmtData(dataMaisDias(new Date(), -180));
  const { data: cultosCandidatos, error } = await supabase
    .from('cultos')
    .select(`
      id, data, youtube_video_id,
      online_pico, online_pico_verificado,
      online_ds, online_ddus,
      online_subs_ganhos, online_views_inscritos
    `)
    .not('youtube_video_id', 'is', null)
    .gte('data', horizonte)
    .order('data', { ascending: false });
  if (error) throw error;
  if (!cultosCandidatos?.length) return { ok: true, processados: 0, remaining: 0, motivo: 'sem_cultos_com_video' };



  const picoPorVerificar = (c) =>
    c.online_pico_verificado === false && diasDesdeData(c.data) >= PICO_ANALYTICS_DELAY_DIAS;





  const pendentes = cultosCandidatos.filter(c =>
    !c.online_pico || c.online_pico === 0 ||
    picoPorVerificar(c) ||
    !c.online_ds || c.online_ds === 0 ||
    !c.online_ddus || c.online_ddus === 0 ||
    c.online_subs_ganhos === null || c.online_subs_ganhos === undefined ||
    c.online_views_inscritos === null || c.online_views_inscritos === undefined
  );

  const remaining = Math.max(0, pendentes.length - limit);
  const cultos = pendentes.slice(0, limit);
  if (!cultos.length) return { ok: true, processados: 0, remaining: 0, motivo: 'todos_completos' };


  const out = {
    pico: 0, ds: 0, ddus: 0, subs: 0, trafico: 0, retencao_curva: 0, sub_status: 0,
    erros: [],
  };

  for (const c of cultos) {
    const inicioD     = c.data;
    const inicioDplus1 = fmtData(dataMaisDias(new Date(c.data + 'T00:00:00'), 1));
    const fimDplus7    = fmtData(dataMaisDias(new Date(c.data + 'T00:00:00'), 7));









    if ((!c.online_pico || c.online_pico === 0 || c.online_pico_verificado === false)
        && diasDesdeData(c.data) >= PICO_ANALYTICS_DELAY_DIAS) {
      try {
        const live = await yt.fetchLivePeakConcurrentViewers(null, c.youtube_video_id, c.data, c.data);
        const upd = {};
        if (live.peak && live.peak > (c.online_pico || 0)) {
          upd.online_pico = live.peak;
          out.pico++;
        }
        if (live.peak || diasDesdeData(c.data) >= 10) upd.online_pico_verificado = true;
        if (Object.keys(upd).length) {
          await supabase.from('cultos').update(upd).eq('id', c.id);
        }
      } catch (e) {
        out.erros.push({ culto: c.id, metrica: 'pico', msg: e.message });
      }
    }



    if ((!c.online_ds || c.online_ds === 0) && diasDesdeData(c.data) >= 1) {
      try {
        const st = await yt.fetchVideoStatistics(null, c.youtube_video_id);
        const upd = { online_ds: st?.viewCount ?? 0 };
        try {
          const a = await yt.fetchVideoViews(null, c.youtube_video_id, c.data, c.data);
          upd.online_watch_minutes_ds = Math.round(a.watch_minutes || 0) || null;
          upd.online_retencao_pct_ds = a.avg_view_percentage ? Number(a.avg_view_percentage.toFixed(2)) : null;
        } catch {                             }
        await supabase.from('cultos').update(upd).eq('id', c.id);
        c.online_ds = upd.online_ds;
        out.ds++;
      } catch (e) { out.erros.push({ culto: c.id, metrica: 'ds', msg: e.message }); }
    }



    if ((!c.online_ddus || c.online_ddus === 0) && diasDesdeData(c.data) >= 7 && c.online_ds != null) {
      try {
        const st = await yt.fetchVideoStatistics(null, c.youtube_video_id);
        const upd = { online_ddus: Math.max(0, (st?.viewCount ?? 0) - (c.online_ds || 0)) };
        try {
          const a = await yt.fetchVideoViews(null, c.youtube_video_id, inicioDplus1, fimDplus7);
          upd.online_watch_minutes_ddus = Math.round(a.watch_minutes || 0) || null;
          upd.online_retencao_pct_ddus = a.avg_view_percentage ? Number(a.avg_view_percentage.toFixed(2)) : null;
        } catch {                             }
        await supabase.from('cultos').update(upd).eq('id', c.id);
        out.ddus++;
      } catch (e) { out.erros.push({ culto: c.id, metrica: 'ddus', msg: e.message }); }
    }


    if (c.online_subs_ganhos === null || c.online_subs_ganhos === undefined) {
      try {
        const stats = await yt.fetchVideoSubsChange(null, c.youtube_video_id, inicioD, fimDplus7);
        await supabase.from('cultos').update({
          online_subs_ganhos: stats.gained,
          online_subs_perdidos: stats.lost,
        }).eq('id', c.id);
        out.subs++;
      } catch (e) { out.erros.push({ culto: c.id, metrica: 'subs', msg: e.message }); }
    }


    try {
      const { count } = await supabase
        .from('online_video_trafico')
        .select('video_id', { count: 'exact', head: true })
        .eq('video_id', c.youtube_video_id);
      if (!count || count === 0) {
        const fontes = await yt.fetchVideoTrafficSources(null, c.youtube_video_id, inicioD, fimDplus7);
        if (fontes.length) {
          const rows = fontes.map(f => ({
            video_id: c.youtube_video_id,
            fonte: f.fonte,
            views: f.views,
            watch_minutes: f.watch_minutes,
            periodo_inicio: inicioD,
            periodo_fim: fimDplus7,
            collected_at: new Date().toISOString(),
          }));
          await supabase.from('online_video_trafico').upsert(rows, { onConflict: 'video_id,fonte' });
          out.trafico++;
        }
      }
    } catch (e) { out.erros.push({ culto: c.id, metrica: 'trafico', msg: e.message }); }


    try {
      const { count } = await supabase
        .from('online_video_retencao_curva')
        .select('video_id', { count: 'exact', head: true })
        .eq('video_id', c.youtube_video_id);
      if (!count || count === 0) {
        const curva = await yt.fetchVideoRetentionCurve(null, c.youtube_video_id, inicioD, fimDplus7);
        if (curva.length) {
          const rows = curva.map(p => ({
            video_id: c.youtube_video_id,
            ratio_pct: p.ratio_pct,
            audience_watch_ratio: p.audience_watch_ratio,
            periodo_inicio: inicioD,
            periodo_fim: fimDplus7,
            collected_at: new Date().toISOString(),
          }));
          await supabase.from('online_video_retencao_curva').upsert(rows, { onConflict: 'video_id,ratio_pct' });
          out.retencao_curva++;
        }
      }
    } catch (e) { out.erros.push({ culto: c.id, metrica: 'retencao_curva', msg: e.message }); }


    if (c.online_views_inscritos === null || c.online_views_inscritos === undefined) {
      try {
        const stats = await yt.fetchVideoViewsBySubStatus(null, c.youtube_video_id, inicioD, fimDplus7);
        await supabase.from('cultos').update({
          online_views_inscritos: stats.subscribed,
          online_views_nao_inscritos: stats.unsubscribed,
        }).eq('id', c.id);
        out.sub_status++;
      } catch (e) { out.erros.push({ culto: c.id, metrica: 'sub_status', msg: e.message }); }
    }
  }

  return { ok: true, processados: cultos.length, remaining, ...out };
}














async function engajamentoCollector({ ano, mesesRecentes } = {}) {
  const hoje = new Date();
  const anoAtual = hoje.getUTCFullYear();
  const anoAlvo = Number(ano) || anoAtual;

  const ultimoMes = anoAlvo < anoAtual ? 11 : hoje.getUTCMonth();

  let meses = [];
  for (let m = 0; m <= ultimoMes; m++) meses.push(m);
  if (mesesRecentes && mesesRecentes > 0) meses = meses.slice(-mesesRecentes);


  const ontem = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate() - 1));

  const resultados = [];
  let coletados = 0;
  for (const m of meses) {
    const inicio = new Date(Date.UTC(anoAlvo, m, 1));
    const fimMes = new Date(Date.UTC(anoAlvo, m + 1, 0));
    const fim = fimMes > ontem ? ontem : fimMes;
    if (fim < inicio) continue;
    const startDate = fmtData(inicio);
    const endDate = fmtData(fim);
    const mesIso = `${anoAlvo}-${String(m + 1).padStart(2, '0')}-01`;

    try {
      const e = await yt.fetchChannelEngagement(null, startDate, endDate);
      const retencao = e.views > 0 ? Number((e.avg_view_percentage || 0).toFixed(2)) : null;
      const compart = e.views > 0 ? Number(((e.shares / e.views) * 100).toFixed(2)) : null;
      const cliques = (e.card_impressions && e.card_impressions > 0)
        ? Number(((e.card_clicks / e.card_impressions) * 100).toFixed(2)) : null;

      const obs = `views ${e.views} · shares ${e.shares}`
        + (e.card_impressions != null
            ? ` · cards ${e.card_clicks}/${e.card_impressions}`
            : ` · cards: ${e.card_error ? 'erro' : 'sem dado'}`)
        + ` · janela ${startDate}..${endDate}`;

      const { error } = await supabase.from('online_engajamento').upsert({
        mes: mesIso,
        retencao_media_pct: retencao,
        taxa_compartilhamento_pct: compart,
        cliques_series_pct: cliques,
        fonte: 'youtube_api',
        observacao: obs,
        collected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'mes' });
      if (error) throw error;

      coletados++;
      resultados.push({
        mes: mesIso, retencao, compartilhamento: compart, cliques_series: cliques,
        views: e.views, shares: e.shares,
        cards: e.card_impressions != null ? `${e.card_clicks}/${e.card_impressions}` : null,
      });
    } catch (err) {
      resultados.push({ mes: mesIso, error: (err.message || String(err)).slice(0, 160) });
    }
  }
  return { ok: true, ano: anoAlvo, processados: meses.length, coletados, resultados };
}



function dsJaDeviaTerColetado(dataCulto, agora = new Date()) {
  const dt = new Date(`${dataCulto}T00:00:00`);
  const dias = Math.floor((agora.getTime() - dt.getTime()) / 86400000);
  if (dias >= 2) return true;
  if (dias < 1) return false;
  return agora.getUTCHours() >= DS_CRON_HORA_UTC;
}











async function verificarColetaOnline() {
  const hojeStr = fmtData(new Date());
  const ontemStr = fmtData(dataMaisDias(new Date(), -1));
  const anteontemStr = fmtData(dataMaisDias(new Date(), -2));


  const { data: tokenRow } = await supabase
    .from('online_oauth_tokens')
    .select('channel_id, refresh_token, revoked_at, last_error, last_check_at, expires_at')
    .is('revoked_at', null)
    .maybeSingle();

  let token;
  if (!tokenRow || !tokenRow.refresh_token) {
    token = { conectado: false, degradado: false, motivo: 'desconectado' };
  } else if (tokenRow.last_error) {
    token = { conectado: true, degradado: true, motivo: 'erro_recente', last_error: tokenRow.last_error };
  } else {
    token = { conectado: true, degradado: false, motivo: 'ok' };
  }


  const { data: cultos } = await supabase
    .from('cultos')
    .select('id, data, youtube_video_id, online_pico, online_ds, decisoes_online, online_decisoes_chat, vol_service_types(name, has_online)')
    .in('data', [anteontemStr, ontemStr])
    .lt('data', hojeStr)
    .order('data', { ascending: false });

  const problemas = [];
  const decisoesPendentes = [];
  let verificados = 0;
  for (const c of (cultos || [])) {
    const st = c.vol_service_types;
    if (!st?.has_online) continue;
    verificados++;
    const faltando = [];
    if (!c.youtube_video_id) faltando.push('video_id (live não detectada)');
    if (!c.online_pico || c.online_pico === 0) faltando.push('pico de audiencia');



    if ((!c.online_ds || c.online_ds === 0) && dsJaDeviaTerColetado(c.data)) {
      faltando.push('views D+1 (DS)');
    }
    if (faltando.length) {
      problemas.push({ id: c.id, nome: st.name || 'Culto', data: c.data, faltando });
    }


    if (c.decisoes_online === null || c.decisoes_online === undefined) {
      decisoesPendentes.push({
        id: c.id, nome: st.name || 'Culto', data: c.data,
        chat_detectou: c.online_decisoes_chat || 0,
      });
    }
  }

  return {
    ok: token.conectado && problemas.length === 0 && decisoesPendentes.length === 0,
    data_referencia: ontemStr,
    token,
    problemas,
    decisoesPendentes,
    verificados,
  };
}

















async function viewsDiaCollector({ dias = 5 } = {}) {
  const hoje = new Date();
  const fim = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate() - 1));
  const n = Math.min(Math.max(Number(dias) || 5, 1), 400);
  const inicio = new Date(Date.UTC(fim.getUTCFullYear(), fim.getUTCMonth(), fim.getUTCDate() - (n - 1)));

  const startDate = fmtData(inicio);
  const endDate = fmtData(fim);

  let linhas;
  try {
    linhas = await yt.fetchChannelViewsPorDia(null, startDate, endDate);
  } catch (err) {


    return { ok: false, erro: (err.message || String(err)).slice(0, 200), janela: `${startDate}..${endDate}` };
  }

  if (!linhas || linhas.length === 0) {
    return { ok: true, coletados: 0, janela: `${startDate}..${endDate}`, aviso: 'Analytics não devolveu nenhum dia' };
  }

  const agora = new Date().toISOString();
  const payload = linhas
    .filter((l) => l && typeof l.dia === 'string' && Number.isFinite(Number(l.views)))
    .map((l) => ({
      data: l.dia,
      views: Math.max(0, Math.round(Number(l.views))),
      watch_minutos: Number.isFinite(Number(l.watch_minutos)) ? Math.max(0, Math.round(Number(l.watch_minutos))) : null,
      coletado_em: agora,
    }));

  if (payload.length === 0) {
    return { ok: true, coletados: 0, janela: `${startDate}..${endDate}`, aviso: 'nenhuma linha legível' };
  }

  const { error } = await supabase
    .from('online_canal_views_dia')
    .upsert(payload, { onConflict: 'data' });
  if (error) {
    return { ok: false, erro: error.message.slice(0, 200), janela: `${startDate}..${endDate}` };
  }

  return {
    ok: true,
    coletados: payload.length,
    janela: `${startDate}..${endDate}`,
    total_views: payload.reduce((a, b) => a + b.views, 0),
  };
}
module.exports = {
  liveMonitor, dsCollector, ddusCollector, subsCollector,
  traficoCollector, retencaoCurvaCollector, subStatusCollector,
  backfillCultoVideoIds, catchUpMetricas, backfillRange,
  engajamentoCollector, viewsDiaCollector,
  verificarColetaOnline, findCultoAtual,
  dsJaDeviaTerColetado,
};
