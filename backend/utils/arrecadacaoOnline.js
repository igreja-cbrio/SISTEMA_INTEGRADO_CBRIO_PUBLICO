

















































const NIVEL_VE_DINHEIRO = 4;

function podeVerArrecadacaoOnline(user) {
  if (!user) return false;

  const bloqueados = user.granular?.modulosBloqueados || [];
  if (bloqueados.includes('online')) return false;
  const nivel = user.granular?.modulePerms?.online?.leitura;
  return typeof nivel === 'number' && nivel >= NIVEL_VE_DINHEIRO;
}






function hojeBRT(agora = Date.now()) {
  return new Date(agora - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}






















function ultimoDiaDoPeriodo(fim) {
  if (typeof fim !== 'string') return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(fim)) return fim;
  if (/^\d{4}-\d{2}$/.test(fim)) {
    const ano = Number(fim.slice(0, 4));
    const mes = Number(fim.slice(5, 7));
    if (!Number.isInteger(ano) || mes < 1 || mes > 12) return null;



    const d = new Date(Date.UTC(ano, mes, 0));
    return d.toISOString().slice(0, 10);
  }
  return null;
}

function periodoFechado(fimBruto, { hoje, corte }) {
  const fim = ultimoDiaDoPeriodo(fimBruto);
  if (!fim) return false;
  if (typeof hoje !== 'string' || !hoje) return false;
  if (fim > hoje) return false;


  if (typeof corte !== 'string' || !corte) return false;
  return fim <= corte;
}








function variacao(atual, anterior) {
  const a = Number(atual);
  const b = Number(anterior);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (b === 0) return null;
  return Number((((a - b) / b) * 100).toFixed(1));
}










function anotarSerie(periodos, { hoje, corte, campoFim = 'fim' } = {}) {
  const lista = Array.isArray(periodos) ? periodos : [];
  return lista.map((p, i) => {
    const fechado = periodoFechado(p?.[campoFim], { hoje, corte });
    const anterior = lista[i - 1];
    const anteriorFechado = anterior
      ? periodoFechado(anterior[campoFim], { hoje, corte })
      : false;
    return {
      ...p,
      fechado,


      comparavel: Boolean(fechado && anteriorFechado),
      variacao: fechado && anteriorFechado ? variacao(p?.total, anterior.total) : null,
      anterior_total: anteriorFechado ? (anterior?.total ?? null) : null,
    };
  });
}


function ultimoFechado(serieAnotada) {
  const lista = Array.isArray(serieAnotada) ? serieAnotada : [];
  for (let i = lista.length - 1; i >= 0; i -= 1) {
    if (lista[i]?.fechado) return lista[i];
  }
  return null;
}






function mesDoAnoAnterior(mes) {
  if (typeof mes !== 'string' || !/^\d{4}-\d{2}$/.test(mes)) return null;
  const ano = Number(mes.slice(0, 4));
  if (!Number.isFinite(ano)) return null;
  return `${ano - 1}-${mes.slice(5, 7)}`;
}










function compararComAnoAnterior(meses, mesesAnoAnterior) {
  const anterior = new Map(
    (Array.isArray(mesesAnoAnterior) ? mesesAnoAnterior : [])
      .filter((m) => m && typeof m.mes === 'string')
      .map((m) => [m.mes, m]),
  );
  return (Array.isArray(meses) ? meses : []).map((m) => {
    const chave = mesDoAnoAnterior(m?.mes);
    const par = chave ? anterior.get(chave) : null;
    return {
      ...m,
      mes_anterior: chave,
      total_ano_anterior: par ? par.total : null,
      dias_segunda_ano_anterior: par ? (par.dias_segunda ?? null) : null,


      variacao_ano: par ? variacao(m?.total, par.total) : null,


      calendario_difere: Boolean(
        par && (m?.dias_segunda ?? null) !== (par.dias_segunda ?? null),
      ),
    };
  });
}









function conferencia(total, foraDoRecorte) {





  if (total === null || total === undefined || total === '') return null;
  const dentro = Number(total);
  const fora = (Array.isArray(foraDoRecorte) ? foraDoRecorte : [])
    .reduce((s, f) => s + (Number(f?.total) || 0), 0);
  if (!Number.isFinite(dentro)) return null;
  return {
    dentro,
    fora,
    total_conta: dentro + fora,
    pct_dentro: dentro + fora > 0
      ? Number(((dentro / (dentro + fora)) * 100).toFixed(1))
      : null,
  };
}

module.exports = {
  NIVEL_VE_DINHEIRO,
  podeVerArrecadacaoOnline,
  hojeBRT,
  ultimoDiaDoPeriodo,
  periodoFechado,
  variacao,
  anotarSerie,
  ultimoFechado,
  mesDoAnoAnterior,
  compararComAnoAnterior,
  conferencia,
};
