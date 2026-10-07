const assert = require('node:assert/strict');
const { ordenarPorPreferencia } = require('../utils/preferenciaRodizio');

const ana = { id: 'a', full_name: 'Ana', rodizio_semana: 2 };
const bia = { id: 'b', full_name: 'Bia', rodizio_semana: null };
const caio = { id: 'c', full_name: 'Caio', rodizio_semana: 1 };
const dora = { id: 'd', full_name: 'Dora', rodizio_semana: 1 };
const edu = { id: 'e', full_name: 'Édu', rodizio_semana: 3 };

const nomes = (l) => l.map((p) => p.full_name);


assert.deepEqual(nomes(ordenarPorPreferencia([ana, bia, caio, dora, edu], 1)), ['Caio', 'Dora', 'Bia', 'Ana', 'Édu']);

assert.deepEqual(nomes(ordenarPorPreferencia([ana, bia, caio, dora, edu], 2)), ['Ana', 'Bia', 'Caio', 'Dora', 'Édu']);

const r1 = ordenarPorPreferencia([ana, bia, caio], 1);
assert.deepEqual(r1.map((p) => p.prefere_este_culto), [true, false, false]);

const r0 = ordenarPorPreferencia([edu, ana, caio], null);
assert.deepEqual(nomes(r0), ['Ana', 'Caio', 'Édu']);
assert.equal(r0.some((p) => p.prefere_este_culto), false);

assert.deepEqual(nomes(ordenarPorPreferencia([ana, caio], '2')), ['Ana', 'Caio']);

const entrada = [ana, bia, caio];
const saida = ordenarPorPreferencia(entrada, 1);
assert.equal(entrada[0], ana, 'entrada intacta');
assert.equal(saida.length, 3);

assert.deepEqual(nomes(ordenarPorPreferencia([edu, dora, { id: 'f', full_name: 'Fábio', rodizio_semana: null }], null)), ['Dora', 'Édu', 'Fábio']);
console.log('preferenciaRodizio.test.js OK');
