

















































function botPodeResponder({ cfg = null, erroConfig = null } = {}) {

  if (erroConfig) return false;
  if (!cfg) return false;
  return cfg.respostas_automaticas !== false;
}








function webhookDesligado({ cfg = null } = {}) {
  return !!cfg && cfg.ia_ativa === false;
}

module.exports = { botPodeResponder, webhookDesligado };
