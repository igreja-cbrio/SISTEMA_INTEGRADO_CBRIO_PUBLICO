









const router = require('express').Router();
const { authenticate, authorizeModule } = require('../middleware/auth');
const { requireCron } = require('../utils/cronAuth');
const { supabase } = require('../utils/supabase');
const { sincronizarComMeta, seedDosEnvs } = require('../services/waTemplates');
const { enfileirarLote } = require('../services/whatsappFila');
const { AppError, ERROR_CODES } = require('../utils/appError');
const { captureHandledException } = require('../utils/sentry');

const DASH = require('../utils/comunicacaoDashboard');
const { resolverJanelaPeriodo, rotuloJanela } = require('../utils/janelaPeriodo');
const { diaBrt } = require('../utils/whatsappModulo');

const NOVO = require('../utils/novoEnvio');

const CONEXAO = require('../utils/conexaoWhatsapp');

function communicationError(error, publicMessage) {
  return new AppError(error?.message || publicMessage, {
    code: ERROR_CODES.COMMUNICATION_OPERATION_FAILED,
    publicMessage,
    cause: error,
    isOperational: false,
  });
}




router.get('/cron/agendamentos', requireCron, async (req, res, next) => {
  try {
    const agora = new Date(Date.now() - 3 * 3600 * 1000);
    const hojeISO = agora.toISOString().slice(0, 10);
    const horaAtual = agora.getUTCHours();
    const diaSemana = agora.getUTCDay();
    const diaMes = agora.getUTCDate();

    const { data: ativos, error: errAtivos } = await supabase.from('wa_agendamentos')
      .select('*').eq('ativo', true).order('created_at', { ascending: true }).limit(200);
    if (errAtivos) {


      console.error('[comunicacao] cron agendamentos query:', errAtivos.message);
      return res.status(500).json({ error: 'Falha ao consultar os agendamentos' });
    }

    let disparados = 0;
    const resultados = [];
    for (const a of ativos || []) {
      try {
        let deve = false;
        if (a.quando) {

          deve = !a.ultimo_disparo && new Date(a.quando) <= new Date();
        } else if (a.recorrencia) {

          const horaAg = a.hora ? parseInt(String(a.hora).slice(0, 2), 10) : 9;
          const jaHoje = a.ultimo_disparo && String(new Date(new Date(a.ultimo_disparo).getTime() - 3 * 3600 * 1000).toISOString()).slice(0, 10) === hojeISO;
          const casaDia = a.recorrencia === 'diaria'
            || (a.recorrencia === 'semanal' && a.dia_semana === diaSemana)
            || (a.recorrencia === 'mensal' && a.dia_mes === diaMes);
          deve = casaDia && horaAtual >= horaAg && !jaHoje;
        }
        if (!deve) continue;


        const telefones = a.audiencia?.tipo === 'telefones' ? (a.audiencia.telefones || []) : [];
        if (!telefones.length) { resultados.push({ id: a.id, pulado: 'audiencia_vazia' }); continue; }

        const itens = telefones.map((tel) => ({
          telefone: tel,
          template: a.template_nome || undefined,
          texto: a.texto || undefined,
          params: Array.isArray(a.params) ? a.params : [],
          contexto: `comunicacao.agendamento`,
          refId: a.id,
        }));
        const r = await enfileirarLote(itens);




        if (!r.queued) {
          resultados.push({ id: a.id, nome: a.nome, pulado: r.motivo || 'nada_enfileirado' });
          continue;
        }
        await supabase.from('wa_agendamentos')
          .update({ ultimo_disparo: new Date().toISOString(), ...(a.quando ? { ativo: false } : {}) })
          .eq('id', a.id);
        disparados += 1;
        resultados.push({ id: a.id, nome: a.nome, enfileirados: r.queued });
      } catch (e) {
        console.error('[comunicacao] agendamento %s:', a.id, e.message);
        captureHandledException(communicationError(e, 'Erro ao processar agendamento.'), req, 'communication.schedule.item');
        resultados.push({ id: a.id, erro: 'falha_no_agendamento', request_id: req.requestId });
      }
    }





    const sync_templates = await sincronizarComMeta().catch((e) => ({ sincronizados: 0, erro: e.message }));
    if (sync_templates?.erro) console.warn('[comunicacao] sync templates (cron):', sync_templates.erro);




    const orfaos_reconciliados = await require('../services/waStatusReconcile')
      .reconciliarStatusOrfaos().catch((e) => ({ ok: false, erro: e.message }));
    if (orfaos_reconciliados && orfaos_reconciliados.ok === false) {
      console.error('[comunicacao] reconciliar órfãos:', orfaos_reconciliados.erro);
    }





    let faxina_midia = null;
    if (horaAtual === 4) {
      faxina_midia = await require('../services/waInbox').limparMidiasAntigas()
        .catch((e) => ({ ok: false, erro: e.message }));
      if (faxina_midia && faxina_midia.ok === false) {
        console.error('[comunicacao] faxina de mídia:', faxina_midia.erro);
      }
    }











    let campanha_semanal = null;
    let campanha_disparos = null;
    let campanha_agradecimentos = null;
    try {
      const campanhas = require('./campanhas');




      if (diaSemana === 1) {
        const { data: ativas } = await supabase.from('camp_campanhas')
          .select('id').eq('status', 'ativa').is('deleted_at', null);
        const criados = [];
        for (const c of ativas || []) {
          criados.push(await campanhas.garantirSemanal(c.id).catch((e) => ({ erro: e.message })));
        }
        campanha_semanal = criados;
      }




      campanha_disparos = await campanhas.enviarPendentes({ budgetMs: 120000 });


      campanha_agradecimentos = await campanhas.rodarAgradecimentos({ limite: 40 });
    } catch (e) {
      console.error('[comunicacao] campanhas (carona no cron):', e.message);
      campanha_disparos = { erro: e.message };
    }









    let bot_varredura = null;
    try {
      bot_varredura = await require('../services/botIaVarredura').rodarSeDevido({ agoraMs: Date.now() });
    } catch (e) {
      console.error('[comunicacao] varredura mensal do bot (carona no cron):', e.message);
      bot_varredura = { erro: e.message };
    }




    const encerramento_conversas = await require('../services/waEncerramento')
      .encerrarVencidas().catch((e) => ({ ok: false, erro: e.message }));
    if (encerramento_conversas && encerramento_conversas.ok === false) {
      console.error('[comunicacao] encerramento de conversas:', encerramento_conversas.erro);
    }

    res.json({
      ok: true, disparados, resultados, orfaos_reconciliados, encerramento_conversas,
      ...(faxina_midia ? { faxina_midia } : {}),
      ...(campanha_semanal ? { campanha_semanal } : {}),
      ...(campanha_disparos ? { campanha_disparos } : {}),
      ...(campanha_agradecimentos ? { campanha_agradecimentos } : {}),
      bot_varredura,
    });
  } catch (e) {
    console.error('[comunicacao] cron agendamentos:', e.message);
    next(communicationError(e, 'Erro no cron de agendamentos.'));
  }
});




router.use(authenticate, authorizeModule('comunicacao', 1));


router.get('/numeros', async (_req, res) => {
  const { data, error } = await supabase.from('wa_numeros').select('*').order('created_at');
  if (error) return res.status(400).json({ error: error.message });

  res.json({ numeros: data || [], env_phone_number_id: process.env.WHATSAPP_PHONE_NUMBER_ID || null });
});









router.get('/conversas/:id/sugestao-grupo', authorizeModule('conversas', 1), require('../middleware/escopoConversa').criarEscopoConversa(supabase), async (req, res) => {
  try {



    const r = await require('../services/sugestaoGrupoAgenda')
      .sugerirAgenda(req.params.id, { somenteSeReconhecer: req.query.auto === '1' });
    res.json(r);
  } catch (e) {


    console.error('[comunicacao] sugestao-grupo:', e.message);
    res.status(500).json({ error: 'Erro ao montar a sugestão', detalhe: e.message });
  }
});

router.post('/numeros', authorizeModule('comunicacao', 5), async (req, res) => {
  const b = req.body || {};
  if (!b.phone_number_id) return res.status(400).json({ error: 'phone_number_id obrigatório' });
  const { data, error } = await supabase.from('wa_numeros')
    .insert({
      phone_number_id: String(b.phone_number_id).trim(),
      rotulo: b.rotulo || null,
      waba_id: b.waba_id || process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || null,
      is_default: b.is_default !== false,
    }).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

router.put('/numeros/:id', authorizeModule('comunicacao', 5), async (req, res) => {
  const b = req.body || {};
  const patch = {};
  ['rotulo', 'waba_id', 'is_default', 'ativo'].forEach(k => { if (k in b) patch[k] = b[k]; });
  const { data, error } = await supabase.from('wa_numeros')
    .update(patch).eq('id', req.params.id).select().maybeSingle();
  if (error) return res.status(400).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Número não encontrado' });
  res.json(data);
});








router.get('/conexao', async (_req, res, next) => {
  try {
    const avisos = [];
    const ler = async (nome, fn, vazio) => {
      try { return await fn(); }
      catch (e) { console.warn(`[comunicacao] conexao ${nome}:`, e.message); avisos.push(nome); return vazio; }
    };
    const cfg = await ler('config', async () => {
      const { data, error } = await supabase.from('whatsapp_config').select('ia_ativa, respostas_automaticas, updated_at').eq('id', 1).maybeSingle();
      if (error) throw error;
      return data;
    }, null);


    const modo = await ler('modo', async () => {
      if (!cfg) return 'ninguem';
      const botIa = require('../services/botIaResposta');
      const R = require('../utils/botIaRegras');
      const c = await botIa.lerConfig();
      return R.modoResposta({ cfg, erroCfg: null, botIa: c.botIa });
    }, 'ninguem');
    const numeros = await ler('numeros', async () => {
      const { data, error } = await supabase.from('wa_numeros').select('id, phone_number_id, rotulo, is_default, ativo').order('created_at');
      if (error) throw error;
      return data || [];
    }, []);
    const ultimo = (nome, tabela, coluna, filtro) => ler(nome, async () => {
      let q = supabase.from(tabela).select(coluna).not(coluna, 'is', null).order(coluna, { ascending: false }).limit(1);
      if (filtro) q = filtro(q);
      const { data, error } = await q;
      if (error) throw error;
      return (data && data[0] && data[0][coluna]) || null;
    }, null);
    const [ultimaRecebida, ultimoEnvio, ultimoSync] = await Promise.all([
      ultimo('ultima_recebida', 'wa_mensagens', 'criado_em', q => q.eq('direcao', 'in')),
      ultimo('ultimo_envio', 'whatsapp_envios', 'enviado_em', q => q.eq('status', 'enviado')),
      ultimo('sync_templates', 'wa_templates', 'sincronizado_em'),
    ]);
    const tpl = await ler('templates', async () => {
      const { data, error } = await supabase.from('wa_templates').select('status_meta');
      if (error) throw error;
      const total = (data || []).length;
      const aprovados = (data || []).filter(t => String(t.status_meta || '').toUpperCase() === 'APPROVED').length;
      return { total, aprovados };
    }, { total: 0, aprovados: 0 });

    const r = CONEXAO.avaliarConexao({
      envPhoneId: process.env.WHATSAPP_PHONE_NUMBER_ID || null,
      wabaId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || null,
      numeros, webhookLigado: cfg ? cfg.ia_ativa !== false : true, modo,
      ultimoInboundEm: ultimaRecebida, ultimoOutboundEm: ultimoEnvio, ultimoSyncTemplatesEm: ultimoSync,
      templatesAprovados: tpl.aprovados, templatesTotal: tpl.total, agoraMs: Date.now(),
    });
    res.json({
      ...r,
      alertas: r.alertas.map(codigo => ({ codigo, texto: CONEXAO.textoAlerta(codigo) })),
      numeros_cadastrados: numeros,
      config_atualizada_em: cfg ? cfg.updated_at || null : null,
      avisos,
    });
  } catch (e) {
    console.error('[comunicacao] conexao:', e.message);
    next(communicationError(e, 'Erro ao consultar a conexão.'));
  }
});



router.put('/conexao', authorizeModule('comunicacao', 5), async (req, res, next) => {
  try {
    const v = req.body ? req.body.webhook_ligado : undefined;
    if (typeof v !== 'boolean') return res.status(400).json({ error: 'Informe webhook_ligado como true ou false.' });
    const { error } = await supabase.from('whatsapp_config')
      .update({ ia_ativa: v, updated_at: new Date().toISOString(), updated_by: req.user?.userId || null }).eq('id', 1);
    if (error) throw error;
    res.json({ ok: true, webhook: v ? 'ligado' : 'desligado' });
  } catch (e) {
    console.error('[comunicacao] conexao put:', e.message);
    next(communicationError(e, 'Erro ao alterar o webhook.'));
  }
});



router.post('/templates/testar', authorizeModule('comunicacao', 3), async (req, res, next) => {
  try {
    const { testarDisparoPara } = require('../services/whatsappTesteDisparo');
    res.json(await testarDisparoPara(req.user?.userId, req.body ? req.body.chave : undefined));
  } catch (e) {
    console.error('[comunicacao] templates/testar:', e.message);
    next(communicationError(e, 'Erro ao testar o template.'));
  }
});

router.get('/templates', async (req, res) => {
  let q = supabase.from('wa_templates').select('*').order('nome');
  if (req.query.modulo) q = q.eq('modulo', String(req.query.modulo));
  if (req.query.status) q = q.eq('status_meta', String(req.query.status).toUpperCase());
  const { data, error } = await q;
  if (error) return res.status(400).json({ error: error.message });
  res.json(data || []);
});


router.post('/templates/sync', authorizeModule('comunicacao', 3), async (_req, res) => {
  const meta = await sincronizarComMeta();
  const seed = await seedDosEnvs();
  res.json({ ...meta, ...seed });
});

router.put('/templates/:id', authorizeModule('comunicacao', 3), async (req, res) => {
  const b = req.body || {};
  const patch = {};


  ['modulo', 'ativo', 'exemplo', 'categoria'].forEach(k => { if (k in b) patch[k] = b[k]; });
  if ('categoria' in patch && patch.categoria) patch.categoria = String(patch.categoria).toLowerCase();
  const { data, error } = await supabase.from('wa_templates')
    .update(patch).eq('id', req.params.id).select().maybeSingle();
  if (error) return res.status(400).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Template não encontrado' });
  res.json(data);
});


router.get('/agendamentos', async (_req, res) => {
  const { data, error } = await supabase.from('wa_agendamentos')
    .select('*').order('created_at', { ascending: false }).limit(200);
  if (error) return res.status(400).json({ error: error.message });
  res.json(data || []);
});

function validarAgendamento(b) {
  if (!b.nome || !String(b.nome).trim()) return 'Nome obrigatório';
  if (!b.template_nome && !b.texto) return 'Informe o template ou o texto';
  if (!b.quando && !b.recorrencia) return 'Informe a data única ou a recorrência';
  if (b.recorrencia === 'semanal' && (b.dia_semana == null)) return 'Recorrência semanal exige o dia da semana';
  if (b.recorrencia === 'mensal' && (b.dia_mes == null)) return 'Recorrência mensal exige o dia do mês';
  const tel = b.audiencia?.telefones;
  if (b.audiencia?.tipo !== 'telefones' || !Array.isArray(tel) || tel.length === 0) {
    return 'Audiência (lista de telefones) obrigatória';
  }
  if (tel.length > 500) return 'Audiência acima de 500 telefones — divida o disparo';
  return null;
}

router.post('/agendamentos', authorizeModule('comunicacao', 3), async (req, res) => {
  const b = req.body || {};
  const erro = validarAgendamento(b);
  if (erro) return res.status(400).json({ error: erro });
  const { data, error } = await supabase.from('wa_agendamentos')
    .insert({
      nome: String(b.nome).trim(),
      template_nome: b.template_nome || null,
      texto: b.texto || null,
      params: Array.isArray(b.params) ? b.params : [],
      audiencia: b.audiencia,
      quando: b.quando || null,
      recorrencia: b.recorrencia || null,
      dia_semana: b.dia_semana ?? null,
      dia_mes: b.dia_mes ?? null,
      hora: b.hora || null,
      criado_por: req.user?.id || null,
    }).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

router.put('/agendamentos/:id', authorizeModule('comunicacao', 3), async (req, res) => {
  const b = req.body || {};
  const patch = {};
  ['nome', 'template_nome', 'texto', 'params', 'audiencia', 'quando', 'recorrencia', 'dia_semana', 'dia_mes', 'hora', 'ativo']
    .forEach(k => { if (k in b) patch[k] = b[k]; });

  const { data: atual, error: errAtual } = await supabase.from('wa_agendamentos')
    .select('*').eq('id', req.params.id).maybeSingle();
  if (errAtual) return res.status(400).json({ error: errAtual.message });
  if (!atual) return res.status(404).json({ error: 'Agendamento não encontrado' });




  const erro = validarAgendamento({ ...atual, ...patch });
  if (erro) return res.status(400).json({ error: erro });






  if ('quando' in patch && patch.quando) patch.ultimo_disparo = null;

  const { data, error } = await supabase.from('wa_agendamentos')
    .update(patch).eq('id', req.params.id).select().maybeSingle();
  if (error) return res.status(400).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Agendamento não encontrado' });
  res.json(data);
});

router.delete('/agendamentos/:id', authorizeModule('comunicacao', 4), async (req, res) => {
  const { error } = await supabase.from('wa_agendamentos').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});


router.get('/atendentes', async (_req, res) => {
  const { data, error } = await supabase.from('wa_atendentes')
    .select('*, profile:profile_id(id, name, email)').order('created_at');
  if (error) return res.status(400).json({ error: error.message });
  res.json(data || []);
});

router.post('/atendentes', authorizeModule('comunicacao', 3), async (req, res) => {
  const b = req.body || {};
  if (!b.profile_id) return res.status(400).json({ error: 'profile_id obrigatório' });
  const { data, error } = await supabase.from('wa_atendentes')
    .insert({
      profile_id: b.profile_id,
      areas: Array.isArray(b.areas) ? b.areas : [],
      horarios: Array.isArray(b.horarios) ? b.horarios : [],
    }).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

router.put('/atendentes/:id', authorizeModule('comunicacao', 3), async (req, res) => {
  const b = req.body || {};
  const patch = {};
  ['areas', 'horarios', 'ativo'].forEach(k => { if (k in b) patch[k] = b[k]; });
  const { data, error } = await supabase.from('wa_atendentes')
    .update(patch).eq('id', req.params.id).select().maybeSingle();
  if (error) return res.status(400).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Atendente não encontrado' });
  res.json(data);
});





router.get('/equipe', async (_req, res) => {
  const R = require('../utils/equipeAtendimento');
  const { lerEquipe } = require('../services/waEquipe');
  try {
    const [eq, areasR, colabR] = await Promise.all([
      lerEquipe(),
      supabase.from('areas').select('nome').neq('ativo', false).order('nome'),
      supabase.from('profiles').select('id, name, avatar_url, email, is_membro_only').eq('active', true).order('name'),
    ]);
    if (areasR.error) throw areasR.error;
    if (colabR.error) throw colabR.error;

    const ehAgente = p => /^\s*agente\s/i.test(p.name || '') || /^agente\.[^@]+@cbrio\.org$/i.test(p.email || '');
    const colaboradores = (colabR.data || [])
      .filter(p => p.name && !p.is_membro_only && !ehAgente(p))
      .map(p => ({ id: p.id, name: p.name, avatar_url: p.avatar_url || null }));
    const linhas = R.montarLinhas({ areas: (areasR.data || []).map(a => a.nome), equipe: eq.equipe });
    res.json({ migration_ok: !eq.migracaoAusente, linhas, colaboradores });
  } catch (e) {
    console.error('[comunicacao] equipe:', e.message);
    res.status(500).json({ error: 'Erro ao carregar a equipe de atendimento' });
  }
});

router.put('/equipe/:area', authorizeModule('comunicacao', 3), async (req, res) => {
  const R = require('../utils/equipeAtendimento');
  const v = R.validarEquipe({ area: req.params.area, titular_id: req.body?.titular_id, suplente_id: req.body?.suplente_id });
  if (!v.ok) return res.status(400).json({ error: v.erro });
  const linha = { ...v.valor, atualizado_em: new Date().toISOString(), atualizado_por: req.user?.userId || req.user?.id || null };
  let { data, error } = await supabase.from('wa_equipe_atendimento')
    .upsert(linha, { onConflict: 'area' }).select().maybeSingle();

  if (error && error.code === '23503' && linha.atualizado_por) {
    ({ data, error } = await supabase.from('wa_equipe_atendimento')
      .upsert({ ...linha, atualizado_por: null }, { onConflict: 'area' }).select().maybeSingle());
  }
  if (error) {
    if (error.code === '42P01' || /wa_equipe_atendimento/.test(error.message || '')) {
      return res.status(409).json({ error: 'A migration 20260908160000_wa_equipe_atendimento ainda não foi aplicada.' });
    }
    if (error.code === '23503') return res.status(400).json({ error: 'Titular ou suplente não é um usuário do sistema.' });
    if (error.code === '23514') return res.status(400).json({ error: 'Titular e suplente não podem ser a mesma pessoa.' });
    return res.status(400).json({ error: error.message });
  }
  res.json(data);
});





router.patch('/automaticas/:id', authorizeModule('comunicacao', 3), async (req, res) => {
  const { IDS_CATALOGO } = require('../services/comunicacaoAutomaticas');
  const id = String(req.params.id);
  if (!IDS_CATALOGO.includes(id)) return res.status(404).json({ error: 'Disparo desconhecido' });
  const ativo = req.body?.ativo !== false;
  const r = await require('../services/comunicacaoDisparosOff').setDisparo(id, ativo);
  if (!r.ok) {
    return res.status(409).json({
      error: /disparos_off/.test(r.erro || '')
        ? 'O interruptor precisa da migration 20260814150000 — aplique e tente de novo.'
        : r.erro,
    });
  }
  res.json({ ok: true, id, ativo, desligados: r.desligados });
});







router.get('/contatos', async (req, res) => {
  try {
    const { contemNormalizado } = require('../services/busca');
    const busca = String(req.query.busca || '').trim();
    const dig = (t) => String(t || '').replace(/\D+/g, '');


    const { data: lids, error: e1 } = await supabase.from('whatsapp_lideres')
      .select('id, telefone, nome_exibicao, papel, escopo, ativo, recebe_lembretes, origem, grupo_id')
      .is('deleted_at', null).limit(1000);
    if (e1) throw e1;



    const membros = [];
    const PAGE = 1000; const CAP = 5000;
    for (let from = 0; from < CAP; from += PAGE) {
      const { data, error } = await supabase.from('mem_membros')
        .select('id, nome, telefone, whatsapp_optin_em')
        .eq('whatsapp_optin', true).is('deleted_at', null)
        .not('telefone', 'is', null)
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      membros.push(...(data || []));
      if (!data || data.length < PAGE) break;
    }
    const truncado = membros.length >= CAP;


    const grupoIds = [...new Set((lids || []).map(l => l.grupo_id).filter(Boolean))];
    const grupoNome = new Map();
    for (let i = 0; i < grupoIds.length; i += 200) {
      const { data } = await supabase.from('mem_grupos').select('id, nome').in('id', grupoIds.slice(i, i + 200));
      (data || []).forEach(g => grupoNome.set(g.id, g.nome));
    }


    const consent = new Map();
    const ids = membros.map(m => m.id);
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await supabase.from('inscricao_consentimentos')
        .select('membro_id, porta, em')
        .eq('tipo', 'whatsapp').eq('aceito', true).is('deleted_at', null)
        .in('membro_id', ids.slice(i, i + 200))
        .order('em', { ascending: false });
      (data || []).forEach(c => { if (c.membro_id && !consent.has(c.membro_id)) consent.set(c.membro_id, c); });
    }


    const PORTA_LABEL = {
      batismo: 'inscrição de batismo', apresentacao: 'apresentação de crianças',
      grupos: 'inscrição em grupo', grupos_lider: 'inscrição de líder',
      next: 'inscrição no Next', voluntariado: 'ficha de voluntariado',
      evento_externo: 'inscrição em evento', inscricoes: 'inscrição em evento',
      censo: 'resposta do censo',
    };
    const porTel = new Map();
    for (const m of membros) {
      const tel = dig(m.telefone);
      if (!tel) continue;
      const c = consent.get(m.id);
      porTel.set(tel, {
        telefone: m.telefone, nome: m.nome, membro_id: m.id, papeis: ['optin'],
        origem: c ? `Opt-in na ${PORTA_LABEL[c.porta] || c.porta}` : 'Opt-in registrado no cadastro',
        desde: c?.em || m.whatsapp_optin_em || null,
      });
    }
    for (const l of lids || []) {
      const tel = dig(l.telefone);
      if (!tel) continue;
      const gNome = grupoNome.get(l.grupo_id);
      const origemLider = l.origem === 'auto'
        ? `Líder de grupo${gNome ? ` · ${gNome}` : ''} (aprova pedidos por WhatsApp)`
        : 'Vinculado manualmente ao bot';
      const ex = porTel.get(tel);
      if (ex) {
        ex.papeis.push('lider');
        ex.origem_lider = origemLider;
        ex.lider_id = l.id;
        ex.lider_ativo = l.ativo !== false;
        ex.recebe_lembretes = l.recebe_lembretes !== false;
      } else {
        porTel.set(tel, {
          telefone: l.telefone, nome: l.nome_exibicao || null, membro_id: null, papeis: ['lider'],
          origem: origemLider, desde: null,
          lider_id: l.id, lider_ativo: l.ativo !== false, recebe_lembretes: l.recebe_lembretes !== false,
        });
      }
    }

    let contatos = [...porTel.values()];
    if (busca) {
      contatos = contatos.filter(c =>
        contemNormalizado(c.nome || '', busca) || (dig(busca) && dig(c.telefone).includes(dig(busca))));
    }
    contatos.sort((a, b) => String(a.nome || '￿').localeCompare(String(b.nome || '￿'), 'pt-BR'));
    res.json({
      contatos,
      total: contatos.length,
      resumo: { optin: membros.length, lideres: (lids || []).length },
      truncado,
    });
  } catch (e) {
    console.error('[comunicacao] contatos:', e.message);
    res.status(500).json({ error: 'Erro ao listar os contatos' });
  }
});


router.get('/tarifas', async (_req, res) => {
  const { data, error } = await supabase.from('wa_tarifas').select('*').order('categoria');
  if (error) return res.status(400).json({ error: error.message });
  res.json(data || []);
});

router.put('/tarifas/:categoria', authorizeModule('comunicacao', 5), async (req, res) => {
  const tarifa = Number(req.body?.tarifa);
  if (!Number.isFinite(tarifa) || tarifa < 0) return res.status(400).json({ error: 'Tarifa inválida' });
  const { data, error } = await supabase.from('wa_tarifas')
    .upsert({ categoria: req.params.categoria, tarifa, atualizado_em: new Date().toISOString() })
    .select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});


router.get('/envios', async (req, res, next) => {
  try {
    const limite = Math.min(parseInt(req.query.limit, 10) || 100, 500);
    const offset = parseInt(req.query.offset, 10) || 0;
    let q = supabase.from('whatsapp_envios')
      .select('id, telefone, tipo, template, texto, contexto, status, tentativas, erro, erro_status, message_id, criado_em, enviado_em, delivered_at, read_at, failed_at', { count: 'exact' })
      .order('criado_em', { ascending: false })
      .range(offset, offset + limite - 1);


    if (req.query.status === 'falha_meta') q = q.not('failed_at', 'is', null);
    else if (req.query.status) q = q.eq('status', String(req.query.status));
    if (req.query.contexto) q = q.ilike('contexto', `${String(req.query.contexto)}%`);
    if (req.query.telefone) q = q.ilike('telefone', `%${String(req.query.telefone).replace(/\D/g, '')}%`);
    if (req.query.de) q = q.gte('criado_em', String(req.query.de));
    if (req.query.ate) q = q.lte('criado_em', String(req.query.ate) + 'T23:59:59');
    const { data, error, count } = await q;
    if (error) throw error;
    res.json({ envios: data || [], total: count || 0 });
  } catch (e) {
    console.error('[comunicacao] envios:', e.message);
    next(communicationError(e, 'Erro ao listar envios.'));
  }
});











router.get('/automaticas', async (req, res, next) => {
  try {
    const dias = Math.min(parseInt(req.query.dias, 10) || 30, 120);
    const querPessoas = req.query.pessoas === '1' || req.query.pessoas === 'true';
    const nivel = req.user?.granular?.modulePerms?.comunicacao?.leitura || 0;
    const comPessoas = querPessoas && nivel >= 2;
    const { listar } = require('../services/comunicacaoAutomaticas');
    const r = await listar({ comPessoas, dias });

    try {
      const desligados = await require('../services/comunicacaoDisparosOff').listarDesligados();
      r.itens = (r.itens || []).map((i) => ({ ...i, desligado: desligados.has(String(i.id)) }));
    } catch {                                     }


    res.json({ ...r, pessoas_ocultas: querPessoas && !comPessoas });
  } catch (e) {
    console.error('[comunicacao] automaticas', e.message);
    next(communicationError(e, 'Erro ao carregar os disparos automáticos.'));
  }
});









async function templateDoCatalogo(nome) {
  if (!nome) return null;
  const { data, error } = await supabase.from('wa_templates')
    .select('nome, idioma, categoria, status_meta, params_body, exemplo, componentes, ativo')
    .eq('nome', String(nome)).order('idioma').limit(1);
  if (error) throw error;
  return (data && data[0]) || null;
}


function corpoDoTemplate(t) {
  if (!t) return '';
  const comps = Array.isArray(t.componentes) ? t.componentes : [];
  const body = comps.find(c => c && String(c.type || '').toUpperCase() === 'BODY');
  return String((body && body.text) || t.exemplo || '');
}
async function tarifasPorCategoria() {
  const { data, error } = await supabase.from('wa_tarifas').select('categoria, tarifa');
  if (error) throw error;
  const m = {};
  for (const t of data || []) m[String(t.categoria || '').toLowerCase()] = Number(t.tarifa) || 0;
  return m;
}
async function montarPreviaEnvio(b) {
  const dest = NOVO.normalizarDestinatarios(b.destinatarios);
  const templateNome = String(b.template_nome || '').trim();
  const tipo = templateNome ? 'template' : 'texto';
  const tpl = tipo === 'template' ? await templateDoCatalogo(templateNome) : null;
  const params = (Array.isArray(b.params) ? b.params : []).map(p => String(p ?? ''));
  const corpo = tipo === 'template' ? corpoDoTemplate(tpl) : String(b.texto || '');
  const previa = NOVO.renderizarCorpo(corpo, params);
  const tarifas = await tarifasPorCategoria();
  const templateEncontrado = tipo !== 'template' || !!tpl;
  const custo = NOVO.custoEstimado({ quantidade: dest.validos.length, tipo, categoria: tpl ? tpl.categoria : null, tarifas });
  const avisos = NOVO.avisos({ quantidade: dest.validos.length, tipo, categoria: tpl ? tpl.categoria : null, statusMeta: tpl ? tpl.status_meta : null, templateEncontrado });
  return { dest, tipo, templateNome, tpl, templateEncontrado, params, corpo, previa, custo, avisos };
}

router.post('/envios/previa', async (req, res, next) => {
  try {
    const p = await montarPreviaEnvio(req.body || {});
    res.json({
      destinatarios: {
        validos: p.dest.validos.length,
        lista: p.dest.validos,
        invalidos: p.dest.invalidos.slice(0, 50),
        invalidos_total: p.dest.invalidos.length,
        duplicados: p.dest.duplicados,
      },
      tipo: p.tipo,
      template: p.tpl ? { nome: p.tpl.nome, categoria: p.tpl.categoria, status_meta: p.tpl.status_meta, params_body: p.tpl.params_body } : null,
      template_encontrado: p.templateEncontrado,
      params: NOVO.conferirParams(p.tpl ? p.tpl.params_body : null, p.params),
      previa: p.previa,
      custo: p.custo,
      avisos: p.avisos.map(codigo => ({ codigo, texto: NOVO.textoAviso(codigo) })),
    });
  } catch (e) {
    console.error('[comunicacao] envios/previa:', e.message);
    next(communicationError(e, 'Erro ao montar a prévia do envio.'));
  }
});

router.post('/envios/agora', authorizeModule('comunicacao', 3), async (req, res, next) => {
  try {
    const b = req.body || {};
    const agora = Date.now();
    const p = await montarPreviaEnvio(b);
    const v = NOVO.validarNovoEnvio({
      modo: 'agora', destinatarios: p.dest.validos, template_nome: p.templateNome, texto: b.texto, params: p.params,
      params_body: p.tpl ? p.tpl.params_body : null, templateEncontrado: p.templateEncontrado, agoraMs: agora,
    });
    if (!v.ok) return res.status(400).json({ error: v.erros.map(NOVO.textoErro).join(' · '), erros: v.erros });



    const confirmada = Number(b.confirmar_quantidade);
    if (confirmada !== p.dest.validos.length) {
      return res.status(409).json({
        error: `A quantidade confirmada (${Number.isFinite(confirmada) ? confirmada : '—'}) não bate com os ${p.dest.validos.length} telefones válidos. Releia a prévia e confirme de novo.`,
        codigo: 'contagem_divergente', validos: p.dest.validos.length,
      });
    }
    const nome = String(b.nome || '').trim() || NOVO.nomePadrao({ agoraMs: agora, tipo: p.tipo, template: p.templateNome });


    const { data: ag, error: errAg } = await supabase.from('wa_agendamentos').insert({
      nome,
      template_nome: p.tipo === 'template' ? p.templateNome : null,
      texto: p.tipo === 'texto' ? String(b.texto) : null,
      params: p.params,
      audiencia: { tipo: 'telefones', telefones: p.dest.validos },
      quando: new Date(agora).toISOString(),
      recorrencia: null,
      ativo: false,
      criado_por: req.user?.userId || req.user?.id || null,
    }).select('id').single();
    if (errAg) throw errAg;


    const itens = p.dest.validos.map(tel => ({
      telefone: tel,
      template: p.tipo === 'template' ? p.templateNome : undefined,
      texto: p.tipo === 'texto' ? String(b.texto) : undefined,
      params: p.params,
      contexto: 'comunicacao.envio_manual',
      refId: ag.id,
    }));
    const r = await enfileirarLote(itens);
    if (!r.queued) {


      await supabase.from('wa_agendamentos').delete().eq('id', ag.id);
      const motivo = r.motivo === 'disabled'
        ? 'O envio de WhatsApp está desligado neste ambiente (credenciais/WHATSAPP_ENABLED). Nada saiu.'
        : r.motivo === 'template_rejeitado_na_meta'
          ? 'A Meta rejeitou ou pausou este template — nada foi enfileirado.'
          : `Nada foi enfileirado (${r.motivo || 'motivo desconhecido'}).`;
      return res.status(409).json({ error: motivo, codigo: r.motivo || 'nada_enfileirado', bloqueados_template: r.bloqueados_template || 0 });
    }
    await supabase.from('wa_agendamentos').update({ ultimo_disparo: new Date().toISOString() }).eq('id', ag.id);
    res.status(201).json({ ok: true, agendamento_id: ag.id, na_fila: r.queued, total: p.dest.validos.length, bloqueados_template: r.bloqueados_template || 0 });
  } catch (e) {
    console.error('[comunicacao] envios/agora:', e.message);
    next(communicationError(e, 'Erro ao enviar agora.'));
  }
});

router.get('/envios/resumo', async (req, res, next) => {
  try {
    const dias = Math.min(parseInt(req.query.dias, 10) || 30, 120);
    const desde = new Date(Date.now() - dias * 86400000).toISOString();
    const conta = async (filtro) => {
      let q = supabase.from('whatsapp_envios').select('id', { count: 'exact', head: true }).gte('criado_em', desde);
      q = filtro(q);
      const { count, error } = await q;
      if (error) throw error;
      return count || 0;
    };
    const [total, enviados, pendentes, erros, entregues, lidos, falhosMeta] = await Promise.all([
      conta(q => q),
      conta(q => q.eq('status', 'enviado')),
      conta(q => q.eq('status', 'pendente')),
      conta(q => q.eq('status', 'erro')),
      conta(q => q.not('delivered_at', 'is', null)),
      conta(q => q.not('read_at', 'is', null)),
      conta(q => q.not('failed_at', 'is', null)),
    ]);


    let orfaos = 0;
    try {
      const { count, error: errOrf } = await supabase.from('whatsapp_status_orfaos')
        .select('id', { count: 'exact', head: true }).gte('criado_em', desde);
      if (errOrf) console.warn('[comunicacao] resumo orfaos:', errOrf.message);
      orfaos = count || 0;
    } catch {                          }


    let respostas = 0;
    try {
      const { count: cIn } = await supabase.from('wa_mensagens')
        .select('id', { count: 'exact', head: true })
        .eq('direcao', 'in').gte('criado_em', desde);
      respostas = cIn || 0;
    } catch {                   }
    res.json({ dias, total, enviados, pendentes, erros, entregues, lidos, falhos_meta: falhosMeta, orfaos, respostas });
  } catch (e) {
    console.error('[comunicacao] resumo:', e.message);
    next(communicationError(e, 'Erro no resumo de envios.'));
  }
});








router.get('/custo', async (req, res, next) => {
  try {
    const meses = Math.min(parseInt(req.query.meses, 10) || 6, 12);
    const desde = new Date(); desde.setMonth(desde.getMonth() - (meses - 1)); desde.setDate(1);
    const desdeISO = desde.toISOString().slice(0, 10);


    const envios = await (async () => {
      const out = []; let from = 0; const page = 1000;
      while (true) {



        const { data, error } = await supabase.from('whatsapp_envios')
          .select('tipo, template, contexto, criado_em')
          .eq('status', 'enviado').gte('criado_em', desdeISO)
          .order('criado_em', { ascending: true }).order('id', { ascending: true })
          .range(from, from + page - 1);
        if (error) throw error;
        out.push(...(data || []));
        if (!data || data.length < page) break;
        from += page;
      }
      return out;
    })();


    const { data: tpls, error: tplsError } = await supabase.from('wa_templates').select('nome, categoria');
    if (tplsError) throw tplsError;
    const catDoTemplate = new Map((tpls || []).map(t => [t.nome, t.categoria || null]));
    const { data: tarifas, error: tarifasError } = await supabase.from('wa_tarifas').select('categoria, tarifa');
    if (tarifasError) throw tarifasError;
    const tarifaDaCat = new Map((tarifas || []).map(t => [t.categoria, Number(t.tarifa) || 0]));

    const porMes = {}, porModulo = {}, porCategoria = {};
    let total = 0, naoClassificados = 0;
    for (const e of envios) {
      const mes = String(e.criado_em).slice(0, 7);
      const modulo = String(e.contexto || 'sem_contexto').split('.')[0] || 'sem_contexto';

      let cat, custo;
      if (e.tipo === 'texto') { cat = 'service'; custo = tarifaDaCat.get('service') || 0; }
      else {
        cat = catDoTemplate.get(e.template) || null;
        if (!cat) { cat = 'nao_classificado'; naoClassificados += 1; custo = 0; }
        else custo = tarifaDaCat.get(cat) || 0;
      }
      total += custo;
      porMes[mes] = (porMes[mes] || 0) + custo;
      porModulo[modulo] = (porModulo[modulo] || 0) + custo;
      if (!porCategoria[cat]) porCategoria[cat] = { envios: 0, custo: 0 };
      porCategoria[cat].envios += 1; porCategoria[cat].custo += custo;
    }

    const ord = (obj) => Object.entries(obj).map(([k, v]) => ({ chave: k, valor: v })).sort((a, b) => b.valor - a.valor);
    res.json({
      meses,
      total: Math.round(total * 100) / 100,
      envios_considerados: envios.length,
      nao_classificados: naoClassificados,
      por_mes: Object.entries(porMes).map(([mes, custo]) => ({ mes, custo: Math.round(custo * 100) / 100 })).sort((a, b) => a.mes.localeCompare(b.mes)),
      por_modulo: ord(porModulo).map(x => ({ modulo: x.chave, custo: Math.round(x.valor * 100) / 100 })),
      por_categoria: Object.entries(porCategoria).map(([categoria, v]) => ({ categoria, envios: v.envios, custo: Math.round(v.custo * 100) / 100 })).sort((a, b) => b.custo - a.custo),
    });
  } catch (e) {
    console.error('[comunicacao] custo:', e.message);
    next(communicationError(e, 'Erro ao calcular o custo.'));
  }
});














router.get('/dashboard', async (req, res, next) => {
  try {
    const agora = Date.now();
    const j = resolverJanelaPeriodo({ dias: req.query.dias, ano: req.query.ano, diasValidos: [7, 30, 90, 365], diasPadrao: 30, agora });
    const hoje = diaBrt(new Date(agora));
    let inicio, fim;
    if (j.ano) { inicio = j.inicio; fim = j.fim < hoje ? j.fim : hoje; }
    else { fim = hoje; inicio = diaBrt(new Date(agora - (j.dias - 1) * 86400000)); }
    const gran = DASH.granularidade({ dias: j.ano ? null : j.dias, ano: j.ano });
    const { de, ate } = DASH.limitesUtc(inicio, fim);
    const ateMs = new Date(ate).getTime();

    const ateComRabo = new Date(ateMs + 7 * 86400000).toISOString();

    const avisos = [];
    const bloco = async (nome, fn, vazio) => {
      try { return await fn(); }
      catch (e) { console.warn(`[comunicacao] dashboard ${nome}:`, e.message); avisos.push(nome); return vazio; }
    };



    const lerTudo = async (build, { page = 1000, max = 20000 } = {}) => {
      const out = [];
      for (let from = 0; from < max; from += page) {
        const { data, error } = await build().range(from, from + page - 1);
        if (error) throw error;
        out.push(...(data || []));
        if (!data || data.length < page) return { rows: out, truncado: false };
      }
      return { rows: out, truncado: true };
    };


    const conversas = await bloco('conversas', async () => {
      const r = await lerTudo(() => supabase.from('wa_conversas')
        .select('id, nome, telefone, area, resolvida, atribuido_a, last_inbound_at, last_message_at, created_at, deleted_at')
        .is('deleted_at', null).order('id'));
      if (r.truncado) avisos.push('conversas_truncado');
      return r.rows;
    }, null);

    const mensagens = await bloco('mensagens', async () => {
      const r = await lerTudo(() => supabase.from('wa_mensagens')
        .select('id, conversa_id, direcao, tipo, autor_id, criado_em')
        .gte('criado_em', de).lt('criado_em', ateComRabo)
        .order('criado_em').order('id'));
      if (r.truncado) avisos.push('mensagens_truncado');
      return r.rows;
    }, null);

    const disparos = await bloco('disparos', async () => {
      const r = await lerTudo(() => supabase.from('whatsapp_envios')
        .select('id, telefone, contexto, criado_em, enviado_em, tipo')
        .eq('status', 'enviado').gte('criado_em', de).lt('criado_em', ate)
        .order('criado_em').order('id'));
      if (r.truncado) avisos.push('disparos_truncado');
      return r.rows;
    }, null);

    const fila = await bloco('fila', async () => {
      const conta = async (f) => {
        let q = supabase.from('whatsapp_envios').select('id', { count: 'exact', head: true }).gte('criado_em', de).lt('criado_em', ate);
        q = f(q);
        const { count, error } = await q;
        if (error) throw error;
        return count || 0;
      };
      const [total, enviados, pendentes, erros, entregues, lidos, falhos_meta] = await Promise.all([
        conta(q => q), conta(q => q.eq('status', 'enviado')), conta(q => q.eq('status', 'pendente')), conta(q => q.eq('status', 'erro')),
        conta(q => q.not('delivered_at', 'is', null)), conta(q => q.not('read_at', 'is', null)), conta(q => q.not('failed_at', 'is', null)),
      ]);
      return { total, enviados, pendentes, erros, entregues, lidos, falhos_meta };
    }, null);


    const msgsJanela = (mensagens || []).filter(m => { const t = new Date(m.criado_em).getTime(); return Number.isFinite(t) && t < ateMs; });
    const temMsgs = mensagens !== null;
    const temConvs = conversas !== null;

    const serie = temMsgs ? DASH.montarSerie(msgsJanela, { inicio, fim, gran }) : null;
    const porArea = (temMsgs && temConvs) ? DASH.agruparPorArea(msgsJanela, conversas) : null;
    const resumoConv = temConvs ? DASH.resumoConversas(conversas, { agoraMs: agora, inicio, fim, top: 30 }) : null;
    const amostras = (temMsgs && temConvs) ? DASH.temposDeResposta(msgsJanela, conversas) : [];
    const porAtendente = DASH.agregarTempos(amostras, 'autor_id');

    const nomes = await bloco('atendentes', async () => {
      const ids = porAtendente.map(a => a.autor_id);
      const out = new Map();
      for (let i = 0; i < ids.length; i += 200) {
        const { data, error } = await supabase.from('profiles').select('id, name').in('id', ids.slice(i, i + 200));
        if (error) throw error;
        for (const p of data || []) out.set(p.id, p.name);
      }
      return out;
    }, new Map());

    let engajamento = null;
    if (temMsgs && temConvs && disparos !== null) {
      const telDaConv = new Map(conversas.map(c => [c.id, c.telefone]));
      const inbounds = mensagens.filter(m => m.direcao === 'in').map(m => ({ telefone: telDaConv.get(m.conversa_id), criado_em: m.criado_em }));
      engajamento = DASH.engajamentoDisparos(disparos, inbounds, { janelaDias: 7 });
    }

    res.json({
      janela: { inicio, fim, dias: j.ano ? null : j.dias, ano: j.ano || null, rotulo: rotuloJanela(j), gran, limite_sem_resposta_h: DASH.LIMITE_SEM_RESPOSTA_H },
      agora: new Date(agora).toISOString(),
      conversas: resumoConv,
      por_area: porArea,
      serie,
      tempo_resposta: {
        n: amostras.length,
        por_atendente: porAtendente.map(a => ({ ...a, nome: nomes.get(a.autor_id) || null })),
        por_area: DASH.agregarTempos(amostras, 'area'),
      },
      engajamento,
      fila,
      avisos,
    });
  } catch (e) {
    console.error('[comunicacao] dashboard:', e.message);
    next(communicationError(e, 'Erro ao montar o dashboard.'));
  }
});


router.get('/erros', async (_req, res, next) => {
  try {
    const [filaResult, metaResult, orfaosResult] = await Promise.all([
      supabase.from('whatsapp_envios')
        .select('id, telefone, tipo, template, contexto, erro, tentativas, criado_em')
        .eq('status', 'erro').order('criado_em', { ascending: false }).limit(100),
      supabase.from('whatsapp_envios')
        .select('id, telefone, tipo, template, contexto, erro_status, failed_at')
        .not('failed_at', 'is', null).order('failed_at', { ascending: false }).limit(100),
      supabase.from('whatsapp_status_orfaos').select('id', { count: 'exact', head: true }),
    ]);
    const sourceError = filaResult.error || metaResult.error || orfaosResult.error;
    if (sourceError) throw sourceError;
    const fila = filaResult.data;
    const falhosMeta = metaResult.data;
    const orfaos = orfaosResult.count;
    res.json({ falhas_fila: fila || [], falhas_meta: falhosMeta || [], orfaos: orfaos || 0 });

  } catch (e) {
    console.error('[comunicacao] erros:', e.message);
    next(communicationError(e, 'Erro ao listar falhas.'));
  }
});






const MODOS_BOT = ['ninguem', 'menu', 'ia'];
const MIGRATION_BOT_IA = 'A migration 20260908120000 ainda não foi aplicada — aplique e tente de novo.';

router.get('/bot-ia/config', async (_req, res, next) => {
  try {
    const botIa = require('../services/botIaResposta');
    const R = require('../utils/botIaRegras');
    const { data: cfg, error } = await supabase.from('whatsapp_config')
      .select('ia_ativa, respostas_automaticas').eq('id', 1).maybeSingle();
    if (error) throw error;
    const c = await botIa.lerConfig();
    res.json({
      modo: R.modoResposta({ cfg, erroCfg: null, botIa: c.botIa }),
      ia_ativa: cfg?.ia_ativa !== false,
      menu_ligado: cfg?.respostas_automaticas !== false,
      bot_ia: c.botIa,
      migration_ok: !c.migracaoAusente,
      modelo: botIa.MODEL,
      limites_padrao: R.LIMITES_PADRAO,
      anthropic_configurada: !!process.env.ANTHROPIC_API_KEY,
    });
  } catch (e) {
    console.error('[comunicacao] bot-ia config:', e.message);
    next(communicationError(e, 'Erro ao ler a configuração do bot.'));
  }
});

router.put('/bot-ia/config', authorizeModule('comunicacao', 3), async (req, res, next) => {
  try {
    const b = req.body || {};
    const botIa = require('../services/botIaResposta');
    const R = require('../utils/botIaRegras');
    const atual = await botIa.lerConfig();
    if (atual.migracaoAusente) return res.status(409).json({ error: MIGRATION_BOT_IA });


    if (atual.erro) return res.status(503).json({ error: 'Não foi possível ler a configuração atual do bot — tente de novo.' });
    const patch = { updated_at: new Date().toISOString() };
    const novo = { ...atual.botIa };
    if ('modo' in b) {
      if (!MODOS_BOT.includes(b.modo)) return res.status(400).json({ error: 'Modo inválido.' });



      patch.respostas_automaticas = b.modo === 'menu';
      novo.ativo = b.modo === 'ia';
    }
    if ('contato_humano' in b) novo.contato_humano = String(b.contato_humano || '').trim().slice(0, 60);
    for (const k of ['limite_dia', 'limite_conversa_dia', 'horas_silencio_apos_humano']) if (k in b) novo[k] = Number(b[k]);
    if ('instrucoes' in b) novo.instrucoes = String(b.instrucoes || '').slice(0, 2000);


    let emailsDescartados = 0;
    if ('varredura_emails' in b) {
      const brutos = Array.isArray(b.varredura_emails)
        ? b.varredura_emails
        : String(b.varredura_emails || '').split(/[,;\s]+/);
      const informados = brutos.filter((x) => typeof x === 'string' && x.trim()).length;
      novo.varredura_emails = R.listaEmails(brutos);
      emailsDescartados = Math.max(0, informados - novo.varredura_emails.length);
    }
    const n = R.lerConfigBotIa(novo);



    patch.bot_ia = R.mesclarConfigBotIa(atual.bruto, n);
    const { error } = await supabase.from('whatsapp_config').update(patch).eq('id', 1);
    if (error) throw error;
    const { data: cfg } = await supabase.from('whatsapp_config').select('ia_ativa, respostas_automaticas').eq('id', 1).maybeSingle();
    res.json({
      ok: true, bot_ia: n, modo: R.modoResposta({ cfg, erroCfg: null, botIa: n }),
      varredura_emails_descartados: emailsDescartados,
    });
  } catch (e) {
    console.error('[comunicacao] bot-ia config put:', e.message);
    next(communicationError(e, 'Erro ao salvar a configuração do bot.'));
  }
});

router.get('/bot-ia/areas', async (_req, res, next) => {
  try {
    const botIa = require('../services/botIaResposta');
    const a = await botIa.lerAreas();
    const { data: cat } = await supabase.from('areas').select('nome').neq('ativo', false).order('nome');
    res.json({ areas: a.areas, catalogo: (cat || []).map(x => x.nome).filter(Boolean), migration_ok: !a.migracaoAusente, erro: a.erro || null });
  } catch (e) {
    console.error('[comunicacao] bot-ia areas:', e.message);
    next(communicationError(e, 'Erro ao listar as áreas do bot.'));
  }
});

router.put('/bot-ia/areas/:area', authorizeModule('comunicacao', 3), async (req, res, next) => {
  try {
    const area = String(req.params.area || '').trim().slice(0, 80);
    if (!area) return res.status(400).json({ error: 'Informe a área.' });
    const b = req.body || {};
    const row = { area, atualizado_em: new Date().toISOString(), atualizado_por: req.user?.userId || req.user?.id || null };
    if ('ativo' in b) row.ativo = b.ativo === true;
    if ('descricao' in b) row.descricao = String(b.descricao || '').trim().slice(0, 300) || null;
    if ('conhecimento' in b) row.conhecimento = String(b.conhecimento || '').trim().slice(0, 6000) || null;
    if ('encaminhar_para' in b) row.encaminhar_para = String(b.encaminhar_para || '').trim().slice(0, 300) || null;
    if (Array.isArray(b.links)) {

      row.links = b.links
        .map(l => ({ rotulo: String(l?.rotulo || '').trim().slice(0, 80), url: String(l?.url || '').trim().slice(0, 500) }))
        .filter(l => /^https?:\/\//i.test(l.url)).slice(0, 20);
    }
    let r = await supabase.from('wa_bot_areas').upsert(row, { onConflict: 'area' }).select().single();
    if (r.error && r.error.code === '23503') {

      r = await supabase.from('wa_bot_areas').upsert({ ...row, atualizado_por: null }, { onConflict: 'area' }).select().single();
    }
    if (r.error) {
      if (r.error.code === '42P01') return res.status(409).json({ error: MIGRATION_BOT_IA });
      throw r.error;
    }
    res.json(require('../utils/botIaRegras').lerArea(r.data));
  } catch (e) {
    console.error('[comunicacao] bot-ia area put:', e.message);
    next(communicationError(e, 'Erro ao salvar a área do bot.'));
  }
});

router.post('/bot-ia/simular', authorizeModule('comunicacao', 3), async (req, res, next) => {
  try {
    const texto = String(req.body?.texto || '').trim();
    if (!texto) return res.status(400).json({ error: 'Escreva a mensagem a simular.' });
    const r = await require('../services/botIaResposta').simular({
      texto: texto.slice(0, 1500),
      conversaId: req.body?.conversa_id || null,
      telefone: req.body?.telefone || null,
    });
    res.json(r);
  } catch (e) {
    console.error('[comunicacao] bot-ia simular:', e.message);
    next(communicationError(e, 'Erro ao simular o bot.'));
  }
});

router.get('/bot-ia/resumo', async (req, res, next) => {
  try {
    const dias = Math.min(parseInt(req.query.dias, 10) || 7, 90);
    const desde = new Date(Date.now() - dias * 86400000).toISOString();
    const rows = [];
    for (let from = 0; from < 5000; from += 1000) {
      const { data, error } = await supabase.from('whatsapp_coletas')
        .select('id, parsed, erro, created_at').eq('modulo_destino', 'bot_ia').is('deleted_at', null)
        .gte('created_at', desde).order('created_at', { ascending: true }).order('id', { ascending: true })
        .range(from, from + 999);
      if (error) throw error;
      rows.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    const porAcao = {}; const porArea = {}; const porMotivo = {}; let tokens = 0;



    let ultimoErroModelo = null; let ultimoErroEm = null;
    const { sanitizarErro } = require('../utils/botIaVarredura');
    for (const r of rows) {
      const b = r.parsed?.bot_ia || {};
      const acao = b.acao || String(r.erro || '').replace(/^bot_ia:/, '') || 'desconhecido';
      if (acao === 'erro' || r.erro === 'bot_ia:erro') {
        ultimoErroModelo = sanitizarErro(b.motivo || r.erro || '');
        ultimoErroEm = r.created_at;
      } else if (acao === 'responder' || acao === 'encaminhar' || b.modelo) {
        ultimoErroModelo = null; ultimoErroEm = null;
      }
      porAcao[acao] = (porAcao[acao] || 0) + 1;
      const area = b.area || '(sem área)';
      porArea[area] = porArea[area] || { total: 0, responder: 0, encaminhar: 0, silencio: 0 };
      porArea[area].total += 1;
      if (Object.prototype.hasOwnProperty.call(porArea[area], acao)) porArea[area][acao] += 1;
      if (b.motivo) porMotivo[b.motivo] = (porMotivo[b.motivo] || 0) + 1;
      tokens += (b.uso?.input || 0) + (b.uso?.output || 0);
    }
    res.json({
      dias, total: rows.length, por_acao: porAcao,
      por_area: Object.entries(porArea).map(([area, v]) => ({ area, ...v })).sort((a, b) => b.total - a.total),
      por_motivo: Object.entries(porMotivo).map(([motivo, n]) => ({ motivo, n })).sort((a, b) => b.n - a.n).slice(0, 12),
      tokens, truncado: rows.length >= 5000,
      ultimo_erro_modelo: ultimoErroModelo, ultimo_erro_em: ultimoErroEm,
    });
  } catch (e) {
    console.error('[comunicacao] bot-ia resumo:', e.message);
    next(communicationError(e, 'Erro ao resumir o bot.'));
  }
});





const RE_PERIODO_ROTA = /^\d{4}-(0[1-9]|1[0-2])$/;

router.get('/bot-ia/varreduras', async (req, res, next) => {
  try {
    const r = await require('../services/botIaVarredura').listar({ limite: req.query.limite });
    res.json({ varreduras: r.varreduras, migration_ok: !r.migracaoAusente });
  } catch (e) {
    console.error('[comunicacao] bot-ia varreduras:', e.message);
    next(communicationError(e, 'Erro ao listar as varreduras.'));
  }
});



router.get('/bot-ia/varreduras/:periodo/exemplos', authorizeModule('comunicacao', 3), async (req, res, next) => {
  try {
    const periodo = String(req.params.periodo || '');
    if (!RE_PERIODO_ROTA.test(periodo)) return res.status(400).json({ error: 'Período inválido (use AAAA-MM).' });
    const r = await require('../services/botIaVarredura').exemplos(periodo);
    if (r.migracaoAusente) return res.status(409).json({ error: 'A migration 20260926130000 ainda não foi aplicada.' });
    if (r.naoEncontrada) return res.status(404).json({ error: 'Não há varredura deste mês.' });
    res.json(r);
  } catch (e) {
    console.error('[comunicacao] bot-ia varredura exemplos:', e.message);
    next(communicationError(e, 'Erro ao buscar os exemplos.'));
  }
});






router.post('/bot-ia/varreduras/rodar', authorizeModule('comunicacao', 3), async (req, res, next) => {
  try {
    const V = require('../utils/botIaVarredura');
    const bruto = req.body?.periodo;
    if (bruto != null && bruto !== '' && !RE_PERIODO_ROTA.test(String(bruto))) {
      return res.status(400).json({ error: 'Período inválido (use AAAA-MM).' });
    }
    const periodo = bruto ? String(bruto) : V.periodoAnterior(Date.now());
    const r = await require('../services/botIaVarredura').rodar({
      periodo, forcado: true, criadoPor: req.user?.userId || req.user?.id || null,
    });
    if (r.pulou === 'migration_ausente') return res.status(409).json({ error: 'A migration 20260926130000 ainda não foi aplicada.', ...r });
    res.json({ periodo, ...r });
  } catch (e) {
    console.error('[comunicacao] bot-ia varredura rodar:', e.message);
    next(communicationError(e, 'Erro ao rodar a varredura.'));
  }
});



router.post('/erros/:id/reenviar', authorizeModule('comunicacao', 3), async (req, res, next) => {
  try {
    const patch = {
      status: 'pendente',
      tentativas: 0,
      erro: null,
      proxima_tentativa_em: new Date().toISOString(),
    };
    if (req.body?.telefone) patch.telefone = String(req.body.telefone).replace(/\D/g, '');
    const { data, error } = await supabase.from('whatsapp_envios')
      .update(patch).eq('id', req.params.id).eq('status', 'erro').select('id').maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Envio não encontrado (ou não está em erro)' });
    res.json({ ok: true });
  } catch (e) {
    next(communicationError(e, 'Erro ao reenviar.'));
  }
});

module.exports = router;
