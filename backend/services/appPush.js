




const { supabase } = require('../utils/supabase');
const { fetchAllRows } = require('../utils/pagination');

const { lotesDePush, tokenMorreu } = require('../utils/pushLotes');
const { filtrarPorApp, contarSemCarimbo } = require('../utils/appPushDestino');











const LOTE_IN = 200;

async function lerEmLotes(ids, build) {
  const out = [];
  for (let i = 0; i < ids.length; i += LOTE_IN) {
    const fatia = ids.slice(i, i + LOTE_IN);
    out.push(...(await fetchAllRows(() => build(fatia))));
  }
  return out;
}

function safeText(value, max = 500) {
  return value == null ? null : String(value).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) || null;
}

async function persistExpoTickets(items) {
  if (!items.length) return;
  const { error } = await supabase.from('system_mobile_push_tickets').insert(items);
  if (error) console.warn('[appPush] histórico de tickets:', error.message);
}


async function membrosParaUsuarios(membroIds) {
  if (!membroIds?.length) return [];
  const rows = await lerEmLotes(
    [...new Set(membroIds.filter(Boolean))],
    (fatia) => supabase.from('profiles').select('id').in('membro_id', fatia),
  );
  return rows.map((p) => p.id).filter(Boolean);
}





async function pushExpoParaUsers(userIds, { title, body, data, app } = {}) {
  try {
    const ids = [...new Set((userIds || []).filter(Boolean))];
    if (!ids.length || !title) return { enviados: 0 };





    let toks;
    try {
      toks = await lerEmLotes(
        ids,
        (fatia) => supabase.from('app_push_tokens').select('token,platform,projeto_id').in('user_id', fatia),
      );
    } catch (e) {
      if (!/projeto_id/i.test(String(e?.message || ''))) throw e;
      console.warn('[appPush] coluna projeto_id ausente — rode a migration 20260807220000');
      toks = await lerEmLotes(
        ids,
        (fatia) => supabase.from('app_push_tokens').select('token,platform').in('user_id', fatia),
      );
    }










    if (app) {
      const antes = (toks || []).length;
      toks = filtrarPorApp(toks, app);
      const semCarimbo = contarSemCarimbo(toks);
      if (antes !== toks.length || semCarimbo) {
        console.log(`[appPush] app=${app} tokens=${antes}->${toks.length} sem_carimbo=${semCarimbo}`);
      }
    }







    const lotes = lotesDePush(toks || []);
    if (!lotes.length) return { enviados: 0 };
    const totalMensagens = lotes.reduce((n, l) => n + l.length, 0);

    let aceitos = 0;
    let erros = 0;
    const mortos = [];





















    const CONCORRENCIA = 6;

    async function enviarLote(chunkTokens) {
      const chunk = chunkTokens.map((item) => ({
        to: item.token,




        sound: 'cbrio_chime.wav',
        channelId: 'default',
        title,
        body,
        data: data || {},
      }));
      try {







        const response = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(chunk),
          signal: AbortSignal.timeout(8000),
        });
        const payload = await response.json().catch(() => ({}));
        const tickets = Array.isArray(payload?.data) ? payload.data : [];
        const rows = chunkTokens.map((token, index) => {
          const ticket = tickets[index] || {};
          const accepted = response.ok && ticket.status === 'ok' && ticket.id;
          if (accepted) aceitos += 1;
          else erros += 1;
          const code = ticket.details?.error || payload?.errors?.[0]?.code || `HTTP_${response.status}`;



          if (!accepted && tokenMorreu(code)) mortos.push(token.token);
          return {
            provider_ticket_id: accepted ? safeText(ticket.id, 160) : null,
            platform: ['android', 'ios'].includes(String(token.platform).toLowerCase()) ? String(token.platform).toLowerCase() : 'unknown',
            ticket_status: accepted ? 'accepted' : 'error',
            ticket_error_code: accepted ? null : safeText(ticket.details?.error || payload?.errors?.[0]?.code || `HTTP_${response.status}`, 120),
            ticket_error_message: accepted ? null : safeText(ticket.message || payload?.errors?.[0]?.message, 500),
          };
        });
        await persistExpoTickets(rows);
      } catch (error) {
        erros += chunk.length;
        console.error('[appPush] Expo:', error.message);
        await persistExpoTickets(chunkTokens.map((token) => ({
          platform: ['android', 'ios'].includes(String(token.platform).toLowerCase()) ? String(token.platform).toLowerCase() : 'unknown',
          ticket_status: 'error',
          ticket_error_code: 'NETWORK_ERROR',
          ticket_error_message: safeText(error.message, 500),
        })));
      }
    }




    const fila = [...lotes];
    await Promise.all(
      Array.from({ length: Math.min(CONCORRENCIA, fila.length) }, async () => {
        for (let lote = fila.shift(); lote; lote = fila.shift()) {
          await enviarLote(lote);
        }
      }),
    );


    if (mortos.length) {
      const { error } = await supabase.from('app_push_tokens').delete().in('token', mortos);
      if (error) console.warn('[appPush] limpar tokens mortos:', error.message);
    }

    return { enviados: totalMensagens, aceitos, erros };
  } catch (e) {
    console.error('[appPush] pushExpoParaUsers erro:', e.message);
    return { enviados: 0 };
  }
}














async function notificarApp(userIds, payload) {
  try {
    const ids = [...new Set((userIds || []).filter(Boolean))];
    if (!ids.length) return { enviados: 0 };


    const dedup = payload.chaveDedup || null;
    const rows = ids.map((u) => ({
      user_id: u, tipo: payload.tipo, titulo: payload.titulo,
      body: payload.body, data: payload.data || {},
      ...(dedup ? { chave_dedup: dedup } : {}),
    }));






    let persistidos = 0;
    const semDedup = (ls) => ls.map(({ chave_dedup: _fora, ...r }) => r);
    const gravar = async (lote) => {


      const q = dedup
        ? supabase.from('app_notificacoes')
          .upsert(lote, { onConflict: 'user_id,chave_dedup', ignoreDuplicates: true })
        : supabase.from('app_notificacoes').insert(lote);
      return q;
    };







    const semColuna = (e) => ['42703', 'PGRST204', '42P10'].includes(e?.code);

    let { error } = await gravar(rows);
    let degradado = false;
    if (error && semColuna(error)) {




      console.warn('[appPush] sem chave_dedup (migration pendente) — gravando sem dedup');
      degradado = true;
      ({ error } = await supabase.from('app_notificacoes').insert(semDedup(rows)));
      if (!error) persistidos = rows.length;
    } else if (!error) {
      persistidos = rows.length;
    }

    if (error) {
      console.error('[appPush] insert em lote falhou:', error.code, error.message);





      const linhas = degradado ? semDedup(rows) : rows;



      const TETO_RESGATE = 25;
      for (const r of linhas.slice(0, TETO_RESGATE)) {
        const { error: e1 } = degradado
          ? await supabase.from('app_notificacoes').insert([r])
          : await gravar([r]);
        if (e1) console.warn(`[appPush] aviso perdido user=${r.user_id}: ${e1.code} ${e1.message}`);
        else persistidos += 1;
      }
      if (linhas.length > TETO_RESGATE) {
        console.warn(`[appPush] resgate parou no teto: ${linhas.length - TETO_RESGATE} avisos não gravados`);
      }
    }





    const { enviados } = await pushExpoParaUsers(ids, {
      title: payload.titulo,
      body: payload.body,
      data: { tipo: payload.tipo, ...(payload.data || {}) },
      app: 'membros',
    });
    return { enviados, persistidos };
  } catch (e) {
    console.error('[appPush] erro:', e.message);
    return { enviados: 0 };
  }
}

module.exports = { notificarApp, membrosParaUsuarios, pushExpoParaUsers };
