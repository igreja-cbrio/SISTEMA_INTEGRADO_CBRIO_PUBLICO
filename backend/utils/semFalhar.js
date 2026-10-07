

























async function semFalhar(consulta, tag) {
  const prefixo = tag ? `${tag} ` : '';
  try {
    const { error } = (await consulta) || {};
    if (error) console.error(`${prefixo}${error.message}`);
    return !error;
  } catch (e) {
    console.error(`${prefixo}${e?.message || e}`);
    return false;
  }
}

module.exports = { semFalhar };
