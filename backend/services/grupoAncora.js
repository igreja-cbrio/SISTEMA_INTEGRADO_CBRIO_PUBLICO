

















const { supabase } = require('../utils/supabase');


async function ancorasDeGrupos(ids) {
  const out = {};
  if (!ids || !ids.length) return out;
  try {

    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await supabase.from('mem_grupo_encontros')
        .select('grupo_id, data').in('grupo_id', ids.slice(i, i + 200))
        .order('data', { ascending: false });
      if (error) throw error;

      for (const e of data || []) if (e.data && !out[e.grupo_id]) out[e.grupo_id] = String(e.data).slice(0, 10);
    }
  } catch (e) { console.warn('[grupoAncora] ancora de agenda indisponivel:', e.message); }
  return out;
}






















async function iniciosDeGrupos(ids) {
  const out = {};
  if (!ids || !ids.length) return out;
  try {
    const grupos = [];
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await supabase.from('mem_grupos')
        .select('id, temporada, created_at').in('id', ids.slice(i, i + 200));
      if (error) throw error;
      grupos.push(...(data || []));
    }
    const tempIds = [...new Set(grupos.map(g => g.temporada).filter(Boolean))];
    const inicioTemp = {};
    for (let i = 0; i < tempIds.length; i += 200) {
      const { data } = await supabase.from('mem_temporadas')
        .select('id, data_inicio').in('id', tempIds.slice(i, i + 200));
      (data || []).forEach(t => { if (t.data_inicio) inicioTemp[t.id] = String(t.data_inicio).slice(0, 10); });
    }
    for (const g of grupos) {
      const ini = (g.temporada && inicioTemp[g.temporada])
        || (g.created_at ? String(g.created_at).slice(0, 10) : null);
      if (ini) out[g.id] = ini;
    }
  } catch (e) { console.warn('[grupoAncora] inicio de grupo indisponivel:', e.message); }
  return out;
}

module.exports = { ancorasDeGrupos, iniciosDeGrupos };
