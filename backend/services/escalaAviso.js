





















const { supabase } = require('../utils/supabase');
const fila = require('./whatsappFila');
const { perfisPorId } = require('./agenteVoluntariado');
const { notificarApp } = require('./appPush');
const { agruparParaAviso, selecionarRodada } = require('../utils/avisoEscala');
const { disparoDesligado } = require('./comunicacaoDisparosOff');

const CONTEXTO = 'voluntariado.escala_aviso';


const DISPARO_ID = 'escala_vespera';


const chaveApp = (escalaId) => `escala_aviso:${escalaId}`;



const TETO_RODADA = 200;
const LOTE_IN = 200;

async function _emLotes(valores, build) {
  const uniq = [...new Set((valores || []).filter(Boolean))];
  let out = [];
  for (let i = 0; i < uniq.length; i += LOTE_IN) {
    const { data, error } = await build(uniq.slice(i, i + LOTE_IN));
    if (error) throw new Error(error.message);
    out = out.concat(data || []);
  }
  return out;
}













async function avisarEscalasDaSemana({ dias = 7, diasAlvo = null, porAntecedencia = false, teto = TETO_RODADA, agora = new Date().toISOString() } = {}) {
  const base = {
    janela_dias: dias, grupos: 0, enfileirados: 0, app_avisados: 0, adiados: 0,
    sem_telefone: 0, ja_avisados: 0, template_configurado: false, motivo: null,
  };

  const templateName = process.env.WHATSAPP_TEMPLATE_ESCALA;


  const fim = new Date(new Date(agora).getTime() + dias * 86400000).toISOString();
  const { data: cultos, error: cErr } = await supabase
    .from('vol_services').select('id, name, scheduled_at')
    .gte('scheduled_at', agora).lte('scheduled_at', fim).order('scheduled_at');
  if (cErr) return { ...base, motivo: `Não foi possível ler os cultos: ${cErr.message}` };
  if (!cultos?.length) return { ...base, motivo: 'Nenhum culto na janela.' };

  const nomePorCulto = Object.fromEntries(cultos.map(c => [c.id, c]));


  const escalasBrutas = await _emLotes(cultos.map(c => c.id), (chunk) => supabase
    .from('vol_schedules')
    .select('id, service_id, team_id, volunteer_id, planning_center_person_id, volunteer_name, team_name, confirmation_status')
    .in('service_id', chunk));
  if (!escalasBrutas.length) return { ...base, motivo: 'Ninguém escalado na janela.' };





  let areaPorEquipe = {};
  try {
    const equipes = await _emLotes(
      [...new Set(escalasBrutas.map(e => e.team_id).filter(Boolean))],
      (chunk) => supabase.from('vol_teams').select('id, area').in('id', chunk),
    );
    areaPorEquipe = Object.fromEntries((equipes || []).map(t => [t.id, t.area]));
  } catch (e) {
    console.warn('[escalaAviso] área das equipes indisponível — todos na véspera:', e.message);
  }

  const escalas = escalasBrutas.map(e => ({
    ...e,
    team_area: areaPorEquipe[e.team_id] || null,
    scheduled_at: nomePorCulto[e.service_id]?.scheduled_at,
    service_name: nomePorCulto[e.service_id]?.name,
  }));

  const grupos = agruparParaAviso({ escalas, agora, dias, diasAlvo, porAntecedencia });
  if (!grupos.length) return { ...base, motivo: 'Ninguém a avisar nesta janela.' };






  const idsEscala = grupos.flatMap(g => g.escala_ids);
  const [enviados, noApp] = await Promise.all([
    _emLotes(idsEscala, (chunk) => supabase
      .from('whatsapp_envios').select('ref_id').eq('contexto', CONTEXTO).in('ref_id', chunk)),


    _emLotes(idsEscala.map(chaveApp), (chunk) => supabase
      .from('app_notificacoes').select('chave_dedup').in('chave_dedup', chunk)).catch((e) => {
      console.warn('[escalaAviso] dedup do app indisponível:', e.message);
      return [];
    }),
  ]);
  const jaAvisados = new Set([
    ...(enviados || []).map(e => e.ref_id),
    ...(noApp || []).map(n => String(n.chave_dedup || '').replace(/^escala_aviso:/, '')),
  ].filter(Boolean));




  const perfis = await perfisPorId(grupos.map(g => g.volunteer_id).filter(Boolean));
  const telefonePorPessoa = new Map();
  for (const g of grupos) {
    const p = g.volunteer_id ? perfis[g.volunteer_id] : null;
    if (p?.phone) telefonePorPessoa.set(g.pessoa, p.phone);
  }

  const sel = selecionarRodada({ grupos, jaAvisados, telefonePorPessoa, teto });












  let app_avisados = 0;
  const pendentes = grupos.filter(g => !g.escala_ids.some(id => jaAvisados.has(id)));
  if (pendentes.length) {
    try {
      const membroIds = pendentes
        .map(g => (g.volunteer_id ? perfis[g.volunteer_id]?.membro_id : null))
        .filter(Boolean);
      const contas = await _emLotes(membroIds, (chunk) => supabase
        .from('profiles').select('id, membro_id').in('membro_id', chunk));
      const userPorMembro = Object.fromEntries((contas || []).map(c => [c.membro_id, c.id]));

      for (const g of pendentes.slice(0, teto)) {
        const membroId = g.volunteer_id ? perfis[g.volunteer_id]?.membro_id : null;
        const userId = membroId ? userPorMembro[membroId] : null;
        if (!userId) continue;
        const r = await notificarApp([userId], {
          tipo: 'escala',
          titulo: 'Você está escalado(a)',
          body: `${g.params[0]} · ${g.params[2]}`,





          data: { tipo: 'escala', escala_ids: g.escala_ids },
          chaveDedup: chaveApp(g.escala_ids[0]),
        });
        if (r?.enviados !== 0) app_avisados++;
      }
    } catch (e) {

      console.error('[escalaAviso] aviso no app falhou:', e.message);
    }
  }

  const relatorio = {
    ...base,
    grupos: grupos.length,
    adiados: sel.adiados,
    sem_telefone: sel.sem_telefone.length,
    ja_avisados: sel.ja_avisados,
    app_avisados,
    template_configurado: !!templateName,
  };

  if (!sel.rodada.length) {
    const porApp = app_avisados > 0 ? ` ${app_avisados} pessoa(s) foram avisadas pelo app.` : '';
    return {
      ...relatorio,
      motivo: sel.ja_avisados === grupos.length
        ? 'Todo mundo da janela já foi avisado.'
        : `Ninguém com telefone alcançável nesta rodada.${porApp}`,
    };
  }















  if (await disparoDesligado(DISPARO_ID)) {
    const porApp = app_avisados > 0 ? ` ${app_avisados} pessoa(s) foram avisadas pelo app.` : '';
    return {
      ...relatorio,
      desligado: true,
      motivo: `O lembrete de escala por WhatsApp está DESLIGADO na tela (Comunicação → Disparos → Automáticas).${porApp}`,
    };
  }




  if (!templateName) {
    return {
      ...relatorio,
      motivo: app_avisados > 0
        ? `${app_avisados} pessoa(s) foram avisadas pelo app. O WhatsApp não saiu: o template de escala não está configurado (WHATSAPP_TEMPLATE_ESCALA) — e a Vercel só aplica variável de ambiente nova em deployment novo.`
        : 'O template de escala não está configurado (WHATSAPP_TEMPLATE_ESCALA) — nenhuma mensagem foi enviada. A Vercel só aplica variável de ambiente nova em deployment novo.',
    };
  }














  const r = await fila.enfileirarLote(sel.rodada.map(g => ({
    telefone: g.telefone,
    template: templateName,
    idioma: 'pt_BR',
    params: g.params,



    contexto: CONTEXTO,



    refId: g.escala_ids[0],
  })));

  return {
    ...relatorio,
    enfileirados: r.queued || 0,
    motivo: (r.queued || 0) === 0
      ? (r.motivo === 'disabled'
        ? 'O envio de WhatsApp está desligado (kill-switch) — nenhuma mensagem foi enviada.'
        : 'Nenhuma mensagem foi enfileirada.')
      : null,
  };
}










async function avisarVespera(opts = {}) {
  const agora = opts.agora || new Date().toISOString();
  return avisarEscalasDaSemana({ ...opts, agora, dias: 4, porAntecedencia: true });
}

module.exports = { avisarEscalasDaSemana, avisarVespera, CONTEXTO, TETO_RODADA, DISPARO_ID };
