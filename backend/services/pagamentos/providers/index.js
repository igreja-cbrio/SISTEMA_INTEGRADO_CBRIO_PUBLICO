










































const manual = require('./manual');

const REGISTRO = new Map();
function registrar(adapter) {
  if (!adapter?.nome) throw new Error('provider sem nome');
  REGISTRO.set(adapter.nome, adapter);
}

registrar(manual);










for (const caminho of ['./asaas', './mercadopago']) {
  try {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    registrar(require(caminho));
  } catch (e) {




    if (e.code !== 'MODULE_NOT_FOUND' || !String(e.message).includes(caminho)) throw e;
  }
}


function providerPadrao() {
  return process.env.PAG_PROVIDER_PADRAO || 'manual';
}





function obter(nome) {
  const alvo = nome || providerPadrao();
  const adapter = REGISTRO.get(alvo);
  if (!adapter) {
    throw new Error(
      `Provider de pagamento "${alvo}" não está registrado. `
      + `Disponíveis: ${[...REGISTRO.keys()].join(', ') || '(nenhum)'}.`,
    );
  }
  return adapter;
}

function existe(nome) {
  return REGISTRO.has(nome);
}


function pspConfigurado() {
  const p = providerPadrao();
  return p !== 'manual' && REGISTRO.has(p);
}

function listar() {
  return [...REGISTRO.values()].map((p) => ({ nome: p.nome, capacidades: p.capacidades }));
}

module.exports = { obter, existe, listar, providerPadrao, pspConfigurado, registrar };
