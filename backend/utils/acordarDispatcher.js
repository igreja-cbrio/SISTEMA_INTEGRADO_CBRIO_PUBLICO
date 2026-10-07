
































const MOTIVO = {
  HA_TRABALHO: 'ha_trabalho',
  SEM_TAREFA: 'sem_tarefa',
  AMBIENTE_BLOQUEADO: 'ambiente_bloqueado',
  ENTRADA_INVALIDA: 'entrada_invalida',
};


function idsValidos(lista) {
  if (!Array.isArray(lista)) return [];
  const vistos = new Set();
  for (const id of lista) {
    if (typeof id === 'string' && id.trim()) vistos.add(id.trim());
  }
  return [...vistos];
}







function decidirAcordar({ tarefas, bloqueadas } = {}) {



  if (!Array.isArray(tarefas)) {
    return { acordar: false, motivo: MOTIVO.ENTRADA_INVALIDA, elegiveis: [], adiadas: [] };
  }
  const vivas = idsValidos(tarefas);
  if (!vivas.length) {
    return { acordar: false, motivo: MOTIVO.SEM_TAREFA, elegiveis: [], adiadas: [] };
  }
  const bloq = new Set(idsValidos(bloqueadas));
  const elegiveis = vivas.filter((id) => !bloq.has(id));
  const adiadas = vivas.filter((id) => bloq.has(id));
  if (!elegiveis.length) {
    return { acordar: false, motivo: MOTIVO.AMBIENTE_BLOQUEADO, elegiveis: [], adiadas };
  }
  return { acordar: true, motivo: MOTIVO.HA_TRABALHO, elegiveis, adiadas };
}

module.exports = { MOTIVO, decidirAcordar, idsValidos };
