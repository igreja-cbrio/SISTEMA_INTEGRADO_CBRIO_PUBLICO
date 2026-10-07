

















const MOTIVOS_DO_SISTEMA = [
  'Visitante não retornou (prazo de 4 semanas)',
  'Completou 13 anos · graduou para adolescente',
  'Sem check-in no Planning Center nos últimos 6 meses',
];







function rotuloMotivo(valor) {
  if (valor == null) return null;
  const t = String(valor).replace(/\s+/g, ' ').trim();
  return t === '' ? null : t;
}






function agruparMotivos(linhas) {





  const mapa = new Map();
  for (const linha of linhas || []) {
    const motivo = rotuloMotivo(linha?.motivo_inativacao);
    const atual = mapa.get(motivo);
    if (atual) atual.total += 1;
    else mapa.set(motivo, { motivo, total: 1 });
  }
  return [...mapa.values()].sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;


    if (a.motivo === null) return 1;
    if (b.motivo === null) return -1;
    return a.motivo.localeCompare(b.motivo, 'pt-BR');
  });
}







function numeroOuNulo(valor) {
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor < 0) return null;
  return Math.trunc(valor);
}






function montarContagens({ frequentadoras, visitantes, inativas } = {}) {
  const freq = numeroOuNulo(frequentadoras);
  const visit = numeroOuNulo(visitantes);
  const inat = numeroOuNulo(inativas);




  const ativas = freq === null || visit === null ? null : freq + visit;

  return {
    frequentadoras: freq,
    visitantes: visit,
    inativas: inat,
    ativas,

    incompleto: freq === null || visit === null || inat === null,
  };
}

module.exports = {
  MOTIVOS_DO_SISTEMA,
  rotuloMotivo,
  agruparMotivos,
  numeroOuNulo,
  montarContagens,
};
