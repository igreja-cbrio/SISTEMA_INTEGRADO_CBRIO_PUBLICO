













const assert = require('node:assert/strict');
const {
  ordinalNoMes, semanaDoRodizio, periodoDoCulto, classificarCulto, cultoCoberto,
} = require('../utils/rodizioCulto');




assert.equal(ordinalNoMes(1), 1);
assert.equal(ordinalNoMes(7), 1);
assert.equal(ordinalNoMes(8), 2);
assert.equal(ordinalNoMes(14), 2);
assert.equal(ordinalNoMes(15), 3);
assert.equal(ordinalNoMes(22), 4);
assert.equal(ordinalNoMes(28), 4);
assert.equal(ordinalNoMes(29), 5);
assert.equal(ordinalNoMes(31), 5);




assert.equal(semanaDoRodizio(29), 1, '5ª ocorrência cai no 1º');
assert.equal(semanaDoRodizio(31), 1);
assert.equal(semanaDoRodizio(22), 4, 'a 4ª continua sendo a 4ª');


assert.equal(periodoDoCulto(8), 'manha');
assert.equal(periodoDoCulto(13), 'manha');
assert.equal(periodoDoCulto(14), 'noite');
assert.equal(periodoDoCulto(19), 'noite');



const dom23manha = classificarCulto('2026-08-23T11:30:00Z');
assert.deepEqual(
  { dia: dom23manha.dia, periodo: dom23manha.periodo, semana: dom23manha.semana },
  { dia: 'domingo', periodo: 'manha', semana: 4 },
);
const dom23noite = classificarCulto('2026-08-23T22:00:00Z');
assert.equal(dom23noite.periodo, 'noite');
assert.equal(dom23noite.semana, 4);

const qua26 = classificarCulto('2026-08-26T23:00:00Z');
assert.equal(qua26.dia, 'quarta');
assert.equal(qua26.semana, 4);





assert.equal(classificarCulto('2026-08-24T01:00:00Z').dia, 'domingo',
  '22h BRT do domingo (01h UTC de segunda) ainda é DOMINGO');
assert.equal(classificarCulto('2026-08-24T01:00:00Z').semana, 4,
  'e a semana continua a do domingo, não a do dia UTC seguinte');


const dom30 = classificarCulto('2026-08-30T11:30:00Z');
assert.equal(dom30.semana, 1, '5º domingo é coberto pelo supervisor do 1º');
assert.equal(dom30.ordinal_real, 5, 'mas a tela precisa saber que era o 5º');



assert.equal(classificarCulto('2026-08-22T17:00:00Z').dia, 'sabado', 'sábado classifica');
assert.equal(classificarCulto('2026-08-21T20:00:00Z').dia, null, 'sexta não é dia de culto');

assert.equal(classificarCulto(null), null);
assert.equal(classificarCulto('nao-e-data'), null);


const SEM_RECORTE = { culto_dia: null, culto_periodo: null, culto_semana: null };
assert.equal(cultoCoberto(SEM_RECORTE, dom23manha), true,
  'concessão sem rodízio cobre qualquer culto — é o que preserva o que já existia');
assert.equal(cultoCoberto(SEM_RECORTE, null), true,
  'e cobre até culto sem data: quem não tem recorte não é afetado por ele');

const DOM4_MANHA = { culto_dia: 'domingo', culto_periodo: 'manha', culto_semana: 4 };
assert.equal(cultoCoberto(DOM4_MANHA, dom23manha), true);
assert.equal(cultoCoberto(DOM4_MANHA, dom23noite), false, 'manhã não cobre a noite');
assert.equal(cultoCoberto(DOM4_MANHA, classificarCulto('2026-08-02T11:30:00Z')), false,
  '4ª semana não cobre o 1º domingo');
assert.equal(cultoCoberto(DOM4_MANHA, qua26), false, 'domingo não cobre quarta');


const DOM_MANHA_SEMPRE = { culto_dia: 'domingo', culto_periodo: 'manha', culto_semana: null };
assert.equal(cultoCoberto(DOM_MANHA_SEMPRE, dom23manha), true);
assert.equal(cultoCoberto(DOM_MANHA_SEMPRE, classificarCulto('2026-08-02T11:30:00Z')), true);
assert.equal(cultoCoberto(DOM_MANHA_SEMPRE, dom23noite), false);


const QUA2 = { culto_dia: 'quarta', culto_periodo: null, culto_semana: 2 };
assert.equal(cultoCoberto(QUA2, classificarCulto('2026-08-12T23:00:00Z')), true, '2ª quarta');
assert.equal(cultoCoberto(QUA2, qua26), false, '4ª quarta não é a 2ª');



const ami = classificarCulto('2026-08-22T17:00:00Z');
assert.equal(cultoCoberto(DOM4_MANHA, ami), false);
assert.equal(cultoCoberto(SEM_RECORTE, ami), true);



assert.equal(cultoCoberto(DOM4_MANHA, null), false);
