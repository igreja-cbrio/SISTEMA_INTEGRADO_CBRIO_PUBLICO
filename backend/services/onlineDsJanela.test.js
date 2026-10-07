const assert = require('node:assert/strict');
const { dsJaDeviaTerColetado } = require('./onlineCollectors');










const em = (iso) => new Date(iso);


assert.equal(dsJaDeviaTerColetado('2026-08-24', em('2026-08-24T09:00:00Z')), false,
  'culto de hoje nunca pode ser cobrado');
assert.equal(dsJaDeviaTerColetado('2026-08-24', em('2026-08-24T23:59:00Z')), false,
  'culto de hoje segue fora de cobrança até o fim do dia');


assert.equal(dsJaDeviaTerColetado('2026-08-23', em('2026-08-24T09:00:00Z')), false,
  'ontem às 09:00 UTC (hora do cron de notificações) ainda NÃO pode ser cobrado');
assert.equal(dsJaDeviaTerColetado('2026-08-23', em('2026-08-24T09:59:00Z')), false,
  'um minuto antes do ds-collect também não');
assert.equal(dsJaDeviaTerColetado('2026-08-23', em('2026-08-24T10:00:00Z')), true,
  'na hora do ds-collect passa a valer');
assert.equal(dsJaDeviaTerColetado('2026-08-23', em('2026-08-24T13:00:00Z')), true,
  'depois do ds-collect a cobrança é legítima');



assert.equal(dsJaDeviaTerColetado('2026-08-22', em('2026-08-24T09:00:00Z')), true,
  'anteontem é cobrado em qualquer hora — aqui a falha real aparece');
assert.equal(dsJaDeviaTerColetado('2026-08-10', em('2026-08-24T00:30:00Z')), true,
  'culto antigo é cobrado sempre');
