


const assert = require('assert');
const {
  chavePessoa, PORTA_VINCULO, agruparPorPessoa, ordemAncora,
  FORCA, avaliarForcaOrfa, forcaPodeLote,
} = require('./inscricaoOrfas');
const { fontesUnificadas } = require('./inscricaoPortas');




const fontes = [...fontesUnificadas()].sort();
assert.deepEqual(Object.keys(PORTA_VINCULO).sort(), fontes,
  'toda fonte da vw_inscricoes_unificadas precisa de ponteiro em PORTA_VINCULO (e vice-versa)');
for (const [porta, map] of Object.entries(PORTA_VINCULO)) {
  assert.ok(map.tabela && map.col, `${porta}: tabela e coluna obrigatórias`);
}


assert.equal(PORTA_VINCULO.apresentacao_criancas.col, 'responsavel_membro_id');
assert.equal(PORTA_VINCULO.apresentacao_bebes.col, 'responsavel_membro_id');


const comTudo = { ref_id: 'r1', cpf_norm: '12345678901', telefone_norm: '21999998888', nome_display: 'Ana Silva' };
assert.equal(chavePessoa(comTudo), 'cpf:12345678901', 'CPF manda quando existe');
assert.equal(chavePessoa({ ...comTudo, cpf_norm: '123' }), 'tel:21999998888',
  'CPF incompleto NÃO identifica — cai pro telefone');
assert.equal(chavePessoa({ ref_id: 'r2', telefone_norm: '2199', nome_display: 'Ana Silva' }), 'nome:ana silva',
  'telefone curto não serve de chave');
assert.equal(chavePessoa({ ref_id: 'r3' }), 'ref:r3',
  'sem chave nenhuma cada linha fica sozinha (não agrupa por vazio)');



assert.equal(chavePessoa({ ref_id: 'r4', cpf_norm: '123.456.789-01' }), 'cpf:12345678901');
assert.equal(chavePessoa({ ref_id: 'r5', telefone_norm: '(21) 99999-8888' }), 'tel:21999998888');


assert.equal(chavePessoa({ ref_id: 'a', nome_display: 'ANTÔNIO  MARCO' }),
  chavePessoa({ ref_id: 'b', nome_display: 'antonio marco' }),
  'nome normaliza acento/caixa/espaço (mesma régua da busca de grupos)');


const linhas = [
  { porta: 'next', ref_id: 'n1', telefone_norm: '21988887777', nome_display: 'Bia Souza', criado_em: '2026-03-01T12:00:00Z' },
  { porta: 'inscricoes', ref_id: 'i1', telefone_norm: '21988887777', nome_display: 'Bia Souza', cpf_norm: '98765432100', criado_em: '2026-01-01T12:00:00Z' },
  { porta: 'batismo', ref_id: 'b1', telefone_norm: '21977776666', nome_display: 'Caio Lima', criado_em: '2026-02-01T12:00:00Z' },
];
const grupos = agruparPorPessoa(linhas);



assert.equal(grupos.size, 3, 'chaves distintas não se fundem sozinhas');
assert.deepEqual([...grupos.keys()].sort(),
  ['cpf:98765432100', 'tel:21977776666', 'tel:21988887777'].sort());

const mesmaPessoa = [
  { porta: 'next', ref_id: 'n2', telefone_norm: '21955554444', nome_display: 'Duda', criado_em: '2026-01-01T12:00:00Z' },
  { porta: 'voluntariado', ref_id: 'v2', telefone_norm: '21955554444', nome_display: 'Duda Alves', criado_em: '2026-05-01T12:00:00Z' },
];
const g2 = agruparPorPessoa(mesmaPessoa);
assert.equal(g2.size, 1, 'mesmo telefone sem CPF = uma decisão');
assert.equal(g2.get('tel:21955554444').length, 2, 'as DUAS linhas ficam na mesma pendência');
assert.equal(g2.get('tel:21955554444')[0].ref_id, 'v2', 'âncora = a mais recente quando ninguém tem CPF');



const ordenadas = [
  { ref_id: 'novo', cpf_norm: null, criado_em: '2026-06-01T12:00:00Z' },
  { ref_id: 'velho_com_cpf', cpf_norm: '11122233344', criado_em: '2024-01-01T12:00:00Z' },
].sort(ordemAncora);
assert.equal(ordenadas[0].ref_id, 'velho_com_cpf');







assert.equal(avaliarForcaOrfa(
  { cpf_norm: '111.222.333-44', nome_display: 'Ana Paula Souza', telefone_norm: null },
  { cpf: '11122233344', nome: 'ANA P. SOUZA', telefone: null },
).forca, FORCA.CPF, 'CPF igual dos dois lados é forte mesmo com nome abreviado');


assert.equal(avaliarForcaOrfa(
  { telefone_norm: '(21) 99999-8888', nome_display: 'Bia  Souza' },
  { telefone: '21999998888', nome: 'BIA SOUZA' },
).forca, FORCA.TEL_NOME, 'telefone + nome completo idêntico (acento/caixa/espaço não separam)');






const maeFilha = avaliarForcaOrfa(
  { telefone_norm: '21988887777', nome_display: 'Ana Silva' },
  { telefone: '21988887777', nome: 'Ana Carolina Silva Ferreira' },
);
assert.equal(maeFilha.forca, FORCA.MANUAL, 'primeiro nome igual + telefone NUNCA é forte');
assert.ok(/fam[ií]lia/i.test(maeFilha.motivo), 'o motivo diz por que (telefone é compartilhado em família)');


assert.equal(avaliarForcaOrfa(
  { telefone_norm: '21988887777', nome_display: '' },
  { telefone: '21988887777', nome: '' },
).forca, FORCA.MANUAL, 'telefone sozinho nunca identifica');


assert.equal(avaliarForcaOrfa(
  { cpf_norm: '111222', nome_display: 'Caio Lima', telefone_norm: '21977776666' },
  { cpf: '111222', nome: 'Outro Nome', telefone: '21977776666' },
).forca, FORCA.MANUAL, 'CPF com menos de 11 dígitos não autoriza nada');


const vetado = avaliarForcaOrfa(
  { cpf_norm: '11122233344', nome_display: 'Ana Paula Souza', nascimento: '1990-04-12' },
  { cpf: '11122233344', nome: 'Ana Paula Souza', data_nascimento: '1974-04-12' },
);
assert.equal(vetado.forca, FORCA.MANUAL, 'nascimento divergente vence o CPF igual');
assert.equal(vetado.veto, 'nascimento_divergente');


assert.equal(avaliarForcaOrfa(
  { cpf_norm: '11122233344', nome_display: 'Ana', nascimento: null },
  { cpf: '11122233344', nome: 'Ana', data_nascimento: '1974-04-12' },
).forca, FORCA.CPF, 'nascimento ausente de um lado não veta');

assert.equal(avaliarForcaOrfa(
  { cpf_norm: '11122233344', nome_display: 'Ana', nascimento: '1974-04-12T00:00:00Z' },
  { cpf: '11122233344', nome: 'Ana', data_nascimento: '1974-04-12' },
).forca, FORCA.CPF, 'comparação de nascimento é por data, não por string crua');




const cpfBrigando = avaliarForcaOrfa(
  { cpf_norm: '11122233344', nome_display: 'Duda Alves', telefone_norm: '21955554444' },
  { cpf: '55566677788', nome: 'Duda Alves', telefone: '21955554444' },
);
assert.equal(cpfBrigando.forca, FORCA.MANUAL);
assert.equal(cpfBrigando.veto, 'cpf_divergente');


assert.equal(avaliarForcaOrfa(null, null).forca, FORCA.MANUAL);
assert.equal(avaliarForcaOrfa({}, {}).forca, FORCA.MANUAL);

assert.ok(forcaPodeLote(FORCA.CPF) && forcaPodeLote(FORCA.TEL_NOME));
assert.ok(!forcaPodeLote(FORCA.MANUAL), 'manual NUNCA entra em lote');

console.log('inscricaoOrfas: OK');
