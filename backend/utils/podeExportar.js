















function podeExportar(user, modulo) {
  if (!user || !modulo) return false;
  if (user.is_super_admin === true) return true;
  if (user.role === 'admin' || user.role === 'diretor') return true;
  const perms = user.granular?.modulePerms;
  if (!perms || typeof perms !== 'object') return false;



  const entry = perms[modulo] || perms[String(modulo).toLowerCase()];
  return entry?.pode_exportar === true;
}

module.exports = { podeExportar };
