












const { diaBRT } = require('./volDisponibilidade');









function diaIntegracaoBRT(agora = Date.now()) {
  return diaBRT(new Date(agora));
}













function deveLimparCarimbo(statusAtual, statusNovo) {
  if (!statusNovo) return false;
  if (statusNovo === 'integrado') return false;
  return statusAtual === 'integrado';
}

module.exports = { diaIntegracaoBRT, deveLimparCarimbo };
