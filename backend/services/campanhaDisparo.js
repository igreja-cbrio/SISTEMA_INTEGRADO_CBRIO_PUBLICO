




















const { supabase } = require('../utils/supabase');
const { montarPublico } = require('../utils/campanhaPublico');
const adesao = require('./campanhaAdesao');
const T = require('../utils/campanhaTemplates');
const { calcularProgresso, brlRedondo } = require('../utils/campanhaProgresso');
const { fimJanelaCredito } = require('../utils/digitoCampanha');
const { disparoDesligado } = require('./comunicacaoDisparosOff');
const { enviarEmail, isConfigured: emailConfigurado } = require('./email');
const { enfileirarLote } = require('./whatsappFila');


const DISPARO_ID = 'campanha_semanal';

const CONTEXTO_WA = 'campanha.disparo';


async function paginado(montarQuery) {
  const out = [];
  for (let off = 0; ; off += 1000) {
    const { data, error } = await montarQuery(off, off + 999);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

const COLS = 'id, nome, email, telefone, whatsapp_optin, email_optout, status, active, deleted_at';








async function pessoasDoSegmento(segmento, campanhaId) {
  if (segmento === 'membros') {
    return paginado((de, ate) => supabase.from('mem_membros').select(COLS)
      .is('deleted_at', null).eq('active', true).eq('status', 'membro_ativo').range(de, ate));
  }

  if (segmento === 'voluntarios') {



    const perfis = await paginado((de, ate) => supabase.from('vol_profiles')
      .select('membresia_id').not('membresia_id', 'is', null).range(de, ate));
    const ids = [...new Set(perfis.map((p) => p.membresia_id))];
    return porIds(ids);
  }

  if (segmento === 'pais_kids') {
    const vinc = await paginado((de, ate) => supabase.from('kids_responsaveis')
      .select('membro_id').not('membro_id', 'is', null).range(de, ate));
    const ids = [...new Set(vinc.map((v) => v.membro_id))];
    return porIds(ids);
  }

  if (segmento === 'aderentes' || segmento === 'aderentes_em_atraso') {



    const { data: camp, error } = await supabase.from('camp_campanhas')
      .select('*').eq('id', campanhaId).is('deleted_at', null).maybeSingle();
    if (error) throw error;
    if (!camp) return [];
    const li = await adesao.listarInscritos(camp);
    let lista = (li.inscritos || []).filter((i) => i.status !== 'cancelada');
    if (segmento === 'aderentes_em_atraso') {
      const e = await adesao.entradasPorAderente(camp, lista);
      lista = (e.inscritos || []).filter((i) => T.aderenteEmAtraso(i.status_aderente));
    }
    const ids = [...new Set(lista.map((i) => i.membro_id).filter(Boolean))];
    return porIds(ids);
  }

  if (segmento === 'doadores_campanha') {


    const { data: camp } = await supabase.from('camp_campanhas')
      .select('digito, data_inicio, data_fim').eq('id', campanhaId).maybeSingle();
    const ids = new Set();
    if (camp?.digito) {
      let q = supabase.from('fin_transacoes').select('membro_id')
        .eq('tipo', 'receita').eq('identificador_centavo', camp.digito)
        .not('membro_id', 'is', null).limit(1000);
      if (camp.data_inicio) q = q.gte('data_competencia', camp.data_inicio);

      const fimCredito = fimJanelaCredito(camp.data_fim);
      if (fimCredito) q = q.lte('data_competencia', fimCredito);
      const { data } = await q;
      for (const t of data || []) ids.add(t.membro_id);
    }
    const { data: cob } = await supabase.from('pag_cobrancas')
      .select('membro_id, metadata').eq('origem_tipo', 'generosidade').eq('status', 'pago')
      .is('deleted_at', null).not('membro_id', 'is', null).limit(1000);
    for (const c of cob || []) {
      if (String(c.metadata?.campanha_id || '') === String(campanhaId)) ids.add(c.membro_id);
    }
    return porIds([...ids]);
  }



  return paginado((de, ate) => supabase.from('mem_membros').select(COLS)
    .is('deleted_at', null).eq('active', true).range(de, ate));
}

async function porIds(ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 500) {
    const fatia = ids.slice(i, i + 500);
    if (!fatia.length) break;
    const { data, error } = await supabase.from('mem_membros').select(COLS)
      .in('id', fatia).is('deleted_at', null).eq('active', true);
    if (error) throw error;
    out.push(...(data || []));
  }
  return out;
}








async function previa({ campanha_id, canal, segmento }) {
  const pessoas = await pessoasDoSegmento(segmento, campanha_id);
  return montarPublico(pessoas, canal);
}





async function snapshot(disparo) {
  const pub = await previa({
    campanha_id: disparo.campanha_id, canal: disparo.canal, segmento: disparo.segmento,
  });

  const linhas = pub.alvo.map((a) => ({
    disparo_id: disparo.id,
    membro_id: a.id,
    canal: disparo.canal,
    destino: a.destino,
    status: 'pendente',
  }));

  for (let i = 0; i < linhas.length; i += 500) {
    const { error } = await supabase.from('camp_disparo_envios')
      .upsert(linhas.slice(i, i + 500), { onConflict: 'disparo_id,destino', ignoreDuplicates: true });

    if (error && error.code !== '23505') throw error;
  }

  await supabase.from('camp_disparos').update({
    total_alvo: pub.total_alvo,
    total_pulado: pub.total_fora,
    motivos_fora: pub.motivos,
    updated_at: new Date().toISOString(),
  }).eq('id', disparo.id);

  return pub;
}


async function materializar(texto, campanha) {
  if (!texto) return texto;
  const { data: arr } = await supabase.from('vw_camp_arrecadacao')
    .select('*').eq('campanha_id', campanha.id).maybeSingle();
  const p = calcularProgresso(arr || { meta_centavos: campanha.meta_centavos });



  return String(texto)
    .replace(/\{\{campanha\}\}/g, campanha.nome || '')
    .replace(/\{\{meta\}\}/g, brlRedondo(p.meta_centavos))
    .replace(/\{\{arrecadado\}\}/g, brlRedondo(p.total_centavos))
    .replace(/\{\{falta\}\}/g, brlRedondo(p.falta_centavos))
    .replace(/\{\{pct\}\}/g, `${Math.round(p.pct)}%`)
    .replace(/\{\{link\}\}/g, linkPublico(campanha.slug));
}

function linkPublico(slug) {
  const base = String(process.env.PUBLIC_SITE_URL || 'https://cbrio.org').replace(/\/+$/, '');



  return `${base}/campanha/${slug}`;
}









function htmlDoEmail(corpo, { campanha, membroId }) {
  const base = String(process.env.PUBLIC_SITE_URL || 'https://cbrio.org').replace(/\/+$/, '');
  const saida = `${base}/api/public/campanhas/descadastrar?m=${encodeURIComponent(membroId || '')}`;
  const texto = String(corpo || '')
    .split('\n\n').map((par) => `<p style="margin:0 0 16px;line-height:1.6">${
      par.replace(/\n/g, '<br>')}</p>`).join('');

  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
      max-width:560px;margin:0 auto;padding:24px;color:#1a1a1a;font-size:16px">
    ${texto}
    <hr style="border:none;border-top:1px solid #e5e5e5;margin:32px 0 16px">
    <p style="font-size:12px;color:#888;line-height:1.5;margin:0">
      Você recebeu este e-mail porque faz parte da Comunidade Batista do Rio.
      <a href="${saida}" style="color:#888">Não quero mais receber e-mails de campanha</a>.
    </p>
  </div>`;
}









async function enviarPendentes({ disparoId, budgetMs = 240000 } = {}) {
  const t0 = Date.now();

  if (await disparoDesligado(DISPARO_ID)) {
    return { enviados: 0, motivo: 'disparo desligado em Comunicação → Automáticas' };
  }

  let q = supabase.from('camp_disparos')
    .select('*, campanha:campanha_id(id, nome, slug, meta_centavos, status)')
    .in('status', ['agendado', 'enviando'])
    .lte('agendado_para', new Date().toISOString())
    .is('deleted_at', null)
    .order('agendado_para', { ascending: true })
    .limit(5);
  if (disparoId) q = supabase.from('camp_disparos')
    .select('*, campanha:campanha_id(id, nome, slug, meta_centavos, status)')
    .eq('id', disparoId).is('deleted_at', null).limit(1);

  const { data: disparos, error } = await q;
  if (error) throw error;

  const resultado = [];
  for (const d of disparos || []) {
    if (Date.now() - t0 > budgetMs) break;
    resultado.push(await processarUm(d, budgetMs - (Date.now() - t0)));
  }
  return { disparos: resultado };
}

async function processarUm(disparo, budgetMs) {
  const t0 = Date.now();



  if (disparo.campanha?.status !== 'ativa') {
    await supabase.from('camp_disparos').update({
      status: 'cancelado',
      erro: `Campanha está "${disparo.campanha?.status}" — disparo não sai fora de campanha ativa.`,
    }).eq('id', disparo.id);
    return { id: disparo.id, cancelado: true, motivo: 'campanha não ativa' };
  }

  if (disparo.status === 'agendado') {
    await snapshot(disparo);
    await supabase.from('camp_disparos').update({
      status: 'enviando', iniciado_em: new Date().toISOString(),
    }).eq('id', disparo.id);
  }

  const corpo = await materializar(disparo.corpo_texto, disparo.campanha);
  const assunto = await materializar(disparo.assunto, disparo.campanha);

  const { data: pendentes } = await supabase.from('camp_disparo_envios')
    .select('id, membro_id, destino')
    .eq('disparo_id', disparo.id).eq('status', 'pendente')
    .limit(disparo.canal === 'whatsapp' ? 1000 : 300);

  let enviados = 0;
  let falhas = 0;

  if (disparo.canal === 'whatsapp') {



    const itens = (pendentes || []).map((p) => ({
      telefone: p.destino,
      template: disparo.wa_template || null,
      texto: disparo.wa_template ? null : corpo,
      params: disparo.wa_template ? [corpo] : [],
      contexto: CONTEXTO_WA,
      refId: disparo.id,
    }));
    const r = await enfileirarLote(itens);




    if (r.queued > 0) {
      const ids = (pendentes || []).slice(0, r.queued).map((p) => p.id);
      for (let i = 0; i < ids.length; i += 500) {
        await supabase.from('camp_disparo_envios').update({
          status: 'enviado', enviado_em: new Date().toISOString(),
          motivo: 'enfileirado na fila do WhatsApp',
        }).in('id', ids.slice(i, i + 500));
      }
      enviados = r.queued;
    }
    if (r.motivo) falhas = (pendentes || []).length - enviados;
  } else if (disparo.canal === 'email') {
    if (!emailConfigurado()) {
      await supabase.from('camp_disparos').update({
        status: 'falhou', erro: 'Nenhum canal de e-mail configurado (Graph nem Resend).',
      }).eq('id', disparo.id);
      return { id: disparo.id, erro: 'e-mail não configurado' };
    }
    for (const p of pendentes || []) {
      if (Date.now() - t0 > budgetMs) break;
      const r = await enviarEmail({
        to: p.destino,
        subject: assunto || disparo.nome,
        text: corpo,
        html: disparo.corpo_html
          ? htmlDoEmail(await materializar(disparo.corpo_html, disparo.campanha), { campanha: disparo.campanha, membroId: p.membro_id })
          : htmlDoEmail(corpo, { campanha: disparo.campanha, membroId: p.membro_id }),
      }).catch((e) => ({ ok: false, erro: e.message }));

      await supabase.from('camp_disparo_envios').update({
        status: r?.ok === false ? 'falhou' : 'enviado',
        motivo: r?.ok === false ? String(r.erro || 'falha no envio').slice(0, 500) : null,
        enviado_em: new Date().toISOString(),
      }).eq('id', p.id);

      if (r?.ok === false) falhas += 1; else enviados += 1;
    }
  }

  await recontar(disparo.id);


  const { count: restantes } = await supabase.from('camp_disparo_envios')
    .select('id', { count: 'exact', head: true })
    .eq('disparo_id', disparo.id).eq('status', 'pendente');

  if (!restantes) {
    await supabase.from('camp_disparos').update({
      status: 'enviado', concluido_em: new Date().toISOString(),
    }).eq('id', disparo.id);
  }

  return { id: disparo.id, enviados, falhas, restantes: restantes ?? 0 };
}


async function recontar(disparoId) {
  const { data } = await supabase.from('camp_disparo_envios')
    .select('status').eq('disparo_id', disparoId).limit(10000);
  const c = { enviado: 0, falhou: 0, pulado: 0 };
  for (const l of data || []) if (c[l.status] !== undefined) c[l.status] += 1;
  await supabase.from('camp_disparos').update({
    total_enviado: c.enviado, total_falha: c.falhou,
    updated_at: new Date().toISOString(),
  }).eq('id', disparoId);
  return c;
}









async function garantirSemanal(campanhaId) {
  const { data: camp } = await supabase.from('camp_campanhas')
    .select('*').eq('id', campanhaId).is('deleted_at', null).maybeSingle();
  if (!camp || camp.status !== 'ativa') return { criado: false, motivo: 'campanha não ativa' };

  const { data: modelo } = await supabase.from('camp_disparos')
    .select('*').eq('campanha_id', campanhaId)
    .eq('recorrencia', 'semanal_segunda').eq('canal', 'email')
    .is('deleted_at', null).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!modelo) return { criado: false, motivo: 'nenhum disparo semanal configurado' };

  const agora = new Date();
  const semana = semanaIso(agora);
  const nome = `${modelo.nome} · ${semana}`;

  const { data: existente } = await supabase.from('camp_disparos')
    .select('id').eq('campanha_id', campanhaId).eq('nome', nome)
    .is('deleted_at', null).maybeSingle();
  if (existente) return { criado: false, motivo: 'já existe o desta semana', id: existente.id };

  const { data: novo, error } = await supabase.from('camp_disparos').insert({
    campanha_id: campanhaId,
    nome,
    canal: 'email',
    segmento: modelo.segmento,
    assunto: modelo.assunto,
    corpo_texto: modelo.corpo_texto,
    corpo_html: modelo.corpo_html,
    recorrencia: 'unico',
    status: 'agendado',
    agendado_para: agora.toISOString(),
    created_by: modelo.created_by,
  }).select('id').single();
  if (error) throw error;
  return { criado: true, id: novo.id, semana };
}


function semanaIso(d) {
  const brt = new Date(d.getTime() - 3 * 3600 * 1000);
  const alvo = new Date(Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), brt.getUTCDate()));
  const dia = alvo.getUTCDay() || 7;
  alvo.setUTCDate(alvo.getUTCDate() + 4 - dia);
  const ano = alvo.getUTCFullYear();
  const jan1 = new Date(Date.UTC(ano, 0, 1));
  const sem = Math.ceil(((alvo - jan1) / 86400000 + 1) / 7);
  return `${ano}-W${String(sem).padStart(2, '0')}`;
}

module.exports = {
  DISPARO_ID,
  CONTEXTO_WA,
  previa,
  snapshot,
  enviarPendentes,
  garantirSemanal,
  materializar,
  linkPublico,
  htmlDoEmail,
  recontar,
  semanaIso,
  pessoasDoSegmento,
};
