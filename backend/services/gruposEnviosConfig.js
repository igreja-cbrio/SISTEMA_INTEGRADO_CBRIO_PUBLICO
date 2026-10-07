














const { supabase } = require('../utils/supabase');

async function _cfg() {
  try {
    const { data } = await supabase.from('whatsapp_config')
      .select('id, grupos_bloqueio_total, grupos_auto_envios, updated_at').limit(1).maybeSingle();
    return data || {};
  } catch { return {}; }
}


async function bloqueioTotalAtivo() {
  const c = await _cfg();
  return c.grupos_bloqueio_total === true;
}


async function enviosAutomaticosAtivos() {
  const c = await _cfg();
  if (c.grupos_bloqueio_total === true) return false;
  return c.grupos_auto_envios === true;
}

async function getConfigEnvios() {
  const c = await _cfg();
  return {
    bloqueio_total: c.grupos_bloqueio_total === true,
    auto_frequencia: c.grupos_auto_envios === true,
    atualizado_em: c.updated_at || null,
  };
}


async function setConfigEnvios(patch, userId) {
  const { data: row } = await supabase.from('whatsapp_config').select('id').limit(1).maybeSingle();
  const upd = { updated_by: userId || null, updated_at: new Date().toISOString() };
  if ('bloqueio_total' in patch) upd.grupos_bloqueio_total = patch.bloqueio_total === true;
  if ('auto_frequencia' in patch) upd.grupos_auto_envios = patch.auto_frequencia === true;
  if (row?.id != null) await supabase.from('whatsapp_config').update(upd).eq('id', row.id);
  else await supabase.from('whatsapp_config').insert(upd);
  return getConfigEnvios();
}

module.exports = { bloqueioTotalAtivo, enviosAutomaticosAtivos, getConfigEnvios, setConfigEnvios };
