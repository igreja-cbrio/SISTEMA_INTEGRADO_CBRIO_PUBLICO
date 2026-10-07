
































const crypto = require('crypto');




const VALIDADE_MS = 30 * 60 * 1000;

function segredo() {
  return process.env.DOACAO_TOKEN_SECRET || process.env.CRON_SECRET || null;
}

function assinar(corpo, sec) {
  return crypto.createHmac('sha256', sec)
    .update(`doacao-prefill:${corpo}`).digest('hex').slice(0, 20);
}








function emitir(membroId, agora = Date.now()) {
  const sec = segredo();
  const id = typeof membroId === 'string' ? membroId.trim() : '';
  if (!sec || !id) return null;
  const exp = agora + VALIDADE_MS;
  const corpo = `${id}.${exp}`;
  return `${corpo}.${assinar(corpo, sec)}`;
}








function ler(token, agora = Date.now()) {
  const sec = segredo();
  if (!sec) return { ok: false, motivo: 'sem_segredo' };
  const bruto = typeof token === 'string' ? token.trim() : '';
  if (!bruto) return { ok: false, motivo: 'ausente' };

  const partes = bruto.split('.');
  if (partes.length !== 3) return { ok: false, motivo: 'malformado' };
  const [id, expTxt, sig] = partes;
  if (!id || !/^\d+$/.test(expTxt)) return { ok: false, motivo: 'malformado' };

  const esperada = assinar(`${id}.${expTxt}`, sec);


  const a = Buffer.from(sig);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, motivo: 'assinatura' };
  }

  if (Number(expTxt) <= agora) return { ok: false, motivo: 'expirado' };
  return { ok: true, membro_id: id };
}

module.exports = { emitir, ler, VALIDADE_MS };
