



















const { supabase } = require('../utils/supabase');

const OAUTH_BASE = 'https://accounts.google.com/o/oauth2';
const TOKEN_URL  = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const DATA_API   = 'https://www.googleapis.com/youtube/v3';
const ANALYTICS  = 'https://youtubeanalytics.googleapis.com/v2';






const CBRIO_CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID || 'UCfjMVzaYlCS_VE3JuEJj2vQ';

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/yt-analytics.readonly',
];

function getCreds() {
  const id = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const secret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!id || !secret) throw new Error('GOOGLE_OAUTH_CLIENT_ID/SECRET não configurados');
  return { id, secret };
}





function getAuthUrl(state, redirectUri) {
  const { id } = getCreds();
  const params = new URLSearchParams({
    client_id: id,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `${OAUTH_BASE}/v2/auth?${params}`;
}

async function exchangeCode(code, redirectUri) {
  const { id, secret } = getCreds();
  const body = new URLSearchParams({
    code,
    client_id: id,
    client_secret: secret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`OAuth exchange falhou: ${res.status} ${t.slice(0, 200)}`);
  }
  const data = await res.json();







  let channel = { id: CBRIO_CHANNEL_ID, title: 'CBRio (via permissoes)' };
  try {
    const ch = await fetch(`${DATA_API}/channels?part=snippet&mine=true`, {
      headers: { Authorization: `Bearer ${data.access_token}` },
    });
    if (ch.ok) {
      const chData = await ch.json();
      const item = (chData.items || [])[0];
      if (item) {



        if (item.id === CBRIO_CHANNEL_ID) {
          channel = { id: item.id, title: item.snippet?.title || null };
        }
      }
    }
  } catch {                                                      }

  return { tokens: data, channel };
}

async function refreshAccessToken(refreshToken) {
  const { id, secret } = getCreds();
  const body = new URLSearchParams({
    client_id: id,
    client_secret: secret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Refresh token falhou: ${res.status} ${t.slice(0, 200)}`);
  }
  return res.json();
}

async function revoke(token) {
  const res = await fetch(`${REVOKE_URL}?token=${encodeURIComponent(token)}`, { method: 'POST' });
  return res.ok;
}





async function saveTokens({ channel, tokens, userId }) {
  const expiresAt = new Date(Date.now() + (tokens.expires_in - 60) * 1000).toISOString();
  const { error } = await supabase.from('online_oauth_tokens').upsert({
    channel_id: channel.id,
    channel_title: channel.title,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: expiresAt,
    scope: tokens.scope,
    connected_by: userId || null,
    connected_at: new Date().toISOString(),
    refreshed_at: new Date().toISOString(),
    revoked_at: null,
    last_error: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'channel_id' });
  if (error) throw error;
}

async function getValidAccessToken(channelId) {
  let q = supabase.from('online_oauth_tokens').select('*').is('revoked_at', null);
  if (channelId) q = q.eq('channel_id', channelId);
  else q = q.order('connected_at', { ascending: false }).limit(1);
  const { data, error } = await q.maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Sem canal conectado · conecte em /ministerial/online');

  const isExpired = !data.expires_at || new Date(data.expires_at) <= new Date(Date.now() + 60_000);
  if (!isExpired) return { token: data.access_token, channel_id: data.channel_id };


  try {
    const refreshed = await refreshAccessToken(data.refresh_token);
    const expiresAt = new Date(Date.now() + (refreshed.expires_in - 60) * 1000).toISOString();
    await supabase.from('online_oauth_tokens').update({
      access_token: refreshed.access_token,
      expires_at: expiresAt,
      refreshed_at: new Date().toISOString(),
      last_error: null,
      updated_at: new Date().toISOString(),
    }).eq('channel_id', data.channel_id);
    return { token: refreshed.access_token, channel_id: data.channel_id };
  } catch (e) {

    await supabase.from('online_oauth_tokens').update({
      revoked_at: new Date().toISOString(),
      last_error: e.message,
      updated_at: new Date().toISOString(),
    }).eq('channel_id', data.channel_id);
    throw new Error('Token revogado · reconecte canal em /ministerial/online');
  }
}

async function disconnect(channelId) {
  const { data } = await supabase.from('online_oauth_tokens')
    .select('refresh_token').eq('channel_id', channelId).maybeSingle();
  if (data?.refresh_token) await revoke(data.refresh_token).catch(() => {});
  await supabase.from('online_oauth_tokens').update({
    revoked_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('channel_id', channelId);
}






async function findActiveBroadcast(channelId) {
  const { token } = await getValidAccessToken(channelId);
  const url = `${DATA_API}/liveBroadcasts?part=id,snippet,status&broadcastStatus=active&broadcastType=all`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {


    const t = await res.text();
    throw new Error(`liveBroadcasts.list falhou: ${res.status} ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  const item = (data.items || [])[0];
  if (!item) return null;
  return {
    broadcast_id: item.id,
    video_id: item.id,
    title: item.snippet?.title,
    started_at: item.snippet?.actualStartTime || item.snippet?.scheduledStartTime,
    live_chat_id: item.snippet?.liveChatId || null,
  };
}




async function fetchLiveChatMessages(channelId, liveChatId, pageToken) {
  const { token } = await getValidAccessToken(channelId);
  let url = `${DATA_API}/liveChat/messages?part=snippet&liveChatId=${encodeURIComponent(liveChatId)}&maxResults=200`;
  if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`liveChat.messages falhou: ${res.status} ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  const mensagens = (data.items || []).map(
    (it) => it.snippet?.displayMessage || it.snippet?.textMessageDetails?.messageText || ''
  );
  return { mensagens, nextPageToken: data.nextPageToken || null };
}


async function fetchLiveConcurrentViewers(channelId, videoId) {
  const { token } = await getValidAccessToken(channelId);
  const url = `${DATA_API}/videos?part=liveStreamingDetails&id=${videoId}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  const data = await res.json();
  const item = (data.items || [])[0];
  if (!item) return null;
  const viewers = item.liveStreamingDetails?.concurrentViewers;
  return viewers ? parseInt(viewers, 10) : null;
}














async function fetchLiveSnapshot(channelId, videoId) {
  const { token } = await getValidAccessToken(channelId);
  const url = `${DATA_API}/videos?part=liveStreamingDetails,statistics&id=${videoId}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  const data = await res.json();
  const item = (data.items || [])[0];
  if (!item) return null;
  const v = item.liveStreamingDetails?.concurrentViewers;
  const vc = item.statistics?.viewCount;
  return {
    viewers: v ? parseInt(v, 10) : null,
    viewCount: vc !== undefined && vc !== null ? parseInt(vc, 10) : null,
  };
}





async function fetchVideoStatistics(channelId, videoId) {
  const { token } = await getValidAccessToken(channelId);
  const url = `${DATA_API}/videos?part=statistics&id=${videoId}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`videos.statistics falhou: ${res.status} ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  const item = (data.items || [])[0];
  if (!item) return null;
  const s = item.statistics || {};
  return {
    viewCount: s.viewCount != null ? parseInt(s.viewCount, 10) : null,
    likeCount: s.likeCount != null ? parseInt(s.likeCount, 10) : null,
    commentCount: s.commentCount != null ? parseInt(s.commentCount, 10) : null,
  };
}



async function fetchVideoViews(channelId, videoId, startDate, endDate) {
  const { token, channel_id } = await getValidAccessToken(channelId);
  const params = new URLSearchParams({
    ids: `channel==${channel_id}`,
    startDate,
    endDate,
    metrics: 'views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage',
    filters: `video==${videoId}`,
  });
  const res = await fetch(`${ANALYTICS}/reports?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Analytics views falhou: ${res.status} ${t.slice(0, 200)}`);
  }
  const data = await res.json();

  const row = (data.rows || [])[0];
  if (!row) return { views: 0, watch_minutes: 0, avg_duration_seconds: 0, avg_view_percentage: 0 };
  return {
    views: row[0] || 0,
    watch_minutes: row[1] || 0,
    avg_duration_seconds: row[2] || 0,
    avg_view_percentage: row[3] || 0,
  };
}



async function fetchVideoSubsChange(channelId, videoId, startDate, endDate) {
  const { token, channel_id } = await getValidAccessToken(channelId);
  const params = new URLSearchParams({
    ids: `channel==${channel_id}`,
    startDate,
    endDate,
    metrics: 'subscribersGained,subscribersLost',
    filters: `video==${videoId}`,
  });
  const res = await fetch(`${ANALYTICS}/reports?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Analytics subs falhou: ${res.status} ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  const row = (data.rows || [])[0];
  if (!row) return { gained: 0, lost: 0 };
  return { gained: row[0] || 0, lost: row[1] || 0 };
}



async function fetchVideoTrafficSources(channelId, videoId, startDate, endDate) {
  const { token, channel_id } = await getValidAccessToken(channelId);
  const params = new URLSearchParams({
    ids: `channel==${channel_id}`,
    startDate,
    endDate,
    metrics: 'views,estimatedMinutesWatched',
    dimensions: 'insightTrafficSourceType',
    filters: `video==${videoId}`,
    maxResults: '25',
  });
  const res = await fetch(`${ANALYTICS}/reports?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Analytics trafego falhou: ${res.status} ${t.slice(0, 200)}`);
  }
  const data = await res.json();

  return (data.rows || []).map(row => ({
    fonte: row[0] || 'UNKNOWN',
    views: row[1] || 0,
    watch_minutes: Math.round(row[2] || 0),
  }));
}





async function fetchVideoRetentionCurve(channelId, videoId, startDate, endDate) {
  const { token, channel_id } = await getValidAccessToken(channelId);
  const params = new URLSearchParams({
    ids: `channel==${channel_id}`,
    startDate,
    endDate,
    metrics: 'audienceWatchRatio',
    dimensions: 'elapsedVideoTimeRatio',
    filters: `video==${videoId}`,
    maxResults: '101',
  });
  const res = await fetch(`${ANALYTICS}/reports?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Analytics retencao curva falhou: ${res.status} ${t.slice(0, 200)}`);
  }
  const data = await res.json();

  return (data.rows || []).map(row => ({
    ratio_pct: Math.round((row[0] || 0) * 100),
    audience_watch_ratio: Number((row[1] || 0).toFixed(4)),
  }));
}








async function fetchLivePeakConcurrentViewers(channelId, videoId, startDate, endDate) {
  const { token, channel_id } = await getValidAccessToken(channelId);










  const endMais1 = (() => {
    const d = new Date(`${endDate}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  })();





  const shapes = [
    { metrics: 'averageConcurrentViewers,peakConcurrentViewers', dimensions: 'livestreamPosition', filters: `video==${videoId}` },
    { metrics: 'averageConcurrentViewers,peakConcurrentViewers', filters: `video==${videoId}` },
    { metrics: 'peakConcurrentViewers', dimensions: 'livestreamPosition', filters: `video==${videoId}` },
  ];

  let lastErr = null;
  for (const shape of shapes) {
    const params = new URLSearchParams({
      ids: `channel==${channel_id}`,
      startDate,
      endDate: endMais1,
      ...shape,
    });
    const res = await fetch(`${ANALYTICS}/reports?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const t = await res.text();
      lastErr = `Analytics peakConcurrentViewers falhou: ${res.status} ${t.slice(0, 200)}`;
      continue;
    }
    const data = await res.json();
    const rows = data.rows || [];
    if (!rows.length) return { peak: null, avg: null };

    const headers = (data.columnHeaders || []).map(h => h.name);
    const iPeak = headers.indexOf('peakConcurrentViewers');
    const iAvg = headers.indexOf('averageConcurrentViewers');
    if (iPeak === -1) continue;

    const peak = Math.max(...rows.map(r => Number(r[iPeak]) || 0)) || null;
    const avgVals = iAvg >= 0 ? rows.map(r => Number(r[iAvg]) || 0).filter(v => v > 0) : [];
    const avg = avgVals.length ? Math.round(avgVals.reduce((s, v) => s + v, 0) / avgVals.length) : null;
    return { peak, avg };
  }
  throw new Error(lastErr || 'Analytics peakConcurrentViewers falhou');
}




async function fetchVideoViewsBySubStatus(channelId, videoId, startDate, endDate) {
  const { token, channel_id } = await getValidAccessToken(channelId);
  const params = new URLSearchParams({
    ids: `channel==${channel_id}`,
    startDate,
    endDate,
    metrics: 'views',
    dimensions: 'subscribedStatus',
    filters: `video==${videoId}`,
  });
  const res = await fetch(`${ANALYTICS}/reports?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Analytics subStatus falhou: ${res.status} ${t.slice(0, 200)}`);
  }
  const data = await res.json();

  const out = { subscribed: 0, unsubscribed: 0 };
  for (const row of (data.rows || [])) {
    if (row[0] === 'SUBSCRIBED') out.subscribed = row[1] || 0;
    else if (row[0] === 'UNSUBSCRIBED') out.unsubscribed = row[1] || 0;
  }
  return out;
}











async function fetchChannelEngagement(channelId, startDate, endDate) {
  const { token, channel_id } = await getValidAccessToken(channelId);


  const coreParams = new URLSearchParams({
    ids: `channel==${channel_id}`,
    startDate,
    endDate,
    metrics: 'views,shares,averageViewPercentage',
  });
  const coreRes = await fetch(`${ANALYTICS}/reports?${coreParams}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!coreRes.ok) {
    const t = await coreRes.text();
    throw new Error(`Analytics engajamento (core) falhou: ${coreRes.status} ${t.slice(0, 200)}`);
  }
  const coreData = await coreRes.json();
  const coreRow = (coreData.rows || [])[0] || [0, 0, 0];


  let card_impressions = null;
  let card_clicks = null;
  let card_error = null;
  try {
    const cardParams = new URLSearchParams({
      ids: `channel==${channel_id}`,
      startDate,
      endDate,
      metrics: 'cardImpressions,cardClicks',
    });
    const cardRes = await fetch(`${ANALYTICS}/reports?${cardParams}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (cardRes.ok) {
      const cardData = await cardRes.json();
      const cardRow = (cardData.rows || [])[0] || [0, 0];
      card_impressions = cardRow[0] || 0;
      card_clicks = cardRow[1] || 0;
    } else {
      card_error = `${cardRes.status} ${(await cardRes.text()).slice(0, 120)}`;
    }
  } catch (e) {
    card_error = e.message;
  }

  return {
    views: coreRow[0] || 0,
    shares: coreRow[1] || 0,
    avg_view_percentage: coreRow[2] || 0,
    card_impressions,
    card_clicks,
    card_error,
  };
}





async function listAuthorizedChannels() {
  const { token } = await getValidAccessToken();
  const url = `${DATA_API}/channels?part=id,snippet,statistics&mine=true&maxResults=10`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Channels mine falhou: ${res.status} ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  return (data.items || []).map(c => ({
    id: c.id,
    title: c.snippet?.title,
    subscriber_count: parseInt(c.statistics?.subscriberCount || '0', 10),
    video_count: parseInt(c.statistics?.videoCount || '0', 10),
  }));
}



async function debugAnalyticsCall(videoId, startDate, endDate) {
  const { token, channel_id } = await getValidAccessToken();
  const params = new URLSearchParams({
    ids: `channel==${channel_id}`,
    startDate,
    endDate,
    metrics: 'views,estimatedMinutesWatched,averageViewPercentage,subscribersGained',
    filters: `video==${videoId}`,
  });
  const url = `${ANALYTICS}/reports?${params}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 500) }; }
  return {
    request: {
      channel_id_oauth: channel_id,
      url: url.replace(token, 'TOKEN_REDACTED'),
      startDate,
      endDate,
      filter: `video==${videoId}`,
    },
    response: {
      status: res.status,
      ok: res.ok,
      body,
    },
    interpretacao: !res.ok
      ? `ERRO HTTP ${res.status} · ${body?.error?.message || 'sem detalhe'}`
      : !body.rows || body.rows.length === 0
      ? 'ROWS VAZIO · conta OAuth provavelmente não gerencia o canal dono deste vídeo, OU vídeo não existe nessa data range'
      : 'OK · veio dado',
  };
}






















async function fetchChannelViewsPorDia(channelId, startDate, endDate) {
  const { token, channel_id } = await getValidAccessToken(channelId);
  const params = new URLSearchParams({
    ids: `channel==${channel_id}`,
    startDate,
    endDate,
    metrics: 'views,estimatedMinutesWatched',
    dimensions: 'day',
    sort: 'day',
  });
  const res = await fetch(`${ANALYTICS}/reports?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Analytics views/dia falhou: ${res.status} ${t.slice(0, 200)}`);
  }
  const data = await res.json();

  return (data.rows || []).map((row) => ({
    dia: row[0],
    views: row[1] || 0,
    watch_minutos: row[2] || 0,
  }));
}
module.exports = {
  SCOPES,
  getAuthUrl,
  exchangeCode,
  saveTokens,
  getValidAccessToken,
  disconnect,
  findActiveBroadcast,
  fetchLiveChatMessages,
  fetchLiveConcurrentViewers,
  fetchLiveSnapshot,
  fetchVideoStatistics,
  fetchLivePeakConcurrentViewers,
  fetchVideoViews,
  fetchVideoSubsChange,
  fetchVideoTrafficSources,
  fetchVideoRetentionCurve,
  fetchVideoViewsBySubStatus,
  fetchChannelEngagement,
  fetchChannelViewsPorDia,
  listAuthorizedChannels,
  debugAnalyticsCall,
};
