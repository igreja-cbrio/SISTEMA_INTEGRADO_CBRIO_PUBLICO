const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const { authenticate, authorize, authorizeModule, getUserAreas } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { notificar } = require('../services/notificar');
const npsService = require('../services/npsService');
const multer = require('multer');
const XLSX = require('xlsx');
const { parseGoogleForm, converterNota } = require('../services/googleFormsParser');


const { sincronizarKpi, removerDadosBrutos } = require('../services/npsKpiSync');


const SHEET_MIMES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
  'application/csv',
];
const uploadPlanilha = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (SHEET_MIMES.includes(file.mimetype) || /\.(xlsx?|csv)$/i.test(file.originalname || '')) cb(null, true);
    else cb(new Error('Envie a planilha em .xlsx, .xls ou .csv.'));
  },
});

const TIPOS_KPI_VALIDOS = ['nps_geral', 'nps_next', 'nps_lideres', 'nps_voluntarios', 'nps_culto'];


const iaLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Limite de chamadas à IA atingido. Tente novamente em 1h.' },
  skip: (req) => req.user?.role === 'admin',
});

router.use(authenticate);







function ehAdminDiretor(req) {
  return ['admin', 'diretor'].includes(req.user?.role);
}
function _norm(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}
function areasDoUsuario(req) {
  return getUserAreas(req).map(_norm).filter(Boolean);
}

function podeNaArea(req, area) {
  if (ehAdminDiretor(req)) return true;
  return areasDoUsuario(req).includes(_norm(area));
}

async function guardArea(req, id) {
  if (ehAdminDiretor(req)) return true;
  const { data } = await supabase.from('nps_pesquisas').select('area').eq('id', id).single();
  return !!data && podeNaArea(req, data.area);
}

function nivelNps(req) {
  const p = req.user?.granular?.modulePerms?.nps || {};
  return Math.max(Number(p.leitura) || 0, Number(p.escrita) || 0);
}



function podeGerenciarPesquisa(req, pesquisa) {
  if (!pesquisa) return false;
  if (ehAdminDiretor(req)) return true;
  if (pesquisa.criado_por && pesquisa.criado_por === req.user.userId) return true;
  return nivelNps(req) >= 3 && podeNaArea(req, pesquisa.area);
}
async function podeGerenciar(req, id) {
  if (ehAdminDiretor(req)) return true;
  const { data } = await supabase.from('nps_pesquisas').select('criado_por, area').eq('id', id).single();
  return podeGerenciarPesquisa(req, data);
}







router.post('/gerar-perguntas', iaLimiter, async (req, res) => {
  try {
    const { valor, objetivo, contexto_kpi, area } = req.body || {};
    if (!objetivo) {
      return res.status(400).json({ error: 'objetivo é obrigatório' });
    }
    const areaInformada = area && String(area).toLowerCase() !== 'geral' ? area : null;
    if (!valor && !areaInformada) {
      return res.status(400).json({ error: 'Defina um escopo: um valor da CBRio ou uma área específica.' });
    }
    const contextoKpi = TIPOS_KPI_VALIDOS.includes(contexto_kpi) ? contexto_kpi : 'nps_geral';
    const result = await npsService.gerarPerguntas({ valor: valor || null, objetivo, contextoKpi, area });
    res.json(result);
  } catch (e) {
    console.error('[nps] gerar-perguntas:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao gerar perguntas' });
  }
});








router.post('/importar-form', async (req, res) => {
  try {
    const { url } = req.body || {};
    const form = await parseGoogleForm(url);
    res.json(form);
  } catch (e) {
    console.error('[nps] importar-form:', e.message);
    res.status(400).json({ error: e.message || 'Não consegui ler o formulário' });
  }
});








router.get('/', async (req, res) => {
  try {
    const { status, valor } = req.query;
    let q = supabase
      .from('nps_pesquisas')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (status) q = q.eq('status', status);
    if (valor) q = q.eq('valor', valor);

    if (!ehAdminDiretor(req)) {
      const areas = areasDoUsuario(req);
      if (!areas.length) return res.json([]);
      q = q.in('area', areas);
    }
    const { data, error } = await q;
    if (error) throw error;


    if (data?.length) {
      const ids = data.map(p => p.id);
      const { data: stats } = await supabase
        .from('vw_nps_pesquisa_stats')
        .select('*')
        .in('pesquisa_id', ids);
      const byId = Object.fromEntries((stats || []).map(s => [s.pesquisa_id, s]));
      data.forEach(p => { p.stats = byId[p.id] || null; });
    }

    res.json(data);
  } catch (e) {
    console.error('[nps] list:', e.message);
    res.status(500).json({ error: 'Erro ao listar pesquisas' });
  }
});





router.get('/:id', async (req, res) => {
  try {
    const { data: pesquisa, error } = await supabase
      .from('nps_pesquisas')
      .select('*')
      .eq('id', req.params.id)
      .is('deleted_at', null)
      .single();
    if (error || !pesquisa) return res.status(404).json({ error: 'Pesquisa não encontrada' });

    const { data: stats } = await supabase
      .from('vw_nps_pesquisa_stats')
      .select('*')
      .eq('pesquisa_id', pesquisa.id)
      .single();

    res.json({ ...pesquisa, stats: stats || null });
  } catch (e) {
    console.error('[nps] get:', e.message);
    res.status(500).json({ error: 'Erro ao buscar pesquisa' });
  }
});




router.post('/', async (req, res) => {
  try {
    const d = req.body || {};
    if (!d.titulo || !d.objetivo || !d.perguntas) {
      return res.status(400).json({ error: 'título, objetivo e perguntas são obrigatórios' });
    }
    const areaNormalizada = (d.area || 'geral').toLowerCase().slice(0, 60);
    const valorNormalizado = d.valor || null;
    if (!valorNormalizado && areaNormalizada === 'geral') {
      return res.status(400).json({ error: 'Defina um escopo: um valor da CBRio ou uma área específica.' });
    }

    const contextoKpi = TIPOS_KPI_VALIDOS.includes(d.contexto_kpi) ? d.contexto_kpi : 'nps_geral';

    const token = d.permite_publico === false ? null : crypto.randomBytes(18).toString('base64url');

    const insert = {
      titulo: d.titulo.slice(0, 200),
      valor: valorNormalizado,
      objetivo: d.objetivo,
      contexto_kpi: contextoKpi,
      area: areaNormalizada,
      perguntas: d.perguntas,
      ia_modelo: d.ia_modelo || npsService.MODELO_PADRAO,
      ia_prompt: d.ia_prompt || null,
      link_publico_token: token,
      permite_publico: d.permite_publico !== false,
      data_inicio: d.data_inicio || new Date().toISOString().slice(0, 10),
      data_fim: d.data_fim || null,
      status: 'ativa',
      criado_por: req.user.userId,
      import_meta: d.import_meta || null,
    };

    const { data: pesquisa, error } = await supabase
      .from('nps_pesquisas')
      .insert(insert)
      .select()
      .single();
    if (error) throw error;


    try {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id')
        .eq('active', true);
      const targetIds = (profiles || []).map(p => p.id);

      const valorNome = pesquisa.valor ? npsService.VALORES_INFO[pesquisa.valor]?.nome : null;
      const foco = valorNome
        ? `Sua opinião ajuda a melhorar o valor "${valorNome}".`
        : `Sua opinião ajuda a melhorar a área "${pesquisa.area}".`;

      await notificar({
        modulo: 'nps',
        tipo: 'pesquisa_aberta',
        titulo: `Nova pesquisa: ${pesquisa.titulo}`,
        mensagem: `${foco} Leva menos de 2 minutos.`,
        link: `/nps/${pesquisa.id}/responder`,
        severidade: 'info',
        chaveDedup: `nps_${pesquisa.id}`,
        targetIds,
      });
    } catch (notifErr) {
      console.warn('[nps] notificar falhou (criação seguiu):', notifErr.message);
    }

    res.status(201).json(pesquisa);
  } catch (e) {
    console.error('[nps] create:', e.message);
    res.status(500).json({ error: 'Erro ao criar pesquisa' });
  }
});


router.put('/:id', authorizeModule('nps', 1), async (req, res) => {
  try {
    const d = req.body || {};

    if (!(await podeGerenciar(req, req.params.id))) {
      return res.status(403).json({ error: 'Sem acesso para editar esta pesquisa.' });
    }
    if (d.area !== undefined && !podeNaArea(req, d.area)) {
      return res.status(403).json({ error: 'Não pode mover a pesquisa para fora da sua área.' });
    }
    const update = {};
    if (d.titulo !== undefined) update.titulo = d.titulo;
    if (d.objetivo !== undefined) update.objetivo = d.objetivo;
    if (d.status !== undefined) update.status = d.status;
    if (d.data_fim !== undefined) update.data_fim = d.data_fim;
    if (d.permite_publico !== undefined) update.permite_publico = d.permite_publico;
    if (d.area !== undefined) update.area = String(d.area).toLowerCase();



    if (d.perguntas !== undefined) update.perguntas = d.perguntas;

    const { data, error } = await supabase
      .from('nps_pesquisas')
      .update(update)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;



    sincronizarKpi(req.params.id).catch(err =>
      console.warn('[nps] sincronizarKpi (update) falhou:', err.message)
    );
    res.json(data);
  } catch (e) {
    console.error('[nps] update:', e.message);
    res.status(500).json({ error: 'Erro ao atualizar pesquisa' });
  }
});





router.delete('/:id', authorizeModule('nps', 1), async (req, res) => {
  try {
    if (!(await podeGerenciar(req, req.params.id))) {
      return res.status(403).json({ error: 'Sem acesso para excluir esta pesquisa.' });
    }
    const { error } = await supabase.rpc('app_soft_delete', {
      p_table_name: 'nps_pesquisas',
      p_row_id: req.params.id,
      p_deleted_by: req.user?.userId ?? null,
    });
    if (error) throw error;

    removerDadosBrutos(req.params.id).catch(err =>
      console.warn('[nps] removerDadosBrutos falhou:', err.message)
    );
    res.json({ success: true });
  } catch (e) {
    console.error('[nps] delete:', e.message);
    res.status(500).json({ error: 'Erro ao excluir pesquisa' });
  }
});








async function listarRespostasCompletas(pesquisaId, select) {
  const pageSize = 1000;
  let todas = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from('nps_respostas')
      .select(select)
      .eq('pesquisa_id', pesquisaId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    todas = todas.concat(data || []);
    if (!data || data.length < pageSize) break;
  }
  return todas;
}

















async function anexarNomeDaTurma(respostas) {
  const ids = [...new Set((respostas || []).map(r => r.turma_id).filter(Boolean))];
  if (!ids.length) return respostas;
  try {
    const { data, error } = await supabase
      .from('next_turmas').select('id, nome').in('id', ids).is('deleted_at', null);
    if (error) throw error;
    const nomePorId = new Map((data || []).map(t => [t.id, t.nome]));
    return respostas.map(r => (
      r.turma_id && nomePorId.has(r.turma_id) ? { ...r, turma_nome: nomePorId.get(r.turma_id) } : r
    ));
  } catch (e) {
    console.error('[nps] nome da turma:', e.message);
    return respostas;
  }
}


router.get('/:id/respostas', async (req, res) => {
  try {
    const { data: pesquisa } = await supabase
      .from('nps_pesquisas').select('criado_por, area').eq('id', req.params.id).is('deleted_at', null).single();
    const isPrivileged = ['admin', 'diretor'].includes(req.user.role);
    const isOwner = pesquisa?.criado_por === req.user.userId;
    const naArea = !!pesquisa && podeNaArea(req, pesquisa.area);
    if (!isPrivileged && !isOwner && !naArea) {
      return res.status(403).json({ error: 'Sem permissão' });
    }

    const data = await listarRespostasCompletas(
      req.params.id,
      'id, score, respostas, comentario, origem, nome_publico, email_publico, profile_id, turma_id, created_at'
    );
    res.json(await anexarNomeDaTurma(data));
  } catch (e) {
    console.error('[nps] respostas:', e.message);
    res.status(500).json({ error: 'Erro ao listar respostas' });
  }
});


router.post('/:id/responder', async (req, res) => {
  try {
    const { score, respostas, comentario } = req.body || {};
    const { data: pesquisa } = await supabase
      .from('nps_pesquisas').select('id, status, perguntas').eq('id', req.params.id).is('deleted_at', null).single();
    if (!pesquisa) return res.status(404).json({ error: 'Pesquisa não encontrada' });
    if (pesquisa.status !== 'ativa') {
      return res.status(400).json({ error: 'Pesquisa não está ativa' });
    }


    const maxNota = Number(pesquisa.perguntas?.pergunta_nps?.max) || 10;
    if (score === undefined || score === null || score < 0 || score > maxNota) {
      return res.status(400).json({ error: `score deve estar entre 0 e ${maxNota}` });
    }
    const score10 = Math.round((Number(score) / maxNota) * 10);

    const { data, error } = await supabase
      .from('nps_respostas')
      .insert({
        pesquisa_id: pesquisa.id,
        profile_id: req.user.userId,
        score: score10,
        respostas: respostas || {},
        comentario: comentario || null,
        origem: 'logado',
      })
      .select()
      .single();
    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Você já respondeu esta pesquisa' });
      }
      throw error;
    }


    sincronizarKpi(pesquisa.id).catch(err =>
      console.warn('[nps] sincronizarKpi falhou:', err.message)
    );

    res.status(201).json({ ok: true, id: data.id });
  } catch (e) {
    console.error('[nps] responder:', e.message);
    res.status(500).json({ error: 'Erro ao registrar resposta' });
  }
});







function perguntasFlat(perguntas) {
  const lista = [];
  const nps = perguntas?.pergunta_nps;
  if (nps) lista.push({ ...nps, id: nps.id || 'nps', _nps: true });
  for (const p of (perguntas?.perguntas_extras || [])) {
    if (p?.tipo === 'secao') continue;
    if (p) lista.push(p);
  }
  return lista;
}
const _isCarimbo = (h) => /carimbo|timestamp|data\/?\s*hora/i.test(_norm(h));
const _isEmail = (h) => /e-?mail|email/i.test(_norm(h));

router.post('/:id/importar-respostas', uploadPlanilha.single('arquivo'), async (req, res) => {
  try {
    if (!(await podeGerenciar(req, req.params.id))) return res.status(403).json({ error: 'Sem permissão' });
    if (!req.file) return res.status(400).json({ error: 'Nenhuma planilha enviada' });
    const { data: pesquisa } = await supabase.from('nps_pesquisas')
      .select('id, perguntas, import_meta').eq('id', req.params.id).is('deleted_at', null).single();
    if (!pesquisa) return res.status(404).json({ error: 'Pesquisa não encontrada' });

    const wb = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false });
    if (!rows.length) return res.status(400).json({ error: 'Planilha vazia' });
    const headers = (rows[0] || []).map(h => (h == null ? '' : String(h)));

    const flat = perguntasFlat(pesquisa.perguntas);
    const meta = pesquisa.import_meta || {};
    const porTexto = {};
    for (const p of flat) porTexto[_norm(p.texto)] = p;
    const idPorTextoImport = {};
    for (const [id, txt] of Object.entries(meta.mapa_textos || {})) idPorTextoImport[_norm(txt)] = id;

    const colDef = headers.map((h, idx) => {
      if (!h) return { idx, papel: 'vazia' };
      if (_isCarimbo(h)) return { idx, papel: 'carimbo', header: h };
      if (_isEmail(h)) return { idx, papel: 'email', header: h };
      const nh = _norm(h);
      let p = porTexto[nh];
      if (!p && idPorTextoImport[nh]) p = flat.find(x => x.id === idPorTextoImport[nh]);
      if (!p) p = flat.find(x => _norm(x.texto) && (_norm(x.texto).includes(nh) || nh.includes(_norm(x.texto))));
      return p ? { idx, papel: 'pergunta', header: h, pergunta: p } : { idx, papel: 'sem_mapa', header: h };
    });

    const notaHeaderOverride = req.body?.nota_coluna || req.query?.nota_coluna;
    const notaPerguntaId = meta.nota?.pergunta_id || flat.find(p => p._nps)?.id || 'nps';
    let notaCol = notaHeaderOverride ? colDef.find(c => c.header === notaHeaderOverride) : null;
    if (!notaCol) notaCol = colDef.find(c => c.papel === 'pergunta' && c.pergunta.id === notaPerguntaId);
    const escalaNota = meta.nota?.escala || { tipo: '0-10' };

    const comentarioCol = colDef.find(c => c.papel === 'pergunta' &&
      (c.pergunta.tipo === 'texto_longo' || /motivo|coment/i.test(c.pergunta.id) || /motivo|coment/i.test(c.pergunta.texto)));

    const linhas = rows.slice(1).filter(r => (r || []).some(v => v != null && String(v).trim() !== ''));
    const construir = (r) => {
      const score = converterNota(notaCol ? r[notaCol.idx] : null, escalaNota);
      if (score == null) return { erro: true };
      const respostas = {};
      for (const c of colDef) {
        if (c.papel !== 'pergunta') continue;
        if (notaCol && c.idx === notaCol.idx) continue;
        const val = r[c.idx];
        if (val == null || String(val).trim() === '') continue;
        respostas[c.pergunta.id] = c.pergunta.tipo === 'multipla'
          ? String(val).split(',').map(s => s.trim()).filter(Boolean)
          : String(val);
      }
      const emailCol = colDef.find(c => c.papel === 'email');
      const carimboCol = colDef.find(c => c.papel === 'carimbo');
      const email = emailCol ? r[emailCol.idx] : null;
      let created_at = null;
      if (carimboCol && r[carimboCol.idx]) {
        const d = new Date(r[carimboCol.idx]);
        if (!isNaN(d.getTime())) created_at = d.toISOString();
      }
      return {
        pesquisa_id: pesquisa.id,
        profile_id: null,
        nome_publico: email ? String(email).split('@')[0].slice(0, 120) : 'Importado',
        email_publico: email ? String(email).toLowerCase().slice(0, 200) : null,
        score,
        respostas,
        comentario: comentarioCol && r[comentarioCol.idx] ? String(r[comentarioCol.idx]).slice(0, 2000) : null,
        origem: 'importado',
        ...(created_at ? { created_at } : {}),
      };
    };

    const construidas = linhas.map(construir);
    const validas = construidas.filter(x => !x.erro);
    const ignoradas = construidas.length - validas.length;

    if (req.query.preview) {
      return res.json({
        total_linhas: linhas.length,
        validas: validas.length,
        ignoradas,
        nota_coluna: notaCol?.header || null,
        nota_ok: !!notaCol,
        mapeamento: colDef.filter(c => c.papel !== 'vazia').map(c => ({
          coluna: c.header, papel: c.papel,
          pergunta: c.papel === 'pergunta' ? c.pergunta.texto : null,
          eh_nota: !!(notaCol && c.idx === notaCol.idx),
        })),
        amostra: validas.slice(0, 5),
        sem_mapa: colDef.filter(c => c.papel === 'sem_mapa').map(c => c.header),
      });
    }

    if (!notaCol) return res.status(400).json({ error: 'Não identifiquei a coluna da nota. Escolha-a na prévia.' });
    if (!validas.length) return res.status(400).json({ error: 'Nenhuma resposta com nota válida pra importar.' });

    let inseridas = 0;
    for (let i = 0; i < validas.length; i += 200) {
      const lote = validas.slice(i, i + 200);
      const { error } = await supabase.from('nps_respostas').insert(lote);
      if (error) throw error;
      inseridas += lote.length;
    }
    sincronizarKpi(pesquisa.id).catch(err => console.warn('[nps] sincronizarKpi:', err.message));
    res.json({ inseridas, ignoradas });
  } catch (e) {
    console.error('[nps] importar-respostas:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao importar respostas' });
  }
});


router.post('/:id/analisar', authorizeModule('nps', 1), iaLimiter, async (req, res) => {
  try {
    const { data: pesquisa, error: pErr } = await supabase
      .from('nps_pesquisas').select('*').eq('id', req.params.id).is('deleted_at', null).single();
    if (pErr || !pesquisa) return res.status(404).json({ error: 'Pesquisa não encontrada' });
    if (!podeGerenciarPesquisa(req, pesquisa)) {
      return res.status(403).json({ error: 'Sem acesso para analisar esta pesquisa.' });
    }

    const { data: stats } = await supabase
      .from('vw_nps_pesquisa_stats').select('*').eq('pesquisa_id', pesquisa.id).single();
    const respostas = await listarRespostasCompletas(pesquisa.id, 'score, comentario, respostas');

    const analise = await npsService.analisarRespostas({
      pesquisa,
      stats: stats || { total_respostas: 0, score_medio: 0, nps_score: 0, promoters: 0, passives: 0, detractors: 0 },
      respostas,
    });

    await supabase
      .from('nps_pesquisas')
      .update({ analise_ia: analise, analise_atualizada_em: new Date().toISOString() })
      .eq('id', pesquisa.id);

    res.json(analise);
  } catch (e) {
    console.error('[nps] analisar:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao analisar' });
  }
});


router.post('/:id/notificar', authorizeModule('nps', 1), async (req, res) => {
  try {
    const { data: pesquisa } = await supabase
      .from('nps_pesquisas').select('*').eq('id', req.params.id).is('deleted_at', null).single();
    if (!pesquisa) return res.status(404).json({ error: 'Pesquisa não encontrada' });
    if (!podeGerenciarPesquisa(req, pesquisa)) {
      return res.status(403).json({ error: 'Sem acesso para notificar sobre esta pesquisa.' });
    }

    const { data: profiles } = await supabase
      .from('profiles').select('id').eq('active', true);
    const targetIds = (profiles || []).map(p => p.id);

    const enviadas = await notificar({
      modulo: 'nps',
      tipo: 'pesquisa_lembrete',
      titulo: `Lembrete: ${pesquisa.titulo}`,
      mensagem: 'A pesquisa continua aberta — sua resposta nos ajuda bastante.',
      link: `/nps/${pesquisa.id}/responder`,
      severidade: 'info',
      chaveDedup: `nps_lembrete_${pesquisa.id}_${Date.now()}`,
      targetIds,
    });

    res.json({ enviadas });
  } catch (e) {
    console.error('[nps] notificar:', e.message);
    res.status(500).json({ error: 'Erro ao enviar lembretes' });
  }
});

module.exports = router;
