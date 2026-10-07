












const { AsyncLocalStorage } = require('node:async_hooks');

const als = new AsyncLocalStorage();


function comContextoDeFalha(fn) {
  return als.run({ falhaDb: null }, fn);
}








function registrarFalhaDb(info) {
  try {
    const store = als.getStore();
    if (!store) return;
    store.falhaDb = {
      motivo: info?.motivo || '',
      codigo: info?.codigo || '',
      status: info?.status || null,
      rota: info?.rota || '',
      em: Date.now(),
    };
  } catch {                                               }
}

function falhaDbDaRequisicao() {
  try { return als.getStore()?.falhaDb || null; } catch { return null; }
}

module.exports = { comContextoDeFalha, registrarFalhaDb, falhaDbDaRequisicao };
