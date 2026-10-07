














const crypto = require('crypto');



function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  try {
    return crypto.timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}


function isAuthorizedCron(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const xcron = req.headers['x-cron-secret'];
  if (xcron && safeEqual(xcron, secret)) return true;

  const authz = req.headers['authorization'];
  if (authz && (safeEqual(authz, secret) || safeEqual(authz, `Bearer ${secret}`))) return true;

  return false;
}


function requireCron(req, res, next) {
  if (!isAuthorizedCron(req)) {
    return res.status(401).json({ error: 'Não autorizado' });
  }
  next();
}

module.exports = { isAuthorizedCron, requireCron, safeEqual };
