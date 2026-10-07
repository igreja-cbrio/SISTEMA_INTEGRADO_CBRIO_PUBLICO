
















const router = require('express').Router();
const kidsVisitante = require('../utils/kidsVisitante');
const multer = require('multer');
const XLSX = require('xlsx');
const { authenticate, authorizeModule } = require('../middleware/auth');
const { resolverJanelaPeriodo, rotuloJanela } = require('../utils/janelaPeriodo');
const { tokensDaBusca, montarResultado } = require('../utils/buscaCriancaDecisao');
const { resumirCadastros, serieDiaria, limitesUtc, diaBRT, temMarcaDeImport } = require('../utils/cadastrosKids');
const { supabase } = require('../utils/supabase');
const { safeEqual, isAuthorizedCron } = require('../utils/cronAuth');
const { notificar } = require('../services/notificar');
const wpp = require('../services/whatsappService');
const { traduzErroUmPaiUmaMae } = require('../utils/kidsResponsavel');


const { extensaoDeMime, extensaoDoCaminho, nomeArquivoFoto, PREFIXO_FOTO } = require('../utils/fotoApresentacao');
const { randomUUID: _uuidFoto } = require('crypto');

const { enviarTexto: enviarTextoWpp } = require('../services/whatsappSend');
const { acharOuCriarGuardado, ehNomePlaceholder } = require('../services/membroMatch');
const { atualizarStatusInscricao } = require('../services/volInscricaoStatus');
const { frequentaNaJanela, avaliarFrequencia } = require('../utils/kidsFrequencia');
const { agruparMotivos, montarContagens, rotuloMotivo } = require('../utils/kidsSituacao');
const { avaliarResolucao: avaliarResolucaoKids, resumoFila: resumoFilaKids } = require('../utils/kidsConversaoFila');


const { horariosConfigurados: apresHorariosConfigurados, ocupacaoPorHorario: apresOcupacaoPorHorario } = require('../services/apresentacaoHorarios');









const xlsxUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /\.(xlsx|xls|csv)$/i.test(file.originalname);
    cb(ok ? null : new Error('Formato invalido · use .xlsx, .xls ou .csv'), ok);
  },
});




router.use((req, res, next) => {
  const isCron = req.path.startsWith('/cron/') && isAuthorizedCron(req);
  if (isCron) return next();
  return authenticate(req, res, next);
});






async function fotoVisivelCrianca(c) {
  if (!c) return null;
  if (c.foto_storage_path) {
    if (!c.foto_consentimento_em) return null;
    const { data } = await supabase.storage.from('kids-documentos').createSignedUrl(c.foto_storage_path, 60 * 30);
    return data?.signedUrl || null;
  }
  return c.foto_url || null;
}






const fotoSignCache = new Map();
async function anexarFotosEmLote(criancas) {
  const lista = criancas || [];
  const agora = Date.now();
  const pendentes = [...new Set(lista
    .filter(c => c && c.foto_storage_path && c.foto_consentimento_em)
    .map(c => c.foto_storage_path))]
    .filter(p => !(fotoSignCache.get(p)?.expira > agora));
  if (pendentes.length) {
    try {
      const { data } = await supabase.storage.from('kids-documentos').createSignedUrls(pendentes, 60 * 30);
      (data || []).forEach(s => {
        if (s?.path && s?.signedUrl) fotoSignCache.set(s.path, { url: s.signedUrl, expira: agora + 25 * 60000 });
      });
    } catch (e) {
      console.error('[TOTEM-KIDS] assinatura de fotos em lote falhou:', e.message);
    }
  }
  return lista.map(c => {
    if (!c) return c;
    let foto = c.foto_url || null;
    if (c.foto_storage_path) {
      foto = c.foto_consentimento_em ? (fotoSignCache.get(c.foto_storage_path)?.url || null) : null;
    }
    return { ...c, foto_url: foto };
  });
}

function calcIdadeMeses(dataNascimento) {
  if (!dataNascimento) return null;
  const nasc = new Date(dataNascimento);
  if (isNaN(nasc.getTime())) return null;
  const hoje = new Date();
  let meses = (hoje.getFullYear() - nasc.getFullYear()) * 12 + (hoje.getMonth() - nasc.getMonth());
  if (hoje.getDate() < nasc.getDate()) meses -= 1;
  return Math.max(0, meses);
}

function formatIdade(meses) {
  if (meses == null) return '';
  if (meses < 24) return `${meses} ${meses === 1 ? 'mês' : 'meses'}`;
  const anos = Math.floor(meses / 12);
  return `${anos} ${anos === 1 ? 'ano' : 'anos'}`;
}

function normalizarTelefone(t) {
  if (!t) return null;
  const digits = String(t).replace(/\D/g, '');
  return digits.length >= 8 ? digits : null;
}

function normalizarCpf(c) {
  if (!c) return null;
  const digits = String(c).replace(/\D/g, '');
  return digits.length === 11 ? digits : null;
}



function cpfValido(cpf) {
  const d = String(cpf || '').replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dig = (base, pesoIni) => {
    let s = 0;
    for (let i = 0; i < base.length; i++) s += parseInt(base[i], 10) * (pesoIni - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dig(d.slice(0, 9), 10) === +d[9] && dig(d.slice(0, 10), 11) === +d[10];
}






async function fetchCriancasPaginado(select, aplicarFiltros) {
  const PAGINA = 1000;
  const tudo = [];
  for (let offset = 0; ; offset += PAGINA) {
    let q = supabase.from('kids_criancas').select(select);
    q = aplicarFiltros(q);
    const { data, error } = await q.order('nome').range(offset, offset + PAGINA - 1);
    if (error) throw error;
    if (!data || !data.length) break;
    tudo.push(...data);
    if (data.length < PAGINA) break;
  }
  return tudo;
}






function salaDaIdade(salas, idadeMeses) {
  if (idadeMeses == null) return null;
  return (salas || []).find(s =>
    Number(s.faixa_etaria_min_meses) <= idadeMeses && Number(s.faixa_etaria_max_meses) >= idadeMeses) || null;
}


async function sugerirSala(idadeMeses) {
  if (idadeMeses == null) return null;
  const { data } = await supabase
    .from('kids_salas')
    .select('id, nome, capacidade, faixa_etaria_min_meses, faixa_etaria_max_meses, cor')
    .eq('ativo', true)
    .lte('faixa_etaria_min_meses', idadeMeses)
    .gte('faixa_etaria_max_meses', idadeMeses)
    .order('ordem')
    .limit(1)
    .maybeSingle();
  return data || null;
}



async function isLiderKidsDoDia(authUserId) {
  if (!authUserId) return false;
  const hoje = new Date().toISOString().slice(0, 10);


  const { data: profile } = await supabase
    .from('profiles').select('email').eq('id', authUserId).maybeSingle();
  if (!profile?.email) return false;

  const { data: volProfile } = await supabase
    .from('vol_profiles').select('id').eq('email', profile.email).maybeSingle();
  if (!volProfile) return false;


  const { data: checkins } = await supabase
    .from('vol_check_ins')
    .select('id, service_id, vol_services(scheduled_at, service_type_name)')
    .eq('volunteer_id', volProfile.id)
    .gte('checked_in_at', `${hoje}T00:00:00`)
    .lte('checked_in_at', `${hoje}T23:59:59`);

  if (!checkins?.length) return false;


  const { data: serviceTypes } = await supabase
    .from('vol_service_types').select('name, has_kids').eq('has_kids', true);
  const typesComKids = new Set((serviceTypes || []).map(s => s.name));

  return checkins.some(c => typesComKids.has(c.vol_services?.service_type_name));
}









router.get('/sessoes/atual', authorizeModule('kids', 1), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('kids_sessoes')
      .select(`
        id, culto_id, status, abrir_em, fechar_em, encerrada_at,
        culto:cultos(id, data, nome, service_type_id, presencial_kids, decisoes_kids,
                     service_type:vol_service_types(id, name, color, has_kids, recurrence_time))
      `)
      .eq('status', 'aberta')
      .order('abrir_em', { ascending: false });
    if (error) throw error;

    const hoje = _hojeBRT();
    const agoraPartes = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(new Date());
    const hora = Number(agoraPartes.find((p) => p.type === 'hour')?.value || 0);
    const minuto = Number(agoraPartes.find((p) => p.type === 'minute')?.value || 0);
    const agoraMin = hora * 60 + minuto;
    const minutosDe = (s) => {
      const raw = String(s?.culto?.service_type?.recurrence_time || '');
      const [h, m] = raw.split(':').map(Number);
      return Number.isFinite(h) ? h * 60 + (Number.isFinite(m) ? m : 0) : null;
    };
    const hojeAbertas = (data || [])
      .filter((s) => String(s.culto?.data || '').slice(0, 10) === hoje)
      .sort((a, b) => (minutosDe(a) ?? 9999) - (minutosDe(b) ?? 9999));

    if (!hojeAbertas.length) return res.json(null);
    const comHorario = hojeAbertas.filter((s) => minutosDe(s) != null);
    if (!comHorario.length) return res.json(hojeAbertas[0]);
    const atual = comHorario.find((s, i) => {
      const inicio = minutosDe(s);
      const fim = i < comHorario.length - 1 ? minutosDe(comHorario[i + 1]) : inicio + 180;
      return agoraMin >= inicio && agoraMin < fim;
    });


    if (atual) return res.json(atual);
    if (agoraMin < minutosDe(comHorario[0])) return res.json(comHorario[0]);
    return res.json(null);
  } catch (e) {
    console.error('[totemKids/sessoes/atual]', e.message);
    res.status(500).json({ error: 'Erro ao buscar sessão atual' });
  }
});





router.post('/sessoes/garantir', authorizeModule('kids', 2), async (req, res) => {
  try {
    const { culto_id } = req.body;
    if (!culto_id) return res.status(400).json({ error: 'culto_id obrigatorio' });






    {
      const { data: cultoAlvo, error: cultoErr } = await supabase.from('cultos')
        .select('id, deleted_at, service_type:vol_service_types(is_active, has_kids)')
        .eq('id', culto_id).maybeSingle();
      if (!cultoErr) {
        if (!cultoAlvo || cultoAlvo.deleted_at) {
          return res.status(404).json({ error: 'Culto não encontrado (apagado ou inexistente).' });
        }
        if (cultoAlvo.service_type && cultoAlvo.service_type.is_active === false) {
          return res.status(409).json({ error: 'Este tipo de culto foi encerrado — o check-in não abre sessão pra ele.' });
        }
        if (cultoAlvo.service_type && cultoAlvo.service_type.has_kids === false) {
          return res.status(409).json({ error: 'Este culto não tem Kids — sem sessão de check-in.' });
        }
      }
    }
    const sel = `id, culto_id, status, abrir_em, fechar_em, encerrada_at,
        culto:cultos(id, data, nome, service_type_id, presencial_kids, decisoes_kids,
                     service_type:vol_service_types(id, name, color, has_kids, recurrence_time))`;
    let { data: s } = await supabase.from('kids_sessoes').select(sel).eq('culto_id', culto_id).maybeSingle();
    if (!s) {
      const ins = await supabase.from('kids_sessoes')
        .insert({ culto_id, status: 'aberta', abrir_em: new Date().toISOString() })
        .select(sel).single();
      if (ins.error) {

        if (ins.error.code === '23505') {
          const re = await supabase.from('kids_sessoes').select(sel).eq('culto_id', culto_id).maybeSingle();
          s = re.data;
        } else throw ins.error;
      } else s = ins.data;
    } else if (s.status === 'encerrada') {
      await supabase.from('kids_sessoes')
        .update({ status: 'aberta', encerrada_at: null, encerrada_por: null }).eq('id', s.id);
      s.status = 'aberta';
    }
    res.json(s || null);
  } catch (e) {
    console.error('[totemKids/sessoes/garantir]', e.message);
    res.status(500).json({ error: 'Erro ao garantir sessão do culto' });
  }
});


function _hojeBRT() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}






function _dataLimiteVisitante() {
  return kidsVisitante.prazoDe(_hojeBRT());
}











function _inicioCultoMs(culto) {
  const hhmm = String(culto?.service_type?.recurrence_time || '12:00').slice(0, 5);
  return new Date(`${String(culto?.data).slice(0, 10)}T${hhmm}:00-03:00`).getTime();
}





function _corteEnsaioAutoISO(culto) {
  const meiaNoite = new Date(`${String(culto?.data).slice(0, 10)}T00:00:00-03:00`).getTime();
  const duasHorasAntes = _inicioCultoMs(culto) - 2 * 3600 * 1000;
  return new Date(Math.min(meiaNoite, duasHorasAntes)).toISOString();
}





async function limparCheckinsEnsaio(sessoes) {
  let total = 0;
  for (const s of sessoes || []) {
    if (!s?.id || !s?.culto?.data) continue;
    const { data, error } = await supabase.from('kids_checkins')
      .update({ deleted_at: new Date().toISOString() })
      .eq('sessao_id', s.id).is('deleted_at', null)
      .lt('checkin_at', _corteEnsaioAutoISO(s.culto))
      .select('id');
    if (error) { console.error('[totemKids/limparCheckinsEnsaio]', error.message); continue; }
    total += (data || []).length;
  }
  return total;
}



async function temSessaoAoVivoHoje() {
  const hoje = _hojeBRT();
  const { data } = await supabase.from('kids_sessoes')
    .select('id, culto:cultos(data)').eq('status', 'aberta');
  return (data || []).some((s) => String(s.culto?.data || '').slice(0, 10) === hoje);
}









async function _fecharSessoes(ids, userId, motivo) {
  if (!ids?.length) return 0;
  const agora = new Date().toISOString();
  await supabase.from('kids_sessoes')
    .update({ status: 'encerrada', encerrada_at: agora, encerrada_por: userId || null })
    .in('id', ids);
  const { error: eCk } = await supabase.from('kids_checkins')
    .update({
      checkout_at: agora,
      checkout_metodo: 'checkout_forcado',
      checkout_por: userId || null,
      responsavel_checkout_nome: motivo,
    })
    .in('sessao_id', ids).is('checkout_at', null);
  if (eCk) console.error('[totemKids/_fecharSessoes] auto-checkout:', eCk.message);
  return ids.length;
}

async function encerrarSessoesVencidas(userId) {
  const hoje = _hojeBRT();
  const { data: abertas, error } = await supabase
    .from('kids_sessoes')
    .select('id, abrir_em, culto:cultos(id, data, service_type:vol_service_types(recurrence_time))')
    .eq('status', 'aberta');
  if (error) throw error;
  const diaBRT = (iso) => (iso
    ? new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
    : null);


  const vencidas = (abertas || [])
    .filter((s) => s.culto?.data && String(s.culto.data).slice(0, 10) < hoje);





  const ensaiosVencidos = (abertas || [])
    .filter((s) => s.culto?.data && String(s.culto.data).slice(0, 10) > hoje
      && diaBRT(s.abrir_em) && diaBRT(s.abrir_em) < hoje);
  await limparCheckinsEnsaio(ensaiosVencidos);





  try {
    const { data: cultosHoje } = await supabase.from('cultos')
      .select('id, data, service_type:vol_service_types(recurrence_time)').eq('data', hoje);
    if ((cultosHoje || []).length) {
      const { data: sessoesHoje } = await supabase.from('kids_sessoes')
        .select('id, culto_id').in('culto_id', cultosHoje.map((c) => c.id));
      const byCulto = Object.fromEntries(cultosHoje.map((c) => [c.id, c]));
      const limposHoje = await limparCheckinsEnsaio(
        (sessoesHoje || []).map((s) => ({ id: s.id, culto: byCulto[s.culto_id] })));
      if (limposHoje) console.warn(`[totemKids/sweep] ${limposHoje} check-in(s) de ensaio limpos das sessões de hoje`);
    }
  } catch (e) { console.error('[totemKids/sweep] limpeza de hoje:', e.message); }

  return _fecharSessoes(
    [...vencidas, ...ensaiosVencidos].map((s) => s.id),
    userId,
    'Baixa automática (sessão de outro dia)'
  );
}




async function inativarVisitantesVencidos() {
  const hoje = _hojeBRT();
  const { data, error } = await supabase.from('kids_criancas')
    .update({ ativo: false, inativado_em: new Date().toISOString(), motivo_inativacao: 'Visitante não retornou (prazo de 4 semanas)' })
    .eq('visitante', true).eq('ativo', true).lt('data_limite', hoje).is('deleted_at', null)
    .select('id');
  if (error) { console.error('[totemKids/inativarVisitantesVencidos]', error.message); return 0; }
  return (data || []).length;
}

















async function promoverVisitanteRecorrente(criancaId) {
  try {
    const { data: cr } = await supabase.from('kids_criancas')
      .select('id, visitante').eq('id', criancaId).maybeSingle();
    if (!cr || cr.visitante !== true) return false;


    const { data: todos, error: eCk } = await supabase.from('kids_checkins')
      .select('checkin_at').eq('crianca_id', criancaId).is('deleted_at', null)
      .order('checkin_at', { ascending: false }).limit(50);


    if (eCk) { console.error('[totemKids/promoverVisitanteRecorrente]', eCk.message); return false; }
    const dias = new Set((todos || []).map((c) => String(c.checkin_at).slice(0, 10))).size;

    const patch = kidsVisitante.patchAposCheckin({
      eVisitante: true, diasComCheckin: dias, hojeISO: _hojeBRT(),
    });
    if (!patch) return false;
    const { promovida, ...campos } = patch;

    const { error } = await supabase.from('kids_criancas')
      .update({ ...campos, updated_at: new Date().toISOString() })
      .eq('id', criancaId).eq('visitante', true);
    if (error) { console.error('[totemKids/promoverVisitanteRecorrente]', error.message); return false; }
    return promovida === true;
  } catch (e) {
    console.error('[totemKids/promoverVisitanteRecorrente]', e.message);
    return false;
  }
}



router.post('/sessoes/encerrar-vencidas', authorizeModule('kids', 2), async (req, res) => {
  try {
    const n = await encerrarSessoesVencidas(req.user.userId);
    const visitantes_inativados = await inativarVisitantesVencidos().catch(() => 0);
    res.json({ encerradas: n, visitantes_inativados });
  } catch (e) {
    console.error('[totemKids/sessoes/encerrar-vencidas]', e.message);
    res.status(500).json({ error: 'Erro ao encerrar sessões vencidas' });
  }
});






router.post('/sessoes/trocar-periodo', authorizeModule('kids', 3), async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.culto_ids) ? [...new Set(req.body.culto_ids.map(String))] : [];
    if (!ids.length) return res.status(400).json({ error: 'culto_ids obrigatório' });
    const hoje = _hojeBRT();

    const { data: alvo } = await supabase.from('cultos').select('id, data').in('id', ids);
    const escolhidos = (alvo || []).filter((c) => String(c.data).slice(0, 10) === hoje).map((c) => c.id);
    if (!escolhidos.length) return res.status(400).json({ error: 'Nenhum culto de hoje nos ids' });

    for (const cid of escolhidos) {
      const { data: s } = await supabase.from('kids_sessoes').select('id, status').eq('culto_id', cid).maybeSingle();
      if (!s) {
        await supabase.from('kids_sessoes').insert({ culto_id: cid, status: 'aberta', abrir_em: new Date().toISOString() });
      } else if (s.status === 'encerrada') {
        await supabase.from('kids_sessoes').update({ status: 'aberta', encerrada_at: null, encerrada_por: null }).eq('id', s.id);
      }
    }

    const { data: abertasHoje } = await supabase.from('kids_sessoes')
      .select('id, culto_id, culto:cultos(data)').eq('status', 'aberta');
    const fechar = (abertasHoje || [])
      .filter((s) => s.culto?.data && String(s.culto.data).slice(0, 10) === hoje && !escolhidos.includes(s.culto_id))
      .map((s) => s.id);
    const encerradas = await _fecharSessoes(fechar, req.user.userId, 'Baixa automática (troca de sessão)');
    res.json({ abertas: escolhidos.length, encerradas });
  } catch (e) {
    console.error('[totemKids/sessoes/trocar-periodo]', e.message);
    res.status(500).json({ error: 'Erro ao trocar a sessão' });
  }
});


router.get('/sessoes', authorizeModule('kids', 1), async (req, res) => {
  try {
    const status = req.query.status;
    const limit = Math.min(parseInt(req.query.limit) || 30, 100);
    let q = supabase
      .from('kids_sessoes')
      .select(`
        id, culto_id, status, abrir_em, fechar_em, encerrada_at,
        culto:cultos(id, data, nome, presencial_kids, decisoes_kids,
                     service_type:vol_service_types(id, name, color, recurrence_time))
      `)
      .order('abrir_em', { ascending: false })
      .limit(limit);
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    console.error('[totemKids/sessoes]', e.message);
    res.status(500).json({ error: 'Erro ao listar sessões' });
  }
});


router.post('/sessoes', authorizeModule('kids', 3), async (req, res) => {
  try {
    const { culto_id, abrir_em, fechar_em } = req.body;
    if (!culto_id) return res.status(400).json({ error: 'culto_id obrigatorio' });

    const { data, error } = await supabase
      .from('kids_sessoes')
      .insert({
        culto_id,
        abrir_em: abrir_em || new Date().toISOString(),
        fechar_em: fechar_em || null,
        status: 'aberta',
      })
      .select('id, culto_id, status, abrir_em, fechar_em')
      .single();
    if (error) {

      if (error.code === '23505') {
        return res.status(409).json({ error: 'Já existe sessão pra esse culto' });
      }
      throw error;
    }
    res.status(201).json(data);
  } catch (e) {
    console.error('[totemKids/sessoes POST]', e.message);
    res.status(500).json({ error: 'Erro ao criar sessão' });
  }
});


router.post('/sessoes/:id/abrir', authorizeModule('kids', 3), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('kids_sessoes')
      .update({ status: 'aberta' })
      .eq('id', req.params.id)
      .select('id, status')
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao abrir sessão' });
  }
});








router.post('/sessoes/:id/encerrar', authorizeModule('kids', 3), async (req, res) => {
  try {
    const { limpar_testes } = req.body || {};
    let testes_limpos = 0;
    const { data: sess } = await supabase.from('kids_sessoes')
      .select('id, culto:cultos(id, data, service_type:vol_service_types(recurrence_time))')
      .eq('id', req.params.id).maybeSingle();
    if (!sess) return res.status(404).json({ error: 'Sessão não encontrada' });
    if (sess.culto?.data) {
      const corte = new Date(_inicioCultoMs(sess.culto) - 2 * 3600 * 1000).toISOString();
      const { data: suspeitos } = await supabase.from('kids_checkins')
        .select('id').eq('sessao_id', sess.id).is('deleted_at', null).lt('checkin_at', corte);
      const n = (suspeitos || []).length;
      if (n && limpar_testes === undefined) {
        return res.status(409).json({
          error: `${n} check-in(s) fora do horário do culto parecem teste.`,
          precisa_confirmar_limpeza: true,
          suspeitos: n,
        });
      }
      if (n && limpar_testes === true) {
        const { data: del, error: eDel } = await supabase.from('kids_checkins')
          .update({ deleted_at: new Date().toISOString() })
          .eq('sessao_id', sess.id).is('deleted_at', null).lt('checkin_at', corte)
          .select('id');
        if (eDel) console.error('[totemKids/sessoes/encerrar] limpar testes:', eDel.message);
        testes_limpos = (del || []).length;
      }
    }
    const { data, error } = await supabase
      .from('kids_sessoes')
      .update({
        status: 'encerrada',
        encerrada_at: new Date().toISOString(),
        encerrada_por: req.user.userId,
      })
      .eq('id', req.params.id)
      .select('id, status, encerrada_at')
      .single();
    if (error) throw error;



    const { error: eCk } = await supabase.from('kids_checkins')
      .update({
        checkout_at: new Date().toISOString(),
        checkout_metodo: 'checkout_forcado',
        checkout_por: req.user.userId,
        responsavel_checkout_nome: 'Baixa automática (sessão encerrada)',
      })
      .eq('sessao_id', req.params.id).is('checkout_at', null).is('deleted_at', null);
    if (eCk) console.error('[totemKids/sessoes/encerrar] auto-checkout:', eCk.message);



    res.json({ ...data, testes_limpos });
  } catch (e) {
    console.error('[totemKids/sessoes/encerrar]', e.message);
    res.status(500).json({ error: 'Erro ao encerrar sessão' });
  }
});






router.get('/criancas/buscar', authorizeModule('kids', 1), async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json([]);


    const qNorm = q.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();


    const termos = qNorm.split(/\s+/).filter(t => t.length >= 1).slice(0, 6);




    let buscaQ = supabase
      .from('kids_criancas')
      .select(`
        id, nome, data_nascimento, sexo, foto_url, foto_storage_path, foto_consentimento_em, observacoes_medicas, consent_marketing,
        tem_espectro, espectro_qual, tem_alergia, alergia_qual, tem_limitacao_fisica, limitacao_fisica_qual,
        visitante, visitante_relacao, data_limite, ativo, motivo_inativacao, familia_id,
        familia:mem_familias(id, nome),
        responsaveis:kids_responsaveis(
          membro_id, parentesco, autorizado_buscar,
          membro:mem_membros(id, nome, telefone, cpf, foto_url, deleted_at)
        )
      `)
      .is('deleted_at', null);
    for (const t of termos) buscaQ = buscaQ.ilike('nome_norm', `%${t}%`);
    const { data: criancas } = await buscaQ
      .order('ativo', { ascending: false })
      .order('nome')
      .limit(30);


    const digits = q.replace(/\D/g, '');
    let extras = [];
    if (digits.length >= 4) {
      const { data: membrosPorTel } = await supabase
        .from('mem_membros')
        .select('id')
        .like('telefone', `%${digits}%`)
        .limit(10);
      if (membrosPorTel?.length) {
        const membroIds = membrosPorTel.map(m => m.id);
        const { data: responsaveis } = await supabase
          .from('kids_responsaveis')
          .select('crianca_id')
          .in('membro_id', membroIds);
        const criancaIds = [...new Set((responsaveis || []).map(r => r.crianca_id))];
        if (criancaIds.length) {
          const { data: extras2 } = await supabase
            .from('kids_criancas')
            .select(`
              id, nome, data_nascimento, sexo, foto_url, foto_storage_path, foto_consentimento_em, observacoes_medicas, consent_marketing,
              visitante, visitante_relacao, data_limite, ativo, motivo_inativacao, familia_id,
              familia:mem_familias(id, nome),
              responsaveis:kids_responsaveis(
                membro_id, parentesco, autorizado_buscar,
                membro:mem_membros(id, nome, telefone, cpf, foto_url, deleted_at)
              )
            `)
            .in('id', criancaIds)
            .is('deleted_at', null);
          extras = extras2 || [];
        }
      }
    }


    const map = new Map();
    [...(criancas || []), ...extras].forEach(c => map.set(c.id, c));
    const lista = (await anexarFotosEmLote([...map.values()])).map(c => ({
      ...c,



      responsaveis: (c.responsaveis || []).filter((r) => r.membro && !r.membro.deleted_at),
      idade_meses: calcIdadeMeses(c.data_nascimento),
      idade_label: formatIdade(calcIdadeMeses(c.data_nascimento)),
    }));

    res.json(lista);
  } catch (e) {
    console.error('[totemKids/criancas/buscar]', e.message);
    res.status(500).json({ error: 'Erro na busca' });
  }
});




router.get('/criancas/:id/irmaos', authorizeModule('kids', 1), async (req, res) => {
  try {
    const { data: base } = await supabase
      .from('kids_criancas')
      .select('familia_id')
      .eq('id', req.params.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (!base?.familia_id) return res.json([]);

    const { data: irmaos } = await supabase
      .from('kids_criancas')
      .select(`
        id, nome, data_nascimento, sexo, foto_url, foto_storage_path, foto_consentimento_em, observacoes_medicas, consent_marketing,
        tem_espectro, espectro_qual, tem_alergia, alergia_qual, tem_limitacao_fisica, limitacao_fisica_qual,
        visitante, visitante_relacao, data_limite, ativo, motivo_inativacao, familia_id,
        familia:mem_familias(id, nome),
        responsaveis:kids_responsaveis(
          membro_id, parentesco, autorizado_buscar,
          membro:mem_membros(id, nome, telefone, cpf, foto_url, deleted_at)
        )
      `)
      .eq('familia_id', base.familia_id)
      .neq('id', req.params.id)
      .eq('ativo', true)
      .is('deleted_at', null)
      .order('nome');

    const lista = (await anexarFotosEmLote(irmaos)).map(c => ({
      ...c,

      responsaveis: (c.responsaveis || []).filter((r) => r.membro && !r.membro.deleted_at),
      idade_meses: calcIdadeMeses(c.data_nascimento),
      idade_label: formatIdade(calcIdadeMeses(c.data_nascimento)),
    }));
    res.json(lista);
  } catch (e) {
    console.error('[totemKids/criancas/irmaos]', e.message);
    res.status(500).json({ error: 'Erro ao buscar irmãos' });
  }
});



router.get('/criancas/duplicados', authorizeModule('kids', 1), async (req, res) => {
  try {
    let from = 0; const page = 1000; let all = [];
    while (true) {
      const { data, error } = await supabase.from('kids_criancas')
        .select('id, nome, data_nascimento, ativo, foto_url, familia:mem_familias(nome), responsaveis:kids_responsaveis(membro:mem_membros(nome))')
        .is('deleted_at', null).range(from, from + page - 1);
      if (error) throw error;
      if (!data || !data.length) break;
      all = all.concat(data);
      if (data.length < page) break;
      from += page;
    }
    const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
    const grupos = {};
    all.forEach((c) => { const k = norm(c.nome); if (k.length < 3) return; (grupos[k] = grupos[k] || []).push(c); });
    const dups = Object.values(grupos).filter((g) => g.length > 1).map((g) => g.map((c) => ({
      id: c.id, nome: c.nome, data_nascimento: c.data_nascimento, ativo: c.ativo, foto_url: c.foto_url,
      familia: c.familia?.nome || null,
      responsaveis: (c.responsaveis || []).map((r) => r.membro?.nome).filter(Boolean),
    })));

    dups.sort((a, b) => {
      const mesma = (g) => { const ds = g.map((x) => x.data_nascimento).filter(Boolean); return ds.length > 1 && new Set(ds).size === 1; };
      return (mesma(b) ? 1 : 0) - (mesma(a) ? 1 : 0);
    });
    res.json(dups);
  } catch (e) { console.error('[totemKids] duplicados:', e.message); res.status(500).json({ error: 'Erro ao detectar duplicados' }); }
});


router.post('/criancas/merge', authorizeModule('kids', 3), async (req, res) => {
  try {
    const { keep_id, merge_ids } = req.body || {};
    if (!keep_id || !Array.isArray(merge_ids) || !merge_ids.length) return res.status(400).json({ error: 'keep_id e merge_ids obrigatórios' });
    if (merge_ids.includes(keep_id)) return res.status(400).json({ error: 'A criança mantida não pode estar na lista de fundidas' });
    const { error } = await supabase.rpc('merge_kids_criancas', { p_keep: keep_id, p_merge: merge_ids });
    if (error) throw error;
    res.json({ ok: true, fundidas: merge_ids.length });
  } catch (e) {
    const t = traduzErroUmPaiUmaMae(e);
    if (t) return res.status(t.status).json({ error: t.error });
    console.error('[totemKids] merge criancas:', e.message);
    res.status(500).json({ error: 'Erro ao fundir crianças' });
  }
});


router.get('/criancas/:id', authorizeModule('kids', 1), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('kids_criancas')
      .select(`
        *, familia:mem_familias(id, nome),
        responsaveis:kids_responsaveis(
          id, membro_id, parentesco, autorizado_buscar, contato_emergencia, observacao,
          membro:mem_membros(id, nome, telefone, cpf, foto_url, email, deleted_at)
        )
      `)
      .eq('id', req.params.id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Criança não encontrada' });

    res.json({
      ...data,

      responsaveis: (data.responsaveis || []).filter((r) => r.membro && !r.membro.deleted_at),
      foto_url: await fotoVisivelCrianca(data),
      idade_meses: calcIdadeMeses(data.data_nascimento),
      idade_label: formatIdade(calcIdadeMeses(data.data_nascimento)),
      sala_sugerida: await sugerirSala(calcIdadeMeses(data.data_nascimento)),
    });
  } catch (e) {
    console.error('[totemKids/criancas/:id]', e.message);
    res.status(500).json({ error: 'Erro ao buscar criança' });
  }
});





router.post('/criancas', authorizeModule('kids', 2), async (req, res) => {
  try {
    const { crianca, responsavel, responsaveis, amigo_de_crianca_id, permitir_sem_cpf } = req.body || {};
    if (!crianca?.nome) return res.status(400).json({ error: 'crianca.nome obrigatorio' });

    const txt = (cond, v) => (cond && v ? String(v).trim().slice(0, 500) : null);
    const bool = (v) => (v === true ? true : (v === false ? false : null));




    const RELACOES_VISITANTE = ['amigo', 'primo', 'vizinho', 'irmao', 'outros'];
    const ehVisitante = crianca.visitante === true;
    const relacaoVisitante = ehVisitante && RELACOES_VISITANTE.includes(crianca.visitante_relacao)
      ? crianca.visitante_relacao : null;
    const dataLimiteVisitante = ehVisitante ? _dataLimiteVisitante() : null;
    const camposCrianca = {
      nome: crianca.nome,
      data_nascimento: crianca.data_nascimento || null,
      sexo: crianca.sexo || null,
      observacoes_medicas: crianca.observacoes_medicas || null,
      necessidades_especiais: crianca.necessidades_especiais || null,
      serie: crianca.serie || null,
      foto_url: crianca.foto_url || null,
      foto_consentimento_em: crianca.foto_url ? new Date().toISOString() : null,
      tem_alergia: bool(crianca.tem_alergia),
      alergia_qual: txt(crianca.tem_alergia === true, crianca.alergia_qual),
      tem_espectro: bool(crianca.tem_espectro),
      espectro_qual: txt(crianca.tem_espectro === true, crianca.espectro_qual),
      tem_limitacao_fisica: bool(crianca.tem_limitacao_fisica),
      limitacao_fisica_qual: txt(crianca.tem_limitacao_fisica === true, crianca.limitacao_fisica_qual),
      consent_marketing: bool(crianca.consent_marketing),
      consent_marketing_em: crianca.consent_marketing == null ? null : new Date().toISOString(),
      consent_marketing_versao: crianca.consent_marketing == null ? null : 'v1',
      visitante: ehVisitante,
      visitante_relacao: relacaoVisitante,
      data_limite: dataLimiteVisitante,
      created_by: req.user.userId,
    };


    if (amigo_de_crianca_id) {
      const { data: amigo } = await supabase.from('kids_criancas')
        .select('id, nome, familia_id').eq('id', amigo_de_crianca_id).is('deleted_at', null).maybeSingle();
      if (!amigo) return res.status(404).json({ error: 'Criança de referência não encontrada' });
      const { data: criancaCriada, error: errC } = await supabase.from('kids_criancas')
        .insert({ ...camposCrianca, familia_id: amigo.familia_id || null,
          observacoes_internas: ehVisitante ? `Visitante (${relacaoVisitante || 'outros'}) · de ${amigo.nome}` : null })
        .select('*, familia:mem_familias(id, nome)').single();
      if (errC) throw errC;
      const { data: resps } = await supabase.from('kids_responsaveis')
        .select('membro_id, parentesco, autorizado_buscar, contato_emergencia').eq('crianca_id', amigo.id);
      const aut = (resps || []).filter((r) => r.autorizado_buscar);
      if (aut.length) {
        await supabase.from('kids_responsaveis').insert(aut.map((r) => ({
          crianca_id: criancaCriada.id, membro_id: r.membro_id,
          parentesco: r.parentesco || 'responsavel', autorizado_buscar: true,
          contato_emergencia: r.contato_emergencia || false,
        })));
      }
      return res.status(201).json({ crianca: criancaCriada, amigo_de: { id: amigo.id, nome: amigo.nome }, familia_id: amigo.familia_id });
    }



    const listaResp = (Array.isArray(responsaveis) && responsaveis.length)
      ? responsaveis
      : (responsavel ? [responsavel] : []);
    const validos = listaResp.filter(r => r?.nome && r?.telefone);
    if (!validos.length) {
      return res.status(400).json({ error: 'Informe ao menos um responsável (nome e telefone)' });
    }






    for (const r of validos) {
      const bruto = String(r.cpf || '').replace(/\D/g, '');
      if (bruto && (bruto.length !== 11 || !cpfValido(bruto))) {
        return res.status(400).json({ error: `CPF de ${r.nome} inválido — confira os dígitos` });
      }
      if (!bruto && !permitir_sem_cpf) {
        return res.status(422).json({
          error: `CPF de ${r.nome} é obrigatório — sem o documento agora, o supervisor pode liberar`,
          code: 'cpf_obrigatorio',
        });
      }
    }









    const membros = [];
    for (const resp of validos) {
      const tel = normalizarTelefone(resp.telefone);
      const cpf = normalizarCpf(resp.cpf);
      const rr = await acharOuCriarGuardado({
        cpf, email: resp.email || null, telefone: tel, nome: resp.nome, status: 'visitante', origem: 'kids_responsavel',
      });
      const { data: membro } = await supabase.from('mem_membros')
        .select('id, nome, familia_id').eq('id', rr.membro_id).single();
      membros.push({ membro, tel, cpf, parentesco: resp.parentesco || 'outro', autorizado_buscar: resp.autorizado_buscar !== false });
    }


    const sobrenomeCrianca = String(crianca.nome).trim().split(/\s+/).slice(1).join(' ');
    const { data: f, error: fe } = await supabase.from('mem_familias')
      .insert({ nome: `Família ${sobrenomeCrianca || membros[0].membro.nome.split(' ')[0]}` }).select('id').single();
    if (fe) throw fe;
    const familiaId = f.id;

    for (const m of membros) {
      if (!m.membro.familia_id) {
        await supabase.from('mem_membros').update({ familia_id: familiaId, parentesco: 'responsavel' }).eq('id', m.membro.id);
      }
    }

    const { data: criancaCriada, error: errCrianca } = await supabase.from('kids_criancas')
      .insert({ ...camposCrianca, familia_id: familiaId })
      .select('*, familia:mem_familias(id, nome)').single();
    if (errCrianca) throw errCrianca;


    const vistos = new Set();
    const vinc = [];
    for (const m of membros) {
      if (vistos.has(m.membro.id)) continue;
      vistos.add(m.membro.id);
      vinc.push({ crianca_id: criancaCriada.id, membro_id: m.membro.id, parentesco: m.parentesco, autorizado_buscar: m.autorizado_buscar });
    }
    if (vinc.length) await supabase.from('kids_responsaveis').insert(vinc);






    if (permitir_sem_cpf) {
      for (const m of membros) {
        if (m.cpf) continue;
        supabase.from('mem_historico').insert({
          membro_id: m.membro.id,
          tipo: 'outro',
          descricao: `[cpf_dispensado] Cadastro Kids liberado sem CPF via válvula do totem (criança ${criancaCriada.nome} · operador ${req.user?.userId || req.user?.id || 'desconhecido'}).`,
          created_at: new Date().toISOString(),
        }).then(({ error }) => { if (error) console.warn('[totemKids/criancas] historico dispensa:', error.message); });
      }
    }

    res.status(201).json({
      crianca: criancaCriada,
      responsavel: { id: membros[0].membro.id, nome: membros[0].membro.nome, telefone: membros[0].tel, cpf: membros[0].cpf },
      responsaveis: membros.map(m => ({ id: m.membro.id, nome: m.membro.nome, telefone: m.tel })),
      familia_id: familiaId,
    });
  } catch (e) {
    const t = traduzErroUmPaiUmaMae(e);
    if (t) return res.status(t.status).json({ error: t.error });
    console.error('[totemKids/criancas POST]', e.message);
    res.status(500).json({ error: 'Erro ao cadastrar criança' });
  }
});


router.patch('/criancas/:id', authorizeModule('kids', 3), async (req, res) => {
  try {
    const allowed = ['nome', 'data_nascimento', 'sexo', 'familia_id', 'observacoes_medicas',
                     'necessidades_especiais', 'foto_url', 'visitante', 'visitante_relacao', 'data_limite',
                     'ativo', 'observacoes_internas',
                     'serie', 'data_conversao', 'data_batismo', 'consent_marketing',
                     'tem_espectro', 'espectro_qual', 'tem_alergia', 'alergia_qual',
                     'tem_limitacao_fisica', 'limitacao_fisica_qual'];
    const update = {};
    for (const k of allowed) if (k in req.body) update[k] = req.body[k];



    if ('visitante' in req.body) {
      if (req.body.visitante === true) {
        if (!req.body.data_limite) {



          const { data: atual } = await supabase.from('kids_criancas')
            .select('visitante, data_limite').eq('id', req.params.id).maybeSingle();
          if (!(atual?.visitante === true && atual?.data_limite)) update.data_limite = _dataLimiteVisitante();
        }
      } else {
        update.data_limite = null;
        update.visitante_relacao = null;
      }
    }
    if (update.visitante_relacao && !['amigo', 'primo', 'vizinho', 'irmao', 'outros'].includes(update.visitante_relacao)) {
      delete update.visitante_relacao;
    }
    if (req.body.foto_url && !req.body.foto_consentimento_em) {
      update.foto_consentimento_em = new Date().toISOString();
    }

    if ('consent_marketing' in req.body) {
      update.consent_marketing_em = req.body.consent_marketing == null ? null : new Date().toISOString();
      update.consent_marketing_versao = req.body.consent_marketing == null ? null : 'v1';
    }
    const { data, error } = await supabase
      .from('kids_criancas')
      .update(update)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao editar criança' });
  }
});



router.post('/criancas/:id/tornar-frequentador', authorizeModule('kids', 3), async (req, res) => {
  try {
    const { data, error } = await supabase.from('kids_criancas')
      .update({ visitante: false, data_limite: null, visitante_relacao: null, updated_at: new Date().toISOString() })
      .eq('id', req.params.id).select('id, nome, visitante').single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[totemKids/tornar-frequentador]', e.message);
    res.status(500).json({ error: 'Erro ao tornar a criança frequentador' });
  }
});




router.patch('/criancas/:criancaId/responsaveis/:membroId', authorizeModule('kids', 3), async (req, res) => {
  try {
    const allowed = ['parentesco', 'autorizado_buscar', 'contato_emergencia'];
    const update = {};
    for (const k of allowed) if (k in req.body) update[k] = req.body[k];
    if (!Object.keys(update).length) return res.status(400).json({ error: 'Nada pra atualizar' });
    const { data, error } = await supabase
      .from('kids_responsaveis')
      .update(update)
      .eq('crianca_id', req.params.criancaId)
      .eq('membro_id', req.params.membroId)
      .select()
      .maybeSingle();
    if (error) throw error;
    res.json(data || { ok: true });
  } catch (e) {
    const t = traduzErroUmPaiUmaMae(e);
    if (t) return res.status(t.status).json({ error: t.error });
    console.error('[totemKids] update vinculo responsavel:', e.message);
    res.status(500).json({ error: 'Erro ao atualizar o vínculo do responsável' });
  }
});




router.delete('/criancas/:criancaId/responsaveis/:membroId', authorizeModule('kids', 3), async (req, res) => {
  try {
    const { criancaId, membroId } = req.params;
    const { count } = await supabase.from('kids_responsaveis')
      .select('id', { count: 'exact', head: true })
      .eq('crianca_id', criancaId);
    if ((count || 0) <= 1) {
      return res.status(400).json({ error: 'A criança precisa ter ao menos um responsável. Adicione outro antes de remover este.' });
    }
    const { error } = await supabase.from('kids_responsaveis')
      .delete()
      .eq('crianca_id', criancaId).eq('membro_id', membroId);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('[totemKids] remove vinculo responsavel:', e.message);
    res.status(500).json({ error: 'Erro ao remover o responsável' });
  }
});



router.patch('/membro/:id', authorizeModule('kids', 3), async (req, res) => {
  try {
    const allowed = ['nome', 'telefone'];
    const update = {};
    for (const k of allowed) {
      if (k in req.body && String(req.body[k] ?? '').trim()) update[k] = String(req.body[k]).trim();
    }
    if (Object.keys(update).length === 0) return res.status(400).json({ error: 'Nada pra atualizar' });
    const { data, error } = await supabase
      .from('mem_membros')
      .update(update)
      .eq('id', req.params.id)
      .is('deleted_at', null)
      .select('id, nome, telefone')
      .maybeSingle();
    if (error) throw error;
    if (!data) {




      return res.status(404).json({
        error: 'O cadastro deste responsável está desativado na Membresia — não dá pra editar. Re-vincule o responsável pela ficha (Adicionar) ou peça a um administrador pra restaurar o cadastro.',
        cadastro_desativado: true,
      });
    }





    (async () => {
      try {
        const patchProfile = {};
        if (update.telefone) patchProfile.telefone = update.telefone;
        if (update.nome) patchProfile.name = update.nome;
        if (Object.keys(patchProfile).length) {
          await supabase.from('profiles').update(patchProfile).eq('membro_id', req.params.id);
        }
      } catch (err) { console.error('[totemKids/membro] sync profiles:', err.message); }
      try {
        const patchVol = {};
        if (update.telefone) patchVol.phone = update.telefone;
        if (update.nome) patchVol.full_name = update.nome;
        if (Object.keys(patchVol).length) {
          await supabase.from('vol_profiles').update(patchVol).eq('membresia_id', req.params.id);
        }
      } catch (err) { console.error('[totemKids/membro] sync vol_profiles:', err.message); }
    })();

    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao editar responsável' });
  }
});




router.get('/edit-senha/status', authorizeModule('kids', 1), async (_req, res) => {
  try {
    const { data } = await supabase.from('kids_totem_config').select('edit_senha_hash').eq('id', true).maybeSingle();
    res.json({ definida: !!data?.edit_senha_hash });
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

router.post('/edit-senha', authorizeModule('kids', 4), async (req, res) => {
  try {
    const bcrypt = require('bcryptjs');
    const senha = String(req.body?.senha || '');
    if (senha.length < 4) return res.status(400).json({ error: 'A senha precisa ter ao menos 4 caracteres' });
    const hash = bcrypt.hashSync(senha, 10);
    const { error } = await supabase.from('kids_totem_config')
      .update({ edit_senha_hash: hash, edit_senha_por: req.user?.userId || null, edit_senha_em: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', true);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao salvar a senha' }); }
});

router.post('/edit-senha/verificar', authorizeModule('kids', 1), async (req, res) => {
  try {
    const bcrypt = require('bcryptjs');
    const senha = String(req.body?.senha || '');
    const { data } = await supabase.from('kids_totem_config').select('edit_senha_hash').eq('id', true).maybeSingle();
    if (!data?.edit_senha_hash) return res.json({ ok: false, naoDefinida: true });
    res.json({ ok: bcrypt.compareSync(senha, data.edit_senha_hash) });
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});











router.get('/criancas/:id/aniversario-impressoes', authorizeModule('kids', 1), async (req, res) => {
  try {
    const { data: c } = await supabase.from('kids_criancas')
      .select('data_nascimento').eq('id', req.params.id).maybeSingle();
    if (!c?.data_nascimento) return res.json({ imprimir: true, count: 0 });
    const hoje = _hojeBRT();
    const [, mm, dd] = String(c.data_nascimento).split('-');
    if (!mm || !dd) return res.json({ imprimir: true, count: 0 });

    const anoAtual = Number(hoje.slice(0, 4));
    const hojeMs = new Date(`${hoje}T12:00:00Z`).getTime();
    let bdayMs = null;
    for (const ano of [anoAtual - 1, anoAtual, anoAtual + 1]) {
      const ms = new Date(`${ano}-${mm}-${dd}T12:00:00Z`).getTime();
      if (bdayMs === null || Math.abs(ms - hojeMs) < Math.abs(bdayMs - hojeMs)) bdayMs = ms;
    }
    const inicio = new Date(bdayMs - 6 * 86400000).toISOString().slice(0, 10);
    const fim = new Date(bdayMs + 1 * 86400000).toISOString().slice(0, 10);
    const { data: cks } = await supabase.from('kids_checkins')
      .select('checkin_grupo_id').eq('crianca_id', req.params.id).is('deleted_at', null)
      .gte('checkin_at', `${inicio}T00:00:00-03:00`).lt('checkin_at', `${fim}T00:00:00-03:00`);


    const grupos = new Set();
    let visitas = 0;
    for (const r of cks || []) {
      if (r.checkin_grupo_id) { if (!grupos.has(r.checkin_grupo_id)) { grupos.add(r.checkin_grupo_id); visitas++; } }
      else visitas++;
    }
    res.json({ imprimir: visitas <= 2, count: visitas });
  } catch (e) {
    console.error('[totemKids/aniversario-impressoes]', e.message);
    res.json({ imprimir: true, count: 0 });
  }
});







router.get('/responsavel-familia', authorizeModule('kids', 2), async (req, res) => {
  try {
    const cpf11 = normalizarCpf(req.query.cpf);
    if (!cpf11 || !cpfValido(cpf11)) return res.json({ encontrado: false });
    const { data: membro } = await supabase.from('mem_membros')
      .select('id, nome').eq('cpf', cpf11).is('deleted_at', null).maybeSingle();
    if (!membro) return res.json({ encontrado: false });

    const { data: vincs } = await supabase.from('kids_responsaveis')
      .select('crianca:kids_criancas(id, nome, familia_id, ativo, deleted_at)')
      .eq('membro_id', membro.id);
    const filhos = (vincs || []).map((v) => v.crianca)
      .filter((c) => c && c.ativo !== false && !c.deleted_at && c.familia_id);
    if (!filhos.length) return res.json({ encontrado: true, membro, criancas: [] });


    const porFamilia = new Map();
    for (const c of filhos) {
      if (!porFamilia.has(c.familia_id)) porFamilia.set(c.familia_id, []);
      porFamilia.get(c.familia_id).push(c);
    }
    let familiaId = null, grupo = [];
    for (const [fid, cs] of porFamilia) if (cs.length > grupo.length) { familiaId = fid; grupo = cs; }
    const { data: fam } = await supabase.from('mem_familias')
      .select('nome').eq('id', familiaId).maybeSingle();
    res.json({
      encontrado: true,
      membro,
      familia_id: familiaId,
      familia_nome: fam?.nome || null,
      ref_crianca_id: grupo[0]?.id || null,
      criancas: grupo.map((c) => ({ id: c.id, nome: c.nome })),
    });
  } catch (e) {
    console.error('[totemKids/responsavel-familia]', e.message);
    res.json({ encontrado: false });
  }
});





router.post('/familia-revisar', authorizeModule('kids', 2), async (req, res) => {
  try {
    const { crianca_id, responsavel_membro_id, familia_existente_nome } = req.body || {};
    if (responsavel_membro_id) {
      await supabase.from('mem_historico').insert({
        membro_id: responsavel_membro_id,
        tipo: 'outro',
        descricao: `[familia_revisar] Criança ${crianca_id || '?'} cadastrada em família NOVA apesar de o responsável já ter filhos${familia_existente_nome ? ` em "${familia_existente_nome}"` : ''} — revisar união de famílias (Entradas > Vincular famílias).`,
        created_at: new Date().toISOString(),
      }).then(() => {}, (e) => console.warn('[totemKids/familia-revisar]', e?.message));
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('[totemKids/familia-revisar]', e.message);
    res.json({ ok: false });
  }
});


















async function contarSituacoesKids() {
  const contar = async (aplicar) => {
    let q = supabase
      .from('kids_criancas')
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null);
    q = aplicar(q);
    const { count, error } = await q;
    if (error) throw error;
    return count;
  };

  const [ativas, visitantes, inativas] = await Promise.allSettled([
    contar((q) => q.eq('ativo', true)),




    contar((q) => q.eq('ativo', true).eq('visitante', true)),
    contar((q) => q.eq('ativo', false)),
  ]);

  const val = (r) => (r.status === 'fulfilled' ? r.value : undefined);
  const nAtivas = val(ativas);
  const nVisit = val(visitantes);

  for (const r of [ativas, visitantes, inativas]) {
    if (r.status === 'rejected') {
      console.error('[totemKids] contagem de situação:', r.reason?.message || r.reason);
    }
  }

  return montarContagens({



    frequentadoras:
      typeof nAtivas === 'number' && typeof nVisit === 'number' ? nAtivas - nVisit : undefined,
    visitantes: nVisit,
    inativas: val(inativas),
  });
}

router.get('/criancas', authorizeModule('kids', 1), async (req, res) => {
  try {
    const ativo = req.query.ativo !== 'false';


    const pageSize = 1000;
    let from = 0;
    let data = [];
    while (true) {
      const { data: page, error } = await supabase
        .from('kids_criancas')
        .select(`
          id, nome, data_nascimento, sexo, foto_url, foto_storage_path, foto_consentimento_em, observacoes_medicas,
          necessidades_especiais, serie, consent_marketing, data_conversao, data_batismo, visitante, visitante_relacao, data_limite, ativo, inativado_em, motivo_inativacao, familia_id,
          familia:mem_familias(id, nome),
          responsaveis:kids_responsaveis(membro:mem_membros(id, nome, telefone))
        `)
        .eq('ativo', ativo)




        .is('deleted_at', null)
        .order('nome')
        .range(from, from + pageSize - 1);
      if (error) throw error;
      if (!page || page.length === 0) break;
      data = data.concat(page);
      if (page.length < pageSize) break;
      from += pageSize;
    }





    let checkinsPorCrianca = new Map();
    let coletaDesde = null;
    let avisoFrequencia = null;
    try {

      const linhas = [];
      for (let off = 0; off < 200000; off += 1000) {
        const { data: pag, error } = await supabase
          .from('kids_checkins')
          .select('crianca_id, created_at')
          .order('created_at', { ascending: true })
          .range(off, off + 999);
        if (error) throw error;
        linhas.push(...(pag || []));
        if (!pag || pag.length < 1000) break;
      }









      try {
        for (let off = 0; off < 200000; off += 1000) {
          const { data: pag, error } = await supabase
            .from('kids_pco_presencas')
            .select('crianca_id, data')
            .order('data', { ascending: true })
            .range(off, off + 999);
          if (error) throw error;


          for (const p of pag || []) {
            if (p?.crianca_id && p?.data) {
              linhas.push({ crianca_id: p.crianca_id, created_at: `${p.data}T12:00:00.000Z` });
            }
          }
          if (!pag || pag.length < 1000) break;
        }
        linhas.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
      } catch (e2) {
        console.warn('[totemKids/criancas] presenças do PCO:', e2.message);
      }

      for (const l of linhas) {
        const atual = checkinsPorCrianca.get(l.crianca_id) || { total: 0, ultimo: null };
        atual.total += 1;
        if (!atual.ultimo || l.created_at > atual.ultimo) atual.ultimo = l.created_at;
        checkinsPorCrianca.set(l.crianca_id, atual);
      }
      coletaDesde = linhas.length ? linhas[0].created_at : null;
    } catch (e) {
      console.error('[totemKids/criancas] frequência:', e.message);
      avisoFrequencia = 'Não consegui carregar os check-ins — os números de frequência estão indisponíveis nesta lista.';
      checkinsPorCrianca = new Map();
    }

    const itens = (await anexarFotosEmLote(data)).map(c => {
      const f = checkinsPorCrianca.get(c.id) || { total: 0, ultimo: null };
      return {
        ...c,
        idade_meses: calcIdadeMeses(c.data_nascimento),
        idade_label: formatIdade(calcIdadeMeses(c.data_nascimento)),
        checkins_total: avisoFrequencia ? null : f.total,
        ultimo_checkin: avisoFrequencia ? null : f.ultimo,
        frequenta: avisoFrequencia ? null : frequentaNaJanela(f.ultimo),





        motivo_inativacao_label: rotuloMotivo(c.motivo_inativacao),
      };
    });



    if (req.query.meta === '1') {
      return res.json({
        itens,
        frequencia: {
          ...avaliarFrequencia(itens, { coletaDesde }),
          aviso: avisoFrequencia,
        },
        contagens: await contarSituacoesKids(),






        motivos: ativo === false ? agruparMotivos(data) : null,
      });
    }
    res.json(itens);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao listar crianças' });
  }
});



router.get('/criancas/:id/atendimentos', authorizeModule('kids', 1), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('kids_atendimentos')
      .select('*')
      .eq('crianca_id', req.params.id)
      .is('deleted_at', null)
      .order('data', { ascending: false }).order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar atendimentos' }); }
});


router.post('/criancas/:id/atendimentos', authorizeModule('kids', 2), async (req, res) => {
  try {
    const descricao = String(req.body?.descricao || '').trim();
    if (!descricao) return res.status(400).json({ error: 'Descreva o atendimento' });
    const tiposOk = ['contato', 'ausencia', 'saude', 'observacao', 'outro'];
    const tipo = tiposOk.includes(req.body?.tipo) ? req.body.tipo : 'contato';
    const data = /^\d{4}-\d{2}-\d{2}$/.test(req.body?.data || '') ? req.body.data : new Date().toISOString().slice(0, 10);
    const { data: criado, error } = await supabase
      .from('kids_atendimentos')
      .insert({
        crianca_id: req.params.id, tipo, descricao: descricao.slice(0, 2000), data,
        registrado_por: req.user?.userId || null,
        registrado_por_nome: req.user?.name || req.user?.email || null,
      })
      .select().single();
    if (error) throw error;
    res.status(201).json(criado);
  } catch (e) { res.status(500).json({ error: 'Erro ao registrar atendimento' }); }
});


router.delete('/atendimentos/:id', authorizeModule('kids', 3), async (req, res) => {
  try {
    const { error } = await supabase.from('kids_atendimentos')
      .update({ deleted_at: new Date().toISOString() }).eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao remover atendimento' }); }
});


router.patch('/criancas/:id/inativar', authorizeModule('kids', 3), async (req, res) => {
  try {
    const reativar = req.body?.ativo === true;
    const upd = reativar
      ? { ativo: true, inativado_em: null, motivo_inativacao: null }
      : { ativo: false, inativado_em: new Date().toISOString(), motivo_inativacao: String(req.body?.motivo || 'Desativado manualmente').slice(0, 300) };
    const { data, error } = await supabase.from('kids_criancas')
      .update(upd).eq('id', req.params.id).select('id, ativo').single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar status' }); }
});






async function kidsTeamsList() {
  const { data } = await supabase.from('vol_teams')
    .select('id, name, color, sort_order').ilike('name', '%kid%').eq('is_active', true);
  return data || [];
}
const limparTime = (n) => String(n || '').replace(/^[-\s]+/, '');


router.get('/kids-equipe', authorizeModule('kids', 1), async (req, res) => {
  try {
    const teams = await kidsTeamsList();
    if (!teams.length) return res.json([]);
    const teamIds = teams.map((t) => t.id);
    const [{ data: positions }, { data: membros }] = await Promise.all([
      supabase.from('vol_positions').select('id, team_id, name, sort_order').in('team_id', teamIds).eq('is_active', true),
      supabase.from('vol_team_members').select('id, team_id, position_id, volunteer_profile_id, volunteer_name').in('team_id', teamIds).eq('is_active', true),
    ]);
    const porPos = {}, semPos = {};
    (membros || []).forEach((m) => {
      if (m.position_id) (porPos[m.position_id] = porPos[m.position_id] || []).push(m);
      else (semPos[m.team_id] = semPos[m.team_id] || []).push(m);
    });
    const out = teams
      .sort((a, b) => (a.sort_order ?? 99) - (b.sort_order ?? 99) || a.name.localeCompare(b.name))
      .map((t) => ({
        team_id: t.id, team_nome: limparTime(t.name), cor: t.color,
        posicoes: (positions || []).filter((p) => p.team_id === t.id)
          .sort((a, b) => (a.sort_order ?? 99) - (b.sort_order ?? 99))
          .map((p) => ({ position_id: p.id, nome: p.name, membros: porPos[p.id] || [] })),
        sem_posicao: semPos[t.id] || [],
      }));
    res.json(out);
  } catch (e) { console.error('[totemKids] kids-equipe:', e.message); res.status(500).json({ error: 'Erro ao carregar equipe' }); }
});


router.get('/kids-equipe/buscar', authorizeModule('kids', 1), async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (q.length < 2) return res.json([]);
    const { data } = await supabase.from('vol_profiles')
      .select('id, full_name, phone, email, avatar_url, membresia_id')
      .ilike('full_name', `%${q.replace(/[%_,]/g, '')}%`).limit(12);
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: 'Erro na busca' }); }
});


router.post('/kids-equipe/membro', authorizeModule('kids', 3), async (req, res) => {
  try {
    const { team_id, position_id, vol_profile_id, nome } = req.body || {};
    if (!team_id || !vol_profile_id || !nome) return res.status(400).json({ error: 'Dados incompletos' });
    let dup = supabase.from('vol_team_members').select('id').eq('team_id', team_id).eq('volunteer_profile_id', vol_profile_id).eq('is_active', true);
    dup = position_id ? dup.eq('position_id', position_id) : dup.is('position_id', null);
    const { data: existe } = await dup.maybeSingle();
    if (existe) return res.status(409).json({ error: 'Voluntário já está nessa posição' });
    const { data, error } = await supabase.from('vol_team_members').insert({
      team_id, position_id: position_id || null, volunteer_profile_id: vol_profile_id,
      volunteer_name: String(nome).trim(), is_active: true,
    }).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) { console.error('[totemKids] kids-equipe add:', e.message); res.status(500).json({ error: 'Erro ao alocar' }); }
});


router.delete('/kids-equipe/membro/:id', authorizeModule('kids', 3), async (req, res) => {
  try {
    const { error } = await supabase.from('vol_team_members').update({ is_active: false }).eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao remover' }); }
});


router.get('/kids-equipe/membro/:volProfileId/ficha', authorizeModule('kids', 1), async (req, res) => {
  try {
    const { data: p } = await supabase.from('vol_profiles')
      .select('id, full_name, email, phone, cpf, avatar_url, membresia_id, profile_complete').eq('id', req.params.volProfileId).maybeSingle();
    if (!p) return res.status(404).json({ error: 'Voluntário não encontrado' });
    let antecedentes = null;
    if (p.membresia_id) {
      const { data: bc } = await supabase.from('vol_background_checks')
        .select('status, resultado, consulta_em, revisado_em, area').eq('membro_id', p.membresia_id).is('deleted_at', null)
        .order('created_at', { ascending: false }).limit(1);
      antecedentes = (bc || [])[0] || null;
    }
    const teams = await kidsTeamsList();
    const teamIds = teams.map((t) => t.id);
    let posicoes = [];
    if (teamIds.length) {
      const { data: tm } = await supabase.from('vol_team_members')
        .select('team_id, position_id').eq('volunteer_profile_id', p.id).eq('is_active', true).in('team_id', teamIds);
      const posIds = (tm || []).map((m) => m.position_id).filter(Boolean);
      const { data: posRows } = posIds.length
        ? await supabase.from('vol_positions').select('id, name').in('id', posIds)
        : { data: [] };
      const posMap = Object.fromEntries((posRows || []).map((r) => [r.id, r.name]));
      const teamMap = Object.fromEntries(teams.map((t) => [t.id, limparTime(t.name)]));
      posicoes = (tm || []).map((m) => ({ time: teamMap[m.team_id], posicao: m.position_id ? posMap[m.position_id] : null }));
    }
    res.json({ perfil: p, antecedentes, posicoes });
  } catch (e) { console.error('[totemKids] ficha equipe:', e.message); res.status(500).json({ error: 'Erro na ficha' }); }
});





async function localizacoesKidsPatrimonio() {
  const ors = ['nome.ilike.*kid*', 'nome.ilike.*infantil*', 'nome.ilike.*maternal*', 'nome.ilike.*berç*', 'nome.ilike.*baby*', 'nome.ilike.*little*', 'nome.ilike.*elevate*'].join(',');
  const { data } = await supabase.from('pat_localizacoes').select('id, nome').or(ors).order('nome');
  return (data || []).filter((l) => l.nome && !/^kids(\s·|$)/i.test(String(l.nome).trim()));
}


router.get('/salas/localizacoes-kids', authorizeModule('kids', 1), async (req, res) => {
  try {
    const locs = await localizacoesKidsPatrimonio();
    const { data: salas } = await supabase.from('kids_salas').select('pat_localizacao_id');
    const linkadas = new Set((salas || []).map((s) => s.pat_localizacao_id).filter(Boolean));
    res.json(locs.map((l) => ({ ...l, tem_sala: linkadas.has(l.id) })));
  } catch (e) { console.error('[totemKids] loc-kids:', e.message); res.status(500).json({ error: 'Erro ao listar localizações' }); }
});


router.post('/salas/sincronizar-patrimonio', authorizeModule('kids', 3), async (req, res) => {
  try {
    const locs = await localizacoesKidsPatrimonio();
    const { data: salas } = await supabase.from('kids_salas').select('pat_localizacao_id, ordem');
    const linkadas = new Set((salas || []).map((s) => s.pat_localizacao_id).filter(Boolean));
    let ordem = Math.max(0, ...(salas || []).map((s) => s.ordem || 0));
    const novas = locs.filter((l) => !linkadas.has(l.id));
    if (!novas.length) return res.json({ criadas: 0, ja_linkadas: linkadas.size, total_loc: locs.length });
    const rows = novas.map((l) => ({ nome: l.nome, pat_localizacao_id: l.id, cor: '#00B39D', ordem: ++ordem }));
    const { error } = await supabase.from('kids_salas').insert(rows);
    if (error) throw error;
    res.json({ criadas: rows.length, ja_linkadas: linkadas.size, total_loc: locs.length });
  } catch (e) { console.error('[totemKids] sync salas:', e.message); res.status(500).json({ error: 'Erro ao sincronizar' }); }
});


router.patch('/salas/:id/localizacao', authorizeModule('kids', 3), async (req, res) => {
  try {
    const locId = req.body?.localizacao_id || null;
    const { data, error } = await supabase.from('kids_salas')
      .update({ pat_localizacao_id: locId }).eq('id', req.params.id).select('id, pat_localizacao_id').single();
    if (error) throw error;
    res.json(data);
  } catch (e) { console.error('[totemKids] link sala loc:', e.message); res.status(500).json({ error: 'Erro ao vincular localização' }); }
});


router.get('/estoque', authorizeModule('kids', 1), async (req, res) => {
  try {
    const { data: salas } = await supabase.from('kids_salas')
      .select('id, nome, cor, ordem, pat_localizacao_id').eq('ativo', true).order('ordem', { ascending: true });
    const { data: itens } = await supabase.from('kids_estoque')
      .select('id, sala_id, nome, categoria, unidade, qtd_esperada, qtd_atual, pat_bem_id, observacao')
      .is('deleted_at', null).order('categoria', { ascending: true });
    const porSala = {};
    (itens || []).forEach((i) => { (porSala[i.sala_id] = porSala[i.sala_id] || []).push(i); });

    const locIds = [...new Set((salas || []).map((s) => s.pat_localizacao_id).filter(Boolean))];
    const patPorLoc = {};
    if (locIds.length) {
      const { data: bens } = await supabase.from('pat_bens')
        .select('id, nome, status, numero_serie, marca, modelo, localizacao_id, pat_categorias(nome)')
        .in('localizacao_id', locIds).order('nome');
      (bens || []).forEach((b) => { (patPorLoc[b.localizacao_id] = patPorLoc[b.localizacao_id] || []).push(b); });
    }
    res.json((salas || []).map((s) => {
      const list = porSala[s.id] || [];
      const faltando = list.filter((i) => (i.qtd_atual || 0) < (i.qtd_esperada || 0)).length;
      const patrimonio = s.pat_localizacao_id ? (patPorLoc[s.pat_localizacao_id] || []) : [];
      return { ...s, itens: list, faltando, total_itens: list.length, patrimonio };
    }));
  } catch (e) { console.error('[totemKids] estoque:', e.message); res.status(500).json({ error: 'Erro ao carregar estoque' }); }
});


router.post('/salas/:salaId/estoque', authorizeModule('kids', 2), async (req, res) => {
  try {
    const { nome, categoria, unidade, qtd_esperada, qtd_atual, observacao } = req.body || {};
    if (!nome) return res.status(400).json({ error: 'Nome do item é obrigatório' });
    const { data, error } = await supabase.from('kids_estoque').insert({
      sala_id: req.params.salaId, nome: String(nome).trim(),
      categoria: categoria || null, unidade: unidade || 'un',
      qtd_esperada: Number(qtd_esperada) || 0, qtd_atual: Number(qtd_atual) || 0,
      observacao: observacao || null, created_by: req.user?.userId || null,
    }).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) { console.error('[totemKids] estoque add:', e.message); res.status(500).json({ error: 'Erro ao adicionar item' }); }
});


router.patch('/estoque/:id', authorizeModule('kids', 2), async (req, res) => {
  try {
    const upd = {};
    for (const k of ['nome', 'categoria', 'unidade', 'qtd_esperada', 'qtd_atual', 'observacao', 'ativo']) if (k in req.body) upd[k] = req.body[k];
    upd.updated_at = new Date().toISOString();
    const { data, error } = await supabase.from('kids_estoque').update(upd).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao editar item' }); }
});


router.delete('/estoque/:id', authorizeModule('kids', 3), async (req, res) => {
  try {
    const { error } = await supabase.from('kids_estoque').update({ deleted_at: new Date().toISOString() }).eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao remover item' }); }
});


router.post('/estoque/:id/patrimonio', authorizeModule('kids', 3), async (req, res) => {
  try {
    const { data: item } = await supabase.from('kids_estoque')
      .select('id, nome, observacao, pat_bem_id, sala_id').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!item) return res.status(404).json({ error: 'Item não encontrado' });
    if (item.pat_bem_id) return res.status(409).json({ error: 'Item já está no patrimônio' });
    const { data: sala } = await supabase.from('kids_salas').select('nome').eq('id', item.sala_id).maybeSingle();
    const salaNome = sala?.nome || 'Kids';

    const { data: cat } = await supabase.from('pat_categorias').select('id').ilike('nome', 'kids').limit(1).maybeSingle();

    let { data: parent } = await supabase.from('pat_localizacoes').select('id').ilike('nome', 'Kids').is('pai_id', null).limit(1).maybeSingle();
    if (!parent) { const r = await supabase.from('pat_localizacoes').insert({ nome: 'Kids' }).select('id').single(); parent = r.data; }
    const locNome = `Kids · ${salaNome}`;
    let { data: loc } = await supabase.from('pat_localizacoes').select('id').ilike('nome', locNome).limit(1).maybeSingle();
    if (!loc) { const r = await supabase.from('pat_localizacoes').insert({ nome: locNome, pai_id: parent?.id || null }).select('id').single(); loc = r.data; }
    const { data: bem, error } = await supabase.from('pat_bens').insert({
      nome: item.nome, categoria_id: cat?.id || null, localizacao_id: loc?.id || null,
      status: 'ativo', observacoes: item.observacao || `Item do Kids · sala ${salaNome}`,
      created_by: req.user?.userId || null,
    }).select('id').single();
    if (error) throw error;
    await supabase.from('kids_estoque').update({ pat_bem_id: bem.id, updated_at: new Date().toISOString() }).eq('id', item.id);
    res.json({ ok: true, pat_bem_id: bem.id });
  } catch (e) { console.error('[totemKids] estoque->patrimonio:', e.message); res.status(500).json({ error: 'Erro ao registrar no patrimônio' }); }
});



async function lideresKidsComTelefone() {
  const filtro = process.env.KIDS_LIDERES_FILTRO;
  if (!filtro) return [];
  const grupos = (process.env.KIDS_LIDERES_DEDUP || '').split(',').map(v => v.trim().toLowerCase()).filter(Boolean);
  const { data } = await supabase.from('mem_membros')
    .select('id, nome, telefone')
    .or(filtro)
    .not('telefone', 'is', null).is('deleted_at', null);
  const seen = new Set(); const out = [];
  (data || []).forEach((m) => {
    const n = (m.nome || '').toLowerCase();
    const key = grupos.find(grupo => n.includes(grupo)) || 'demais';
    if (!seen.has(key)) { seen.add(key); out.push(m); }
  });
  return out;
}

async function gerarResumoKids(sessaoId, { exemplo = false } = {}) {
  let culto = { nome: 'Domingo 10:00', data: null };
  let totalCriancas = 0, decisoes = 0, porSala = [], voluntarios = [];
  if (exemplo) {
    culto = { nome: 'Domingo 10:00', data: new Date().toISOString().slice(0, 10) };
    totalCriancas = 23; decisoes = 2;
    porSala = [{ sala: 'Berçário', n: 4 }, { sala: 'Maternal', n: 6 }, { sala: 'Infantil 1', n: 8 }, { sala: 'Infantil 2', n: 5 }];
    voluntarios = ['Pessoa Exemplo A · Coordenação', 'Pessoa Exemplo B · Recepção', 'Pessoa Exemplo C · Berçário'];
  } else if (sessaoId) {
    const { data: sessao } = await supabase.from('kids_sessoes').select('id, culto:cultos(nome, data)').eq('id', sessaoId).maybeSingle();
    if (sessao?.culto) culto = sessao.culto;
    const { data: cis } = await supabase.from('kids_checkins').select('sala_id, fez_decisao_jesus').eq('sessao_id', sessaoId).is('deleted_at', null);
    totalCriancas = (cis || []).length;
    decisoes = (cis || []).filter((c) => c.fez_decisao_jesus).length;
    const salaCount = {};
    (cis || []).forEach((c) => { if (c.sala_id) salaCount[c.sala_id] = (salaCount[c.sala_id] || 0) + 1; });
    const { data: salas } = await supabase.from('kids_salas').select('id, nome');
    const nomeSala = Object.fromEntries((salas || []).map((s) => [s.id, s.nome]));
    porSala = Object.entries(salaCount).map(([id, n]) => ({ sala: nomeSala[id] || 'Sala', n }));
  }
  const dataFmt = culto.data ? new Date(culto.data + 'T00:00:00').toLocaleDateString('pt-BR') : '';
  const linhas = [
    `🧒 *Resumo do Kids*${exemplo ? ' (exemplo)' : ''}`,
    `${culto.nome}${dataFmt ? ` · ${dataFmt}` : ''}`,
    '',
    `👶 Crianças no check-in: *${totalCriancas}*`,
    `✝️ Decisões de fé: *${decisoes}*`,
  ];
  if (porSala.length) { linhas.push('', '*Por sala:*'); porSala.forEach((s) => linhas.push(`• ${s.sala}: ${s.n}`)); }
  if (voluntarios.length) { linhas.push('', '*Voluntários:*'); voluntarios.forEach((v) => linhas.push(`• ${v}`)); }
  linhas.push('', '_CBRio · enviado ao fim de cada culto com Kids._');
  const detalheParts = [];
  if (porSala.length) detalheParts.push(porSala.map((s) => `${s.sala} ${s.n}`).join(', '));
  if (voluntarios.length) detalheParts.push(`Voluntários: ${voluntarios.join(', ')}`);
  const params = [
    `${culto.nome}${dataFmt ? ` · ${dataFmt}` : ''}`,
    String(totalCriancas),
    String(decisoes),
    detalheParts.join(' · ') || 'sem registros',
  ];
  return { texto: linhas.join('\n'), params };
}




async function enviarResumoWpp(telefone, { texto, params }) {
  const tpl = process.env.WHATSAPP_TEMPLATE_KIDS_RESUMO;
  if (tpl) {

    const { enfileirar } = require('../services/whatsappFila');
    const r = await enfileirar({
      telefone, template: tpl, params,
      idioma: process.env.WHATSAPP_TEMPLATE_KIDS_RESUMO_LANG || 'pt_BR',
      contexto: 'kids.resumo_dia',
    });
    return { ok: !!(r.sent || r.queued), message_id: r.messageId || null, error: r.sent || r.queued ? null : (r.reason || 'erro') };
  }
  return enviarTextoWpp(telefone, texto);
}


router.post('/resumo/exemplo', authorizeModule('kids', 1), async (req, res) => {
  try {
    const { texto, params } = await gerarResumoKids(null, { exemplo: true });
    let telefone = req.body?.telefone || null;
    if (!telefone && req.user?.userId) {
      const { data: prof } = await supabase.from('profiles').select('email, membro_id').eq('id', req.user.userId).maybeSingle();
      if (prof?.membro_id) { const { data: m } = await supabase.from('mem_membros').select('telefone').eq('id', prof.membro_id).maybeSingle(); telefone = m?.telefone || null; }
      if (!telefone && prof?.email) { const { data: m } = await supabase.from('mem_membros').select('telefone').ilike('email', prof.email).is('deleted_at', null).not('telefone', 'is', null).limit(1).maybeSingle(); telefone = m?.telefone || null; }
    }
    if (!telefone) return res.status(400).json({ error: 'Você não tem telefone cadastrado na Membresia.' });
    const r = await enviarResumoWpp(telefone, { texto, params });
    if (!r?.ok) return res.status(502).json({ error: 'O WhatsApp não enviou — a janela de 24h pode ter fechado. Mande qualquer mensagem pro bot (21 99907-9031) e tente de novo.', preview: texto });
    res.json({ ok: true, telefone, preview: texto });
  } catch (e) { console.error('[totemKids] resumo exemplo:', e.message); res.status(500).json({ error: 'Erro ao enviar exemplo' }); }
});



router.get('/frequencia-sistema', authorizeModule('kids', 1), async (req, res) => {
  try {
    const data = String(req.query.data || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return res.status(400).json({ error: 'Data inválida' });

    const { data: cultos } = await supabase.from('cultos').select('id, nome, data').eq('data', data);
    if (!cultos || cultos.length === 0) return res.json({ data, total_criancas: 0, total_checkins: 0, por_culto: [] });
    const cultoIds = cultos.map(c => c.id);
    const nomeCulto = Object.fromEntries(cultos.map(c => [c.id, c.nome]));

    const { data: sessoes } = await supabase.from('kids_sessoes').select('id, culto_id').in('culto_id', cultoIds);
    if (!sessoes || sessoes.length === 0) return res.json({ data, total_criancas: 0, total_checkins: 0, por_culto: [] });
    const sessaoCulto = Object.fromEntries(sessoes.map(s => [s.id, s.culto_id]));

    const { data: checkins } = await supabase.from('kids_checkins')
      .select('id, sessao_id, crianca_id, checkin_at, checkout_at, codigo_seguranca, responsavel_checkin_nome, crianca:kids_criancas(id, nome, data_nascimento)')
      .in('sessao_id', sessoes.map(s => s.id))
      .is('deleted_at', null)
      .order('checkin_at', { ascending: true });

    const horaBRT = (iso) => {
      if (!iso) return '';
      const d = new Date(new Date(iso).getTime() - 3 * 3600 * 1000);
      return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
    };

    const porCultoMap = {};
    const criancasDistintas = new Set();
    for (const ck of (checkins || [])) {
      const cultoId = sessaoCulto[ck.sessao_id];
      if (!cultoId) continue;
      if (!porCultoMap[cultoId]) porCultoMap[cultoId] = { culto_id: cultoId, nome: nomeCulto[cultoId] || 'Culto', total: 0, criancas: [] };
      const cr = Array.isArray(ck.crianca) ? ck.crianca[0] : ck.crianca;
      porCultoMap[cultoId].criancas.push({
        crianca_id: ck.crianca_id,
        nome: cr?.nome || '—',
        hora: horaBRT(ck.checkin_at),
        codigo: ck.codigo_seguranca || null,
        saiu: !!ck.checkout_at,
        trazida_por: ck.responsavel_checkin_nome || null,
      });
      porCultoMap[cultoId].total++;
      if (ck.crianca_id) criancasDistintas.add(ck.crianca_id);
    }

    res.json({
      data,
      total_criancas: criancasDistintas.size,
      total_checkins: (checkins || []).length,
      por_culto: Object.values(porCultoMap),
    });
  } catch (e) {
    console.error('[totemKids] frequencia-sistema:', e.message);
    res.status(500).json({ error: 'Erro ao buscar check-ins do sistema' });
  }
});






router.get('/comparativo-mes', authorizeModule('kids', 1), async (req, res) => {
  try {
    const mes = String(req.query.mes || '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(mes)) return res.status(400).json({ error: 'Mês inválido (use YYYY-MM)' });
    const [y, m] = mes.split('-').map(Number);
    const inicio = `${mes}-01`;
    const fim = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);

    const { data: cultos, error } = await supabase.from('cultos')
      .select('id, nome, data, presencial_kids, vol_service_types(name, recurrence_time, has_kids)')
      .gte('data', inicio).lte('data', fim)
      .order('data', { ascending: true });
    if (error) throw error;



    const totemPorCulto = {};
    const cultoIds = (cultos || []).map(c => c.id);
    if (cultoIds.length) {
      const { data: sess } = await supabase.from('kids_sessoes')
        .select('id, culto_id').in('culto_id', cultoIds);
      const sessCulto = Object.fromEntries((sess || []).map(s => [s.id, s.culto_id]));
      const sessIds = (sess || []).map(s => s.id);
      if (sessIds.length) {
        const vistos = {};
        let from = 0;
        while (true) {
          const { data: cks, error: eCk } = await supabase.from('kids_checkins')
            .select('sessao_id, crianca_id').in('sessao_id', sessIds)
            .is('deleted_at', null).range(from, from + 999);
          if (eCk) throw eCk;
          for (const ck of cks || []) {
            const cid = sessCulto[ck.sessao_id];
            if (!cid || !ck.crianca_id) continue;
            (vistos[cid] = vistos[cid] || new Set()).add(ck.crianca_id);
          }
          if (!cks || cks.length < 1000) break;
          from += 1000;
        }
        for (const [cid, set] of Object.entries(vistos)) totemPorCulto[cid] = set.size;
      }
    }

    const lista = (cultos || []).map(c => ({
      culto_id: c.id,
      nome: c.nome || c.vol_service_types?.name || 'Culto',
      data: c.data,
      hhmm: (c.vol_service_types?.recurrence_time || '').slice(0, 5) || null,
      has_kids: !!c.vol_service_types?.has_kids,
      presencial_kids: c.presencial_kids ?? null,
      checkins_totem: totemPorCulto[c.id] ?? 0,
    }));
    res.json({ mes, inicio, fim, cultos: lista, datas: [...new Set(lista.map(c => c.data))] });
  } catch (e) {
    console.error('[totemKids] comparativo-mes:', e.message);
    res.status(500).json({ error: 'Erro ao montar o comparativo do mês' });
  }
});



const RESUMO_KIDS_EMAILS = (process.env.KIDS_RESUMO_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);


async function totalKidsTotem(cultoId) {
  const { data: sessoes } = await supabase.from('kids_sessoes').select('id').eq('culto_id', cultoId);
  const sessIds = (sessoes || []).map((s) => s.id);
  if (!sessIds.length) return 0;
  const uniq = new Set();
  let from = 0;
  while (true) {
    const { data: cis } = await supabase.from('kids_checkins')
      .select('crianca_id').in('sessao_id', sessIds).is('deleted_at', null)
      .range(from, from + 999);
    for (const ci of cis || []) if (ci.crianca_id) uniq.add(ci.crianca_id);
    if (!cis || cis.length < 1000) break;
    from += 1000;
  }
  return uniq.size;
}


async function dispararResumoKidsCulto(culto, total) {
  const dataFmt = culto.data ? new Date(culto.data + 'T00:00:00').toLocaleDateString('pt-BR') : '';
  const detalhe = 'Check-ins do totem';
  const linhas = [
    '🧒 *Resumo do Kids*',
    `${culto.nome}${dataFmt ? ` · ${dataFmt}` : ''}`,
    '',
    `👶 Crianças no check-in: *${total}*`,
    '',
    `_${detalhe} · confira a lista em /ministerial/totem-kids/frequencia_`,
  ];
  const texto = linhas.join('\n');
  const params = [`${culto.nome}${dataFmt ? ` · ${dataFmt}` : ''}`, String(total), '—', detalhe];

  const lideres = await lideresKidsComTelefone();
  for (const l of lideres) { await enviarResumoWpp(l.telefone, { texto, params }).catch(() => {}); }

  let targetIds;
  try {
    const { data: alvos } = await supabase.from('profiles').select('id').in('email', RESUMO_KIDS_EMAILS);
    targetIds = (alvos || []).map(a => a.id);
  } catch {                               }
  await notificar({
    modulo: 'kids', tipo: 'resumo_kids',
    titulo: 'Resumo do Kids (fim de culto)',
    mensagem: texto.replace(/\*/g, '').replace(/_/g, ''),
    link: '/ministerial/totem-kids/frequencia', severidade: 'info', email: true,
    chaveDedup: `resumo_kids_${culto.id}`,
    targetIds: targetIds && targetIds.length ? targetIds : undefined,
  }).catch(() => {});
}










router.get('/cron/resumo-kids', async (req, res) => {
  if (!isAuthorizedCron(req)) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const agora = Date.now();
    const agoraBRT = new Date(agora - 3 * 3600 * 1000);
    const hoje = agoraBRT.toISOString().slice(0, 10);
    const ontem = new Date(agoraBRT.getTime() - 24 * 3600 * 1000).toISOString().slice(0, 10);




    const { data: cultos } = await supabase
      .from('cultos')
      .select('id, nome, data, presencial_kids, kids_resumo_enviado_at, vol_service_types(recurrence_time, has_kids)')
      .in('data', [ontem, hoje]);


    const terminados = (cultos || []).filter((c) => {
      if (!c.vol_service_types?.has_kids) return false;
      const hhmm = (c.vol_service_types.recurrence_time || '').slice(0, 5);
      if (!hhmm) return false;
      const inicio = new Date(`${c.data}T${hhmm}:00-03:00`).getTime();
      return agora >= inicio + 90 * 60 * 1000;
    });
    const pendentes = terminados.filter((c) => !c.kids_resumo_enviado_at);
    const reconciliar = terminados.filter((c) => c.kids_resumo_enviado_at);
    if (!pendentes.length && !reconciliar.length) {
      return res.json({ ok: true, enviados: 0, motivo: 'nenhum culto pendente' });
    }

    let enviados = 0;
    const detalhe = [];
    for (const c of pendentes) {
      const total = await totalKidsTotem(c.id);
      if (total <= 0) continue;
      await supabase.from('cultos')
        .update({ presencial_kids: total, kids_resumo_enviado_at: new Date().toISOString() })
        .eq('id', c.id);
      await dispararResumoKidsCulto(c, total);
      enviados += 1;
      detalhe.push({ culto: c.nome, total });
    }



    let reconciliados = 0;
    for (const c of reconciliar) {
      const total = await totalKidsTotem(c.id);
      if (total > 0 && total !== c.presencial_kids) {
        await supabase.from('cultos').update({ presencial_kids: total }).eq('id', c.id);
        reconciliados += 1;
        detalhe.push({ culto: c.nome, total, reconciliado: true, antes: c.presencial_kids });
      }
    }

    res.json({ ok: true, enviados, reconciliados, detalhe });
  } catch (e) {
    console.error('[totemKids] cron resumo-kids:', e.message);
    res.status(500).json({ error: e.message || 'Erro no resumo do Kids' });
  }
});



router.get('/batismos', authorizeModule('kids', 1), async (req, res) => {
  try {
    const corte = new Date(); corte.setFullYear(corte.getFullYear() - 13);
    const corteISO = corte.toISOString().slice(0, 10);
    const { data } = await supabase.from('batismo_inscricoes')
      .select('id, nome, sobrenome, data_nascimento, telefone, email, status, data_batismo, horario_culto, possui_deficiencia, deficiencia_descricao, observacoes, created_at, membro_id')
      .is('deleted_at', null)
      .or(`eh_crianca.eq.true,data_nascimento.gte.${corteISO}`)
      .order('data_batismo', { ascending: true, nullsFirst: false })
      .limit(500);
    res.json(data || []);
  } catch (e) {
    console.error('[totemKids] batismos:', e.message);
    res.status(500).json({ error: 'Erro ao carregar batismos' });
  }
});





router.get('/batismos/todos', authorizeModule('kids', 1), async (_req, res) => {
  try {
    const { data } = await supabase.from('batismo_inscricoes')
      .select('id, nome, sobrenome, status, data_batismo, horario_culto, data_nascimento, eh_crianca, created_at')
      .is('deleted_at', null)
      .order('data_batismo', { ascending: false, nullsFirst: false })
      .limit(1000);
    res.json(data || []);
  } catch (e) {
    console.error('[totemKids] batismos todos:', e.message);
    res.status(500).json({ error: 'Erro ao carregar as turmas de batismo' });
  }
});





router.patch('/batismos/:id', authorizeModule('kids', 3), async (req, res) => {
  try {
    const corte = new Date(); corte.setFullYear(corte.getFullYear() - 13);
    const corteISO = corte.toISOString().slice(0, 10);
    const { data: insc } = await supabase.from('batismo_inscricoes')
      .select('id, eh_crianca, data_nascimento')
      .eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!insc) return res.status(404).json({ error: 'Inscrição não encontrada' });
    const ehCrianca = insc.eh_crianca || (insc.data_nascimento && insc.data_nascimento >= corteISO);
    if (!ehCrianca) {
      return res.status(403).json({ error: 'Inscrição de adulto — gerencie pela Integração' });
    }

    const STATUS_OK = ['pendente', 'confirmado', 'realizado', 'cancelado'];
    const payload = { updated_at: new Date().toISOString() };
    if (req.body?.status !== undefined) {
      if (!STATUS_OK.includes(req.body.status)) return res.status(400).json({ error: 'Status inválido' });
      payload.status = req.body.status;
    }
    if (req.body?.data_batismo !== undefined) payload.data_batismo = req.body.data_batismo || null;
    if (req.body?.observacoes !== undefined) {
      payload.observacoes = req.body.observacoes ? String(req.body.observacoes).trim() : null;
    }
    const { data, error } = await supabase.from('batismo_inscricoes')
      .update(payload).eq('id', req.params.id)
      .select('id, status, data_batismo, observacoes').single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[totemKids] batismo update:', e.message);
    res.status(500).json({ error: 'Erro ao atualizar batismo' });
  }
});


router.get('/apresentacoes', authorizeModule('kids', 1), async (req, res) => {
  try {







    const BASE = 'id, nome_pai, nome_mae, crianca_nome, crianca_idade, crianca_data_nascimento, crianca_sexo, telefone, data_apresentacao, status, observacoes, origem, crianca_id, created_at';









    const OPCIONAIS = ['horario_culto', 'presente_em', 'foto_storage_path'];
    const listar = (cols) => {
      let q = supabase.from('apresentacao_criancas')
        .select(cols.length ? `${BASE}, ${cols.join(', ')}` : BASE)
        .is('deleted_at', null)
        .order('data_apresentacao', { ascending: false, nullsFirst: false });
      if (cols.includes('horario_culto')) q = q.order('horario_culto', { ascending: true, nullsFirst: false });
      return q.order('created_at', { ascending: false }).limit(1000);
    };
    let cols = [...OPCIONAIS];
    let { data, error } = await listar(cols);
    while (error && error.code === '42703' && cols.length) {
      const faltando = cols.find((c) => (error.message || "").includes(c)) || cols[cols.length - 1];
      console.warn(`[totemKids] apresentacoes: coluna ${faltando} ausente (migration não aplicada) — listando sem ela`);
      cols = cols.filter((c) => c !== faltando);
      ({ data, error } = await listar(cols));
    }
    if (error) throw error;




    const linhas = (data || []).map(({ foto_storage_path, ...r }) => ({
      ...r, tem_foto: Boolean(foto_storage_path),
    }));
    res.json(linhas);
  } catch (e) {
    console.error('[totemKids] apresentacoes:', e.message);
    res.status(500).json({ error: 'Erro ao carregar apresentações' });
  }
});







function _proximoSegundoDomingoKids() {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const seg = (y, m) => { const p1 = new Date(y, m, 1); return new Date(y, m, 1 + ((7 - p1.getDay()) % 7) + 7); };
  let y = hoje.getFullYear(), m = hoje.getMonth();
  let d = seg(y, m);
  if (d < hoje) { m += 1; if (m > 11) { y += 1; m = 0; } d = seg(y, m); }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}


router.get('/apresentacoes/horarios', authorizeModule('kids', 1), async (req, res) => {
  try {
    const data = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.data || '')) ? String(req.query.data) : _proximoSegundoDomingoKids();
    const [horarios, ocup, semH] = await Promise.all([
      apresHorariosConfigurados(),
      apresOcupacaoPorHorario(data),
      supabase.from('apresentacao_criancas').select('id', { count: 'exact', head: true })
        .eq('data_apresentacao', data).is('horario_culto', null).is('deleted_at', null).neq('status', 'cancelado'),
    ]);
    if (horarios === null) return res.status(500).json({ error: 'Não consegui ler os horários' });
    res.json({
      data_apresentacao: data,
      horarios: horarios.map((h) => ({ ...h, inscritos: ocup[h.horario] || 0 })),


      sem_horario: semH.count || 0,
    });
  } catch (e) {
    console.error('[totemKids] apresentacoes/horarios:', e.message);
    res.status(500).json({ error: 'Erro ao listar horários' });
  }
});


router.post('/apresentacoes/horarios', authorizeModule('kids', 3), async (req, res) => {
  try {
    const horario = String(req.body?.horario || '').trim().slice(0, 40);
    if (!/^\d{2}:\d{2}$/.test(horario)) return res.status(400).json({ error: 'Horário no formato HH:MM (ex.: 09:30)' });
    const label = String(req.body?.label || '').trim().slice(0, 120)
      || `Culto das ${horario.replace(/^0/, '').replace(':00', 'h').replace(':', 'h')}`;
    const limite = req.body?.limite != null && req.body.limite !== '' ? parseInt(req.body.limite, 10) : null;
    const aberto = req.body?.aberto !== false;
    const ordem = Number.isFinite(+req.body?.ordem) ? +req.body.ordem : 99;
    const { data, error } = await supabase.from('apresentacao_horarios')
      .insert({ horario, label, limite: Number.isFinite(limite) ? Math.max(0, limite) : null, aberto, ordem })
      .select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    console.error('[totemKids] apresentacoes/horarios POST:', e.message);
    res.status(500).json({ error: e.code === '23505' ? 'Esse horário já existe' : 'Erro ao criar horário' });
  }
});


router.patch('/apresentacoes/horarios/:id', authorizeModule('kids', 3), async (req, res) => {
  try {
    const upd = { updated_at: new Date().toISOString() };
    if (typeof req.body?.aberto === 'boolean') upd.aberto = req.body.aberto;
    if (req.body?.label != null) upd.label = String(req.body.label).trim().slice(0, 120);
    if ('limite' in (req.body || {})) {
      const l = req.body.limite;
      upd.limite = (l === null || l === '') ? null : (Number.isFinite(+l) ? Math.max(0, parseInt(l, 10)) : null);
    }
    if (Number.isFinite(+req.body?.ordem)) upd.ordem = +req.body.ordem;
    const { data, error } = await supabase.from('apresentacao_horarios')
      .update(upd).eq('id', req.params.id).is('deleted_at', null).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[totemKids] apresentacoes/horarios PATCH:', e.message);
    res.status(500).json({ error: 'Erro ao atualizar horário' });
  }
});



router.delete('/apresentacoes/horarios/:id', authorizeModule('kids', 4), async (req, res) => {
  try {
    const { error } = await supabase.from('apresentacao_horarios')
      .update({ deleted_at: new Date().toISOString() }).eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('[totemKids] apresentacoes/horarios DELETE:', e.message);
    res.status(500).json({ error: 'Erro ao remover horário' });
  }
});








router.get('/apresentacoes/:id', authorizeModule('kids', 1), async (req, res) => {
  try {
    const { data: insc, error } = await supabase.from('apresentacao_criancas')
      .select('*').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (error) throw error;
    if (!insc) return res.status(404).json({ error: 'Inscrição não encontrada' });

    const [cons, kid, resp] = await Promise.all([
      supabase.from('inscricao_consentimentos')
        .select('tipo, aceito, texto, em, ip_origem, user_agent')
        .eq('porta', 'apresentacao').eq('ref_id', insc.id).is('deleted_at', null).order('em'),
      insc.crianca_id
        ? supabase.from('kids_criancas')
          .select('id, nome, data_nascimento, sexo, visitante, tem_alergia, alergia_qual, tem_espectro, espectro_qual, tem_limitacao_fisica, limitacao_fisica_qual, observacoes_internas')
          .eq('id', insc.crianca_id).maybeSingle()
        : Promise.resolve({ data: null }),
      insc.responsavel_membro_id
        ? supabase.from('mem_membros').select('id, nome, telefone, email, status').eq('id', insc.responsavel_membro_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);





    let fotoUrl = null;
    let fotoDownloadUrl = null;
    let fotoNome = null;
    if (insc.foto_storage_path) {
      fotoNome = nomeArquivoFoto(insc.crianca_nome, insc.data_apresentacao, extensaoDoCaminho(insc.foto_storage_path));
      const [ver, baixar] = await Promise.all([
        supabase.storage.from('kids-documentos').createSignedUrl(insc.foto_storage_path, 60 * 30),
        supabase.storage.from('kids-documentos').createSignedUrl(insc.foto_storage_path, 60 * 30, { download: fotoNome }),
      ]);
      fotoUrl = (ver.data && ver.data.signedUrl) || null;
      fotoDownloadUrl = (baixar.data && baixar.data.signedUrl) || null;
    }

    res.json({
      ...insc,
      foto_url: fotoUrl,
      foto_download_url: fotoDownloadUrl,
      foto_nome_arquivo: fotoNome,
      consentimentos: cons.data || [],
      crianca_kids: kid.data || null,
      responsavel_membro: resp.data || null,
    });
  } catch (e) {
    console.error('[totemKids] apresentacao detalhe:', e.message);
    res.status(500).json({ error: 'Erro ao carregar a ficha' });
  }
});

router.patch('/apresentacoes/:id', authorizeModule('kids', 3), async (req, res) => {
  try {


    const allowed = ['status', 'observacoes', 'data_apresentacao', 'crianca_idade', 'horario_culto', 'nome_pai', 'nome_mae'];
    const payload = { updated_at: new Date().toISOString() };
    for (const k of allowed) if (req.body[k] !== undefined) payload[k] = req.body[k];
    for (const k of ['nome_pai', 'nome_mae']) {
      if (k in payload) payload[k] = payload[k] ? (String(payload[k]).trim().replace(/\s+/g, ' ').slice(0, 200) || null) : null;
    }
    if ('horario_culto' in payload) {
      const h = payload.horario_culto ? String(payload.horario_culto).trim().slice(0, 40) : null;
      if (h && !/^\d{2}:\d{2}$/.test(h)) return res.status(400).json({ error: 'Horário no formato HH:MM' });
      payload.horario_culto = h;
    }
    const { data, error } = await supabase.from('apresentacao_criancas')
      .update(payload).eq('id', req.params.id).is('deleted_at', null)
      .select('id, status, observacoes, data_apresentacao, crianca_idade, horario_culto, nome_pai, nome_mae').single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[totemKids] apresentacao update:', e.message);
    res.status(500).json({ error: 'Erro ao atualizar apresentação' });
  }
});
















router.post('/apresentacoes/:id/checkin', authorizeModule('kids', 2), async (req, res) => {
  try {
    const marcar = req.body?.presente !== false;
    const patch = marcar
      ? { presente_em: new Date().toISOString(), presente_por: req.user?.id ?? null }
      : { presente_em: null, presente_por: null };



    let q = supabase.from('apresentacao_criancas')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', req.params.id).is('deleted_at', null);
    if (marcar) q = q.is('presente_em', null);
    const { data, error } = await q.select('id, presente_em').maybeSingle();



    if (error && error.code === '42703') {
      return res.status(409).json({ error: 'O check-in ainda não está disponível — falta aplicar a migration 20260915180000.' });
    }
    if (error) throw error;



    if (!data) {
      const { data: atual } = await supabase.from('apresentacao_criancas')
        .select('id, presente_em').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
      if (!atual) return res.status(404).json({ error: 'Inscrição não encontrada' });
      return res.json(atual);
    }
    res.json(data);
  } catch (e) {
    console.error('[totemKids] apresentacao checkin:', e.message);
    res.status(500).json({ error: 'Erro ao registrar o check-in' });
  }
});




















const uploadFotoApres = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => cb(null, Boolean(extensaoDeMime(file.mimetype))),
});

router.post('/apresentacoes/:id/foto', authorizeModule('kids', 2), uploadFotoApres.single('foto'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Envie uma imagem JPG, PNG ou WEBP de até 8MB.' });
    const ext = extensaoDeMime(req.file.mimetype);
    if (!ext) return res.status(400).json({ error: 'Formato não aceito. Use JPG, PNG ou WEBP.' });

    const { data: atual } = await supabase.from('apresentacao_criancas')
      .select('id, crianca_nome, data_apresentacao, foto_storage_path')
      .eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!atual) return res.status(404).json({ error: 'Inscrição não encontrada' });

    const caminho = `${PREFIXO_FOTO}${_uuidFoto()}.${ext}`;
    const { error: upErr } = await supabase.storage.from('kids-documentos')
      .upload(caminho, req.file.buffer, { contentType: req.file.mimetype, upsert: false });
    if (upErr) throw upErr;

    const { error: eUp } = await supabase.from('apresentacao_criancas').update({
      foto_storage_path: caminho,
      foto_enviada_em: new Date().toISOString(),
      foto_enviada_por: (req.user && (req.user.id || req.user.userId)) || null,
      updated_at: new Date().toISOString(),
    }).eq('id', req.params.id);



    if (eUp && eUp.code === '42703') {
      await supabase.storage.from('kids-documentos').remove([caminho]).catch(() => {});
      return res.status(409).json({ error: 'A foto ainda não está disponível — falta aplicar a migration 20260916140000.' });
    }
    if (eUp) throw eUp;

    if (atual.foto_storage_path && atual.foto_storage_path !== caminho) {
      await supabase.storage.from('kids-documentos').remove([atual.foto_storage_path]).catch(() => {});
    }

    const nome = nomeArquivoFoto(atual.crianca_nome, atual.data_apresentacao, ext);
    const [ver, baixar] = await Promise.all([
      supabase.storage.from('kids-documentos').createSignedUrl(caminho, 60 * 30),
      supabase.storage.from('kids-documentos').createSignedUrl(caminho, 60 * 30, { download: nome }),
    ]);
    res.json({
      foto_url: (ver.data && ver.data.signedUrl) || null,
      foto_download_url: (baixar.data && baixar.data.signedUrl) || null,
      foto_nome_arquivo: nome,
    });
  } catch (e) {
    console.error('[totemKids] apresentacao foto:', e.message);
    res.status(500).json({ error: 'Erro ao salvar a foto' });
  }
});



router.delete('/apresentacoes/:id/foto', authorizeModule('kids', 3), async (req, res) => {
  try {
    const { data: atual } = await supabase.from('apresentacao_criancas')
      .select('id, foto_storage_path').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!atual) return res.status(404).json({ error: 'Inscrição não encontrada' });
    const { error } = await supabase.from('apresentacao_criancas').update({
      foto_storage_path: null, foto_enviada_em: null, foto_enviada_por: null,
      updated_at: new Date().toISOString(),
    }).eq('id', req.params.id);
    if (error && error.code === '42703') return res.status(409).json({ error: 'A foto ainda não está disponível — falta aplicar a migration 20260916140000.' });
    if (error) throw error;
    if (atual.foto_storage_path) {
      await supabase.storage.from('kids-documentos').remove([atual.foto_storage_path]).catch(() => {});
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('[totemKids] apresentacao foto delete:', e.message);
    res.status(500).json({ error: 'Erro ao remover a foto' });
  }
});



router.use('/apresentacoes/:id/foto', (err, _req, res, _next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'A foto passa de 8MB. Envie uma versão menor.' });
  console.error('[totemKids] multer foto:', err && err.message);
  res.status(400).json({ error: 'Não conseguimos ler esse arquivo. Use JPG, PNG ou WEBP.' });
});

router.delete('/apresentacoes/:id', authorizeModule('kids', 4), async (req, res) => {
  try {
    const { error } = await supabase.rpc('app_soft_delete', {
      p_table_name: 'apresentacao_criancas', p_row_id: req.params.id, p_deleted_by: req.user?.id ?? null,
    });
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('[totemKids] apresentacao delete:', e.message);
    res.status(500).json({ error: 'Erro ao remover apresentação' });
  }
});




















router.get('/cadastros-novos', authorizeModule('kids', 1), async (req, res) => {
  try {
    const janela = resolverJanelaPeriodo({
      dias: req.query.dias, ano: req.query.ano,





      inicio: req.query.inicio, fim: req.query.fim,
      diasValidos: [7, 30, 90, 365], diasPadrao: 30,
    });

    const fimBRT = janela.fim || diaBRT(new Date().toISOString());
    const lim = limitesUtc(janela.inicio, fimBRT);
    if (!lim) return res.status(400).json({ error: 'Período inválido' });



    const linhas = await fetchCriancasPaginado(
      'id, nome, data_nascimento, visitante, created_at, created_by, deleted_at, planning_center_id',
      (q) => q.gte('created_at', lim.desde).lt('created_at', lim.ate),
    );



    const ids = linhas.map((l) => l.id);
    const comResp = new Set();
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await supabase.from('kids_responsaveis')
        .select('crianca_id').in('crianca_id', ids.slice(i, i + 200));
      (data || []).forEach((r) => comResp.add(r.crianca_id));
    }
    const enriquecidas = linhas.map((l) => ({ ...l, tem_responsavel: comResp.has(l.id) }));




    const autores = [...new Set(enriquecidas.map((l) => l.created_by).filter(Boolean))];
    const nomePorAutor = {};
    if (autores.length) {
      const { data } = await supabase.from('profiles').select('id, name').in('id', autores.slice(0, 200));
      (data || []).forEach((p) => { nomePorAutor[p.id] = p.name; });
    }

    const resumo = resumirCadastros(enriquecidas);
    const serie = serieDiaria(enriquecidas, janela.inicio, fimBRT);



    const TETO = 100;



    const vivas = enriquecidas.filter((l) => !l.deleted_at && !temMarcaDeImport(l))
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));

    const visitantes = vivas.filter((l) => l.visitante === true);

    res.json({
      janela: {
        inicio: janela.inicio, fim: fimBRT, dias: janela.dias, ano: janela.ano,
        livre: janela.livre === true,


        fim_ajustado: janela.fim_ajustado === true,
        rotulo: rotuloJanela(janela),
      },
      resumo,
      serie,

      hoje: serie.length ? serie[serie.length - 1].total : 0,
      ontem: serie.length > 1 ? serie[serie.length - 2].total : 0,
      criancas: vivas.slice(0, TETO).map((l) => ({
        id: l.id, nome: l.nome, data_nascimento: l.data_nascimento,
        visitante: l.visitante, dia: diaBRT(l.created_at),
        criado_por: l.created_by ? (nomePorAutor[l.created_by] || 'equipe') : null,
        tem_responsavel: l.tem_responsavel,
      })),
      truncado: vivas.length > TETO, mostrando: Math.min(vivas.length, TETO),



      visitantes: visitantes.slice(0, TETO).map((l) => ({
        id: l.id, nome: l.nome, data_nascimento: l.data_nascimento,
        dia: diaBRT(l.created_at),
        criado_por: l.created_by ? (nomePorAutor[l.created_by] || 'equipe') : null,
        tem_responsavel: l.tem_responsavel,
      })),
      visitantes_truncado: visitantes.length > TETO,
      visitantes_total: visitantes.length,
    });
  } catch (e) {


    console.error('[kids] cadastros-novos:', e.message);
    res.status(500).json({ error: 'Erro ao contar os cadastros', detalhe: e.message });
  }
});

router.get('/dashboard', authorizeModule('kids', 1), async (req, res) => {
  try {
    const corteBat = new Date(); corteBat.setFullYear(corteBat.getFullYear() - 13);
    const [ativas, pend, salas, sess, bat] = await Promise.all([
      supabase.from('kids_criancas').select('id', { count: 'exact', head: true }).eq('ativo', true).is('deleted_at', null),
      supabase.from('kids_vinculo_solicitacoes').select('id', { count: 'exact', head: true }).eq('status', 'pendente').is('deleted_at', null),
      supabase.from('kids_salas').select('id', { count: 'exact', head: true }),
      supabase.from('kids_sessoes').select('id', { count: 'exact', head: true }).eq('status', 'aberta').is('deleted_at', null),
      supabase.from('batismo_inscricoes').select('id', { count: 'exact', head: true }).is('deleted_at', null).neq('status', 'realizado').or(`eh_crianca.eq.true,data_nascimento.gte.${corteBat.toISOString().slice(0, 10)}`),
    ]);
    const { data: vinc } = await supabase.from('kids_vinculo_solicitacoes')
      .select('id, crianca_nome, solicitante_nome, solicitante_parentesco, created_at')
      .eq('status', 'pendente').is('deleted_at', null)
      .order('created_at', { ascending: false }).limit(8);


    const kids = await fetchCriancasPaginado('id, nome, data_nascimento, foto_url', q => q
      .eq('ativo', true).is('deleted_at', null).not('data_nascimento', 'is', null));
    const hoje = new Date();
    const dias = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(hoje); d.setDate(hoje.getDate() + i);
      dias.push(`${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    }
    const aniversariantes = (kids || [])
      .filter((k) => dias.includes(String(k.data_nascimento).slice(5, 10)))
      .map((k) => ({ id: k.id, nome: k.nome, data_nascimento: k.data_nascimento, foto_url: k.foto_url, responsaveis: [] }))
      .sort((a, b) => String(a.data_nascimento).slice(5).localeCompare(String(b.data_nascimento).slice(5)));



    const anivIds = aniversariantes.map((a) => a.id);
    if (anivIds.length) {
      const { data: resps } = await supabase.from('kids_responsaveis')
        .select('crianca_id, parentesco, membro_id').in('crianca_id', anivIds);
      const memIds = [...new Set((resps || []).map((r) => r.membro_id).filter(Boolean))];
      const memById = {};
      if (memIds.length) {
        const { data: mems } = await supabase.from('mem_membros')
          .select('id, nome, telefone').in('id', memIds);
        (mems || []).forEach((m) => { memById[m.id] = m; });
      }
      const ordemPar = { mae: 0, pai: 1 };
      const byCrianca = {};
      (resps || []).forEach((r) => {
        const m = r.membro_id ? memById[r.membro_id] : null;
        if (!m || (!m.nome && !m.telefone)) return;
        (byCrianca[r.crianca_id] = byCrianca[r.crianca_id] || []).push({
          parentesco: r.parentesco || 'responsavel', nome: m.nome || null, telefone: m.telefone || null,
        });
      });
      aniversariantes.forEach((a) => {
        a.responsaveis = (byCrianca[a.id] || [])
          .sort((x, y) => (ordemPar[x.parentesco] ?? 9) - (ordemPar[y.parentesco] ?? 9));
      });
    }
    res.json({
      resumo: {
        criancas_ativas: ativas.count || 0,
        vinculos_pendentes: pend.count || 0,
        salas: salas.count || 0,
        sessoes_abertas: sess.count || 0,
        aniversariantes_semana: aniversariantes.length,
        batismos_criancas: bat.count || 0,
      },
      vinculos: vinc || [],
      aniversariantes,
    });
  } catch (e) {
    console.error('[totemKids] dashboard:', e.message);
    res.status(500).json({ error: 'Erro ao carregar dashboard' });
  }
});




router.post('/criancas/:id/foto', authorizeModule('kids', 2), async (req, res) => {
  try {
    const { dataUrl } = req.body || {};
    const m = String(dataUrl || '').match(/^data:(image\/(png|jpe?g|webp));base64,(.+)$/);
    if (!m) return res.status(400).json({ error: 'Imagem inválida' });
    const mime = m[1];
    const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
    const buffer = Buffer.from(m[3], 'base64');
    if (buffer.length > 5 * 1024 * 1024) return res.status(413).json({ error: 'Imagem muito grande (máx 5MB)' });
    const path = `foto-crianca/${req.params.id}-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from('kids-documentos').upload(path, buffer, { contentType: mime, upsert: true });
    if (upErr) throw upErr;

    const { data: prev } = await supabase.from('kids_criancas').select('foto_storage_path').eq('id', req.params.id).maybeSingle();
    if (prev?.foto_storage_path && prev.foto_storage_path !== path) {
      await supabase.storage.from('kids-documentos').remove([prev.foto_storage_path]).catch(() => {});
    }
    await supabase.from('kids_criancas').update({
      foto_storage_path: path, foto_url: null,
      foto_consentimento_em: new Date().toISOString(), foto_consentimento_por: req.user?.userId || null,
      updated_at: new Date().toISOString(),
    }).eq('id', req.params.id);
    const { data: signed } = await supabase.storage.from('kids-documentos').createSignedUrl(path, 60 * 30);
    res.json({ foto_url: signed?.signedUrl || null });
  } catch (e) {
    console.error('[totemKids] foto upload:', e.message);
    res.status(500).json({ error: 'Erro ao salvar a foto' });
  }
});



router.post('/responsaveis/:membroId/foto', authorizeModule('kids', 2), async (req, res) => {
  try {
    const { dataUrl } = req.body || {};
    const m = String(dataUrl || '').match(/^data:(image\/(png|jpe?g|webp));base64,(.+)$/);
    if (!m) return res.status(400).json({ error: 'Imagem inválida' });
    const mime = m[1];
    const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
    const buffer = Buffer.from(m[3], 'base64');
    if (buffer.length > 5 * 1024 * 1024) return res.status(413).json({ error: 'Imagem muito grande (máx 5MB)' });
    const path = `membros/${req.params.membroId}.${ext}`;
    const { error: upErr } = await supabase.storage.from('fotos-membros').upload(path, buffer, { contentType: mime, upsert: true });
    if (upErr) throw upErr;
    const { data: urlData } = supabase.storage.from('fotos-membros').getPublicUrl(path);
    const foto_url = `${urlData.publicUrl}?t=${Date.now()}`;
    const { error: dbErr } = await supabase.from('mem_membros').update({ foto_url }).eq('id', req.params.membroId).is('deleted_at', null);
    if (dbErr) throw dbErr;
    res.json({ foto_url });
  } catch (e) {
    console.error('[totemKids] foto responsavel:', e.message);
    res.status(500).json({ error: 'Erro ao salvar a foto do responsável' });
  }
});


router.delete('/criancas/:id/foto', authorizeModule('kids', 2), async (req, res) => {
  try {
    const { data: c } = await supabase.from('kids_criancas').select('foto_storage_path').eq('id', req.params.id).maybeSingle();
    if (c?.foto_storage_path) await supabase.storage.from('kids-documentos').remove([c.foto_storage_path]).catch(() => {});
    await supabase.from('kids_criancas').update({ foto_storage_path: null, foto_url: null, foto_consentimento_em: null, updated_at: new Date().toISOString() }).eq('id', req.params.id);
    res.json({ ok: true });
  } catch (e) {
    console.error('[totemKids] foto remove:', e.message);
    res.status(500).json({ error: 'Erro ao remover a foto' });
  }
});




router.get('/criancas/:id/jornada', authorizeModule('kids', 1), async (req, res) => {
  try {
    const id = req.params.id;
    const { data: crianca } = await supabase.from('kids_criancas').select('familia_id').eq('id', id).maybeSingle();
    let familia_membros = [];
    if (crianca?.familia_id) {
      const { data: ms } = await supabase.from('mem_membros')
        .select('id, nome, telefone').eq('familia_id', crianca.familia_id).is('deleted_at', null).order('nome');
      familia_membros = ms || [];
    }


    const { data: cis } = await supabase.from('kids_checkins')
      .select('checkin_at, fez_decisao_jesus, decisao_jesus_em')
      .eq('crianca_id', id).is('deleted_at', null).order('checkin_at');
    const lista = cis || [];



    const diaBrt = (ts) => ts ? new Date(new Date(ts).getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10) : null;
    const diasSet = new Set();
    lista.forEach((c) => { const d = diaBrt(c.checkin_at); if (d) diasSet.add(d); });
    const dias = [...diasSet].sort();
    const total = dias.length;
    const ultima = dias.length ? dias[dias.length - 1] : null;
    const porMesMap = {};
    dias.forEach((ymd) => { porMesMap[ymd.slice(0, 7)] = (porMesMap[ymd.slice(0, 7)] || 0) + 1; });

    const porMes = Object.entries(porMesMap).map(([mes, total]) => ({ mes, total })).sort((a, b) => a.mes.localeCompare(b.mes));


    const porDia = dias.map((data, i) => ({ data, acumulado: i + 1 }));
    const dec = lista.filter((c) => c.fez_decisao_jesus).map((c) => c.decisao_jesus_em || c.checkin_at).filter(Boolean).sort();
    res.json({
      familia_membros,
      frequencia: { porMes, porDia, ultima, total },
      conversao_sugerida: dec.length ? String(dec[0]).slice(0, 10) : null,
    });
  } catch (e) {
    console.error('[totemKids] jornada:', e.message);
    res.status(500).json({ error: 'Erro ao carregar jornada' });
  }
});




router.get('/criancas/:id/analise-frequencia', authorizeModule('kids', 1), async (req, res) => {
  try {
    const { data: cr } = await supabase.from('kids_criancas')
      .select('nome, data_nascimento, data_conversao, data_batismo')
      .eq('id', req.params.id).maybeSingle();
    if (!cr) return res.status(404).json({ error: 'Criança não encontrada' });


    const { data: cis } = await supabase.from('kids_checkins')
      .select('checkin_at').eq('crianca_id', req.params.id)
      .is('deleted_at', null).order('checkin_at');
    const datas = [...new Set((cis || [])
      .map(c => c.checkin_at ? new Date(new Date(c.checkin_at).getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10) : null)
      .filter(Boolean))].sort();
    if (!datas.length) return res.json({ sem_dados: true, motivo: 'Sem check-ins registrados no sistema pra esta criança.' });

    const hoje = new Date();
    const diasDesde = (d) => Math.floor((hoje - new Date(d + 'T00:00:00')) / 86400000);
    const ultimo = datas[datas.length - 1];
    const primeiro = datas[0];
    const dias90 = datas.filter(d => diasDesde(d) <= 90).length;
    const dias90a180 = datas.filter(d => diasDesde(d) > 90 && diasDesde(d) <= 180).length;
    const porMes = {};
    datas.forEach(d => { const m = d.slice(0, 7); porMes[m] = (porMes[m] || 0) + 1; });
    const mesesComPresenca = Object.keys(porMes).length;
    const idade = cr.data_nascimento ? Math.floor((hoje - new Date(cr.data_nascimento + 'T00:00:00')) / (365.25 * 86400000)) : null;

    const stats = {
      nome: cr.nome, idade,
      total_checkins: datas.length,
      primeiro_checkin: primeiro, ultimo_checkin: ultimo,
      dias_desde_ultimo: diasDesde(ultimo),
      checkins_ultimos_90d: dias90, checkins_90_a_180d: dias90a180,
      meses_com_presenca: mesesComPresenca,
      ja_convertida: !!cr.data_conversao, ja_batizada: !!cr.data_batismo,
    };

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.json({ stats, situacao: null, analise: 'Análise de IA indisponível (chave não configurada).', recomendacao: null });
    }
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic();
    const sys = 'Você é analista do ministério infantil (Kids) de uma igreja. A partir de estatísticas de frequência (check-ins) de UMA criança, escreva uma análise curta e útil pra liderança. Responda SOMENTE com JSON válido: {"situacao":"frequente|regular|esporadica|afastada","analise":"2 a 3 frases, específica com números e datas","recomendacao":"1 frase de ação pastoral"}. Português do Brasil. Hoje é ' + hoje.toISOString().slice(0, 10) + '. "afastada" = sem check-in há 60+ dias.';
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 400, system: sys,
      messages: [{ role: 'user', content: JSON.stringify(stats) }],
    });
    const raw = (msg?.content?.[0]?.text || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    let parsed = {};
    try { parsed = JSON.parse(raw); } catch { parsed = { analise: raw }; }
    res.json({ stats, situacao: parsed.situacao || null, analise: parsed.analise || '', recomendacao: parsed.recomendacao || null });
  } catch (e) {
    console.error('[totemKids] analise-frequencia:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao gerar análise' });
  }
});



router.get('/cron/age-out', async (req, res) => {
  const isAdmin = ['admin', 'diretor'].includes(req.user?.role);
  if (!isAuthorizedCron(req) && !isAdmin) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const limite = new Date(); limite.setFullYear(limite.getFullYear() - 13);
    const limiteISO = limite.toISOString().slice(0, 10);
    const { data, error } = await supabase.from('kids_criancas')
      .update({ ativo: false, inativado_em: new Date().toISOString(), motivo_inativacao: 'Completou 13 anos · graduou para adolescente' })
      .eq('ativo', true).is('deleted_at', null)
      .not('data_nascimento', 'is', null).lte('data_nascimento', limiteISO)
      .select('id');
    if (error) throw error;
    res.json({ ok: true, graduados: (data || []).length });
  } catch (e) { console.error('[totemKids] age-out:', e.message); res.status(500).json({ error: 'Erro no age-out' }); }
});





router.get('/cron/encerrar-vencidas', async (req, res) => {
  const isAdmin = ['admin', 'diretor'].includes(req.user?.role);
  if (!isAuthorizedCron(req) && !isAdmin) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const encerradas = await encerrarSessoesVencidas(null);
    res.json({ ok: true, encerradas });
  } catch (e) { console.error('[totemKids] cron/encerrar-vencidas:', e.message); res.status(500).json({ error: 'Erro ao encerrar vencidas' }); }
});






router.post('/criancas/:id/responsaveis', authorizeModule('kids', 2), async (req, res) => {
  try {
    const { membro_id, parentesco, autorizado_buscar, contato_emergencia, observacao } = req.body;
    if (!membro_id) return res.status(400).json({ error: 'membro_id obrigatorio' });

    const { data, error } = await supabase
      .from('kids_responsaveis')
      .insert({
        crianca_id: req.params.id,
        membro_id,
        parentesco: parentesco || 'outro',
        autorizado_buscar: autorizado_buscar !== false,
        contato_emergencia: !!contato_emergencia,
        observacao: observacao || null,
      })
      .select('*, membro:mem_membros(id, nome, telefone, foto_url)')
      .single();
    if (error) {
      const t = traduzErroUmPaiUmaMae(error);
      if (t) return res.status(t.status).json({ error: t.error });



      if (error.code === '23505') {
        const { data: existente } = await supabase.from('kids_responsaveis')
          .select('*, membro:mem_membros(id, nome, telefone, foto_url)')
          .eq('crianca_id', req.params.id).eq('membro_id', membro_id).maybeSingle();
        return res.json(existente || { ok: true, ja_vinculado: true });
      }
      throw error;
    }
    res.status(201).json(data);
  } catch (e) {
    const t = traduzErroUmPaiUmaMae(e);
    if (t) return res.status(t.status).json({ error: t.error });
    res.status(500).json({ error: 'Erro ao adicionar responsável' });
  }
});





router.post('/criancas/:id/responsavel-rapido', authorizeModule('kids', 2), async (req, res) => {
  try {
    const { nome, telefone, cpf, parentesco, autorizado_buscar, permitir_sem_cpf } = req.body || {};
    if (!nome || !nome.trim()) return res.status(400).json({ error: 'nome obrigatorio' });
    if (!telefone || !telefone.trim()) return res.status(400).json({ error: 'telefone obrigatorio' });

    const tel = normalizarTelefone(telefone);
    const cpfNorm = normalizarCpf(cpf);
    if (!tel) return res.status(400).json({ error: 'telefone invalido (precisa ter pelo menos 8 digitos)' });



    const cpfBruto = String(cpf || '').replace(/\D/g, '');
    if (cpfBruto && (cpfBruto.length !== 11 || !cpfValido(cpfBruto))) {
      return res.status(400).json({ error: 'CPF do responsável inválido — confira os dígitos' });
    }
    if (!cpfBruto && !permitir_sem_cpf) {
      return res.status(422).json({
        error: 'CPF do responsável é obrigatório — sem o documento agora, o supervisor pode liberar',
        code: 'cpf_obrigatorio',
      });
    }


    const { data: crianca, error: errC } = await supabase
      .from('kids_criancas')
      .select('id, nome, familia_id')
      .eq('id', req.params.id)
      .maybeSingle();
    if (errC) throw errC;
    if (!crianca) return res.status(404).json({ error: 'criança não encontrada' });


    const r = await acharOuCriarGuardado({
      cpf: cpfNorm, telefone: tel, nome: nome.trim(), status: 'visitante',
      extra: { familia_id: crianca.familia_id || null },
      origem: 'kids_responsavel',
    });
    const { data: membro } = await supabase.from('mem_membros')
      .select('id, nome, familia_id').eq('id', r.membro_id).single();

    if (!r.created && crianca.familia_id && !membro.familia_id) {
      await supabase.from('mem_membros').update({ familia_id: crianca.familia_id }).eq('id', membro.id);
    }




    if (permitir_sem_cpf && !cpfNorm) {
      supabase.from('mem_historico').insert({
        membro_id: membro.id,
        tipo: 'outro',
        descricao: `[cpf_dispensado] Responsável Kids liberado sem CPF via válvula do totem (criança ${crianca.nome} · operador ${req.user?.userId || req.user?.id || 'desconhecido'}).`,
        created_at: new Date().toISOString(),
      }).then(({ error }) => { if (error) console.warn('[totemKids/responsavel-rapido] historico dispensa:', error.message); });
    }


    const { data: ligacao, error: errLig } = await supabase
      .from('kids_responsaveis')
      .upsert({
        crianca_id: req.params.id,
        membro_id: membro.id,
        parentesco: parentesco || 'outro',
        autorizado_buscar: autorizado_buscar !== false,
      }, { onConflict: 'crianca_id,membro_id', ignoreDuplicates: false })
      .select('*, membro:mem_membros(id, nome, telefone, foto_url)')
      .single();
    if (errLig) throw errLig;

    res.status(201).json(ligacao);
  } catch (e) {
    const t = traduzErroUmPaiUmaMae(e);
    if (t) return res.status(t.status).json({ error: t.error });
    console.error('[totemKids/responsavel-rapido]', e.message);
    res.status(500).json({ error: e.message || 'Erro ao adicionar responsável' });
  }
});


router.delete('/responsaveis/:id', authorizeModule('kids', 3), async (req, res) => {
  try {
    const { error } = await supabase.from('kids_responsaveis').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao remover responsável' });
  }
});



















router.get('/sem-checkin', authorizeModule('kids', 1), async (req, res) => {
  try {
    const limite = Math.min(Math.max(Number(req.query.limit) || 500, 1), 2000);

    const { data: comCheckin, error: eCk } = await supabase
      .from('kids_checkins').select('crianca_id').is('deleted_at', null).limit(100000);


    if (eCk) throw new Error(`Não foi possível ler os check-ins: ${eCk.message}`);
    const jaVeio = new Set((comCheckin || []).map((c) => c.crianca_id));

    const { data: ativas, error: eAt } = await supabase
      .from('kids_criancas')
      .select('id, nome, data_nascimento, sexo, visitante, created_at, planning_center_id')
      .eq('ativo', true).is('deleted_at', null)
      .order('created_at', { ascending: true }).limit(5000);
    if (eAt) throw eAt;

    const semCheckin = (ativas || []).filter((c) => !jaVeio.has(c.id));

    const itens = semCheckin.slice(0, limite).map((c) => ({
      crianca_id: c.id,
      nome: c.nome,
      idade_meses: c.data_nascimento ? calcIdadeMeses(c.data_nascimento) : null,
      idade_label: c.data_nascimento ? formatIdade(calcIdadeMeses(c.data_nascimento)) : null,
      sexo: c.sexo || null,
      visitante: c.visitante === true,
      cadastrada_em: c.created_at ? String(c.created_at).slice(0, 10) : null,


      do_import: !!c.planning_center_id,
    }));

    res.json({
      total: semCheckin.length,
      do_import: semCheckin.filter((c) => c.planning_center_id).length,
      cadastradas_aqui: semCheckin.filter((c) => !c.planning_center_id).length,
      truncado: semCheckin.length > itens.length,
      itens,
    });
  } catch (e) {
    console.error('[totemKids/sem-checkin]', e.message);
    res.status(500).json({ error: e.message || 'Erro ao listar crianças sem check-in' });
  }
});



router.get('/ausentes', authorizeModule('kids', 1), async (req, res) => {
  try {
    const min = Math.max(1, Number(req.query.min) || 3);
    const { data: ausentes, error } = await supabase
      .rpc('fn_kids_ausentes_consecutivos', { p_min: min });
    if (error) throw error;
    const ids = (ausentes || []).map(a => a.crianca_id);
    let respPorCrianca = {};



    let dadosPorCrianca = {};




    let contatoPorCrianca = {};
    if (ids.length) {
      const [{ data: resps }, { data: cris }, { data: contatos }] = await Promise.all([
        supabase
          .from('kids_responsaveis')
          .select('crianca_id, parentesco, autorizado_buscar, membro:mem_membros(nome, telefone)')
          .in('crianca_id', ids),
        supabase
          .from('kids_criancas')
          .select('id, data_nascimento, sexo')
          .in('id', ids),
        supabase
          .from('kids_atendimentos')
          .select('crianca_id, data, registrado_por_nome')
          .eq('tipo', 'contato')
          .is('deleted_at', null)
          .in('crianca_id', ids)
          .order('data', { ascending: false }),
      ]);
      for (const r of resps || []) {
        (respPorCrianca[r.crianca_id] = respPorCrianca[r.crianca_id] || []).push({
          nome: r.membro?.nome || null,
          telefone: r.membro?.telefone || null,
          parentesco: r.parentesco || null,
          autorizado_buscar: r.autorizado_buscar || false,
        });
      }
      for (const c of cris || []) dadosPorCrianca[c.id] = c;

      for (const ct of contatos || []) {
        if (!contatoPorCrianca[ct.crianca_id]) contatoPorCrianca[ct.crianca_id] = ct;
      }
    }
    res.json((ausentes || []).map(a => {
      const c = dadosPorCrianca[a.crianca_id] || {};
      const meses = calcIdadeMeses(c.data_nascimento);
      const ct = contatoPorCrianca[a.crianca_id];


      const contatoValido = !!ct && (!a.ultima_presenca || String(ct.data) >= String(a.ultima_presenca));
      return {
        ...a,
        data_nascimento: c.data_nascimento || null,
        sexo: c.sexo || null,
        idade_meses: meses,
        idade_label: formatIdade(meses),
        contatado: contatoValido,
        contatado_em: contatoValido ? ct.data : null,
        contatado_por: contatoValido ? (ct.registrado_por_nome || null) : null,
        responsaveis: respPorCrianca[a.crianca_id] || [],
      };
    }));
  } catch (e) {
    console.error('[totemKids/ausentes]', e.message);
    res.status(500).json({ error: 'Erro ao listar crianças faltantes' });
  }
});




router.get('/aniversariantes', authorizeModule('kids', 1), async (req, res) => {
  try {
    const hoje = new Date();
    const mes = Math.min(12, Math.max(1, Number(req.query.mes) || (hoje.getMonth() + 1)));
    const mm = String(mes).padStart(2, '0');

    const [kids, { data: salas }] = await Promise.all([
      fetchCriancasPaginado('id, nome, data_nascimento, sexo', q => q
        .eq('ativo', true).is('deleted_at', null).not('data_nascimento', 'is', null)),
      supabase.from('kids_salas')
        .select('id, nome, faixa_etaria_min_meses, faixa_etaria_max_meses, ordem')
        .eq('ativo', true).order('ordem'),
    ]);

    const doMes = (kids || []).filter(k => String(k.data_nascimento).slice(5, 7) === mm);



    const porCrianca = {};
    const ids = doMes.map(k => k.id);
    for (let i = 0; i < ids.length; i += 200) {
      const lote = ids.slice(i, i + 200);
      const { data: resps } = await supabase.from('kids_responsaveis')
        .select('crianca_id, parentesco, membro:mem_membros(nome, telefone)')
        .in('crianca_id', lote);
      for (const r of resps || []) {
        (porCrianca[r.crianca_id] = porCrianca[r.crianca_id] || []).push({
          nome: r.membro?.nome || null,
          telefone: r.membro?.telefone || null,
          parentesco: r.parentesco || null,
        });
      }
    }
    const PESO = { mae: 0, pai: 1 };
    for (const k of Object.keys(porCrianca)) {
      porCrianca[k].sort((a, b) => (PESO[a.parentesco] ?? 9) - (PESO[b.parentesco] ?? 9));
    }

    const lista = doMes.map(k => {
      const meses = calcIdadeMeses(k.data_nascimento);
      const sala = salaDaIdade(salas, meses);
      const dia = Number(String(k.data_nascimento).slice(8, 10));



      const anoBase = (mes < hoje.getMonth() + 1 || (mes === hoje.getMonth() + 1 && dia < hoje.getDate()))
        ? hoje.getFullYear() + 1
        : hoje.getFullYear();
      return {
        id: k.id,
        nome: k.nome,
        sexo: k.sexo || null,
        data_nascimento: k.data_nascimento,
        dia,
        idade_meses: meses,
        idade_label: formatIdade(meses),
        completa_anos: anoBase - Number(String(k.data_nascimento).slice(0, 4)),
        sala_id: sala?.id || null,
        sala_nome: sala?.nome || null,
        sala_ordem: sala?.ordem ?? 999,
        responsaveis: porCrianca[k.id] || [],
      };
    }).sort((a, b) => a.dia - b.dia || a.nome.localeCompare(b.nome, 'pt-BR'));

    res.json({ mes, total: lista.length, aniversariantes: lista });
  } catch (e) {
    console.error('[totemKids/aniversariantes]', e.message);
    res.status(500).json({ error: 'Erro ao listar aniversariantes do mês' });
  }
});








router.post('/ausentes/:criancaId/contato', authorizeModule('kids', 2), async (req, res) => {
  try {
    const hoje = new Date().toISOString().slice(0, 10);
    const descricao = String(req.body?.descricao || '').trim()
      || 'Família contatada sobre as faltas seguidas (marcado na lista de faltantes).';
    const { data: criado, error } = await supabase
      .from('kids_atendimentos')
      .insert({
        crianca_id: req.params.criancaId,
        tipo: 'contato',
        descricao: descricao.slice(0, 2000),
        data: hoje,
        registrado_por: req.user?.userId || null,
        registrado_por_nome: req.user?.name || req.user?.email || null,
      })
      .select('id, data, registrado_por_nome').single();
    if (error) throw error;
    res.status(201).json({ ok: true, contatado: true, contatado_em: criado.data, contatado_por: criado.registrado_por_nome });
  } catch (e) {
    console.error('[totemKids/ausentes/contato]', e.message);
    res.status(500).json({ error: 'Erro ao marcar contato' });
  }
});



router.delete('/ausentes/:criancaId/contato', authorizeModule('kids', 2), async (req, res) => {
  try {
    const desde = /^\d{4}-\d{2}-\d{2}$/.test(req.query?.desde || '') ? req.query.desde : null;
    let q = supabase.from('kids_atendimentos')
      .update({ deleted_at: new Date().toISOString() })
      .eq('crianca_id', req.params.criancaId)
      .eq('tipo', 'contato')
      .is('deleted_at', null);
    if (desde) q = q.gte('data', desde);
    const { error } = await q;
    if (error) throw error;
    res.json({ ok: true, contatado: false });
  } catch (e) {
    console.error('[totemKids/ausentes/contato del]', e.message);
    res.status(500).json({ error: 'Erro ao desmarcar contato' });
  }
});



router.get('/cultos-do-dia', authorizeModule('kids', 2), async (req, res) => {
  try {
    const data = req.query.data;
    if (!data) return res.json([]);




    const { data: cultos } = await supabase.from('cultos')
      .select('id, nome, vol_service_types(has_kids, is_active, recurrence_time)')
      .eq('data', data)
      .is('deleted_at', null);
    const lista = (cultos || [])
      .filter(c => c.vol_service_types?.has_kids && c.vol_service_types?.is_active !== false)
      .map(c => ({ id: c.id, nome: c.nome, hora: (c.vol_service_types?.recurrence_time || '').slice(0, 5) }))
      .sort((a, b) => (a.hora || '').localeCompare(b.hora || ''));
    res.json(lista);
  } catch (e) {
    console.error('[totemKids/cultos-do-dia]', e.message);
    res.status(500).json({ error: 'Erro ao listar cultos do dia' });
  }
});




router.get('/checkin/aberto', authorizeModule('kids', 1), async (req, res) => {
  try {
    const { sessao_id, crianca_id } = req.query;
    if (!sessao_id || !crianca_id) return res.status(400).json({ error: 'sessao_id e crianca_id obrigatórios' });
    const { data } = await supabase
      .from('kids_checkins')
      .select('id, codigo_seguranca, codigo_barras, checkin_grupo_id, responsavel_checkin_nome, created_at, sala:kids_salas(id, nome, cor, logo_url), sessao:kids_sessoes(id, culto:cultos(id, nome, data))')
      .eq('sessao_id', sessao_id)
      .eq('crianca_id', crianca_id)
      .is('checkout_at', null)
      .maybeSingle();


    const { data: anteriores } = await supabase
      .from('kids_checkins')
      .select('id, codigo_seguranca, created_at, sessao:kids_sessoes(id, status, culto:cultos(id, nome, data))')
      .eq('crianca_id', crianca_id)
      .neq('sessao_id', sessao_id)
      .is('checkout_at', null)
      .order('created_at', { ascending: false })
      .limit(5);
    res.json({ checkin: data || null, abertos_anteriores: anteriores || [] });
  } catch (e) {
    console.error('[totemKids] checkin aberto:', e.message);
    res.status(500).json({ error: 'Erro ao consultar o check-in' });
  }
});











function canonicalPager(v) {
  const d = String(v == null ? '' : v).replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  return d === '' ? null : d;
}








async function transferirCpfDePlaceholder(selecionadoId, ghost, cpfInformado) {
  const { error: e1 } = await supabase.from('mem_membros')
    .update({ cpf: null }).eq('id', ghost.id).eq('cpf', cpfInformado);
  if (e1) { console.error('[totemKids] transferir cpf (limpar fantasma):', e1.message); return false; }
  const { error: e2 } = await supabase.from('mem_membros')
    .update({ cpf: cpfInformado }).eq('id', selecionadoId);
  if (e2) {
    console.error('[totemKids] transferir cpf (gravar no real):', e2.message);
    await supabase.from('mem_membros').update({ cpf: cpfInformado }).eq('id', ghost.id)
      .then(() => {}, () => {});
    return false;
  }


  if (ghost.telefone) {
    supabase.rpc('fn_registrar_contato', {
      p_membro_id: selecionadoId, p_telefone: ghost.telefone, p_email: null, p_fonte: 'kids_cpf_placeholder',
    }).then(({ error }) => { if (error) console.warn('[totemKids] contato do fantasma não registrado:', error.message); });
  }
  console.log(`[totemKids] CPF ${cpfInformado} transferido do placeholder ${ghost.id} ("${ghost.nome}") pro cadastro real ${selecionadoId}`);
  return true;
}



function precisaPagerServer(c) {
  if (!c) return false;
  if (c.tem_espectro === true || c.tem_limitacao_fisica === true) return true;
  if (!c.data_nascimento) return false;
  const nasc = new Date(c.data_nascimento);
  if (isNaN(nasc.getTime())) return false;
  const hoje = new Date();
  const meses = (hoje.getFullYear() - nasc.getFullYear()) * 12
    + (hoje.getMonth() - nasc.getMonth())
    - (hoje.getDate() < nasc.getDate() ? 1 : 0);
  return meses < 48;
}



async function numerosPagerEmUso() {
  const { data } = await supabase.from('kids_checkins')
    .select('pager_numero').not('pager_numero', 'is', null)
    .is('checkout_at', null).is('deleted_at', null);
  return [...new Set((data || []).map((r) => r.pager_numero).filter(Boolean))]
    .sort((a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0));
}


async function fetchCheckinsAbertosPager() {
  const out = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.from('kids_checkins')
      .select('id, crianca_id, checkin_at, pager_numero, responsavel_checkin_nome, crianca:kids_criancas(nome, data_nascimento, tem_espectro, tem_limitacao_fisica), sala:kids_salas(nome), sessao:kids_sessoes(culto:cultos(nome))')
      .is('checkout_at', null).is('deleted_at', null)
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < pageSize) break;
  }
  return out;
}







router.patch('/checkin/:id/pager', authorizeModule('kids', 2), async (req, res) => {
  try {
    const { data: alvo } = await supabase.from('kids_checkins')
      .select('id, checkin_grupo_id, deleted_at')
      .eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!alvo) return res.status(404).json({ error: 'Check-in não encontrado' });

    const numero = canonicalPager(req.body ? req.body.pager_numero : null);
    const party = alvo.checkin_grupo_id;
    const aplicarNaFamilia = (patch) => {
      let q = supabase.from('kids_checkins').update(patch).is('checkout_at', null).is('deleted_at', null);
      return party ? q.eq('checkin_grupo_id', party) : q.eq('id', alvo.id);
    };



    if (numero == null) {
      await aplicarNaFamilia({ pager_numero: null });
      return res.json({ ok: true, pager_numero: null });
    }



    const { data: outros } = await supabase.from('kids_checkins')
      .select('id, checkin_grupo_id')
      .eq('pager_numero', numero).is('checkout_at', null).is('deleted_at', null);
    const conflito = (outros || []).some((o) =>
      party ? o.checkin_grupo_id !== party : o.id !== alvo.id);
    if (conflito) {
      return res.json({ ok: false, conflito: true, em_uso: await numerosPagerEmUso() });
    }

    await aplicarNaFamilia({ pager_numero: numero });
    return res.json({ ok: true, pager_numero: numero });
  } catch (e) {
    console.error('[totemKids] set pager:', e.message);
    res.status(500).json({ error: 'Erro ao registrar o pager' });
  }
});





router.get('/pagers-em-uso', authorizeModule('kids', 1), async (req, res) => {
  try {
    const abertos = await fetchCheckinsAbertosPager();
    const em_uso = [];
    const pendentes = [];
    for (const c of abertos) {
      const base = {
        checkin_id: c.id,
        crianca_id: c.crianca_id || null,
        checkin_at: c.checkin_at || null,
        crianca_nome: (c.crianca && c.crianca.nome) || '—',
        sala_nome: (c.sala && c.sala.nome) || null,
        responsavel_nome: c.responsavel_checkin_nome || null,

        culto_nome: (c.sessao && c.sessao.culto && c.sessao.culto.nome) || null,
      };
      if (c.pager_numero) em_uso.push({ pager_numero: c.pager_numero, ...base });
      else if (precisaPagerServer(c.crianca)) pendentes.push(base);
    }
    em_uso.sort((a, b) => (parseInt(a.pager_numero, 10) || 0) - (parseInt(b.pager_numero, 10) || 0));
    res.json({ em_uso, pendentes });
  } catch (e) {
    console.error('[totemKids] pagers em uso:', e.message);
    res.status(500).json({ error: 'Erro ao carregar os pagers' });
  }
});




router.patch('/checkin/:id/pager-devolvido', authorizeModule('kids', 2), async (req, res) => {
  try {
    const { data: alvo } = await supabase.from('kids_checkins')
      .select('id, checkin_grupo_id, deleted_at')
      .eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!alvo) return res.status(404).json({ error: 'Check-in não encontrado' });
    const devolvido = req.body ? req.body.devolvido !== false : true;
    const patch = devolvido
      ? { pager_devolvido_at: new Date().toISOString(), pager_devolvido_por: req.user?.userId || null }
      : { pager_devolvido_at: null, pager_devolvido_por: null };
    let q = supabase.from('kids_checkins').update(patch).is('deleted_at', null);
    q = alvo.checkin_grupo_id ? q.eq('checkin_grupo_id', alvo.checkin_grupo_id) : q.eq('id', alvo.id);
    const { error } = await q;
    if (error) throw error;






    let baixados = 0;
    if (devolvido) {
      let qOut = supabase.from('kids_checkins').update({
        checkout_at: new Date().toISOString(),
        checkout_metodo: 'painel',
        responsavel_checkout_nome: 'Devolução do pager (conferência)',
        checkout_por: req.user?.userId || null,
      }).is('checkout_at', null).is('deleted_at', null);
      qOut = alvo.checkin_grupo_id ? qOut.eq('checkin_grupo_id', alvo.checkin_grupo_id) : qOut.eq('id', alvo.id);
      const { data: fechados, error: eOut } = await qOut.select('id');
      if (eOut) console.warn('[totemKids] devolução: baixa não aplicada:', eOut.message);
      else baixados = (fechados || []).length;
    }

    res.json({ ok: true, devolvido, baixados });
  } catch (e) {
    console.error('[totemKids] pager devolvido:', e.message);
    res.status(500).json({ error: 'Erro ao registrar devolução do pager' });
  }
});





router.get('/pagers/conferencia', authorizeModule('kids', 1), async (req, res) => {
  try {
    const cultoId = req.query.culto_id ? String(req.query.culto_id) : null;
    const data = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.data || ''))
      ? String(req.query.data)
      : new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);

    const linhas = [];
    for (let offset = 0; ; offset += 1000) {
      const { data: chunk, error } = await supabase.from('kids_checkins')
        .select(`
          id, checkin_grupo_id, pager_numero, checkin_at, checkout_at, pager_devolvido_at,
          responsavel_checkin_nome,
          crianca:kids_criancas(nome),
          sessao:kids_sessoes(culto:cultos(id, nome, data))
        `)
        .not('pager_numero', 'is', null).is('deleted_at', null)
        .range(offset, offset + 999);
      if (error) throw error;
      if (!chunk || chunk.length === 0) break;
      linhas.push(...chunk);
      if (chunk.length < 1000) break;
    }

    const grupos = new Map();
    for (const l of linhas) {
      const dataCulto = l.sessao?.culto?.data
        ? String(l.sessao.culto.data).slice(0, 10)
        : (l.checkin_at ? new Date(new Date(l.checkin_at).getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10) : null);
      if (cultoId ? (l.sessao?.culto?.id !== cultoId) : (dataCulto !== data)) continue;
      const chave = `${l.checkin_grupo_id || l.id}|${l.pager_numero}`;
      const g = grupos.get(chave) || {
        pager_numero: l.pager_numero,
        culto: l.sessao?.culto?.nome || null,
        criancas: [],
        responsavel_nome: l.responsavel_checkin_nome || null,
        checkin_at: l.checkin_at || null,

        todos_sairam: true,
        devolvido_at: null,
        checkin_ids: [],
      };
      g.criancas.push(l.crianca?.nome || '—');
      g.checkin_ids.push(l.id);
      if (!l.checkout_at) g.todos_sairam = false;
      if (l.pager_devolvido_at && (!g.devolvido_at || l.pager_devolvido_at > g.devolvido_at)) g.devolvido_at = l.pager_devolvido_at;
      grupos.set(chave, g);
    }
    const lista = [...grupos.values()].sort((a, b) => (parseInt(a.pager_numero, 10) || 0) - (parseInt(b.pager_numero, 10) || 0));
    const nao_devolvidos = lista.filter((g) => !g.devolvido_at).length;
    const foram_pra_casa = lista.filter((g) => !g.devolvido_at && g.todos_sairam).length;
    res.json({ data, culto_id: cultoId, lista, resumo: { total: lista.length, nao_devolvidos, foram_pra_casa } });
  } catch (e) {
    console.error('[totemKids] pagers conferencia:', e.message);
    res.status(500).json({ error: 'Erro ao carregar a conferência de pagers' });
  }
});



router.get('/pagers/cultos', authorizeModule('kids', 1), async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 40, 100);

    const sess = [];
    for (let offset = 0; ; offset += 1000) {
      const { data: chunk, error } = await supabase.from('kids_sessoes')
        .select('culto:cultos(id, nome, data)')
        .range(offset, offset + 999);
      if (error) throw error;
      if (!chunk || chunk.length === 0) break;
      sess.push(...chunk);
      if (chunk.length < 1000) break;
    }

    const comPager = new Set();
    for (let offset = 0; ; offset += 1000) {
      const { data: chunk, error } = await supabase.from('kids_checkins')
        .select('sessao:kids_sessoes(culto_id)')
        .not('pager_numero', 'is', null).is('deleted_at', null)
        .range(offset, offset + 999);
      if (error) throw error;
      if (!chunk || chunk.length === 0) break;
      for (const c of chunk) { const cid = c.sessao?.culto_id; if (cid) comPager.add(cid); }
      if (chunk.length < 1000) break;
    }
    const hoje = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
    const map = new Map();
    for (const s of sess) {
      const c = s.culto;
      if (!c?.id || !c.data) continue;
      if (String(c.data).slice(0, 10) > hoje) continue;
      if (!map.has(c.id)) map.set(c.id, { culto_id: c.id, nome: c.nome, data: String(c.data).slice(0, 10), tem_pager: comPager.has(c.id) });
    }
    const cultos = [...map.values()]
      .sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0))
      .slice(0, limit);
    res.json(cultos);
  } catch (e) {
    console.error('[totemKids] pagers cultos:', e.message);
    res.status(500).json({ error: 'Erro ao listar cultos' });
  }
});





router.get('/checkins-abertos/buscar', authorizeModule('kids', 2), async (req, res) => {
  try {
    const nome = String(req.query.nome || '').trim();
    const pager = canonicalPager(req.query.pager);
    if (!pager && nome.length < 2) return res.json([]);

    let q = supabase.from('kids_checkins')
      .select(`
        id, codigo_seguranca, checkin_at, responsavel_checkin_nome, pager_numero,
        crianca:kids_criancas!inner(id, nome, foto_url),
        sala:kids_salas(nome, cor),
        sessao:kids_sessoes(culto:cultos(nome, data))
      `)
      .is('checkout_at', null).is('deleted_at', null);
    if (pager) {
      q = q.eq('pager_numero', pager);
    } else {


      const qNorm = nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
      const termos = qNorm.split(/\s+/).filter(t => t.length >= 1).slice(0, 6);
      for (const t of termos) q = q.ilike('crianca.nome_norm', `%${t}%`);
    }
    const { data, error } = await q.order('checkin_at', { ascending: false }).limit(15);
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    console.error('[totemKids/checkins-abertos/buscar]', e.message);
    res.status(500).json({ error: 'Erro ao buscar check-ins abertos' });
  }
});










router.post('/codigos-reservados', authorizeModule('kids', 2), async (req, res) => {
  try {
    const estacaoRef = String(req.body?.estacao_ref || '').trim();
    if (!estacaoRef) return res.status(400).json({ error: 'estacao_ref obrigatório' });
    const sessaoId = req.body?.sessao_id || null;


    const qtd = Math.min(Math.max(parseInt(req.body?.quantidade, 10) || 60, 1), 200);

    const { data, error } = await supabase.rpc('fn_kids_reservar_codigos', {
      p_estacao_ref: estacaoRef,
      p_sessao_id: sessaoId,
      p_quantidade: qtd,
      p_estacao_id: req.body?.estacao_id || null,
    });
    if (error) throw error;

    const codigos = (data || []).map((r) => (typeof r === 'string' ? r : r.codigo)).filter(Boolean);
    return res.json({ codigos, total: codigos.length, estacao_ref: estacaoRef });
  } catch (e) {
    console.error('[totemKids/codigos-reservados]', e?.message);


    return res.status(503).json({ error: 'Não foi possível reservar códigos agora.', detalhe: e?.message });
  }
});

router.post('/checkin', authorizeModule('kids', 2), async (req, res) => {
  try {
    const {
      sessao_id, crianca_id, sala_id, estacao_id,
      responsavel_id, responsavel_nome_manual, responsavel_telefone_manual, responsavel_parentesco,
      cultos_extras,
      enviar_wpp,
      responsavel_cpf,
      permitir_sem_cpf,
    } = req.body;

    if (!sessao_id) return res.status(400).json({ error: 'sessao_id obrigatorio' });
    if (!crianca_id) return res.status(400).json({ error: 'crianca_id obrigatorio' });
    if (!sala_id) return res.status(400).json({ error: 'sala_id obrigatorio' });


    const { data: sessao } = await supabase
      .from('kids_sessoes')
      .select('id, status, culto_id, culto:cultos(data, nome)')
      .eq('id', sessao_id)
      .maybeSingle();
    if (!sessao) return res.status(404).json({ error: 'Sessão não encontrada' });
    if (sessao.status !== 'aberta') {
      return res.status(400).json({ error: 'Sessão não esta aberta', status: sessao.status });
    }





    if (sessao.culto?.data && String(sessao.culto.data).slice(0, 10) < _hojeBRT()) {
      return res.status(409).json({ error: 'Essa sessão é de um culto de outro dia e já foi encerrada. Recarregue o totem.' });
    }





    if (sessao.culto?.data && String(sessao.culto.data).slice(0, 10) > _hojeBRT()
        && await temSessaoAoVivoHoje()) {
      return res.status(409).json({ error: 'Essa sessão é ensaio de um culto de outro dia — escolha um culto de hoje.' });
    }




    const { data: existentes } = await supabase
      .from('kids_checkins')
      .select('id, codigo_seguranca, sala_id, checkout_at')
      .eq('sessao_id', sessao_id)
      .eq('crianca_id', crianca_id);
    const checkinAberto = (existentes || []).find(c => !c.checkout_at);
    if (checkinAberto) {
      return res.status(409).json({
        error: 'Criança já está com check-in aberto nessa sessão. Perdeu a etiqueta? Use "Imprimir etiqueta de novo".',
        checkin_existente: checkinAberto,
      });
    }






    const cpfInformado = normalizarCpf(responsavel_cpf);
    if (responsavel_cpf && !cpfValido(cpfInformado)) {
      return res.status(400).json({ error: 'CPF inválido — confira os números.', precisa_cpf: true });
    }
    const ligarResponsavel = async (membroId, parentesco) => {
      const { data: link } = await supabase.from('kids_responsaveis')
        .select('crianca_id').eq('crianca_id', crianca_id).eq('membro_id', membroId).maybeSingle();
      if (!link) {
        await supabase.from('kids_responsaveis')
          .insert({ crianca_id, membro_id: membroId, parentesco: parentesco || 'responsavel', autorizado_buscar: true })
          .then(() => {}, (e) => console.error('[totemKids/checkin] ligar responsável:', e?.message));
      }
    };

    let respId = null, respNome = null, respTel = null;
    if (responsavel_id) {
      const { data: m } = await supabase
        .from('mem_membros').select('id, nome, telefone, cpf').eq('id', responsavel_id).maybeSingle();
      if (!m) return res.status(404).json({ error: 'Responsável não encontrado' });
      respId = m.id; respNome = m.nome; respTel = m.telefone;
      const jaTemCpf = m.cpf && String(m.cpf).replace(/\D/g, '').length === 11;
      if (!jaTemCpf) {
        if (cpfInformado) {




          const { data: outro } = await supabase.from('mem_membros')
            .select('id, nome, telefone').eq('cpf', cpfInformado).neq('id', m.id).maybeSingle();
          if (outro && !ehNomePlaceholder(outro.nome)) {
            respId = outro.id; respNome = outro.nome; respTel = outro.telefone || respTel;
            await ligarResponsavel(outro.id, responsavel_parentesco);
          } else if (outro) {
            await transferirCpfDePlaceholder(m.id, outro, cpfInformado);
          } else {
            await supabase.from('mem_membros').update({ cpf: cpfInformado }).eq('id', m.id);
          }
        } else if (!permitir_sem_cpf) {
          return res.status(422).json({ error: 'Precisamos do CPF do responsável.', precisa_cpf: true, responsavel_nome: m.nome });
        } else {
          console.warn(`[totemKids/checkin] CPF dispensado (supervisor) · resp ${m.id}`);
        }
      }
    } else if (responsavel_nome_manual) {

      if (cpfInformado) {
        const rr = await acharOuCriarGuardado({
          cpf: cpfInformado, telefone: normalizarTelefone(responsavel_telefone_manual),
          nome: responsavel_nome_manual, status: 'visitante', origem: 'kids_responsavel_manual',
        });
        const { data: m } = await supabase.from('mem_membros').select('id, nome, telefone').eq('id', rr.membro_id).single();
        respId = m.id; respNome = m.nome; respTel = m.telefone || normalizarTelefone(responsavel_telefone_manual);
        await ligarResponsavel(m.id, responsavel_parentesco || 'outro');
      } else if (!permitir_sem_cpf) {
        return res.status(422).json({ error: 'Precisamos do CPF do responsável.', precisa_cpf: true });
      } else {
        respNome = responsavel_nome_manual;
        respTel = normalizarTelefone(responsavel_telefone_manual);
        console.warn('[totemKids/checkin] CPF dispensado (supervisor · manual)');
      }
    }
    if (!respNome) return res.status(400).json({ error: 'responsavel_id ou responsavel_nome_manual obrigatório' });



    if (respId) await ligarResponsavel(respId, responsavel_parentesco);


    const { data: crianca } = await supabase
      .from('kids_criancas')
      .select('id, nome, data_nascimento, observacoes_medicas, necessidades_especiais')
      .eq('id', crianca_id)
      .maybeSingle();
    if (!crianca) return res.status(404).json({ error: 'Criança não encontrada' });
    if (!crianca.data_nascimento) {
      return res.status(422).json({
        error: 'Informe a data de nascimento da criança antes do check-in.',
        precisa_data_nascimento: true,
        crianca_id,
      });
    }


    const { data: sala } = await supabase
      .from('kids_salas')
      .select('id, nome, cor, logo_url')
      .eq('id', sala_id)
      .maybeSingle();
    if (!sala) return res.status(404).json({ error: 'Sala não encontrada' });




    let cultosExtras = Array.isArray(cultos_extras)
      ? [...new Set(cultos_extras.map(String))].filter(cid => cid && cid !== sessao.culto_id)
      : [];


    if (cultosExtras.length) {
      const dataPrimaria = String(sessao.culto?.data || '').slice(0, 10);
      const { data: cxs } = await supabase.from('cultos').select('id, data').in('id', cultosExtras);
      const validos = new Set((cxs || []).filter((c) => String(c.data).slice(0, 10) === dataPrimaria).map((c) => c.id));
      const fora = cultosExtras.filter((cid) => !validos.has(cid));
      if (fora.length) console.warn('[totemKids/checkin] cultos extras de outro dia ignorados:', fora.join(','));
      cultosExtras = cultosExtras.filter((cid) => validos.has(cid));
    }
    const grupoId = cultosExtras.length ? require('crypto').randomUUID() : null;

    const gerarCodigo = async () => {
      const { data } = await supabase.rpc('fn_kids_gerar_codigo_seguranca');
      if (data) return data;
      const alfa = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let c = '';
      for (let i = 0; i < 4; i++) c += alfa[Math.floor(Math.random() * alfa.length)];
      return c;
    };
    const colisaoCodigo = (erro) => erro?.code === '23505'
      && /c[oó]digo de seguran[cç]a ativo|kids_codigo_seguranca_ativo_grupo/i.test(`${erro.message || ''} ${erro.details || ''} ${erro.constraint || ''}`);










    const codigoReservado = typeof req.body?.codigo_reservado === 'string'
      ? req.body.codigo_reservado.toUpperCase().trim() : null;
    let reservaOk = false;
    if (codigoReservado) {


      const { data: r } = await supabase
        .from('kids_codigos_reservados')
        .select('codigo, status')
        .eq('codigo', codigoReservado)
        .maybeSingle();
      reservaOk = !!r && r.status === 'reservado';
      if (!reservaOk) {
        return res.status(409).json({
          error: 'Código offline não reconhecido ou já usado. Confira a etiqueta com a coordenação do Kids.',
          codigo_invalido: true,
        });
      }
    }

    let codigoFinal = null;
    let checkin = null;
    let errIns = null;
    const maxTentativas = reservaOk ? 1 : 5;
    for (let tentativa = 0; tentativa < maxTentativas; tentativa++) {
      codigoFinal = reservaOk ? codigoReservado : await gerarCodigo();
      const insercao = await supabase.from('kids_checkins').insert({
        sessao_id,
        crianca_id,
        sala_id,
        estacao_checkin_id: estacao_id || null,
        responsavel_checkin_id: respId,
        responsavel_checkin_nome: respNome,
        responsavel_checkin_telefone: respTel,
        responsavel_checkin_parentesco: responsavel_parentesco || null,
        codigo_seguranca: codigoFinal,
        codigo_barras: codigoFinal,
        checkin_por: req.user.userId,
        checkin_grupo_id: grupoId,
      }).select('*').single();
      checkin = insercao.data;
      errIns = insercao.error;
      if (!colisaoCodigo(errIns)) break;
    }
    if (colisaoCodigo(errIns)) {



      if (reservaOk) {
        console.error('[totemKids/checkin] colisão em código RESERVADO:', codigoReservado);
        return res.status(409).json({
          error: 'Este código já está em uso. NÃO reimprima: leve a etiqueta à coordenação do Kids.',
          codigo_conflito: true, codigo: codigoReservado,
        });
      }
      return res.status(503).json({ error: 'Não foi possível reservar um código livre. Tente novamente.', pode_tentar_novamente: true });
    }


    if (errIns && errIns.code === '23505') {
      return res.status(409).json({ error: 'Criança já está com check-in nessa sessão. Perdeu a etiqueta? Use "Imprimir etiqueta de novo".' });
    }
    if (errIns) throw errIns;




    if (reservaOk) {
      supabase.from('kids_codigos_reservados')
        .update({ status: 'usado', usado_em: new Date().toISOString(), checkin_id: checkin.id })
        .eq('codigo', codigoFinal).eq('status', 'reservado')
        .then(() => {}, (e) => console.error('[totemKids/checkin] queimar reserva:', e?.message));
    }



    supabase.from('kids_criancas')
      .update({ ativo: true, motivo_inativacao: null, inativado_em: null })
      .eq('id', crianca_id).eq('ativo', false)
      .then(() => {}, (e) => console.error('[totemKids/checkin] reativar criança:', e?.message));



    promoverVisitanteRecorrente(crianca_id);


    const cultosDoGrupo = [{ id: sessao.culto_id, nome: sessao.culto?.nome || null }];


    for (const cultoId of cultosExtras) {
      try {
        let { data: sx } = await supabase.from('kids_sessoes')
          .select('id, status, culto:cultos(nome)').eq('culto_id', cultoId).maybeSingle();
        if (!sx) {
          const { data: nova } = await supabase.from('kids_sessoes')
            .insert({ culto_id: cultoId, status: 'aberta', abrir_em: new Date().toISOString() })
            .select('id, status, culto:cultos(nome)').single();
          sx = nova;
        }
        if (!sx) continue;
        const { error: e2 } = await supabase.from('kids_checkins').insert({
          sessao_id: sx.id, crianca_id, sala_id,
          estacao_checkin_id: estacao_id || null,
          responsavel_checkin_id: respId,
          responsavel_checkin_nome: respNome,
          responsavel_checkin_telefone: respTel,
          responsavel_checkin_parentesco: responsavel_parentesco || null,
          codigo_seguranca: codigoFinal, codigo_barras: codigoFinal,
          checkin_por: req.user.userId, checkin_grupo_id: grupoId, labels_impressas: 0,
        });

        if (!e2 || e2.code === '23505') cultosDoGrupo.push({ id: cultoId, nome: sx.culto?.nome || null });
      } catch (ex) { console.error('[totemKids/checkin] culto extra:', ex.message); }
    }





    if (enviar_wpp && respTel) {
      const template = process.env.WHATSAPP_TEMPLATE_KIDS_RETIRADA;
      if (template) {
        const primeiroNome = String(crianca?.nome || '').trim().split(/\s+/)[0] || 'sua criança';
        const base = (process.env.FRONTEND_URL || '').replace(/\/$/, '');
        const link = `${base}/kids/retirada/${codigoFinal}`;


        require('../services/whatsappFila').enfileirar({
          telefone: respTel, template, params: [primeiroNome, codigoFinal, link],
          idioma: process.env.WHATSAPP_TEMPLATE_KIDS_RETIRADA_LANG || 'pt_BR',
          contexto: 'kids.retirada_codigo',
        })
          .then((r) => { if (!r?.sent && !r?.queued) console.warn('[totemKids/checkin] wpp retirada pulado:', r?.reason); })
          .catch((e) => console.warn('[totemKids/checkin] wpp retirada erro:', e?.message));
      } else {
        console.warn('[totemKids/checkin] WHATSAPP_TEMPLATE_KIDS_RETIRADA não configurado · envio pulado');
      }
    }


    res.status(201).json({
      checkin,
      crianca,
      sala,
      sessao: { id: sessao.id, culto: sessao.culto },
      cultos: cultosDoGrupo,
      responsavel: { id: respId, nome: respNome, telefone: respTel, parentesco: responsavel_parentesco },
      codigo_seguranca: codigoFinal,
      codigo_barras: codigoFinal,
    });
  } catch (e) {
    console.error('[totemKids/checkin]', e.message);
    res.status(500).json({ error: 'Erro ao fazer check-in' });
  }
});







router.post('/checkin/lote', authorizeModule('kids', 2), async (req, res) => {
  try {
    const {
      sessao_id, itens, estacao_id,
      responsavel_id, responsavel_nome_manual, responsavel_telefone_manual, responsavel_parentesco,
      cultos_extras, enviar_wpp, responsavel_cpf, permitir_sem_cpf,
    } = req.body;

    if (!sessao_id) return res.status(400).json({ error: 'sessao_id obrigatorio' });
    if (!Array.isArray(itens) || itens.length === 0) return res.status(400).json({ error: 'itens obrigatorio (crianca_id + sala_id)' });
    if (itens.some((it) => !it?.crianca_id || !it?.sala_id)) return res.status(400).json({ error: 'cada item precisa de crianca_id e sala_id' });


    const { data: sessao } = await supabase.from('kids_sessoes')
      .select('id, status, culto_id, culto:cultos(data, nome)').eq('id', sessao_id).maybeSingle();
    if (!sessao) return res.status(404).json({ error: 'Sessão não encontrada' });
    if (sessao.status !== 'aberta') return res.status(400).json({ error: 'Sessão não esta aberta', status: sessao.status });
    if (sessao.culto?.data && String(sessao.culto.data).slice(0, 10) < _hojeBRT()) {
      return res.status(409).json({ error: 'Essa sessão é de um culto de outro dia e já foi encerrada. Recarregue o totem.' });
    }


    if (sessao.culto?.data && String(sessao.culto.data).slice(0, 10) > _hojeBRT()
        && await temSessaoAoVivoHoje()) {
      return res.status(409).json({ error: 'Essa sessão é ensaio de um culto de outro dia — escolha um culto de hoje.' });
    }



    const idsCriancas = [...new Set(itens.map((it) => String(it.crianca_id)))];
    const { data: criancasLote, error: errCriancasLote } = await supabase.from('kids_criancas')
      .select('id, nome, data_nascimento').in('id', idsCriancas).is('deleted_at', null);
    if (errCriancasLote) throw errCriancasLote;
    const encontradas = new Set((criancasLote || []).map((c) => c.id));
    const inexistentes = idsCriancas.filter((id) => !encontradas.has(id));
    if (inexistentes.length) return res.status(404).json({ error: 'Uma ou mais crianças não foram encontradas.', criancas_ids: inexistentes });
    const semNascimento = (criancasLote || []).filter((c) => !c.data_nascimento);
    if (semNascimento.length) {
      return res.status(422).json({
        error: 'Informe a data de nascimento de todas as crianças antes do check-in.',
        precisa_data_nascimento: true,
        criancas: semNascimento.map((c) => ({ id: c.id, nome: c.nome })),
      });
    }


    const cpfInformado = normalizarCpf(responsavel_cpf);
    if (responsavel_cpf && !cpfValido(cpfInformado)) {
      return res.status(400).json({ error: 'CPF inválido — confira os números.', precisa_cpf: true });
    }
    let respId = null, respNome = null, respTel = null;
    if (responsavel_id) {
      const { data: m } = await supabase.from('mem_membros').select('id, nome, telefone, cpf').eq('id', responsavel_id).maybeSingle();
      if (!m) return res.status(404).json({ error: 'Responsável não encontrado' });
      respId = m.id; respNome = m.nome; respTel = m.telefone;
      const jaTemCpf = m.cpf && String(m.cpf).replace(/\D/g, '').length === 11;
      if (!jaTemCpf) {
        if (cpfInformado) {


          const { data: outro } = await supabase.from('mem_membros').select('id, nome, telefone').eq('cpf', cpfInformado).neq('id', m.id).maybeSingle();
          if (outro && !ehNomePlaceholder(outro.nome)) { respId = outro.id; respNome = outro.nome; respTel = outro.telefone || respTel; }
          else if (outro) { await transferirCpfDePlaceholder(m.id, outro, cpfInformado); }
          else { await supabase.from('mem_membros').update({ cpf: cpfInformado }).eq('id', m.id); }
        } else if (!permitir_sem_cpf) {
          return res.status(422).json({ error: 'Precisamos do CPF do responsável.', precisa_cpf: true, responsavel_nome: m.nome });
        } else { console.warn(`[totemKids/checkin-lote] CPF dispensado (supervisor) · resp ${m.id}`); }
      }
    } else if (responsavel_nome_manual) {
      if (cpfInformado) {
        const rr = await acharOuCriarGuardado({ cpf: cpfInformado, telefone: normalizarTelefone(responsavel_telefone_manual), nome: responsavel_nome_manual, status: 'visitante', origem: 'kids_responsavel_manual' });
        const { data: m } = await supabase.from('mem_membros').select('id, nome, telefone').eq('id', rr.membro_id).single();
        respId = m.id; respNome = m.nome; respTel = m.telefone || normalizarTelefone(responsavel_telefone_manual);
      } else if (!permitir_sem_cpf) {
        return res.status(422).json({ error: 'Precisamos do CPF do responsável.', precisa_cpf: true });
      } else {
        respNome = responsavel_nome_manual; respTel = normalizarTelefone(responsavel_telefone_manual);
        console.warn('[totemKids/checkin-lote] CPF dispensado (supervisor · manual)');
      }
    }
    if (!respNome) return res.status(400).json({ error: 'responsavel_id ou responsavel_nome_manual obrigatório' });


    const ligarResponsavel = async (criancaId, membroId, parentesco) => {
      if (!membroId) return;
      const { data: link } = await supabase.from('kids_responsaveis')
        .select('crianca_id').eq('crianca_id', criancaId).eq('membro_id', membroId).maybeSingle();
      if (!link) {
        await supabase.from('kids_responsaveis')
          .insert({ crianca_id: criancaId, membro_id: membroId, parentesco: parentesco || 'responsavel', autorizado_buscar: true })
          .then(() => {}, (e) => console.error('[totemKids/checkin-lote] ligar responsável:', e?.message));
      }
    };
    let cultosExtras = Array.isArray(cultos_extras)
      ? [...new Set(cultos_extras.map(String))].filter((cid) => cid && cid !== sessao.culto_id) : [];

    if (cultosExtras.length) {
      const dataPrimaria = String(sessao.culto?.data || '').slice(0, 10);
      const { data: cxs } = await supabase.from('cultos').select('id, data').in('id', cultosExtras);
      const validos = new Set((cxs || []).filter((c) => String(c.data).slice(0, 10) === dataPrimaria).map((c) => c.id));
      const fora = cultosExtras.filter((cid) => !validos.has(cid));
      if (fora.length) console.warn('[totemKids/checkin-lote] cultos extras de outro dia ignorados:', fora.join(','));
      cultosExtras = cultosExtras.filter((cid) => validos.has(cid));
    }
    const codigoNovo = async () => {
      const { data } = await supabase.rpc('fn_kids_gerar_codigo_seguranca');
      return data || (() => { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let c = ''; for (let i = 0; i < 4; i++) c += a[Math.floor(Math.random() * a.length)]; return c; })();
    };
    const colisaoCodigo = (erro) => erro?.code === '23505'
      && /c[oó]digo de seguran[cç]a ativo|kids_codigo_seguranca_ativo_grupo/i.test(`${erro.message || ''} ${erro.details || ''} ${erro.constraint || ''}`);





    async function fazerCheckin(crianca_id, sala_id, codigoLote, grupoFamilia) {
      const { data: existentes } = await supabase.from('kids_checkins')
        .select('id, checkout_at').eq('sessao_id', sessao_id).eq('crianca_id', crianca_id);
      if ((existentes || []).some((c) => !c.checkout_at)) return { crianca_id, ok: false, ja_aberto: true, error: 'já com check-in aberto' };
      const { data: crianca } = await supabase.from('kids_criancas')
        .select('id, nome, data_nascimento, observacoes_medicas, necessidades_especiais').eq('id', crianca_id).maybeSingle();
      if (!crianca) return { crianca_id, ok: false, error: 'criança não encontrada' };
      const { data: sala } = await supabase.from('kids_salas').select('id, nome, cor, logo_url').eq('id', sala_id).maybeSingle();
      if (!sala) return { crianca_id, ok: false, error: 'sala não encontrada' };

      await ligarResponsavel(crianca_id, respId, responsavel_parentesco);

      const codigoFinal = codigoLote;



      const grupoId = grupoFamilia || (cultosExtras.length ? require('crypto').randomUUID() : null);
      const { data: checkin, error: errIns } = await supabase.from('kids_checkins').insert({
        sessao_id, crianca_id, sala_id, estacao_checkin_id: estacao_id || null,
        responsavel_checkin_id: respId, responsavel_checkin_nome: respNome, responsavel_checkin_telefone: respTel,
        responsavel_checkin_parentesco: responsavel_parentesco || null,
        codigo_seguranca: codigoFinal, codigo_barras: codigoFinal, checkin_por: req.user.userId, checkin_grupo_id: grupoId,
      }).select('*').single();
      if (errIns) {
        if (colisaoCodigo(errIns)) return { crianca_id, ok: false, colisao_codigo: true, error: 'colisão temporária de código' };
        if (errIns.code === '23505') return { crianca_id, ok: false, ja_aberto: true, error: 'já com check-in aberto' };
        return { crianca_id, ok: false, error: errIns.message };
      }
      supabase.from('kids_criancas').update({ ativo: true, motivo_inativacao: null, inativado_em: null })
        .eq('id', crianca_id).eq('ativo', false).then(() => {}, () => {});



      promoverVisitanteRecorrente(crianca_id);

      const cultosDoGrupo = [{ id: sessao.culto_id, nome: sessao.culto?.nome || null }];
      for (const cultoId of cultosExtras) {
        try {
          let { data: sx } = await supabase.from('kids_sessoes').select('id, culto:cultos(nome)').eq('culto_id', cultoId).maybeSingle();
          if (!sx) { const { data: nova } = await supabase.from('kids_sessoes').insert({ culto_id: cultoId, status: 'aberta', abrir_em: new Date().toISOString() }).select('id, culto:cultos(nome)').single(); sx = nova; }
          if (!sx) continue;
          const { error: e2 } = await supabase.from('kids_checkins').insert({
            sessao_id: sx.id, crianca_id, sala_id, estacao_checkin_id: estacao_id || null,
            responsavel_checkin_id: respId, responsavel_checkin_nome: respNome, responsavel_checkin_telefone: respTel,
            responsavel_checkin_parentesco: responsavel_parentesco || null,
            codigo_seguranca: codigoFinal, codigo_barras: codigoFinal, checkin_por: req.user.userId, checkin_grupo_id: grupoId, labels_impressas: 0,
          });
          if (!e2 || e2.code === '23505') cultosDoGrupo.push({ id: cultoId, nome: sx.culto?.nome || null });
        } catch (ex) { console.error('[totemKids/checkin-lote] culto extra:', ex.message); }
      }

      if (enviar_wpp && respTel) {
        const template = process.env.WHATSAPP_TEMPLATE_KIDS_RETIRADA;
        if (template) {
          const primeiroNome = String(crianca?.nome || '').trim().split(/\s+/)[0] || 'sua criança';
          const base = (process.env.FRONTEND_URL || '').replace(/\/$/, '');
          const link = `${base}/kids/retirada/${codigoFinal}`;
          require('../services/whatsappFila').enfileirar({
            telefone: respTel, template, params: [primeiroNome, codigoFinal, link],
            idioma: process.env.WHATSAPP_TEMPLATE_KIDS_RETIRADA_LANG || 'pt_BR',
            contexto: 'kids.retirada_codigo',
          }).then(() => {}, () => {});
        }
      }
      return {
        crianca_id, ok: true, checkin, crianca, sala,
        sessao: { id: sessao.id, culto: sessao.culto }, cultos: cultosDoGrupo,
        responsavel: { id: respId, nome: respNome, telefone: respTel, parentesco: responsavel_parentesco },
        codigo_seguranca: codigoFinal, codigo_barras: codigoFinal,
      };
    }




    const grupoIdFamilia = itens.length > 1 ? require('crypto').randomUUID() : null;
    const resultados = [];


    let codigoLote = null;
    let primeiro = null;
    for (let tentativa = 0; tentativa < 5; tentativa++) {
      codigoLote = await codigoNovo();
      primeiro = await fazerCheckin(itens[0].crianca_id, itens[0].sala_id, codigoLote, grupoIdFamilia);
      if (!primeiro?.colisao_codigo) break;
    }
    if (primeiro?.colisao_codigo) {
      return res.status(503).json({ error: 'Não foi possível reservar um código livre. Tente novamente.', pode_tentar_novamente: true });
    }
    resultados.push(primeiro);
    for (const it of itens.slice(1)) {
      try { resultados.push(await fazerCheckin(it.crianca_id, it.sala_id, codigoLote, grupoIdFamilia)); }
      catch (e) { resultados.push({ crianca_id: it.crianca_id, ok: false, error: e.message }); }
    }
    res.status(201).json({ resultados, responsavel: { id: respId, nome: respNome, telefone: respTel } });
  } catch (e) {
    console.error('[totemKids/checkin-lote]', e.message);
    res.status(500).json({ error: 'Erro ao fazer check-in em lote' });
  }
});


router.get('/checkin/codigo/:codigo', authorizeModule('kids', 2), async (req, res) => {
  try {
    const codigo = String(req.params.codigo).toUpperCase().trim();
    if (codigo.length !== 4) return res.status(400).json({ error: 'Codigo invalido' });

    const { data, error } = await supabase
      .from('kids_checkins')
      .select(`
        *,
        crianca:kids_criancas(id, nome, data_nascimento, foto_url, observacoes_medicas, tem_espectro, espectro_qual, tem_alergia, alergia_qual, tem_limitacao_fisica, limitacao_fisica_qual),
        sala:kids_salas(id, nome, cor, logo_url),
        sessao:kids_sessoes(id, status, culto:cultos(id, nome, data))
      `)
      .eq('codigo_seguranca', codigo)
      .is('checkout_at', null)
      .order('checkin_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Código não encontrado ou já foi feito checkout' });


    const { data: responsaveis } = await supabase
      .from('kids_responsaveis')
      .select('id, parentesco, autorizado_buscar, membro:mem_membros(id, nome, telefone, foto_url)')
      .eq('crianca_id', data.crianca.id)
      .eq('autorizado_buscar', true);



    let cultos_grupo = null;
    if (data.checkin_grupo_id) {
      const { data: grupo } = await supabase.from('kids_checkins')
        .select('sessao:kids_sessoes(culto:cultos(id, nome))')
        .eq('checkin_grupo_id', data.checkin_grupo_id).is('checkout_at', null);
      cultos_grupo = (grupo || []).map(g => g.sessao?.culto?.nome).filter(Boolean);
    }

    res.json({ ...data, responsaveis: responsaveis || [], cultos_grupo });
  } catch (e) {
    console.error('[totemKids/checkin/codigo]', e.message);
    res.status(500).json({ error: 'Erro ao buscar código' });
  }
});



router.post('/checkout', authorizeModule('kids', 2), async (req, res) => {
  try {
    const { checkin_id, responsavel_id, responsavel_nome, metodo, override_motivo, codigo_seguranca } = req.body;
    if (!checkin_id) return res.status(400).json({ error: 'checkin_id obrigatorio' });
    if (!metodo) return res.status(400).json({ error: 'metodo obrigatorio' });



    const validMetodos = ['codigo_digitado', 'barcode_escaneado', 'responsavel_autorizado', 'override_supervisor', 'painel'];
    if (!validMetodos.includes(metodo)) return res.status(400).json({ error: 'metodo invalido', validos: validMetodos });


    if (metodo === 'override_supervisor') {
      if (!override_motivo || override_motivo.trim().length < 10) {
        return res.status(400).json({ error: 'override_motivo obrigatorio (min 10 chars)' });
      }

      const podeOverride =
        ['admin', 'diretor'].includes(req.user.role) ||
        (req.user.granular?.modulePerms?.kids?.pode_aprovar) ||
        (req.user.granular?.modulePerms?.kids?.leitura >= 5) ||
        await isLiderKidsDoDia(req.user.userId);
      if (!podeOverride) {
        return res.status(403).json({ error: 'Sem permissão pra override · pedir coord Kids ou admin' });
      }
    }



    const { data: alvo } = await supabase.from('kids_checkins')
      .select('id, crianca_id, checkin_grupo_id, checkout_at, codigo_seguranca, responsavel_checkin_id, responsavel_checkin_nome')
      .eq('id', checkin_id).maybeSingle();
    if (!alvo) return res.status(404).json({ error: 'Check-in não encontrado' });
    if (alvo.checkout_at) return res.status(409).json({ error: 'Check-in já foi feito checkout' });



    if (metodo === 'codigo_digitado' || metodo === 'barcode_escaneado') {
      const codigo = String(codigo_seguranca || '').toUpperCase().trim();
      if (!codigo || codigo !== String(alvo.codigo_seguranca || '').toUpperCase()) {
        return res.status(400).json({ error: 'Código de segurança não confere com este check-in' });
      }
    }



    let respNome = responsavel_nome;
    if (metodo === 'responsavel_autorizado') {
      if (!responsavel_id) return res.status(400).json({ error: 'Selecione o responsável autorizado' });
      const { data: vinculo } = await supabase.from('kids_responsaveis')
        .select('membro:mem_membros(id, nome)')
        .eq('crianca_id', alvo.crianca_id)
        .eq('membro_id', responsavel_id)
        .eq('autorizado_buscar', true)
        .maybeSingle();
      if (!vinculo?.membro) {
        return res.status(403).json({ error: 'Essa pessoa não está autorizada a buscar a criança' });
      }
      respNome = vinculo.membro.nome;
    } else if (metodo === 'codigo_digitado' || metodo === 'barcode_escaneado') {

      respNome = alvo.responsavel_checkin_nome;
    } else if (responsavel_id && !respNome) {
      const { data: m } = await supabase.from('mem_membros').select('nome').eq('id', responsavel_id).maybeSingle();
      respNome = m?.nome;
    }
    if (!respNome && metodo !== 'painel') return res.status(400).json({ error: 'responsavel_nome obrigatorio (snapshot)' });

    const patch = {
      checkout_at: new Date().toISOString(),
      responsavel_checkout_id: responsavel_id || null,
      responsavel_checkout_nome: respNome || null,
      checkout_metodo: metodo,
      checkout_por: req.user.userId,
      override_motivo: metodo === 'override_supervisor' ? override_motivo : null,
      override_aprovado_por: metodo === 'override_supervisor' ? req.user.userId : null,
    };
    let q = supabase.from('kids_checkins').update(patch).is('checkout_at', null);
    q = alvo.checkin_grupo_id ? q.eq('checkin_grupo_id', alvo.checkin_grupo_id) : q.eq('id', checkin_id);
    const { data, error } = await q.select(`*, crianca:kids_criancas(id, nome), sala:kids_salas(id, nome)`);
    if (error) throw error;
    if (!data || !data.length) return res.status(409).json({ error: 'Check-in já foi feito checkout' });








    if (data.some((r) => r.pager_numero)) {
      let qDev = supabase.from('kids_checkins')
        .update({ pager_devolvido_at: new Date().toISOString(), pager_devolvido_por: req.user.userId })
        .not('pager_numero', 'is', null).is('pager_devolvido_at', null).is('deleted_at', null);
      qDev = alvo.checkin_grupo_id ? qDev.eq('checkin_grupo_id', alvo.checkin_grupo_id) : qDev.eq('id', checkin_id);
      await qDev.then(({ error: eDev }) => {
        if (eDev) console.warn('[totemKids/checkout] pager devolvido não carimbado:', eDev.message);
      });
    }

    res.json({ ...data[0], cultos_encerrados: data.length });
  } catch (e) {
    console.error('[totemKids/checkout]', e.message);
    res.status(500).json({ error: 'Erro ao fazer checkout' });
  }
});



router.post('/checkin/:id/reabrir', authorizeModule('kids', 2), async (req, res) => {
  try {
    const { data: alvo } = await supabase.from('kids_checkins')
      .select('id, checkin_grupo_id, checkout_at, sessao:kids_sessoes(status)')
      .eq('id', req.params.id).maybeSingle();
    if (!alvo) return res.status(404).json({ error: 'Check-in não encontrado' });
    if (!alvo.checkout_at) return res.json({ ok: true, ja_presente: true });
    if (alvo.sessao?.status && alvo.sessao.status !== 'aberta') {
      return res.status(409).json({ error: 'A sessão já foi encerrada — não dá pra reabrir o check-in.' });
    }
    const patch = {
      checkout_at: null, responsavel_checkout_id: null, responsavel_checkout_nome: null,
      checkout_metodo: null, checkout_por: null, override_motivo: null, override_aprovado_por: null,


      pager_devolvido_at: null, pager_devolvido_por: null,
      updated_at: new Date().toISOString(),
    };
    let q = supabase.from('kids_checkins').update(patch).not('checkout_at', 'is', null);
    q = alvo.checkin_grupo_id ? q.eq('checkin_grupo_id', alvo.checkin_grupo_id) : q.eq('id', req.params.id);
    const { data, error } = await q.select('id, crianca:kids_criancas(nome)');
    if (error) throw error;
    res.json({ ok: true, reabertos: (data || []).length });
  } catch (e) {
    console.error('[totemKids/checkin/reabrir]', e.message);
    res.status(500).json({ error: 'Erro ao reabrir o check-in' });
  }
});
















router.post('/portao/scan', authorizeModule('kids', 2), async (req, res) => {
  const registrar = async (row) => {
    const { error } = await supabase.from('kids_portao_scans')
      .insert({ criado_por: req.user.userId, ...row });
    if (error) console.warn('[totemKids/portao] log falhou:', error.message);
  };
  try {
    const cru = String(req.body?.codigo || '').toUpperCase().trim();
    if (!/^[A-Z0-9]{4}$/.test(cru)) {
      await registrar({ codigo: cru.slice(0, 24) || '?', resultado: 'nao_reconhecido' });
      return res.json({ resultado: 'nao_reconhecido' });
    }
    const codigo = cru;


    const { data: aberto, error: e1 } = await supabase
      .from('kids_checkins')
      .select('id, checkin_grupo_id, crianca:kids_criancas(id, nome), sala:kids_salas(id, nome, cor, logo_url), sessao:kids_sessoes(id, status)')
      .eq('codigo_seguranca', codigo)
      .is('checkout_at', null)
      .order('checkin_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (e1) throw e1;

    if (aberto && aberto.sessao?.status === 'aberta') {


      const patch = {
        checkout_at: new Date().toISOString(),
        checkout_metodo: 'portao',
        checkout_por: req.user.userId,
      };
      let q = supabase.from('kids_checkins').update(patch).is('checkout_at', null);
      q = aberto.checkin_grupo_id ? q.eq('checkin_grupo_id', aberto.checkin_grupo_id) : q.eq('id', aberto.id);
      const { data: fechados, error: e2 } = await q.select('id');
      if (e2) throw e2;
      if (!fechados || !fechados.length) {

        await registrar({ codigo, checkin_id: aberto.id, crianca_nome: aberto.crianca?.nome, resultado: 'ja_retirada', detalhe: 'corrida entre scans' });
        return res.json({ resultado: 'ja_retirada', crianca: aberto.crianca?.nome || null });
      }
      await registrar({ codigo, checkin_id: aberto.id, crianca_nome: aberto.crianca?.nome, resultado: 'ok' });
      return res.json({
        resultado: 'ok',
        crianca: aberto.crianca?.nome || null,
        sala: aberto.sala ? { nome: aberto.sala.nome, cor: aberto.sala.cor } : null,
        cultos_encerrados: fechados.length,
      });
    }


    if (aberto) {
      await registrar({ codigo, checkin_id: aberto.id, crianca_nome: aberto.crianca?.nome, resultado: 'fora_de_sessao' });
      return res.json({ resultado: 'fora_de_sessao', crianca: aberto.crianca?.nome || null });
    }


    const { data: usado, error: e3 } = await supabase
      .from('kids_checkins')
      .select('id, checkout_at, crianca:kids_criancas(nome), sessao:kids_sessoes(status)')
      .eq('codigo_seguranca', codigo)
      .order('checkin_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (e3) throw e3;

    if (usado && usado.checkout_at && usado.sessao?.status === 'aberta') {

      await registrar({ codigo, checkin_id: usado.id, crianca_nome: usado.crianca?.nome, resultado: 'ja_retirada', detalhe: `retirada anterior em ${usado.checkout_at}` });
      return res.json({ resultado: 'ja_retirada', crianca: usado.crianca?.nome || null, retirada_em: usado.checkout_at });
    }
    if (usado) {
      await registrar({ codigo, checkin_id: usado.id, crianca_nome: usado.crianca?.nome, resultado: 'fora_de_sessao' });
      return res.json({ resultado: 'fora_de_sessao', crianca: usado.crianca?.nome || null });
    }

    await registrar({ codigo, resultado: 'nao_reconhecido' });
    return res.json({ resultado: 'nao_reconhecido' });
  } catch (e) {
    console.error('[totemKids/portao/scan]', e.message);
    res.status(500).json({ error: 'Erro ao validar o código' });
  }
});


router.get('/portao/scans', authorizeModule('kids', 3), async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
    let q = supabase
      .from('kids_portao_scans')
      .select('id, codigo, resultado, crianca_nome, detalhe, created_at, checkin_id')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (req.query.resultado) q = q.eq('resultado', String(req.query.resultado));
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    console.error('[totemKids/portao/scans]', e.message);
    res.status(500).json({ error: 'Erro ao listar scans do portão' });
  }
});


router.patch('/checkin/:id', authorizeModule('kids', 2), async (req, res) => {
  try {
    const allowed = ['observacoes_no_dia', 'fez_decisao_jesus'];
    const update = {};
    for (const k of allowed) if (k in req.body) update[k] = req.body[k];
    if ('fez_decisao_jesus' in update && update.fez_decisao_jesus === true) {
      update.decisao_jesus_marcada_por = req.user.userId;
      update.decisao_jesus_em = new Date().toISOString();
    }
    const { data, error } = await supabase
      .from('kids_checkins')
      .update(update)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao atualizar check-in' });
  }
});









router.get('/painel/dia', authorizeModule('kids', 1), async (req, res) => {
  try {
    const data = req.query.data
      || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    const COLS = 'sessao_id, sala_id, culto_id, data_culto, culto_nome, service_type_name, status, abrir_em, criancas_presentes, criancas_saidas, decisoes_jesus, total_checkins';


    const [rHoje, rAbertas] = await Promise.all([
      supabase.from('vw_kids_sessao_ao_vivo').select(COLS).eq('data_culto', data),
      supabase.from('vw_kids_sessao_ao_vivo').select(COLS).eq('status', 'aberta'),
    ]);
    if (rHoje.error) throw rHoje.error;
    if (rAbertas.error) throw rAbertas.error;
    const vistos = new Set();
    const linhas = [];
    for (const r of [...(rHoje.data || []), ...(rAbertas.data || [])]) {
      const k = `${r.sessao_id}|${r.sala_id ?? ''}`;
      if (vistos.has(k)) continue;
      vistos.add(k);
      linhas.push(r);
    }


    const porCulto = new Map();
    for (const r of (linhas || [])) {
      const k = r.culto_id;
      const cur = porCulto.get(k) || {
        culto_id: r.culto_id,
        sessao_id: r.sessao_id,
        culto_nome: r.culto_nome,
        service_type_name: r.service_type_name,
        abrir_em: r.abrir_em,
        status: r.status,
        presentes: 0, sairam: 0, decisoes: 0, total: 0,
      };
      cur.presentes += Number(r.criancas_presentes) || 0;
      cur.sairam    += Number(r.criancas_saidas) || 0;
      cur.decisoes  += Number(r.decisoes_jesus) || 0;
      cur.total     += Number(r.total_checkins) || 0;

      if (r.status === 'aberta') cur.status = 'aberta';
      porCulto.set(k, cur);
    }
    const lista = Array.from(porCulto.values())
      .sort((a, b) => String(a.abrir_em || '').localeCompare(String(b.abrir_em || '')));




    const sessaoIds = [...new Set(linhas.map(r => r.sessao_id).filter(Boolean))];
    const vistosTotal = new Set(), vistosPresentes = new Set();
    if (sessaoIds.length) {
      let from = 0; const page = 1000;
      for (;;) {
        const { data: cks, error: eCk } = await supabase
          .from('kids_checkins')
          .select('crianca_id, checkout_at')
          .in('sessao_id', sessaoIds)
          .range(from, from + page - 1);
        if (eCk) throw eCk;
        for (const ck of (cks || [])) {
          vistosTotal.add(ck.crianca_id);
          if (!ck.checkout_at) vistosPresentes.add(ck.crianca_id);
        }
        if (!cks || cks.length < page) break;
        from += page;
      }
    }
    res.json({ data, cultos: lista, unicas: { presentes: vistosPresentes.size, total: vistosTotal.size } });
  } catch (e) {
    console.error('[totemKids/painel/dia]', e.message);
    res.status(500).json({ error: 'Erro ao resumir os cultos do dia' });
  }
});




router.post('/painel/checkout-todos', authorizeModule('kids', 3), async (req, res) => {
  try {
    const { data: baixados, error } = await supabase
      .from('kids_checkins')
      .update({
        checkout_at: new Date().toISOString(),
        checkout_metodo: 'checkout_forcado',
        checkout_por: req.user.userId,
        responsavel_checkout_nome: 'Baixa em massa (painel)',
      })
      .is('checkout_at', null)
      .select('id');
    if (error) throw error;
    res.json({ baixados: (baixados || []).length });
  } catch (e) {
    console.error('[totemKids/painel/checkout-todos]', e.message);
    res.status(500).json({ error: 'Erro ao dar baixa em todos' });
  }
});


router.get('/painel/ao-vivo', authorizeModule('kids', 1), async (req, res) => {
  try {
    const sessaoId = req.query.sessao_id;
    let q = supabase.from('vw_kids_sessao_ao_vivo').select('*');
    if (sessaoId) q = q.eq('sessao_id', sessaoId);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: 'Erro no painel ao vivo' });
  }
});


router.get('/painel/sala/:id', authorizeModule('kids', 1), async (req, res) => {
  try {
    const sessaoId = req.query.sessao_id;
    let q = supabase
      .from('kids_checkins')
      .select(`
        id, checkin_at, checkout_at, codigo_seguranca, crianca_id,
        responsavel_checkin_nome, fez_decisao_jesus, observacoes_no_dia,
        crianca:kids_criancas(id, nome, data_nascimento, foto_url, observacoes_medicas, tem_espectro, espectro_qual, tem_alergia, alergia_qual, tem_limitacao_fisica, limitacao_fisica_qual)
      `)
      .eq('sala_id', req.params.id)
      .order('checkin_at', { ascending: false });
    if (sessaoId) q = q.eq('sessao_id', sessaoId);
    const { data, error } = await q;
    if (error) throw error;


    const criancaIds = [...new Set((data || []).map(d => d.crianca_id).filter(Boolean))];
    let resumoPorCrianca = {};
    if (criancaIds.length) {
      const { data: resumo } = await supabase
        .from('vw_kids_decisoes_resumo_crianca')
        .select('crianca_id, total_decisoes')
        .in('crianca_id', criancaIds);
      resumoPorCrianca = Object.fromEntries((resumo || []).map(r => [r.crianca_id, r.total_decisoes]));
    }

    res.json((data || []).map(ci => ({
      ...ci,
      crianca: ci.crianca && {
        ...ci.crianca,
        idade_label: formatIdade(calcIdadeMeses(ci.crianca.data_nascimento)),
      },
      total_decisoes_historico: resumoPorCrianca[ci.crianca_id] || 0,
    })));
  } catch (e) {
    res.status(500).json({ error: 'Erro ao listar crianças da sala' });
  }
});



router.get('/sessoes/:id/criancas-presentes', authorizeModule('kids', 1), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('vw_kids_criancas_presentes_sessao')
      .select('*')
      .eq('sessao_id', req.params.id)
      .order('crianca_nome');
    if (error) throw error;
    res.json((data || []).map(c => ({
      ...c,
      idade_label: formatIdade(calcIdadeMeses(c.data_nascimento)),
    })));
  } catch (e) {
    console.error('[totemKids/sessoes/criancas-presentes]', e.message);
    res.status(500).json({ error: 'Erro ao listar crianças presentes' });
  }
});


router.get('/decisoes/historico/:criancaId', authorizeModule('kids', 1), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('vw_kids_decisoes_historico_crianca')
      .select('*')
      .eq('crianca_id', req.params.criancaId)
      .order('sequencia_decisao');
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar histórico de decisões' });
  }
});


router.get('/decisoes/resumo-por-crianca', authorizeModule('kids', 1), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('vw_kids_decisoes_resumo_crianca')
      .select('*')
      .gt('total_decisoes', 0)
      .order('total_decisoes', { ascending: false })
      .order('nome');
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar resumo de decisões' });
  }
});














router.get('/decisoes/registro', authorizeModule('kids', 1), async (req, res) => {
  try {





    const janela = resolverJanelaPeriodo({
      dias: req.query.dias, ano: req.query.ano,
      diasValidos: [90, 365, 1095], diasPadrao: 365,
    });
    const { inicio, fim } = janela;



    const { data: filaRaw, error: eFila } = await supabase
      .from('kids_conversoes_import')
      .select('id, lote, linha, nome_planilha, idade_planilha, tel_planilha, data_decisao, periodo, culto_txt, obs_planilha, faixa, motivo, crianca_id, culto_id, culto_origem, decisao_id, status, decidido_em, decisao_nota')
      .is('deleted_at', null)
      .order('status')
      .order('data_decisao');
    if (eFila) throw eFila;
    const fila = filaRaw || [];


    const criancaIds = [...new Set(fila.map(f => f.crianca_id).filter(Boolean))];
    const nomePorCrianca = new Map();
    for (let i = 0; i < criancaIds.length; i += 200) {
      const { data, error } = await supabase.from('kids_criancas')
        .select('id, nome, ativo, data_nascimento, data_conversao')
        .in('id', criancaIds.slice(i, i + 200));
      if (error) throw error;
      (data || []).forEach(k => nomePorCrianca.set(k.id, k));
    }

    const cultoIds = [...new Set(fila.map(f => f.culto_id).filter(Boolean))];
    const cultoPorId = new Map();
    for (let i = 0; i < cultoIds.length; i += 200) {
      const { data, error } = await supabase.from('cultos')
        .select('id, nome, data, hora, decisoes_kids')
        .in('id', cultoIds.slice(i, i + 200));
      if (error) throw error;
      (data || []).forEach(c => cultoPorId.set(c.id, c));
    }


    let q = supabase
      .from('vw_kids_decisoes_historico_crianca')
      .select('decisao_id, crianca_id, crianca_nome, culto_id, culto_nome, data_culto, data_decisao, sequencia_decisao, total_decisoes_crianca')
      .gte('data_decisao', inicio);
    if (fim) q = q.lte('data_decisao', fim);
    const { data: nominaisRaw, error: eNom } = await q.order('data_decisao', { ascending: false }).limit(500);
    if (eNom) throw eNom;

    res.json({
      janela: { inicio, fim, rotulo: rotuloJanela(janela) },
      resumo: resumoFilaKids(fila),
      fila: fila.map(f => ({
        ...f,
        crianca: f.crianca_id ? (nomePorCrianca.get(f.crianca_id) || null) : null,
        culto: f.culto_id ? (cultoPorId.get(f.culto_id) || null) : null,
      })),
      nominais: nominaisRaw || [],

      nominais_teto: 500,
      nominais_truncado: (nominaisRaw || []).length === 500,
    });
  } catch (e) {
    console.error('[totemKids/decisoes/registro]', e.message);
    res.status(500).json({ error: 'Erro ao carregar o registro de decisões', detalhe: e.message });
  }
});














router.get('/decisoes/buscar', authorizeModule('kids', 1), async (req, res) => {
  try {
    const tokens = tokensDaBusca(req.query.q);


    if (!tokens.length) {
      return res.json({ termo: String(req.query.q || ''), itens: [], total: 0, truncado: false, aviso: 'digite ao menos 2 letras' });
    }

    const vistos = new Map();
    for (const t of tokens) {
      const { data, error } = await supabase.from('kids_criancas')
        .select('id, nome, nome_norm, ativo, visitante, data_nascimento, data_conversao')
        .ilike('nome_norm', `%${t}%`)
        .is('deleted_at', null)
        .limit(80);


      if (error) throw error;
      (data || []).forEach((k) => vistos.set(k.id, k));
    }

    const ids = [...vistos.keys()];
    let decisoes = [];
    if (ids.length) {

      for (let i = 0; i < ids.length; i += 200) {
        const { data, error } = await supabase.from('cultos_decisoes_pessoas')
          .select('kids_crianca_id, decidiu_em, registrado_em, cultos(nome)')
          .eq('tipo_decisao', 'kids')
          .is('deleted_at', null)
          .in('kids_crianca_id', ids.slice(i, i + 200));
        if (error) throw error;
        decisoes = decisoes.concat((data || []).map((d) => ({ ...d, culto_nome: d?.cultos?.nome || null })));
      }
    }

    res.json(montarResultado({ criancas: [...vistos.values()], decisoes, termo: req.query.q }));
  } catch (e) {
    console.error('[totemKids/decisoes/buscar]', e.message);
    res.status(500).json({ error: 'Erro ao buscar criança', detalhe: e.message });
  }
});




router.get('/decisoes/fila/:id/candidatos', authorizeModule('kids', 1), async (req, res) => {
  try {
    const { data: linha, error: eL } = await supabase
      .from('kids_conversoes_import')
      .select('*').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (eL) throw eL;
    if (!linha) return res.status(404).json({ error: 'Linha não encontrada' });

    const tokens = String(linha.nome_norm_planilha || '')
      .split(/\s+/).filter(t => t.length >= 3 && !['de','da','do','das','dos','e'].includes(t));
    if (!tokens.length) return res.json({ linha, candidatos: [] });



    const vistos = new Map();
    for (const t of tokens) {
      const { data, error } = await supabase.from('kids_criancas')
        .select('id, nome, nome_norm, ativo, data_nascimento, data_conversao, visitante')
        .ilike('nome_norm', `%${t}%`)
        .is('deleted_at', null)
        .limit(60);
      if (error) throw error;
      (data || []).forEach(k => vistos.set(k.id, k));
    }

    const idadeNa = (nasc) => {
      if (!nasc) return null;
      const d = new Date(`${nasc}T12:00:00`);
      const ref = new Date(`${linha.data_decisao}T12:00:00`);
      let a = ref.getFullYear() - d.getFullYear();
      const m = ref.getMonth() - d.getMonth();
      if (m < 0 || (m === 0 && ref.getDate() < d.getDate())) a -= 1;
      return a;
    };

    const candidatos = [...vistos.values()].map(k => {
      const tk = String(k.nome_norm || '').split(/\s+/).filter(Boolean);
      const comuns = tokens.filter(t => tk.some(x => x === t)).length;
      const ina = idadeNa(k.data_nascimento);

      const idadeVeta = linha.idade_planilha != null && ina != null && Math.abs(linha.idade_planilha - ina) > 1;
      return {
        ...k, idade_na_data: ina, tokens_comuns: comuns, idade_veta: idadeVeta,
        idade_confere: linha.idade_planilha != null && ina != null && Math.abs(linha.idade_planilha - ina) <= 1,
      };
    }).sort((a, b) =>
      (a.idade_veta ? 1 : 0) - (b.idade_veta ? 1 : 0) ||
      b.tokens_comuns - a.tokens_comuns ||
      (b.idade_confere ? 1 : 0) - (a.idade_confere ? 1 : 0) ||
      (b.ativo ? 1 : 0) - (a.ativo ? 1 : 0) ||
      String(a.nome).localeCompare(String(b.nome))
    ).slice(0, 10);

    res.json({ linha, candidatos, total_examinados: vistos.size });
  } catch (e) {
    console.error('[totemKids/decisoes/candidatos]', e.message);
    res.status(500).json({ error: 'Erro ao buscar candidatos', detalhe: e.message });
  }
});


router.patch('/decisoes/fila/:id', authorizeModule('kids', 3), async (req, res) => {
  try {
    const { acao, crianca_id: criancaId, culto_id: cultoId, nota } = req.body || {};

    const { data: linha, error: eL } = await supabase
      .from('kids_conversoes_import')
      .select('*').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (eL) throw eL;
    if (!linha) return res.status(404).json({ error: 'Linha não encontrada' });


    const v = avaliarResolucaoKids({ linha, acao, criancaId, nota });
    if (!v.ok) return res.status(v.codigo === 'transicao_invalida' ? 409 : 400).json({ error: v.mensagem, codigo: v.codigo });

    const patch = {
      status: v.statusNovo,
      decidido_por: req.user?.id ?? null,
      decidido_em: new Date().toISOString(),
      decisao_nota: typeof nota === 'string' && nota.trim() ? nota.trim().slice(0, 500) : linha.decisao_nota,
      updated_at: new Date().toISOString(),
    };

    if (v.vincula) {

      const { data: k, error: eK } = await supabase.from('kids_criancas')
        .select('id, nome, data_conversao').eq('id', criancaId).is('deleted_at', null).maybeSingle();
      if (eK) throw eK;
      if (!k) return res.status(400).json({ error: 'Criança não encontrada', codigo: 'crianca_inexistente' });


      let cultoFinal = linha.culto_id;
      if (cultoId) {
        const { data: c, error: eC } = await supabase.from('cultos')
          .select('id, data').eq('id', cultoId).maybeSingle();
        if (eC) throw eC;
        if (!c) return res.status(400).json({ error: 'Culto não encontrado', codigo: 'culto_inexistente' });


        if (c.data !== linha.data_decisao) {
          return res.status(400).json({ error: 'O culto escolhido não é do dia desta decisão.', codigo: 'culto_de_outro_dia' });
        }
        cultoFinal = cultoId;
      }




      const { data: dec, error: eD } = await supabase
        .from('cultos_decisoes_pessoas')
        .insert({
          culto_id: cultoFinal,
          tipo_decisao: 'kids',
          nome: linha.nome_planilha,
          idade: linha.idade_planilha,
          kids_crianca_id: criancaId,
          decidiu_em: linha.data_decisao,
          fonte: 'importacao_planilha_kids',
          responsavel_telefone: linha.tel_planilha,
          observacoes: `Conferido na tela · planilha CONVERSOES_CBKIDS 2026 linha ${linha.linha} · ${linha.culto_txt}`
            + (nota ? ` · nota: ${String(nota).slice(0, 200)}` : ''),
        })
        .select('id')
        .maybeSingle();
      if (eD && eD.code !== '23505') throw eD;

      let decisaoId = dec?.id || null;
      if (!decisaoId) {

        const { data: ja } = await supabase.from('cultos_decisoes_pessoas')
          .select('id').eq('fonte', 'importacao_planilha_kids')
          .eq('kids_crianca_id', criancaId).eq('decidiu_em', linha.data_decisao)
          .is('deleted_at', null).limit(1).maybeSingle();
        decisaoId = ja?.id || null;
      }

      patch.crianca_id = criancaId;
      patch.culto_id = cultoFinal;
      patch.decisao_id = decisaoId;
      patch.data_conversao_antes = k.data_conversao;
      patch.status = 'aplicada';


      if (!k.data_conversao) {
        const { error: eU } = await supabase.from('kids_criancas')
          .update({ data_conversao: linha.data_decisao })
          .eq('id', criancaId).is('data_conversao', null);
        if (eU) console.error('[decisoes/fila] data_conversao:', eU.message);
      }



      if (cultoFinal) {
        const { count } = await supabase.from('cultos_decisoes_pessoas')
          .select('id', { count: 'exact', head: true })
          .eq('culto_id', cultoFinal).eq('tipo_decisao', 'kids').is('deleted_at', null);
        const { data: cAtual } = await supabase.from('cultos')
          .select('decisoes_kids').eq('id', cultoFinal).maybeSingle();
        const novo = Math.max(Number(cAtual?.decisoes_kids || 0), Number(count || 0));
        if (novo !== Number(cAtual?.decisoes_kids || 0)) {
          const { error: eAg } = await supabase.from('cultos')
            .update({ decisoes_kids: novo }).eq('id', cultoFinal);
          if (eAg) console.error('[decisoes/fila] agregado:', eAg.message);
        }
      }
    }

    const { data: fim, error: eF } = await supabase
      .from('kids_conversoes_import')
      .update(patch).eq('id', linha.id).is('deleted_at', null)
      .select('*').maybeSingle();
    if (eF) throw eF;
    if (!fim) return res.status(409).json({ error: 'A linha mudou enquanto você decidia. Recarregue.' });

    res.json({ ok: true, linha: fim });
  } catch (e) {
    console.error('[totemKids/decisoes/fila PATCH]', e.message);
    res.status(500).json({ error: 'Erro ao registrar a decisão', detalhe: e.message });
  }
});





router.get('/salas', authorizeModule('kids', 1), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('kids_salas')
      .select('*')
      .order('ordem')
      .order('nome');
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao listar salas' });
  }
});

router.post('/salas', authorizeModule('kids', 3), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('kids_salas')
      .insert(req.body)
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao criar sala' });
  }
});

router.patch('/salas/:id', authorizeModule('kids', 3), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('kids_salas')
      .update(req.body)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao editar sala' });
  }
});





router.delete('/salas/:id', authorizeModule('kids', 5), async (req, res) => {
  try {
    const salaId = req.params.id;
    const { count: nChk } = await supabase
      .from('kids_checkins').select('id', { count: 'exact', head: true }).eq('sala_id', salaId);
    if (nChk && nChk > 0) {
      return res.status(409).json({
        error: `Esta sala tem ${nChk} check-in(s) no histórico e não pode ser excluída permanentemente. Desative-a em vez de excluir.`,
      });
    }
    const { error } = await supabase.from('kids_salas').delete().eq('id', salaId);
    if (error) {
      if (error.code === '23503') {
        return res.status(409).json({
          error: 'Esta sala está em uso (registros vinculados) e não pode ser excluída. Desative-a em vez de excluir.',
        });
      }
      throw error;
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('[totemKids] excluir sala:', e.message);
    res.status(500).json({ error: 'Erro ao excluir sala' });
  }
});




router.post('/salas/:id/logo', authorizeModule('kids', 3), async (req, res) => {
  try {
    const { dataUrl } = req.body || {};
    const m = String(dataUrl || '').match(/^data:(image\/(png|jpe?g|webp));base64,(.+)$/);
    if (!m) return res.status(400).json({ error: 'Imagem inválida' });
    const mime = m[1];
    const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
    const buffer = Buffer.from(m[3], 'base64');
    if (buffer.length > 3 * 1024 * 1024) return res.status(413).json({ error: 'Imagem muito grande (máx 3MB)' });
    const path = `kids-logos/${req.params.id}.${ext}`;
    const { error: upErr } = await supabase.storage.from('fotos-membros').upload(path, buffer, { contentType: mime, upsert: true });
    if (upErr) throw upErr;
    const { data: urlData } = supabase.storage.from('fotos-membros').getPublicUrl(path);
    const logo_url = `${urlData.publicUrl}?t=${Date.now()}`;
    const { error: dbErr } = await supabase.from('kids_salas').update({ logo_url }).eq('id', req.params.id);
    if (dbErr) throw dbErr;
    res.json({ logo_url });
  } catch (e) {
    console.error('[totemKids] logo sala:', e.message);
    res.status(500).json({ error: 'Erro ao salvar a logo da sala' });
  }
});


router.post('/salas/:id/logo/remover', authorizeModule('kids', 3), async (req, res) => {
  try {
    for (const ext of ['png', 'jpg', 'webp']) {
      await supabase.storage.from('fotos-membros').remove([`kids-logos/${req.params.id}.${ext}`]).catch(() => {});
    }
    const { error } = await supabase.from('kids_salas').update({ logo_url: null }).eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('[totemKids] remover logo sala:', e.message);
    res.status(500).json({ error: 'Erro ao remover a logo' });
  }
});


router.get('/etiqueta-config', authorizeModule('kids', 1), async (req, res) => {
  try {
    const { data } = await supabase.from('kids_etiqueta_config').select('*').eq('id', 1).maybeSingle();
    res.json(data || { logo_tamanho: 'M', logo_posicao: 'esquerda', nome_tamanho: 'auto', fonte: 'sans', escala_fonte: 'M' });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao carregar layout' });
  }
});

router.put('/etiqueta-config', authorizeModule('kids', 3), async (req, res) => {
  try {
    const tamOk = ['P', 'M', 'G'];
    const posOk = ['esquerda', 'direita', 'acima'];
    const nomeOk = ['auto', 'P', 'M', 'G'];
    const fonteOk = ['sans', 'condensada', 'arredondada', 'serif', 'mono'];
    const escalaOk = ['P', 'M', 'G', 'GG'];
    const patch = { id: 1, updated_at: new Date().toISOString() };
    if (tamOk.includes(req.body?.logo_tamanho)) patch.logo_tamanho = req.body.logo_tamanho;
    if (posOk.includes(req.body?.logo_posicao)) patch.logo_posicao = req.body.logo_posicao;
    if (nomeOk.includes(req.body?.nome_tamanho)) patch.nome_tamanho = req.body.nome_tamanho;
    if (fonteOk.includes(req.body?.fonte)) patch.fonte = req.body.fonte;
    if (escalaOk.includes(req.body?.escala_fonte)) patch.escala_fonte = req.body.escala_fonte;
    const { data, error } = await supabase.from('kids_etiqueta_config')
      .upsert(patch, { onConflict: 'id' }).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[totemKids] etiqueta-config:', e.message);
    res.status(500).json({ error: 'Erro ao salvar layout' });
  }
});



router.post('/etiqueta-config/logo', authorizeModule('kids', 3), async (req, res) => {
  try {
    const { dataUrl } = req.body || {};
    const m = String(dataUrl || '').match(/^data:(image\/(png|jpe?g|webp));base64,(.+)$/);
    if (!m) return res.status(400).json({ error: 'Imagem inválida' });
    const mime = m[1];
    const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
    const buffer = Buffer.from(m[3], 'base64');
    if (buffer.length > 3 * 1024 * 1024) return res.status(413).json({ error: 'Imagem muito grande (máx 3MB)' });
    const path = `kids-logos/_aniversario.${ext}`;
    const { error: upErr } = await supabase.storage.from('fotos-membros').upload(path, buffer, { contentType: mime, upsert: true });
    if (upErr) throw upErr;
    const { data: urlData } = supabase.storage.from('fotos-membros').getPublicUrl(path);
    const logo_aniversario_url = `${urlData.publicUrl}?t=${Date.now()}`;
    const { error: dbErr } = await supabase.from('kids_etiqueta_config')
      .upsert({ id: 1, logo_aniversario_url, updated_at: new Date().toISOString() }, { onConflict: 'id' });
    if (dbErr) throw dbErr;
    res.json({ logo_aniversario_url });
  } catch (e) {
    console.error('[totemKids] etiqueta-config logo:', e.message);
    res.status(500).json({ error: 'Erro ao salvar a logo' });
  }
});


router.post('/etiqueta-config/logo/remover', authorizeModule('kids', 3), async (req, res) => {
  try {
    for (const ext of ['png', 'jpg', 'webp']) {
      await supabase.storage.from('fotos-membros').remove([`kids-logos/_aniversario.${ext}`]).catch(() => {});
    }
    const { error } = await supabase.from('kids_etiqueta_config')
      .upsert({ id: 1, logo_aniversario_url: null, updated_at: new Date().toISOString() }, { onConflict: 'id' });
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('[totemKids] etiqueta-config logo remover:', e.message);
    res.status(500).json({ error: 'Erro ao remover a logo' });
  }
});





router.post('/etiquetas-log', authorizeModule('kids', 2), async (req, res) => {
  try {


    if (Array.isArray(req.body?.eventos)) {
      const eventos = req.body.eventos.filter((e) => e && e.checkin_id && e.tipo).slice(0, 30);
      if (!eventos.length) return res.status(400).json({ error: 'eventos vazio (checkin_id e tipo obrigatórios)' });
      const rows = eventos.map((e) => ({
        checkin_id: e.checkin_id,
        estacao_id: e.estacao_id || null,
        tipo: e.tipo,
        conteudo_json: e.conteudo || {},
        reimpressao: !!e.reimpressao,
        motivo_reimpressao: e.motivo_reimpressao || null,
        impressa_por: req.user.userId,
        status: e.status || 'enviada',
        erro: e.erro || null,
      }));
      let { error } = await supabase.from('kids_etiquetas_log').insert(rows);
      if (error && error.code === '23503' && String(error.message || '').includes('estacao')) {
        ({ error } = await supabase.from('kids_etiquetas_log')
          .insert(rows.map((r) => ({ ...r, estacao_id: null }))));
      }
      if (error && error.code === '23514') {
        return res.status(400).json({ error: 'tipo ou status inválido', detalhe: error.message });
      }
      if (error) throw error;

      const porCheckin = {};
      for (const r of rows) porCheckin[r.checkin_id] = (porCheckin[r.checkin_id] || 0) + 1;
      for (const [cid, n] of Object.entries(porCheckin)) {
        const { data: cur } = await supabase
          .from('kids_checkins').select('labels_impressas').eq('id', cid).maybeSingle();
        if (cur) {
          await supabase.from('kids_checkins')
            .update({ labels_impressas: (cur.labels_impressas || 0) + n }).eq('id', cid);
        }
      }
      return res.status(201).json({ ok: true, inseridos: rows.length });
    }

    const { checkin_id, estacao_id, tipo, conteudo, reimpressao, motivo_reimpressao, status, erro } = req.body;
    if (!checkin_id || !tipo) return res.status(400).json({ error: 'checkin_id e tipo obrigatórios' });

    const row = {
      checkin_id,
      estacao_id: estacao_id || null,
      tipo,
      conteudo_json: conteudo || {},
      reimpressao: !!reimpressao,
      motivo_reimpressao: motivo_reimpressao || null,
      impressa_por: req.user.userId,
      status: status || 'enviada',
      erro: erro || null,
    };
    let { data, error } = await supabase.from('kids_etiquetas_log').insert(row).select('id').single();



    if (error && error.code === '23503' && String(error.message || '').includes('estacao')) {
      ({ data, error } = await supabase.from('kids_etiquetas_log')
        .insert({ ...row, estacao_id: null }).select('id').single());
    }

    if (error && error.code === '23514') {
      return res.status(400).json({ error: 'tipo ou status inválido', detalhe: error.message });
    }
    if (error) throw error;


    const { data: cur } = await supabase
      .from('kids_checkins').select('labels_impressas').eq('id', checkin_id).maybeSingle();
    if (cur) {
      await supabase
        .from('kids_checkins')
        .update({ labels_impressas: (cur.labels_impressas || 0) + 1 })
        .eq('id', checkin_id);
    }

    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao logar etiqueta' });
  }
});


router.get('/auditoria/overrides', authorizeModule('kids', 3), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('kids_checkins')
      .select(`
        id, checkin_at, checkout_at, codigo_seguranca,
        responsavel_checkin_nome, responsavel_checkout_nome,
        override_motivo, override_aprovado_por,
        crianca:kids_criancas(id, nome),
        sessao:kids_sessoes(id, culto:cultos(nome, data))
      `)
      .eq('checkout_metodo', 'override_supervisor')
      .order('checkout_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao listar overrides' });
  }
});


router.get('/historico/crianca/:id', authorizeModule('kids', 1), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('vw_kids_historico_crianca')
      .select('*')
      .eq('crianca_id', req.params.id)
      .order('data_culto', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar histórico' });
  }
});






function normalizeColName(s) {
  return String(s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}


const COL_ALIASES = {
  nome_crianca:           ['nome_crianca','nome','crianca','child_name','first_name'],
  data_nascimento:        ['data_nascimento','nascimento','aniversario','birthdate','dob','data_nasc'],
  sexo:                   ['sexo','genero','gender'],
  alergia:                ['alergia','alergias','observacoes_medicas','medical','medical_notes','allergies'],
  observacoes:            ['observacoes','obs','notas','notes','observacao'],
  responsavel_nome:       ['responsavel_nome','responsavel','mae','pai',['house', 'hold_name'].join(''),'parent_name'],
  responsavel_telefone:   ['responsavel_telefone','telefone','phone','mobile'],
  responsavel_cpf:        ['responsavel_cpf','cpf'],
  responsavel_parentesco: ['responsavel_parentesco','parentesco','relationship'],
  responsavel2_nome:      ['responsavel2_nome','responsavel_2','segundo_responsavel','parent2_name'],
  responsavel2_telefone:  ['responsavel2_telefone','telefone2','phone2'],
  responsavel2_cpf:       ['responsavel2_cpf','cpf2'],
  responsavel2_parentesco: ['responsavel2_parentesco','parentesco2'],
  ultima_visita:          ['ultima_visita','ultima_presenca','last_visit'],
};


function resolveColumnMap(firstRow) {
  const keys = Object.keys(firstRow).map(k => ({ original: k, norm: normalizeColName(k) }));
  const map = {};
  for (const [logico, aliases] of Object.entries(COL_ALIASES)) {
    const found = keys.find(k => aliases.includes(k.norm));
    if (found) map[logico] = found.original;
  }
  return map;
}

function pickRowValue(row, colMap, logico) {
  const orig = colMap[logico];
  if (!orig) return null;
  const v = row[orig];
  if (v == null || v === '') return null;
  return typeof v === 'string' ? v.trim() : v;
}

function normalizeTelefone(t) {
  if (!t) return null;
  const d = String(t).replace(/\D/g, '');
  return d.length >= 8 ? d : null;
}
function normalizeCpf(c) {
  if (!c) return null;
  const d = String(c).replace(/\D/g, '');
  return d.length === 11 ? d : null;
}
function normalizeDateStr(v) {
  if (v == null || v === '') return null;

  if (typeof v === 'number') {
    try {
      const d = XLSX.SSF.parse_date_code(v);
      if (d) return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
    } catch {                   }
  }

  if (v instanceof Date && !isNaN(v.getTime())) {
    return v.toISOString().slice(0, 10);
  }
  const s = String(v).trim();

  const m1 = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(s);
  if (m1) {
    const ano = m1[3].length === 2 ? `20${m1[3]}` : m1[3];
    return `${ano}-${m1[2].padStart(2,'0')}-${m1[1].padStart(2,'0')}`;
  }

  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}
function normalizeSexo(v) {
  if (!v) return null;
  const s = String(v).trim().toLowerCase();
  if (['m','masc','masculino','male','menino','boy','h','homem'].includes(s)) return 'M';
  if (['f','fem','feminino','female','menina','girl','mulher'].includes(s)) return 'F';
  return null;
}
function normalizeParentesco(v) {
  if (!v) return null;
  const s = String(v).trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (['mae','mother','mom'].includes(s)) return 'mae';
  if (['pai','father','dad'].includes(s)) return 'pai';
  if (['padrasto','step_father','step-father'].includes(s)) return 'padrasto';
  if (['madrasta','step_mother','step-mother'].includes(s)) return 'madrasta';
  if (['avo','avo_a','avo(a)','grandparent','grandpa','grandma','vovo','vovó'].includes(s)) return 'avo_a';
  if (['tio','tia','tio_a','tio(a)','uncle','aunt'].includes(s)) return 'tio_a';
  if (['irmao','irma','irmao_a','irmao(a)','brother','sister'].includes(s)) return 'irmao_a';
  if (['tutor','guardian'].includes(s)) return 'tutor';
  return 'outro';
}


async function resolveOrCreateMembro({ nome, telefone, cpf, parentesco }) {

  const r = await acharOuCriarGuardado({
    cpf, telefone, nome, status: 'visitante',
    extra: { parentesco: parentesco === 'mae' || parentesco === 'pai' ? 'responsavel' : null },
    origem: 'kids_responsavel',
  });
  const { data: membro } = await supabase.from('mem_membros')
    .select('id, nome, familia_id, parentesco').eq('id', r.membro_id).single();
  return { membro, criado: !!r.created };
}

async function getOrCreateFamilia(membro) {
  if (membro.familia_id) return membro.familia_id;
  const primeiroNome = (membro.nome || 'Familia').split(' ')[0];
  const { data, error } = await supabase.from('mem_familias')
    .insert({ nome: `Familia ${primeiroNome}` })
    .select('id').single();
  if (error) throw error;
  await supabase.from('mem_membros').update({ familia_id: data.id }).eq('id', membro.id);
  return data.id;
}


async function processarLinhaImport(row, colMap, dryRun, userId) {
  const nomeCrianca = pickRowValue(row, colMap, 'nome_crianca');
  const respNome = pickRowValue(row, colMap, 'responsavel_nome');
  const respTel = normalizeTelefone(pickRowValue(row, colMap, 'responsavel_telefone'));

  if (!nomeCrianca) return { status: 'erro', msg: 'nome_crianca obrigatorio' };
  if (!respNome) return { status: 'erro', msg: 'responsavel_nome obrigatorio' };
  if (!respTel) return { status: 'erro', msg: 'responsavel_telefone obrigatorio (>=8 digitos)' };

  const dataNasc = normalizeDateStr(pickRowValue(row, colMap, 'data_nascimento'));
  const sexo = normalizeSexo(pickRowValue(row, colMap, 'sexo'));
  const alergia = pickRowValue(row, colMap, 'alergia');
  const obs = pickRowValue(row, colMap, 'observacoes');
  const respCpf = normalizeCpf(pickRowValue(row, colMap, 'responsavel_cpf'));
  const respParentesco = normalizeParentesco(pickRowValue(row, colMap, 'responsavel_parentesco'));

  if (dryRun) {
    return { status: 'preview', msg: `${nomeCrianca} → resp ${respNome}` };
  }


  const { membro: resp1, criado: resp1Criado } = await resolveOrCreateMembro({
    nome: respNome, telefone: respTel, cpf: respCpf, parentesco: respParentesco,
  });


  const familiaId = await getOrCreateFamilia(resp1);


  const { data: jaExiste } = await supabase
    .from('kids_criancas')
    .select('id')
    .ilike('nome', nomeCrianca)
    .eq('familia_id', familiaId)
    .maybeSingle();

  let criancaId;
  let statusResp;
  if (jaExiste) {
    criancaId = jaExiste.id;
    const update = {};
    if (dataNasc) update.data_nascimento = dataNasc;
    if (sexo) update.sexo = sexo;
    if (alergia) update.observacoes_medicas = alergia;
    if (obs) update.observacoes_internas = obs;
    if (Object.keys(update).length) {
      await supabase.from('kids_criancas').update(update).eq('id', criancaId);
    }
    statusResp = 'atualizada';
  } else {
    const { data: nova, error } = await supabase.from('kids_criancas').insert({
      nome: nomeCrianca,
      data_nascimento: dataNasc,
      sexo,
      familia_id: familiaId,
      observacoes_medicas: alergia,
      observacoes_internas: obs,
      visitante: true,



      data_limite: _dataLimiteVisitante(),
      ativo: true,
      created_by: userId,
    }).select('id').single();
    if (error) throw error;
    criancaId = nova.id;
    statusResp = 'criada';
  }


  await supabase.from('kids_responsaveis').upsert({
    crianca_id: criancaId,
    membro_id: resp1.id,
    parentesco: respParentesco,
    autorizado_buscar: true,
  }, { onConflict: 'crianca_id,membro_id', ignoreDuplicates: false });


  const resp2Nome = pickRowValue(row, colMap, 'responsavel2_nome');
  const resp2Tel = normalizeTelefone(pickRowValue(row, colMap, 'responsavel2_telefone'));
  if (resp2Nome && resp2Tel) {
    const resp2Cpf = normalizeCpf(pickRowValue(row, colMap, 'responsavel2_cpf'));
    const resp2Parentesco = normalizeParentesco(pickRowValue(row, colMap, 'responsavel2_parentesco'));
    try {
      const { membro: resp2 } = await resolveOrCreateMembro({
        nome: resp2Nome, telefone: resp2Tel, cpf: resp2Cpf, parentesco: resp2Parentesco,
      });

      if (!resp2.familia_id) {
        await supabase.from('mem_membros').update({ familia_id: familiaId }).eq('id', resp2.id);
      }
      await supabase.from('kids_responsaveis').upsert({
        crianca_id: criancaId,
        membro_id: resp2.id,
        parentesco: resp2Parentesco,
        autorizado_buscar: true,
      }, { onConflict: 'crianca_id,membro_id', ignoreDuplicates: false });
    } catch (e) {
      console.warn('[import] resp2 falhou:', e.message);
    }
  }

  return {
    status: statusResp,
    msg: `${nomeCrianca} → ${respNome}${resp1Criado ? ' (resp novo)' : ''}`,
  };
}


router.post(
  '/criancas/importar',
  authorizeModule('kids', 3),
  xlsxUpload.single('arquivo'),
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'arquivo obrigatorio (campo "arquivo")' });

      const dryRun = ['1','true','yes'].includes(String(req.query.dry_run || '').toLowerCase());

      const wb = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
      const sheetName = wb.SheetNames[0];
      if (!sheetName) return res.status(400).json({ error: 'planilha vazia' });
      const sheet = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false });
      if (!rows.length) return res.status(400).json({ error: 'nenhuma linha encontrada' });

      const colMap = resolveColumnMap(rows[0]);

      const colObrigatorias = ['nome_crianca','responsavel_nome','responsavel_telefone'];
      const faltando = colObrigatorias.filter(c => !colMap[c]);
      if (faltando.length) {
        return res.status(400).json({
          error: 'colunas obrigatorias faltando',
          faltando,
          colunas_encontradas: Object.keys(rows[0]),
          colunas_mapeadas: colMap,
        });
      }

      const relatorio = { total: rows.length, criadas: 0, atualizadas: 0, preview: 0, erros: 0, detalhes: [] };

      for (let i = 0; i < rows.length; i++) {
        try {
          const r = await processarLinhaImport(rows[i], colMap, dryRun, req.user.userId);
          if (r.status === 'criada') relatorio.criadas++;
          else if (r.status === 'atualizada') relatorio.atualizadas++;
          else if (r.status === 'preview') relatorio.preview++;
          else if (r.status === 'erro') relatorio.erros++;
          relatorio.detalhes.push({ linha: i + 2, ...r });
        } catch (e) {
          relatorio.erros++;
          relatorio.detalhes.push({ linha: i + 2, status: 'erro', msg: e.message || 'erro desconhecido' });
        }
      }

      res.json({ dry_run: dryRun, coluna_mapeamento: colMap, ...relatorio });
    } catch (e) {
      console.error('[totemKids/importar]', e);
      res.status(500).json({ error: e.message || 'Erro ao processar planilha' });
    }
  }
);


router.get('/criancas/modelo-importacao', authorizeModule('kids', 1), async (req, res) => {
  const ws = XLSX.utils.aoa_to_sheet([
    [
      'nome_crianca', 'data_nascimento', 'sexo', 'alergia', 'observacoes',
      'responsavel_nome', 'responsavel_telefone', 'responsavel_cpf', 'responsavel_parentesco',
      'responsavel2_nome', 'responsavel2_telefone', 'responsavel2_cpf', 'responsavel2_parentesco',
      'ultima_visita',
    ],
    [
      'Maria Clara Silva', '2020-05-15', 'F', 'Amendoim', 'Usa óculos',
      'Cláudia Silva', '21999998888', '12345678900', 'mae',
      'João Silva', '21988887777', '98765432100', 'pai',
      '2026-05-15',
    ],
    [
      'Pedro Oliveira', '2019-08-20', 'M', '', '',
      'Ana Oliveira', '21977776666', '', 'mae',
      '', '', '', '',
      '',
    ],
  ]);
  ws['!cols'] = [
    { wch: 22 }, { wch: 14 }, { wch: 6 }, { wch: 16 }, { wch: 18 },
    { wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 16 },
    { wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 16 },
    { wch: 14 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Criancas');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="modelo-importacao-criancas.xlsx"');
  res.send(buf);
});





router.get('/pre-checkin/codigo/:codigo', authorizeModule('kids', 2), async (req, res) => {
  try {
    const codigo = String(req.params.codigo || '').trim().toUpperCase();
    if (!codigo) return res.status(400).json({ error: 'Código vazio' });

    const { data: pre } = await supabase
      .from('kids_pre_checkins')
      .select('*')
      .eq('codigo', codigo)
      .eq('status', 'pendente')
      .maybeSingle();
    if (!pre) return res.status(404).json({ error: 'Pré-check-in não encontrado ou já usado' });
    if (new Date(pre.expira_em) < new Date()) {
      return res.status(410).json({ error: 'Pré-check-in expirado. Peça pro responsável gerar de novo.' });
    }

    const { data: criancas } = await supabase
      .from('kids_criancas')
      .select('id, nome, data_nascimento, sexo, foto_url, foto_storage_path, foto_consentimento_em, observacoes_medicas, necessidades_especiais')
      .in('id', pre.crianca_ids)
      .eq('ativo', true);

    const comFoto = await anexarFotosEmLote(criancas);
    const enriquecidas = await Promise.all(comFoto.map(async (c) => {
      let idadeMeses = null;
      if (c.data_nascimento) {
        const nasc = new Date(c.data_nascimento);
        idadeMeses = Math.floor((Date.now() - nasc.getTime()) / (1000 * 60 * 60 * 24 * 30.44));
      }
      const sala = await sugerirSala(idadeMeses);
      return { ...c, idade_meses: idadeMeses, sala_sugerida: sala };
    }));

    res.json({
      pre_checkin_id: pre.id,
      responsavel: {
        membro_id: pre.responsavel_membro_id,
        nome: pre.responsavel_nome,
        telefone: pre.responsavel_telefone,
      },
      criancas: enriquecidas,
    });
  } catch (e) {
    console.error('[TOTEM-KIDS] pre-checkin/codigo:', e.message);
    res.status(500).json({ error: 'Erro ao ler pré-check-in' });
  }
});



router.post('/pre-checkin/:id/consumir', authorizeModule('kids', 2), async (req, res) => {
  try {
    const { checkin_ids } = req.body || {};
    const { error } = await supabase
      .from('kids_pre_checkins')
      .update({
        status: 'usado',
        usado_em: new Date().toISOString(),
        usado_por: req.user?.id || null,
        checkin_ids: Array.isArray(checkin_ids) ? checkin_ids : null,
      })
      .eq('id', req.params.id)
      .eq('status', 'pendente');
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('[TOTEM-KIDS] pre-checkin/consumir:', e.message);
    res.status(500).json({ error: 'Erro ao consumir pré-check-in' });
  }
});









router.get('/vinculo-solicitacoes', authorizeModule('kids', 1), async (req, res) => {
  try {
    const status = String(req.query.status || 'pendente');
    let q = supabase
      .from('kids_vinculo_solicitacoes')
      .select('id, solicitante_nome, solicitante_telefone, solicitante_parentesco, crianca_nome, crianca_data_nascimento, status, motivo_rejeicao, observacao, created_at, decidido_em, decidido_por_nome')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(200);
    if (status && status !== 'todos') q = q.eq('status', status);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    console.error('[TOTEM-KIDS] vinculo-solicitacoes list:', e.message);
    res.status(500).json({ error: 'Erro ao listar solicitações' });
  }
});


router.get('/vinculo-solicitacoes/:id', authorizeModule('kids', 2), async (req, res) => {
  try {
    const { data: s, error } = await supabase
      .from('kids_vinculo_solicitacoes')
      .select('*')
      .eq('id', req.params.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    if (!s) return res.status(404).json({ error: 'Solicitação não encontrada' });

    const signed = async (path) => {
      if (!path) return null;
      const { data } = await supabase.storage.from('kids-documentos').createSignedUrl(path, 900);
      return data?.signedUrl || null;
    };


    const [crianca_foto_url, crianca_doc_url, doc_pai_url, doc_mae_url, foto_mae_url, foto_pai_url] = await Promise.all([
      s.foto_consentimento_em ? signed(s.crianca_foto_path) : null,
      signed(s.crianca_doc_path), signed(s.doc_pai_path), signed(s.doc_mae_path),
      signed(s.foto_mae_path), signed(s.foto_pai_path),
    ]);



    let possiveis_criancas = [];
    if (!s.crianca_id && s.crianca_nome && String(s.crianca_nome).trim().length >= 3) {
      const termo = String(s.crianca_nome).trim().replace(/[%_,]/g, '');
      const { data: cands } = await supabase.from('kids_criancas')
        .select('id, nome, data_nascimento, ativo, familia:mem_familias(nome), responsaveis:kids_responsaveis(membro:mem_membros(nome))')
        .ilike('nome', `%${termo}%`).is('deleted_at', null).limit(10);
      possiveis_criancas = (cands || []).map((c) => ({
        id: c.id, nome: c.nome, data_nascimento: c.data_nascimento, ativo: c.ativo,
        familia: c.familia?.nome || null,
        responsaveis: (c.responsaveis || []).map((r) => r.membro?.nome).filter(Boolean),
        match_forte: !!(s.crianca_data_nascimento && c.data_nascimento && c.data_nascimento === s.crianca_data_nascimento),
      })).sort((a, b) => (b.match_forte ? 1 : 0) - (a.match_forte ? 1 : 0));
    }

    res.json({ ...s, crianca_foto_url, crianca_doc_url, doc_pai_url, doc_mae_url, foto_mae_url, foto_pai_url, possiveis_criancas });
  } catch (e) {
    console.error('[TOTEM-KIDS] vinculo-solicitacoes detalhe:', e.message);
    res.status(500).json({ error: 'Erro ao abrir solicitação' });
  }
});


router.post('/vinculo-solicitacoes/:id/aprovar', authorizeModule('kids', 3), async (req, res) => {
  try {
    const { data: s } = await supabase
      .from('kids_vinculo_solicitacoes')
      .select('*')
      .eq('id', req.params.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (!s) return res.status(404).json({ error: 'Solicitação não encontrada' });
    if (s.status !== 'pendente') return res.status(409).json({ error: 'Solicitação já decidida' });



    let criancaId = req.body?.crianca_id || s.crianca_id;
    if (!criancaId) {

      const { data: membro } = await supabase
        .from('mem_membros').select('id, nome, familia_id').eq('id', s.solicitante_membro_id).maybeSingle();
      if (!membro) return res.status(400).json({ error: 'Membro solicitante não encontrado' });
      let familiaId = membro.familia_id;
      if (!familiaId) {
        const { data: f, error: fe } = await supabase
          .from('mem_familias').insert({ nome: `Familia ${membro.nome.split(' ')[0]}` }).select('id').single();
        if (fe) throw fe;
        familiaId = f.id;
        await supabase.from('mem_membros').update({ familia_id: familiaId, parentesco: 'responsavel' }).eq('id', membro.id);
      }
      const { data: criada, error: ce } = await supabase
        .from('kids_criancas')
        .insert({
          nome: s.crianca_nome,
          data_nascimento: s.crianca_data_nascimento || null,
          serie: s.serie || null,
          necessidades_especiais: s.necessidade_especial || null,
          consent_marketing: s.consent_marketing ?? null,
          consent_marketing_em: s.consent_marketing_em || null,
          consent_marketing_versao: s.consent_marketing_versao || null,
          tem_espectro: s.tem_espectro ?? null,
          espectro_qual: s.espectro_qual || null,
          tem_alergia: s.tem_alergia ?? null,
          alergia_qual: s.alergia_qual || null,
          tem_limitacao_fisica: s.tem_limitacao_fisica ?? null,
          limitacao_fisica_qual: s.limitacao_fisica_qual || null,
          observacoes_medicas: s.observacoes_medicas || null,
          familia_id: familiaId,
          visitante: true,



      data_limite: _dataLimiteVisitante(),
          created_by: req.user?.id || null,
        })
        .select('id')
        .single();
      if (ce) throw ce;
      criancaId = criada.id;
    }

    {
      const upd = {};
      if (s.serie) upd.serie = s.serie;
      if (s.necessidade_especial) upd.necessidades_especiais = s.necessidade_especial;
      if (s.consent_marketing != null) {
        upd.consent_marketing = s.consent_marketing;
        upd.consent_marketing_em = s.consent_marketing_em || null;
        upd.consent_marketing_versao = s.consent_marketing_versao || null;
      }
      if (Object.keys(upd).length) await supabase.from('kids_criancas').update(upd).eq('id', criancaId);
    }


    const { error: ve } = await supabase
      .from('kids_responsaveis')
      .upsert({
        crianca_id: criancaId,
        membro_id: s.solicitante_membro_id,
        parentesco: s.solicitante_parentesco || 'outro',
        autorizado_buscar: true,
      }, { onConflict: 'crianca_id,membro_id' });
    if (ve) {
      const t = traduzErroUmPaiUmaMae(ve);
      if (t) return res.status(t.status).json({ error: t.error });
      throw ve;
    }


    const { error: ue } = await supabase
      .from('kids_vinculo_solicitacoes')
      .update({
        status: 'aprovado',
        crianca_criada_id: criancaId,
        decidido_por: req.user?.id || null,
        decidido_por_nome: req.user?.name || req.user?.email || null,
        decidido_em: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', s.id);
    if (ue) throw ue;


    wpp.notificarMembro(s.solicitante_membro_id, 'kids_vinculo', [s.crianca_nome, 'aprovado'])
      .catch((e) => console.warn('[TOTEM-KIDS] vinculo wpp:', e.message));

    res.json({ ok: true, crianca_id: criancaId });
  } catch (e) {
    const t = traduzErroUmPaiUmaMae(e);
    if (t) return res.status(t.status).json({ error: t.error });
    console.error('[TOTEM-KIDS] vinculo-solicitacoes aprovar:', e.message);
    res.status(500).json({ error: 'Erro ao aprovar solicitação' });
  }
});


router.post('/vinculo-solicitacoes/:id/rejeitar', authorizeModule('kids', 3), async (req, res) => {
  try {
    const motivo = req.body?.motivo ? String(req.body.motivo).trim() : null;
    const { data: s } = await supabase
      .from('kids_vinculo_solicitacoes')
      .select('id, status, solicitante_membro_id, crianca_nome')
      .eq('id', req.params.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (!s) return res.status(404).json({ error: 'Solicitação não encontrada' });
    if (s.status !== 'pendente') return res.status(409).json({ error: 'Solicitação já decidida' });

    const { error } = await supabase
      .from('kids_vinculo_solicitacoes')
      .update({
        status: 'rejeitado',
        motivo_rejeicao: motivo,
        decidido_por: req.user?.id || null,
        decidido_por_nome: req.user?.name || req.user?.email || null,
        decidido_em: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', s.id);
    if (error) throw error;

    wpp.notificarMembro(s.solicitante_membro_id, 'kids_vinculo', [s.crianca_nome, 'recusado'])
      .catch((e) => console.warn('[TOTEM-KIDS] vinculo wpp:', e.message));

    res.json({ ok: true });
  } catch (e) {
    console.error('[TOTEM-KIDS] vinculo-solicitacoes rejeitar:', e.message);
    res.status(500).json({ error: 'Erro ao rejeitar solicitação' });
  }
});






router.get('/voluntariado-inscricoes', authorizeModule('kids', 1), async (req, res) => {
  try {
    const status = req.query.status ? String(req.query.status) : null;
    const search = req.query.search ? String(req.query.search).trim() : null;
    let q = supabase.from('vol_inscricoes')
      .select('id, nome_completo, nome, sobrenome, telefone, email, status, ministerios_interesse, dom_predominante, data_inscricao, feedback, integrado_em, membro_id')
      .eq('area', 'kids')
      .is('deleted_at', null)
      .order('data_inscricao', { ascending: false, nullsFirst: false })
      .limit(1000);
    if (status) q = q.eq('status', status);
    if (search) q = q.ilike('nome_completo', `%${search}%`);
    const { data, error } = await q;
    if (error) throw error;
    res.json({ rows: data || [] });
  } catch (e) {
    console.error('[TOTEM-KIDS] voluntariado-inscricoes:', e.message);
    res.status(500).json({ error: 'Erro ao listar inscrições de voluntariado do Kids' });
  }
});



const KIDS_VOL_STATUS = ['inscrito', 'enviado_ministerio'];
router.patch('/voluntariado-inscricoes/:id', authorizeModule('kids', 2), async (req, res) => {
  try {
    const { status, feedback } = req.body || {};

    const { data: insc } = await supabase.from('vol_inscricoes')
      .select('area').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!insc) return res.status(404).json({ error: 'Inscrição não encontrada.' });
    if (String(insc.area || '').toLowerCase() !== 'kids') {
      return res.status(403).json({ error: 'Esta inscrição não é do Kids.' });
    }
    const patch = { updated_at: new Date().toISOString() };
    if (status !== undefined) {
      if (!KIDS_VOL_STATUS.includes(status)) {
        return res.status(400).json({
          error: 'Integrar exige a verificação de antecedentes — faça isso no módulo Voluntariado.',
          code: 'integrar_no_voluntariado',
        });
      }
      patch.status = status;
      if (status === 'enviado_ministerio') patch.enviado_lider_em = new Date().toISOString();
    }
    if (feedback !== undefined) patch.feedback = feedback ? String(feedback).slice(0, 2000) : null;



    const data = await atualizarStatusInscricao(req.params.id, patch);
    res.json(data);
  } catch (e) {
    console.error('[TOTEM-KIDS] patch voluntariado-inscricoes:', e.message);
    res.status(500).json({ error: 'Erro ao atualizar inscrição' });
  }
});

module.exports = router;
