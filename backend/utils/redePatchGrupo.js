




























const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;






function patchRedeGrupo(body) {
  const d = body || {};
  const bruto = typeof d.rede_id === 'string' ? d.rede_id.trim() : d.rede_id;
  if (typeof bruto === 'string' && UUID.test(bruto)) return { rede_id: bruto };

  if (d.rede_limpar === true) return { rede_id: null };
  return {};
}

module.exports = { patchRedeGrupo };
