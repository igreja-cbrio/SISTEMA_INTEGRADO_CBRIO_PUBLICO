const assert = require('assert');
const {
  CAMPOS_BASE, SEXOS, faltandoNoCadastro, validarParcialCadastro,
} = require('./volCadastroCheckin');


assert.deepEqual(CAMPOS_BASE, ['nome', 'telefone', 'cpf', 'data_nascimento', 'email', 'sexo']);
assert.deepEqual(SEXOS, ['masculino', 'feminino']);





const perfilCheio = { full_name: 'Ana Maria Silva', phone: '21995128249', cpf: '12345678909', email: 'ana@x.com' };
const membroCheio = {
  nome: 'Ana Maria Silva', telefone: '21995128249', cpf: '12345678909',
  email: 'ana@x.com', data_nascimento: '1990-05-10', genero: 'feminino',
};

assert.deepEqual(faltandoNoCadastro(perfilCheio, membroCheio), [], 'cadastro completo não falta nada');




assert.deepEqual(
  faltandoNoCadastro({ full_name: 'Ana Maria Silva', email: 'ana@x.com' }, membroCheio),
  [],
  'telefone/CPF só no membro NÃO conta como faltando',
);


assert.deepEqual(
  faltandoNoCadastro(perfilCheio, { data_nascimento: '1990-05-10', genero: 'feminino' }),
  [],
  'telefone/CPF/e-mail só no perfil NÃO conta como faltando',
);



assert.deepEqual(
  faltandoNoCadastro(perfilCheio, null),
  ['data_nascimento', 'sexo'],
  'sem membro vinculado, nascimento e sexo faltam sempre',
);

assert.deepEqual(
  faltandoNoCadastro({ full_name: 'João Pedro Souza' }, null),
  ['telefone', 'cpf', 'data_nascimento', 'email', 'sexo'],
  'perfil só com nome e sem vínculo falta os outros 5',
);


assert.deepEqual(
  faltandoNoCadastro(perfilCheio, { ...membroCheio, genero: '' }),
  ['sexo'],
  'string vazia conta como faltando',
);
assert.deepEqual(
  faltandoNoCadastro(perfilCheio, { ...membroCheio, genero: '   ' }),
  ['sexo'],
  'só espaço conta como faltando',
);


assert.deepEqual(
  faltandoNoCadastro({}, {}),
  CAMPOS_BASE,
  'tudo vazio devolve os 6 na ordem do contrato',
);

assert.deepEqual(faltandoNoCadastro(null, membroCheio), [], 'sem perfil não há o que perguntar');





const nada = validarParcialCadastro({});
assert.deepEqual(nada.erros, {}, 'corpo vazio não é erro — é o "Agora não"');
assert.deepEqual(nada.valores, {}, 'corpo vazio não grava nada');



const parcial = validarParcialCadastro({ cpf: '123.456.789-09', gender: 'F' });
assert.deepEqual(parcial.erros, {}, 'preenchimento parcial não é erro');
assert.deepEqual(parcial.valores, { cpf: '12345678909', genero: 'feminino' });


const cheio = validarParcialCadastro({
  full_name: '  Maria   Clara dos Santos ',
  phone: '(21) 99512-8249',
  cpf: '123.456.789-09',
  birth_date: '1995-03-08',
  email: '  Maria@Exemplo.COM ',
  gender: 'Feminino',
});
assert.deepEqual(cheio.erros, {}, `caso feliz sem erros: ${JSON.stringify(cheio.erros)}`);
assert.deepEqual(cheio.valores, {
  nome: 'Maria Clara dos Santos',
  telefone: '21995128249',
  cpf: '12345678909',
  dataNascimento: '1995-03-08',
  email: 'maria@exemplo.com',
  genero: 'feminino',
});


const canonico = validarParcialCadastro({
  nome: 'Maria Clara dos Santos', telefone: '21995128249',
  data_nascimento: '1995-03-08', sexo: 'feminino',
});
assert.deepEqual(canonico.erros, {});
assert.equal(canonico.valores.genero, 'feminino');


assert.equal(
  validarParcialCadastro({ phone: '+55 21 99999-8888' }).valores.telefone,
  '21999998888',
  '⚠️⚠️ truncar antes comeria os 2 últimos dígitos, irrecuperáveis',
);

assert.equal(validarParcialCadastro({ phone: '(55) 99999-8888' }).valores.telefone, '55999998888');
assert.equal(validarParcialCadastro({ phone: '2133334444' }).valores.telefone, '2133334444', 'fixo 10 dígitos');
assert.ok(validarParcialCadastro({ phone: '219999' }).erros.telefone, 'telefone curto é erro');
assert.ok(!('telefone' in validarParcialCadastro({ phone: '219999' }).valores), 'inválido não vira valor');


assert.ok(validarParcialCadastro({ cpf: '11111111111' }).erros.cpf, 'sequência repetida é erro');
assert.ok(validarParcialCadastro({ cpf: '52998224726' }).erros.cpf, 'DV errado é erro');
assert.ok(validarParcialCadastro({ cpf: '5299822472' }).erros.cpf, '10 dígitos é erro');


assert.ok(validarParcialCadastro({ full_name: 'Ana' }).erros.nome, 'nome só de primeiro nome é erro');
assert.ok(validarParcialCadastro({ full_name: 'Ana M. Silva' }).erros.nome, 'abreviação é erro');
assert.equal(
  validarParcialCadastro({ full_name: 'Ana Maria de Souza e Silva' }).valores.nome,
  'Ana Maria de Souza e Silva',
  'conectivos são permitidos',
);


assert.ok(validarParcialCadastro({ birth_date: '2099-01-01' }).erros.data_nascimento, 'futuro é erro');
assert.ok(validarParcialCadastro({ birth_date: '10/05/1990' }).erros.data_nascimento, 'formato BR não passa');
assert.ok(validarParcialCadastro({ birth_date: '1990-02-30' }).erros.data_nascimento, 'data inexistente é erro');


assert.equal(validarParcialCadastro({ gender: 'M' }).valores.genero, 'masculino', 'M vira o canônico');
assert.equal(validarParcialCadastro({ gender: 'masculino' }).valores.genero, 'masculino');
assert.ok(validarParcialCadastro({ gender: 'outro' }).erros.sexo, 'D8 — "outro" não existe');
assert.ok(!('genero' in validarParcialCadastro({ gender: 'outro' }).valores), 'irreconhecível não vira valor');


const misto = validarParcialCadastro({ cpf: '11111111111', gender: 'masculino' });
assert.ok(misto.erros.cpf);
assert.equal(misto.valores.genero, 'masculino', 'o que estava certo continua disponível');

console.log('volCadastroCheckin: régua do completar-cadastro-no-check-in aprovada');
