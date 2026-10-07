

























function ehFotoDeVerdade(u) {
  return !!u && /\/uploads\/person\//.test(String(u));
}






function fotoDoPerfil(vp) {
  if (!vp) return null;
  const m = Array.isArray(vp.membro) ? vp.membro[0] : vp.membro;
  const nossa = (m && m.foto_url) || null;
  if (nossa) return nossa;
  return ehFotoDeVerdade(vp.avatar_url) ? vp.avatar_url : null;
}

const LOTE_IDS = 200;












async function mapaDeFotos(db, ids) {
  const alvo = [...new Set((ids || []).filter(Boolean))];
  const mapa = {};
  for (let i = 0; i < alvo.length; i += LOTE_IDS) {
    const { data, error } = await db.from('vol_profiles')
      .select('id, avatar_url, membresia_id, membro:mem_membros(foto_url)')
      .in('id', alvo.slice(i, i + LOTE_IDS));
    if (error) { console.error('[foto-voluntario]', error.message); continue; }
    for (const vp of data || []) mapa[vp.id] = fotoDoPerfil(vp);
  }
  return mapa;
}

module.exports = { ehFotoDeVerdade, fotoDoPerfil, mapaDeFotos };
