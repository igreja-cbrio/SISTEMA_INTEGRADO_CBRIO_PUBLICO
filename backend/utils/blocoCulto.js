










































'use strict';

const { tipoVigenteEm } = require('./lentesDomingo');












function tiposDoBloco(tipo, tipos, diaISO) {
  if (!tipo || !diaISO) return [];
  if (!tipoVigenteEm(tipo, diaISO)) return [];
  const bloco = tipo.bloco_servico || null;
  if (!bloco) return [tipo];
  return (tipos || []).filter((t) => t && t.bloco_servico === bloco && tipoVigenteEm(t, diaISO));
}










function cultosDoBloco({ tipo, tipos, cultos, diaISO }) {
  const doBloco = tiposDoBloco(tipo, tipos, diaISO);
  if (!doBloco.length) return [];
  const ids = new Set(doBloco.map((t) => t.id).filter(Boolean));
  return (cultos || [])
    .filter((c) => c && ids.has(c.service_type_id) && String(c.data || '').slice(0, 10) === diaISO)
    .slice()
    .sort((a, b) => String(a.hora || '').localeCompare(String(b.hora || '')));
}








function blocoTemHorarios(e) {
  return cultosDoBloco(e).length > 1;
}

module.exports = { tiposDoBloco, cultosDoBloco, blocoTemHorarios };
