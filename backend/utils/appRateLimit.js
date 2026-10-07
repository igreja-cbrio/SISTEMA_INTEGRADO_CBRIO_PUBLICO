





























const crypto = require('crypto');

const PREFIXO_ANONIMO = 'ip:';




function expandirIpv6(ip) {
  if (!/^[0-9a-fA-F:]+$/.test(ip)) return null;
  const lados = ip.split('::');
  if (lados.length > 2) return null;
  const esq = lados[0] ? lados[0].split(':').filter(Boolean) : [];
  const dir = lados.length === 2 && lados[1] ? lados[1].split(':').filter(Boolean) : [];
  if (lados.length === 1) return esq.length === 8 ? esq.map((h) => h.toLowerCase()) : null;
  const faltam = 8 - esq.length - dir.length;
  if (faltam < 0) return null;
  return [...esq, ...Array(faltam).fill('0'), ...dir].map((h) => h.toLowerCase());
}































function normalizarIpParaChave(ip) {
  const bruto = String(ip == null ? '' : ip).trim();
  if (!bruto) return 'desconhecido';
  const semZona = bruto.split('%')[0];
  if (!semZona.includes(':')) return semZona;
  const mapeado = semZona.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapeado) return mapeado[1];
  const hextets = expandirIpv6(semZona);
  return hextets ? `${hextets.slice(0, 4).join(':')}::/64` : semZona;
}






function chaveLimiteApp(req, normalizarIp = normalizarIpParaChave) {
  const userId = req?.user?.id;
  if (userId) return `u:${userId}`;

  const bruto = req?.headers?.authorization;
  const token = typeof bruto === 'string' ? bruto.replace(/^Bearer\s+/i, '').trim() : '';


  if (token.length >= 40) {
    return `t:${crypto.createHash('sha256').update(token).digest('hex').slice(0, 32)}`;
  }

  const ip = req?.ip || 'desconhecido';
  return `${PREFIXO_ANONIMO}${typeof normalizarIp === 'function' ? normalizarIp(ip) : ip}`;
}


function ehChaveAnonima(chave) {
  return String(chave || '').startsWith(PREFIXO_ANONIMO);
}

module.exports = { chaveLimiteApp, ehChaveAnonima, normalizarIpParaChave, PREFIXO_ANONIMO };
