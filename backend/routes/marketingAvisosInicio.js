


















const router = require('express').Router();
const { authenticate, authorizeModule } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { contextoSubtarefa, exigirLiderNaEscritaCom } = require('../services/marketingContexto');
const { dataSP } = require('../utils/marketingLinha');
const A = require('../utils/marketingAvisosInicio');

const TABELA = 'marketing_avisos_inicio';
const COLS = 'id, texto, inicio, fim, created_at, updated_at';
const SEM_TABELA = 'Os avisos do Início ainda não estão no banco: falta aplicar a migration 20261002150000_marketing_avisos_inicio.sql.';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ehTabelaAusente = (e) => !!e && (e.code === '42P01' || e.code === 'PGRST205');
const hojeSP = () => dataSP(new Date());

router.use(authenticate);
router.use(authorizeModule('marketing', 1));
router.use(exigirLiderNaEscritaCom(contextoSubtarefa, { mensagem: 'Só o líder do Marketing publica avisos no Início.' }));

router.get('/', async (req, res) => {
  const hoje = hojeSP();


  let lider = false;
  let liderConferido = true;
  try {
    lider = !!(await contextoSubtarefa(req)).lider;
  } catch (e) {
    console.error('[MARKETING] avisos-inicio/lider:', e.message);
    liderConferido = false;
  }

  try {
    let q = supabase.from(TABELA).select(COLS).is('deleted_at', null).gte('fim', hoje);
    if (!lider) q = q.lte('inicio', hoje);
    const { data, error } = await q.order('inicio', { ascending: false }).limit(200);
    if (error) throw error;
    const { vigentes, agendados } = A.separarAvisos(data || [], hoje);
    return res.json({
      disponivel: true,
      hoje,
      pode_editar: lider,
      lider_conferido: liderConferido,
      vigentes,
      agendados: lider ? agendados : [],
    });
  } catch (e) {
    if (ehTabelaAusente(e)) {
      return res.json({
        disponivel: false, motivo: SEM_TABELA, hoje,
        pode_editar: lider, lider_conferido: liderConferido, vigentes: [], agendados: [],
      });
    }
    console.error('[MARKETING] avisos-inicio/listar:', e.message);
    return res.status(500).json({ error: 'Não foi possível carregar os avisos do Início.' });
  }
});

router.post('/', async (req, res) => {
  const hoje = hojeSP();
  const v = A.validarAviso(req.body || {}, { hoje });
  if (!v.ok) return res.status(400).json({ error: v.erro });
  try {
    const { data, error } = await supabase.from(TABELA)
      .insert({ ...v.valores, created_by: req.user.userId, updated_by: req.user.userId })
      .select(COLS).single();
    if (error) throw error;
    return res.status(201).json({ ...data, estado: A.estadoDoAviso(data, hoje) });
  } catch (e) {
    if (ehTabelaAusente(e)) return res.status(409).json({ error: SEM_TABELA });
    console.error('[MARKETING] avisos-inicio/criar:', e.message);
    return res.status(500).json({ error: 'Não foi possível publicar o aviso.' });
  }
});

router.patch('/:id', async (req, res) => {
  if (!UUID.test(req.params.id)) return res.status(400).json({ error: 'Aviso inválido.' });
  const hoje = hojeSP();
  try {
    const { data: atual, error: eAtual } = await supabase.from(TABELA)
      .select(COLS).eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (eAtual) throw eAtual;
    if (!atual) return res.status(404).json({ error: 'Aviso não encontrado (talvez já tenha sido tirado).' });

    const corpo = req.body || {};
    const v = A.validarAviso({ texto: corpo.texto, inicio: corpo.inicio, fim: corpo.fim }, { hoje, atual });
    if (!v.ok) return res.status(400).json({ error: v.erro });

    const { data, error } = await supabase.from(TABELA)
      .update({ ...v.valores, updated_by: req.user.userId, updated_at: new Date().toISOString() })
      .eq('id', req.params.id).is('deleted_at', null)
      .select(COLS).maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Aviso não encontrado (talvez já tenha sido tirado).' });
    return res.json({ ...data, estado: A.estadoDoAviso(data, hoje) });
  } catch (e) {
    if (ehTabelaAusente(e)) return res.status(409).json({ error: SEM_TABELA });
    console.error('[MARKETING] avisos-inicio/editar:', e.message);
    return res.status(500).json({ error: 'Não foi possível salvar o aviso.' });
  }
});

router.delete('/:id', async (req, res) => {
  if (!UUID.test(req.params.id)) return res.status(400).json({ error: 'Aviso inválido.' });
  try {
    const agora = new Date().toISOString();
    const { data, error } = await supabase.from(TABELA)
      .update({ deleted_at: agora, updated_at: agora, updated_by: req.user.userId })
      .eq('id', req.params.id).is('deleted_at', null)
      .select('id').maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Aviso não encontrado (talvez já tenha sido tirado).' });
    return res.json({ ok: true, id: data.id });
  } catch (e) {
    if (ehTabelaAusente(e)) return res.status(409).json({ error: SEM_TABELA });
    console.error('[MARKETING] avisos-inicio/remover:', e.message);
    return res.status(500).json({ error: 'Não foi possível tirar o aviso.' });
  }
});

module.exports = router;
