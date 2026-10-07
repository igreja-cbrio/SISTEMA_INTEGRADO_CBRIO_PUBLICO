



const assert = require('node:assert/strict');
const { parseDateBR } = require('../pixExtratoParser');



assert.equal(parseDateBR('06/08/2026'), '2026-08-06');



assert.equal(parseDateBR('26/08/2026'), '2026-08-26');


assert.equal(parseDateBR('6/8/2026'), '2026-08-06');


assert.equal(parseDateBR('2026-08-26'), '2026-08-26');


assert.equal(parseDateBR('não é uma data'), null);
assert.equal(parseDateBR(''), null);
assert.equal(parseDateBR(null), null);

console.log('santander dataBr (parseDateBR): ok');
