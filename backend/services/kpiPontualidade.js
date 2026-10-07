






























const { periodoAtual } = require('./kpiAutoCollector');



const MAX_BUSCA = 60;



const MAX_FUTURO = 60;





function ancora(periodicidade, n, hoje) {
  const y = hoje.getUTCFullYear();
  const m = hoje.getUTCMonth();
  switch (periodicidade) {
    case 'semanal': {
      const d = new Date(hoje.getTime());
      d.setUTCDate(d.getUTCDate() - 7 * n);
      return d;
    }
    case 'trimestral': return new Date(Date.UTC(y, m - 3 * n, 15, 12));
    case 'semestral':  return new Date(Date.UTC(y, m - 6 * n, 15, 12));
    case 'anual':      return new Date(Date.UTC(y - n, 6, 15, 12));
    case 'mensal':
    default:           return new Date(Date.UTC(y, m - n, 15, 12));
  }
}


function periodoDeslocado(periodicidade, n, hoje = new Date()) {
  const per = (periodicidade || 'mensal').toLowerCase();
  return periodoAtual(per, ancora(per, n, hoje));
}






function periodosFechados(periodicidade, n, hoje = new Date()) {
  const out = [];
  for (let i = 1; i <= n; i++) out.push(periodoDeslocado(periodicidade, i, hoje));
  return out;
}




function idadeEmPeriodos(rotulo, periodicidade, hoje = new Date()) {
  if (!rotulo) return null;
  const alvo = String(rotulo).trim();
  for (let i = 0; i <= MAX_BUSCA; i++) {
    if (periodoDeslocado(periodicidade, i, hoje) === alvo) return i;
  }
  for (let i = 1; i <= MAX_FUTURO; i++) {
    if (periodoDeslocado(periodicidade, -i, hoje) === alvo) return -i;
  }
  return null;
}


function ehFuturo(rotulo, periodicidade, hoje = new Date()) {
  const idade = idadeEmPeriodos(rotulo, periodicidade, hoje);
  return idade != null && idade < 0;
}





function atingiuMeta(valor, meta, sentido) {
  if (valor == null || meta == null || Number(meta) === 0) return null;
  const v = Number(valor);
  const alvo = Number(meta);
  if ((sentido || 'maior_melhor') === 'menor_melhor') return v <= alvo;
  return v >= alvo;
}















function classificar({
  kpi,
  valoresPorPeriodo = {},
  temLinhaCalculada = false,
  ultimoCalculoNulo = false,
  metaPeriodo = null,
  janela = 3,
  hoje = new Date(),
}) {
  const per = (kpi?.periodicidade || 'mensal').toLowerCase();
  const esperados = periodosFechados(per, janela, hoje);
  const preenchidos = esperados.filter(p => valoresPorPeriodo[p] != null);





  const temAlgumValor = Object.keys(valoresPorPeriodo).some(p => {
    if (valoresPorPeriodo[p] == null) return false;
    const idade = idadeEmPeriodos(p, per, hoje);
    return idade != null && idade >= 0;
  });




  let atraso = null;
  for (let i = 0; i < esperados.length; i++) {
    if (valoresPorPeriodo[esperados[i]] != null) { atraso = i; break; }
  }
  let pontualidade;
  if (atraso === 0) pontualidade = 'em_dia';
  else if (atraso != null) pontualidade = 'atrasado';
  else pontualidade = temAlgumValor ? 'atrasado' : 'nunca';


  const periodosAtraso = atraso != null ? atraso : (pontualidade === 'atrasado' ? janela : null);


  let fonte;
  if (!temLinhaCalculada && !temAlgumValor) fonte = 'inexistente';
  else if (ultimoCalculoNulo && preenchidos.length === 0) fonte = 'nula';
  else fonte = 'viva';





  const valorRecente = atraso != null ? valoresPorPeriodo[esperados[atraso]] : null;
  let desempenho;



  if (pontualidade === 'nunca') desempenho = 'sem_dado';
  else if (valorRecente == null) desempenho = 'nao_julgavel';
  else if (periodosAtraso >= 2) desempenho = 'nao_julgavel';
  else if (metaPeriodo == null || Number(metaPeriodo) === 0) desempenho = 'sem_meta';
  else desempenho = atingiuMeta(valorRecente, metaPeriodo, kpi?.sentido_meta) ? 'no_alvo' : 'abaixo';






  let cronico = false;
  if (metaPeriodo != null && Number(metaPeriodo) !== 0 && esperados.length >= 2) {
    const v0 = valoresPorPeriodo[esperados[0]];
    const v1 = valoresPorPeriodo[esperados[1]];
    cronico = v0 != null && v1 != null
      && atingiuMeta(v0, metaPeriodo, kpi?.sentido_meta) === false
      && atingiuMeta(v1, metaPeriodo, kpi?.sentido_meta) === false;
  }

  return {
    periodos_esperados: esperados,
    slots: esperados.length,
    preenchidos: preenchidos.length,
    cobertura_pct: esperados.length ? Math.round((preenchidos.length / esperados.length) * 1000) / 10 : 0,
    pontualidade,
    periodos_atraso: periodosAtraso,
    fonte,
    desempenho,
    cronico,
    valor_recente: valorRecente ?? null,
    periodo_recente: atraso != null ? esperados[atraso] : null,
  };
}

module.exports = {
  periodoAtual,
  periodoDeslocado,
  periodosFechados,
  idadeEmPeriodos,
  ehFuturo,
  atingiuMeta,
  classificar,
};
