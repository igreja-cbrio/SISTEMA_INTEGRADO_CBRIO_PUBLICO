




















const crypto = require('crypto');

function segredo() {
  return process.env.CENSO_TOKEN_SECRET || process.env.CRON_SECRET || null;
}



const NS_IDENTIDADE = 'censo-pesquisa-id:';

function assinarIdentidade(idNorm, sec) {
  return crypto.createHmac('sha256', sec)
    .update(`${NS_IDENTIDADE}${idNorm}`).digest('hex').slice(0, 20);
}


function gerarTokenIdentidade(membroId) {
  const sec = segredo();
  const idNorm = String(membroId || '').replace(/-/g, '').toLowerCase();
  if (!sec || !/^[0-9a-f]{32}$/.test(idNorm)) return null;
  return `${idNorm}.${assinarIdentidade(idNorm, sec)}`;
}


function verificarTokenIdentidade(token) {
  const sec = segredo();
  if (!sec) return null;
  const m = /^([0-9a-f]{32})\.([0-9a-f]{20})$/.exec(String(token || '').trim().toLowerCase());
  if (!m) return null;
  const esperado = assinarIdentidade(m[1], sec);
  if (!crypto.timingSafeEqual(Buffer.from(m[2]), Buffer.from(esperado))) return null;
  return `${m[1].slice(0, 8)}-${m[1].slice(8, 12)}-${m[1].slice(12, 16)}-${m[1].slice(16, 20)}-${m[1].slice(20)}`;
}




function gerarSegredoRetomada() {
  return crypto.randomBytes(16).toString('hex');
}







function hashRetomada(segredoBruto) {
  const s = String(segredoBruto || '').trim();
  if (!/^[0-9a-f]{32}$/.test(s)) return null;
  return crypto.createHash('sha256').update(`censo-retomar:${s}`).digest('hex');
}


function retomadaConfere(segredoBruto, hashGuardado) {
  const calc = hashRetomada(segredoBruto);
  const guard = String(hashGuardado || '');
  if (!calc || calc.length !== guard.length) return false;
  return crypto.timingSafeEqual(Buffer.from(calc), Buffer.from(guard));
}

module.exports = {
  gerarTokenIdentidade,
  verificarTokenIdentidade,
  gerarSegredoRetomada,
  hashRetomada,
  retomadaConfere,
};
