const assert = require('node:assert/strict');
const { IDS_CATALOGO, CATALOGO } = require('./comunicacaoAutomaticas');
const { DISPARO_ID: ESCALA_ID } = require('./escalaAviso');















assert.ok(IDS_CATALOGO.includes(ESCALA_ID),
  `escalaAviso.DISPARO_ID ("${ESCALA_ID}") não está no catálogo (${IDS_CATALOGO.join(', ')}) — o switch não apareceria na tela`);


assert.equal(new Set(IDS_CATALOGO).size, IDS_CATALOGO.length,
  'id duplicado no catálogo de disparos automáticos');


for (const item of CATALOGO) {
  assert.ok(item.id && typeof item.id === 'string', 'item sem id');
  assert.ok(item.nome, `item ${item.id} sem nome`);
  assert.ok(item.fonte, `item ${item.id} sem \`fonte\` — a tela precisa apontar quem dispara de verdade`);
  assert.equal(typeof item.publico, 'function', `item ${item.id} sem resolver de público`);
}




const { CONTEXTO } = require('./escalaAviso');
const itemEscala = CATALOGO.find(i => i.id === ESCALA_ID);
assert.equal(itemEscala.contexto, CONTEXTO,
  `o contexto do catálogo ("${itemEscala.contexto}") tem que ser o mesmo que o remetente grava na fila ("${CONTEXTO}")`);







const fs = require('node:fs');
const path = require('node:path');
const semComentarios = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .map((l) => l.replace(/(^|[^:"'`])\/\/[^\n]*$/, '$1'))
  .join('\n');

const TOTEM_ID = 'convertido_boas_vindas';
const membresiaSrc = semComentarios(
  fs.readFileSync(path.join(__dirname, '..', 'routes', 'membresia.js'), 'utf8'),
);

assert.ok(membresiaSrc.includes(`disparoDesligado('${TOTEM_ID}')`),
  `o remetente do totem (routes/membresia.js) não consulta disparoDesligado('${TOTEM_ID}') — o switch da tela não desligaria nada (o wa_templates.ativo de novo)`);

assert.ok(IDS_CATALOGO.includes(TOTEM_ID),
  `"${TOTEM_ID}" não está no catálogo (${IDS_CATALOGO.join(', ')}) — o switch não apareceria na tela`);

const itemTotem = CATALOGO.find((i) => i.id === TOTEM_ID);
assert.ok(membresiaSrc.includes(`contexto: '${itemTotem.contexto}'`),
  `o contexto do catálogo ("${itemTotem.contexto}") tem que ser o que o remetente grava na fila — sem isso o histórico do item vem vazio`);




const VISITANTE_ID = 'visitante_pesquisa';
const visitanteSrc = semComentarios(
  fs.readFileSync(path.join(__dirname, 'visitantePesquisa.js'), 'utf8'),
);
assert.ok(visitanteSrc.includes(`const DISPARO_ID = '${VISITANTE_ID}'`),
  `services/visitantePesquisa.js não declara DISPARO_ID = '${VISITANTE_ID}'`);
assert.ok(visitanteSrc.includes('disparoDesligado(DISPARO_ID)'),
  'o remetente da pesquisa do visitante não consulta disparoDesligado(DISPARO_ID) — o switch não desligaria nada');
assert.ok(IDS_CATALOGO.includes(VISITANTE_ID),
  `"${VISITANTE_ID}" não está no catálogo (${IDS_CATALOGO.join(', ')}) — o switch não apareceria na tela`);
const itemVisitante = CATALOGO.find((i) => i.id === VISITANTE_ID);
assert.ok(visitanteSrc.includes(`const CONTEXTO = '${itemVisitante.contexto}'`),
  `o contexto do catálogo ("${itemVisitante.contexto}") tem que ser o que o remetente grava na fila`);





const VARREDURA_ID = 'bot_varredura_mensal';
const varreduraSrc = semComentarios(
  fs.readFileSync(path.join(__dirname, 'botIaVarredura.js'), 'utf8'),
);
assert.ok(varreduraSrc.includes(`const DISPARO_ID = '${VARREDURA_ID}'`),
  `services/botIaVarredura.js não declara DISPARO_ID = '${VARREDURA_ID}'`);
assert.ok(varreduraSrc.includes('disparoDesligado(DISPARO_ID)'),
  'o remetente da varredura mensal não consulta disparoDesligado(DISPARO_ID) — o switch não desligaria nada');
assert.ok(IDS_CATALOGO.includes(VARREDURA_ID),
  `"${VARREDURA_ID}" não está no catálogo (${IDS_CATALOGO.join(', ')}) — o switch não apareceria na tela`);
const itemVarredura = CATALOGO.find((i) => i.id === VARREDURA_ID);
assert.equal(itemVarredura.envTemplate, null,
  'a varredura é e-mail — declarar envTemplate pintaria de vermelho um disparo configurado');

console.log('disparoInterruptor: OK');
