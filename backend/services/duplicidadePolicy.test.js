const assert = require('node:assert/strict');
const { avaliarPossivelDuplicidade, nomesPodemSerMesmaPessoa, ehStubDeLogin } = require('./duplicidadePolicy');

const davi = { nome: 'Davi Lucas Bernardo Conceição', telefone: '21999999999', cpf: '12345678909', email: 'davi@teste.com', genero: 'masculino' };
const bianca = { nome: 'Bianca Silva Bernardo', telefone: '21999999999', cpf: '11144477735', email: 'bianca@teste.com', genero: 'feminino' };
assert.equal(avaliarPossivelDuplicidade(davi, bianca).incluir, false, 'telefone compartilhado com identidade divergente não pode entrar');

assert.equal(avaliarPossivelDuplicidade(
  { nome: 'João da Silva', telefone: '21988887777' },
  { nome: 'Joao da Silva', telefone: '(21) 98888-7777' },
).incluir, true, 'telefone + nome compatível deve ir para revisão');

assert.equal(avaliarPossivelDuplicidade(
  { nome: 'Maria Souza', cpf: '12345678909' },
  { nome: 'M. Souza', cpf: '123.456.789-09' },
).prioridade, 'alta', 'CPF igual deve ser evidência forte');

assert.equal(avaliarPossivelDuplicidade(
  { nome: 'Ana Lima', telefone: '21977776666' },
  { nome: 'Carlos Pereira', telefone: '21977776666' },
).incluir, false, 'telefone sozinho nunca basta');

assert.equal(nomesPodemSerMesmaPessoa(
  'Ana Carolina Pereira Vieira Ferreira',
  'Ana Carolina Vieira',
), true, 'nome abreviado contido no nome completo deve ser tratado como possível duplicidade');

assert.equal(avaliarPossivelDuplicidade(
  { nome: 'Ana Carolina Pereira Vieira Ferreira', telefone: '21966665555' },
  { nome: 'Ana Carolina Vieira', telefone: '21966665555' },
).incluir, true, 'nome abreviado + mesmo telefone deve ir para duplicidades');

assert.equal(nomesPodemSerMesmaPessoa(
  'Carlos Eduardo Vieira',
  'Mariana Lopes Vieira',
), false, 'pessoas com primeiro nome diferente e sobrenome familiar igual continuam distintas');





const stubVictoria = { nome: 'Beatriz Modelo', email: 'contademo@example.test', origem_cadastro: 'auth' };
const victoriaCompleta = {
  nome: 'Ana Beatriz Modelo Exemplo', email: 'contademo@example.test',
  cpf: '12345678909', telefone: '21988887777', origem_cadastro: 'membresia_aprovacao',
};
assert.equal(nomesPodemSerMesmaPessoa(stubVictoria.nome, victoriaCompleta.nome), false,
  'a regra geral continua recusando: primeiro nome diferente');
assert.equal(avaliarPossivelDuplicidade(stubVictoria, victoriaCompleta).incluir, true,
  'stub de login com o mesmo e-mail e nome contido DEVE entrar na fila');
assert.equal(avaliarPossivelDuplicidade(stubVictoria, victoriaCompleta).prioridade, 'alta');
assert.equal(avaliarPossivelDuplicidade(victoriaCompleta, stubVictoria).incluir, true,
  'a ordem dos argumentos não pode mudar o veredito');




assert.equal(avaliarPossivelDuplicidade(
  { nome: 'Ana Souza Lima', email: 'casal@gmail.com', origem_cadastro: 'auth' },
  { nome: 'João Souza Lima', email: 'casal@gmail.com', cpf: '12345678909' },
).incluir, false, 'cônjuges no mesmo e-mail NÃO podem entrar (só 2 de 3 tokens em comum)');


assert.equal(avaliarPossivelDuplicidade(
  { nome: 'Beatriz Modelo', email: 'x@y.com', cpf: '12345678909', origem_cadastro: 'wifi' },
  { nome: 'Ana Beatriz Modelo Exemplo', email: 'x@y.com', telefone: '21988887777' },
).incluir, false, 'sem stub de login, primeiro nome diferente continua fora');


assert.equal(avaliarPossivelDuplicidade(
  { nome: 'Beatriz Modelo', email: 'outro@gmail.com', origem_cadastro: 'auth' },
  victoriaCompleta,
).incluir, false, 'e-mail diferente: o stub não liga');


assert.equal(avaliarPossivelDuplicidade(
  { ...stubVictoria, data_nascimento: '1990-01-01' },
  { ...victoriaCompleta, data_nascimento: '1975-05-05' },
).incluir, false, 'nascimentos diferentes barram o stub também');

assert.equal(ehStubDeLogin({ origem_cadastro: 'auth' }), true);
assert.equal(ehStubDeLogin({ origem_cadastro: 'auth', cpf: '12345678909' }), false,
  'com CPF já não é stub — tem chave de identidade própria');
assert.equal(ehStubDeLogin({ origem_cadastro: 'auth', telefone: '21988887777' }), false);
assert.equal(ehStubDeLogin({ origem_cadastro: 'wifi' }), false);

console.log('duplicidadePolicy: 7 cenários + stub de login aprovados');

