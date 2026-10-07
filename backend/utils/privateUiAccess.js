function emailNaLista(email, envName) {
  if (typeof email !== 'string' || !email.trim()) return false;
  const values = (process.env[envName] || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
  return values.includes(email.toLowerCase());
}
function privateUiAccess(email) {
  return {
    isDev: emailNaLista(email, 'UI_DEV_EMAILS'),
    financeiroSaidas: emailNaLista(email, 'FIN_SAIDAS_EMAILS'),
    monitor: emailNaLista(email, 'MONITOR_OWNER_EMAIL'),
  };
}
module.exports = { emailNaLista, privateUiAccess };
