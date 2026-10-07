











const assert = require('node:assert/strict');
const {
  supervisionaTudo, podeSupervisionar, subareasNaArea, equipeSupervisionada, normalizarConcessoes,
} = require('../utils/supervisorArea');

const OFERTORIO = 'aaaaaaaa-0000-0000-0000-000000000001';
const ESTACIONA = 'aaaaaaaa-0000-0000-0000-000000000002';
const RECEP_KIDS = 'bbbbbbbb-0000-0000-0000-000000000003';


assert.equal(supervisionaTudo([{ area: 'geral', position_id: null }]), true);
assert.equal(podeSupervisionar([{ area: 'geral', position_id: null }], { area: 'KIDS', position_id: RECEP_KIDS }), true,
  'geral sem recorte alcança qualquer área/subárea');



assert.equal(supervisionaTudo([{ area: 'geral', position_id: OFERTORIO }]), false,
  "geral + subárea não pode ser lido como 'supervisiona tudo'");


const areaToda = [{ area: 'Integração', position_id: null }];
assert.equal(podeSupervisionar(areaToda, { area: 'Integração', position_id: OFERTORIO }), true);
assert.equal(podeSupervisionar(areaToda, { area: 'Integração', position_id: ESTACIONA }), true);
assert.equal(podeSupervisionar(areaToda, { area: 'Integração', position_id: null }), true,
  'área inteira alcança até item sem subárea definida');
assert.equal(podeSupervisionar(areaToda, { area: 'KIDS', position_id: RECEP_KIDS }), false,
  'área inteira NÃO atravessa pra outra área');


const soOfertorio = [{ area: 'Integração', position_id: OFERTORIO }];
assert.equal(podeSupervisionar(soOfertorio, { area: 'Integração', position_id: OFERTORIO }), true);
assert.equal(podeSupervisionar(soOfertorio, { area: 'Integração', position_id: ESTACIONA }), false,
  'supervisor do Ofertório não mexe no Estacionamento');




assert.equal(podeSupervisionar(soOfertorio, { area: 'KIDS', position_id: OFERTORIO }), false,
  'mesmo id de subárea em OUTRA área não passa — a área é conferida antes');




assert.equal(podeSupervisionar(soOfertorio, { area: 'Integração', position_id: null }), false,
  'item sem subárea não é liberado pra concessão de subárea');


const duas = [
  { area: 'Integração', position_id: OFERTORIO },
  { area: 'Integração', position_id: ESTACIONA },
];
assert.equal(podeSupervisionar(duas, { area: 'Integração', position_id: OFERTORIO }), true);
assert.equal(podeSupervisionar(duas, { area: 'Integração', position_id: ESTACIONA }), true);
assert.deepEqual(subareasNaArea(duas, 'Integração').sort(), [OFERTORIO, ESTACIONA].sort());


assert.deepEqual(subareasNaArea([...duas, { area: 'Integração', position_id: null }], 'Integração'), [],
  'concessão de área inteira convive com as de subárea e vence — sem recorte');




assert.equal(equipeSupervisionada({ area: 'Integração' }, soOfertorio), true,
  'a equipe da área continua visível pra quem tem só uma subárea dela');
assert.equal(equipeSupervisionada({ area: 'KIDS' }, soOfertorio), false);
assert.equal(equipeSupervisionada({ area: null }, soOfertorio), false,
  'equipe SEM área não pertence a ninguém — lei preexistente, intocada');


assert.equal(podeSupervisionar([{ area: 'integracao', position_id: null }], { area: 'Integração', position_id: OFERTORIO }), true,
  'a comparação de área é sem acento e sem caixa (chaveArea)');



assert.equal(supervisionaTudo(['geral']), true, 'string[] antigo ainda funciona');
assert.equal(podeSupervisionar(['Integração'], { area: 'Integração', position_id: ESTACIONA }), true,
  'string[] equivale a concessão de área inteira');






assert.deepEqual(normalizarConcessoes(['geral']), [{
  area: 'geral', papel: 'lider', team_id: null, position_id: null, culto_dia: null, culto_periodo: null, culto_semana: null,
}]);





const { soEditores, somenteLeitura, papelMaior, cultoNoEscopo } = require('../utils/supervisorArea');
const BANDA_ID = 'cccccccc-0000-0000-0000-000000000001';
const KIDS_ID = 'cccccccc-0000-0000-0000-000000000002';
const BANDA = { id: BANDA_ID, name: 'Banda', area: 'Louvor' };
const KIDS = { id: KIDS_ID, name: 'Kids', area: 'KIDS' };
const DOM1_MANHA = { dia: 'domingo', periodo: 'manha', semana: 1 };
const QUA2 = { dia: 'quarta', periodo: 'noite', semana: 2 };
const SAB = { dia: 'sabado', periodo: 'noite', semana: 4 };


const LIDER_BANDA = [{ area: 'louvor', team_id: BANDA_ID, papel: 'lider' }];
assert.equal(equipeSupervisionada(BANDA, LIDER_BANDA), true, 'líder da Banda vê a Banda');
assert.equal(equipeSupervisionada(KIDS, LIDER_BANDA), false, 'líder da Banda não vê o Kids');
assert.equal(equipeSupervisionada({ id: 'outro', name: 'Coral', area: 'Louvor' }, LIDER_BANDA), false,
  'time é time: outro time da MESMA área não entra — senão "líder da Banda" viraria "líder do Louvor"');
assert.equal(podeSupervisionar(LIDER_BANDA, { area: 'Louvor', team_id: BANDA_ID, position_id: null, culto: DOM1_MANHA }), true);
assert.equal(podeSupervisionar(LIDER_BANDA, { area: 'Louvor', team_id: KIDS_ID, position_id: null, culto: DOM1_MANHA }), false);
assert.equal(podeSupervisionar(LIDER_BANDA, { area: 'Louvor', position_id: null, culto: DOM1_MANHA }), false,
  'alvo SEM team_id é negado pra concessão de time — omitir o id não pode abrir a porta');
assert.equal(supervisionaTudo(LIDER_BANDA), false);
assert.equal(supervisionaTudo([{ area: 'geral', team_id: BANDA_ID }]), false,
  'geral COM time é recorte — não é o curinga');
assert.deepEqual(subareasNaArea(LIDER_BANDA, 'Louvor', BANDA_ID), [], 'time inteiro = sem recorte de subárea');
assert.deepEqual(subareasNaArea([{ area: 'louvor', team_id: BANDA_ID, position_id: OFERTORIO }], 'Louvor', BANDA_ID), [OFERTORIO]);
assert.deepEqual(subareasNaArea([{ area: 'louvor', team_id: BANDA_ID, position_id: OFERTORIO }], 'Louvor', KIDS_ID), [],
  'a subárea de um time não recorta OUTRO time');


const LEITOR_DOMINGO = [{ area: 'geral', culto_dia: 'domingo', papel: 'leitor' }];
assert.equal(equipeSupervisionada(BANDA, LEITOR_DOMINGO), true, 'quem lê o domingo vê toda equipe (o recorte é por culto)');
assert.equal(podeSupervisionar(LEITOR_DOMINGO, { area: 'Louvor', team_id: BANDA_ID, culto: DOM1_MANHA }), true);
assert.equal(podeSupervisionar(LEITOR_DOMINGO, { area: 'Louvor', team_id: BANDA_ID, culto: QUA2 }), false, 'quarta não é domingo');
assert.equal(podeSupervisionar([{ area: 'geral', culto_dia: 'sabado' }], { area: 'AMI', team_id: KIDS_ID, culto: SAB }), true, 'sábado é dia de culto');
assert.equal(podeSupervisionar([{ area: 'geral', culto_dia: 'sabado' }], { area: 'AMI', team_id: KIDS_ID, culto: DOM1_MANHA }), false);
assert.equal(cultoNoEscopo(LEITOR_DOMINGO, DOM1_MANHA), true);
assert.equal(cultoNoEscopo(LEITOR_DOMINGO, QUA2), false);
assert.equal(cultoNoEscopo(LIDER_BANDA, QUA2), true, 'concessão sem recorte de culto alcança qualquer culto');
assert.equal(cultoNoEscopo(LEITOR_DOMINGO, null), false, 'culto sem data não dá pra afirmar');


assert.equal(soEditores(LEITOR_DOMINGO).length, 0, 'leitor não escreve');
assert.equal(soEditores(LIDER_BANDA).length, 1);
assert.equal(soEditores(['geral']).length, 1, 'string[] (legado) é líder');
assert.equal(soEditores([{ area: 'geral' }]).length, 1, 'sem papel = líder (as 37 concessões de antes)');
assert.equal(somenteLeitura(LEITOR_DOMINGO), true);
assert.equal(somenteLeitura([...LEITOR_DOMINGO, ...LIDER_BANDA]), false, 'basta UMA que escreve');
assert.equal(somenteLeitura([]), false, 'sem concessão não é "só leitura" — é "nenhuma"');
assert.equal(papelMaior([]), null);
assert.equal(papelMaior(LEITOR_DOMINGO), 'leitor');
assert.equal(papelMaior([...LEITOR_DOMINGO, ...LIDER_BANDA]), 'lider');
assert.equal(papelMaior([{ area: 'geral' }]), 'admin', 'geral sem recorte É o admin, mesmo sem a coluna dizer');
assert.equal(papelMaior([{ area: 'produção', papel: 'admin' }]), 'admin');
assert.equal(normalizarConcessoes([{ area: 'geral', papel: 'chefe' }])[0].papel, 'lider', 'papel desconhecido cai em líder, não em leitor nem em admin');



const { gerenciaEstruturaDoTime, gerenciaAlgumaEstrutura } = require('../utils/supervisorArea');
assert.equal(gerenciaEstruturaDoTime(LIDER_BANDA, BANDA), true, 'líder do time gerencia a estrutura dele');
assert.equal(gerenciaEstruturaDoTime(LIDER_BANDA, KIDS), false, 'e só dele');
assert.equal(gerenciaEstruturaDoTime([{ area: 'geral' }], KIDS), true, 'admin (geral sem recorte) gerencia todos');
assert.equal(gerenciaEstruturaDoTime([{ area: 'KIDS' }], KIDS), true, 'área inteira (legado) gerencia os times da área');
assert.equal(gerenciaEstruturaDoTime([{ area: 'KIDS', position_id: RECEP_KIDS }], KIDS), false,
  'supervisor de SUBÁREA não vincula gente ao time inteiro');
assert.equal(gerenciaEstruturaDoTime([{ area: 'louvor', team_id: BANDA_ID, culto_semana: 2 }], BANDA), false,
  'recorte de rodízio é de ESCALA, não de estrutura');
assert.equal(gerenciaEstruturaDoTime(LEITOR_DOMINGO, BANDA), false, 'leitor não gerencia');
assert.equal(gerenciaEstruturaDoTime([{ area: 'geral', culto_dia: 'domingo' }], BANDA), false,
  'líder "de domingo" (culto) não mexe em estrutura — estrutura não tem culto');
assert.equal(gerenciaEstruturaDoTime(LIDER_BANDA, null), false, 'sem time não dá pra afirmar');
assert.equal(gerenciaAlgumaEstrutura(LIDER_BANDA), true);
assert.equal(gerenciaAlgumaEstrutura(LEITOR_DOMINGO), false);
assert.equal(gerenciaAlgumaEstrutura([{ area: 'integração', position_id: OFERTORIO, culto_semana: 1 }]), false,
  'as 19 concessões de turno da Ariel não acendem o card');
assert.equal(gerenciaAlgumaEstrutura([]), false);

console.log('supervisorSubarea.test.js OK (papéis · time · dia do culto · estrutura)');
