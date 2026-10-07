







const assert = require('assert');
const { nomeMaisCompleto } = require('./identidadeProgressiva');


assert.equal(
  nomeMaisCompleto('Bruno Exemplo', 'Bruno dos Modelos Exemplo'),
  'Bruno dos Modelos Exemplo',
  'caso Bruno (10/08): declarado estende o atual com sobrenomes do meio');
assert.equal(
  nomeMaisCompleto('Beatriz Modelo', 'Maria Beatriz Modelo Exemplo'),
  'Maria Beatriz Modelo Exemplo',
  'caso Maria Beatriz (02/08): nome abreviado do provedor vira o legal completo');
assert.equal(
  nomeMaisCompleto('BRUNO DOS MODELOS EXEMPLO', 'Bruno dos Modelos Exemplo'),
  null,
  'mesmo nome em caixa diferente NÃO gera churn de escrita');


assert.equal(nomeMaisCompleto('Bruno dos Modelos Exemplo', 'Bruno Exemplo'), null,
  'declarado mais curto nunca vence');
assert.equal(nomeMaisCompleto('Maria Silva', 'Maria Souza'), null,
  'token trocado não é abreviação — pode ser outra pessoa');


assert.equal(nomeMaisCompleto('Bruno Exemplo', 'Exemplo Bruno dos Modelos'), null,
  'tokens fora de ordem não casam');


assert.equal(nomeMaisCompleto('Maria da Silva', 'Maria Silva Santos'), null,
  'todo token do atual precisa estar no declarado');
assert.equal(nomeMaisCompleto('Ana Souza Lima', 'João Souza Lima Pereira'), null,
  'primeiro nome diferente (cônjuges no mesmo e-mail) nunca promove');


assert.equal(nomeMaisCompleto('Bruno Exemplo', 'Bruno'), null,
  '1 token não é nome completo');
assert.equal(nomeMaisCompleto('Bruno Exemplo', ''), null, 'vazio não promove');
assert.equal(nomeMaisCompleto('Bruno Exemplo', null), null, 'null não promove');
assert.equal(nomeMaisCompleto('Ana Silva', 'Contribuinte 059412 Ana Silva'), null,
  'placeholder do financeiro nunca vira nome');
assert.equal(nomeMaisCompleto('Ana Silva', 'ana.silva@example.test'), null,
  'e-mail no campo de nome não é nome');


assert.equal(nomeMaisCompleto('Sem nome', 'Ana Paula Souza'), 'Ana Paula Souza');
assert.equal(nomeMaisCompleto('', 'Ana Paula Souza'), 'Ana Paula Souza');
assert.equal(nomeMaisCompleto(null, 'Ana Paula Souza'), 'Ana Paula Souza');


assert.equal(nomeMaisCompleto('Ana P', 'Ana Paula'), 'Ana Paula',
  'token de 1 letra casa com token que começa por ela');
assert.equal(nomeMaisCompleto('Ana P Souza', 'Ana Paula Souza'), 'Ana Paula Souza');
assert.equal(nomeMaisCompleto('Ana Paula', 'Ana Pereira'), null,
  'a expansão só vale pra token de UMA letra — prefixo maior não casa');


assert.equal(
  nomeMaisCompleto('Paulo Modelo Junior', 'Paulo Modelo Exemplo Junior Paulo Junior'),
  null,
  'token repetido fora de conectivo = nome sujo, não nome mais completo');
assert.equal(
  nomeMaisCompleto('Ana Souza', 'Ana Souza de Oliveira e de Castro'),
  'Ana Souza de Oliveira e de Castro',
  'conectivo repetido (de/e) é normal em nome de gente');


assert.equal(
  nomeMaisCompleto('Carolina Modelo Exemplo', 'carolina modelo exemplo teste'),
  'Carolina Modelo Exemplo Teste');
assert.equal(
  nomeMaisCompleto('Ana Silva', 'ana silva de souza'),
  'Ana Silva de Souza',
  'conectivo fica minúsculo na capitalização');
assert.equal(
  nomeMaisCompleto('Ana Silva', 'ANA SILVA DE SOUZA'),
  'ANA SILVA DE SOUZA',
  'CAIXA ALTA fica como digitado — metade da base é assim');


assert.equal(
  nomeMaisCompleto('Antonio Marco Pereira', 'Antônio  Marco   Pereira da Silva'),
  'Antônio Marco Pereira da Silva',
  'comparação sem acento; o gravado preserva o que a pessoa digitou (espaços colapsados)');

console.log('nomeMaisCompleto.test.js: todos os casos passaram');
