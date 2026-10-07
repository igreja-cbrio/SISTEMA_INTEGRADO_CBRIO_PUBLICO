


















const JANELA_ATIVA_MESES = 12;






const FAIXAS_CHECKIN = [
  { key: 'zero', rotulo: 'Nenhum check-in', min: 0, max: 0 },
  { key: '1', rotulo: '1 check-in', min: 1, max: 1 },
  { key: '2-5', rotulo: '2 a 5', min: 2, max: 5 },
  { key: '6-10', rotulo: '6 a 10', min: 6, max: 10 },
  { key: '11+', rotulo: '11 ou mais', min: 11, max: Infinity },
];


function faixaCheckins(qtd) {
  const n = Number(qtd);
  if (!Number.isFinite(n) || n <= 0) return 'zero';
  const f = FAIXAS_CHECKIN.find((x) => n >= x.min && n <= x.max);
  return f ? f.key : '11+';
}


function casaFaixa(qtd, faixaSel) {
  if (!faixaSel || faixaSel === 'todas') return true;
  return faixaCheckins(qtd) === faixaSel;
}






function inicioDaJanela(agora = Date.now(), meses = JANELA_ATIVA_MESES) {
  const d = new Date(agora);
  d.setUTCMonth(d.getUTCMonth() - meses);
  return d.toISOString();
}








function frequentaNaJanela(ultimoCheckinISO, agora = Date.now(), meses = JANELA_ATIVA_MESES) {
  if (!ultimoCheckinISO) return false;
  const t = Date.parse(ultimoCheckinISO);
  if (Number.isNaN(t)) return false;
  return t >= Date.parse(inicioDaJanela(agora, meses));
}








function avaliarFrequencia(criancas = [], opts = {}) {
  const { agora = Date.now(), meses = JANELA_ATIVA_MESES, coletaDesde = null } = opts;
  const inicio = inicioDaJanela(agora, meses);

  let frequentam = 0;
  for (const c of criancas) {
    if (frequentaNaJanela(c?.ultimo_checkin, agora, meses)) frequentam += 1;
  }



  const coberturaParcial = !!coletaDesde && Date.parse(coletaDesde) > Date.parse(inicio);

  return {
    total: criancas.length,
    frequentam,
    sem_checkin: criancas.length - frequentam,
    janela_meses: meses,
    janela_inicio: inicio,
    coleta_desde: coletaDesde,
    cobertura_parcial: coberturaParcial,
  };
}

module.exports = {
  JANELA_ATIVA_MESES,
  FAIXAS_CHECKIN,
  faixaCheckins,
  casaFaixa,
  inicioDaJanela,
  frequentaNaJanela,
  avaliarFrequencia,
};
