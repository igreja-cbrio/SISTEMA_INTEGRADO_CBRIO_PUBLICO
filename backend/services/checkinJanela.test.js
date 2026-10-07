













const assert = require('node:assert/strict');
const { diaBRT, ehDiaDoCulto } = require('../utils/janelaCulto');


assert.equal(diaBRT('2026-08-23T22:00:00Z'), '2026-08-23',
  'domingo 19h BRT (22h UTC) tem que ser dia 23, não 23 em UTC por sorte');
assert.equal(diaBRT('2026-08-24T01:30:00Z'), '2026-08-23',
  '22h30 BRT do domingo já é 01h30 UTC de segunda — a data BRT ainda é domingo');
assert.equal(diaBRT('2026-08-23T02:00:00Z'), '2026-08-22',
  '23h BRT do sábado é 02h UTC do domingo — a data BRT ainda é sábado');
assert.equal(diaBRT(null), null);
assert.equal(diaBRT('nao-e-data'), null);



assert.equal(
  ehDiaDoCulto('2026-08-23T22:00:00Z', new Date('2026-08-24T00:30:00Z')).ok, true,
  'culto domingo 19h, agora 21h30 BRT do mesmo domingo → janela ABERTA (em UTC já virou segunda)',
);
assert.equal(
  ehDiaDoCulto('2026-08-23T22:00:00Z', new Date('2026-08-24T02:59:00Z')).ok, true,
  '23h59 BRT do domingo ainda é o dia do culto',
);
assert.equal(
  ehDiaDoCulto('2026-08-23T22:00:00Z', new Date('2026-08-24T03:01:00Z')).ok, false,
  '00h01 BRT de segunda já fechou',
);


const manha = '2026-08-23T11:30:00Z';
assert.equal(ehDiaDoCulto(manha, new Date('2026-08-23T09:00:00Z')).ok, true,
  '06h BRT do mesmo dia (antes do culto) já abre — é o dia inteiro, decisão do Matheus');
assert.equal(ehDiaDoCulto(manha, new Date('2026-08-24T01:00:00Z')).ok, true,
  '22h BRT do mesmo dia ainda abre — o preço aceito de "dia inteiro"');
assert.equal(ehDiaDoCulto(manha, new Date('2026-08-22T20:00:00Z')).ok, false,
  'véspera não abre');


const fora = ehDiaDoCulto(manha, new Date('2026-05-10T15:00:00Z'));
assert.equal(fora.ok, false);
assert.equal(fora.motivo, 'fora_do_dia');
assert.equal(fora.dia, '2026-08-23', 'devolve o dia do culto pra tela dizer QUAL era');



assert.equal(ehDiaDoCulto(null, new Date('2026-08-23T15:00:00Z')).motivo, 'sem_data');




assert.equal(diaBRT('2026-01-15T02:00:00Z'), '2026-01-14',
  'janeiro (verão) segue -03:00 e a conversão continua pela timeZone, não por offset fixo');













const fs = require('node:fs');
const path = require('node:path');

function semComentarios(js) {
  const s = String(js).replace(/\r\n?/g, '\n');
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}
const rotas = semComentarios(fs.readFileSync(path.join(__dirname, '..', 'routes', 'app.js'), 'utf8'));


function corpoDaRota(re) {
  const m = re.exec(rotas);
  assert(m, `não achei a rota (${re}) — se ela mudou de forma, este teste precisa acompanhar`);
  return rotas.slice(m.index, m.index + 6000);
}

const post = corpoDaRota(/router\.post\('\/voluntariado\/checkin'/);
assert(/cultoEhHoje\(/.test(post),
  'o POST de check-in tem que chamar cultoEhHoje: sem a janela, presença de culto antigo entra hoje e a frequência aceita retroativo sem trilha');
assert(/checkinSobSupervisao\(/.test(post),
  'o POST de check-in tem que chamar checkinSobSupervisao: sem o escopo, supervisor de uma área bate ponto de outra — o furo de 18/08 um nível abaixo');

const del = corpoDaRota(/router\.delete\('\/voluntariado\/checkin\/:id'/);
assert(/cultoEhHoje\(/.test(del),
  'o DELETE tem que checar a janela: desfazer fora do dia é reescrever frequência passada');
assert(/checkinSobSupervisao\(/.test(del),
  'o DELETE tem que checar o escopo — um DELETE só com o id seria a porta dos fundos do endpoint inteiro (lição do escalaSobSupervisao: vale pra MOVER e REMOVER)');
assert(/audit_log/.test(del),
  'o DELETE tem que deixar trilha em audit_log: é hard delete (os uniques são parciais) e sem trilha a presença desaparece sem autor');




const janelaNoPost = post.slice(0, post.indexOf('cultoEhHoje('));
assert(!/if \(!supervisionaTudo\([^)]*\)\) \{[^}]*$/.test(janelaNoPost),
  'a checagem de janela não pode estar aninhada num if de supervisionaTudo — ela vale para o curinga também');
