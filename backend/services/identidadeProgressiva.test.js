const assert = require('assert');
const { cpfValido, pontuarPar, sexoCanonico } = require('./identidadeProgressiva');

const perfil = (id, dados = {}) => ({
  id,
  cpfs: new Set(dados.cpfs || []),
  telefones: new Set(dados.telefones || []),
  emails: new Set(dados.emails || []),
  nascimentos: new Set(dados.nascimentos || []),
  nomes: new Set(dados.nomes || []),
  generos: new Set((dados.generos || []).map(sexoCanonico).filter(Boolean)),
  fontes: new Set(dados.fontes || []),
});

assert.equal(cpfValido('123.456.789-09'), true, 'aceita CPF com DV válido');
assert.equal(cpfValido('123.456.789-08'), false, 'rejeita CPF com DV inválido');
assert.equal(cpfValido('111.111.111-11'), false, 'rejeita CPF repetido');

const a = perfil('a', { cpfs: ['12345678909'], telefones: ['21999999999'], nomes: ['ana carolina vieira'] });
const b = perfil('b', { telefones: ['21999999999'], nomes: ['ana carolina vieira'] });
const ponte = {
  cpf: '12345678909', telefone: '21999999999', email: null,
  data_nascimento: null, nome_normalizado: 'ana carolina vieira',
};
const promovido = pontuarPar(a, b, ponte);
assert(promovido.score >= 90, 'terceiro cadastro com CPF + telefone + nome promove o par');
assert.equal(promovido.prioridade, 'quase_confirmado');

const familiar = perfil('c', { telefones: ['21999999999'], nomes: ['beatriz modelo exemplo'] });
const contatoCompartilhado = pontuarPar(a, familiar, ponte);
assert(contatoCompartilhado.score < 70, 'telefone compartilhado com nome incompatível não vira alta confiança');

const cpfConflitante = perfil('d', { cpfs: ['11144477735'], telefones: ['21999999999'], nomes: ['ana carolina vieira'] });
const conflito = pontuarPar(a, cpfConflitante, ponte);
assert(conflito.score <= 25, 'CPFs válidos diferentes impedem promoção automática');
assert(conflito.contradicoes.includes('CPFs válidos diferentes'));







assert.equal(sexoCanonico('masculino'), 'm', 'aceita a forma canônica de mem_membros');
assert.equal(sexoCanonico('F'), 'f', 'aceita a forma curta do legado');
assert.equal(sexoCanonico('outro'), null, 'valor fora de m/f é AUSÊNCIA de sinal, não um 3º gênero');
assert.equal(sexoCanonico(null), null);

const soNascA = perfil('e1', { nascimentos: ['1980-01-01'], nomes: ['alice de exemplo'] });
const soNascB = perfil('e2', { nascimentos: ['1980-01-01'], nomes: ['bruno modelo ficticio'] });
const soNasc = pontuarPar(soNascA, soNascB);
assert.equal(soNasc.score, 0, 'nascimento igual SOZINHO não pontua nada');
assert(!soNasc.evidencias.some((e) => e.includes('Nascimento')), 'e não vira evidência exibida');

const ponteNasc = {
  cpf: '12345678909', telefone: null, email: null,
  data_nascimento: '1980-01-01', nome_normalizado: 'alice de exemplo',
};
const comPonte = pontuarPar(perfil('e3', { cpfs: ['12345678909'], nascimentos: ['1980-01-01'], nomes: ['alice de exemplo'] }), soNascB, ponteNasc);




assert.equal(comPonte.score, 0, 'cadastro novo que só encontra o outro lado pelo nascimento não faz ponte');
assert(!comPonte.evidencias.some((e) => e.startsWith('Novo cadastro conecta')), 'e não registra evidência de ponte');
assert.notEqual(comPonte.prioridade, 'alta');

const nascMaisNomeA = perfil('f1', { nascimentos: ['1970-01-01'], nomes: ['beatriz modelo de exemplo teste'] });
const nascMaisNomeB = perfil('f2', { nascimentos: ['1970-01-01'], nomes: ['beatriz modelo de exemplo teste'] });
const nascMaisNome = pontuarPar(nascMaisNomeA, nascMaisNomeB);
assert(nascMaisNome.score >= 45, 'nascimento COM nome compatível continua valendo (é o motivo nome_e_nascimento)');
assert(nascMaisNome.evidencias.some((e) => e.includes('Nascimento')));





const homem = perfil('g1', { telefones: ['21988887777'], nomes: ['carlos exemplo'], generos: ['masculino'] });
const mulher = perfil('g2', { telefones: ['21988887777'], nomes: ['carlos exemplo'], generos: ['feminino'] });
const vetoGenero = pontuarPar(homem, mulher);
assert(vetoGenero.score <= 25, 'gênero divergente veta o par (abaixo do piso de 30 da gravação)');
assert(vetoGenero.contradicoes.includes('Gêneros diferentes'));

const mesmoCpfSexoDif = pontuarPar(
  perfil('h1', { cpfs: ['12345678909'], nomes: ['ana carolina vieira'], generos: ['feminino'] }),
  perfil('h2', { cpfs: ['12345678909'], nomes: ['ana carolina vieira'], generos: ['masculino'] }),
);
assert(mesmoCpfSexoDif.score >= 90, 'CPF em comum vence o veto de gênero (erro de cadastro de UMA pessoa)');


const semSet = { id: 'i1', cpfs: new Set(), telefones: new Set(['21955554444']), emails: new Set(), nascimentos: new Set(), nomes: new Set(['pedro alves']), fontes: new Set() };
assert.doesNotThrow(() => pontuarPar(semSet, semSet), 'perfil sem `generos` é tolerado');











const abreviados = [
  ['alice modelo exemplo', 'alice exemplo'],
  ['beatriz modelo teste exemplo', 'beatriz exemplo'],
  ['bruno modelo e exemplo', 'bruno modelo'],
  ['carlos eduardo modelo exemplo', 'carlos eduardo exemplo'],
];
for (const [longo, curto] of abreviados) {
  const r = pontuarPar(
    perfil('ab1', { telefones: ['21900000001'], nomes: [longo] }),
    perfil('ab2', { telefones: ['21900000001'], nomes: [curto] }),
  );
  assert(r.score >= 55, `"${longo}" x "${curto}" tem que passar de 30 (telefone sozinho) — nome contido é sinal forte, não ausência de sinal`);
  assert(r.prioridade !== 'descoberta', `"${longo}" x "${curto}" não pode ficar em descoberta, que é o fim da fila`);
  assert(r.evidencias.some((e) => /vers[ãa]o abreviada/.test(e)), 'a evidência tem que DIZER que um nome é a versão abreviada do outro');
}






for (const [x, y] of [['ana souza lima', 'joao souza lima'], ['carlos eduardo vieira', 'mariana lopes vieira']]) {
  const r = pontuarPar(
    perfil('fam1', { telefones: ['21966666666'], nomes: [x] }),
    perfil('fam2', { telefones: ['21966666666'], nomes: [y] }),
  );
  assert.equal(r.score, 30, `"${x}" x "${y}" é família no mesmo telefone: fica em 30, sem ponto de nome`);
  assert.equal(r.prioridade, 'descoberta', 'família com telefone em comum continua em descoberta');
}


const identico = pontuarPar(
  perfil('id1', { telefones: ['21900000000'], nomes: ['daniel modelo exemplo'] }),
  perfil('id2', { telefones: ['21900000000'], nomes: ['daniel modelo exemplo'] }),
);
const contido = pontuarPar(
  perfil('ct1', { telefones: ['21900000000'], nomes: ['daniel modelo exemplo'] }),
  perfil('ct2', { telefones: ['21900000000'], nomes: ['daniel exemplo'] }),
);
assert(identico.score > contido.score, 'nome idêntico tem que pontuar mais que nome abreviado');

console.log('identidadeProgressiva: cenários cumulativos aprovados');
