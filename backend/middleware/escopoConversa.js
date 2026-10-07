

function podeVerConversa(user, conversa) {
  const id = user?.userId || user?.id;
  if (!id || !conversa || conversa.deleted_at) return false;
  if (['admin', 'diretor'].includes(user.role)) return true;
  const areas = Array.isArray(user.granular?.areas) ? user.granular.areas.filter(Boolean) : [];
  return conversa.area === null || conversa.atribuido_a === id || areas.includes(conversa.area);
}
function criarEscopoConversa(db) {
  return async function escopoConversa(req, res, next) {
    const id = req.params.id;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id || '')) {
      return res.status(404).json({ error: 'Conversa não encontrada' });
    }
    try {
      const { data, error } = await db.from('wa_conversas').select('id,area,atribuido_a,deleted_at').eq('id', id).is('deleted_at', null).maybeSingle();
      if (error) throw error;
      if (!podeVerConversa(req.user, data)) return res.status(404).json({ error: 'Conversa não encontrada' });
      return next();
    } catch {
      return res.status(503).json({ error: 'Não foi possível verificar o acesso à conversa.' });
    }
  };
}
module.exports = { podeVerConversa, criarEscopoConversa };
