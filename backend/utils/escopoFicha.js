















const ESCOPO_BASICO = 'basico';


function isEscopoBasico(escopo) {
  return escopo === ESCOPO_BASICO;
}





function resolverEscopoFicha(e) {
  const entrada = e || {};
  const basico = isEscopoBasico(entrada.escopo);


  const permiteFin = entrada.podeFinanceiro === true;
  const permiteMarc = entrada.podeMarcadorSensivel === true;
  return {
    basico,
    mostrarFinanceiro: !basico && permiteFin,
    mostrarMarcadorSensivel: !basico && permiteMarc,
  };
}

module.exports = { ESCOPO_BASICO, isEscopoBasico, resolverEscopoFicha };
