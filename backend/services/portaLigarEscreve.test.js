























const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function semComentarios(js) {
  const s = String(js).replace(/\r\n?/g, '\n');
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const arquivo = path.join(__dirname, 'inscricaoContrato.js');
const fonte = semComentarios(fs.readFileSync(arquivo, 'utf8'));


const ramo = /acharMembroGuardado\(([\s\S]*?)return \{ membroId/.exec(fonte);
assert(ramo, 'não achei o ramo da política "ligar" em processarIdentidade — se ele mudou de forma, este teste precisa acompanhar');
const corpo = ramo[1];


assert(/registrarContatoDaPorta\s*\(/.test(corpo),
  'o ramo "ligar" tem que chamar registrarContatoDaPorta: sem isso o telefone/e-mail que a pessoa digitou não entra em mem_contatos e a PRÓXIMA porta não acha a pessoa por ele (nasce órfã de novo)');
assert(/registrarContatoDaPorta/.test(
  /const \{[^}]*\} = require\('\.\/membroMatch'\)/.exec(fonte)?.[0] || ''),
  'registrarContatoDaPorta tem que vir de ./membroMatch — é a MESMA função do match, não duplicar a régua');


assert(/reconciliarCpfTardio/.test(corpo),
  'o ramo "ligar" tem que consolidar o CPF via reconciliarCpfTardio: é ele que sabe a régua (preenche só se o membro está SEM CPF, conflito vira pendência, nunca funde sozinho)');





assert(/confianca:\s*matchedBy === 'nome\+nascimento' \? 'forte' : 'fraca'/.test(corpo),
  "a confiança tem que ser 'forte' só para nome+nascimento (que já conferiu a data por construção) e 'fraca' para o resto — passar 'forte' direto deixaria o CPF de um homônimo virar identidade do outro");


assert(/matchedBy !== 'cpf'/.test(corpo),
  'match por CPF deve ser excluído da consolidação: o membro já tem exatamente esse CPF, e chamar o reconciliador ali é trabalho inútil no caminho quente da porta');




assert((corpo.match(/try \{/g) || []).length >= 2,
  'as duas escritas têm que ser best-effort (try/catch cada): falha ao acumular contato ou consolidar CPF não pode derrubar a inscrição da pessoa');


assert(/if \(membroId\) \{/.test(corpo),
  'as escritas têm que estar sob `if (membroId)`: inscrição órfã não tem cadastro pra receber contato nem CPF');




const backfill = fs.readFileSync(
  path.join(__dirname, '..', 'scripts', 'reconciliar-cpf-backfill.js'), 'utf8');
assert(/tabela: 'inscricoes'/.test(semComentarios(backfill)),
  "a tabela `inscricoes` (espinha das inscrições em evento) tem que estar nos SATELITES do reconciliar-cpf-backfill: é a porta que mais coleta CPF e estava fora");
