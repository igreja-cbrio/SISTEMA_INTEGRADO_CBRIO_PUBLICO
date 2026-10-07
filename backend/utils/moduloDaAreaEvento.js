

























const MAPA = {
  ami: 'ami',
  bridge: 'bridge',
  cuidados: 'cuidados',
  financeiro: 'financeiro',
  grupos: 'grupos',
  integracao: 'integracao',
  kids: 'kids',
  logistica: 'logistica',
  marketing: 'marketing',
  next: 'next',
  online: 'online',
  patrimonio: 'patrimonio',
  producao: 'producao',
  'rh/administrativo': 'rh',
  voluntariado: 'voluntariado',
};




const AREAS_SEM_MODULO = ['sede', 'louvor', 'infraestrutura', 'ti'];







function normalizarArea(nome) {
  return String(nome || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}





function moduloDaAreaEvento(area) {
  const chave = normalizarArea(area);
  if (!chave) return null;
  return MAPA[chave] || null;
}

module.exports = { moduloDaAreaEvento, normalizarArea, MAPA, AREAS_SEM_MODULO };
