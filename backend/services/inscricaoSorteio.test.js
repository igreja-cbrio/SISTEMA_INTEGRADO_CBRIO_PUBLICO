

const assert = require('assert');
const { chavePessoaInscricao, elegiveisDoSorteio, motivoSemElegivel } = require('./inscricaoSorteio');

const base = (o) => ({ status: 'confirmada', numero_sorte: 1000, ...o });


const insc = [
  base({ id: 'a', nome_completo: 'Ana', numero_sorte: 1111 }),
  base({ id: 'b', nome_completo: 'Bia', numero_sorte: 2222 }),
  base({ id: 'c', nome_completo: 'Caio', numero_sorte: 3333 }),
];
assert.deepEqual(elegiveisDoSorteio({ inscritos: insc, presentesIds: ['b'] }).map((i) => i.id), ['b'],
  'quem não fez check-in NÃO concorre');
assert.deepEqual(elegiveisDoSorteio({ inscritos: insc, presentesIds: [] }), [],
  'sem check-in nenhum, ninguém concorre (não cai pro bolo antigo)');




const legado = [
  base({ id: 'L', nome_completo: 'Legada Sem CPF', numero_sorte: 4444, cpf: null, membro_id: null, legado_fonte: 'ext_inscricoes' }),
  base({ id: 'N', nome_completo: 'Nova Com CPF', numero_sorte: 5555, cpf: '12345678901', membro_id: 'm1' }),
];
assert.deepEqual(elegiveisDoSorteio({ inscritos: legado, presentesIds: ['L', 'N'] }).map((i) => i.id), ['L', 'N'],
  'migrada sem CPF concorre igual à nova');


const comGanho = elegiveisDoSorteio({
  inscritos: insc, presentesIds: ['a', 'b', 'c'],
  sorteios: [{ inscricao_id: 'a', premio: 'Kit' }],
});
assert.deepEqual(comGanho.map((i) => i.id), ['b', 'c'], 'quem já ganhou sai do bolo');



const duasLinhas = [
  base({ id: 'x1', nome_completo: 'Duda', telefone: '21955554444', numero_sorte: 6001 }),
  base({ id: 'x2', nome_completo: 'Duda Alves', telefone: '21955554444', numero_sorte: 6002 }),
  base({ id: 'y', nome_completo: 'Outra', telefone: '21933332222', numero_sorte: 7001 }),
];
assert.deepEqual(
  elegiveisDoSorteio({ inscritos: duasLinhas, presentesIds: ['x1', 'x2', 'y'], sorteios: [{ inscricao_id: 'x1' }] })
    .map((i) => i.id),
  ['y'], 'a 2ª inscrição da MESMA pessoa não dá segunda chance');

const porMembro = [
  base({ id: 'm_1', nome_completo: 'JOSE DA SILVA', membro_id: 'mm', numero_sorte: 8001 }),
  base({ id: 'm_2', nome_completo: 'José Silva', membro_id: 'mm', numero_sorte: 8002 }),
];
assert.equal(elegiveisDoSorteio({ inscritos: porMembro, presentesIds: ['m_1', 'm_2'], sorteios: [{ inscricao_id: 'm_2' }] }).length, 0,
  'membro_id casa mesmo com grafia diferente');


assert.deepEqual(
  elegiveisDoSorteio({
    inscritos: insc, presentesIds: ['a', 'b'],
    sorteios: [{ inscricao_id: 'a', substituido_em: '2026-08-29T12:00:00Z' }],
  }).map((i) => i.id),
  ['a', 'b'], 'ganhador trocado volta a concorrer (não ficou com prêmio)');


assert.deepEqual(
  elegiveisDoSorteio({
    inscritos: [base({ id: 'k', status: 'cancelada', numero_sorte: 9 }), base({ id: 'j', numero_sorte: null })],
    presentesIds: ['k', 'j'],
  }), [], 'cancelada e sem número não concorrem');


assert.equal(chavePessoaInscricao({ id: 'i', membro_id: 'M', cpf: '12345678901', telefone: '21999998888' }), 'mem:M');
assert.equal(chavePessoaInscricao({ id: 'i', cpf: '123.456.789-01', telefone: '21999998888' }), 'cpf:12345678901');
assert.equal(chavePessoaInscricao({ id: 'i', cpf: '123', telefone: '(21) 99999-8888' }), 'tel:21999998888');
assert.equal(chavePessoaInscricao({ id: 'i', nome_completo: 'ANTÔNIO  Marco' }), 'nome:antonio marco');
assert.equal(chavePessoaInscricao({ id: 'i' }), 'insc:i');


assert.equal(motivoSemElegivel({ inscritos: [] }).motivo, 'sem_inscritos');
assert.equal(motivoSemElegivel({ inscritos: insc, presentesIds: [] }).motivo, 'ninguem_presente');
const m = motivoSemElegivel({ inscritos: insc, presentesIds: ['a'], sorteios: [{ inscricao_id: 'a' }] });
assert.equal(m.motivo, 'todos_presentes_ja_ganharam');
assert.equal(m.presentes, 1);
assert.equal(m.ativos, 3);

console.log('inscricaoSorteio: OK · check-in obrigatório, legado concorre, 1 prêmio por pessoa');
