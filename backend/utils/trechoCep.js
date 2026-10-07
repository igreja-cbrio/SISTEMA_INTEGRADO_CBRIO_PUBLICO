














const soDigitos = (v) => String(v ?? '').replace(/\D/g, '');









function regiaoDeCep(cepBruto) {
  const d = soDigitos(cepBruto);
  return d.length === 8 ? d.slice(0, 5) : null;
}









function trechoValido(valor) {
  return soDigitos(valor).length === 5;
}


function rotuloTrecho(regiao, bairro) {
  const r = soDigitos(regiao);
  if (r.length !== 5) return null;
  return `${r}-xxx${bairro ? ` · ${bairro}` : ''}`;
}








const MINIMO_POR_TRECHO = 3;






const trechoTemMassa = (total) =>
  Number.isFinite(Number(total)) && Number(total) >= MINIMO_POR_TRECHO;













function normalizarCep(valor) {
  const d = soDigitos(valor);
  return d.length === 8 ? d : null;
}


function cepCompleto(valor) {
  return normalizarCep(valor) !== null;
}

module.exports = {
  regiaoDeCep,
  normalizarCep,
  cepCompleto,
  trechoValido,
  rotuloTrecho,
  trechoTemMassa,
  MINIMO_POR_TRECHO,
};
