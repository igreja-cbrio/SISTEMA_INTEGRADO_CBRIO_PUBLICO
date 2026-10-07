







const assert = require('node:assert/strict');
const {
  periodosFechados, idadeEmPeriodos, ehFuturo, atingiuMeta, classificar,
} = require('./kpiPontualidade');


const HOJE = new Date('2026-09-04T12:00:00Z');






assert.deepEqual(periodosFechados('mensal', 3, HOJE), ['2026-08', '2026-07', '2026-06']);
assert.deepEqual(periodosFechados('semanal', 3, HOJE), ['2026-W35', '2026-W34', '2026-W33']);
assert.deepEqual(periodosFechados('trimestral', 3, HOJE), ['2026-Q2', '2026-Q1', '2025-Q4']);
assert.deepEqual(periodosFechados('semestral', 3, HOJE), ['2026-S1', '2025-S2', '2025-S1']);
assert.deepEqual(periodosFechados('anual', 2, HOJE), ['2025', '2024']);


assert.deepEqual(periodosFechados(null, 1, HOJE), ['2026-08']);



assert.ok(!periodosFechados('mensal', 6, HOJE).includes('2026-09'),
  'setembro ainda não fechou em 04/09 — não pode ser cobrado');
assert.ok(!periodosFechados('semanal', 6, HOJE).includes('2026-W36'),
  'a semana corrente não pode ser cobrada');





assert.deepEqual(periodosFechados('mensal', 3, new Date('2026-03-31T12:00:00Z')),
  ['2026-02', '2026-01', '2025-12'], 'dia 31 não pode pular o mês anterior');
assert.deepEqual(periodosFechados('mensal', 2, new Date('2026-03-30T12:00:00Z')),
  ['2026-02', '2026-01']);


assert.deepEqual(periodosFechados('mensal', 2, new Date('2026-01-15T12:00:00Z')),
  ['2025-12', '2025-11']);
assert.deepEqual(periodosFechados('trimestral', 2, new Date('2026-01-15T12:00:00Z')),
  ['2025-Q4', '2025-Q3']);


assert.equal(idadeEmPeriodos('2026-09', 'mensal', HOJE), 0, 'período corrente = idade 0');
assert.equal(idadeEmPeriodos('2026-08', 'mensal', HOJE), 1, 'último fechado = idade 1');
assert.equal(idadeEmPeriodos('2026-05', 'mensal', HOJE), 4, 'AMI-05: último dado de maio');
assert.equal(idadeEmPeriodos('2026-Q3', 'trimestral', HOJE), 0);
assert.equal(idadeEmPeriodos('2026-W29', 'semanal', HOJE), 7, 'os 5 KPIs de resposta positiva pararam na W29');
assert.equal(idadeEmPeriodos('lixo', 'mensal', HOJE), null, 'rótulo irreconhecível não vira idade 0');
assert.equal(idadeEmPeriodos(null, 'mensal', HOJE), null);





assert.equal(idadeEmPeriodos('2026-W37', 'semanal', HOJE), -1);
assert.ok(ehFuturo('2026-W52', 'semanal', HOJE), '2026-W52 é futuro em 04/09/2026');
assert.ok(!ehFuturo('2026-W35', 'semanal', HOJE));
assert.ok(!ehFuturo('2026-08', 'mensal', HOJE));


assert.equal(atingiuMeta(75.7, 7, 'menor_melhor'), false, 'MKT-LEAD: 75,7 dias contra teto de 7 não atinge');
assert.equal(atingiuMeta(0, 10, 'menor_melhor'), true, 'RH-03: rotatividade zero contra teto de 10 atinge');
assert.equal(atingiuMeta(12, 10, 'maior_melhor'), true);
assert.equal(atingiuMeta(9, 10, 'maior_melhor'), false);
assert.equal(atingiuMeta(null, 10, 'maior_melhor'), null, 'sem valor não há juízo a fazer');
assert.equal(atingiuMeta(5, null, 'maior_melhor'), null, 'sem meta não há juízo a fazer');
assert.equal(atingiuMeta(5, 0, 'maior_melhor'), null, 'meta zero não divide nem julga');
assert.equal(atingiuMeta(12, 10, null), true, 'sentido ausente = maior_melhor (default do banco)');

const KPI_MENSAL = { id: 'X-01', periodicidade: 'mensal', sentido_meta: 'maior_melhor' };




{
  const c = classificar({
    kpi: KPI_MENSAL, metaPeriodo: 10, hoje: HOJE,
    valoresPorPeriodo: { '2026-05': 999 },
  });
  assert.equal(c.pontualidade, 'atrasado');
  assert.equal(c.periodos_atraso, 3, 'nenhum dos 3 períodos da janela tem valor');
  assert.equal(c.desempenho, 'nao_julgavel', 'valor de maio não julga setembro, nem pra bem nem pra mal');
  assert.notEqual(c.desempenho, 'no_alvo');
  assert.equal(c.preenchidos, 0);
  assert.equal(c.cobertura_pct, 0);
}


{
  const c = classificar({
    kpi: KPI_MENSAL, metaPeriodo: 10, hoje: HOJE,
    valoresPorPeriodo: { '2026-08': 12, '2026-07': 11, '2026-06': 15 },
  });
  assert.equal(c.pontualidade, 'em_dia');
  assert.equal(c.periodos_atraso, 0);
  assert.equal(c.desempenho, 'no_alvo');
  assert.equal(c.cobertura_pct, 100);
  assert.equal(c.periodo_recente, '2026-08');
}



{
  const c = classificar({
    kpi: KPI_MENSAL, metaPeriodo: 10, hoje: HOJE,
    valoresPorPeriodo: { '2026-07': 12 },
  });
  assert.equal(c.periodos_atraso, 1);
  assert.equal(c.desempenho, 'no_alvo', 'atraso de 1 período ainda julga');
}


{
  const c = classificar({
    kpi: KPI_MENSAL, metaPeriodo: 10, hoje: HOJE,
    valoresPorPeriodo: { '2026-08': 0 },
  });
  assert.equal(c.pontualidade, 'em_dia', 'zero preenchido é preenchimento');
  assert.equal(c.desempenho, 'abaixo', 'e zero contra meta 10 é desempenho ruim, não falta de dado');
  assert.notEqual(c.desempenho, 'sem_dado');
}



{
  const c = classificar({
    kpi: { id: 'BRG-02', periodicidade: 'semanal', sentido_meta: 'maior_melhor' },
    metaPeriodo: 10, hoje: HOJE,
    valoresPorPeriodo: { '2026-W37': 0, '2026-W52': 0 },
  });
  assert.notEqual(c.pontualidade, 'em_dia');
  assert.equal(c.preenchidos, 0);
  assert.equal(c.desempenho, 'sem_dado');
}




{
  const nunca = classificar({ kpi: KPI_MENSAL, metaPeriodo: 10, hoje: HOJE, valoresPorPeriodo: {} });
  assert.equal(nunca.pontualidade, 'nunca');
  assert.equal(nunca.periodos_atraso, null);
  const parou = classificar({ kpi: KPI_MENSAL, metaPeriodo: 10, hoje: HOJE, valoresPorPeriodo: { '2026-01': 5 } });
  assert.equal(parou.pontualidade, 'atrasado');
  assert.notEqual(parou.pontualidade, nunca.pontualidade);
}




{
  const nula = classificar({
    kpi: KPI_MENSAL, metaPeriodo: 10, hoje: HOJE,
    valoresPorPeriodo: {}, temLinhaCalculada: true, ultimoCalculoNulo: true,
  });
  assert.equal(nula.fonte, 'nula');
  const inexistente = classificar({
    kpi: KPI_MENSAL, metaPeriodo: 10, hoje: HOJE,
    valoresPorPeriodo: {}, temLinhaCalculada: false,
  });
  assert.equal(inexistente.fonte, 'inexistente');
  const viva = classificar({
    kpi: KPI_MENSAL, metaPeriodo: 10, hoje: HOJE,
    valoresPorPeriodo: { '2026-08': 3 }, temLinhaCalculada: true,
  });
  assert.equal(viva.fonte, 'viva');
}





{
  const doisAbaixo = classificar({
    kpi: KPI_MENSAL, metaPeriodo: 10, hoje: HOJE,
    valoresPorPeriodo: { '2026-08': 2, '2026-07': 3 },
  });
  assert.equal(doisAbaixo.cronico, true);

  const umAbaixo = classificar({
    kpi: KPI_MENSAL, metaPeriodo: 10, hoje: HOJE,
    valoresPorPeriodo: { '2026-08': 2, '2026-07': 30 },
  });
  assert.equal(umAbaixo.cronico, false, 'um mês ruim depois de um bom não é crônico');

  const semHistorico = classificar({
    kpi: KPI_MENSAL, metaPeriodo: 10, hoje: HOJE,
    valoresPorPeriodo: { '2026-08': 2 },
  });
  assert.equal(semHistorico.cronico, false, 'sem o período anterior não se afirma crônico');


  const tetoEstourado = classificar({
    kpi: { id: 'MKT-LEAD', periodicidade: 'semanal', sentido_meta: 'menor_melhor' },
    metaPeriodo: 7, hoje: HOJE,
    valoresPorPeriodo: { '2026-W35': 70, '2026-W34': 60 },
  });
  assert.equal(tetoEstourado.cronico, true, 'lead time acima do teto em 2 semanas seguidas é crônico');

  const tetoOk = classificar({
    kpi: { id: 'RH-03', periodicidade: 'mensal', sentido_meta: 'menor_melhor' },
    metaPeriodo: 10, hoje: HOJE,
    valoresPorPeriodo: { '2026-08': 0, '2026-07': 1 },
  });
  assert.equal(tetoOk.cronico, false, 'rotatividade zero contra teto 10 não é crônico');
  assert.equal(tetoOk.desempenho, 'no_alvo');
}




{
  const c = classificar({
    kpi: KPI_MENSAL, metaPeriodo: null, hoje: HOJE,
    valoresPorPeriodo: { '2026-08': 42 },
  });
  assert.equal(c.pontualidade, 'em_dia', 'sem meta ainda se cobra preenchimento');
  assert.equal(c.desempenho, 'sem_meta', 'mas não se afirma desempenho');
}


{
  const c = classificar({
    kpi: KPI_MENSAL, metaPeriodo: 10, janela: 6, hoje: HOJE,
    valoresPorPeriodo: { '2026-08': 1, '2026-04': 1 },
  });
  assert.equal(c.slots, 6);
  assert.equal(c.preenchidos, 2);
  assert.equal(c.cobertura_pct, 33.3);
}

console.log('kpiPontualidade: todos os asserts passaram');
