






















const PAGINA = 1000;

const LOTE_IDS = 200;







async function contarInscritosVivos(db, eventoIds) {
  const contagem = new Map();
  const ids = [...new Set((eventoIds || []).filter(Boolean))];
  if (!ids.length) return contagem;

  for (let i = 0; i < ids.length; i += LOTE_IDS) {
    const lote = ids.slice(i, i + LOTE_IDS);
    for (let off = 0; ; off += PAGINA) {

      const { data, error } = await db.from('inscricoes')
        .select('evento_id')
        .in('evento_id', lote)
        .is('deleted_at', null)
        .range(off, off + PAGINA - 1);
      if (error) throw error;
      for (const r of (data || [])) {
        contagem.set(r.evento_id, (contagem.get(r.evento_id) || 0) + 1);
      }
      if (!data || data.length < PAGINA) break;
    }
  }
  return contagem;
}

module.exports = { contarInscritosVivos, PAGINA, LOTE_IDS };
