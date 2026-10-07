
















const { createClient } = require('@supabase/supabase-js');
const { supabase } = require('../utils/supabase');
const { notificar } = require('./notificar');

const PAGE = 1000;

function getWifiClient() {
  const url = process.env.WIFI_SUPABASE_URL;
  const key = process.env.WIFI_SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error(
      'WiFi sync não configurado: defina WIFI_SUPABASE_URL e WIFI_SUPABASE_SERVICE_KEY no Vercel.'
    );
  }
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}


async function lerTudo(client, tabela, colunas, ordemCol) {
  const linhas = [];
  let offset = 0;
  while (true) {
    const { data, error } = await client
      .from(tabela)
      .select(colunas)
      .order(ordemCol, { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`leitura ${tabela}: ${error.message}`);
    if (!data || data.length === 0) break;
    linhas.push(...data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return linhas;
}


async function upsertLote(tabela, registros) {
  let total = 0;
  for (let i = 0; i < registros.length; i += PAGE) {
    const fatia = registros.slice(i, i + PAGE);
    const { error, count } = await supabase
      .from(tabela)
      .upsert(fatia, { onConflict: 'origem_id', ignoreDuplicates: false, count: 'exact' });
    if (error) throw new Error(`upsert ${tabela}: ${error.message}`);
    total += count ?? fatia.length;
  }
  return total;
}

async function runWifiSync() {
  const inicio = new Date();
  const { data: logRow } = await supabase
    .from('wifi_sync_log')
    .insert({ iniciado_em: inicio.toISOString(), status: 'rodando' })
    .select('id')
    .single();
  const logId = logRow?.id;

  try {
    const client = getWifiClient();


    const visitantesSrc = await lerTudo(
      client, 'visitantes',
      'id,nome,cpf,email,telefone,mac_address,aceite_lgpd,data_acesso',
      'data_acesso'
    );
    const visitantesRows = visitantesSrc.map((v) => ({
      origem_id: v.id,
      nome: v.nome,
      cpf: v.cpf,
      email: v.email,
      telefone: v.telefone,
      mac_address: v.mac_address,
      aceite_lgpd: v.aceite_lgpd,
      data_acesso: v.data_acesso,
    }));
    const visitantesNovos = await upsertLote('wifi_visitantes', visitantesRows);


    const conexoesSrc = await lerTudo(
      client, 'connection_logs',
      'id,usuario,mac_address,ip_address,evento,timestamp_evento',
      'timestamp_evento'
    );
    const conexoesRows = conexoesSrc.map((c) => ({
      origem_id: c.id,
      usuario: c.usuario,
      mac_address: c.mac_address,
      ip_address: c.ip_address,
      evento: c.evento,
      timestamp_evento: c.timestamp_evento,
    }));
    const conexoesNovas = await upsertLote('wifi_conexoes', conexoesRows);



    const { data: vinc, error: rpcErr } = await supabase.rpc('fn_wifi_processar_vinculos');
    if (rpcErr) throw new Error(`processar_vinculos: ${rpcErr.message}`);
    const vinculosMembro = vinc?.vinculos_membro ?? 0;
    const visitantesCriados = vinc?.visitantes_criados ?? 0;




    const { error: ctErr } = await supabase.rpc('fn_wifi_coletar_contatos');
    if (ctErr && !/fn_wifi_coletar_contatos/.test(ctErr.message || '')) {
      console.warn('[wifiSync] coletar contatos:', ctErr.message);
    }

    await supabase.from('wifi_sync_log').update({
      finalizado_em: new Date().toISOString(),
      status: 'ok',
      visitantes_novos: visitantesNovos,
      conexoes_novas: conexoesNovas,
      vinculos_membro: vinculosMembro,
      visitantes_criados: visitantesCriados,
      detalhe: { visitantes_origem: visitantesSrc.length, conexoes_origem: conexoesSrc.length },
    }).eq('id', logId);


    if (visitantesCriados > 0) {
      try {
        await notificar({
          modulo: 'wifi',
          tipo: 'wifi_novos_visitantes',
          titulo: `${visitantesCriados} novo(s) visitante(s) recorrente(s) do WiFi`,
          mensagem: `O WiFi identificou ${visitantesCriados} pessoa(s) presente(s) em 2+ cultos que viraram visitantes na membresia.`,
          link: '/wifi',
          severidade: 'info',
          chaveDedup: `wifi_visitantes_${inicio.toISOString().slice(0, 10)}`,
        });
      } catch (e) {
        console.warn('[wifiSync] notificação falhou:', e.message);
      }
    }

    return { ok: true, visitantesNovos, conexoesNovas, vinculosMembro, visitantesCriados };
  } catch (e) {
    if (logId) {
      await supabase.from('wifi_sync_log').update({
        finalizado_em: new Date().toISOString(),
        status: 'erro',
        erro: e.message,
      }).eq('id', logId);
    }
    throw e;
  }
}

module.exports = { runWifiSync, getWifiClient };
