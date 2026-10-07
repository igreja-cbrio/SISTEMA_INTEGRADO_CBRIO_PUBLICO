






const assert = require('assert');
const { ehNomeDerivadoDeEmail, ehNomePlaceholder, nomeEhEnderecoDeEmail } = require('./membroMatch');


const EXEMPLOS = [
  ['exemploabc', 'exemploabc@example.test'],
  ['modeloxyz', 'modeloxyz@example.test'],
  ['modelo.pessoa', 'modelo.pessoa@example.test'],
  ['contaexemplo', 'contaexemplo@example.test'],
  ['pessoa.modelo', 'pessoa.modelo@example.test'],
  ['exemplo.pessoa', 'exemplo.pessoa@example.test'],

  ['xyz123abcd', 'xyz123abcd@example.test'],
  ['abc456wxyz', 'abc456wxyz@example.test'],

  ['totem1', 'totem1@example.test'],
  ['totem.kids4', 'totem.kids4@example.test'],
];
for (const [nome, email] of EXEMPLOS) {
  assert.equal(ehNomeDerivadoDeEmail(nome, email), true,
    `deveria detectar: ${nome} / ${email}`);
}


assert.equal(ehNomeDerivadoDeEmail('Modelo Pessoa', 'modelo.pessoa@example.test'), true,
  'ponto do prefixo virando espaço no nome ainda é derivado do e-mail');
assert.equal(ehNomeDerivadoDeEmail('PESSOA.MODELO', 'pessoa.modelo@example.test'), true,
  'comparação é insensível a caixa');
assert.equal(ehNomeDerivadoDeEmail('pessoa_modelo', 'pessoa.modelo@example.test'), true,
  '_ e . e - são equivalentes pra esta comparação');





const LEGITIMOS = [
  ['Pessoa Modelo', 'pessoa.modelo05@example.test'],
  ['Beatriz Modelo', 'contademo@example.test'],
  ['Carlos Exemplo', 'apelido123@example.test'],
  ['Paulo Modelo', 'paulomodelo@example.test'],
  ['Renato Exemplo', 'renato@example.test'],
  ['Ana', 'ana.paula.souza@example.test'],
  ['Helena Modelo', 'atividadesdemo@example.test'],
];
for (const [nome, email] of LEGITIMOS) {
  if (nome === 'Paulo Modelo') continue;
  assert.equal(ehNomeDerivadoDeEmail(nome, email), false,
    `NÃO pode detectar nome legítimo: ${nome} / ${email}`);
}






assert.equal(ehNomeDerivadoDeEmail('Paulo Modelo', 'paulomodelo@example.test'), true,
  'caso-limite documentado: nome real idêntico ao prefixo dá true');


for (const [nome, email] of [
  ['abc456wxyz', null], ['abc456wxyz', ''], ['abc456wxyz', 'sem-arroba'],
  ['', 'x@y.com'], [null, 'x@y.com'], ['   ', 'x@y.com'],
]) {
  assert.equal(ehNomeDerivadoDeEmail(nome, email), false,
    `sem e-mail válido ou sem nome deve devolver false: ${JSON.stringify([nome, email])}`);
}


assert.equal(ehNomePlaceholder('Contribuinte 059412'), true);
assert.equal(ehNomePlaceholder('Ana Contribuinte'), false, 'só o PREFIXO conta');
assert.equal(ehNomeDerivadoDeEmail('Contribuinte 059412', 'ana@x.com'), false,
  'placeholder do financeiro é outro problema, com outra guarda');




for (const nome of ['Exemplo@example.test', 'Modelo26@example.test', 'Atividadesdemo@example.test']) {
  assert.equal(nomeEhEnderecoDeEmail(nome), true, `deveria detectar: ${nome}`);
}



for (const nome of ['Ana Silva', 'Maria da Silva Souza', 'abc456wxyz', 'ana@', '@example.test', 'a@b', '', null]) {
  assert.equal(nomeEhEnderecoDeEmail(nome), false, `NÃO pode detectar: ${JSON.stringify(nome)}`);
}


assert.equal(nomeEhEnderecoDeEmail('João joao@x.com'), false);

console.log('nomeDerivadoEmail: OK (derivado do e-mail + e-mail no campo do nome)');
