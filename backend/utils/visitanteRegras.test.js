

const assert = require('node:assert/strict');
const R = require('./visitanteRegras');
const fs = require('node:fs');
const path = require('node:path');



process.env.TZ = 'UTC';

const bodyOk = { nome: 'Ana Souza', telefone: '(21) 99876-5432', cpf: '123.456.789-09', aceite_lgpd: true, whatsapp_optin: true, local: 'lounge' };


{
  const v = R.validarVisitante(bodyOk);
  assert.equal(v.ok, true);
  assert.deepEqual(v.valores, { nome: 'Ana Souza', telefone: '21998765432', cpf: '12345678909', whatsapp_optin: true, local: 'lounge' });
}
assert.equal(R.validarVisitante({ ...bodyOk, nome: 'A' }).campo, 'nome');
assert.equal(R.validarVisitante({ ...bodyOk, telefone: '2199876' }).campo, 'telefone', '7 dígitos não é telefone');
assert.equal(R.validarVisitante({ ...bodyOk, telefone: '5521998765432' }).valores.telefone, '21998765432', 'DDI 55 sai quando sobra número inteiro');
assert.equal(R.validarVisitante({ ...bodyOk, telefone: '55219987654' }).valores.telefone, '55219987654', 'DDD 55 (Santa Maria) NÃO é DDI');
assert.equal(R.validarVisitante({ ...bodyOk, cpf: '123' }).campo, 'cpf');
assert.equal(R.validarVisitante({ ...bodyOk, cpf: '11111111111' }).campo, 'cpf', 'sequência repetida');
assert.equal(R.validarVisitante({ ...bodyOk, cpf: '52998224726' }).campo, 'cpf', 'DV errado');
assert.equal(R.validarVisitante({ ...bodyOk, aceite_lgpd: 'true' }).campo, 'aceite_lgpd', 'string "true" não é aceite');
assert.equal(R.validarVisitante({ ...bodyOk, aceite_lgpd: 1 }).campo, 'aceite_lgpd');
assert.equal(R.validarVisitante({ ...bodyOk, whatsapp_optin: 'sim' }).valores.whatsapp_optin, false, 'opt-in só com true literal');
assert.equal(R.validarVisitante({ ...bodyOk, whatsapp_optin: undefined }).valores.whatsapp_optin, false);
assert.equal(R.validarVisitante({ ...bodyOk, local: 'Palco' }).valores.local, 'outro', 'local desconhecido cai em outro, não recusa');
assert.equal(R.validarVisitante({ ...bodyOk, local: 'TEMPLO' }).valores.local, 'templo');
assert.equal(R.validarVisitante(null).ok, false);
assert.equal(R.validarVisitante({ ...bodyOk, nome: '  Ana   Souza  ' }).valores.nome, 'Ana Souza', 'espaços colapsam');


assert.equal(new Set(R.IDS_LOCAIS).size, R.IDS_LOCAIS.length);
assert.ok(R.IDS_LOCAIS.includes('outro'), 'precisa existir o balde "outro"');
for (const l of R.LOCAIS) assert.ok(l.nome && l.chamada, `local ${l.id} sem nome/chamada`);


{
  const seq = [0, 1, 2, 3, 4, 5];
  let i = 0;
  const cod = R.gerarCodigoVoucher(() => seq[i++ % seq.length]);
  assert.equal(cod, 'ABCDEF');
  const real = R.gerarCodigoVoucher();
  assert.match(real, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
  assert.equal(R.normalizarCodigoVoucher(' ab-c def '), 'ABCDEF');
}



const registro = '2026-09-13T14:40:00Z';
const base = { registradoEm: registro, cultoData: '2026-09-13', cultoHora: '11:30:00', whatsappOptin: true, pesquisaEnviadaEm: null };
assert.equal(R.pesquisaDevida({ ...base, agora: Date.parse('2026-09-13T15:30:00Z') }), 'aguardar', 'no meio do culto não sai');
assert.equal(R.pesquisaDevida({ ...base, agora: Date.parse('2026-09-13T16:59:00Z') }), 'aguardar', '1 min antes de 2h30 do início');
assert.equal(R.pesquisaDevida({ ...base, agora: Date.parse('2026-09-13T17:00:00Z') }), 'enviar', '11:30 + 2h30 = 14:00 BRT = 17:00 UTC');
assert.equal(R.pesquisaDevida({ ...base, agora: Date.parse('2026-09-16T14:41:00Z') }), 'expirada', '72h depois do registro não sai mais');
assert.equal(R.pesquisaDevida({ ...base, whatsappOptin: false, agora: Date.parse('2026-09-13T18:00:00Z') }), 'nao_elegivel');
assert.equal(R.pesquisaDevida({ ...base, pesquisaEnviadaEm: '2026-09-13T17:05:00Z', agora: Date.parse('2026-09-13T18:00:00Z') }), 'ja_enviada');

assert.equal(R.pesquisaDevida({ ...base, registradoEm: '2026-09-13T17:10:00Z', agora: Date.parse('2026-09-13T17:30:00Z') }), 'aguardar');
assert.equal(R.pesquisaDevida({ ...base, registradoEm: '2026-09-13T17:10:00Z', agora: Date.parse('2026-09-13T17:40:00Z') }), 'enviar');

assert.equal(R.pesquisaDevida({ ...base, cultoData: null, cultoHora: null, agora: Date.parse('2026-09-13T16:39:00Z') }), 'aguardar');
assert.equal(R.pesquisaDevida({ ...base, cultoData: null, cultoHora: null, agora: Date.parse('2026-09-13T16:40:00Z') }), 'enviar');

assert.equal(R.pesquisaDevida({ ...base, registradoEm: '2026-09-13T21:50:00Z', cultoHora: '19:00', agora: Date.parse('2026-09-14T00:29:00Z') }), 'aguardar');
assert.equal(R.pesquisaDevida({ ...base, registradoEm: '2026-09-13T21:50:00Z', cultoHora: '19:00', agora: Date.parse('2026-09-14T00:30:00Z') }), 'enviar', 'vira o dia UTC e continua certo');

assert.equal(R.pesquisaDevida({ ...base, cultoHora: 'xx', agora: Date.parse('2026-09-13T16:40:00Z') }), 'enviar');


assert.equal(R.normalizarNota('3'), 3);
assert.equal(R.normalizarNota(0), null);
assert.equal(R.normalizarNota(4), null, 'a escala é 1..3 desde 11/09/2026');
assert.equal(R.normalizarNota(5), null, 'a escala é 1..3 desde 11/09/2026');
assert.equal(R.normalizarNota(6), null);
assert.equal(R.normalizarNota(2.5), null);
assert.equal(R.NOTA_MAX, 3);



{
  const voto = '2026-09-13T17:30:00-03:00';
  const naJanela = (quando) => R.comentarioNaJanela({ respondidaEm: voto, agora: new Date(quando) });
  assert.equal(naJanela('2026-09-13T17:31:00-03:00'), true, 'um minuto depois');
  assert.equal(naJanela('2026-09-13T23:59:00-03:00'), true, 'mesmo dia, quase meia-noite');
  assert.equal(naJanela('2026-09-14T00:30:00-03:00'), false, 'virou o dia: já não é feedback do culto');
  assert.equal(naJanela('2026-09-20T10:00:00-03:00'), false, 'uma semana depois');


  const noite = '2026-09-13T23:10:00-03:00';
  assert.equal(R.HORAS_MIN_COMENTARIO, 6);
  assert.equal(R.comentarioNaJanela({ respondidaEm: noite, agora: new Date('2026-09-14T03:00:00-03:00') }), true,
    'o piso de 6h estende a janela para além da meia-noite');
  assert.equal(R.comentarioNaJanela({ respondidaEm: noite, agora: new Date('2026-09-14T06:00:00-03:00') }), false,
    'passado o piso, fecha');

  assert.equal(R.fimDaJanelaComentario('2026-09-13T08:00:00-03:00'),
    Date.parse('2026-09-14T00:00:00-03:00'), 'voto de manhã fecha na virada, não em 8h+6h');


  assert.equal(R.comentarioNaJanela({ respondidaEm: null }), true);
  assert.equal(R.comentarioNaJanela({ respondidaEm: 'nao-e-data' }), true);
  assert.equal(R.comentarioNaJanela(), true);
}
assert.equal(R.primeiroNome('  maria clara '), 'maria');
assert.equal(R.primeiroNome(''), 'Olá');


{
  const T = require('./visitanteToken');
  const antes = process.env.VISITANTE_TOKEN_SECRET;
  const antesCron = process.env.CRON_SECRET;
  delete process.env.VISITANTE_TOKEN_SECRET; delete process.env.CRON_SECRET;
  assert.equal(T.gerarTokenPesquisa('0f2b7e4c-1111-4222-8333-444455556666'), null, 'sem segredo não gera');
  assert.equal(T.montarLinkPesquisa('0f2b7e4c-1111-4222-8333-444455556666'), null);
  process.env.VISITANTE_TOKEN_SECRET = 'segredo-de-teste';
  const id = '0f2b7e4c-1111-4222-8333-444455556666';
  const tok = T.gerarTokenPesquisa(id);
  assert.match(tok, /^[0-9a-f]{32}\.[0-9a-f]{20}$/);
  assert.equal(T.verificarTokenPesquisa(tok), id);
  assert.equal(T.verificarTokenPesquisa(tok.slice(0, -1) + (tok.endsWith('a') ? 'b' : 'a')), null, 'assinatura alterada');
  assert.equal(T.verificarTokenPesquisa('lixo'), null);

  const D = require('./decisaoToken');
  process.env.CULTO_TOKEN_SECRET = 'segredo-de-teste';
  const tokDecisao = D.gerarTokenDecisao(id);
  assert.notEqual(tokDecisao, tok);
  assert.equal(T.verificarTokenPesquisa(tokDecisao), null, 'namespace diferente = recusado');
  assert.equal(T.montarLinkPesquisa(id, 'https://www.cbrio.org/'), `https://www.cbrio.org/visitante/avaliar/${tok}`);
  delete process.env.CULTO_TOKEN_SECRET;
  if (antes) process.env.VISITANTE_TOKEN_SECRET = antes; else delete process.env.VISITANTE_TOKEN_SECRET;
  if (antesCron) process.env.CRON_SECRET = antesCron;
}


{
  const P = require('./respostaPesquisaVisitante');





  assert.equal(P.BOTOES_TEXTO.length, 3, 'o template vivo tem 3 botões');
  assert.equal(P.NOTA_MAX, 3);
  assert.deepEqual(P.BOTOES_TEXTO.map((b) => b.nota), [3, 2, 1], 'do melhor pro pior');
  assert.equal(P.interpretarNotaVisitante('Amei o culto, me senti em casa'), 3);
  assert.equal(P.interpretarNotaVisitante('Eu gostei, o culto foi bom'), 2);
  assert.equal(P.interpretarNotaVisitante('Não gostei, poderia ser melhor'), 1);

  assert.equal(P.interpretarNotaVisitante('AMEI O CULTO, ME SENTI EM CASA'), 3);
  assert.equal(P.interpretarNotaVisitante('nao gostei, poderia ser melhor'), 1);
  assert.equal(P.interpretarNotaVisitante('  Eu gostei, o culto foi bom  '), 2);


  assert.equal(P.interpretarNotaVisitante('o culto foi bom demais'), null);
  assert.equal(P.interpretarNotaVisitante('amei'), null);
  assert.equal(P.interpretarNotaVisitante('não gostei'), null);

  for (const b of P.BOTOES_TEXTO) assert.equal(P.ehComentario(b.rotulo), false, `"${b.rotulo}" é botão, não comentário`);



  assert.equal(P.interpretarNotaVisitante('3'), 3);
  assert.equal(P.interpretarNotaVisitante(' 2. '), 2);
  assert.equal(P.interpretarNotaVisitante('nota 1'), 1);
  assert.equal(P.interpretarNotaVisitante('⭐⭐'), 2);
  assert.equal(P.interpretarNotaVisitante('2 estrelas'), 2);
  assert.equal(P.interpretarNotaVisitante('4'), null, 'a escala vai até 3');
  assert.equal(P.interpretarNotaVisitante('5'), null, 'a escala vai até 3');
  assert.equal(P.interpretarNotaVisitante('⭐⭐⭐⭐⭐'), null, 'a escala vai até 3');
  assert.equal(P.interpretarNotaVisitante('0'), null);
  assert.equal(P.interpretarNotaVisitante('cheguei 2 minutos atrasado'), null, 'dígito no meio da frase não é nota');
  assert.equal(P.interpretarNotaVisitante('3 minutos'), null);
  assert.equal(P.interpretarNotaVisitante('adorei, nota 10'), null);
  assert.equal(P.ehComentario('Adorei o louvor, muito acolhedor'), true);
  assert.equal(P.ehComentario('2'), false);
  assert.equal(P.ehComentario('👍'), false, 'só emoji não é comentário');




  for (const b of P.BOTOES_TEXTO) {
    const t = P.textoObrigado('Ana', b.nota);
    assert.match(t, /Ana/);
    assert.ok(!/\d/.test(t), `número vazou no agradecimento da nota ${b.nota}: ${t}`);
    assert.ok(!/\bnota\b/i.test(t), `a palavra "nota" vazou no agradecimento: ${t}`);



    assert.ok(/ainda hoje/.test(t), `o agradecimento da nota ${b.nota} não diz o prazo`);

    assert.ok(/digitar aqui na mensagem/.test(t), `falta o convite de feedback na nota ${b.nota}`);
  }

  for (const nota of [3, 2]) {
    const t = P.textoObrigado('Ana', nota);
    assert.ok(t.includes(P.rotuloDaNota(nota)), `o agradecimento da nota ${nota} não ecoa a frase escolhida`);
    assert.ok(t.includes(P.CONVITE_FEEDBACK), `falta o convite padrão na nota ${nota}`);
  }





  {
    const t = P.textoObrigado('Ana', 1);
    assert.ok(!t.includes(P.rotuloDaNota(1)), `o agradecimento do voto ruim repete a reclamação de volta: ${t}`);
    assert.ok(!/n[ãa]o gostei/i.test(t), 'nem em pedaços: o "não gostei" não volta pra pessoa');
    assert.match(t, /[Ss]entimos muito/, 'o voto ruim precisa de acolhimento, não de carimbo');
    assert.ok(t.includes(P.CONVITE_O_QUE_FALTOU), 'o voto ruim pergunta o que faltou');
    assert.ok(!t.includes(P.CONVITE_FEEDBACK), '"mais algum feedback" não serve pra quem já reclamou');
  }
  assert.ok(P.textoObrigado('', 2).length > 10);

  {
    const t = P.textoObrigado('Ana', null);
    assert.ok(!/marcou/.test(t), 'sem nota conhecida não dá pra dizer o que ela marcou');
    assert.ok(/digitar aqui na mensagem/.test(t));
  }

  {
    const bom = P.textoComentarioRecebido('Ana', 3);
    const ruim = P.textoComentarioRecebido('Ana', 1);
    assert.match(bom, /Ana/);
    assert.match(ruim, /Ana/);
    assert.notEqual(bom, ruim, 'quem contou o que deu errado não pode receber o mesmo "esperamos te ver de novo"');
    assert.ok(!/[Ee]speramos te ver de novo/.test(ruim), 'resposta automática demais pra quem reclamou');
    assert.ok(/equipe/.test(ruim), 'no voto ruim a gente diz o que vai FAZER com o que ela contou');
    assert.ok(!/\d/.test(ruim) && !/\d/.test(bom), 'número não volta pra pessoa nem aqui');
  }
  assert.equal(P.rotuloDaNota(3), 'Amei o culto, me senti em casa');
  assert.equal(P.rotuloDaNota(5), null, 'nota fora da escala não tem rótulo');

  assert.deepEqual(P.interpretarRespostaFlowVisitante('{"nota":"2","comentario":" Adorei o louvor ","flow_token":"unused"}'), { nota: 2, comentario: 'Adorei o louvor' });
  assert.deepEqual(P.interpretarRespostaFlowVisitante({ nota: 3 }), { nota: 3, comentario: null });
  assert.deepEqual(P.interpretarRespostaFlowVisitante({ nota: '2', comentario: '' }), { nota: 2, comentario: null });
  assert.equal(P.interpretarRespostaFlowVisitante({ nota: '7' }), null, 'fora de 1..3 não é nosso');
  assert.equal(P.interpretarRespostaFlowVisitante({ nota: '5' }), null, 'a escala vai até 3');
  assert.equal(P.interpretarRespostaFlowVisitante({ comentario: 'x' }), null, 'sem nota não é nosso');
  assert.equal(P.interpretarRespostaFlowVisitante('{lixo'), null);
  assert.equal(P.interpretarRespostaFlowVisitante(null), null);
  assert.equal(P.interpretarRespostaFlowVisitante({ nota: '3', comentario: 'a'.repeat(2000) }).comentario.length, 1000, 'comentário capado em 1000');



  const flow = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'whatsapp-flows', 'visitante-avaliacao.json'), 'utf8'));
  const radio = flow.screens[0].layout.children.find((c) => c.type === 'Form').children.find((c) => c.name === 'nota');
  assert.deepEqual(radio['data-source'].map((o) => o.id).sort(), ['1', '2', '3']);
  for (const o of radio['data-source']) {
    assert.equal(P.interpretarNotaVisitante(o.title), Number(o.id), `opção "${o.title}" do Flow não bate com a régua`);
  }
  assert.equal(flow.screens[0].terminal, true);
}





{
  const svc = fs.readFileSync(path.join(__dirname, '..', 'services', 'visitantePesquisaResposta.js'), 'utf8');


  assert.ok(/!comentarioNaJanela\(/.test(svc), 'visitantePesquisaResposta.js precisa CHAMAR comentarioNaJanela, não só importar');
  assert.ok((svc.match(/comentarioNaJanela/g) || []).length >= 2, 'import + chamada');



  for (const linha of svc.split(/\r?\n/)) {
    if (!/enviarTexto\(|texto:/.test(linha)) continue;
    assert.ok(!/nota \$\{|\bnotas? \d/i.test(linha), `mensagem ao visitante cita o número da nota: ${linha.trim()}`);
    assert.ok(!/1 a 5|1 a 3/.test(linha), `mensagem ao visitante fala da escala em números: ${linha.trim()}`);
  }
}


for (const f of ['visitanteRegras.js', 'visitanteToken.js', 'respostaPesquisaVisitante.js']) {
  const src = fs.readFileSync(path.join(__dirname, f), 'utf8');
  assert.ok(!/require\(['"]\.\.\/utils\/supabase|require\(['"]\.\/supabase|@supabase/.test(src), `${f} não pode carregar Supabase`);
}

console.log('visitanteRegras: OK');
