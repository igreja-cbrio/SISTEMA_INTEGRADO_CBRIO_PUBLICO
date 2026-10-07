const assert = require('assert');
const {
  validarCamposPadrao, temAbreviacaoNome, validarNascimento, splitNomeCompleto,
  honeypotPreenchido, SEXOS, TEXTOS,
} = require('./inscricaoContrato');


assert.deepEqual(splitNomeCompleto('Ana Maria da Silva'), { nome: 'Ana', sobrenome: 'Maria da Silva' });
assert.deepEqual(splitNomeCompleto('  João   Pedro '), { nome: 'João', sobrenome: 'Pedro' });


assert.equal(temAbreviacaoNome('Ana M. Silva'), true, 'ponto é abreviação');
assert.equal(temAbreviacaoNome('Ana M Silva'), true, 'uma letra é abreviação');
assert.equal(temAbreviacaoNome('Ana Maria de Souza e Silva'), false, 'conectivos são permitidos');


assert.equal(validarNascimento('1990-05-10'), '1990-05-10');
assert.equal(validarNascimento('2099-01-01'), null, 'futuro é inválido');
assert.equal(validarNascimento('1899-12-31'), null, 'antes de 1900 é inválido');
assert.equal(validarNascimento('1990-02-30'), null, 'data inexistente é inválida');
assert.equal(validarNascimento('10/05/1990'), null, 'formato BR não passa (front converte pra ISO)');


assert.equal(honeypotPreenchido({ website: 'x' }), true);
assert.equal(honeypotPreenchido({ website: '  ' }), false);
assert.equal(honeypotPreenchido({}), false);


const ok = validarCamposPadrao({
  nome_completo: 'Maria Clara dos Santos',
  telefone: '(21) 99512-8249',
  cpf: '123.456.789-09',
  email: 'Maria@Exemplo.com ',
  data_nascimento: '1995-03-08',
  sexo: 'Feminino',
  endereco: '  Rua A, 10 ',
});
assert.deepEqual(ok.erros, {}, `caso feliz não pode ter erros: ${JSON.stringify(ok.erros)}`);
assert.equal(ok.valores.nome, 'Maria');
assert.equal(ok.valores.sobrenome, 'Clara dos Santos');
assert.equal(ok.valores.telefone, '21995128249');
assert.equal(ok.valores.cpf, '12345678909');
assert.equal(ok.valores.email, 'maria@exemplo.com');
assert.equal(ok.valores.sexo, 'feminino');
assert.equal(ok.valores.endereco, 'Rua A, 10');


const ruim = validarCamposPadrao({
  nome_completo: 'Ana',
  telefone: '999999999',
  cpf: '123.456.789-08',
  email: 'sem-arroba',
  data_nascimento: '2099-01-01',
  sexo: 'outro',
});
assert.ok(ruim.erros.nome_completo, 'nome incompleto rejeita');
assert.ok(ruim.erros.telefone, 'telefone curto rejeita');
assert.ok(ruim.erros.cpf, 'CPF com DV inválido rejeita');
assert.ok(ruim.erros.email, 'e-mail inválido rejeita');
assert.ok(ruim.erros.data_nascimento, 'nascimento futuro rejeita');
assert.ok(ruim.erros.sexo, 'sexo "outro" NUNCA passa (D8)');

assert.ok(validarCamposPadrao({ nome_completo: 'Ana Lima', telefone: '219951282490' }).erros.telefone, '12 dígitos rejeita (teto 11)');


const semEndereco = validarCamposPadrao({
  nome_completo: 'Pedro Alves', telefone: '21995128249', cpf: '12345678909',
  email: 'p@x.com', data_nascimento: '1990-01-01', sexo: 'masculino',
});
assert.deepEqual(semEndereco.erros, {}, 'endereço vazio não gera erro');
assert.equal(semEndereco.valores.endereco, null);


const walkin = validarCamposPadrao(
  { nome_completo: 'José Nunes', telefone: '21995128249', sexo: 'masculino' },
  { exigirCpf: false, exigirEmail: false, exigirNascimento: false },
);
assert.deepEqual(walkin.erros, {}, 'walk-in com opts relaxadas passa');


['termos_lgpd', 'menor_responsavel', 'imagem', 'aviso_optin'].forEach((k) => {
  assert.ok(TEXTOS[k] && TEXTOS[k].length > 30, `texto canônico ${k} existe`);
});
assert.deepEqual(SEXOS, ['masculino', 'feminino']);

console.log('inscricaoContrato: contrato de campos padrão aprovado');
