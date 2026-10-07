


























const crypto = require('crypto');

function segredo() {
  return process.env.EVENTO_CHECKIN_TOKEN_SECRET || process.env.CRON_SECRET || null;
}

function assinar(idNorm, sec) {
  return crypto.createHmac('sha256', sec)
    .update(`evento-checkin:${idNorm}`).digest('hex').slice(0, 20);
}


function gerarTokenCheckin(eventoId) {
  const sec = segredo();
  const idNorm = String(eventoId || '').replace(/-/g, '').toLowerCase();
  if (!sec || !/^[0-9a-f]{32}$/.test(idNorm)) return null;
  return `${idNorm}.${assinar(idNorm, sec)}`;
}


function verificarTokenCheckin(token) {
  const sec = segredo();
  if (!sec) return null;
  const m = /^([0-9a-f]{32})\.([0-9a-f]{20})$/.exec(String(token || '').trim().toLowerCase());
  if (!m) return null;
  const esperado = assinar(m[1], sec);
  if (!crypto.timingSafeEqual(Buffer.from(m[2]), Buffer.from(esperado))) return null;
  return `${m[1].slice(0, 8)}-${m[1].slice(8, 12)}-${m[1].slice(12, 16)}-${m[1].slice(16, 20)}-${m[1].slice(20)}`;
}


function montarLinkCheckin(eventoId, baseUrl) {
  const t = gerarTokenCheckin(eventoId);
  if (!t) return null;
  const base = String(baseUrl || 'https://www.cbrio.org').replace(/\/+$/, '');
  return `${base}/ec/${t}`;
}

module.exports = { gerarTokenCheckin, verificarTokenCheckin, montarLinkCheckin };
