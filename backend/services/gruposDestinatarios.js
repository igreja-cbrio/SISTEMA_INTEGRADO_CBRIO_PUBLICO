



























const { supabase } = require('../utils/supabase');





















async function donosDoGrupo(grupoId) {
  if (!grupoId) return [];
  const { data: grupo } = await supabase
    .from('mem_grupos')
    .select('lider_id, supervisor_id')
    .eq('id', grupoId)
    .maybeSingle();
  if (!grupo) return [];

  const membros = [grupo.lider_id, grupo.supervisor_id].filter(Boolean);
  if (!membros.length) return [];

  const ids = new Set();


  const { data: profs } = await supabase
    .from('profiles')
    .select('id')
    .in('membro_id', membros)
    .eq('active', true)
    .or('is_membro_only.is.null,is_membro_only.eq.false');
  for (const p of profs || []) ids.add(p.id);


  const { data: vols } = await supabase
    .from('vol_profiles')
    .select('auth_user_id')
    .in('membresia_id', membros)
    .not('auth_user_id', 'is', null);
  const authIds = (vols || []).map(v => v.auth_user_id).filter(Boolean);
  if (authIds.length) {



    const { data: profsVol } = await supabase
      .from('profiles')
      .select('id')
      .in('id', authIds)
      .eq('active', true)
      .or('is_membro_only.is.null,is_membro_only.eq.false');
    for (const p of profsVol || []) ids.add(p.id);
  }

  return [...ids];
}































async function donosDoGrupoApp(grupoId, { incluirSupervisor = false } = {}) {
  if (!grupoId) return [];
  const { data: grupo, error: eg } = await supabase
    .from('mem_grupos')
    .select('lider_id, supervisor_id')
    .eq('id', grupoId)
    .maybeSingle();



  if (eg) throw eg;
  if (!grupo) return [];

  const membros = [grupo.lider_id, ...(incluirSupervisor ? [grupo.supervisor_id] : [])]
    .filter(Boolean);
  if (!membros.length) return [];

  const { data: profs, error } = await supabase
    .from('profiles')
    .select('id')
    .in('membro_id', membros)
    .eq('active', true);
  if (error) throw error;








  return [...new Set((profs || []).map((p) => p.id).filter(Boolean))];
}








async function donosDeVariosGrupos(grupoIds) {
  const alvo = [...new Set((grupoIds || []).filter(Boolean))];
  const mapa = new Map();
  if (!alvo.length) return mapa;

  const { data: grupos } = await supabase
    .from('mem_grupos')
    .select('id, lider_id, supervisor_id')
    .in('id', alvo);

  const membros = new Set();
  for (const g of grupos || []) {
    for (const m of [g.lider_id, g.supervisor_id]) if (m) membros.add(m);
  }
  if (!membros.size) return mapa;

  const { data: profs } = await supabase
    .from('profiles')
    .select('id, membro_id')
    .in('membro_id', [...membros])
    .eq('active', true)
    .or('is_membro_only.is.null,is_membro_only.eq.false');
  const porMembro = new Map();
  for (const p of profs || []) {
    if (!porMembro.has(p.membro_id)) porMembro.set(p.membro_id, []);
    porMembro.get(p.membro_id).push(p.id);
  }

  for (const g of grupos || []) {
    const ids = new Set();
    for (const m of [g.lider_id, g.supervisor_id]) {
      for (const pid of porMembro.get(m) || []) ids.add(pid);
    }
    if (ids.size) mapa.set(g.id, [...ids]);
  }
  return mapa;
}

module.exports = { donosDoGrupo, donosDeVariosGrupos, donosDoGrupoApp };
