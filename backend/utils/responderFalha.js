





















const { sanitizarMotivo } = require('./motivoFalha');













function falhaInterna(res, publico, erro, opts = {}) {
  const status = Number(opts.status) || 500;
  try {
    if (res?.locals) {



      res.locals.motivoFalha = erro?.message || String(erro || '');
      res.locals.codigoFalha = erro?.code || '';

      if (erro?.stack) res.locals.stackFalha = String(erro.stack).slice(0, 6000);
    }
  } catch {                                                        }
  const corpo = { error: publico };
  if (opts.exporDetalhe && erro?.message) corpo.detalhe = sanitizarMotivo(erro.message, 300);
  return res.status(status).json(corpo);
}

module.exports = { falhaInterna };
