const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  extrairDigito, digitoValido, normalizarDigito, ehCredito,
  digitoDoLancamento, checarDigitoLivre, sugerirDigito, valorComDigito,
} = require('../utils/digitoCampanha');
const {
  calcularProgresso, ritmoNecessario, estaNoAr, brlRedondo,
} = require('../utils/campanhaProgresso');
const { elegivel, montarPublico } = require('../utils/campanhaPublico');
const { deveAgradecer, textoAgradecimento } = require('../utils/campanhaAgradecimento');
























assert.equal(extrairDigito(1907.25), '25');
assert.equal(extrairDigito(500.07), '07');
assert.equal(extrairDigito(0.07), '07');
assert.equal(extrairDigito(4456.77), '77');
assert.equal(extrairDigito(1000), '00');
assert.equal(extrairDigito(-830.29), '29', 'valor negativo: o dígito é do módulo');
assert.equal(extrairDigito(null), null);
assert.equal(extrairDigito(''), null);
assert.equal(extrairDigito('abc'), null);

assert.equal(extrairDigito(327.17), '17');
assert.equal(extrairDigito(1719.31), '31');
assert.equal(extrairDigito(554.07), '07');




assert.equal(digitoValido('00'), false, "'00' não pode ser dígito de campanha");
assert.equal(digitoValido('07'), true);
assert.equal(digitoValido('7'), false, 'dígito é sempre de 2 caracteres');
assert.equal(digitoValido(''), false);
assert.equal(normalizarDigito(7), '07', 'formulário manda 7; a régua normaliza');
assert.equal(normalizarDigito(' 07 '), '07');
assert.equal(normalizarDigito(0), null, "0 normaliza pra '00', que é inválido");
assert.equal(normalizarDigito('7x'), null);
assert.equal(normalizarDigito('107'), null);




assert.equal(ehCredito({ tipo_trn: 'CREDIT', valor: 100 }), true);
assert.equal(ehCredito({ tipo_trn: 'DEBIT', valor: 100 }), false,
  'tipo_trn manda mais que o sinal do valor');
assert.equal(ehCredito({ valor: 100 }), true, 'sem tipo_trn, o sinal decide');
assert.equal(ehCredito({ valor: -100 }), false);
assert.equal(digitoDoLancamento({ tipo_trn: 'DEBIT', valor: 500.07 }, ['07']), null,
  'saída de R$ 500,07 NÃO é doação da campanha 07');
assert.equal(digitoDoLancamento({ tipo_trn: 'CREDIT', valor: 500.07 }, ['07']), '07');
assert.equal(digitoDoLancamento({ tipo_trn: 'CREDIT', valor: 500.09 }, ['07']), null,
  'dígito fora da lista de ativos não classifica');
assert.equal(digitoDoLancamento({ tipo_trn: 'CREDIT', valor: 500 }, ['07']), null,
  'centavo 00 nunca classifica');


assert.equal(digitoDoLancamento({ valor: 500.07 }, [{ digito: '07' }]), '07');
assert.equal(digitoDoLancamento({ valor: 500.07 }, [{ centavo: '07' }]), '07');
assert.equal(digitoDoLancamento({ valor: 500.07 }, [7]), '07');





const OCUPADOS = [
  { dono: 'templo', digito: '17', descricao: 'Templo' },
  { dono: 'bazar', digito: '22', descricao: 'Bazar' },
  { dono: 'camp2025', digito: '25', descricao: 'Campanha 2025' },
  { dono: 'social', digito: '31', descricao: 'Ação Social' },
];
assert.equal(checarDigitoLivre('07', OCUPADOS).ok, true, '07 está livre em produção');
assert.equal(checarDigitoLivre('25', OCUPADOS).ok, false);
assert.match(checarDigitoLivre('25', OCUPADOS).motivo, /Campanha 2025/,
  'a mensagem tem que dizer QUEM já usa o dígito');
assert.equal(checarDigitoLivre('00', OCUPADOS).ok, false);

assert.equal(checarDigitoLivre('25', OCUPADOS, { ignorar: 'camp2025' }).ok, true);
assert.equal(sugerirDigito(OCUPADOS), '01');
assert.equal(sugerirDigito([...OCUPADOS, { dono: 'x', digito: '01' }]), '02');





assert.equal(valorComDigito(50000, '07'), 50007);
assert.equal(valorComDigito(50050, '07'), 50007, 'arredonda pra baixo, nunca pra cima');
assert.equal(valorComDigito(50099, '07'), 50007);
assert.equal(valorComDigito(5, '07'), 7, 'valor menor que o dígito devolve o dígito');
assert.equal(valorComDigito(50000, null), 50000, 'campanha sem dígito não mexe no valor');
assert.equal(valorComDigito(0, '07'), 0);






const ANTES = calcularProgresso({
  meta_centavos: 50000000,
  caixa_confirmado_centavos: 10000000,
  caixa_conciliando_centavos: 2500000,
  online_pago_centavos: 500000,
});
const DEPOIS = calcularProgresso({
  meta_centavos: 50000000,
  caixa_confirmado_centavos: 12500000,
  caixa_conciliando_centavos: 0,
  online_pago_centavos: 500000,
});
assert.equal(ANTES.total_centavos, DEPOIS.total_centavos,
  'aprovar na fila NÃO pode mudar o total arrecadado — só migra de balde');
assert.equal(ANTES.total_centavos, 13000000);
assert.equal(ANTES.pct, 26);
assert.equal(ANTES.pct_conciliando, 19.23);
assert.equal(DEPOIS.pct_conciliando, 0);


const ESTOUROU = calcularProgresso({ meta_centavos: 100, caixa_confirmado_centavos: 130 });
assert.equal(ESTOUROU.pct, 130, 'o relatório mostra o número verdadeiro');
assert.equal(ESTOUROU.pct_barra, 100, 'a barra desenhada trava em 100');
assert.equal(ESTOUROU.bateu_meta, true);
assert.equal(ESTOUROU.falta_centavos, 0);

assert.equal(calcularProgresso({ meta_centavos: 0, caixa_confirmado_centavos: 100 }).pct, 0);




const RITMO = ritmoNecessario({
  total_centavos: 13000000, meta_centavos: 50000000,
  hoje: '2026-09-06', data_fim: '2026-09-30',
});
assert.equal(RITMO.dias_restantes, 24);
assert.equal(RITMO.falta_centavos, 37000000);
assert.equal(RITMO.por_dia_centavos, Math.ceil(37000000 / 24));
assert.equal(ritmoNecessario({ hoje: '2026-09-30', data_fim: '2026-09-30' }).por_dia_centavos, null,
  'último dia não tem "por dia"');

const KIDS = { status: 'ativa', data_inicio: '2026-09-01', data_fim: '2026-10-31' };
assert.equal(estaNoAr(KIDS, '2026-09-06'), true);
assert.equal(estaNoAr(KIDS, '2026-08-31'), false, 'antes do início não aparece');
assert.equal(estaNoAr(KIDS, '2026-11-01'), false, 'depois do fim não aparece');
assert.equal(estaNoAr({ ...KIDS, status: 'rascunho' }, '2026-09-06'), false,
  'rascunho nunca vai pro ar');


assert.equal(brlRedondo(12843719), 'R$ 128 mil');
assert.equal(brlRedondo(50000000), 'R$ 500 mil');
assert.equal(brlRedondo(45000), 'R$ 450');




assert.equal(elegivel({ id: 1, active: true, telefone: '21999998888' }, 'whatsapp').elegivel, false);
assert.match(elegivel({ id: 1, active: true, telefone: '21999998888' }, 'whatsapp').motivo, /opt-in/);
assert.equal(elegivel({ id: 1, active: true, telefone: '21999998888', whatsapp_optin: true }, 'whatsapp').elegivel, true);
assert.equal(elegivel({ id: 1, active: true, whatsapp_optin: true }, 'whatsapp').elegivel, false,
  'opt-in sem telefone não dá');

assert.equal(elegivel({ id: 1, active: false, email: 'a@b.com' }, 'email').elegivel, false);
assert.equal(elegivel({ id: 1, active: true, deleted_at: '2026-01-01', email: 'a@b.com' }, 'email').elegivel, false);
assert.equal(elegivel({ id: 1, active: true, status: 'inativo', email: 'a@b.com' }, 'email').elegivel, false);
assert.equal(elegivel({ id: 1, active: true, status: 'falecido', email: 'a@b.com' }, 'email').elegivel, false);

assert.equal(elegivel({ id: 1, active: true, email: 'x@exemplo.com' }, 'email').elegivel, false);
assert.equal(elegivel({ id: 1, active: true, email: 'joao@gmail.com' }, 'email').elegivel, true);

assert.equal(elegivel({ id: 1, active: true, email: 'a@b.com', email_optout: true }, 'email').elegivel, false);




const CASA = [
  { id: 1, nome: 'Pai', active: true, email: 'casa@gmail.com' },
  { id: 2, nome: 'Mãe', active: true, email: 'CASA@gmail.com' },
  { id: 3, nome: 'Filho', active: true, email: 'casa@gmail.com ' },
  { id: 4, nome: 'Avó', active: true, email: 'avo@gmail.com' },
  { id: 5, nome: 'Sem contato', active: true, email: null },
];
const PUB = montarPublico(CASA, 'email');
assert.equal(PUB.total_alvo, 2, 'a casa conta 1 vez, mais a avó');
assert.equal(PUB.motivos['destino repetido (mesma casa)'], 2);
assert.equal(PUB.motivos['sem e-mail utilizável'], 1);
assert.equal(PUB.total_base, 5);
assert.equal(PUB.total_alvo + PUB.total_fora, PUB.total_base,
  'todo mundo tem que ser contado em algum lado — senão a prévia mente');





const TXT = textoAgradecimento({ nome: 'Reforma do Kids', link: 'https://cbrio.org/c/kids' });
assert.ok(TXT.assunto.length > 0);
assert.ok(!/\{\{|\$\{|%s/.test(TXT.corpo_texto), 'sobrou placeholder não substituído no texto');
assert.ok(!/R\$/.test(TXT.corpo_texto),
  'o agradecimento NÃO mostra valor: a mensagem pode chegar no celular da família');
assert.match(TXT.corpo_texto, /Reforma do Kids/);
assert.match(TXT.corpo_texto, /cbrio\.org\/c\/kids/);


const AGORA = '2026-09-08T12:00:00Z';
assert.equal(deveAgradecer({ membro_id: 'm1', valor_centavos: 50007 },
  { canal_disponivel: true, agora: AGORA }).agradecer, true);
assert.equal(deveAgradecer({ membro_id: 'm1', valor_centavos: 50007 },
  { ja_agradecida: true, canal_disponivel: true, agora: AGORA }).agradecer, false);
assert.equal(deveAgradecer({ membro_id: null, valor_centavos: 50007 },
  { canal_disponivel: true, agora: AGORA }).agradecer, false);
assert.match(deveAgradecer({ membro_id: null, valor_centavos: 1 },
  { canal_disponivel: true, agora: AGORA }).motivo, /anônima/);
assert.equal(deveAgradecer({ membro_id: 'm1', valor_centavos: -50007 },
  { canal_disponivel: true, agora: AGORA }).agradecer, false,
  'estorno NUNCA dispara "obrigado pela sua generosidade"');
assert.equal(deveAgradecer({ membro_id: 'm1', valor_centavos: 50007 },
  { canal_disponivel: true, agora: AGORA, ultimo_agradecimento_em: '2026-09-07T12:00:00Z' }).agradecer,
  false, 'quem doou 2× em 24h recebe 1 obrigado');
assert.equal(deveAgradecer({ membro_id: 'm1', valor_centavos: 50007 },
  { canal_disponivel: true, agora: AGORA, ultimo_agradecimento_em: '2026-09-01T12:00:00Z' }).agradecer,
  true, 'passada a janela de 72h, agradece de novo');
assert.equal(deveAgradecer({ membro_id: 'm1', valor_centavos: 50007 },
  { canal_disponivel: false, agora: AGORA }).agradecer, false);






const MIGRATION = path.join(__dirname, '../../supabase/migrations/20260827120000_modulo_campanhas.sql');
const sql = fs.readFileSync(MIGRATION, 'utf8');
assert.ok(/aplicar_classificacao_lancamento/.test(sql),
  'a migration TEM que reescrever aplicar_classificacao_lancamento — é a função viva que classifica');
assert.ok(/camp_digitos_ativos|fin_identificadores_centavo/.test(sql),
  'a função SQL precisa consultar os dígitos ativos');
assert.ok(/round\(/i.test(sql) && /% *100|mod\(/i.test(sql),
  'o espelho SQL precisa ARREDONDAR o centavo (truncar devolve 24 em vez de 25)');
assert.ok(/<> *'00'|!= *'00'/.test(sql),
  "o espelho SQL precisa excluir o centavo '00' — 87,5% dos créditos têm ,00");
assert.ok(/'centavo'/.test(sql),
  "a origem 'centavo' precisa continuar no CHECK de sugestao_origem, senão o INSERT do trigger estoura");





const { domingosEntre } = require('../utils/campanhaProgresso');


assert.equal(domingosEntre('2026-09-01', '2026-10-31'), 8);

assert.equal(domingosEntre('2026-08-30', '2026-08-30'), 1, 'domingo único conta 1');
assert.equal(domingosEntre('2026-08-31', '2026-09-05'), 0, 'semana sem domingo conta 0');
assert.equal(domingosEntre('2026-10-25', '2026-10-31'), 1);

assert.equal(domingosEntre('2026-10-31', '2026-09-01'), 0);
assert.equal(domingosEntre(null, '2026-10-31'), 0);





const RITMO_PRE = ritmoNecessario({
  total_centavos: 0, meta_centavos: 50000000,
  hoje: '2026-08-27', data_inicio: '2026-09-01', data_fim: '2026-10-31',
});
assert.equal(RITMO_PRE.domingos_restantes, 8);
assert.equal(RITMO_PRE.por_domingo_centavos, 6250000, 'R$ 500 mil / 8 domingos = R$ 62.500');
assert.equal(RITMO_PRE.inicio_efetivo, '2026-09-01');
assert.equal(RITMO_PRE.parte_do_inicio, true,
  'a régua tem que DIZER que a conta parte do início — o card da lista não recebe `hoje` e comparar lá daria sempre true');


const RITMO_MEIO = ritmoNecessario({
  total_centavos: 0, meta_centavos: 50000000,
  hoje: '2026-09-20', data_inicio: '2026-09-01', data_fim: '2026-10-31',
});
assert.equal(RITMO_MEIO.domingos_restantes, 6);
assert.equal(RITMO_MEIO.parte_do_inicio, false);
assert.ok(RITMO_MEIO.por_domingo_centavos > RITMO_PRE.por_domingo_centavos,
  'com menos domingos restantes e a mesma falta, o ritmo por domingo tem que SUBIR');


const RITMO_COM_DINHEIRO = ritmoNecessario({
  total_centavos: 25000000, meta_centavos: 50000000,
  hoje: '2026-09-20', data_inicio: '2026-09-01', data_fim: '2026-10-31',
});
assert.equal(RITMO_COM_DINHEIRO.por_domingo_centavos, Math.ceil(25000000 / 6));
assert.ok(RITMO_COM_DINHEIRO.por_domingo_centavos < RITMO_MEIO.por_domingo_centavos);




const RITMO_SEM_DOMINGO = ritmoNecessario({
  total_centavos: 0, meta_centavos: 50000000,
  hoje: '2026-10-26', data_inicio: '2026-09-01', data_fim: '2026-10-31',
});
assert.equal(RITMO_SEM_DOMINGO.domingos_restantes, 0);
assert.equal(RITMO_SEM_DOMINGO.por_domingo_centavos, null);
assert.ok(RITMO_SEM_DOMINGO.falta_centavos > 0, 'ainda falta dinheiro — o que não há é domingo');



const RITMO_ULTIMO = ritmoNecessario({
  total_centavos: 0, meta_centavos: 50000000,
  hoje: '2026-10-25', data_inicio: '2026-09-01', data_fim: '2026-10-25',
});
assert.equal(RITMO_ULTIMO.dias_restantes, 0);
assert.equal(RITMO_ULTIMO.por_domingo_centavos, 50000000);


assert.equal(ritmoNecessario({
  total_centavos: 60000000, meta_centavos: 50000000,
  hoje: '2026-09-20', data_inicio: '2026-09-01', data_fim: '2026-10-31',
}).falta_centavos, 0);







const { IDS_CATALOGO, CATALOGO } = require('./comunicacaoAutomaticas');
const { DISPARO_ID: ID_SEMANAL } = require('./campanhaDisparo');
const { DISPARO_ID: ID_OBRIGADO } = require('./campanhaAgradece');

for (const [rotulo, id] of [['disparo semanal', ID_SEMANAL], ['agradecimento', ID_OBRIGADO]]) {
  assert.ok(IDS_CATALOGO.includes(id),
    `${rotulo}: o id "${id}" que o remetente checa NÃO está no catálogo (${IDS_CATALOGO.join(', ')}) `
    + '— o switch de desligar não apareceria na tela de Comunicação');
  const item = CATALOGO.find(i => i.id === id);
  assert.ok(item.fonte, `${rotulo}: item sem \`fonte\` — a tela precisa apontar quem dispara de verdade`);
  assert.equal(typeof item.publico, 'function', `${rotulo}: item sem resolver de público`);
}
assert.equal(new Set(IDS_CATALOGO).size, IDS_CATALOGO.length,
  'id duplicado no catálogo — o PATCH desligaria o disparo errado');






const itemObrigado = CATALOGO.find(i => i.id === ID_OBRIGADO);
assert.equal(itemObrigado.envTemplate, null,
  'o agradecimento não deve declarar envTemplate: sem a env ele ainda sai por e-mail');







const MIG_MANUAL = path.join(__dirname, '../../supabase/migrations/20260827170000_camp_arrecadacao_inclusao_manual.sql');
const sqlManual = fs.readFileSync(MIG_MANUAL, 'utf8');
assert.ok(/vw_camp_arrecadacao/.test(sqlManual),
  'a migration TEM que reescrever a view da arrecadação');

assert.equal((sqlManual.match(/v\.incluir = true/g) || []).length, 2,
  'a inclusão manual precisa somar nos DOIS baldes (transação E bruto) — só num deles deixa metade do furo aberto');
assert.equal((sqlManual.match(/v\.incluir = false/g) || []).length, 2,
  'o veto precisa continuar valendo nos dois baldes');

assert.ok(/NOT EXISTS \(SELECT 1 FROM fin_transacoes t WHERE t\.lancamento_bruto_id = b\.id\)/.test(sqlManual),
  'sem este NOT EXISTS o total DOBRA quando a fila aprova um crédito');





const {
  CARENCIA_CREDITO_DIAS, fimJanelaCredito, creditoNaJanela, montarExtratoCaixa,
} = require('../utils/digitoCampanha');

assert.equal(CARENCIA_CREDITO_DIAS, 3, 'domingo→segunda, segunda feriado→terça e uma folga');
assert.equal(fimJanelaCredito('2026-09-27'), '2026-09-30', 'o Pix do domingo 27/09 cai em 28/09');
assert.equal(fimJanelaCredito('2026-12-30'), '2027-01-02', 'virada de ano é conta de calendário');
assert.equal(fimJanelaCredito('2026-02-27'), '2026-03-02', 'fevereiro de 28 dias');
assert.equal(fimJanelaCredito(null), null, 'campanha sem fim não ganha teto');
assert.equal(fimJanelaCredito('lixo'), null);


{
  const tzAntes = process.env.TZ;
  try {
    process.env.TZ = 'America/Sao_Paulo';
    assert.equal(fimJanelaCredito('2026-09-27'), '2026-09-30', 'no fuso da igreja a carência não perde um dia');
  } finally {
    if (tzAntes === undefined) delete process.env.TZ; else process.env.TZ = tzAntes;
  }
}

const JANELA_KIDS = { digito: '12', data_inicio: '2026-09-01', data_fim: '2026-09-27' };
assert.equal(creditoNaJanela('2026-09-28', JANELA_KIDS), true, 'segunda depois do último domingo CONTA');
assert.equal(creditoNaJanela('2026-09-29', JANELA_KIDS), true, 'terça (segunda feriado) conta');
assert.equal(creditoNaJanela('2026-09-30', JANELA_KIDS), true, 'a folga');
assert.equal(creditoNaJanela('2026-10-01', JANELA_KIDS), false, 'passada a carência, não é mais da campanha');
assert.equal(creditoNaJanela('2026-08-31', JANELA_KIDS), false, 'a janela de INÍCIO não muda');
assert.equal(creditoNaJanela(null, JANELA_KIDS), false, 'sem data, com janela definida: no SQL a comparação com NULL é falsa');
assert.equal(creditoNaJanela('2026-01-01', { digito: '12' }), true, 'sem janela, tudo conta');

assert.equal(creditoNaJanela(null, { data_fim: '2026-09-27' }), false, 'sem data, só com fim: também não entra');



const EXT = montarExtratoCaixa({
  camp: JANELA_KIDS,
  transacoes: [
    { id: 't1', tipo: 'receita', valor: 100.12, data_competencia: '2026-09-21' },
    { id: 't2', tipo: 'receita', valor: 50.12, data_competencia: '2026-09-28' },
    { id: 't3', tipo: 'receita', valor: 400.12, data_competencia: '2026-09-29' },
    { id: 't4', tipo: 'receita', valor: 60.22, data_competencia: '2026-09-21' },
    { id: 't5', tipo: 'receita', valor: 80.00, data_competencia: '2026-09-21', identificador_centavo: '12' },
    { id: 't6', tipo: 'despesa', valor: 30.12, data_competencia: '2026-09-21' },
    { id: 't7', tipo: 'receita', valor: 70.12, data_competencia: '2026-10-01' },
    { id: 't8', tipo: 'receita', valor: 90.12, data_competencia: '2026-09-22' },
    { id: 't9', tipo: 'receita', valor: 15.00, data_competencia: '2026-11-15' },
  ],
  brutos: [
    { id: 'b1', tipo_trn: 'CREDIT', valor: 10.12, data_lancamento: '2026-09-28' },
    { id: 'b2', tipo_trn: 'CREDIT', valor: 669.12, data_lancamento: '2026-09-30' },
    { id: 'b3', tipo_trn: 'CREDIT', valor: 20.12, data_lancamento: '2026-09-30' },
    { id: 'b4', tipo_trn: 'DEBIT', valor: 30.12, data_lancamento: '2026-09-30' },
  ],
  brutosComTransacao: new Set(['b3']),
  vinculos: [
    { transacao_id: 't8', incluir: false },
    { transacao_id: 't9', incluir: true },
  ],
});
assert.deepEqual(EXT.confirmadas.map((t) => t.id).sort(), ['t1', 't2', 't3', 't5', 't9'],
  'confirmadas = centavo ou coluna, na janela COM carência, sem veto, + inclusão manual');
assert.equal(EXT.lancado_ate, '2026-09-29', 'o corte do balanço estende junto com a carência');
assert.deepEqual(EXT.conciliando.map((b) => b.id), ['b2'],
  'bruto que o balanço já alcançou NÃO volta a contar (dupla contagem · LEI Nº 6)');



const RITMO_CARENCIA = ritmoNecessario({
  total_centavos: 0, meta_centavos: 50000000,
  hoje: '2026-09-28', data_inicio: '2026-09-01', data_fim: '2026-09-27',
});
assert.equal(RITMO_CARENCIA.domingos_restantes, 0, 'depois do último domingo não sobra domingo nenhum');
const SRC_ARRECAD = fs.readFileSync(path.join(__dirname, 'campanhaArrecadacao.js'), 'utf8');
assert.ok(!/ritmoNecessario\(\{[\s\S]{0,400}?fimJanelaCredito/.test(SRC_ARRECAD),
  'o ritmo recebe data_fim, nunca o fim da janela de crédito');


for (const arq of ['campanhaArrecadacao.js', 'campanhaAgradece.js', 'campanhaDisparo.js']) {
  const src = fs.readFileSync(path.join(__dirname, arq), 'utf8');
  assert.ok(!/\.lte\('data_(competencia|lancamento)', camp\.data_fim\)/.test(src),
    `${arq}: corta o crédito em data_fim — a página e este leitor passariam a divergir`);
}


const MIG_CARENCIA = path.join(__dirname, '../../supabase/migrations/20260930160000_camp_arrecadacao_carencia_credito.sql');
const sqlCarencia = fs.readFileSync(MIG_CARENCIA, 'utf8');
const mDias = /camp_carencia_credito_dias\(\)[\s\S]*?AS \$\$ SELECT (\d+) \$\$/.exec(sqlCarencia);
assert.ok(mDias, 'a migration precisa declarar a carência como função constante');
assert.equal(Number(mDias[1]), CARENCIA_CREDITO_DIAS, 'SQL e JS dizem carências diferentes');
assert.ok(/t\.data_competencia <= \(c_1\.data_fim \+ camp_carencia_credito_dias\(\)\)/.test(sqlCarencia),
  'a carência precisa valer nas transações (conf + lancado)');
assert.ok(/b\.data_lancamento <= \(c_1\.data_fim \+ camp_carencia_credito_dias\(\)\)/.test(sqlCarencia),
  'a carência precisa valer nos brutos (concil)');
assert.ok(/q_t <> 2 OR q_b <> 1/.test(sqlCarencia),
  'o patch dinâmico tem de ABORTAR se as âncoras não casarem o número exato de vezes');

console.log('campanhaDigito: ok');
