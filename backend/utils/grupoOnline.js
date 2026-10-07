


















function ehGrupoOnline(grupo) {
  if (!grupo) return false;
  if (grupo.bairro === 'Online') return true;
  return String(grupo.local || '').toLowerCase().includes('online');
}

module.exports = { ehGrupoOnline };
