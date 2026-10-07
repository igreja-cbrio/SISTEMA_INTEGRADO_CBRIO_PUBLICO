













const DIAS_FIM = { 1: 10, 2: 20 };


function decendioDoDia(dia) {
  if (dia <= 10) return 1;
  if (dia <= 20) return 2;
  return 3;
}





function situacaoDecendio(mes, decendio, hojeISO) {
  const mesHoje = String(hojeISO || '').slice(0, 7);
  if (!mesHoje || mes < mesHoje) return 'fechado';
  if (mes > mesHoje) return 'futuro';
  const dia = Number(String(hojeISO).slice(8, 10));
  const atual = decendioDoDia(dia);
  if (decendio < atual) return 'fechado';
  if (decendio > atual) return 'futuro';


  return dia >= (DIAS_FIM[decendio] || 99) ? 'fechado' : 'em_andamento';
}









function compararDecendio(atual, anterior, hojeISO) {
  if (!atual) return null;
  const sitAtual = situacaoDecendio(atual.mes, atual.decendio, hojeISO);
  const sitAnterior = anterior ? situacaoDecendio(anterior.mes, anterior.decendio, hojeISO) : null;
  const base = Number(anterior?.receita || 0);
  const valor = Number(atual.receita || 0);
  const comparavel = !!anterior && sitAtual === 'fechado' && sitAnterior === 'fechado' && base > 0;
  return {
    mes: atual.mes,
    decendio: atual.decendio,
    receita: valor,
    situacao: sitAtual,
    base_mes: anterior?.mes || null,
    base_receita: anterior ? base : null,
    diferenca: anterior ? valor - base : null,
    percentual: comparavel ? ((valor - base) / base) * 100 : null,

    motivo_sem_percentual: comparavel ? null
      : !anterior ? 'sem_mes_anterior'
      : base === 0 ? 'base_zero'
      : 'periodo_em_aberto',
  };
}









function montarGrade(linhas, hojeISO) {
  const porMes = new Map();
  for (const r of linhas || []) {
    if (!r || !r.mes) continue;
    if (!porMes.has(r.mes)) porMes.set(r.mes, new Map());
    porMes.get(r.mes).set(Number(r.decendio), r);
  }
  const meses = [...porMes.keys()].sort();
  return meses.map((mes, i) => {
    const anterior = i > 0 ? porMes.get(meses[i - 1]) : null;
    return {
      mes,
      decendios: [1, 2, 3].map((d) => {
        const atual = porMes.get(mes).get(d) || { mes, decendio: d, receita: 0 };
        return compararDecendio(atual, anterior ? anterior.get(d) || null : null, hojeISO);
      }),
    };
  });
}

module.exports = { decendioDoDia, situacaoDecendio, compararDecendio, montarGrade };
