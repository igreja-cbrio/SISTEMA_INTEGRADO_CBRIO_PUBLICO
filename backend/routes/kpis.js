const express = require('express');
const multer = require('multer');
const router = express.Router();

const { authenticate, authorize, authorizeModule, getEffectiveLevel } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { notificar } = require('../services/notificar');
const { coletarTodos } = require('../services/kpiAutoCollector');
const { tipoVigenteEm } = require('../utils/lentesDomingo');
const { acharOuCriarGuardado } = require('../services/membroMatch');
const { reconciliarCpfTardio, propagarCpfConvertido } = require('../services/cpfReconciliar');
const { cpfValido } = require('../utils/cpf');

const { idadeEmAnos, hojeBRT } = require('../utils/inscricaoMenor');


const { divisorDomingos } = require('../utils/divisorMandala');
const painelCache = require('../services/painelCache');
const { isAuthorizedCron } = require('../utils/cronAuth');


const uploadFotoRef = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpe?g|png|webp)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Formato inválido (use JPG, PNG ou WebP)'));
  },
});


























const CAMINHOS_DE_CRON = new Set(['/cultos/auto-create']);
router.use((req, res, next) => (
  CAMINHOS_DE_CRON.has(req.path) && isAuthorizedCron(req)
    ? next()
    : authenticate(req, res, next)
));





function authorizeIntegracao(req, res, next) {
  const u = req.user || {};
  if (['admin', 'diretor'].includes(u.role)) return next();
  const areas = (u.kpi_areas || []).map(a => String(a).toLowerCase());
  if (areas.includes('integracao')) return next();



  if ((getEffectiveLevel(req, 'integracao') || 0) >= 2) return next();
  return res.status(403).json({
    error: 'Sem permissão · necessário ser admin, diretor ou líder de Integração',
  });
}






function authorizeBatismo(req, res, next) {
  const u = req.user || {};
  if (['admin', 'diretor'].includes(u.role)) return next();
  const areas = (u.kpi_areas || []).map(a => String(a).toLowerCase());
  if (areas.includes('integracao')) return next();
  if ((getEffectiveLevel(req, 'integracao') || 0) >= 2) return next();
  if ((getEffectiveLevel(req, 'batismo') || 0) >= 2) return next();


  if ((getEffectiveLevel(req, 'totem-membro') || 0) >= 2) return next();
  return res.status(403).json({
    error: 'Sem permissão · necessário acesso a Batismo ou Integração',
  });
}



















const _gateIntegracaoLeitura = authorizeModule('integracao', 1);
const _gateIntegracaoNominal = authorizeModule('integracao', 2);
const _gateBatismoLeitura = authorizeModule('batismo-leitura', 1);


function _porAreaKpi(req, slug) {
  const u = req.user || {};
  if ((u.granular?.modulosBloqueados || []).includes(slug)) return false;
  return (u.kpi_areas || []).map(a => String(a).toLowerCase()).includes(slug);
}


function authorizeIntegracaoLeitura(req, res, next) {
  if (_porAreaKpi(req, 'integracao')) return next();
  return _gateIntegracaoLeitura(req, res, next);
}



function authorizeIntegracaoNominal(req, res, next) {
  if (_porAreaKpi(req, 'integracao')) return next();
  return _gateIntegracaoNominal(req, res, next);
}




function authorizeBatismoLeitura(req, res, next) {
  if (_porAreaKpi(req, 'integracao')) return next();
  return _gateBatismoLeitura(req, res, next);
}


function nonNeg(v, fallback = 0) {
  const n = Number(v);
  if (Number.isNaN(n) || n < 0) return fallback;
  return n;
}


function hojeSP() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}


router.get('/service-types', async (req, res) => {
  const { data, error } = await supabase
    .from('vol_service_types')
    .select('id, name, color, recurrence_day, recurrence_time, has_online_stream')
    .eq('is_active', true)
    .order('recurrence_day')
    .order('recurrence_time');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});


router.get('/cultos', async (req, res) => {
  const { limit = 100, offset = 0, service_type_id, data_inicio, data_fim } = req.query;
  let query = supabase
    .from('vw_culto_stats')
    .select('*')
    .order('data', { ascending: false })
    .order('hora', { ascending: false })
    .range(Number(offset), Number(offset) + Number(limit) - 1);
  if (service_type_id) query = query.eq('service_type_id', service_type_id);
  if (data_inicio)     query = query.gte('data', data_inicio);
  if (data_fim)        query = query.lte('data', data_fim);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post('/cultos', authorizeIntegracao, async (req, res) => {
  const {
    service_type_id, nome, data, hora,
    presencial_adulto, presencial_kids,
    decisoes_presenciais, decisoes_online, decisoes_kids,
    youtube_video_id, online_pico, observacoes,
  } = req.body;
  if (!data || !hora || !nome) return res.status(400).json({ error: 'data, hora e nome são obrigatórios' });

  const { data: culto, error } = await supabase
    .from('cultos')
    .insert({
      service_type_id, nome, data, hora,
      presencial_adulto:    nonNeg(presencial_adulto),
      presencial_kids:      nonNeg(presencial_kids),
      decisoes_presenciais: nonNeg(decisoes_presenciais),
      decisoes_online:      nonNeg(decisoes_online),
      decisoes_kids:        nonNeg(decisoes_kids),
      youtube_video_id: youtube_video_id || null,
      online_pico: online_pico ? nonNeg(online_pico, null) : null,
      observacoes: observacoes ? String(observacoes).trim() : null,
      inserido_por: req.user.userId || req.user.id,
    })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(culto);
});

router.put('/cultos/:id', authorizeIntegracao, async (req, res) => {
  const allowed = [
    'presencial_adulto', 'presencial_kids',
    'decisoes_presenciais', 'decisoes_online', 'decisoes_kids',



    'decisoes_online_extra',
    'youtube_video_id', 'online_pico', 'nome',
    'online_ds', 'online_ddus',
    'voluntarios_escalados', 'voluntarios_checkin',
    'observacoes',

    'frequencia_lancada', 'decisoes_lancadas',
  ];
  const camposNumericos = [
    'presencial_adulto', 'presencial_kids',
    'decisoes_presenciais', 'decisoes_online', 'decisoes_kids',
    'decisoes_online_extra',
    'online_pico', 'online_ds', 'online_ddus',
    'voluntarios_escalados', 'voluntarios_checkin',
  ];
  const update = { updated_at: new Date().toISOString() };
  for (const [k, v] of Object.entries(req.body)) {
    if (!allowed.includes(k)) continue;
    if (v === '' || v === null || v === undefined) { update[k] = null; continue; }
    if (camposNumericos.includes(k)) {
      const n = Number(v);
      if (Number.isNaN(n) || n < 0) {
        return res.status(400).json({ error: `Campo ${k} deve ser número >= 0 (recebido: ${v})` });
      }
      update[k] = n;
    } else {
      update[k] = v;
    }
  }
  const { data, error } = await supabase
    .from('cultos').update(update).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });




  painelCache.bust('');

  res.json(data);
});

router.delete('/cultos/:id', authorize('admin', 'diretor'), async (req, res) => {
  const { error } = await supabase.from('cultos').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});



router.get('/cultos/:id/voluntarios', async (req, res) => {
  const { data, error } = await supabase
    .from('vw_culto_voluntarios')
    .select('escalados_manual, checkin_manual, escalados_auto, checkin_auto, escalados, checkin')
    .eq('culto_id', req.params.id)
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || { escalados_auto: 0, checkin_auto: 0, escalados_manual: null, checkin_manual: null });
});





router.get('/cultos/:id/decisoes-pessoas', authorizeIntegracaoLeitura, async (req, res) => {
  const { data, error } = await supabase
    .from('cultos_decisoes_pessoas')
    .select('id, culto_id, membro_id, nome, telefone, email, idade, data_nascimento, cpf, tipo_decisao, observacoes, status_followup, registrado_em, registrado_por, responsavel_nome, responsavel_telefone, responsavel_cpf')
    .eq('culto_id', req.params.id)
    .order('registrado_em', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});






router.get('/decisoes-pessoas/historico-importado', authorizeIntegracaoLeitura, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 500, 2000);
    const desdeDias = Number(req.query.dias) || 365;
    const desde = new Date();
    desde.setDate(desde.getDate() - desdeDias);


    const { data: trilhas, error } = await supabase
      .from('mem_trilha_valores')
      .select('membro_id, data_conclusao, observacoes, mem_membros(id, nome, telefone, cpf, data_nascimento, status, observacoes)')
      .eq('etapa', 'conversao')
      .eq('concluida', true)
      .ilike('observacoes', '%importacao%')
      .gte('data_conclusao', desde.toISOString().slice(0, 10))
      .order('data_conclusao', { ascending: false })
      .limit(limit);

    if (error) throw error;

    const items = (trilhas || [])
      .filter(t => t.mem_membros)
      .map(t => ({
        id: t.membro_id,
        membro_id: t.membro_id,
        nome: t.mem_membros.nome,
        telefone: t.mem_membros.telefone,
        cpf: t.mem_membros.cpf,
        data_nascimento: t.mem_membros.data_nascimento,
        data_conversao: t.data_conclusao,
        status_membro: t.mem_membros.status,
        origem: 'importacao_planilha',
        observacoes_membro: t.mem_membros.observacoes,
      }));

    res.json({ total: items.length, items });
  } catch (e) {
    console.error('[kpis/decisoes-pessoas/historico-importado]', e.message);
    res.status(500).json({ error: e.message });
  }
});





router.get('/decisoes-pessoas/incompletos', authorizeIntegracaoLeitura, async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 200, 1000);
  const { data, error } = await supabase
    .from('cultos_decisoes_pessoas')
    .select(`
      id, culto_id, membro_id, nome, telefone, email, idade, data_nascimento, cpf,
      tipo_decisao, status_followup, registrado_em,
      culto:culto_id(id, data, service_type_id, service_type_name)
    `)
    .or('cpf.is.null,data_nascimento.is.null')
    .order('registrado_em', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('[kpis/decisoes-pessoas/incompletos]', error.message);
    return res.status(500).json({ error: error.message });
  }
  const items = (data || []).map(p => ({
    ...p,
    falta_cpf:   !p.cpf,
    falta_nasc:  !p.data_nascimento,
  }));
  res.json({
    total: items.length,
    items,
  });
});




router.get('/decisoes-pessoas/buscar-membro', authorizeIntegracaoNominal, async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json([]);

  const cpfLimpo = q.replace(/\D/g, '');


  const isCpf = cpfLimpo.length === 11 && /^\d+$/.test(cpfLimpo);
  const escaped = q.replace(/[%_,()]/g, '\\$&');


  let memQuery = supabase
    .from('mem_membros')

    .select('id, nome, email, telefone, cpf, status')
    .is('deleted_at', null)
    .limit(10);


  let wifiQuery = supabase
    .from('wifi_visitantes')

    .select('id, nome, email, telefone, cpf, cpf_norm, tel_norm, membro_id, data_acesso')
    .is('deleted_at', null)
    .order('data_acesso', { ascending: false, nullsFirst: false })
    .limit(30);

  if (isCpf) {
    memQuery = memQuery.ilike('cpf', `${cpfLimpo}%`);
    wifiQuery = wifiQuery.ilike('cpf_norm', `${cpfLimpo}%`);
  } else {
    memQuery = memQuery.or(`nome.ilike.%${escaped}%,email.ilike.%${escaped}%,telefone.ilike.%${escaped}%`);
    wifiQuery = wifiQuery.or(`nome.ilike.%${escaped}%,email.ilike.%${escaped}%,telefone.ilike.%${escaped}%`);
  }

  const [memRes, wifiRes] = await Promise.all([memQuery, wifiQuery]);

  if (memRes.error) {
    console.error('[kpis/decisoes-pessoas buscar-membro]', memRes.error.message);
    return res.status(500).json({ error: memRes.error.message });
  }
  if (wifiRes.error) {

    console.error('[kpis/decisoes-pessoas buscar-membro wifi]', wifiRes.error.message);
  }


  const doisUltimos = (v) => {
    const d = String(v || '').replace(/\D/g, '');
    return d ? d.slice(-2) : null;
  };
  const out = (memRes.data || []).map(m => ({
    id: m.id, nome: m.nome, email: m.email, telefone: m.telefone, status: m.status,
    cpf_final: doisUltimos(m.cpf), membro_id: m.id, origem: 'membro',
  }));
  const idsMembro = new Set(out.map(m => m.id));
  const vistosWifi = new Set();

  for (const w of (wifiRes.data || [])) {

    if (w.membro_id && idsMembro.has(w.membro_id)) continue;
    const chave = w.cpf_norm || w.tel_norm || (w.nome || '').toLowerCase().trim();
    if (!chave || vistosWifi.has(chave)) continue;
    vistosWifi.add(chave);
    out.push({

      id: w.membro_id || `wifi:${w.id}`,
      membro_id: w.membro_id || null,

      wifi_id: w.id,
      nome: w.nome,
      email: w.email,
      telefone: w.telefone,

      cpf_final: doisUltimos(w.cpf_norm || w.cpf),
      status: w.membro_id ? null : 'visitante',
      origem: 'wifi',
    });
    if (out.length >= 25) break;
  }

  res.json(out);
});
















router.get('/cultos/links-decisoes', authorizeIntegracao, async (req, res) => {
  try {
    const { montarLinkCulto } = require('../utils/cultoToken');
    const ISO = /^\d{4}-\d{2}-\d{2}$/;
    const inicio = String(req.query.inicio || '').slice(0, 10);
    const fim = String(req.query.fim || '').slice(0, 10);
    if (!ISO.test(inicio) || !ISO.test(fim)) {
      return res.status(400).json({ error: 'Informe inicio e fim no formato AAAA-MM-DD.' });
    }
    if (fim < inicio) return res.status(400).json({ error: 'O fim não pode ser anterior ao início.' });

    const { data, error } = await supabase
      .from('vw_culto_stats')
      .select('id, data, hora, nome, service_type_name')
      .gte('data', inicio)
      .lte('data', fim)
      .order('data', { ascending: true })
      .order('hora', { ascending: true })
      .limit(100);
    if (error) throw error;

    const cultos = (data || []).map(c => ({
      id: c.id,
      data: c.data,
      hora: c.hora,
      nome: c.service_type_name || c.nome || 'Culto',



      link: montarLinkCulto(c.id),
    }));
    res.json({ inicio, fim, cultos });
  } catch (e) {
    console.error('[kpis/links-decisoes]', e.message);
    res.status(500).json({ error: 'Erro ao gerar os links da semana' });
  }
});












router.get('/cultos/:id/link-decisoes', authorizeIntegracao, async (req, res) => {
  try {
    const { montarLinkCulto } = require('../utils/cultoToken');
    const { data: c } = await supabase
      .from('cultos').select('id, data').eq('id', req.params.id).maybeSingle();
    if (!c) return res.status(404).json({ error: 'Culto não encontrado' });
    res.json({ link: montarLinkCulto(c.id), data: c.data });
  } catch (e) {
    console.error('[kpis/link-decisoes]', e.message);
    res.status(500).json({ error: 'Erro ao gerar o link' });
  }
});

router.post('/cultos/:id/decisoes-pessoas', authorizeIntegracao, async (req, res) => {
  const {
    nome, telefone, email, idade, data_nascimento, cpf,
    tipo_decisao, observacoes, membro_id,
    responsavel_nome, responsavel_telefone, responsavel_cpf,
    wifi_id,
  } = req.body || {};

  if (!nome || String(nome).trim().length < 2) {
    return res.status(400).json({ error: 'Nome obrigatorio (min 2 chars)' });
  }

  const tipo = ['presencial', 'online', 'kids'].includes(tipo_decisao) ? tipo_decisao : 'presencial';





  let telLimpo = telefone ? String(telefone).replace(/\D/g, '') : '';
  let cpfLimpo = cpf ? String(cpf).replace(/\D/g, '') : null;

  let nascLimpo = data_nascimento || null;
  let respTelLimpo = responsavel_telefone ? String(responsavel_telefone).replace(/\D/g, '') : '';
  let respCpfLimpo = responsavel_cpf ? String(responsavel_cpf).replace(/\D/g, '') : null;

  if (tipo === 'kids') {
    if (!responsavel_nome || String(responsavel_nome).trim().length < 2) {
      return res.status(400).json({ error: 'Nome do responsável obrigatório (min 2 chars) pra decisão Kids' });
    }
    if (respTelLimpo.length !== 11) {
      return res.status(400).json({ error: 'Telefone do responsável deve ter 11 digitos pra decisão Kids' });
    }
    if (respCpfLimpo && (respCpfLimpo.length !== 11 || !cpfValido(respCpfLimpo))) {
      return res.status(400).json({ error: 'CPF do responsável inválido — confira os dígitos (ou deixe vazio)' });
    }

    telLimpo = telLimpo || '';
    if (telLimpo && telLimpo.length !== 11) {
      return res.status(400).json({ error: 'Telefone da criança (se preenchido) deve ter 11 digitos' });
    }
  } else {

    if (telLimpo.length !== 11) {
      return res.status(400).json({ error: 'Telefone deve ter 11 digitos (DDD + 9 + numero)' });
    }
    if (cpfLimpo && (cpfLimpo.length !== 11 || !cpfValido(cpfLimpo))) {


      return res.status(400).json({ error: 'CPF inválido — confira os dígitos' });
    }
  }





  if (membro_id && tipo !== 'kids' && (!cpfLimpo || !nascLimpo)) {
    const { data: cad } = await supabase
      .from('mem_membros')
      .select('cpf, data_nascimento')
      .eq('id', membro_id)
      .maybeSingle();
    if (cad) {
      if (!cpfLimpo && cad.cpf) cpfLimpo = String(cad.cpf).replace(/\D/g, '') || null;
      if (!nascLimpo && cad.data_nascimento) nascLimpo = cad.data_nascimento;
    }
  }






  if (wifi_id && tipo !== 'kids' && !cpfLimpo) {
    const { data: vis } = await supabase
      .from('wifi_visitantes')
      .select('cpf, cpf_norm')
      .eq('id', wifi_id)
      .is('deleted_at', null)
      .maybeSingle();
    const dVis = String(vis?.cpf_norm || vis?.cpf || '').replace(/\D/g, '');
    if (dVis.length === 11) cpfLimpo = dVis;
  }







  let idadeFinal = idade ? Number(idade) : null;
  if (idadeFinal == null && nascLimpo) {
    const derivada = idadeEmAnos(nascLimpo, hojeBRT());
    if (derivada !== null && derivada >= 0 && derivada <= 120) idadeFinal = derivada;
  }



  const { data, error } = await supabase
    .from('cultos_decisoes_pessoas')
    .insert({
      culto_id: req.params.id,
      membro_id: tipo === 'kids' ? null : (membro_id || null),
      nome: String(nome).trim(),
      telefone: telLimpo || null,
      email: email ? String(email).trim().toLowerCase() : null,
      idade: idadeFinal,
      data_nascimento: nascLimpo,
      cpf: cpfLimpo,
      tipo_decisao: tipo,
      observacoes: observacoes || null,
      responsavel_nome:     tipo === 'kids' ? String(responsavel_nome).trim() : null,
      responsavel_telefone: tipo === 'kids' ? respTelLimpo : null,
      responsavel_cpf:      tipo === 'kids' ? respCpfLimpo : null,
      registrado_por: req.user?.id || null,
    })
    .select()
    .single();
  if (error) {
    console.error('[kpis/decisoes-pessoas POST]', error.message);
    return res.status(500).json({ error: error.message });
  }




  if (tipo !== 'kids') {
    (async () => {
      try {
        const { data: equipe } = await supabase.from('profiles')
          .select('id').in('email', [(process.env.CBRIO_PRIVATE_F5768A7E0D93 || 'unconfigured@example.invalid'), (process.env.CBRIO_PRIVATE_A3AEA9C529AF || 'unconfigured@example.invalid')]);
        const ids = (equipe || []).map(p => p.id).filter(Boolean);
        if (!ids.length) return;
        const nomePessoa = String(nome).trim();
        await notificar({
          modulo: 'cuidados',
          tipo: 'nova_aceitacao',
          titulo: `🙌 Nova decisão: ${nomePessoa}`,
          mensagem: `${nomePessoa} tomou uma decisão${telLimpo ? ` · ${telLimpo}` : ''}${tipo === 'online' ? ' (online)' : ''}. Entre em contato pra acompanhar nos próximos passos.`,
          link: '/ministerial/cuidados?tab=convertidos',
          severidade: 'info',
          chaveDedup: `nova_aceitacao_${data.id}`,
          targetIds: ids,
        });
      } catch (e) {
        console.error('[kpis/decisoes-pessoas] notif cuidados:', e.message);
      }
    })();
  }

  res.status(201).json(data);
});

router.put('/decisoes-pessoas/:id', authorizeIntegracao, async (req, res) => {
  const allowed = [
    'nome', 'telefone', 'email', 'idade', 'data_nascimento', 'cpf',
    'tipo_decisao', 'observacoes', 'status_followup', 'observacoes_followup',
    'responsavel_nome', 'responsavel_telefone', 'responsavel_cpf',
  ];
  const update = {};



  let cpfsAtuais = null;
  const precisaCpfAtual = ['cpf', 'responsavel_cpf'].some((k) => req.body?.[k]);
  if (precisaCpfAtual) {
    const { data: atual } = await supabase.from('cultos_decisoes_pessoas')
      .select('cpf, responsavel_cpf').eq('id', req.params.id).maybeSingle();
    cpfsAtuais = atual || {};
  }
  for (const [k, v] of Object.entries(req.body || {})) {
    if (!allowed.includes(k)) continue;
    if ((k === 'cpf' || k === 'responsavel_cpf') && v) {
      const d = String(v).replace(/\D/g, '');
      const atualNorm = String(cpfsAtuais?.[k] || '').replace(/\D/g, '');
      if (d && atualNorm && d === atualNorm) { update[k] = d; continue; }
      if (d.length !== 11 || !cpfValido(d)) {
        return res.status(400).json({ error: 'CPF inválido — confira os dígitos' });
      }
      update[k] = d;
    }
    else if ((k === 'telefone' || k === 'responsavel_telefone') && v) update[k] = String(v).replace(/\D/g, '');
    else if (k === 'email' && v) update[k] = String(v).trim().toLowerCase();
    else if (k === 'idade') update[k] = v ? Number(v) : null;
    else if (k === 'data_nascimento') update[k] = v || null;
    else update[k] = v === '' ? null : v;
  }
  const { data, error } = await supabase
    .from('cultos_decisoes_pessoas').update(update)
    .eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });






  if (update.cpf && data?.membro_id && data.tipo_decisao !== 'kids') {
    (async () => {
      try {
        await reconciliarCpfTardio({
          membroId: data.membro_id, cpf: update.cpf,
          origem: 'decisao_edicao', origemId: data.id,
          dataNascimento: data.data_nascimento || null,
        });
        await propagarCpfConvertido({ membroId: data.membro_id });
      } catch (e) {
        console.error('[kpis/decisoes-pessoas PUT] reconciliar cpf:', e.message);
      }
    })();
  }
  res.json(data);
});

router.delete('/decisoes-pessoas/:id', authorizeIntegracao, async (req, res) => {
  const { error } = await supabase.from('cultos_decisoes_pessoas').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});











async function cultosAutoCreate(req, res) {
  const isAdmin = ['admin', 'diretor'].includes(req.user?.role);
  if (!isAuthorizedCron(req) && !isAdmin) {
    return res.status(401).json({ error: 'Não autorizado' });
  }

  const weeks = Math.max(1, Math.min(Number(req.query.weeks) || 1, 12));

  const { data: types, error: typesErr } = await supabase
    .from('vol_service_types')
    .select('id, name, recurrence_day, recurrence_time')
    .eq('is_active', true)
    .eq('has_online_stream', true)
    .not('recurrence_day', 'is', null)
    .not('recurrence_time', 'is', null);
  if (typesErr) return res.status(500).json({ error: typesErr.message });
















  const vigencia = new Map();
  try {
    const { data: vig, error: vErr } = await supabase
      .from('vol_service_types')
      .select('id, vigente_de, vigente_ate');
    if (!vErr && Array.isArray(vig)) {
      for (const v of vig) vigencia.set(v.id, v);
    }
  } catch {                                                    }








  const vigenteEm = (tipoId, dataStr) => {
    const v = vigencia.get(tipoId);
    if (!v) return true;
    return tipoVigenteEm(v, dataStr);
  };


  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const sundayThisWeek = new Date(today);
  sundayThisWeek.setDate(today.getDate() - today.getDay());

  const weekStarts = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const ws = new Date(sundayThisWeek);
    ws.setDate(sundayThisWeek.getDate() - i * 7);
    weekStarts.push(ws);
  }

  const created = [];
  const skipped = [];
  const erros = [];

  const foraDeVigencia = [];

  for (const ws of weekStarts) {
    for (const t of types || []) {
      const dayDate = new Date(ws);
      dayDate.setDate(ws.getDate() + Number(t.recurrence_day || 0));
      const dataStr = dayDate.toISOString().split('T')[0];
      const horaStr = String(t.recurrence_time).slice(0, 8);
      const dFmt = dayDate.toLocaleDateString('pt-BR');
      const nome = `${t.name} — ${dFmt}`;



      if (!vigenteEm(t.id, dataStr)) {
        foraDeVigencia.push({ tipo: t.name, data: dataStr });
        continue;
      }







      const { data: existente } = await supabase
        .from('cultos')
        .select('id')
        .eq('service_type_id', t.id)
        .eq('data', dataStr)
        .maybeSingle();

      if (existente) { skipped.push({ tipo: t.name, data: dataStr, hora: horaStr }); continue; }

      const { data: novo, error: insErr } = await supabase
        .from('cultos')
        .insert({
          service_type_id: t.id,
          nome,
          data: dataStr,
          hora: horaStr,
          presencial_adulto: 0,
          presencial_kids: 0,
          decisoes_presenciais: 0,
          decisoes_online: 0,
          inserido_por: req.user?.id || null,
        })
        .select('id, nome, data, hora')
        .single();


      if (insErr) {
        console.error('[kpis/cultos/auto-create] insert falhou', t.name, dataStr, insErr.message);
        erros.push({ tipo: t.name, data: dataStr, hora: horaStr, error: insErr.message });
        continue;
      }
      created.push(novo);
    }
  }

  res.json({ weeks, created: created.length, skipped: skipped.length, erros: erros.length,
    fora_de_vigencia: foraDeVigencia.length, items: created, skippedItems: skipped, erroItems: erros,
    foraDeVigenciaItems: foraDeVigencia });
}
router.get('/cultos/auto-create', cultosAutoCreate);
router.post('/cultos/auto-create', cultosAutoCreate);



router.get('/batismos', authorizeBatismoLeitura, async (req, res) => {
  const { status } = req.query;
  let query = supabase
    .from('batismo_inscricoes')
    .select('*, membro:membro_id(id, nome, foto_url, cpf)')
    .order('created_at', { ascending: false });
  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  const inscricoes = data || [];




  const membroIds = [...new Set(inscricoes.map(b => b.membro_id).filter(Boolean))];
  const conversaoPorMembro = {};
  if (membroIds.length) {
    const { data: trilhas } = await supabase
      .from('mem_trilha_valores')
      .select('membro_id, data_conclusao')
      .eq('etapa', 'conversao')
      .eq('concluida', true)
      .in('membro_id', membroIds);
    (trilhas || []).forEach(t => {
      if (!t.data_conclusao) return;

      const atual = conversaoPorMembro[t.membro_id];
      if (!atual || t.data_conclusao < atual) conversaoPorMembro[t.membro_id] = t.data_conclusao;
    });
  }

  const DIA_MS = 86400000;
  const enriched = inscricoes.map(b => {




    const { codigo_acesso, codigo_conferencia, ...b2 } = b;
    b = b2;
    const data_conversao = b.membro_id ? (conversaoPorMembro[b.membro_id] || null) : null;
    let dias_conversao_batismo = null;
    if (data_conversao && b.data_batismo) {
      dias_conversao_batismo = Math.round(
        (new Date(`${b.data_batismo}T12:00:00`).getTime()
          - new Date(`${data_conversao}T12:00:00`).getTime()) / DIA_MS,
      );
    }
    return { ...b, data_conversao, dias_conversao_batismo };
  });

  res.json(enriched);
});







router.get('/batismos/cobertura-convertidos', authorizeBatismoLeitura, async (req, res) => {
  try {
    const onlyDigits = (v) => String(v || '').replace(/\D/g, '');
    const fetchAll = async (table, columns) => {
      const out = []; let from = 0; const page = 1000;
      while (true) {
        const { data, error } = await supabase.from(table).select(columns)
          .is('deleted_at', null).range(from, from + page - 1);
        if (error) throw error;
        out.push(...(data || []));
        if (!data || data.length < page) break;
        from += page;
      }
      return out;
    };

    const [convertidos, inscricoes] = await Promise.all([
      fetchAll('cui_convertidos', 'id, nome, telefone, cpf, membro_id, data_culto'),
      fetchAll('batismo_inscricoes', 'status, membro_id, cpf, nome, data_batismo'),
    ]);


    const byMembro = new Map(), byCpf = new Map(), byNome = new Map();
    const put = (map, key, realizado) => {
      if (!key) return;
      const cur = map.get(key);
      const rank = realizado ? 2 : 1;
      if (!cur || rank > cur.rank) map.set(key, { realizado });
    };
    for (const b of inscricoes) {
      const realizado = b.status === 'realizado';
      put(byMembro, b.membro_id, realizado);
      put(byCpf, onlyDigits(b.cpf).length === 11 ? onlyDigits(b.cpf) : null, realizado);
      put(byNome, String(b.nome || '').trim().toLowerCase() || null, realizado);
    }
    const matchOf = (c) => {
      const cands = [
        c.membro_id ? byMembro.get(c.membro_id) : null,
        onlyDigits(c.cpf).length === 11 ? byCpf.get(onlyDigits(c.cpf)) : null,
        byNome.get(String(c.nome || '').trim().toLowerCase()),
      ].filter(Boolean);
      if (!cands.length) return null;
      return { realizado: cands.some(m => m.realizado) };
    };

    let batizados = 0, inscritos = 0, naoInscritos = 0;
    const pendentes = [];
    for (const c of convertidos) {
      const m = matchOf(c);
      if (m && m.realizado) { batizados++; continue; }
      if (m) inscritos++; else naoInscritos++;
      pendentes.push({
        id: c.id, nome: c.nome, telefone: c.telefone, membro_id: c.membro_id,
        data_culto: c.data_culto, status_batismo: m ? 'inscrito' : 'nao_inscrito',
      });
    }
    pendentes.sort((a, b) => String(b.data_culto || '').localeCompare(String(a.data_culto || '')));

    res.json({
      total: convertidos.length,
      batizados, inscritos, nao_inscritos: naoInscritos,
      pct_batizados: convertidos.length ? Math.round((batizados / convertidos.length) * 100) : 0,
      pendentes,
    });
  } catch (e) {
    console.error('[kpis/batismos/cobertura-convertidos]', e.message);
    res.status(500).json({ error: e.message });
  }
});



function _proximo4Domingo() {
  const q = (y, m) => { const p = new Date(y, m, 1); const off = (7 - p.getDay()) % 7; return new Date(y, m, 1 + off + 21); };
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  let y = hoje.getFullYear(), m = hoje.getMonth();
  let d = q(y, m);
  if (d < hoje) { m += 1; if (m > 11) { y += 1; m = 0; } d = q(y, m); }
  return d.toISOString().slice(0, 10);
}


router.get('/batismos/horarios', authorizeBatismo, async (_req, res) => {
  try {
    const dataBatismo = _proximo4Domingo();
    const { data: horarios, error } = await supabase
      .from('batismo_horarios').select('*').is('deleted_at', null).order('ordem');
    if (error) throw error;
    const { data: insc } = await supabase
      .from('batismo_inscricoes').select('horario_culto')
      .eq('data_batismo', dataBatismo).is('deleted_at', null)
      .not('status', 'in', '(cancelado,rejeitado)');
    const ocup = {};
    (insc || []).forEach(i => { if (i.horario_culto) ocup[i.horario_culto] = (ocup[i.horario_culto] || 0) + 1; });
    res.json({
      data_batismo: dataBatismo,
      horarios: (horarios || []).map(h => ({ ...h, inscritos: ocup[h.horario] || 0 })),
    });
  } catch (e) { res.status(500).json({ error: e.message || 'Erro ao listar horários' }); }
});


router.post('/batismos/horarios', authorizeBatismo, async (req, res) => {
  try {
    const horario = String(req.body?.horario || '').trim().slice(0, 40);
    if (!horario) return res.status(400).json({ error: 'horário é obrigatório' });
    const label = String(req.body?.label || horario).trim().slice(0, 120);
    const limite = req.body?.limite != null && req.body.limite !== '' ? parseInt(req.body.limite, 10) : null;
    const aberto = req.body?.aberto !== false;
    const ordem = Number.isFinite(+req.body?.ordem) ? +req.body.ordem : 99;
    const { data, error } = await supabase.from('batismo_horarios')
      .insert({ horario, label, limite: Number.isFinite(limite) ? limite : null, aberto, ordem })
      .select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: e.message || 'Erro ao criar horário' }); }
});


router.patch('/batismos/horarios/:id', authorizeBatismo, async (req, res) => {
  try {
    const upd = { updated_at: new Date().toISOString() };
    if (typeof req.body?.aberto === 'boolean') upd.aberto = req.body.aberto;
    if (req.body?.label != null) upd.label = String(req.body.label).trim().slice(0, 120);
    if ('limite' in (req.body || {})) {
      const l = req.body.limite;
      upd.limite = (l === null || l === '' ) ? null : (Number.isFinite(+l) ? Math.max(0, parseInt(l, 10)) : null);
    }
    if (Number.isFinite(+req.body?.ordem)) upd.ordem = +req.body.ordem;
    const { data, error } = await supabase.from('batismo_horarios')
      .update(upd).eq('id', req.params.id).is('deleted_at', null).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message || 'Erro ao atualizar horário' }); }
});


router.delete('/batismos/horarios/:id', authorizeBatismo, async (req, res) => {
  try {
    const { error } = await supabase.from('batismo_horarios')
      .update({ deleted_at: new Date().toISOString() }).eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message || 'Erro ao remover horário' }); }
});


router.get('/batismos/config', authorizeBatismo, async (_req, res) => {
  try {
    const { data } = await supabase.from('batismo_config').select('grupo_url, updated_at').eq('id', 1).maybeSingle();
    res.json(data || { grupo_url: null });
  } catch (e) { res.status(500).json({ error: e.message || 'Erro ao carregar config' }); }
});

router.patch('/batismos/config', authorizeBatismo, async (req, res) => {
  try {
    const grupo_url = req.body?.grupo_url ? String(req.body.grupo_url).trim().slice(0, 500) : null;
    if (grupo_url && !/^https:\/\/chat\.whatsapp\.com\//.test(grupo_url)) {
      return res.status(400).json({ error: 'O link precisa ser de um grupo do WhatsApp (chat.whatsapp.com).' });
    }
    const { data, error } = await supabase.from('batismo_config')
      .update({ grupo_url, updated_by: req.user?.id || null, updated_at: new Date().toISOString() })
      .eq('id', 1).select('grupo_url, updated_at').single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message || 'Erro ao salvar o link do grupo' }); }
});

router.post('/batismos', authorizeBatismo, async (req, res) => {
  const {
    cpf, nome, sobrenome, data_nascimento, telefone, email,
    origem = 'manual', observacoes, area_kpi,
    tamanho_camisa, eh_crianca, possui_deficiencia, deficiencia_descricao, endereco,
    horario_culto, sexo,
  } = req.body;
  if (!nome || !sobrenome) return res.status(400).json({ error: 'nome e sobrenome são obrigatórios' });
  const AREAS_OK = ['kids', 'sede', 'bridge', 'ami', 'online'];
  const areaKpiValida = AREAS_OK.includes(area_kpi) ? area_kpi : 'sede';

  const cpfClean = cpf ? cpf.replace(/\D/g, '') : null;
  if (cpfClean && (cpfClean.length !== 11 || !cpfValido(cpfClean))) {
    return res.status(400).json({ error: 'CPF inválido — confira os dígitos' });
  }



  if (origem === 'totem' && !cpfClean) {
    return res.status(400).json({ error: 'CPF é obrigatório para se inscrever pelo totem' });
  }




  let dataBatismo = null;
  let horarioCulto = null;
  let horarioLabel = null;
  if (horario_culto) {
    const { data: h } = await supabase
      .from('batismo_horarios')
      .select('horario, label, limite')
      .eq('horario', String(horario_culto))
      .eq('aberto', true)
      .is('deleted_at', null)
      .maybeSingle();
    if (!h) return res.status(400).json({ error: 'Horário indisponível — escolha outro' });
    horarioLabel = h.label || h.horario;
    dataBatismo = _proximo4Domingo();
    if (h.limite != null) {
      const { count } = await supabase
        .from('batismo_inscricoes')
        .select('id', { count: 'exact', head: true })
        .eq('data_batismo', dataBatismo)
        .eq('horario_culto', h.horario)
        .is('deleted_at', null)
        .not('status', 'in', '(cancelado,rejeitado)');
      if ((count || 0) >= h.limite) {
        return res.status(409).json({ error: 'Esse horário acabou de lotar — escolha outro' });
      }
    }
    horarioCulto = h.horario;
  }





  let membro_id = null;
  try {
    const r = await acharOuCriarGuardado({
      cpf: cpfClean, email: email || null, telefone: telefone || null,
      nome: `${nome} ${sobrenome}`.trim(),
      dataNascimento: data_nascimento || null,
      status: 'visitante',
      origem: 'batismo_cadastro_interno',
    });
    membro_id = r.membro_id;
  } catch (e) {
    console.error('[kpis/batismos] acharOuCriarGuardado:', e.message);

  }




  if (origem === 'totem') {
    const ors = [];
    if (membro_id) ors.push(`membro_id.eq.${membro_id}`);
    if (cpfClean) ors.push(`cpf.eq.${cpfClean}`);
    if (ors.length) {
      const { data: dups } = await supabase
        .from('batismo_inscricoes')
        .select('id, status')
        .or(ors.join(','))
        .in('status', ['pendente', 'confirmado'])
        .is('deleted_at', null)
        .limit(1);
      if (dups && dups[0]) {
        return res.json({ ok: true, duplicado: true, mensagem: `Você já tem uma inscrição de batismo em andamento (${dups[0].status}).` });
      }
    }
  }

  const { data: inscricao, error } = await supabase
    .from('batismo_inscricoes')
    .insert({
      membro_id, nome, sobrenome,
      data_nascimento: data_nascimento || null,
      cpf: cpfClean,
      telefone: telefone || null,
      email: email || null,
      origem,
      area_kpi: areaKpiValida,
      observacoes: observacoes || null,
      inscrito_por: req.user?.id || null,
      tamanho_camisa: tamanho_camisa ? String(tamanho_camisa).trim().toUpperCase() : null,
      eh_crianca: !!eh_crianca,
      possui_deficiencia: !!possui_deficiencia,
      deficiencia_descricao: possui_deficiencia && deficiencia_descricao
        ? String(deficiencia_descricao).trim() : null,
      endereco: endereco ? String(endereco).trim() : null,
      ...(sexo ? { sexo: String(sexo).trim().slice(0, 20) } : {}),
      ...(dataBatismo ? { data_batismo: dataBatismo, horario_culto: horarioCulto } : {}),
    })
    .select('*, membro:membro_id(id, nome, foto_url)')
    .single();
  if (error) return res.status(500).json({ error: error.message });

  notificar({
    modulo: 'membresia',
    tipo: 'novo_batismo',
    titulo: `Nova inscrição de batismo`,
    mensagem: `${nome} ${sobrenome} se inscreveu para batismo${origem === 'totem' ? ' pelo totem' : ''}.`,
    link: '/kpis',
    severidade: 'info',
    chaveDedup: `batismo_${inscricao.id}`,
  }).catch(() => {});




  const telConf = telefone || inscricao.telefone;
  if (origem === 'totem' && telConf) {
    try {
      const { enfileirar } = require('../services/whatsappFila');
      enfileirar({
        telefone: telConf,



        template: process.env.WHATSAPP_TEMPLATE_BATISMO_CONF || 'batismo_confirmacao',
        params: [
          String(nome).split(' ')[0] || 'Olá',
          dataBatismo ? dataBatismo.split('-').reverse().join('/') : 'a confirmar',
          horarioLabel || 'a confirmar',
        ],
        contexto: 'batismo_totem',
        refId: inscricao.id,
      }).catch(() => {});
    } catch {                                                    }
  }


  const { codigo_acesso: _ca, codigo_conferencia: _cc, ...inscricaoPub } = inscricao;
  res.json(inscricaoPub);
});




router.put('/batismos/em-massa', authorizeBatismo, async (req, res) => {
  const { ids, status } = req.body || {};
  const STATUS_VALIDOS = ['pendente', 'confirmado', 'realizado', 'cancelado'];
  const lista = Array.isArray(ids) ? [...new Set(ids.filter(Boolean).map(String))] : [];
  if (!lista.length) return res.status(400).json({ error: 'Selecione ao menos uma pessoa.' });
  if (!STATUS_VALIDOS.includes(status)) return res.status(400).json({ error: 'Status inválido.' });
  if (lista.length > 500) return res.status(400).json({ error: 'Máximo de 500 por vez.' });
  const { data, error } = await supabase
    .from('batismo_inscricoes')
    .update({ status, updated_at: new Date().toISOString() })
    .in('id', lista)
    .is('deleted_at', null)
    .select('id');
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, atualizados: (data || []).length });
});

router.put('/batismos/:id', authorizeBatismo, async (req, res) => {
  const {
    status, data_batismo, observacoes, area_kpi,
    tamanho_camisa, eh_crianca, possui_deficiencia, deficiencia_descricao, endereco,
  } = req.body;
  const update = { updated_at: new Date().toISOString() };
  if (status)       update.status = status;
  if (data_batismo) update.data_batismo = data_batismo;
  if (observacoes !== undefined) update.observacoes = observacoes;
  if (area_kpi && ['kids', 'sede', 'bridge', 'ami', 'online'].includes(area_kpi)) {
    update.area_kpi = area_kpi;
  }
  if (tamanho_camisa !== undefined) {
    update.tamanho_camisa = tamanho_camisa ? String(tamanho_camisa).trim().toUpperCase() : null;
  }
  if (eh_crianca !== undefined) update.eh_crianca = !!eh_crianca;
  if (possui_deficiencia !== undefined) update.possui_deficiencia = !!possui_deficiencia;
  if (deficiencia_descricao !== undefined) {
    update.deficiencia_descricao = deficiencia_descricao ? String(deficiencia_descricao).trim() : null;
  }
  if (endereco !== undefined) update.endereco = endereco ? String(endereco).trim() : null;

  const { data, error } = await supabase
    .from('batismo_inscricoes')
    .update(update)
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });

  const { codigo_acesso: _ca, codigo_conferencia: _cc, ...dataPub } = data || {};
  res.json(dataPub);
});








router.get('/batismos/checkin/do-dia', authorizeBatismo, async (req, res) => {
  const data = req.query.data || hojeSP();
  const { data: rows, error } = await supabase
    .from('batismo_inscricoes')
    .select('id, nome, sobrenome, checkin_em, foto_referencia_url')
    .eq('data_batismo', data)
    .in('status', ['pendente', 'confirmado'])
    .is('deleted_at', null)
    .order('nome', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json({
    data,
    batizandos: (rows || []).map(r => ({
      id: r.id,
      nome: r.nome,
      sobrenome: r.sobrenome,
      ja_checkin: !!r.checkin_em,
      tem_foto: !!r.foto_referencia_url,
    })),
  });
});




router.post('/batismos/:id/checkin', authorizeBatismo, async (req, res) => {
  const { cpf, consentiu } = req.body || {};
  const cpfClean = cpf ? String(cpf).replace(/\D/g, '') : null;
  if (cpfClean && (cpfClean.length !== 11 || !cpfValido(cpfClean))) {
    return res.status(400).json({ error: 'CPF inválido — confira os dígitos' });
  }

  const { data: insc, error: e0 } = await supabase
    .from('batismo_inscricoes')
    .select('id, nome, sobrenome, telefone, email, data_nascimento, cpf, membro_id, codigo_acesso, codigo_conferencia, consentimento_em, deleted_at')
    .eq('id', req.params.id)
    .single();
  if (e0 || !insc || insc.deleted_at) return res.status(404).json({ error: 'Inscrição não encontrada' });





  let membro_id = insc.membro_id;
  if (cpfClean && cpfClean.length === 11 && !insc.membro_id) {
    try {
      const r = await acharOuCriarGuardado({
        cpf: cpfClean,
        email: insc.email || null,
        telefone: insc.telefone || null,
        nome: `${insc.nome} ${insc.sobrenome || ''}`.trim(),
        dataNascimento: insc.data_nascimento || null,
        status: 'visitante',
        origem: 'batismo_checkin', origemId: insc.id,
      });
      membro_id = r.membro_id || membro_id;
    } catch (e) {
      console.error('[kpis/batismos/checkin] acharOuCriarGuardado:', e.message);

    }
  } else if (cpfClean && cpfClean.length === 11 && insc.membro_id) {





    try {
      await reconciliarCpfTardio({
        membroId: insc.membro_id, cpf: cpfClean,
        origem: 'batismo_checkin', origemId: insc.id,
        dataNascimento: insc.data_nascimento || null,
      });
      await propagarCpfConvertido({ membroId: insc.membro_id });
    } catch (e) {
      console.error('[kpis/batismos/checkin] reconciliar cpf:', e.message);
    }
  }

  const nowIso = new Date().toISOString();
  const update = {
    checkin_em: nowIso,
    checkin_por: req.user?.id || null,
    updated_at: nowIso,
  };
  if (membro_id && membro_id !== insc.membro_id) update.membro_id = membro_id;
  if (cpfClean && cpfClean.length === 11 && !insc.cpf) update.cpf = cpfClean;
  if (consentiu && !insc.consentimento_em) update.consentimento_em = nowIso;

  const { data: row, error } = await supabase
    .from('batismo_inscricoes')
    .update(update)
    .eq('id', req.params.id)
    .select('id, nome, sobrenome, codigo_acesso, codigo_conferencia')
    .single();
  if (error) return res.status(500).json({ error: error.message });

  res.json({
    id: row.id,
    nome: `${row.nome} ${row.sobrenome || ''}`.trim(),
    codigo_acesso: row.codigo_acesso,
    codigo_conferencia: row.codigo_conferencia,
  });
});


router.post('/batismos/:id/foto-referencia', authorizeBatismo, uploadFotoRef.single('foto'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'arquivo (campo "foto") obrigatório' });

  const { data: insc, error: e0 } = await supabase
    .from('batismo_inscricoes')
    .select('id, deleted_at')
    .eq('id', req.params.id)
    .single();
  if (e0 || !insc || insc.deleted_at) return res.status(404).json({ error: 'Inscrição não encontrada' });

  const ext = (req.file.originalname.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const path = `referencia/${req.params.id}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from('batismos-biometria')
    .upload(path, req.file.buffer, { contentType: req.file.mimetype, upsert: true });
  if (upErr) return res.status(500).json({ error: upErr.message });

  const nowIso = new Date().toISOString();
  const { error: e1 } = await supabase
    .from('batismo_inscricoes')
    .update({ foto_referencia_url: path, consentimento_em: nowIso, updated_at: nowIso })
    .eq('id', req.params.id);
  if (e1) return res.status(500).json({ error: e1.message });

  res.json({ ok: true, foto_referencia_url: path });
});


router.get('/dashboard', async (req, res) => {
  const semanas = Number(req.query.semanas) || 12;
  const dataInicio = new Date();
  dataInicio.setDate(dataInicio.getDate() - semanas * 7);
  const dataInicioStr = dataInicio.toISOString().split('T')[0];

  const [
    { data: cultos },
    { count: batPendentes },
    { count: batRealizados },
    { count: totalGrupos },
    { count: volAtivos },
    { data: metas },
  ] = await Promise.all([
    supabase.from('vw_culto_stats').select('*').gte('data', dataInicioStr).order('data', { ascending: true }),
    supabase.from('batismo_inscricoes').select('*', { count: 'exact', head: true }).is('deleted_at', null).eq('status', 'pendente'),
    supabase.from('batismo_inscricoes').select('*', { count: 'exact', head: true }).is('deleted_at', null).eq('status', 'realizado'),
    supabase.from('mem_grupos').select('*', { count: 'exact', head: true }).is('deleted_at', null).eq('ativo', true),
    supabase.from('mem_checkins').select('membro_id', { count: 'exact', head: true })
      .gte('data', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]),
    supabase.from('kpi_metas').select('*').eq('ativo', true).order('area'),
  ]);

  res.json({
    cultos: cultos || [],
    batismos: { pendentes: batPendentes || 0, realizados: batRealizados || 0 },
    voluntarios_ativos: volAtivos || 0,
    total_grupos: totalGrupos || 0,
    metas: metas || [],
  });
});


router.get('/metas', async (req, res) => {
  const { data, error } = await supabase
    .from('kpi_metas').select('*').eq('ativo', true).order('area');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.put('/metas/:id', authorize('admin', 'diretor'), async (req, res) => {
  const { meta_6m, meta_12m, meta_24m, valor_base } = req.body;
  const { data, error } = await supabase
    .from('kpi_metas')
    .update({ meta_6m, meta_12m, meta_24m, valor_base })
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});






































function parseMes(input) {

  let y, m;
  if (input && /^\d{4}-\d{2}/.test(input)) {
    const [yy, mm] = input.split('-');
    y = Number(yy); m = Number(mm);
  } else {
    const now = new Date();
    y = now.getFullYear(); m = now.getMonth() + 1;
  }
  const inicio = new Date(Date.UTC(y, m - 1, 1));
  const fimExclusivo = new Date(Date.UTC(y, m, 1));
  const diasNoMes = new Date(Date.UTC(y, m, 0)).getUTCDate();




  let semanasNoMes = 0;
  for (let d = 1; d <= diasNoMes; d++) {
    const date = new Date(Date.UTC(y, m - 1, d));
    if (date.getUTCDay() === 0) {
      const qua = new Date(date.getTime() + 3 * 86400000);
      if (qua.getUTCMonth() === m - 1) semanasNoMes++;
    }
  }
  semanasNoMes = Math.max(1, semanasNoMes);
  const mesISO = `${y}-${String(m).padStart(2, '0')}`;
  const inicioStr = inicio.toISOString().split('T')[0];
  const fimExclusivoStr = fimExclusivo.toISOString().split('T')[0];
  const fimInclusivoStr = new Date(Date.UTC(y, m, 0)).toISOString().split('T')[0];
  return { y, m, mesISO, inicioStr, fimExclusivoStr, fimInclusivoStr, diasNoMes, semanasNoMes };
}


router.get('/cultura', async (req, res) => {
  try {
    const { y: anoRef, m: mesRef, mesISO, inicioStr, fimInclusivoStr, diasNoMes, semanasNoMes } = parseMes(req.query.mes);


    const noventaDias = new Date();
    noventaDias.setDate(noventaDias.getDate() - 90);
    const noventaDiasStr = noventaDias.toISOString();

    const settled = await Promise.allSettled([
      supabase.from('cultos')
        .select('data, presencial_adulto, presencial_kids, decisoes_presenciais, decisoes_online, decisoes_kids, online_ds')
        .gte('data', inicioStr).lte('data', fimInclusivoStr),



      (async () => {
        try {
          const ids = new Set();
          const page = 1000;
          for (let from = 0; ; from += page) {
            const { data, error } = await supabase
              .from('mem_grupo_membros')
              .select('membro_id')
              .is('deleted_at', null)
              .is('saiu_em', null)
              .range(from, from + page - 1);
            if (error) return { count: null, error };
            (data || []).forEach(r => { if (r.membro_id) ids.add(r.membro_id); });
            if (!data || data.length < page) break;
          }
          return { count: ids.size, error: null };
        } catch (error) {
          return { count: null, error };
        }
      })(),


      supabase.from('mem_devocionais')
        .select('membro_id')
        .eq('concluida', true)
        .is('deleted_at', null)
        .gte('data_devocional', inicioStr)
        .lte('data_devocional', fimInclusivoStr),

      supabase.rpc('kpi_servir_comunidade', { _since: noventaDiasStr }),
      supabase.from('cultura_mensal').select('*').eq('mes', inicioStr).maybeSingle(),

      supabase.rpc('fin_generosidade_mes', { p_mes: inicioStr }),
    ]);

    const pick = (i) => (settled[i].status === 'fulfilled' ? settled[i].value : { data: null, error: settled[i].reason });
    const cultosRes = pick(0);
    const grupoMembrosRes = pick(1);
    const devocionalRes = pick(2);
    const servirRes = pick(3);
    const culturaMensalRes = pick(4);
    const finGenRes = pick(5);

    const cultos = cultosRes.data || [];
    const presencialTotal = cultos.reduce((s, c) => s + (c.presencial_adulto || 0) + (c.presencial_kids || 0), 0);
    const onlineDsTotal   = cultos.reduce((s, c) => s + (c.online_ds || 0), 0);






    const chaveSemana = (iso) => {
      const d = new Date(`${iso}T00:00:00Z`);
      const dow = (d.getUTCDay() + 6) % 7;
      d.setUTCDate(d.getUTCDate() - dow);
      return d.toISOString().slice(0, 10);
    };
    const semanasComCulto = new Set(cultos.map((c) => c.data && chaveSemana(c.data)).filter(Boolean)).size;
    const divisorSemanas = semanasComCulto || semanasNoMes;








    const divisorFrequencia = divisorDomingos(cultos, { ano: anoRef, mes: mesRef });


    const decisoesPresencial = cultos.reduce((s, c) => s + (c.decisoes_presenciais || 0), 0);
    const decisoesOnline     = cultos.reduce((s, c) => s + (c.decisoes_online || 0), 0);
    const decisoesKids       = cultos.reduce((s, c) => s + (c.decisoes_kids || 0), 0);
    const decisoesTotal      = decisoesPresencial + decisoesOnline + decisoesKids;

    const conectarPessoas = grupoMembrosRes.error ? null : (grupoMembrosRes.count || 0);



    const devCheckins = (devocionalRes.data || []).length;
    const investirDeus = devocionalRes.error ? null : new Set((devocionalRes.data || []).map(d => d.membro_id).filter(Boolean)).size;


    const servirComunidade = servirRes.error ? null : (typeof servirRes.data === 'number' ? servirRes.data : (servirRes.data ?? null));

    const cm = culturaMensalRes.data;



    const finGen = finGenRes.error || !finGenRes.data ? null : finGenRes.data;
    const finDizimistas = finGen ? Number(finGen.dizimistas || 0) : null;
    const finOfertantes = finGen ? Number(finGen.ofertantes || 0) : null;
    const finValorDizimo = finGen ? Number(finGen.valor_dizimo || 0) : 0;
    const finValorOferta = finGen ? Number(finGen.valor_oferta || 0) : 0;
    const finDoadoresUnicos = finGen ? Number(finGen.doadores_unicos || 0) : null;

    const generosidade = {

      dizimistas: cm?.qtd_dizimistas ?? finDizimistas ?? null,
      ofertantes: cm?.qtd_ofertantes ?? finOfertantes ?? null,
      doadores_unicos: finDoadoresUnicos,
      valor_dizimo: finValorDizimo,
      valor_oferta: finValorOferta,
      valor_total: finValorDizimo + finValorOferta,
      fonte: cm?.qtd_dizimistas != null || cm?.qtd_ofertantes != null ? 'manual' : 'fin_transacoes',
    };



    const presencialSemanal = cm?.freq_presencial_semanal != null
      ? cm.freq_presencial_semanal
      : Math.round(presencialTotal / divisorFrequencia);
    const onlineSemanal = cm?.freq_online_semanal != null
      ? cm.freq_online_semanal
      : Math.round(onlineDsTotal / divisorFrequencia);
    const decisoesMes = cm?.decisoes_total != null ? cm.decisoes_total : decisoesTotal;
    const conectarMes = cm?.freq_grupos_total != null ? cm.freq_grupos_total : conectarPessoas;

    res.json({
      mes: mesISO,
      semanas_no_mes: divisorSemanas,


      domingos_no_mes: divisorFrequencia,
      dias_no_mes: diasNoMes,
      seguir_jesus: {
        presencial: presencialSemanal,
        online: onlineSemanal,
        presencial_total: presencialTotal,
        online_total: onlineDsTotal,
        fonte: cm?.freq_presencial_semanal != null ? 'manual' : 'auto',
      },
      conectar_pessoas: conectarMes,
      investir_deus: investirDeus,
      investir_deus_total: devCheckins,







      investir_comunidade_online: cm?.investir_comunidade_online ?? null,
      servir_comunidade: servirComunidade,
      generosidade,
      decisoes: decisoesMes,
      decisoes_detalhe: {
        presencial: decisoesPresencial,
        online: decisoesOnline,
        kids: decisoesKids,

        soma_ambientes: decisoesTotal,
        fonte: cm?.decisoes_total != null ? 'manual' : 'auto',
      },
    });
  } catch (e) {
    console.error('[kpis/cultura] erro:', e);
    res.status(500).json({
      error: e?.message || 'Erro ao calcular cultura',
      stack: process.env.NODE_ENV === 'development' ? e?.stack : undefined,
    });
  }
});


router.post('/cultura/mensal', authorize('admin', 'diretor'), async (req, res) => {
  const corpo = req.body || {};
  const { mes } = corpo;
  if (!mes || !/^\d{4}-\d{2}/.test(mes)) {
    return res.status(400).json({ error: 'Campo "mês" obrigatório no formato YYYY-MM' });
  }

  const mesDate = `${mes.slice(0, 7)}-01`;
  const intOrNull = (v) => v == null || v === '' ? null : Number(v);













  const tem = (k) => Object.prototype.hasOwnProperty.call(corpo, k);
  const payload = { mes: mesDate, updated_at: new Date().toISOString(), updated_by: req.user?.id || null };


  if (tem('qtd_dizimistas')) payload.qtd_dizimistas = Number(corpo.qtd_dizimistas) || 0;
  if (tem('qtd_ofertantes')) payload.qtd_ofertantes = Number(corpo.qtd_ofertantes) || 0;
  for (const k of ['freq_presencial_semanal', 'freq_online_semanal', 'decisoes_total',
    'freq_grupos_total', 'investir_comunidade_online']) {
    if (tem(k)) payload[k] = intOrNull(corpo[k]);
  }
  if (tem('observacoes')) payload.observacoes = corpo.observacoes || null;
  const { data, error } = await supabase
    .from('cultura_mensal')
    .upsert(payload, { onConflict: 'mes' })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.get('/cultura/mensal', async (req, res) => {
  const { data, error } = await supabase
    .from('cultura_mensal').select('*').order('mes', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});


router.get('/cultura/pense', async (req, res) => {
  const { data, error } = await supabase
    .from('pense_videos').select('*').order('data_publicacao', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

router.post('/cultura/pense', authorize('admin', 'diretor'), async (req, res) => {
  const { video_id, titulo, data_publicacao, views, ativo } = req.body || {};
  if (!video_id || !data_publicacao) {
    return res.status(400).json({ error: 'video_id e data_publicacao são obrigatórios' });
  }
  const { data, error } = await supabase
    .from('pense_videos')
    .upsert({
      video_id,
      titulo: titulo || null,
      data_publicacao,
      views: Number(views) || 0,
      ativo: ativo !== false,
      created_by: req.user?.id || null,
    }, { onConflict: 'video_id' })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.delete('/cultura/pense/:id', authorize('admin', 'diretor'), async (req, res) => {
  const { error } = await supabase.from('pense_videos').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});


router.post('/cultura/pense/sync', async (req, res) => {
  const isAdmin = ['admin', 'diretor'].includes(req.user?.role);
  if (!isAuthorizedCron(req) && !isAdmin) {
    return res.status(401).json({ error: 'Não autorizado' });
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'YOUTUBE_API_KEY não configurada' });

  const { data: videos, error } = await supabase
    .from('pense_videos').select('id, video_id').eq('ativo', true);
  if (error) return res.status(500).json({ error: error.message });


  const ids = (videos || []).map(v => v.video_id);
  const chunks = [];
  for (let i = 0; i < ids.length; i += 50) chunks.push(ids.slice(i, i + 50));

  const results = [];
  for (const chunk of chunks) {
    try {
      const url = `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${chunk.join(',')}&key=${apiKey}`;
      const r = await fetch(url);
      const json = await r.json();
      for (const item of (json.items || [])) {
        const views = parseInt(item.statistics?.viewCount || '0', 10);
        await supabase.from('pense_videos')
          .update({ views, views_atualizado_em: new Date().toISOString() })
          .eq('video_id', item.id);
        results.push({ video_id: item.id, views });
      }
    } catch (e) {
      results.push({ error: e.message });
    }
  }
  res.json({ synced: results.length, results });
});

module.exports = router;
