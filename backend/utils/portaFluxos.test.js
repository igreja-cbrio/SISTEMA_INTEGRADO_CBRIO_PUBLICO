





const assert = require('assert');
const F = require('./portaFluxos');

const AGORA = new Date('2026-09-14T15:00:00-03:00');
const DOMINGO = '2026-09-13T11:40:00-03:00';

function visita(extra) {
  return { created_at: DOMINGO, voucher_status: 'emitido', ...extra };
}
function estado(registro, acoes, agora) {
  return F.estadoDoFluxo({ porta: 'visitante', registro, acoes: acoes || {}, agora: agora || AGORA });
}
function sit(st, chave) {
  return st.etapas.find((e) => e.chave === chave).situacao;
}


assert.deepEqual(F.PORTAS, ['visitante'], 'só a porta do visitante por enquanto');
const fx = F.fluxoDaPorta('visitante');
assert.equal(fx.refTipo, 'vis_visitas');
assert.equal(F.fluxoDaPorta('nao_existe'), null);
assert.equal(F.fluxoDaPorta(), null);




for (const p of F.PORTAS) {
  const enc = F.fluxoDaPorta(p).etapas.filter((e) => e.encerra);
  assert.equal(enc.length, 1, `a porta ${p} precisa de exatamente uma etapa que encerra`);
  assert.equal(enc[0].dependeDaPessoa, undefined, 'quem encerra é a igreja, nunca a pessoa');
}
for (const p of F.PORTAS) {
  const fl = F.fluxoDaPorta(p);
  for (const e of fl.etapas.filter((x) => x.dependeDaPessoa)) {
    for (const quando of ['2026-09-13T12:00:00-03:00', '2026-09-14T15:00:00-03:00', '2027-01-01T00:00:00-03:00']) {
      const s = F.situacaoEtapa({ porta: p, etapa: e, registro: { created_at: DOMINGO }, acoes: {}, agora: new Date(quando) });
      assert.notEqual(s, 'atrasado', `${p}/${e.chave} acusou a pessoa de atraso em ${quando}`);
      assert.notEqual(s, 'vence_hoje', `${p}/${e.chave} cobrou prazo da pessoa em ${quando}`);
    }
  }
}


for (const p of F.PORTAS) {
  const ch = F.fluxoDaPorta(p).etapas.map((e) => e.chave);
  assert.equal(new Set(ch).size, ch.length, `chaves repetidas na porta ${p}`);
}




assert.deepEqual(F.etapasCobradas('visitante').map((e) => e.chave), ['contato', 'desfecho']);
for (const e of F.fluxoDaPorta('visitante').etapas) {
  if (['registro', 'voucher', 'pesquisa'].includes(e.chave)) {
    assert.equal(e.dependeDaPessoa, true, `${e.chave} depende da pessoa e não pode ser cobrado`);
  }
}




assert.equal(F.prazoDaEtapa(DOMINGO, 1), Date.parse('2026-09-15T00:00:00-03:00'));
assert.equal(F.prazoDaEtapa(DOMINGO, 0), Date.parse('2026-09-14T00:00:00-03:00'));
assert.equal(F.prazoDaEtapa(DOMINGO, 3), Date.parse('2026-09-17T00:00:00-03:00'));

assert.equal(F.prazoDaEtapa('2026-09-13T19:30:00-03:00', 1), Date.parse('2026-09-15T00:00:00-03:00'));

assert.equal(F.prazoDaEtapa('2026-09-13T23:50:00-03:00', 1), Date.parse('2026-09-15T00:00:00-03:00'));
assert.equal(F.prazoDaEtapa('data-invalida', 1), null);


{

  const st = estado(visita());
  assert.equal(sit(st, 'registro'), 'feito', 'quem está na lista registrou');



  assert.equal(sit(st, 'voucher'), 'aguardando');
  assert.equal(sit(st, 'pesquisa'), 'aguardando');
  assert.equal(sit(st, 'contato'), 'vence_hoje');
  assert.equal(sit(st, 'desfecho'), 'no_prazo');
  assert.equal(st.atual, 'contato', 'o que a equipe tem que fazer agora');
  assert.equal(st.encerrado, false);
  assert.deepEqual(st.atrasadas, []);
  assert.equal(st.cobradas_pendentes, 2);
}
{

  const st = estado(visita(), {}, new Date('2026-09-15T09:00:00-03:00'));
  assert.equal(sit(st, 'contato'), 'atrasado');
  assert.deepEqual(st.atrasadas, ['contato']);
}
{

  const st = estado(visita({ primeiro_contato_em: '2026-09-14T10:00:00-03:00' }));
  assert.equal(sit(st, 'contato'), 'feito');
  assert.equal(st.atual, 'desfecho');
  assert.equal(st.cobradas_pendentes, 1);
}
{

  const st = estado(visita({ voucher_status: 'resgatado', voucher_resgatado_em: '2026-09-13T12:10:00-03:00' }));
  assert.equal(sit(st, 'voucher'), 'feito');
  assert.equal(st.etapas.find((e) => e.chave === 'voucher').feito_em, Date.parse('2026-09-13T12:10:00-03:00'));
  assert.equal(st.atual, 'contato', 'o café não adianta nem atrasa o dever da igreja');
}
{

  assert.equal(sit(estado(visita({ voucher_status: 'repetido' })), 'voucher'), 'aguardando');
}


{
  const acoes = { desfecho: { resultado: 'sem_necessidade', feito_em: '2026-09-14T18:00:00-03:00' } };
  const st = estado(visita(), acoes, new Date('2026-09-20T09:00:00-03:00'));
  assert.equal(st.encerrado, true);
  assert.equal(st.desfecho, 'sem_necessidade');
  assert.equal(sit(st, 'desfecho'), 'feito');


  assert.equal(sit(st, 'contato'), 'dispensada');
  assert.deepEqual(st.atrasadas, [], 'fluxo encerrado não tem atraso');
  assert.equal(st.atual, null, 'nada pendente depois de encerrado');
  assert.equal(st.cobradas_pendentes, 0);
}
{
  const acoes = { desfecho: { resultado: 'encaminhada', encaminhamento: 'grupo', feito_em: '2026-09-14T18:00:00-03:00' } };
  const st = estado(visita({ primeiro_contato_em: '2026-09-14T10:00:00-03:00' }), acoes);
  assert.equal(st.desfecho, 'encaminhada');
  assert.equal(st.encaminhamento, 'grupo');
}




{
  const st = estado(visita());
  const voucher = st.etapas.find((e) => e.chave === 'voucher');
  assert.equal(voucher.depende_da_pessoa, true, 'a etapa sai com depende_da_pessoa');
  assert.equal('dependeDaPessoa' in voucher, false, 'camelCase não pode vazar pra API');
  assert.equal(st.etapas.find((e) => e.chave === 'contato').depende_da_pessoa, false);

  for (const k of ['chave', 'label', 'quem', 'depende_da_pessoa', 'encerra', 'prazo_em', 'feito_em', 'situacao']) {
    assert.ok(k in voucher, `falta ${k} no objeto da etapa`);
  }
}

assert.equal(estado(null), null, 'sem registro não há retrato');
assert.equal(F.estadoDoFluxo({ porta: 'xpto', registro: visita() }), null);


{
  const itens = [

    { registro: visita({ primeiro_contato_em: '2026-09-14T10:00:00-03:00' }),
      acoes: { desfecho: { resultado: 'sem_necessidade', feito_em: '2026-09-14T11:00:00-03:00' } } },

    { registro: visita({ primeiro_contato_em: '2026-09-14T10:00:00-03:00' }), acoes: {} },

    { registro: visita(), acoes: {} },
  ];
  const ad = F.adesaoDoFluxo({ porta: 'visitante', itens, agora: new Date('2026-09-20T09:00:00-03:00') });
  assert.equal(ad.pessoas, 3);
  assert.equal(ad.encerrados, 1);
  assert.equal(ad.por_etapa.contato.feito, 2);
  assert.equal(ad.por_etapa.contato.atrasado, 1);
  assert.equal(ad.por_etapa.desfecho.feito, 1);
  assert.equal(ad.por_etapa.desfecho.atrasado, 2);

  assert.equal(ad.vencidas, 6);
  assert.equal(ad.adesao_pct, 50);

  assert.equal(ad.por_etapa.voucher, undefined, 'café não entra na adesão');
  assert.equal(ad.por_etapa.pesquisa, undefined, 'pesquisa não entra na adesão');
}
{



  const ad = F.adesaoDoFluxo({ porta: 'visitante', itens: [{ registro: visita(), acoes: {} }], agora: new Date('2026-09-13T12:00:00-03:00') });
  assert.equal(ad.adesao_pct, null);
  assert.equal(ad.vencidas, 0);
  assert.equal(ad.pessoas, 1);
}
assert.deepEqual(F.adesaoDoFluxo({ porta: 'visitante', itens: [] }).por_etapa.contato,
  { label: 'Falar com ela', feito: 0, atrasado: 0, no_prazo: 0, dispensada: 0 });
assert.equal(F.adesaoDoFluxo({ porta: 'xpto', itens: [] }), null);


assert.equal(F.validarDesfecho({ resultado: 'sem_necessidade' }).ok, true);
assert.equal(F.validarDesfecho({ resultado: 'nao_alcancada' }).ok, true);
assert.equal(F.validarDesfecho({ resultado: 'encaminhada', encaminhamento: 'next' }).ok, true);


assert.equal(F.validarDesfecho({ resultado: 'encaminhada' }).ok, false);
assert.equal(F.validarDesfecho({ resultado: 'encaminhada', encaminhamento: '  ' }).ok, false);




{
  const vazio = F.validarDesfecho({ resultado: 'encaminhada' });
  const errado = F.validarDesfecho({ resultado: 'encaminhada', encaminhamento: 'padaria' });
  assert.match(vazio.erro, /para onde/i, 'o erro do campo vazio pede o destino');
  assert.notEqual(vazio.erro, errado.erro, 'em branco e inválido não podem dar a mesma mensagem');
  assert.equal(vazio.campo, 'encaminhamento');
  assert.equal(errado.campo, 'encaminhamento');
}
assert.equal(F.validarDesfecho({ resultado: 'encaminhada', encaminhamento: 'padaria' }).ok, false);
assert.equal(F.validarDesfecho({ resultado: '' }).ok, false);
assert.equal(F.validarDesfecho({}).ok, false);
assert.equal(F.validarDesfecho({ resultado: 'encerrado' }).ok, false, 'valor fora da lista é recusado');

assert.equal(F.validarDesfecho({ resultado: 'sem_necessidade', encaminhamento: 'padaria' }).ok, false);
assert.equal(F.validarDesfecho({ resultado: 'sem_necessidade', encaminhamento: 'grupo' }).encaminhamento, 'grupo');
assert.equal(F.validarDesfecho({ resultado: 'sem_necessidade' }).encaminhamento, null);


const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, 'portaFluxos.js'), 'utf8');
assert.ok(!/require\(['"]\.\.\/utils\/supabase|require\(['"]\.\/supabase|@supabase/.test(src),
  'portaFluxos.js não pode carregar Supabase');

console.log('portaFluxos: OK');
