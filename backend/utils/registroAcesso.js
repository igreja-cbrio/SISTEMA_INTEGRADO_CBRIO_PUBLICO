






































const TETO_REGISTRO_MS = 1200;
















async function esperarRegistro(promessa, tetoMs = TETO_REGISTRO_MS) {
  if (!promessa || typeof promessa.then !== 'function') return 'sem_promessa';




  const teto = Number.isFinite(tetoMs) && tetoMs > 0 ? tetoMs : TETO_REGISTRO_MS;

  let timer;
  try {
    const resultado = await Promise.race([


      Promise.resolve(promessa).then(
        (r) => (r && r.error ? 'erro' : 'gravado'),
        () => 'erro',
      ),
      new Promise((resolve) => { timer = setTimeout(() => resolve('timeout'), teto); }),
    ]);
    return resultado;
  } catch {
    return 'erro';
  } finally {


    clearTimeout(timer);
  }
}

module.exports = { esperarRegistro, TETO_REGISTRO_MS };
