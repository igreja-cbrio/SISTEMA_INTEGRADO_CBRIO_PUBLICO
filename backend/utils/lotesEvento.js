




















const MAX_LOTES = 6;







function sanitizarLotes(lista) {
  if (!Array.isArray(lista)) return null;
  return lista
    .map((l, i) => {
      if (!l || typeof l !== 'object') return null;
      const vagas = Math.trunc(Number(l.vagas));
      const valor = Math.trunc(Number(l.valor_centavos));
      if (!(vagas > 0) || !(valor > 0)) return null;
      return {
        nome: String(l.nome ?? '').trim().slice(0, 60) || `Lote ${i + 1}`,
        vagas,
        valor_centavos: valor,
      };
    })
    .filter(Boolean)
    .slice(0, MAX_LOTES);
}


function totalVagasLotes(lotes) {
  if (!Array.isArray(lotes)) return 0;
  return lotes.reduce((s, l) => s + (Number(l?.vagas) > 0 ? Math.trunc(Number(l.vagas)) : 0), 0);
}





function loteDaPosicao(lotes, posicao) {
  const lista = sanitizarLotes(lotes) || [];
  if (!lista.length) return null;
  const pos = Math.trunc(Number(posicao));
  if (!(pos > 0)) return null;
  let acumulado = 0;
  for (let i = 0; i < lista.length; i++) {
    acumulado += lista[i].vagas;
    if (pos <= acumulado) return { ...lista[i], indice: i };
  }
  return { ...lista[lista.length - 1], indice: lista.length - 1 };
}








function loteAtual(lotes, ocupadas) {
  const oc = Number(ocupadas);
  const base = Number.isFinite(oc) && oc > 0 ? Math.trunc(oc) : 0;
  const atual = loteDaPosicao(lotes, base + 1);
  if (!atual) return null;
  const lista = sanitizarLotes(lotes) || [];
  let acumulado = 0;
  for (let i = 0; i <= atual.indice; i++) acumulado += lista[i].vagas;
  const ultimo = atual.indice === lista.length - 1;
  return {
    nome: atual.nome,
    valor_centavos: atual.valor_centavos,
    indice: atual.indice,
    restantes_no_lote: ultimo ? null : Math.max(0, acumulado - base),
    proximo: ultimo ? null : { nome: lista[atual.indice + 1].nome, valor_centavos: lista[atual.indice + 1].valor_centavos },
  };
}














function loteDaInscricao(lotes, insc, posicao) {
  const lista = sanitizarLotes(lotes) || [];
  const cat = insc?.dados?.e_inscricao?.categoria;
  if (cat && String(cat).trim()) {
    const nome = String(cat).trim();
    const idx = lista.findIndex((l) => l.nome.toLowerCase() === nome.toLowerCase());
    return { nome, indice: idx >= 0 ? idx : null, valor_centavos: null, fonte: 'plataforma' };
  }
  if (!lista.length) return null;
  const valor = Number(insc?.valor_cobrado_centavos);
  if (valor > 0) {
    const idx = lista.findIndex((l) => l.valor_centavos === valor);
    if (idx >= 0) return { nome: lista[idx].nome, indice: idx, valor_centavos: lista[idx].valor_centavos, fonte: 'valor' };
  }
  const porPos = loteDaPosicao(lista, posicao);
  if (!porPos) return null;
  return { nome: porPos.nome, indice: porPos.indice, valor_centavos: porPos.valor_centavos, fonte: 'posicao' };
}







function anexarLoteNasInscricoes(lotes, inscritos, { completo = true } = {}) {
  const lista = Array.isArray(inscritos) ? inscritos : [];
  const posicao = new Map();
  if (completo) {
    const vivas = lista.filter((i) => i && i.status !== 'cancelada' && !i.deleted_at)
      .slice()
      .sort((a, b) => (String(a.created_at) < String(b.created_at) ? -1 : String(a.created_at) > String(b.created_at) ? 1 : String(a.id).localeCompare(String(b.id))));
    vivas.forEach((i, k) => posicao.set(i.id, k + 1));
  }
  return lista.map((i) => ({ ...i, lote: loteDaInscricao(lotes, i, posicao.get(i?.id) || null) }));
}

module.exports = { MAX_LOTES, sanitizarLotes, totalVagasLotes, loteDaPosicao, loteAtual, loteDaInscricao, anexarLoteNasInscricoes };
