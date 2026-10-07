






















export function numeroBr(v) {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return Math.round(n).toLocaleString('pt-BR');
}







export function montarResumoAnual({ titulo, periodo, linhas = [], observacao } = {}) {
  const partes = [];
  partes.push(`*${titulo || 'CBRio · comparativo'}*`);
  if (periodo) partes.push(`_${periodo}_`);

  for (const linha of linhas) {
    const anos = Array.isArray(linha?.anos) ? linha.anos : [];




    if (!anos.some((a) => a?.valor != null)) continue;
    partes.push('');
    partes.push(`*${linha.rotulo}*`);
    for (const a of anos) {
      partes.push(`${a.ano}: ${numeroBr(a.valor)}`);
    }
  }

  if (observacao) {
    partes.push('');
    partes.push(`_${observacao}_`);
  }
  return partes.join('\n');
}
















export function linhasDoYtd({ anos = [], frequencia, decisoes, batismos } = {}) {
  const porAno = (serie) => {
    const mapa = new Map((serie || []).map((s) => [Number(s.ano), s]));
    return anos.map((ano) => {
      const s = mapa.get(Number(ano));
      const v = Number(s?.total);
      const semDado = !s || s.tem_dado === false || !Number.isFinite(v);
      return { ano, valor: semDado ? null : v };
    });
  };
  return [
    { chave: 'frequencia', rotulo: 'Frequência', anos: porAno(frequencia) },
    { chave: 'decisoes', rotulo: 'Decisões', anos: porAno(decisoes) },
    { chave: 'batismos', rotulo: 'Batismos', anos: porAno(batismos) },
  ];
}
