


const assert = require('assert');
const { patchRedeGrupo } = require('./redePatchGrupo');

const REDE = '814d8059-cc34-46a0-9186-6675ef471299';


assert.deepStrictEqual(patchRedeGrupo({}), {}, 'corpo sem rede_id nao mexe na rede');
assert.deepStrictEqual(patchRedeGrupo({ rede_id: '' }), {}, 'string vazia nao apaga');
assert.deepStrictEqual(patchRedeGrupo({ rede_id: null }), {}, 'null sozinho nao apaga');
assert.deepStrictEqual(patchRedeGrupo({ rede_id: undefined }), {}, 'undefined nao apaga');
assert.deepStrictEqual(patchRedeGrupo({ rede_id: '   ' }), {}, 'so espaco nao apaga');
assert.deepStrictEqual(patchRedeGrupo({ rede_id: '__none__' }), {}, 'sentinela da tela nao apaga');
assert.deepStrictEqual(patchRedeGrupo({ rede_id: 'null' }), {}, 'a PALAVRA null nao apaga');

assert.deepStrictEqual(
  patchRedeGrupo({ nome: 'GRUPO X', modo_inscricao: 'fechado', local: null, descricao: null }),
  {}, 'save de modo_inscricao nao pode levar a rede junto');


assert.deepStrictEqual(patchRedeGrupo({ rede_id: '', rede_limpar: true }), { rede_id: null });
assert.deepStrictEqual(patchRedeGrupo({ rede_limpar: true }), { rede_id: null }, 'pedido explicito sem o campo tambem vale');

assert.deepStrictEqual(patchRedeGrupo({ rede_limpar: 'true' }), {}, 'string "true" nao apaga');
assert.deepStrictEqual(patchRedeGrupo({ rede_limpar: 1 }), {}, '1 nao apaga');
assert.deepStrictEqual(patchRedeGrupo({ rede_limpar: false }), {}, 'false nao apaga');


assert.deepStrictEqual(patchRedeGrupo({ rede_id: REDE }), { rede_id: REDE });
assert.deepStrictEqual(patchRedeGrupo({ rede_id: `  ${REDE}  ` }), { rede_id: REDE }, 'espaco em volta nao atrapalha');
assert.deepStrictEqual(patchRedeGrupo({ rede_id: REDE.toUpperCase() }), { rede_id: REDE.toUpperCase() });


assert.deepStrictEqual(patchRedeGrupo({ rede_id: REDE, rede_limpar: true }), { rede_id: REDE });


assert.deepStrictEqual(patchRedeGrupo(null), {});
assert.deepStrictEqual(patchRedeGrupo(undefined), {});
assert.deepStrictEqual(patchRedeGrupo({ rede_id: 123 }), {}, 'numero nao e id');
assert.deepStrictEqual(patchRedeGrupo({ rede_id: { id: REDE } }), {}, 'objeto nao e id');

console.log('redePatchGrupo: OK');
