const assert = require('assert');
const {
  META_CAMPUS,
  META_MENSAL,
  agruparArrecadacaoMensal,
  calcularGenerosidade,
} = require('./marketingGenerosidade');

const agora = new Date('2026-07-28T12:00:00-03:00');

const base = calcularGenerosidade([
  { mes: '2026-01', arrecadado: 900_000, qtd_lancamentos: 10 },
  { mes: '2026-02', arrecadado: 1_200_000, qtd_lancamentos: 12 },
  { mes: '2026-03', arrecadado: 700_000, qtd_lancamentos: 8 },
  { mes: '2026-04', arrecadado: 1_500_000, qtd_lancamentos: 15 },
  { mes: '2026-05', arrecadado: 1_000_000, qtd_lancamentos: 9 },
], 2026, agora);

assert.equal(base.configuracao.meta_mensal, META_MENSAL);
assert.equal(base.configuracao.meta_campus, META_CAMPUS);
assert.equal(base.meses[0].percentual_mensal, 90);
assert.equal(base.meses[0].excedente_campus, 0);
assert.equal(base.meses[1].percentual_mensal, 120);
assert.equal(base.meses[1].excedente_campus, 200_000);
assert.equal(base.meses[1].campus_acumulado, 200_000);
assert.equal(base.meses[2].campus_acumulado, 200_000, 'mês abaixo da meta não reduz o campus');
assert.equal(base.meses[3].campus_acumulado, 700_000);
assert.equal(base.meses[4].excedente_campus, 0, 'valor igual à meta não gera excedente');
assert.equal(base.meses[5].tem_dados, false, 'mês sem balanço é distinguido de zero conhecido');
assert.equal(base.meses[6].parcial, true);
assert.equal(base.meses[7].futuro, true);

const acimaDaMetaCampus = calcularGenerosidade([
  { mes: '2026-01', arrecadado: 9_300_000, qtd_lancamentos: 1 },
], 2026, agora);
assert.equal(acimaDaMetaCampus.meses[0].campus_acumulado, 8_300_000);
assert.equal(acimaDaMetaCampus.meses[0].percentual_campus, 103.75);
assert.equal(acimaDaMetaCampus.meses[0].falta_meta_campus, 0);

const agregado = agruparArrecadacaoMensal([
  { data_competencia: '2026-01-03', valor: '400000.25' },
  { data_competencia: '2026-01-28', valor: '600000.25' },
  { data_competencia: '2026-02-01', valor: 250000 },
  { data_competencia: null, valor: 999999 },
]);
assert.deepEqual(agregado, [
  { mes: '2026-01', arrecadado: 1_000_000.50, qtd_lancamentos: 2 },
  { mes: '2026-02', arrecadado: 250_000, qtd_lancamentos: 1 },
]);

console.log('marketingGenerosidade: regra mensal e acumulado do campus aprovados');












const { combinarComReceitaTotal } = require('./marketingGenerosidade');

{
  const mensal = [{ mes: '2026-08', arrecadado: 733_461.87, qtd_lancamentos: 1800 }];

  const totais = [
    { mes: '2026-08', receita: 300_000, receita_extraordinaria: 60_000 },
    { mes: '2026-08', receita: 250_000, receita_extraordinaria: 0 },
    { mes: '2026-08', receita: 255_267.90, receita_extraordinaria: 0 },
  ];
  const [r] = combinarComReceitaTotal(mensal, totais);
  assert.equal(r.arrecadado, 733_461.87, 'arrecadado NÃO pode mudar');
  assert.equal(r.receita_total, 805_267.90, 'soma os decêndios do mês');
  assert.equal(r.receita_extraordinaria, 60_000);
  assert.equal(r.outras_receitas, 71_806.03, 'a diferença medida em agosto');
  assert.equal(r.divergencia, null);
}

{


  const [r] = combinarComReceitaTotal(
    [{ mes: '2026-09', arrecadado: 1000, qtd_lancamentos: 2 }], [],
  );
  assert.equal(r.arrecadado, 1000);
  assert.equal(r.receita_total, undefined, 'ausente não é zero');
  assert.equal('receita_total' in r, false);
}

{


  const [r] = combinarComReceitaTotal(
    [{ mes: '2026-08', arrecadado: 1000, qtd_lancamentos: 1 }],
    [{ mes: '2026-08', receita: 700, receita_extraordinaria: 0 }],
  );
  assert.equal(r.outras_receitas, null);
  assert.equal(r.divergencia, -300);
}

{

  const [r] = combinarComReceitaTotal(
    [{ mes: '2026-08', arrecadado: 500, qtd_lancamentos: 1 }],
    [{ mes: '2026-08', receita: 500, receita_extraordinaria: 0 }],
  );
  assert.equal(r.outras_receitas, 0);
}

{

  assert.deepEqual(combinarComReceitaTotal([], []), []);
  assert.deepEqual(combinarComReceitaTotal(null, null), []);
  const [r] = combinarComReceitaTotal(
    [{ mes: '2026-08', arrecadado: 10, qtd_lancamentos: 1 }],
    [{ mes: 'lixo', receita: 999 }, { receita: 999 }],
  );
  assert.equal(r.receita_total, undefined);
}









{
  const snap = calcularGenerosidade(
    combinarComReceitaTotal(
      [{ mes: '2026-01', arrecadado: 900_000, qtd_lancamentos: 10 }],
      [{ mes: '2026-01', receita: 2_000_000, receita_extraordinaria: 0 }],
    ),
    2026,
    new Date('2026-07-28T12:00:00-03:00'),
  );
  const jan = snap.meses.find((m) => m.mes === '2026-01');
  assert.equal(jan.arrecadado, 900_000, 'dízimos e ofertas continuam expostos');
  assert.equal(jan.receita_total, 2_000_000);
  assert.equal(jan.base_meta, 2_000_000, 'a barra mede o TOTAL');
  assert.equal(jan.base_meta_origem, 'receita_total');
  assert.equal(jan.percentual_mensal, 200);
  assert.equal(jan.excedente_campus, 1_000_000, 'o excedente vem do TOTAL');
  assert.equal(jan.campus_acumulado, 1_000_000);
  assert.equal(jan.falta_meta_mensal, 0);
}

{



  const snap = calcularGenerosidade(
    [{ mes: '2026-01', arrecadado: 900_000, qtd_lancamentos: 10 }],
    2026,
    new Date('2026-07-28T12:00:00-03:00'),
  );
  const jan = snap.meses.find((m) => m.mes === '2026-01');
  assert.equal(jan.base_meta, 900_000);
  assert.equal(jan.base_meta_origem, 'dizimos_ofertas');
  assert.equal(jan.excedente_campus, 0);
  assert.equal(jan.falta_meta_mensal, 100_000);
}

{


  const snap = calcularGenerosidade(
    [{ mes: '2026-01', arrecadado: 900_000, receita_total: 0, qtd_lancamentos: 10 }],
    2026,
    new Date('2026-07-28T12:00:00-03:00'),
  );
  const jan = snap.meses.find((m) => m.mes === '2026-01');
  assert.equal(jan.base_meta, 0);
  assert.equal(jan.base_meta_origem, 'receita_total');
  assert.equal(jan.percentual_mensal, 0);
}

{

  const snap = calcularGenerosidade([
    { mes: '2026-07', arrecadado: 948_336.56, receita_total: 3_056_235.72, qtd_lancamentos: 900 },
  ], 2026, new Date('2026-08-23T12:00:00-03:00'));
  const jul = snap.meses.find((m) => m.mes === '2026-07');
  assert.equal(jul.base_meta, 3_056_235.72);
  assert.equal(jul.excedente_campus, 2_056_235.72);
  assert.equal(jul.arrecadado, 948_336.56, 'o número de dízimos não se perde');
}

console.log('✓ receita total ao lado da generosidade');
