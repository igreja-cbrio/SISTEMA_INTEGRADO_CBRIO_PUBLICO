









function traduzErroUmPaiUmaMae(e) {
  if (!e) return null;
  const msg = e.message || '';
  const ehTrava = e.code === '23505' && /(mãe cadastrada|pai cadastrado|uma mãe e um pai)/i.test(msg);
  if (ehTrava) return { status: 400, error: msg };
  return null;
}

module.exports = { traduzErroUmPaiUmaMae };
