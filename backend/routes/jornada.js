const router = require('express').Router();
const { authenticate, authorizeModule } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const painelCache = require('../services/painelCache');
const { computeJornada, agregar, normalizaJanela } = require('../services/jornadaEngajamento');

const CRON_SECRET = process.env.CRON_SECRET;



const { isAuthorizedCron } = require('../utils/cronAuth');
async function autorizaCron(req, res, next) {
  if (!isAuthorizedCron(req)) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

async function refreshPapeis(_req, res) {
  try {
    const { data, error } = await supabase.rpc('refresh_vw_pessoas_papeis_mat');
    if (error) throw error;
    res.json({ ok: true, resultado: data });
  } catch (e) {
    console.error('[jornada/cron/refresh-papeis]', e.message);
    res.status(500).json({ error: e.message });
  }
}

router.get('/cron/refresh-papeis', autorizaCron, refreshPapeis);
router.post('/cron/refresh-papeis', autorizaCron, refreshPapeis);

router.use(authenticate);




















const soQuemCuidaDeGente = authorizeModule('membresia', 2);














router.get('/dashboard', async (req, res) => {
  try {
    const janela = normalizaJanela(req.query.janela);
    const cacheKey = `jornada:dash:${janela}`;
    const cached = painelCache.get(cacheKey);
    if (cached) return res.json(cached);

    const { membros, total_base } = await computeJornada(janela);
    const ag = agregar(membros);
    const payload = {
      janela,
      total_base,
      total_membros: total_base,
      engajados: ag.engajados,
      valores: ag.valores,
    };
    painelCache.set(cacheKey, payload);
    res.json(payload);
  } catch (e) {
    console.error('jornada dashboard:', e.message);
    res.status(500).json({ error: 'Erro ao calcular dashboard' });
  }
});






router.get('/visao', async (req, res) => {
  try {
    const janela = normalizaJanela(req.query.janela);
    const cacheKey = `jornada:visao:${janela}`;
    const cached = painelCache.get(cacheKey);
    if (cached) return res.json(cached);

    const { membros, total_base, dias } = await computeJornada(janela);
    const ag = agregar(membros);
    const payload = { janela, dias, total_base, membros, engajados: ag.engajados, valores: ag.valores };
    painelCache.set(cacheKey, payload);
    res.json(payload);
  } catch (e) {
    console.error('jornada visao:', e.message);
    res.status(500).json({ error: 'Erro ao carregar a Jornada' });
  }
});


router.get('/membros', soQuemCuidaDeGente, async (req, res) => {
  try {
    const { search, valor, janela: janelaQ, page = 1, limit = 50 } = req.query;




    const { membros } = await computeJornada(normalizaJanela(janelaQ));

    let result = membros;
    if (search) {
      const s = String(search).toLowerCase();
      result = result.filter(m => (m.nome || '').toLowerCase().includes(s));
    }

    if (valor) result = result.filter(m => !m.valores[valor]);

    result = [...result].sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
    const total = result.length;
    const off = (Number(page) - 1) * Number(limit);
    res.json({ membros: result.slice(off, off + Number(limit)), total });
  } catch (e) {
    console.error('jornada membros:', e.message);
    res.status(500).json({ error: 'Erro ao listar membros' });
  }
});


router.get('/membro/:id', soQuemCuidaDeGente, async (req, res) => {
  try {
    const { id } = req.params;

    const [membro, trilha, grupo, j180, vol, contrib, devocional, batismos, nextMat, nextInsc] = await Promise.all([
      supabase.from('mem_membros').select('*').eq('id', id).single(),
      supabase.from('mem_trilha_valores').select('*').is('deleted_at', null).eq('membro_id', id).order('created_at'),
      supabase.from('mem_grupo_membros').select('*, mem_grupos(nome)').is('deleted_at', null).eq('membro_id', id).order('entrou_em', { ascending: false }),
      supabase.from('cui_jornada180').select('*').is('deleted_at', null).eq('membro_id', id).order('data_encontro', { ascending: false }),
      supabase.from('mem_voluntarios').select('*, mem_ministerios(nome)').is('deleted_at', null).eq('membro_id', id).order('desde', { ascending: false }),
      supabase.from('mem_contribuicoes').select('*').is('deleted_at', null).eq('membro_id', id).order('data', { ascending: false }).limit(10),

      supabase.from('mem_devocionais').select('*').is('deleted_at', null).eq('membro_id', id).eq('concluida', true).order('data_devocional', { ascending: false }).limit(10),

      supabase.from('batismo_inscricoes').select('id, data_batismo, status').is('deleted_at', null).eq('membro_id', id).eq('status', 'realizado').order('data_batismo', { ascending: false }).limit(5),
      supabase.from('next_matriculas').select('id, status, created_at').is('deleted_at', null).eq('membro_id', id).eq('status', 'formado').order('created_at', { ascending: false }).limit(5),
      supabase.from('next_inscricoes').select('id, check_in_at').not('check_in_at', 'is', null).eq('membro_id', id).limit(5),
    ]);

    if (membro.error || !membro.data) return res.status(404).json({ error: 'Membro não encontrado' });

    const grupoAtivo = (grupo.data || []).find(g => !g.saiu_em);
    const volAtivo = (vol.data || []).find(v => !v.ate);

    const contribRecente = (contrib.data || []).find(c => {
      if (!['dizimo', 'oferta'].includes(c.tipo)) return false;
      const diff = (Date.now() - new Date(c.data).getTime()) / 86400000;
      return diff <= 90;
    });

    const devocionalRecente = (devocional.data || []).find(d => {
      const diff = (Date.now() - new Date(d.data_devocional).getTime()) / 86400000;
      return diff <= 90;
    });

    const seguirBatismo = (batismos.data || [])[0] || null;
    const seguirNext = (nextMat.data || [])[0] || (nextInsc.data || [])[0] || null;
    const seguirAtivo = !!(seguirBatismo || seguirNext);
    const trilhaConversao = (trilha.data || []).find(t => ['conversao', 'primeiro_contato', 'batismo'].includes(t.etapa) && t.concluida);

    res.json({
      membro: membro.data,
      valores: {
        seguir:       { ativo: seguirAtivo, dados: seguirBatismo || seguirNext || trilhaConversao || null },
        conectar:     { ativo: !!grupoAtivo, dados: grupoAtivo || null },
        investir:     { ativo: !!devocionalRecente, dados: devocionalRecente || null },
        servir:       { ativo: !!volAtivo, dados: volAtivo || null },
        generosidade: { ativo: !!contribRecente, dados: contribRecente || null },
      },
      trilha: trilha.data || [],
      grupos: grupo.data || [],
      jornada180: j180.data || [],
      devocionais: devocional.data || [],
      voluntariado: vol.data || [],
      contribuicoes: contrib.data || [],
    });
  } catch (e) {
    console.error('jornada membro:', e.message);
    res.status(500).json({ error: 'Erro ao buscar membro' });
  }
});









router.post('/cruzar', soQuemCuidaDeGente, async (req, res) => {
  try {
    const criterios = req.body?.criterios || {};
    const limit = Math.min(Number(req.body?.limit) || 200, 500);
    const offset = Math.max(Number(req.body?.offset) || 0, 0);

    const { data, error } = await supabase.rpc('cruzar_pessoas', {
      p_criterios: criterios,
      p_limit: limit,
      p_offset: offset,
    });
    if (error) throw error;






    const VALIDOS = ['seguir', 'conectar', 'investir', 'servir', 'generosidade',
                     'voluntario', 'visitante', 'inscrito_next', 'grupo_ativo', 'contribuinte',
                     'batizado', 'fez_next', 'convertido'];
    const ativos = {};
    for (const k of VALIDOS) {
      if (criterios[k] === 'tem' || criterios[k] === 'nao_tem') ativos[k] = criterios[k];
    }

    res.json({ ...data, criterios_ativos: ativos });
  } catch (e) {
    console.error('jornada cruzar:', e.message);
    res.status(500).json({ error: 'Erro ao cruzar dados' });
  }
});




router.post('/refresh-papeis', soQuemCuidaDeGente, async (req, res) => {
  if (!['admin', 'diretor'].includes(req.user?.role)) {
    return res.status(403).json({ error: 'Apenas admin/diretor pode forcar refresh' });
  }
  try {
    const { data, error } = await supabase.rpc('refresh_vw_pessoas_papeis_mat');
    if (error) throw error;
    res.json({ ok: true, resultado: data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
