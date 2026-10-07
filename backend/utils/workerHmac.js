


const crypto = require('crypto');

function sign(body) {
  const secret = process.env.AGENT_WORKER_HMAC_SECRET || '';
  if (!secret) throw new Error('AGENT_WORKER_HMAC_SECRET não configurado');
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

module.exports = { sign };
