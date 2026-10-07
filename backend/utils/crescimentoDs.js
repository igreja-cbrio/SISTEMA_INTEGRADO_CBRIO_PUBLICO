





























function numero(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}










function somarDs(cultos) {
  const linhas = Array.isArray(cultos) ? cultos : [];
  let total = 0;
  let comDado = 0;
  for (const c of linhas) {
    const v = numero(c && c.online_ds);
    if (v === null) continue;
    total += v;
    comDado += 1;
  }













  const vazio = comDado === 0;
  const zerado = !vazio && total === 0;
  return {
    total: vazio || zerado ? null : total,
    cultos: linhas.length,
    com_ds: comDado,

    ausencia: vazio ? 'sem_coleta' : zerado ? 'tudo_zerado' : null,
  };
}











function crescimentoPct(atual, anterior) {
  const a = numero(atual);
  const b = numero(anterior);
  if (a === null) return { valor: null, motivo: 'sem_dado_no_periodo' };
  if (b === null) return { valor: null, motivo: 'sem_dado_no_periodo_anterior' };
  if (b === 0) return { valor: null, motivo: 'base_zero' };
  return { valor: Math.round(((a - b) / b) * 10000) / 100, motivo: null };
}






















function semanaFechada(fimExclusivo, hoje) {
  if (!fimExclusivo || !hoje) return false;
  return String(fimExclusivo) <= String(hoje);
}







function resultadoSemana(cultosAtual, cultosAnterior) {
  const atual = somarDs(cultosAtual);
  const anterior = somarDs(cultosAnterior);
  const { valor, motivo } = crescimentoPct(atual.total, anterior.total);


  if (valor === null) {
    return {
      valor: null,
      motivo: atual.ausencia === 'tudo_zerado' ? 'ds_zerado_na_semana' : motivo,
      atual,
      anterior,
    };
  }
  const fmt = (n) => Number(n).toLocaleString('pt-BR');
  return {
    valor,
    motivo: null,
    atual,
    anterior,
    observacao: `DS ${fmt(atual.total)} em ${atual.com_ds} culto(s) · semana anterior ${fmt(anterior.total)}`,
  };
}

module.exports = { numero, somarDs, crescimentoPct, semanaFechada, resultadoSemana };
