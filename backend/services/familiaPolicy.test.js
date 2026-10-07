const assert = require('node:assert/strict');
const { avaliarRelacaoFamiliar, sobrenomesEmComum, alertaMesmaPessoa } = require('./familiaPolicy');

assert.equal(avaliarRelacaoFamiliar(
  { nome: 'Ana Carolina Pereira Vieira Ferreira' },
  { nome: 'Ana Carolina Vieira' },
  { mesmoTelefone: true },
).destino, 'duplicidade', 'nome civil completo e versão curta não podem virar família');

assert.equal(avaliarRelacaoFamiliar(
  { nome: 'Carlos Eduardo Vieira' },
  { nome: 'Mariana Lopes Vieira' },
  { mesmoTelefone: true },
).destino, 'familia', 'pessoas distintas com telefone e sobrenome compartilhados devem ser revisadas como família');

assert.equal(avaliarRelacaoFamiliar(
  { nome: 'Carlos Eduardo Lima' },
  { nome: 'Mariana Lopes Vieira' },
  { mesmoTelefone: true },
).destino, 'ignorar', 'telefone sozinho não deve sugerir vínculo familiar');

assert.equal(avaliarRelacaoFamiliar(
  { nome: 'Carlos Eduardo Lima' },
  { nome: 'Mariana Lopes Vieira' },
  { mesmoEndereco: true },
).destino, 'familia', 'endereço completo e CEP permitem revisar famílias com sobrenomes diferentes');


assert.equal(avaliarRelacaoFamiliar(
  { cpf: '123.456.789-09' }, { cpf: '12345678909' }, { mesmoTelefone: true },
).destino, 'duplicidade', 'CPF igual é assunto de identidade, nunca de família');

assert.deepEqual(
  sobrenomesEmComum({ nome: 'Adulta de Modelo Exemplo' }, { nome: 'Infantil Segundo de Modelo' }),
  ['modelo'],
  'sobrenome em comum ignora o primeiro nome e tokens curtos (conectivos)',
);












const mae = {
  nome: 'ADULTA EXEMPLO FAMILIAR', email: 'familia@example.test',
  data_nascimento: '1980-01-01', cpf: '11111111111',
};
const filhoNoNome = {
  nome: 'Infantil Exemplo Familiar', email: 'familia@example.test',
  data_nascimento: '1980-01-01', cpf: '22222222222',
};

assert(alertaMesmaPessoa(mae, filhoNoNome),
  'e-mail E nascimento idênticos com CPF diferente levanta o alerta');
assert.equal(alertaMesmaPessoa(mae, { ...filhoNoNome, data_nascimento: '2010-01-01' }), null,
  'e-mail igual SOZINHO não levanta o alerta (a família compartilha a caixa)');
assert.equal(alertaMesmaPessoa({ ...mae, email: null }, filhoNoNome), null,
  'nascimento igual SOZINHO não levanta o alerta (coincidência é comum)');

const comAlerta = avaliarRelacaoFamiliar(mae, filhoNoNome, { mesmoTelefone: true });
assert.equal(comAlerta.destino, 'familia',
  'o par SEGUE em família — gêmeos têm a MESMA assinatura de sinais, e mandar pra duplicidade os faria sumir das 2 filas');
assert(comAlerta.alerta, 'e vai com o alerta pendurado, pra quem tria decidir');

console.log('familiaPolicy: cenários da fila de famílias aprovados');
