






















function tipoVigenteNoDia(tipo, diaISO) {
  if (!tipo || tipo.is_active === false) return false;
  if (!diaISO) return true;
  if (tipo.vigente_de && diaISO < tipo.vigente_de) return false;
  if (tipo.vigente_ate && diaISO > tipo.vigente_ate) return false;
  return true;
}


function filtrarVigentes(tipos, diaISO) {
  return (tipos || []).filter(t => tipoVigenteNoDia(t, diaISO));
}

module.exports = { tipoVigenteNoDia, filtrarVigentes };
