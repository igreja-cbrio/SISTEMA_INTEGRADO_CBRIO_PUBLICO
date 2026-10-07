








const crypto = require('crypto');






function segredo() {
  return process.env.GRUPOS_TOKEN_SECRET || process.env.CRON_SECRET || '';
}

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;








const APROV_TTL_MS = 30 * 24 * 60 * 60 * 1000;




const RENOV_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const CONFIRA_TTL_MS = 30 * 24 * 60 * 60 * 1000;
































function assinarToken(tipo, pedidoId, extra, ttlMs, agora = Date.now()) {
  const s = segredo();
  if (!s) throw new Error('CRON_SECRET ausente — token de grupos não pode ser assinado');
  const payload = { t: tipo, p: pedidoId, exp: agora + (ttlMs || TOKEN_TTL_MS), ...(extra || {}) };
  const json = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', s).update(json).digest('base64url').slice(0, 24);
  return `${json}.${sig}`;
}



function verificarToken(token, tipoEsperado, agora = Date.now(), opts = {}) {
  try {
    const s = segredo();
    if (!s) return null;
    const [json, sig] = String(token || '').split('.');
    if (!json || !sig) return null;
    const expected = crypto.createHmac('sha256', s).update(json).digest('base64url').slice(0, 24);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(json, 'base64url').toString('utf8'));
    if (payload.t !== tipoEsperado) return null;
    if (!payload.exp) return null;
    if (agora > payload.exp) {

      if (tipoEsperado !== 'aprov' || opts.aceitarExpirado !== true) return null;
      return { ...payload, prorrogado: true };
    }
    return payload;
  } catch { return null; }
}

module.exports = {
  TOKEN_TTL_MS,
  APROV_TTL_MS,
  RENOV_TTL_MS,
  CONFIRA_TTL_MS,
  assinarToken,
  verificarToken,
};
