



































function funcaoDoRoster(body = {}) {
  return String(body.funcao || '') === 'visitante' ? 'visitante' : 'frequentador';
}

module.exports = { funcaoDoRoster };
