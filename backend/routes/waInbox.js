


const router = require('express').Router();
const { semFalhar } = require('../utils/semFalhar');
const multer = require('multer');
const { authenticate, authorizeModule } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const wpp = require('../services/whatsappService');
const waInbox = require('../services/waInbox');
const { escapePostgrestValue } = require('../utils/sanitize');
const { notificar } = require('../services/notificar');
const waEquipe = require('../services/waEquipe');
const ENC = require('../utils/conversaEncerramento');
const { enviarPesquisaFinalizacao } = require('../services/waPesquisaFinal');


async function profilesDaArea(areaNome) {
  try {
    const { data } = await supabase.rpc('conversas_profiles_da_area', { area_nome: areaNome });
    return [...new Set((data || []).map(r => r.profile_id).filter(Boolean))];
  } catch { return []; }
}


const TIPOS_ANEXO = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'application/pdf',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);
const uploadAnexo = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 16 * 1024 * 1024 },


  fileFilter: (req, file, cb) => {
    if (TIPOS_ANEXO.has(file.mimetype)) return cb(null, true);
    req.anexoRecusado = file.mimetype || 'desconhecido';
    cb(null, false);
  },
});

router.use(authenticate);
const { criarEscopoConversa, podeVerConversa } = require('../middleware/escopoConversa');
const escopoConversa = criarEscopoConversa(supabase);

function uid(req) { return req.user?.userId || req.user?.id || null; }
function ehAdmin(req) { return ['admin', 'diretor'].includes(req.user?.role); }
function minhasAreas(req) { return (req.user?.granular?.areas || []).filter(Boolean); }
function comJanela(c) {
  const { membro, ...rest } = c || {};
  return {
    ...rest,
    foto_url: rest.foto_url ?? membro?.foto_url ?? null,
    dentro_janela: waInbox.dentroJanela24h(c.last_inbound_at),
    janela_expira_em: c.last_inbound_at
      ? new Date(new Date(c.last_inbound_at).getTime() + waInbox.JANELA_24H_MS).toISOString() : null,
  };
}

function inList(vals) { return `(${vals.map(v => `"${String(v).replace(/"/g, '')}"`).join(',')})`; }


const SEL = 'id, telefone, nome, membro_id, area, nao_lidas, resolvida, atribuido_a, notas, protocolo, satisfacao, pesquisa_estado, ultima_previa, last_message_at, last_inbound_at, membro:mem_membros(foto_url)';



const TEMPLATES_ABERTURA = [
  { key: 'next_convite', rotulo: 'Convite NEXT', nome: process.env.WHATSAPP_TEMPLATE_NEXT_CONVITE, params: [{ label: 'Primeiro nome' }] },
  { key: 'aniversario', rotulo: 'Aniversário', nome: process.env.WHATSAPP_TEMPLATE_ANIVERSARIO2 || process.env.WHATSAPP_TEMPLATE_ANIVERSARIO, params: [{ label: 'Nome' }] },
  { key: 'batismo_lembrete', rotulo: 'Lembrete de batismo', nome: process.env.WHATSAPP_TEMPLATE_BATISMO, params: [{ label: 'Data' }, { label: 'Hora' }] },
  { key: 'cadastro_confirmado', rotulo: 'Cadastro confirmado', nome: process.env.WHATSAPP_TEMPLATE_CADASTRO, params: [{ label: 'Primeiro nome' }] },
].filter(t => t.nome);


router.get('/templates', authorizeModule('conversas', 1), (req, res) => {
  res.json({ templates: TEMPLATES_ABERTURA });
});


router.get('/areas', authorizeModule('conversas', 1), async (req, res) => {
  try {
    const { data } = await supabase.from('areas')
      .select('nome, setores(nome)').neq('ativo', false).order('nome');
    const areas = (data || []).map(a => ({ nome: a.nome, setor: a.setores?.nome || null }));
    res.json({ areas });
  } catch (e) {
    console.error('[wa-inbox] areas:', e.message);
    res.status(500).json({ error: 'Erro ao listar áreas' });
  }
});


router.get('/nao-lidas', authorizeModule('conversas', 1), async (req, res) => {
  try {
    const userId = uid(req);
    let query = supabase.from('wa_conversas').select('nao_lidas')
      .is('deleted_at', null).eq('resolvida', false).gt('nao_lidas', 0).limit(500);
    if (!ehAdmin(req)) {
      const vis = ['area.is.null', `atribuido_a.eq.${userId}`];
      const areas = minhasAreas(req);
      if (areas.length) vis.push(`area.in.${inList(areas)}`);
      query = query.or(vis.join(','));
    }
    const { data } = await query;
    res.json({ total: (data || []).reduce((a, c) => a + (c.nao_lidas || 0), 0), conversas: (data || []).length });
  } catch (e) {
    console.error('[wa-inbox] nao-lidas:', e.message);
    res.json({ total: 0, conversas: 0 });
  }
});


router.get('/resumo-areas', authorizeModule('conversas', 1), async (req, res) => {
  try {
    const userId = uid(req);
    let query = supabase.from('wa_conversas')
      .select('area, nao_lidas, resolvida, atribuido_a').is('deleted_at', null)
      .not('last_message_at', 'is', null).limit(5000);
    if (!ehAdmin(req)) {
      const vis = ['area.is.null', `atribuido_a.eq.${userId}`];
      const areas = minhasAreas(req);
      if (areas.length) vis.push(`area.in.${inList(areas)}`);
      query = query.or(vis.join(','));
    }
    const { data, error } = await query;
    if (error) throw error;
    const mapa = new Map();
    for (const c of (data || [])) {
      const chave = c.area || '__entrada__';
      const r = mapa.get(chave) || { area: c.area, entrada: !c.area, novas: 0, ativos: 0, pendentes: 0 };
      r.novas += (c.nao_lidas || 0);
      if (!c.resolvida) { r.ativos += 1; if (!c.atribuido_a) r.pendentes += 1; }
      mapa.set(chave, r);
    }
    const linhas = [...mapa.values()].sort((a, b) => (b.novas + b.ativos) - (a.novas + a.ativos));
    res.json({ areas: linhas });
  } catch (e) {
    console.error('[wa-inbox] resumo-areas:', e.message);
    res.status(500).json({ error: 'Erro ao carregar painel' });
  }
});



router.get('/setores', authorizeModule('conversas', 1), async (req, res) => {
  try {


    const { data } = await supabase.from('conversas_setores')
      .select('*').order('ordem', { ascending: true });
    res.json({ setores: data || [] });
  } catch (e) {
    console.error('[wa-inbox] setores get:', e.message);
    res.status(500).json({ error: 'Erro ao listar setores' });
  }
});


function camposFluxoSetor(body) {
  const b = body || {};
  const fluxo = {};
  if ('mensagem_resposta' in b) fluxo.mensagem_resposta = b.mensagem_resposta ? String(b.mensagem_resposta).slice(0, 1000) : null;
  if ('pedir_nome' in b) fluxo.pedir_nome = b.pedir_nome !== false;
  if ('destino_tipo' in b) fluxo.destino_tipo = b.destino_tipo === 'atendente' ? 'atendente' : 'area';
  if ('atendente_id' in b) fluxo.atendente_id = b.atendente_id || null;
  if (fluxo.destino_tipo === 'atendente' && !fluxo.atendente_id) {
    return { fluxo, erro: 'Destino "atendente" exige escolher o atendente.' };
  }
  return { fluxo };
}


router.post('/setores', authorizeModule('conversas', 3), async (req, res) => {
  try {
    const { rotulo, area, ordem, ativo } = req.body || {};
    if (!rotulo || !area) return res.status(400).json({ error: 'Rótulo e área são obrigatórios.' });
    const { fluxo, erro: erroFluxo } = camposFluxoSetor(req.body);
    if (erroFluxo) return res.status(400).json({ error: erroFluxo });
    const base = { rotulo: String(rotulo).trim(), area: String(area).trim(), ordem: Number(ordem) || 0, ativo: ativo !== false };
    let aviso;
    let { data, error } = await supabase.from('conversas_setores')
      .insert({ ...base, ...fluxo }).select().single();
    if (error && error.code === '42703' && Object.keys(fluxo).length) {


      aviso = 'Campos de fluxo ignorados — a migration 20260813150000 ainda não foi aplicada.';
      ({ data, error } = await supabase.from('conversas_setores').insert(base).select().single());
    }
    if (error) throw error;
    res.json(aviso ? { ...data, aviso } : data);
  } catch (e) {
    console.error('[wa-inbox] setores post:', e.message);
    res.status(500).json({ error: 'Erro ao criar setor' });
  }
});

router.put('/setores/:id', authorizeModule('conversas', 3), async (req, res) => {
  try {
    const patch = {};
    for (const k of ['rotulo', 'area']) if (k in (req.body || {})) patch[k] = String(req.body[k] || '').trim();
    if ('ordem' in (req.body || {})) patch.ordem = Number(req.body.ordem) || 0;
    if ('ativo' in (req.body || {})) patch.ativo = !!req.body.ativo;
    const { fluxo, erro: erroFluxo } = camposFluxoSetor(req.body);
    if (erroFluxo) return res.status(400).json({ error: erroFluxo });
    if (!Object.keys(patch).length && !Object.keys(fluxo).length) return res.status(400).json({ error: 'Nada para atualizar' });
    let aviso;
    let { data, error } = await supabase.from('conversas_setores')
      .update({ ...patch, ...fluxo }).eq('id', req.params.id).select().single();
    if (error && error.code === '42703' && Object.keys(fluxo).length) {
      aviso = 'Campos de fluxo ignorados — a migration 20260813150000 ainda não foi aplicada.';
      if (Object.keys(patch).length) {
        ({ data, error } = await supabase.from('conversas_setores').update(patch).eq('id', req.params.id).select().single());
      } else {
        return res.status(409).json({ error: aviso });
      }
    }
    if (error) throw error;
    res.json(aviso ? { ...data, aviso } : data);
  } catch (e) {
    console.error('[wa-inbox] setores put:', e.message);
    res.status(500).json({ error: 'Erro ao atualizar setor' });
  }
});

router.delete('/setores/:id', authorizeModule('conversas', 3), async (req, res) => {
  try {
    await supabase.from('conversas_setores').delete().eq('id', req.params.id);
    res.json({ ok: true });
  } catch (e) {
    console.error('[wa-inbox] setores del:', e.message);
    res.status(500).json({ error: 'Erro ao remover setor' });
  }
});




router.get('/colaboradores', authorizeModule('conversas', 1), async (req, res) => {
  try {
    const { data } = await supabase.from('profiles')
      .select('id, name, avatar_url, email, is_membro_only').eq('active', true).order('name');
    const ehAgente = (p) => /^\s*agente\s/i.test(p.name || '') || /^agente\.[^@]+@cbrio\.org$/i.test(p.email || '');
    const colaboradores = (data || [])
      .filter(p => p.name && !p.is_membro_only && !ehAgente(p))
      .map(p => ({ id: p.id, name: p.name, avatar_url: p.avatar_url || null }));
    res.json({ colaboradores });
  } catch (e) {
    console.error('[wa-inbox] colaboradores:', e.message);
    res.status(500).json({ error: 'Erro ao listar colaboradores' });
  }
});



router.get('/mensagens-prontas', authorizeModule('conversas', 1), async (req, res) => {
  try {
    const { data, error } = await supabase.from('wa_mensagens_prontas')
      .select('id, titulo, texto').eq('ativo', true).order('titulo');
    if (error) throw error;
    res.json({ mensagens: data || [] });
  } catch (e) {
    console.error('[wa-inbox] mensagens-prontas list:', e.message);
    res.status(500).json({ error: 'Erro ao listar mensagens prontas' });
  }
});
router.post('/mensagens-prontas', authorizeModule('conversas', 2), async (req, res) => {
  try {
    const titulo = String(req.body?.titulo || '').trim().slice(0, 80);
    const texto = String(req.body?.texto || '').trim().slice(0, 4000);
    if (!titulo || !texto) return res.status(400).json({ error: 'Título e texto são obrigatórios.' });
    const { data, error } = await supabase.from('wa_mensagens_prontas')
      .insert({ titulo, texto, criado_por: uid(req) }).select('id, titulo, texto').single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    console.error('[wa-inbox] mensagens-prontas create:', e.message);
    res.status(500).json({ error: 'Erro ao salvar a mensagem pronta' });
  }
});
router.patch('/mensagens-prontas/:id', authorizeModule('conversas', 2), async (req, res) => {
  try {
    const patch = { updated_at: new Date().toISOString() };
    if ('titulo' in (req.body || {})) patch.titulo = String(req.body.titulo || '').trim().slice(0, 80);
    if ('texto' in (req.body || {})) patch.texto = String(req.body.texto || '').trim().slice(0, 4000);
    const { data, error } = await supabase.from('wa_mensagens_prontas')
      .update(patch).eq('id', req.params.id).select('id, titulo, texto').maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Mensagem não encontrada' });
    res.json(data);
  } catch (e) {
    console.error('[wa-inbox] mensagens-prontas patch:', e.message);
    res.status(500).json({ error: 'Erro ao atualizar a mensagem pronta' });
  }
});
router.delete('/mensagens-prontas/:id', authorizeModule('conversas', 2), async (req, res) => {
  try {
    const { error } = await supabase.from('wa_mensagens_prontas').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('[wa-inbox] mensagens-prontas delete:', e.message);
    res.status(500).json({ error: 'Erro ao remover a mensagem pronta' });
  }
});


router.get('/conversas/:id/perfil', authorizeModule('conversas', 1), escopoConversa, async (req, res) => {
  try {
    const { data: conv } = await supabase.from('wa_conversas')
      .select('membro_id, telefone').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!conv) return res.status(404).json({ error: 'Conversa não encontrada' });








    let origem = [];
    let origemErro = null;
    try {
      const { disparosDoTelefone } = require('../services/whatsappOrigemConversa');
      origem = await disparosDoTelefone(conv.telefone);
    } catch (e) {
      console.error('[wa-inbox] origem do disparo:', e.message);
      origemErro = 'Não foi possível ler os disparos anteriores.';
    }

    const mid = conv.membro_id;
    if (!mid) return res.json({ membro: null, telefone: conv.telefone, origem, origem_erro: origemErro });

    const { data: m } = await supabase.from('mem_membros')
      .select('id, nome, foto_url, telefone, email, data_nascimento, status, batizado')
      .eq('id', mid).is('deleted_at', null).maybeSingle();
    if (!m) return res.json({ membro: null, telefone: conv.telefone });


    const { data: gm } = await supabase.from('mem_grupo_membros')
      .select('funcao, grupo:mem_grupos(nome)')
      .eq('membro_id', mid).is('saiu_em', null).is('deleted_at', null).limit(1).maybeSingle();


    let ministerios = [];
    const { data: vp } = await supabase.from('vol_profiles').select('id').eq('membresia_id', mid).maybeSingle();
    if (vp?.id) {
      const { data: tm } = await supabase.from('vol_team_members')
        .select('is_active, team:vol_teams(name)').eq('volunteer_profile_id', vp.id);
      ministerios = (tm || []).filter(t => t.is_active).map(t => t.team?.name).filter(Boolean);
    }


    let batizado = !!m.batizado;
    if (!batizado) {
      const { data: bi } = await supabase.from('batismo_inscricoes')
        .select('id').eq('membro_id', mid).eq('status', 'realizado').is('deleted_at', null).limit(1).maybeSingle();
      batizado = !!bi;
    }


    let fezNext = false;
    try {
      const { data: nf } = await supabase.from('vw_next_formado_pessoa')
        .select('membro_id').eq('membro_id', mid).limit(1).maybeSingle();
      fezNext = !!nf;
    } catch {                                               }
    if (!fezNext) {
      const { data: ni } = await supabase.from('next_inscricoes')
        .select('id').eq('membro_id', mid).not('check_in_at', 'is', null).limit(1).maybeSingle();
      fezNext = !!ni;
    }

    res.json({
      membro: { id: m.id, nome: m.nome, foto_url: m.foto_url, telefone: m.telefone, email: m.email, data_nascimento: m.data_nascimento, status: m.status },
      grupo: gm?.grupo?.nome || null,
      grupo_funcao: gm?.funcao || null,
      batizado,
      serve: ministerios.length > 0,
      ministerios,
      fez_next: fezNext,
      origem,
      origem_erro: origemErro,
    });
  } catch (e) {
    console.error('[wa-inbox] perfil:', e.message);
    res.status(500).json({ error: 'Erro ao carregar perfil' });
  }
});


router.get('/conversas', authorizeModule('conversas', 1), async (req, res) => {
  try {
    const status = req.query.status || 'abertas';
    const q = (req.query.q || '').trim();
    const areaParam = (req.query.area || 'todas').trim();
    const userId = uid(req);

    let query = supabase.from('wa_conversas').select(SEL)
      .is('deleted_at', null)
      .not('last_message_at', 'is', null)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(200);



    if (status === 'abertas') query = query.eq('resolvida', false);
    else if (status === 'finalizadas') query = query.eq('resolvida', true);



    if (q) {
      const qe = escapePostgrestValue(q);
      query = query.or(`nome.ilike.%${qe}%,telefone.ilike.%${qe}%`);
    }


    if (!ehAdmin(req)) {
      const vis = ['area.is.null', `atribuido_a.eq.${userId}`];
      const areas = minhasAreas(req);
      if (areas.length) vis.push(`area.in.${inList(areas)}`);
      query = query.or(vis.join(','));
    }


    if (areaParam === 'entrada') query = query.is('area', null);
    else if (areaParam === 'minhas') query = query.eq('atribuido_a', userId);
    else if (areaParam && areaParam !== 'todas') query = query.eq('area', areaParam);

    const { data, error } = await query;
    if (error) throw error;
    const rows = (data || []).map(comJanela);
    res.json({ conversas: rows, nao_lidas_total: rows.reduce((a, c) => a + (c.nao_lidas || 0), 0) });
  } catch (e) {
    console.error('[wa-inbox] conversas:', e.message);
    res.status(500).json({ error: 'Erro ao listar conversas' });
  }
});


router.get('/conversas/:id/mensagens', authorizeModule('conversas', 1), escopoConversa, async (req, res) => {
  try {
    const { data: conv } = await supabase.from('wa_conversas')
      .select('*, membro:mem_membros(foto_url)').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!conv) return res.status(404).json({ error: 'Conversa não encontrada' });






    const { data: msgs, error: mensagensError } = await supabase.from('wa_mensagens')
      .select('*')
      .eq('conversa_id', conv.id).order('criado_em', { ascending: false }).limit(500);
    if (mensagensError) throw mensagensError;
    (msgs || []).reverse();




    const paths = (msgs || []).filter(m => m.media_url && !/^https?:\/\//i.test(m.media_url)).map(m => m.media_url);
    if (paths.length) {
      try {
        const { data: assinadas } = await supabase.storage.from('wa-inbox-privado').createSignedUrls(paths, 900);
        const porPath = new Map((assinadas || []).filter(s => s.signedUrl).map(s => [s.path, s.signedUrl]));
        for (const m of msgs) {
          if (m.media_url && !/^https?:\/\//i.test(m.media_url)) {
            m.media_url = porPath.get(m.media_url) || null;
          }
        }
      } catch (e) {
        console.warn('[wa-inbox] assinar mídia:', e.message);
        for (const m of msgs) if (m.media_url && !/^https?:\/\//i.test(m.media_url)) m.media_url = null;
      }
    }




    let automaticas = [];
    try {
      const suf = String(conv.telefone || '').replace(/\D+/g, '').slice(-8);
      if (suf.length === 8) {
        const { data: candidatos } = await supabase.from('whatsapp_envios')
          .select('id, telefone, template, texto, tipo, params, status, criado_em, enviado_em, message_id, delivered_at, read_at, failed_at, erro_status, contexto')
          .ilike('telefone', `%${suf}%`)
          .in('status', ['enviado', 'erro'])
          .order('criado_em', { ascending: false }).limit(60);
        const envs = (candidatos || []).filter(e => waInbox.mesmoNumeroBR(e.telefone, conv.telefone));

        const nomes = [...new Set((envs || []).map(e => e.template).filter(Boolean))];
        const corpo = new Map();
        if (nomes.length) {
          const { data: tpls } = await supabase.from('wa_templates')
            .select('nome, exemplo').in('nome', nomes.slice(0, 60));
          (tpls || []).forEach(t => { if (t.exemplo) corpo.set(t.nome, t.exemplo); });
        }
        automaticas = (envs || []).map(e => {
          let texto;
          if (e.tipo === 'texto' && e.texto) texto = e.texto;
          else {
            const ex = corpo.get(e.template);
            const params = Array.isArray(e.params) ? e.params : [];
            texto = ex
              ? ex.replace(/\{\{(\d+)\}\}/g, (_, n) => String(params[Number(n) - 1] ?? `{{${n}}}`))
              : `[template: ${e.template || '—'}]`;
          }
          return {
            id: `fila-${e.id}`, direcao: 'out', tipo: 'automatica', texto,
            media_url: null, autor_id: null,
            criado_em: e.enviado_em || e.criado_em,
            delivered_at: e.delivered_at, read_at: e.read_at,
            failed_at: e.failed_at || (e.status === 'erro' ? e.criado_em : null),
            erro_status: e.erro_status || (e.status === 'erro' ? 'a fila desistiu do envio' : null),
            contexto_fila: e.contexto || null,
            wa_message_id: e.message_id || null,
          };
        });
      }
    } catch (eAuto) { console.warn('[wa-inbox] automaticas na thread:', eAuto.message); }
    const timeline = [...(msgs || []), ...automaticas]
      .sort((a, b) => new Date(a.criado_em) - new Date(b.criado_em));



    const porWaId = new Map(timeline.filter(x => x.wa_message_id).map(x => [x.wa_message_id, x]));
    for (const x of timeline) {
      if (x.reply_to_wa_id) {
        const alvo = porWaId.get(x.reply_to_wa_id);
        x.reply_para = alvo
          ? { texto: String(alvo.texto || (alvo.media_url ? '[mídia]' : alvo.tipo)).slice(0, 140), de: alvo.direcao === 'out' ? 'igreja' : 'pessoa' }
          : { texto: 'mensagem antiga (fora do histórico carregado)', de: null };
      }
    }

    if (conv.nao_lidas > 0) await supabase.from('wa_conversas').update({ nao_lidas: 0 }).eq('id', conv.id);
    res.json({ conversa: comJanela({ ...conv, nao_lidas: 0 }), mensagens: timeline });
  } catch (e) {
    console.error('[wa-inbox] mensagens:', e.message);
    res.status(500).json({ error: 'Erro ao carregar conversa' });
  }
});



router.post('/conversas/abrir', authorizeModule('conversas', 1), async (req, res) => {
  try {
    const { telefone, nome } = req.body || {};
    if (!telefone || !String(telefone).replace(/\D+/g, '')) return res.status(400).json({ error: 'Telefone inválido.' });
    const conv = await waInbox.acharOuCriarConversa(telefone, null, { semVinculoAutomatico: true, podeAcessar: c => podeVerConversa(req.user, c) });
    if (!conv) return res.status(400).json({ error: 'Telefone inválido.' });
    if (!podeVerConversa(req.user, conv)) return res.status(404).json({ error: 'Conversa não encontrada' });
    if (nome && !conv.nome) { await supabase.from('wa_conversas').update({ nome }).eq('id', conv.id); conv.nome = nome; }
    res.json({ conversa: comJanela(conv) });
  } catch (e) {
    console.error('[wa-inbox] abrir:', e.message);
    res.status(500).json({ error: 'Erro ao abrir conversa' });
  }
});


router.post('/conversas/nova', authorizeModule('conversas', 2), async (req, res) => {
  try {
    const { telefone, area, texto, template_name, template_params } = req.body || {};
    if (!telefone || !String(telefone).replace(/\D+/g, '')) {
      return res.status(400).json({ error: 'Informe o telefone.' });
    }
    const conv = await waInbox.acharOuCriarConversa(telefone, null, { semVinculoAutomatico: true, podeAcessar: c => podeVerConversa(req.user, c) });
    if (!conv) return res.status(400).json({ error: 'Telefone inválido.' });
    if (!podeVerConversa(req.user, conv)) return res.status(404).json({ error: 'Conversa não encontrada' });

    const dentro = waInbox.dentroJanela24h(conv.last_inbound_at);


    const numOpts = conv.phone_number_id ? { phoneNumberId: conv.phone_number_id } : {};
    let r, tipo, textoLog;
    if (dentro && texto && String(texto).trim()) {
      r = await wpp.sendText(conv.telefone, String(texto).trim(), numOpts);
      tipo = 'text'; textoLog = String(texto).trim();
    } else if (template_name) {
      r = await wpp.sendTemplate(conv.telefone, template_name, 'pt_BR', Array.isArray(template_params) ? template_params : [], numOpts);
      tipo = 'template'; textoLog = `[template: ${template_name}]`;
    } else {
      return res.status(400).json({
        error: 'Este número não tem conversa aberta nas últimas 24h — escolha um template aprovado para iniciar.',
        code: 'precisa_template',
      });
    }
    if (!r?.sent) return res.status(502).json({ error: 'O WhatsApp não aceitou o envio.', detail: r?.reason || r?.detail || null });

    await waInbox.registrarOutbound({ telefone: conv.telefone, texto: textoLog, tipo, autorId: uid(req), waMessageId: r.messageId || null });
    if (area && String(area).trim()) await supabase.from('wa_conversas').update({ area: String(area).trim() }).eq('id', conv.id);

    const { data: fresh } = await supabase.from('wa_conversas').select('*').eq('id', conv.id).maybeSingle();
    res.json({ ok: true, conversa: comJanela(fresh || conv), messageId: r.messageId || null });
  } catch (e) {
    console.error('[wa-inbox] nova:', e.message);
    res.status(500).json({ error: 'Erro ao iniciar conversa' });
  }
});


router.post('/conversas/:id/responder', authorizeModule('conversas', 2), escopoConversa, async (req, res) => {
  try {
    const { texto, template_name, template_params } = req.body || {};


    const { data: conv } = await supabase.from('wa_conversas')
      .select('*').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!conv) return res.status(404).json({ error: 'Conversa não encontrada' });

    const dentro = waInbox.dentroJanela24h(conv.last_inbound_at);
    const numOpts = conv.phone_number_id ? { phoneNumberId: conv.phone_number_id } : {};
    let r, tipo, textoLog;
    if (dentro && texto && String(texto).trim()) {
      r = await wpp.sendText(conv.telefone, String(texto).trim(), numOpts);
      tipo = 'text'; textoLog = String(texto).trim();
    } else if (template_name) {
      r = await wpp.sendTemplate(conv.telefone, template_name, 'pt_BR', Array.isArray(template_params) ? template_params : [], numOpts);
      tipo = 'template'; textoLog = `[template: ${template_name}]`;
    } else {
      return res.status(400).json({
        error: dentro ? 'Escreva uma mensagem.' : 'Fora da janela de 24h — só é possível enviar um template aprovado.',
        code: dentro ? 'texto_vazio' : 'fora_janela',
      });
    }
    if (!r?.sent) return res.status(502).json({ error: 'O WhatsApp não aceitou o envio.', detail: r?.reason || r?.detail || null });
    await waInbox.registrarOutbound({ telefone: conv.telefone, texto: textoLog, tipo, autorId: uid(req), waMessageId: r.messageId || null });
    res.json({ ok: true, messageId: r.messageId || null });
  } catch (e) {
    console.error('[wa-inbox] responder:', e.message);
    res.status(500).json({ error: 'Erro ao enviar resposta' });
  }
});


router.post('/conversas/:id/anexo', authorizeModule('conversas', 2), escopoConversa, uploadAnexo.single('arquivo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: req.anexoRecusado
          ? `Tipo de arquivo não aceito (${req.anexoRecusado}) — envie imagem (jpg/png/webp), PDF, Word ou Excel.`
          : 'Arquivo obrigatório.',
      });
    }
    const { data: conv } = await supabase.from('wa_conversas')
      .select('*').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!conv) return res.status(404).json({ error: 'Conversa não encontrada' });
    if (!waInbox.dentroJanela24h(conv.last_inbound_at)) {
      return res.status(400).json({ error: 'Fora da janela de 24h — anexos só dentro da janela.', code: 'fora_janela' });
    }
    const mime = req.file.mimetype || 'application/octet-stream';
    const kind = mime.startsWith('image/') ? 'image' : 'document';

    const urlPub = await waInbox.subirMedia({ buffer: req.file.buffer, mime, conversaId: conv.id, origem: 'out', filename: req.file.originalname });
    if (!urlPub) return res.status(500).json({ error: 'Falha ao subir o arquivo.' });
    const r = await wpp.sendMedia(conv.telefone, kind, urlPub, {
      filename: req.file.originalname,
      ...(conv.phone_number_id ? { phoneNumberId: conv.phone_number_id } : {}),
    });
    if (!r?.sent) return res.status(502).json({ error: 'O WhatsApp não aceitou o anexo.', detail: r?.reason || r?.detail || null });
    await waInbox.registrarOutbound({
      telefone: conv.telefone, tipo: kind, autorId: uid(req), mediaUrl: urlPub,
      texto: kind === 'document' ? (req.file.originalname || '[documento]') : null,
      waMessageId: r.messageId || null,
    });
    res.json({ ok: true, media_url: urlPub, messageId: r.messageId || null });
  } catch (e) {
    console.error('[wa-inbox] anexo:', e.message);
    res.status(500).json({ error: 'Erro ao enviar anexo' });
  }
});


router.post('/conversas/:id/ler', authorizeModule('conversas', 1), escopoConversa, async (req, res) => {
  try {
    await supabase.from('wa_conversas').update({ nao_lidas: 0 }).eq('id', req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao marcar lida' });
  }
});







router.post('/conversas/:id/finalizar', authorizeModule('conversas', 2), escopoConversa, async (req, res) => {
  try {
    const { data: conv } = await supabase.from('wa_conversas')
      .select('*').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!conv) return res.status(404).json({ error: 'Conversa não encontrada' });
    if (conv.resolvida) return res.status(409).json({ error: 'A conversa já está finalizada' });

    if (req.body?.cancelar === true) {
      const { data, error } = await supabase.from('wa_conversas')
        .update({ encerrar_desde: null, encerrar_por: null })
        .eq('id', conv.id).eq('resolvida', false).select().maybeSingle();
      if (error) throw error;
      return res.json({ ...comJanela(data || conv), modo: 'cancelado', encerra_em: null });
    }

    const agora = Date.now();
    const plano = ENC.planoFinalizar(conv, agora);
    if (plano.modo === 'timer') {
      const { data, error } = await supabase.from('wa_conversas')
        .update({ encerrar_desde: new Date(agora).toISOString(), encerrar_por: uid(req) || null })
        .eq('id', conv.id).eq('resolvida', false).select().maybeSingle();
      if (error) throw error;
      return res.json({ ...comJanela(data || conv), modo: 'timer', encerra_em: ENC.encerraEm(data || conv), reduzido: plano.reduzido });
    }


    const { data: claim, error: eClaim } = await supabase.from('wa_conversas')
      .update({
        resolvida: true, encerrar_desde: null,
        finalizada_em: new Date(agora).toISOString(), finalizada_motivo: 'atendente',
      }).eq('id', conv.id).eq('resolvida', false).select('id');
    if (eClaim) throw eClaim;
    let pesquisaEnviada = false;
    if (claim?.length && plano.modo === 'agora_com_pesquisa') {
      pesquisaEnviada = await enviarPesquisaFinalizacao(conv);
    }
    const { data: fresh } = await supabase.from('wa_conversas').select('*').eq('id', conv.id).single();
    res.json({ ...comJanela(fresh || conv), modo: plano.modo, pesquisa_enviada: pesquisaEnviada });
  } catch (e) {
    console.error('[wa-inbox] finalizar:', e.message);
    res.status(500).json({ error: 'Erro ao finalizar a conversa' });
  }
});


router.patch('/conversas/:id', authorizeModule('conversas', 2), escopoConversa, async (req, res) => {
  try {
    const { data: antes } = await supabase.from('wa_conversas')
      .select('*').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!antes) return res.status(404).json({ error: 'Conversa não encontrada' });

    const patch = {};
    if (typeof req.body?.resolvida === 'boolean') patch.resolvida = req.body.resolvida;
    if ('atribuido_a' in (req.body || {})) patch.atribuido_a = req.body.atribuido_a || null;
    if ('area' in (req.body || {})) patch.area = req.body.area ? String(req.body.area).trim() : null;
    if ('notas' in (req.body || {})) patch.notas = req.body.notas ? String(req.body.notas) : null;
    if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'Nada para atualizar' });







    let pesquisaEnviada = false;
    if (patch.resolvida === true && !antes.resolvida) {
      const { data: claim } = await supabase.from('wa_conversas')
        .update({ resolvida: true }).eq('id', req.params.id)
        .eq('resolvida', false).select('id');
      delete patch.resolvida;



      if (claim?.length) {
        await supabase.from('wa_conversas').update({
          finalizada_em: new Date().toISOString(), finalizada_motivo: 'atendente', encerrar_desde: null,
        }).eq('id', req.params.id).then(() => {}, () => {});
      }
      if (claim?.length) {
        pesquisaEnviada = await enviarPesquisaFinalizacao(antes);
      }
    }

    let data;
    if (Object.keys(patch).length) {
      const r2 = await supabase.from('wa_conversas').update(patch).eq('id', req.params.id).select().single();
      if (r2.error) throw r2.error;
      data = r2.data;
    } else {

      const r2 = await supabase.from('wa_conversas').select('*').eq('id', req.params.id).single();
      if (r2.error) throw r2.error;
      data = r2.data;
    }



    let equipe = null;
    if ('area' in patch && !('atribuido_a' in patch)) {
      equipe = await waEquipe.atribuirPelaEquipe({ conversaId: req.params.id, area: patch.area, origem: 'triagem' });
      if (equipe?.atribuido) data = { ...data, atribuido_a: equipe.profileId };
    }
    res.json({ ...comJanela(data), pesquisa_enviada: pesquisaEnviada, equipe });
  } catch (e) {
    console.error('[wa-inbox] patch:', e.message);
    res.status(500).json({ error: 'Erro ao atualizar conversa' });
  }
});


router.post('/conversas/:id/transferir', authorizeModule('conversas', 2), escopoConversa, async (req, res) => {
  try {
    const area = req.body?.area ? String(req.body.area).trim() : '';
    if (!area) return res.status(400).json({ error: 'Escolha a área de destino.' });
    const { data: conv } = await supabase.from('wa_conversas')
      .select('id, area, protocolo, nome, telefone').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!conv) return res.status(404).json({ error: 'Conversa não encontrada' });
    if (conv.area === area) return res.status(400).json({ error: 'A conversa já está nessa área.' });


    await supabase.from('wa_conversas')
      .update({ area, atribuido_a: null, resolvida: false }).eq('id', conv.id);




    const equipe = await waEquipe.atribuirPelaEquipe({ conversaId: conv.id, area, origem: 'triagem', avisar: false });

    await semFalhar(supabase.from('wa_mensagens').insert({
      conversa_id: conv.id, direcao: 'out', tipo: 'sistema', autor_id: uid(req),
      texto: `🔀 Transferida de ${conv.area || 'Entrada'} para ${area}`,
    }), '[wa-inbox]');

    try {
      const alvos = equipe?.atribuido ? [equipe.profileId] : await profilesDaArea(area);
      await notificar({
        modulo: 'conversas', tipo: 'conversa_transferida',
        titulo: `Conversa transferida · ${area}`,
        mensagem: `${conv.nome || conv.telefone} (${conv.protocolo || '—'}) foi transferida pra ${area}${equipe?.atribuido ? ' — atribuída a você' : ''}.`,
        link: `/comunicacao?tab=conversas&area=${encodeURIComponent(area)}`,
        chaveDedup: `conversa_transf_${conv.id}_${area}`,
        targetIds: alvos.length ? alvos : undefined,
      });
    } catch (e) { console.error('[wa-inbox] transferir notificar:', e.message); }

    const { data: fresh } = await supabase.from('wa_conversas').select(SEL).eq('id', conv.id).maybeSingle();
    res.json(comJanela(fresh || conv));
  } catch (e) {
    console.error('[wa-inbox] transferir:', e.message);
    res.status(500).json({ error: 'Erro ao transferir' });
  }
});

module.exports = router;
