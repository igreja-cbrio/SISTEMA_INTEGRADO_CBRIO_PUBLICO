const assert = require('node:assert/strict');
const { cultoPendente } = require('./alertaCulto');













const vazio = new Set();
const base = { id: 'c1', frequencia_lancada: false, decisoes_lancadas: false };


assert.equal(cultoPendente(base, vazio), true,
  'sem submissão e sem flag nenhuma, o culto é pendente');


assert.equal(cultoPendente({ ...base, frequencia_lancada: true }, vazio), false,
  'frequência lançada tira o culto da cobrança');
assert.equal(cultoPendente({ ...base, decisoes_lancadas: true }, vazio), false,
  'decisões lançadas tiram o culto da cobrança');


assert.equal(cultoPendente(base, new Set(['c1'])), false,
  'submissão em cultos_dados_submissoes tira o culto da cobrança');
assert.equal(cultoPendente(base, new Set(['outro'])), true,
  'submissão de OUTRO culto não tira este da cobrança');





assert.equal(cultoPendente(
  { ...base, frequencia_lancada: true, presencial_adulto: 0, decisoes_presenciais: 0 }, vazio), false,
  'zero lançado com a flag marcada NÃO é pendente — não voltar a olhar os números');
