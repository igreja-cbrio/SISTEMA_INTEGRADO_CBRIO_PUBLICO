





















const { supabase } = require('../utils/supabase');





async function apagarEncontroGrupo(encontroId) {
  const { data: presencas, error: eP } = await supabase.from('mem_grupo_encontro_presencas')
    .select('membro_id, mem_grupo_encontros!inner(grupo_id)')
    .eq('encontro_id', encontroId);
  if (eP) throw eP;

  const grupoId = presencas?.[0]?.mem_grupo_encontros?.grupo_id;


  if (grupoId && presencas?.length) {
    for (const p of presencas) {
      if (!p.membro_id) continue;
      await supabase.rpc('decrementar_presenca_grupo_membro', {
        p_grupo_id: grupoId, p_membro_id: p.membro_id,
      }).catch((e) => console.warn('[grupoEncontroApagar] decremento:', e.message));
    }
  }

  const { error } = await supabase.from('mem_grupo_encontros').delete().eq('id', encontroId);
  if (error) throw error;
  return { ok: true, presentes: (presencas || []).length };
}

module.exports = { apagarEncontroGrupo };
