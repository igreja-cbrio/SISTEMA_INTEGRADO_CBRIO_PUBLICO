


























const inscricao = require('./inscricao');
const generosidade = require('./generosidade');

const REGISTRO = new Map();

function registrar(handler) {
  if (!handler?.origem_tipo) throw new Error('handler sem origem_tipo');
  REGISTRO.set(handler.origem_tipo, handler);
}

registrar(inscricao);
registrar(generosidade);





function obter(origemTipo) {
  return REGISTRO.get(origemTipo) || null;
}







async function disparar(gancho, cobranca, ctx = {}) {
  const handler = obter(cobranca?.origem_tipo);
  if (!handler || typeof handler[gancho] !== 'function') return { executado: false };
  try {
    await handler[gancho](cobranca, ctx);
    return { executado: true };
  } catch (e) {
    console.error(`[pagamentos] handler ${cobranca.origem_tipo}.${gancho} falhou (cobranca ${cobranca.id}):`, e.message);
    return { executado: false, erro: e.message };
  }
}

module.exports = { obter, disparar, registrar };
