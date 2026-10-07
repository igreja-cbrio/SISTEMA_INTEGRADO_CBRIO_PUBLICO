































const PAPEIS = ['auto', 'gestor', 'par', 'liderado'];
const PAPEIS_IDENTIFICADOS = new Set(['auto', 'gestor']);




const PISO_MINIMO_ABSOLUTO = 3;
const PISO_PADRAO = 3;

function ehPapelValido(papel) {
  return PAPEIS.includes(papel);
}




function normalizarPiso(piso) {
  const n = Number(piso);
  if (!Number.isInteger(n)) return PISO_PADRAO;
  return Math.max(n, PISO_MINIMO_ABSOLUTO);
}










function podeColetarPapel({ papel, elegiveis, piso } = {}) {
  if (!ehPapelValido(papel)) {
    return { coletar: false, motivo: 'papel_invalido', piso: null };
  }
  const p = normalizarPiso(piso);
  const n = Number(elegiveis);
  if (!Number.isInteger(n) || n < 0) {

    return { coletar: false, motivo: 'elegiveis_desconhecido', piso: p };
  }
  if (n === 0) {
    return { coletar: false, motivo: 'sem_elegiveis', piso: p };
  }

  if (PAPEIS_IDENTIFICADOS.has(papel)) {
    return { coletar: true, motivo: 'identificado_por_natureza', piso: p };
  }
  if (n < p) {
    return { coletar: false, motivo: 'abaixo_do_piso', piso: p };
  }
  return { coletar: true, motivo: 'ok', piso: p };
}










function podeRevelar({ papel, respostas, piso } = {}) {
  if (!ehPapelValido(papel)) {
    return { revelar: false, motivo: 'papel_invalido', respostas: 0, piso: null };
  }
  const p = normalizarPiso(piso);
  const n = Number(respostas);
  if (!Number.isInteger(n) || n < 0) {
    return { revelar: false, motivo: 'respostas_desconhecido', respostas: 0, piso: p };
  }
  if (n === 0) {
    return { revelar: false, motivo: 'sem_respostas', respostas: 0, piso: p };
  }
  if (PAPEIS_IDENTIFICADOS.has(papel)) {
    return { revelar: true, motivo: 'identificado_por_natureza', respostas: n, piso: p };
  }
  if (n < p) {
    return { revelar: false, motivo: 'abaixo_do_piso', respostas: n, piso: p };
  }
  return { revelar: true, motivo: 'ok', respostas: n, piso: p };
}











function planoDeColeta({ elegiveisPorPapel, piso } = {}) {
  const p = normalizarPiso(piso);
  const fonte = elegiveisPorPapel && typeof elegiveisPorPapel === 'object' ? elegiveisPorPapel : {};
  const coletar = [];
  const suprimidos = [];
  for (const papel of PAPEIS) {
    const d = podeColetarPapel({ papel, elegiveis: fonte[papel], piso: p });
    if (d.coletar) coletar.push(papel);
    else suprimidos.push({ papel, motivo: d.motivo });
  }
  return { piso: p, coletar, suprimidos };
}

module.exports = {
  PAPEIS,
  PAPEIS_IDENTIFICADOS,
  PISO_PADRAO,
  PISO_MINIMO_ABSOLUTO,
  ehPapelValido,
  normalizarPiso,
  podeColetarPapel,
  podeRevelar,
  planoDeColeta,
};
