








const express = require('express');
const router = express.Router();
const { supabase } = require('../utils/supabase');
const { authenticate, authorizeModule, getEffectiveLevel } = require('../middleware/auth');
const {
  TIPOS, FORMATOS, CUIDADO_TIPOS, TIPOS_CONSENTIMENTO, TIPOS_NUMERICOS, validarPerguntas, slugificar,
  ordenarPorOpcoes, baseSemNeutras, ehNeutra, montarItens,
} = require('../utils/censoPerguntas');
const {
  TIPOS_PARA_BUSCAR, TIPOS_IDENTIFICACAO, classificar, aplicarTeto, cortarDemografia,
} = require('../utils/censoGrafico');
const { montarPotencial, resumoPotencial } = require('../utils/censoPotencial');
const { montarVoluntariosSemCenso, linkPesquisa } = require('../utils/censoVoluntarios');
const { montarPessoasEmGrupoSemCenso } = require('../utils/censoGrupos');
const { telefoneAlcancavel } = require('../services/contatoPessoa');
const { BASE_PADRAO: BASE_LINK_PUBLICO } = require('../utils/linkInscricaoApp');
const { podeExportar } = require('../utils/podeExportar');
const { fetchAllRows } = require('../utils/pagination');
const { requireCron } = require('../utils/cronAuth');
const { acharMembroGuardado } = require('../services/membroMatch');
const { reconciliarCenso } = require('../services/censoReconciliar');



const { traduzirParaCadastro } = require('../utils/censoCampoCadastro');
const { valoresDosRespondentes, desdeDozeMeses } = require('../services/censoValores');
const { podeVerMarcadorSensivel, idsPresentes } = require('../services/jornadaMarcadores');
const { montarPerfil, montarCruzamentos, CRUZAMENTOS } = require('../utils/censoRelatorioDados');
const { gerarRelatorio } = require('../services/censoRelatorioIA');
const {
  PORTA: PORTA_CONSENTIMENTO, gravarConsentimentosDoCenso, ligarOptinDoCenso,
} = require('../services/censoConsentimentoGravar');
const { lerRespostasAbertas, TIPOS_PARA_IA } = require('../services/censoLeituraIA');











const LOTE_MAX = 500;























router.get('/cron/pos-processar', requireCron, async (req, res) => {
  try {



    const { data: pend, error } = await supabase.from('cen_resposta')
      .select('pesquisa_id')
      .is('pos_processado_em', null).not('concluida_em', 'is', null).is('deleted_at', null)
      .limit(1000);
    if (error) throw new Error(error.message);

    const ids = [...new Set((pend || []).map(r => r.pesquisa_id).filter(Boolean))];
    if (!ids.length) return res.json({ ok: true, pesquisas: 0, processadas: 0 });

    let processadas = 0; let vinculadas = 0; let conflitos = 0; let falhas = 0;
    let itensReconstruidos = 0;
    const porPesquisa = [];
    for (const id of ids) {



      try {
        const out = await processarPendentes(id, LOTE_MAX);
        processadas += out.processadas || 0;
        vinculadas += out.vinculadas || 0;
        conflitos += out.conflitos || 0;
        falhas += out.falhas || 0;
        itensReconstruidos += out.itens_reconstruidos || 0;
        porPesquisa.push({ pesquisa_id: id, ...out });
      } catch (e) {
        falhas += 1;
        porPesquisa.push({ pesquisa_id: id, erro: String(e.message).slice(0, 200) });
      }
    }
    res.json({
      ok: true, pesquisas: ids.length, processadas, vinculadas, conflitos, falhas,



      itens_reconstruidos: itensReconstruidos,
      detalhe: porPesquisa,
    });
  } catch (e) {
    console.error('[censo/cron/pos-processar]', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.use(authenticate);

const TIPOS_PESQUISA = ['censo', 'pulso', 'evento', 'nps', 'outro'];





const CONSENTIMENTO_DEFAULT = [
  'Ao continuar, você autoriza a Comunidade Batista do Rio a usar suas respostas',
  'para conhecer melhor a comunidade e orientar decisões ministeriais.',
  'Seus dados não são compartilhados com terceiros e você pode solicitar a',
  'exclusão a qualquer momento pelo contato@cbrio.org.',
].join(' ');

function limpar(v) {
  return typeof v === 'string' ? v.trim() : v;
}









async function podeVerSensivel(profileId) {
  if (!profileId) return false;
  try {
    const { data, error } = await supabase
      .from('cen_acesso_sensivel').select('profile_id')
      .eq('profile_id', profileId).is('revogado_em', null).maybeSingle();
    if (error) return false;
    return !!data;
  } catch { return false; }
}


async function slugLivre(base, ignorarId) {
  const raiz = slugificar(base) || 'pesquisa';
  for (let n = 1; n <= 50; n += 1) {
    const tentativa = n === 1 ? raiz : `${raiz}-${n}`;
    let q = supabase.from('cen_pesquisa').select('id').eq('slug', tentativa).is('deleted_at', null);
    if (ignorarId) q = q.neq('id', ignorarId);
    const { data, error } = await q.maybeSingle();
    if (error && error.code !== 'PGRST116') throw new Error(error.message);
    if (!data) return tentativa;
  }
  return `${raiz}-${Date.now().toString(36)}`;
}


router.get('/pesquisas', authorizeModule('censo', 1), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('vw_cen_pesquisa_stats')
      .select('*')
      .order('ultima_resposta_em', { ascending: false, nullsFirst: false });
    if (error) return res.status(400).json({ error: error.message });
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/pesquisas/:id', authorizeModule('censo', 1), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('cen_pesquisa').select('*')
      .eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (error) return res.status(400).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Pesquisa não encontrada' });

    const { data: stats } = await supabase
      .from('vw_cen_pesquisa_stats').select('*').eq('pesquisa_id', data.id).maybeSingle();
    res.json({ ...data, stats: stats || null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


router.post('/pesquisas', authorizeModule('censo', 4), async (req, res) => {
  try {
    const titulo = limpar(req.body?.titulo);
    if (!titulo) return res.status(400).json({ error: 'Título é obrigatório' });

    const tipo = TIPOS_PESQUISA.includes(req.body?.tipo) ? req.body.tipo : 'censo';


    const payload = {
      titulo,
      subtitulo: limpar(req.body?.subtitulo) || null,
      tipo,
      status: 'rascunho',
      slug: await slugLivre(req.body?.slug || titulo),
      perguntas: [],
      config: {
        exige_identificacao: req.body?.config?.exige_identificacao !== false,
        permite_anonimo: req.body?.config?.permite_anonimo === true,
        mostrar_progresso: req.body?.config?.mostrar_progresso !== false,
      },
      consentimento_texto: limpar(req.body?.consentimento_texto) || CONSENTIMENTO_DEFAULT,
      criado_por: req.user?.id || null,
    };

    if (Array.isArray(req.body?.perguntas) && req.body.perguntas.length) {
      const v = validarPerguntas(req.body.perguntas);
      if (!v.ok) return res.status(400).json({ error: v.erros.join(' · ') });
      payload.perguntas = v.perguntas;
    }

    const { data, error } = await supabase.from('cen_pesquisa').insert(payload).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});


router.put('/pesquisas/:id', authorizeModule('censo', 4), async (req, res) => {
  try {
    const { data: atual, error: e0 } = await supabase
      .from('cen_pesquisa').select('id, status, slug')
      .eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (e0) return res.status(400).json({ error: e0.message });
    if (!atual) return res.status(404).json({ error: 'Pesquisa não encontrada' });

    const patch = {};
    for (const k of ['titulo', 'subtitulo', 'consentimento_texto']) {
      if (req.body?.[k] !== undefined) patch[k] = limpar(req.body[k]) || null;
    }
    if (req.body?.tipo !== undefined) {
      if (!TIPOS_PESQUISA.includes(req.body.tipo)) return res.status(400).json({ error: 'Tipo inválido' });
      patch.tipo = req.body.tipo;
    }
    for (const k of ['abre_em', 'fecha_em']) {
      if (req.body?.[k] !== undefined) patch[k] = req.body[k] || null;
    }
    if (req.body?.config !== undefined && req.body.config && typeof req.body.config === 'object') {
      patch.config = req.body.config;
    }



    if (req.body?.slug !== undefined && slugificar(req.body.slug) !== atual.slug) {
      if (atual.status !== 'rascunho') {
        return res.status(400).json({ error: 'O endereço (slug) só pode mudar enquanto a pesquisa está em rascunho — o QR impresso aponta para ele.' });
      }
      patch.slug = await slugLivre(req.body.slug, atual.id);
    }

    if (req.body?.perguntas !== undefined) {
      const v = validarPerguntas(req.body.perguntas);
      if (!v.ok) return res.status(400).json({ error: v.erros.join(' · ') });
      patch.perguntas = v.perguntas;
    }

    if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nada para atualizar' });

    const { data, error } = await supabase
      .from('cen_pesquisa').update(patch).eq('id', atual.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});


router.post('/pesquisas/:id/status', authorizeModule('censo', 4), async (req, res) => {
  try {
    const alvo = String(req.body?.status || '').trim();
    if (!['rascunho', 'aberta', 'encerrada', 'arquivada'].includes(alvo)) {
      return res.status(400).json({ error: 'Status inválido' });
    }

    const { data: p, error: e0 } = await supabase
      .from('cen_pesquisa').select('id, status, perguntas, consentimento_texto, abre_em')
      .eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (e0) return res.status(400).json({ error: e0.message });
    if (!p) return res.status(404).json({ error: 'Pesquisa não encontrada' });



    if (alvo === 'aberta') {
      const v = validarPerguntas(p.perguntas || []);
      if (!v.ok) return res.status(400).json({ error: `Não é possível abrir: ${v.erros.join(' · ')}` });
      if (!p.consentimento_texto) return res.status(400).json({ error: 'Defina o texto de consentimento antes de abrir.' });
    }



    if (alvo === 'rascunho' && p.status !== 'rascunho') {
      const { count } = await supabase
        .from('cen_resposta').select('id', { count: 'exact', head: true })
        .eq('pesquisa_id', p.id).is('deleted_at', null);
      if ((count || 0) > 0) {
        return res.status(400).json({ error: `Esta pesquisa já tem ${count} resposta(s). Encerre em vez de voltar para rascunho.` });
      }
    }

    const patch = { status: alvo };
    if (alvo === 'aberta' && !p.abre_em) patch.abre_em = new Date().toISOString();
    if (alvo === 'encerrada') patch.fecha_em = new Date().toISOString();

    const { data, error } = await supabase
      .from('cen_pesquisa').update(patch).eq('id', p.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});


router.post('/pesquisas/:id/duplicar', authorizeModule('censo', 4), async (req, res) => {
  try {
    const { data: base, error: e0 } = await supabase
      .from('cen_pesquisa').select('*')
      .eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (e0) return res.status(400).json({ error: e0.message });
    if (!base) return res.status(404).json({ error: 'Pesquisa não encontrada' });

    const titulo = limpar(req.body?.titulo) || `${base.titulo} (cópia)`;
    const { data, error } = await supabase.from('cen_pesquisa').insert({
      titulo,
      subtitulo: base.subtitulo,
      tipo: base.tipo,
      status: 'rascunho',
      slug: await slugLivre(req.body?.slug || titulo),
      perguntas: base.perguntas,
      config: base.config,
      consentimento_texto: base.consentimento_texto,
      criado_por: req.user?.id || null,
    }).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});


router.delete('/pesquisas/:id', authorizeModule('censo', 5), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('cen_pesquisa')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', req.params.id).is('deleted_at', null)
      .select('id').maybeSingle();
    if (error) return res.status(400).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Pesquisa não encontrada' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


router.get('/aux', authorizeModule('censo', 1), async (req, res) => {
  res.json({
    tipos_pergunta: TIPOS,
    tipos_pesquisa: TIPOS_PESQUISA,
    formatos: FORMATOS,
    cuidado_tipos: CUIDADO_TIPOS,
    consentimento_tipos: TIPOS_CONSENTIMENTO,
    consentimento_default: CONSENTIMENTO_DEFAULT,
    nivel: getEffectiveLevel(req, 'censo'),












    pode_ver_sensivel: await podeVerSensivel(req.user?.id),
    pode_ver_cuidado: req.user?.is_super_admin === true || await podeVerSensivel(req.user?.id),
  });
});












const CUIDADO_STATUS = ['aberto', 'em_contato', 'concluido', 'sem_retorno'];


function filtrarSensiveis(itens, podeVer) {
  if (podeVer) return itens || [];
  return (itens || []).filter((i) => i.sensivel !== true);
}










router.get('/respostas', authorizeModule('censo', 2), async (req, res) => {
  try {
    const pesquisaId = String(req.query.pesquisa_id || '').trim();
    if (!pesquisaId) return res.status(400).json({ error: 'pesquisa_id é obrigatório' });
    const limite = Math.min(Number(req.query.limite) || 500, 1000);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const { data, error, count } = await supabase
      .from('cen_resposta')
      .select('id, membro_id, nome_declarado, contato_declarado, canal, identificado_por, concluida_em, duracao_seg',
        { count: 'exact' })
      .eq('pesquisa_id', pesquisaId)
      .not('concluida_em', 'is', null)
      .is('deleted_at', null)
      .order('concluida_em', { ascending: false })
      .range(offset, offset + limite - 1);
    if (error) return res.status(400).json({ error: error.message });









    const ids = [...new Set((data || []).map((r) => r.membro_id).filter(Boolean))];
    const nomes = new Map();
    for (let i = 0; i < ids.length; i += 200) {
      const { data: membros, error: errMembros } = await supabase
        .from('mem_membros').select('id, nome').in('id', ids.slice(i, i + 200));
      if (errMembros) return res.status(500).json({ error: 'Não foi possível carregar os nomes do cadastro: ' + errMembros.message });
      for (const m of membros || []) nomes.set(m.id, m.nome);
    }

    const itens = (data || []).map((r) => ({
      id: r.id,
      nome: r.membro_id ? (nomes.get(r.membro_id) || '—') : (r.nome_declarado || 'Sem identificação'),
      na_base: !!r.membro_id,
      contato: r.membro_id ? null : r.contato_declarado,
      canal: r.canal,
      identificado_por: r.identificado_por,
      concluida_em: r.concluida_em,
      duracao_seg: r.duracao_seg,
    }));


    res.json({ total: count ?? itens.length, offset, limite, itens });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/respostas/:id', authorizeModule('censo', 2), async (req, res) => {
  try {
    const { data: resposta, error } = await supabase
      .from('cen_resposta')
      .select('id, pesquisa_id, membro_id, nome_declarado, contato_declarado, canal, identificado_por, concluida_em, duracao_seg, consentimento_em')
      .eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (error) return res.status(400).json({ error: error.message });
    if (!resposta) return res.status(404).json({ error: 'Resposta não encontrada' });

    const { data: itens } = await supabase
      .from('cen_resposta_item')
      .select('pergunta_id, pergunta_texto, tipo, valor_texto, valor_num, valor_opcoes, sensivel, acao')
      .eq('resposta_id', resposta.id);

    const podeVer = await podeVerSensivel(req.user?.id);
    const visiveis = filtrarSensiveis(itens, podeVer);
    const ocultos = (itens || []).length - visiveis.length;

    let nome = resposta.nome_declarado || 'Sem identificação';
    if (resposta.membro_id) {
      const { data: m } = await supabase
        .from('mem_membros').select('nome').eq('id', resposta.membro_id).maybeSingle();
      nome = m?.nome || '—';
    }

    res.json({
      ...resposta,
      nome,
      itens: visiveis,


      itens_sensiveis_ocultos: ocultos,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});













router.delete('/respostas/:id', authorizeModule('censo', 4), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('cen_resposta')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', req.params.id).is('deleted_at', null)
      .select('id, membro_id, pesquisa_id')
      .maybeSingle();
    if (error) return res.status(400).json({ error: error.message });


    if (!data) return res.status(404).json({ error: 'Resposta não encontrada (ou já apagada)' });

    console.log('[censo] resposta apagada', {
      resposta: data.id, por: req.user?.email || req.user?.id,
    });
    res.json({ ok: true, id: data.id, liberada: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});












async function guardaCuidado(req, res, next) {
  if (req.user?.is_super_admin === true) return next();
  if (await podeVerSensivel(req.user?.id)) return next();
  return res.status(403).json({
    error: 'A fila de cuidado é restrita à equipe designada para o acompanhamento pastoral.',
  });
}

router.get('/cuidado/resumo', authorizeModule('censo', 1), async (req, res) => {
  try {
    let q = supabase.from('vw_cen_cuidado_resumo').select('*');
    const pesquisaId = String(req.query.pesquisa_id || '').trim();
    if (pesquisaId) q = q.eq('pesquisa_id', pesquisaId);
    const { data, error } = await q;
    if (error) return res.status(400).json({ error: error.message });
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/cuidado', authorizeModule('censo', 2), guardaCuidado, async (req, res) => {
  try {
    let q = supabase.from('vw_cen_cuidado_fila').select('*');
    const pesquisaId = String(req.query.pesquisa_id || '').trim();
    if (pesquisaId) q = q.eq('pesquisa_id', pesquisaId);
    if (CUIDADO_STATUS.includes(req.query.status)) q = q.eq('status', req.query.status);
    if (req.query.tipo) q = q.eq('tipo', String(req.query.tipo));


    const { data, error } = await q.order('criado_em', { ascending: true }).limit(500);
    if (error) return res.status(400).json({ error: error.message });
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/cuidado/:id', authorizeModule('censo', 2), guardaCuidado, async (req, res) => {
  try {
    const patch = {};
    if (req.body?.status !== undefined) {
      if (!CUIDADO_STATUS.includes(req.body.status)) return res.status(400).json({ error: 'Status inválido' });
      patch.status = req.body.status;
      patch.concluido_em = ['concluido', 'sem_retorno'].includes(req.body.status)
        ? new Date().toISOString() : null;
    }
    if (req.body?.observacao !== undefined) patch.observacao = limpar(req.body.observacao) || null;
    if (req.body?.responsavel_id !== undefined) {
      patch.responsavel_id = req.body.responsavel_id || null;
    }

    if (req.body?.assumir === true) patch.responsavel_id = req.user?.id || null;

    if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nada para atualizar' });

    const { data, error } = await supabase
      .from('cen_cuidado').update(patch).eq('id', req.params.id).select('id').maybeSingle();
    if (error) return res.status(400).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Pedido não encontrado' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
















router.get('/pendentes', authorizeModule('censo', 2), async (req, res) => {
  try {
    const pesquisaId = String(req.query.pesquisa_id || '').trim();
    if (!pesquisaId) return res.status(400).json({ error: 'pesquisa_id é obrigatório' });
    const { count, error } = await supabase
      .from('cen_resposta').select('id', { count: 'exact', head: true })
      .eq('pesquisa_id', pesquisaId)
      .is('pos_processado_em', null).not('concluida_em', 'is', null).is('deleted_at', null);
    if (error) return res.status(400).json({ error: error.message });

    const { count: comErro } = await supabase
      .from('cen_resposta').select('id', { count: 'exact', head: true })
      .eq('pesquisa_id', pesquisaId)
      .not('pos_processo_erro', 'is', null).is('deleted_at', null);

    res.json({ pendentes: count || 0, com_erro: comErro || 0, lote_max: LOTE_MAX });
  } catch (e) { res.status(500).json({ error: e.message }); }
});































async function reconstruirItensSeFaltam(resposta, perguntasValidadas) {
  const { count, error: eConta } = await supabase
    .from('cen_resposta_item').select('id', { count: 'exact', head: true })
    .eq('resposta_id', resposta.id);
  if (eConta) throw new Error(eConta.message);
  if (count) return 0;

  const { itens } = montarItens({ perguntas: perguntasValidadas, respostas: resposta.payload || {} });
  if (!itens.length) return 0;

  const porId = new Map(perguntasValidadas.map((p) => [p.id, p]));
  const linhas = itens.map((i) => ({
    resposta_id: resposta.id,
    pesquisa_id: resposta.pesquisa_id,
    pergunta_id: i.pergunta_id,
    pergunta_texto: i.pergunta_texto,
    tipo: i.tipo,
    valor_texto: i.valor_texto,
    valor_num: i.valor_num,
    valor_opcoes: i.valor_opcoes,
    sensivel: i.sensivel === true,
    acao: porId.get(i.pergunta_id)?.acao === 'cuidado' ? 'cuidado' : null,
  }));
  const { error } = await supabase.from('cen_resposta_item').insert(linhas);
  if (error) throw new Error(`itens_nao_reconstruidos: ${error.message}`);
  return linhas.length;
}

async function processarPendentes(pesquisaId, limitePedido) {
    const limite = Math.min(Number(limitePedido) || LOTE_MAX, LOTE_MAX);

    const { data: pesquisa, error: e0 } = await supabase
      .from('cen_pesquisa').select('id, perguntas').eq('id', pesquisaId).maybeSingle();
    if (e0) throw new Error(e0.message);
    if (!pesquisa) return { erro: 'nao_encontrada', processadas: 0, vinculadas: 0, conflitos: 0, falhas: 0, restantes: 0 };

    const { data: fila, error: e1 } = await supabase
      .from('cen_resposta')
      .select('id, pesquisa_id, membro_id, payload, identificado_por, concluida_em')
      .eq('pesquisa_id', pesquisaId)
      .is('pos_processado_em', null).not('concluida_em', 'is', null).is('deleted_at', null)
      .order('concluida_em', { ascending: true })
      .limit(limite);
    if (e1) throw new Error(e1.message);
    if (!fila?.length) return { processadas: 0, vinculadas: 0, conflitos: 0, falhas: 0, restantes: 0 };


    const campoPorPergunta = new Map();
    for (const p of pesquisa.perguntas || []) {
      if (p.preenche_de) campoPorPergunta.set(p.id, p.preenche_de);
    }




    const val = validarPerguntas(pesquisa.perguntas || []);
    const perguntasValidadas = val.ok ? val.perguntas : null;

    let vinculadas = 0; let conflitos = 0; let falhas = 0; let itensReconstruidos = 0;
    let optinsLigados = 0; let consentimentosGravados = 0;



    const aplicadosPorCampo = {}; const descartadosPorMotivo = {};
    for (const r of fila) {
      try {



        if (perguntasValidadas) {
          itensReconstruidos += await reconstruirItensSeFaltam(r, perguntasValidadas);
        }

        const porCampo = {};
        for (const [pid, campo] of campoPorPergunta) {
          const v = r.payload?.[pid];
          if (v !== undefined && v !== null && v !== '') porCampo[campo] = v;
        }

        let membroId = r.membro_id;
        let matchedBy = r.identificado_por === 'cpf_nascimento' ? 'cpf' : null;

        if (!membroId) {
          const hit = await acharMembroGuardado({
            email: porCampo.email, telefone: porCampo.telefone,
            nome: porCampo.nome, dataNascimento: porCampo.data_nascimento,
          });
          if (hit?.membro_id) {
            membroId = hit.membro_id;
            matchedBy = hit.matched_by;




            const { error } = await supabase.from('cen_resposta')
              .update({
                membro_id: membroId,
                identificado_por: hit.matched_by === 'cpf' ? 'cpf_nascimento' : 'nome_nascimento',
              })
              .eq('id', r.id);
            if (error) {
              if (error.code === '23505') {
                await supabase.from('cen_resposta')
                  .update({ pos_processado_em: new Date().toISOString(),
                    pos_processo_erro: 'Já existe outra resposta desta mesma pessoa nesta pesquisa.' })
                  .eq('id', r.id);
                continue;
              }
              throw new Error(error.message);
            }
            vinculadas += 1;

            await supabase.from('cen_cuidado').update({ membro_id: membroId }).eq('resposta_id', r.id);




            await supabase.from('inscricao_consentimentos')
              .update({ membro_id: membroId })
              .eq('porta', PORTA_CONSENTIMENTO).eq('ref_id', r.id).is('membro_id', null);
          }
        }

        if (membroId && matchedBy) {
          const dados = { ...porCampo };
          delete dados.nome;
          const out = await reconciliarCenso({ membroId, matchedBy, dados, origemId: r.id });
          conflitos += out?.conflitos?.length || 0;
          for (const c of out?.aplicados || []) {
            aplicadosPorCampo[c] = (aplicadosPorCampo[c] || 0) + 1;
          }
          for (const d of out?.descartados || []) {
            const k = `${d.campo}:${d.motivo}`;
            descartadosPorMotivo[k] = (descartadosPorMotivo[k] || 0) + 1;
          }
        }





        if (perguntasValidadas) {
          const cons = await gravarConsentimentosDoCenso({
            respostaId: r.id,
            perguntas: perguntasValidadas,
            respostas: r.payload || {},
            membroId,
          });
          consentimentosGravados += cons.gravados;




          const opt = await ligarOptinDoCenso({
            membroId, consentimentos: cons.consentimentos, em: r.concluida_em,
          });
          if (opt.ligado) optinsLigados += 1;
        }

        await supabase.from('cen_resposta')
          .update({ pos_processado_em: new Date().toISOString(), pos_processo_erro: null })
          .eq('id', r.id);
      } catch (e) {
        falhas += 1;


        await supabase.from('cen_resposta')
          .update({ pos_processo_erro: String(e.message).slice(0, 400) })
          .eq('id', r.id);
      }
    }

    const { count: restantes } = await supabase
      .from('cen_resposta').select('id', { count: 'exact', head: true })
      .eq('pesquisa_id', pesquisaId)
      .is('pos_processado_em', null).not('concluida_em', 'is', null).is('deleted_at', null);

    return {
      processadas: fila.length, vinculadas, conflitos, falhas, restantes: restantes || 0,
      itens_reconstruidos: itensReconstruidos,


      consentimentos_gravados: consentimentosGravados,
      optins_ligados: optinsLigados,
      cadastro_aplicado: aplicadosPorCampo,
      cadastro_nao_guardado: descartadosPorMotivo,
    };
}

router.post('/pos-processar', authorizeModule('censo', 4), async (req, res) => {
  try {
    const pesquisaId = String(req.body?.pesquisa_id || '').trim();
    if (!pesquisaId) return res.status(400).json({ error: 'pesquisa_id é obrigatório' });
    const out = await processarPendentes(pesquisaId, req.body?.limite);
    if (out.erro === 'nao_encontrada') return res.status(404).json({ error: 'Pesquisa não encontrada' });
    res.json(out);
  } catch (e) { res.status(500).json({ error: e.message }); }
});












router.get('/cobertura', authorizeModule('censo', 1), async (req, res) => {
  try {
    const pesquisaId = req.query.pesquisa_id;
    if (!pesquisaId) return res.status(400).json({ error: 'pesquisa_id é obrigatório' });

    const [stats, porCanalDia, membros, funil] = await Promise.all([
      supabase.from('vw_cen_pesquisa_stats').select('*').eq('pesquisa_id', pesquisaId).maybeSingle(),
      supabase.from('vw_cen_cobertura').select('*').eq('pesquisa_id', pesquisaId).order('dia'),
      supabase.from('mem_membros').select('id', { count: 'exact', head: true })
        .eq('status', 'membro_ativo').is('deleted_at', null),
      supabase.from('vw_cen_funil_pergunta').select('*').eq('pesquisa_id', pesquisaId)
        .order('respostas', { ascending: true }).limit(400),
    ]);
    if (stats.error) throw stats.error;
    if (porCanalDia.error) throw porCanalDia.error;

    const linhas = porCanalDia.data || [];
    const s = stats.data || {};
    const membrosAtivos = membros.count || 0;
    const concluidas = Number(s.concluidas) || 0;
    const identificadas = Number(s.identificadas) || 0;



    const porCanal = {};
    const porDia = {};
    for (const l of linhas) {
      const c = porCanal[l.canal] || (porCanal[l.canal] = { canal: l.canal, iniciadas: 0, concluidas: 0, identificadas: 0 });
      c.iniciadas += Number(l.iniciadas) || 0;
      c.concluidas += Number(l.concluidas) || 0;
      c.identificadas += Number(l.identificadas) || 0;
      const d = porDia[l.dia] || (porDia[l.dia] = { dia: l.dia, iniciadas: 0, concluidas: 0 });
      d.iniciadas += Number(l.iniciadas) || 0;
      d.concluidas += Number(l.concluidas) || 0;
    }



    const abandono = (funil.data || [])
      .filter((f) => Number(f.pct_do_total) < 92)
      .slice(0, 12);

    res.json({
      pesquisa: {
        titulo: s.titulo || null, status: s.status || null,
        total_perguntas: Number(s.total_perguntas) || 0,
        ultima_resposta_em: s.ultima_resposta_em || null,
      },
      iniciadas: Number(s.iniciadas) || 0,
      concluidas,
      abandonadas: Math.max(0, (Number(s.iniciadas) || 0) - concluidas),
      taxa_conclusao: s.taxa_conclusao ?? null,
      duracao_media_seg: s.duracao_media_seg ?? null,
      identificadas,
      anonimas: Number(s.anonimas) || 0,


      membros_ativos: membrosAtivos,
      cobertura_pct: membrosAtivos ? Math.round((identificadas / membrosAtivos) * 1000) / 10 : null,
      por_canal: Object.values(porCanal).sort((a, b) => b.concluidas - a.concluidas),
      por_dia: Object.values(porDia).sort((a, b) => String(a.dia).localeCompare(String(b.dia))),
      abandono,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});



















const TETO_AGREGADO = 20000;
const TETO_DEMO = 20000;

router.get('/perfil', authorizeModule('censo', 1), async (req, res) => {
  try {
    const pesquisaId = req.query.pesquisa_id;
    if (!pesquisaId) return res.status(400).json({ error: 'pesquisa_id é obrigatório' });










    const [pesquisa, agregado, demo] = await Promise.all([
      supabase.from('cen_pesquisa').select('id, titulo, perguntas').eq('id', pesquisaId).maybeSingle(),
      fetchAllRows(
        () => supabase.from('vw_cen_item_agregado').select('*')
          .eq('pesquisa_id', pesquisaId)
          .in('tipo', TIPOS_PARA_BUSCAR)
          .order('pergunta_id').order('valor'),
        { max: TETO_AGREGADO },
      ),




      fetchAllRows(





        () => supabase.from('vw_cen_resposta_pessoa')
          .select('resposta_id, membro_id, faixa_etaria, genero, estado_civil, bairro, status_membro')
          .eq('pesquisa_id', pesquisaId)
          .not('concluida_em', 'is', null)
          .order('resposta_id'),
        { max: TETO_DEMO },
      ),
    ]);
    if (pesquisa.error) throw pesquisa.error;
    if (!pesquisa.data) return res.status(404).json({ error: 'Pesquisa não encontrada' });




    const { count: totalAgregado } = await supabase
      .from('vw_cen_item_agregado')
      .select('pergunta_id', { count: 'exact', head: true })
      .eq('pesquisa_id', pesquisaId)
      .in('tipo', TIPOS_PARA_BUSCAR);
    const leituraIncompleta = Number.isFinite(totalAgregado) && agregado.length < totalAgregado;

    const perguntas = validarPerguntas(pesquisa.data.perguntas || []).perguntas;
    const porId = new Map(perguntas.map((p) => [p.id, p]));






















    const pSexo = perguntas.find((p) => p.preenche_de === 'genero') || null;
    const sexoDeclarado = new Map();
    if (pSexo) {
      const itensSexo = await fetchAllRows(
        () => supabase.from('cen_resposta_item')
          .select('resposta_id, valor_texto')
          .eq('pesquisa_id', pesquisaId)
          .eq('pergunta_id', pSexo.id)
          .order('resposta_id'),
        { max: TETO_DEMO },
      );
      for (const i of itensSexo) {


        const t = traduzirParaCadastro('genero', i.valor_texto);
        if (t.ok) sexoDeclarado.set(i.resposta_id, t.valor);
      }
    }

    const linhasPorPergunta = new Map();
    for (const l of agregado) {
      if (!linhasPorPergunta.has(l.pergunta_id)) linhasPorPergunta.set(l.pergunta_id, []);
      linhasPorPergunta.get(l.pergunta_id).push(l);
    }



    const graficos = [];
    const identificacao = [];
    for (const p of perguntas) {
      if (p.tipo === 'secao') { graficos.push({ tipo: 'secao', id: p.id, texto: p.texto }); continue; }





      if (pSexo && p.id === pSexo.id) {
        identificacao.push({ id: p.id, texto: p.texto, tipo: p.tipo, no_bloco_demografico: true });
        continue;
      }

      const classe = classificar(p.tipo);




      if (classe === 'identificacao') {
        identificacao.push({ id: p.id, texto: p.texto, tipo: p.tipo });
        continue;
      }


      if (classe === 'desconhecido') {
        identificacao.push({ id: p.id, texto: p.texto, tipo: p.tipo, desconhecido: true });
        continue;
      }

      const linhas = linhasPorPergunta.get(p.id) || [];
      if (!linhas.length) continue;

      const { base, neutras, total } = baseSemNeutras(p, linhas);
      const ordenadas = ordenarPorOpcoes(p, linhas).map((l) => {
        const n = Number(l.total) || 0;
        const neutra = ehNeutra(p, l.valor);
        return {
          valor: l.valor, total: n, neutra,


          pct: neutra
            ? (total ? Math.round((n / total) * 1000) / 10 : 0)
            : (base ? Math.round((n / base) * 1000) / 10 : 0),
        };
      });

      let media = null;
      if (TIPOS_NUMERICOS.includes(p.tipo) && base) {
        let soma = 0;
        for (const l of linhas) {
          if (ehNeutra(p, l.valor)) continue;
          const v = Number(l.valor);
          if (Number.isFinite(v)) soma += v * (Number(l.total) || 0);
        }
        media = Math.round((soma / base) * 100) / 100;
      }




      const sensivel = linhas.some((l) => l.sensivel === true);



      const corte = classe === 'lista_longa' ? aplicarTeto(ordenadas) : { valores: ordenadas, ocultos: 0, ocultosTotal: 0 };

      graficos.push({
        tipo: p.tipo, id: p.id, texto: p.texto, sensivel,
        base, neutras, total, media,

        aberta: classe === 'texto' || classe === 'lista_longa',
        valores: classe === 'texto' ? [] : corte.valores,
        valores_ocultos: corte.ocultos || 0,
        valores_ocultos_pessoas: corte.ocultosTotal || 0,
      });
    }


    const cortes = { faixa_etaria: {}, genero: {}, estado_civil: {}, bairro: {}, status_membro: {} };


    const fonteSexo = { declarado: 0, cadastro: 0, sem: 0 };
    for (const r of demo) {
      for (const k of Object.keys(cortes)) {
        let v = r[k] || '(não informado)';
        if (k === 'genero') {
          const declarado = sexoDeclarado.get(r.resposta_id);
          if (declarado) { v = declarado; fonteSexo.declarado += 1; }
          else if (r.genero) fonteSexo.cadastro += 1;
          else fonteSexo.sem += 1;
        }
        cortes[k][v] = (cortes[k][v] || 0) + 1;
      }
    }
    const emLista = (o, teto) => Object.entries(o)
      .map(([valor, total]) => ({ valor, total }))
      .sort((a, b) => b.total - a.total).slice(0, teto || 100);












    const bairroCorte = cortarDemografia(cortes.bairro, 12);






    const idsVivos = new Set(perguntas.map((p) => p.id));
    const orfas = [];
    for (const [id, linhas] of linhasPorPergunta) {
      if (idsVivos.has(id)) continue;
      orfas.push({
        id,
        texto: linhas[0]?.pergunta_texto || id,
        respostas: linhas.reduce((acc, l) => acc + (Number(l.total) || 0), 0),
      });
    }
    orfas.sort((a, b) => b.respostas - a.respostas);

    res.json({
      titulo: pesquisa.data.titulo,





      respondentes: demo.length,





      sexo_fonte: fonteSexo,
      graficos,
      identificacao,
      orfas,


      leitura_incompleta: leituraIncompleta || undefined,
      demografia: {
        faixa_etaria: ordenarPorOpcoes({ opcoes: ['0-11', '12-17', '18-24', '25-34', '35-44', '45-59', '60+'] },
          emLista(cortes.faixa_etaria)),
        genero: emLista(cortes.genero),
        estado_civil: emLista(cortes.estado_civil),
        bairro: bairroCorte.valores,
        status_membro: emLista(cortes.status_membro),
      },


      demografia_ocultos: {
        bairro: { valores: bairroCorte.ocultos, pessoas: bairroCorte.ocultos_pessoas },
      },
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});



















router.get('/perfil/mapa', authorizeModule('censo', 1), async (req, res) => {
  try {
    const pesquisaId = req.query.pesquisa_id;
    if (!pesquisaId) return res.status(400).json({ error: 'pesquisa_id é obrigatório' });

    const respostas = await fetchAllRows(


      () => supabase.from('vw_cen_resposta_pessoa')
        .select('resposta_id, membro_id')
        .eq('pesquisa_id', pesquisaId)
        .not('concluida_em', 'is', null)
        .order('resposta_id'),
      { max: TETO_DEMO },
    );
    const total = respostas.length;
    const ids = [...new Set(respostas.map((r) => r.membro_id).filter(Boolean))];


    const semCadastro = total - respostas.filter((r) => r.membro_id).length;








    const pessoas = [];
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await supabase
        .from('vw_dem_pessoa')
        .select('id, bairro, bairro_norm')
        .in('id', ids.slice(i, i + 200));


      if (error) throw error;
      pessoas.push(...(data || []));
    }


    const normsUsados = [...new Set(pessoas.map((p) => p.bairro_norm).filter(Boolean))];
    const geo = new Map();
    for (let i = 0; i < normsUsados.length; i += 200) {
      const { data, error } = await supabase
        .from('dem_bairro_geo')
        .select('bairro_norm, bairro, lat, lng')
        .in('bairro_norm', normsUsados.slice(i, i + 200));
      if (error) throw error;
      for (const g of data || []) geo.set(g.bairro_norm, g);
    }

    const porNorm = new Map();
    let semBairro = 0;
    let semCoordenada = 0;
    const achadas = new Set();
    for (const p of pessoas) {
      achadas.add(p.id);
      if (!p.bairro_norm) { semBairro += 1; continue; }
      const g = geo.get(p.bairro_norm);
      if (!g || g.lat == null || g.lng == null) { semCoordenada += 1; continue; }
      const at = porNorm.get(p.bairro_norm)
        || { bairro: p.bairro || g.bairro || p.bairro_norm, norm: p.bairro_norm, total: 0, lat: Number(g.lat), lng: Number(g.lng) };
      at.total += 1;
      porNorm.set(p.bairro_norm, at);
    }



    const foraDaBase = ids.length - achadas.size;

    const bairros = [...porNorm.values()].sort((a, b) => b.total - a.total);
    const noMapa = bairros.reduce((acc, b) => acc + b.total, 0);

    res.json({
      bairros,
      total,
      pessoas_no_mapa: noMapa,
      pessoas_sem_bairro: semBairro,
      pessoas_sem_coordenada: semCoordenada,
      pessoas_sem_cadastro: semCadastro,
      pessoas_fora_da_base: foraDaBase,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

























const PAGINA_CRUZ = 1000;


async function lerEmParalelo(build, total) {
  const paginas = Math.ceil((Number(total) || 0) / PAGINA_CRUZ);
  const partes = await Promise.all(Array.from({ length: paginas }, async (_, k) => {
    const { data, error } = await build().range(k * PAGINA_CRUZ, (k + 1) * PAGINA_CRUZ - 1);
    if (error) throw error;
    return data || [];
  }));
  return partes.flat();
}


function valoresDoItem(i) {
  if (Array.isArray(i.valor_opcoes)) return i.valor_opcoes.filter((v) => v != null).map(String);
  if (i.valor_num != null && Number.isFinite(Number(i.valor_num))) return [String(Number(i.valor_num))];
  if (i.valor_texto != null && i.valor_texto !== '') return [String(i.valor_texto)];
  return [];
}

router.get('/perfil/cruzamento', authorizeModule('censo', 2), async (req, res) => {
  try {
    const pesquisaId = String(req.query.pesquisa_id || '').trim();
    if (!pesquisaId) return res.status(400).json({ error: 'pesquisa_id é obrigatório' });

    const [pesquisa, podeSensivel] = await Promise.all([
      supabase.from('cen_pesquisa').select('id, perguntas').eq('id', pesquisaId).maybeSingle(),
      podeVerSensivel(req.user?.id),
    ]);
    if (pesquisa.error) throw pesquisa.error;
    if (!pesquisa.data) return res.status(404).json({ error: 'Pesquisa não encontrada' });
    const perguntas = validarPerguntas(pesquisa.data.perguntas || []).perguntas;
    const pSexo = perguntas.find((p) => p.preenche_de === 'genero') || null;
    const incluirGenerosidade = podeVerMarcadorSensivel(req.user);


    const baseResp = () => supabase.from('vw_cen_resposta_pessoa')
      .select('resposta_id, membro_id, nome, faixa_etaria, genero, estado_civil, bairro, status_membro')
      .eq('pesquisa_id', pesquisaId).not('concluida_em', 'is', null).order('resposta_id');
    const baseItens = () => supabase.from('cen_resposta_item')
      .select('resposta_id, pergunta_id, valor_texto, valor_num, valor_opcoes, sensivel, acao')
      .eq('pesquisa_id', pesquisaId)
      .in('tipo', TIPOS_PARA_BUSCAR)
      .order('id');
    const [cResp, cItens] = await Promise.all([
      supabase.from('vw_cen_resposta_pessoa').select('resposta_id', { count: 'exact', head: true })
        .eq('pesquisa_id', pesquisaId).not('concluida_em', 'is', null),
      supabase.from('cen_resposta_item').select('id', { count: 'exact', head: true })
        .eq('pesquisa_id', pesquisaId).in('tipo', TIPOS_PARA_BUSCAR),
    ]);
    if (cResp.error) throw cResp.error;
    if (cItens.error) throw cItens.error;

    const [respostas, itens] = await Promise.all([
      lerEmParalelo(baseResp, cResp.count),
      lerEmParalelo(baseItens, cItens.count),
    ]);

    const membroIds = [...new Set(respostas.map((r) => r.membro_id).filter(Boolean))];



    const bairroNorm = new Map();
    const lotes = [];
    for (let i = 0; i < membroIds.length; i += 200) lotes.push(membroIds.slice(i, i + 200));
    const [valores] = await Promise.all([
      valoresDosRespondentes(membroIds, { incluirGenerosidade }),
      Promise.all(lotes.map(async (lote) => {
        const { data, error } = await supabase.from('vw_dem_pessoa').select('id, bairro_norm').in('id', lote);
        if (error) throw error;
        for (const p of data || []) if (p.bairro_norm) bairroNorm.set(p.id, p.bairro_norm);
      })),
    ]);

    const respostasPorId = new Map();
    for (const r of respostas) {
      respostasPorId.set(r.resposta_id, {
        id: r.resposta_id,
        nome: r.nome || 'Sem identificação',
        membro: !!r.membro_id,
        d: {
          faixa_etaria: r.faixa_etaria || '(não informado)',
          genero: r.genero || '(não informado)',
          estado_civil: r.estado_civil || '(não informado)',
          bairro: r.bairro || '(não informado)',
          status_membro: r.status_membro || '(não informado)',
        },
        bn: (r.membro_id && bairroNorm.get(r.membro_id)) || null,
        a: {},
        v: r.membro_id ? (valores.porMembro.get(r.membro_id) || null) : null,
      });
    }

    const dicionario = {};
    const indice = {};
    for (const i of itens) {
      const pessoa = respostasPorId.get(i.resposta_id);
      if (!pessoa) continue;

      if (i.acao === 'cuidado') continue;


      if (i.sensivel === true && !podeSensivel) continue;

      if (pSexo && i.pergunta_id === pSexo.id) {
        const t = traduzirParaCadastro('genero', i.valor_texto);
        if (t.ok) pessoa.d.genero = t.valor;
        continue;
      }
      const vs = valoresDoItem(i);
      if (!vs.length) continue;



      if (!dicionario[i.pergunta_id]) { dicionario[i.pergunta_id] = []; indice[i.pergunta_id] = new Map(); }
      const idx = indice[i.pergunta_id];
      const cods = vs.map((v) => {
        if (!idx.has(v)) { idx.set(v, dicionario[i.pergunta_id].length); dicionario[i.pergunta_id].push(v); }
        return idx.get(v);
      });
      pessoa.a[i.pergunta_id] = (pessoa.a[i.pergunta_id] || []).concat(cods);
    }

    res.json({
      dicionario,
      pessoas: [...respostasPorId.values()],
      sensiveis_fora: !podeSensivel,
      generosidade_visivel: incluirGenerosidade,
      valores_indisponiveis: valores.indisponiveis,
      valores_desde: valores.desde,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});










router.get('/ia', authorizeModule('censo', 1), async (req, res) => {
  try {
    const pesquisaId = req.query.pesquisa_id;
    if (!pesquisaId) return res.status(400).json({ error: 'pesquisa_id é obrigatório' });

    const [ultima, agora] = await Promise.all([
      supabase.from('cen_leitura_ia')
        .select('id, respostas_na_base, respostas_lidas, modelo, conteudo, gerada_em')
        .eq('pesquisa_id', pesquisaId).order('gerada_em', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('cen_resposta').select('id', { count: 'exact', head: true })
        .eq('pesquisa_id', pesquisaId).not('concluida_em', 'is', null).is('deleted_at', null),
    ]);
    if (ultima.error) throw ultima.error;

    const naBase = agora.count || 0;
    const l = ultima.data;
    res.json({
      leitura: l ? { ...l, conteudo: l.conteudo } : null,
      respostas_na_base: naBase,


      desatualizada: !!l && naBase > (l.respostas_na_base || 0) * 1.3,
      novas_desde: l ? Math.max(0, naBase - (l.respostas_na_base || 0)) : naBase,
      pode_gerar: getEffectiveLevel(req, 'censo') >= 4,
      ia_configurada: !!process.env.ANTHROPIC_API_KEY,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/ia', authorizeModule('censo', 4), async (req, res) => {
  try {
    const pesquisaId = req.body?.pesquisa_id;
    if (!pesquisaId) return res.status(400).json({ error: 'pesquisa_id é obrigatório' });
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(503).json({ error: 'ANTHROPIC_API_KEY não configurada no servidor' });
    }













    const { data: itens, error } = await supabase
      .from('cen_resposta_item')
      .select('pergunta_id, pergunta_texto, tipo, valor_texto, sensivel, cen_resposta!inner(pesquisa_id, concluida_em, deleted_at)')
      .eq('cen_resposta.pesquisa_id', pesquisaId)
      .not('cen_resposta.concluida_em', 'is', null)
      .is('cen_resposta.deleted_at', null)
      .eq('sensivel', false)
      .in('tipo', [...TIPOS_PARA_IA])
      .not('valor_texto', 'is', null)
      .limit(20000);
    if (error) throw error;

    const abertos = (itens || []).filter((i) => String(i.valor_texto || '').trim().length >= 3);
    if (!abertos.length) {











      const { data: p } = await supabase
        .from('cen_pesquisa').select('perguntas').eq('id', pesquisaId).maybeSingle();
      const temPerguntaAberta = Array.isArray(p?.perguntas)
        && p.perguntas.some((q) => TIPOS_PARA_IA.has(String(q?.tipo || '')));
      return res.status(422).json({
        error: temPerguntaAberta
          ? 'Ainda ninguém escreveu nas perguntas abertas desta pesquisa.'
          : 'Esta pesquisa não tem nenhuma pergunta aberta (texto longo), então não há o que ler. A leitura da IA usa só o que as pessoas escrevem com as próprias palavras — acrescente ao menos uma pergunta aberta ao questionário.',
        sem_pergunta_aberta: !temPerguntaAberta,
      });
    }

    const leitura = await lerRespostasAbertas(abertos);
    if (!leitura) return res.status(502).json({ error: 'A IA não devolveu uma leitura utilizável' });

    const { count: naBase } = await supabase.from('cen_resposta')
      .select('id', { count: 'exact', head: true })
      .eq('pesquisa_id', pesquisaId).not('concluida_em', 'is', null).is('deleted_at', null);

    const { data: salva, error: e2 } = await supabase.from('cen_leitura_ia').insert({
      pesquisa_id: pesquisaId,
      respostas_na_base: naBase || 0,
      respostas_lidas: leitura.respostas_lidas,
      modelo: leitura.modelo,
      conteudo: {
        por_pergunta: leitura.por_pergunta,
        leitura_geral: leitura.leitura_geral,
        truncadas: leitura.truncadas,
      },
      uso: leitura.uso,
      gerada_por: req.user?.id || null,
    }).select('id, respostas_na_base, respostas_lidas, modelo, conteudo, gerada_em').single();
    if (e2) throw e2;

    res.json({ leitura: salva, respostas_na_base: naBase || 0, desatualizada: false, novas_desde: 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
















async function materialDoRelatorio(pesquisaId) {


  const agregado = await fetchAllRows(
    () => supabase.from('vw_cen_item_agregado')
      .select('pergunta_texto, tipo, valor, total')
      .eq('pesquisa_id', pesquisaId)
      .in('tipo', TIPOS_PARA_BUSCAR)
      .order('pergunta_id').order('valor'),
    { max: TETO_AGREGADO },
  );





  const perguntasUsadas = new Set();
  for (const c of CRUZAMENTOS) {
    perguntasUsadas.add(c.eixo);
    if (c.controle) perguntasUsadas.add(c.controle);
    for (const m of c.metricas) perguntasUsadas.add(m);
  }
  const itens = await fetchAllRows(
    () => supabase.from('cen_resposta_item')
      .select('resposta_id, pergunta_texto, valor_texto, cen_resposta!inner(pesquisa_id, concluida_em, deleted_at)')
      .eq('cen_resposta.pesquisa_id', pesquisaId)
      .not('cen_resposta.concluida_em', 'is', null)
      .is('cen_resposta.deleted_at', null)
      .in('pergunta_texto', [...perguntasUsadas])
      .order('resposta_id'),
    { max: 60000 },
  );
  const porPessoa = new Map();
  for (const i of itens) {
    if (!porPessoa.has(i.resposta_id)) porPessoa.set(i.resposta_id, {});
    if (i.valor_texto != null) porPessoa.get(i.resposta_id)[i.pergunta_texto] = i.valor_texto;
  }

  return {
    perfil: montarPerfil(agregado),
    cruzamentos: montarCruzamentos([...porPessoa.values()]),
  };
}

router.get('/relatorio', authorizeModule('censo', 1), async (req, res) => {
  try {
    const pesquisaId = req.query.pesquisa_id;
    if (!pesquisaId) return res.status(400).json({ error: 'pesquisa_id é obrigatório' });

    const [ultimo, agora] = await Promise.all([
      supabase.from('cen_relatorio_ia')
        .select('id, respostas_na_base, respostas_lidas, modelo, conteudo, gerado_em')
        .eq('pesquisa_id', pesquisaId).order('gerado_em', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('cen_resposta').select('id', { count: 'exact', head: true })
        .eq('pesquisa_id', pesquisaId).not('concluida_em', 'is', null).is('deleted_at', null),
    ]);
    if (ultimo.error) throw ultimo.error;

    const naBase = agora.count || 0;
    const r = ultimo.data;
    res.json({
      relatorio: r || null,
      respostas_na_base: naBase,


      desatualizado: !!r && naBase > (r.respostas_na_base || 0) * 1.3,
      novas_desde: r ? Math.max(0, naBase - (r.respostas_na_base || 0)) : naBase,
      pode_gerar: getEffectiveLevel(req, 'censo') >= 4,
      ia_configurada: !!process.env.ANTHROPIC_API_KEY,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/relatorio', authorizeModule('censo', 4), async (req, res) => {
  try {
    const pesquisaId = req.body?.pesquisa_id;
    if (!pesquisaId) return res.status(400).json({ error: 'pesquisa_id é obrigatório' });
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(503).json({ error: 'ANTHROPIC_API_KEY não configurada no servidor' });
    }

    const material = await materialDoRelatorio(pesquisaId);


    if (!material.perfil.length) {
      return res.status(422).json({
        error: 'Esta pesquisa ainda não tem resposta suficiente para um relatório.',
      });
    }

    const { count: naBase } = await supabase.from('cen_resposta')
      .select('id', { count: 'exact', head: true })
      .eq('pesquisa_id', pesquisaId).not('concluida_em', 'is', null).is('deleted_at', null);

    const rel = await gerarRelatorio({ ...material, respostas: naBase || 0 });
    if (!rel) return res.status(502).json({ error: 'A IA não devolveu um relatório utilizável' });

    const { data: salvo, error: e2 } = await supabase.from('cen_relatorio_ia').insert({
      pesquisa_id: pesquisaId,
      respostas_na_base: naBase || 0,
      respostas_lidas: rel.respostas_lidas,
      modelo: rel.modelo,
      conteudo: {
        resumo_executivo: rel.resumo_executivo,
        achados: rel.achados,
        recomendacoes: rel.recomendacoes,
        recomendacoes_descartadas: rel.recomendacoes_descartadas,
        o_que_o_censo_nao_responde: rel.o_que_o_censo_nao_responde,


        perfil: material.perfil,
        cruzamentos: material.cruzamentos,
      },
      uso: rel.uso,
      gerado_por: req.user?.id || null,
    }).select('id, respostas_na_base, respostas_lidas, modelo, conteudo, gerado_em').single();
    if (e2) throw e2;

    res.json({ relatorio: salvo, respostas_na_base: naBase || 0, desatualizado: false, novas_desde: 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});




















function consultaPotencial(pesquisaId) {
  return () => supabase
    .from('cen_resposta')
    .select('id, membro_id, payload')
    .eq('pesquisa_id', pesquisaId)
    .not('concluida_em', 'is', null)
    .not('payload', 'is', null)



    .order('id');
}





async function baseDoPotencial(pesquisaId) {
  const [linhas, { count }] = await Promise.all([
    fetchAllRows(consultaPotencial(pesquisaId)),
    supabase.from('cen_resposta').select('id', { count: 'exact', head: true })
      .eq('pesquisa_id', pesquisaId)
      .not('concluida_em', 'is', null)
      .not('payload', 'is', null),
  ]);
  const esperado = count || 0;
  return { linhas, esperado, truncado: esperado > 0 && linhas.length < esperado };
}





async function contribuintesDoPotencial(linhas) {
  const ids = [...new Set(linhas.map((l) => l.membro_id).filter(Boolean))];
  try {
    return await idsPresentes('mem_contribuicoes',
      (q) => q.is('deleted_at', null).in('tipo', ['dizimo', 'oferta']).gte('data', desdeDozeMeses()), ids);
  } catch (e) {
    console.warn('[censo/potencial] generosidade indisponível:', e.message);
    return undefined;
  }
}





router.get('/potencial/resumo', authorizeModule('censo', 2), async (req, res) => {
  try {
    const pesquisaId = req.query.pesquisa_id;
    if (!pesquisaId) return res.status(400).json({ error: 'pesquisa_id é obrigatório' });
    const { linhas, esperado, truncado } = await baseDoPotencial(pesquisaId);
    const contribuintes = await contribuintesDoPotencial(linhas);
    res.json({ ...resumoPotencial(linhas, { contribuintes }), base: linhas.length, esperado, truncado });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
















const KIDS_CHECKIN_JANELA_DIAS = require('../utils/censoPotencial').DIAS_FREQUENCIA_KIDS;

async function emLotes(valores, fn) {
  const out = [];
  for (let i = 0; i < valores.length; i += 200) {
    const { data, error } = await fn(valores.slice(i, i + 200));
    if (error) throw error;
    out.push(...(data || []));
  }
  return out;
}

async function cruzamentoKidsDoPotencial(linhas) {
  const { hojeBRT } = require('../utils/inscricaoMenor');
  const hoje = hojeBRT();


  const alvo = linhas.filter((l) => String(l?.payload?.tem_filhos || '') === 'Sim');
  const cpfsSemMembro = [...new Set(alvo
    .filter((l) => !l.membro_id)
    .map((l) => String(l.payload?.cpf || '').replace(/\D/g, ''))
    .filter((c) => c.length === 11))];
  const membroPorCpf = new Map();
  const membros = await emLotes(cpfsSemMembro, (lote) => supabase.from('mem_membros')
    .select('id, cpf').in('cpf', lote).is('deleted_at', null));
  for (const m of membros) if (m.cpf) membroPorCpf.set(String(m.cpf).replace(/\D/g, ''), m.id);

  const membroIds = [...new Set([
    ...alvo.map((l) => l.membro_id).filter(Boolean),
    ...membroPorCpf.values(),
  ])];
  const vinculos = await emLotes(membroIds, (lote) => supabase.from('kids_responsaveis')
    .select('membro_id, crianca_id').in('membro_id', lote));
  const criancaIds = [...new Set(vinculos.map((v) => v.crianca_id))];
  const criancas = await emLotes(criancaIds, (lote) => supabase.from('kids_criancas')
    .select('id, nome, data_nascimento').in('id', lote).eq('ativo', true).is('deleted_at', null));
  const porCrianca = new Map(criancas.map((c) => [c.id, c]));



  const desde = new Date(Date.now() - KIDS_CHECKIN_JANELA_DIAS * 86400000).toISOString();
  const checkins = await emLotes(criancaIds, (lote) => supabase.from('kids_checkins')
    .select('crianca_id, checkin_at').in('crianca_id', lote).is('deleted_at', null).gte('checkin_at', desde));
  const ultimo = new Map();
  for (const c of checkins) {
    if (!ultimo.has(c.crianca_id) || ultimo.get(c.crianca_id) < c.checkin_at) ultimo.set(c.crianca_id, c.checkin_at);
  }

  const kids = new Map();
  for (const v of vinculos) {
    const c = porCrianca.get(v.crianca_id);
    if (!c) continue;
    if (!kids.has(v.membro_id)) kids.set(v.membro_id, []);


    const ult = ultimo.get(c.id);
    kids.get(v.membro_id).push({
      nome: c.nome, data_nascimento: c.data_nascimento,
      ultimo_checkin: ult ? new Date(Date.parse(ult) - 3 * 3600 * 1000).toISOString().slice(0, 10) : null,
    });
  }
  return { kids, membroPorCpf, hoje };
}


router.get('/potencial', authorizeModule('censo', 4), async (req, res) => {
  try {
    const pesquisaId = req.query.pesquisa_id;
    if (!pesquisaId) return res.status(400).json({ error: 'pesquisa_id é obrigatório' });
    const { linhas, esperado, truncado } = await baseDoPotencial(pesquisaId);





    const formados = new Set();
    try {
      const fs = await fetchAllRows(() => supabase
        .from('vw_next_formado_pessoa').select('membro_id').not('membro_id', 'is', null).order('membro_id'));
      for (const f of fs) formados.add(f.membro_id);
    } catch {                                                   }





    let cruzamento = null;
    let kidsIndisponivel = false;
    try { cruzamento = await cruzamentoKidsDoPotencial(linhas); } catch (e) {
      kidsIndisponivel = true;
      console.warn('[censo/potencial] cruzamento com o Kids indisponível:', e.message);
    }

    const contribuintes = await contribuintesDoPotencial(linhas);
    const potencial = montarPotencial(linhas, formados, { ...(cruzamento || {}), contribuintes });



    const generosidadeNominal = podeVerMarcadorSensivel(req.user);
    if (!generosidadeNominal) potencial.sem_generosidade = [];
    res.json({
      ...potencial,
      generosidade_nominal: generosidadeNominal,
      base: linhas.length,
      esperado,
      truncado,
      kids_cruzamento_indisponivel: kidsIndisponivel,
      kids_janela_dias: KIDS_CHECKIN_JANELA_DIAS,
      pode_exportar: podeExportar(req.user, 'censo'),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});




















async function lerPesquisaERespostas(pesquisaId) {
  const [{ data: pesquisa, error: eP }, respostas] = await Promise.all([
    supabase.from('cen_pesquisa').select('id, slug, titulo').eq('id', pesquisaId).is('deleted_at', null).maybeSingle(),




    fetchAllRows(() => supabase
      .from('cen_resposta').select('id, membro_id, payload')
      .eq('pesquisa_id', pesquisaId).not('concluida_em', 'is', null).is('deleted_at', null).order('id'))
      .then((rows) => rows.map((r) => ({ membro_id: r.membro_id, cpf: r.payload?.cpf ?? null }))),
  ]);
  if (eP) throw eP;
  if (!pesquisa) { const err = new Error('Pesquisa não encontrada'); err.status = 404; throw err; }
  return { pesquisa, respostas };
}

async function baseVoluntariosSemCenso(pesquisaId, { nominal }) {
  const { perfisPorId } = require('../services/agenteVoluntariado');

  const [{ pesquisa, respostas }, vinculos] = await Promise.all([
    lerPesquisaERespostas(pesquisaId),
    fetchAllRows(() => supabase
      .from('vol_team_members')
      .select('id, team_id, volunteer_profile_id, planning_center_person_id, volunteer_name, is_active, team:vol_teams(id, name, area, is_active)')
      .eq('is_active', true).order('id')),
  ]);


  const ids = [...new Set(vinculos.map((v) => v.volunteer_profile_id).filter(Boolean))];
  const pcIds = [...new Set(vinculos.filter((v) => !v.volunteer_profile_id && v.planning_center_person_id).map((v) => String(v.planning_center_person_id)))];
  const perfis = {};
  const perfilPorPc = {};
  const lotes = async (valores, coluna) => {
    for (let i = 0; i < valores.length; i += 200) {
      const chunk = valores.slice(i, i + 200);
      const { data, error } = await supabase.from('vol_profiles')
        .select('id, full_name, cpf, membresia_id, arquivado, planning_center_id').in(coluna, chunk);
      if (error) throw error;
      for (const p of data || []) {
        perfis[p.id] = p;
        if (p.planning_center_id) perfilPorPc[String(p.planning_center_id)] = p.id;
      }
    }
  };
  await lotes(ids, 'id');
  await lotes(pcIds, 'planning_center_id');

  const todosPerfis = Object.keys(perfis);

  const membroIds = [...new Set(todosPerfis.map((id) => perfis[id].membresia_id).filter(Boolean))];
  const membros = {};
  for (let i = 0; i < membroIds.length; i += 200) {
    const { data, error } = await supabase.from('mem_membros').select('id, nome, cpf')
      .in('id', membroIds.slice(i, i + 200)).is('deleted_at', null);
    if (error) throw error;
    for (const m of data || []) membros[m.id] = m;
  }



  const contatos = nominal ? await perfisPorId(todosPerfis) : {};

  return montarVoluntariosSemCenso({
    vinculos, perfis, perfilPorPc, membros, contatos, respostas,
    link: linkPesquisa(BASE_LINK_PUBLICO, pesquisa.slug),
    titulo: pesquisa.titulo,
    nominal,
  });
}

router.get('/potencial/voluntarios/resumo', authorizeModule('censo', 2), async (req, res) => {
  try {
    const pesquisaId = req.query.pesquisa_id;
    if (!pesquisaId) return res.status(400).json({ error: 'pesquisa_id é obrigatório' });
    res.json(await baseVoluntariosSemCenso(pesquisaId, { nominal: false }));
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

router.get('/potencial/voluntarios', authorizeModule('censo', 4), async (req, res) => {
  try {
    const pesquisaId = req.query.pesquisa_id;
    if (!pesquisaId) return res.status(400).json({ error: 'pesquisa_id é obrigatório' });
    res.json(await baseVoluntariosSemCenso(pesquisaId, { nominal: true }));
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});





















async function basePessoasEmGrupoSemCenso(pesquisaId, { nominal }) {
  const [{ pesquisa, respostas }, vinculos] = await Promise.all([
    lerPesquisaERespostas(pesquisaId),
    fetchAllRows(() => supabase
      .from('mem_grupo_membros')
      .select('id, grupo_id, membro_id, funcao, grupo:mem_grupos!inner(id, nome, categoria, lider_id, dia_semana, horario, ativo, deleted_at)')
      .is('saiu_em', null).is('deleted_at', null)
      .eq('grupo.ativo', true).is('grupo.deleted_at', null)
      .order('id')),
  ]);

  const grupos = {};
  for (const v of vinculos) {
    const g = v.grupo;
    if (g && g.ativo === true && !g.deleted_at) grupos[g.id] = g;
  }



  const ids = [...new Set([
    ...vinculos.map((v) => v.membro_id),
    ...Object.values(grupos).map((g) => g.lider_id),
  ].filter(Boolean))];
  const membros = {};
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase.from('mem_membros')
      .select('id, nome, cpf, telefone').in('id', ids.slice(i, i + 200)).is('deleted_at', null);
    if (error) throw error;
    for (const m of data || []) {
      const alcanca = telefoneAlcancavel(m.telefone);
      membros[m.id] = {
        id: m.id, nome: m.nome, cpf: m.cpf,
        telefone: nominal && alcanca ? m.telefone : null,
        telefone_fonte: nominal && alcanca ? 'cadastro' : null,
      };
    }
  }


  if (nominal) {
    const semTelefone = Object.values(membros).filter((m) => !m.telefone).map((m) => m.id);
    for (let i = 0; i < semTelefone.length; i += 200) {
      const { data, error } = await supabase.from('mem_contatos')
        .select('membro_id, valor, fonte, ultimo_visto')
        .in('membro_id', semTelefone.slice(i, i + 200)).eq('tipo', 'telefone').is('deleted_at', null)
        .order('ultimo_visto', { ascending: false });
      if (error) throw error;
      for (const c of data || []) {
        const m = membros[c.membro_id];
        if (!m || m.telefone || !telefoneAlcancavel(c.valor)) continue;
        m.telefone = c.valor;
        m.telefone_fonte = c.fonte ? `contato secundário (${c.fonte})` : 'contato secundário';
      }
    }
  }

  return montarPessoasEmGrupoSemCenso({
    vinculos, grupos, membros, respostas,
    link: linkPesquisa(BASE_LINK_PUBLICO, pesquisa.slug),
    titulo: pesquisa.titulo,
    nominal,
  });
}

router.get('/potencial/grupos/resumo', authorizeModule('censo', 2), async (req, res) => {
  try {
    const pesquisaId = req.query.pesquisa_id;
    if (!pesquisaId) return res.status(400).json({ error: 'pesquisa_id é obrigatório' });
    res.json(await basePessoasEmGrupoSemCenso(pesquisaId, { nominal: false }));
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

router.get('/potencial/grupos', authorizeModule('censo', 4), async (req, res) => {
  try {
    const pesquisaId = req.query.pesquisa_id;
    if (!pesquisaId) return res.status(400).json({ error: 'pesquisa_id é obrigatório' });
    res.json(await basePessoasEmGrupoSemCenso(pesquisaId, { nominal: true }));
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});
























router.post('/potencial/cuidado', authorizeModule('censo', 4), async (req, res) => {
  try {
    const respostaId = String(req.body?.resposta_id || '').trim();
    const tipo = String(req.body?.tipo || 'conversa').trim();
    if (!respostaId) return res.status(400).json({ error: 'resposta_id é obrigatório' });


    if (!['familiar', 'aconselhamento', 'oracao', 'conversa'].includes(tipo)) {
      return res.status(400).json({ error: 'Tipo inválido' });
    }

    const { data: r, error: eR } = await supabase
      .from('cen_resposta').select('id, pesquisa_id, membro_id')
      .eq('id', respostaId).is('deleted_at', null).maybeSingle();
    if (eR) return res.status(400).json({ error: eR.message });
    if (!r) return res.status(404).json({ error: 'Resposta não encontrada' });






    const { data: jaTem } = await supabase
      .from('cen_cuidado').select('id, status')
      .eq('resposta_id', respostaId).eq('tipo', tipo)
      .in('status', ['aberto', 'em_contato'])
      .maybeSingle();
    if (jaTem) return res.status(200).json({ ok: true, ja_estava: true, id: jaTem.id });

    const { data, error } = await supabase.from('cen_cuidado').insert({
      pesquisa_id: r.pesquisa_id,
      resposta_id: r.id,
      membro_id: r.membro_id || null,
      tipo,
      status: 'aberto',
      observacao: limpar(req.body?.observacao) || null,
    }).select('id').maybeSingle();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ ok: true, ja_estava: false, id: data?.id || null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
