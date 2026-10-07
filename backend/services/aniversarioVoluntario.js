




















const { supabase } = require('../utils/supabase');

const CONTEXTO = 'app.aniversario';


function anoBrt(agora = new Date()) {
  return new Date(agora.getTime() - 3 * 3600 * 1000).getUTCFullYear();
}

















async function jaParabenizado({ membroId, volProfileId, ano = anoBrt() }) {
  try {
    if (membroId) {
      const { data } = await supabase
        .from('whatsapp_envios')
        .select('id')
        .eq('contexto', CONTEXTO)
        .eq('ref_id', membroId)
        .eq('status', 'enviado')
        .gte('criado_em', `${ano}-01-01T00:00:00Z`)
        .lt('criado_em', `${ano + 1}-01-01T00:00:00Z`)
        .limit(1);
      if (data?.length) return true;
    }
    if (volProfileId) {
      const { data } = await supabase
        .from('vol_parabens')
        .select('vol_profile_id')
        .eq('vol_profile_id', volProfileId)
        .eq('ano', ano)
        .eq('resultado', 'enviado')
        .limit(1);
      if (data?.length) return true;
    }
    return false;
  } catch (e) {
    console.warn('[aniversario] jaParabenizado:', e.message);
    return false;
  }
}


async function volProfileDoMembro(membroId) {
  try {
    const { data } = await supabase
      .from('vol_profiles').select('id')
      .eq('membresia_id', membroId).limit(1);
    return data?.[0]?.id || null;
  } catch {
    return null;
  }
}







async function registrarParabens({ volProfileId, ano = anoBrt(), porUserId = null, resultado = 'enviado' }) {
  if (!volProfileId) return { skipped: 'sem_vol_profile' };
  try {
    const { error } = await supabase.from('vol_parabens').upsert({
      vol_profile_id: volProfileId,
      ano,
      enviado_em: new Date().toISOString(),
      enviado_por: porUserId,
      resultado,
    }, { onConflict: 'vol_profile_id,ano' });
    if (error) throw error;
    return { ok: true };
  } catch (e) {
    console.warn('[aniversario] registrarParabens:', e.message);
    return { error: e.message };
  }
}

module.exports = { CONTEXTO, anoBrt, jaParabenizado, volProfileDoMembro, registrarParabens };
