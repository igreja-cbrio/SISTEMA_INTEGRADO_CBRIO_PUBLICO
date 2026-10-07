






























const METODOS_ESCRITA = ['POST', 'PUT', 'PATCH', 'DELETE'];





function nivelGuardNext(metodo) {
  const m = String(metodo || '').toUpperCase();
  return METODOS_ESCRITA.includes(m) ? 2 : 1;
}

module.exports = { nivelGuardNext, METODOS_ESCRITA, ROUTE_KEY: 'next-gestao' };
