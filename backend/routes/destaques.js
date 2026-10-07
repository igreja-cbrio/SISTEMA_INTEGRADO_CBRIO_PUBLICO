const router = require('express').Router();
const multer = require('multer');
const crypto = require('crypto');
const { authenticate, authorizeModule } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');











const uploadMw = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) cb(null, true);
    else cb(new Error('Formato de imagem não suportado. Use JPG, PNG ou WebP.'));
  },
});

const BUCKET = 'app-destaques';
const EXTS = { 'image/png': 'png', 'image/webp': 'webp', 'image/jpeg': 'jpg' };















const podeVer = authorizeModule('marketing', 1);
const podeEditar = authorizeModule('marketing', 3);
router.use(authenticate, (req, res, next) => (
  ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) ? podeEditar : podeVer
)(req, res, next));

async function uploadImagem(id, file) {
  const ext = EXTS[file.mimetype] || 'jpg';
  const path = `${id}.${ext}`;

  const outras = Object.values(EXTS).filter(e => e !== ext).map(e => `${id}.${e}`);
  await supabase.storage.from(BUCKET).remove(outras);
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file.buffer, { contentType: file.mimetype, upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return `${data.publicUrl}?t=${Date.now()}`;
}

function camposDe(body) {
  const campos = {};
  if ('titulo' in body) campos.titulo = body.titulo?.trim() || null;
  if ('subtitulo' in body) campos.subtitulo = body.subtitulo?.trim() || null;
  if ('link' in body) campos.link = body.link?.trim() || null;
  if ('ordem' in body) campos.ordem = parseInt(body.ordem, 10) || 100;
  if ('ativo' in body) campos.ativo = body.ativo === true || body.ativo === 'true';
  if ('publica_em' in body) campos.publica_em = body.publica_em || null;
  if ('expira_em' in body) campos.expira_em = body.expira_em || null;
  return campos;
}


router.get('/', async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('app_destaques')
      .select('*')
      .order('ordem', { ascending: true })
      .order('criada_em', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    console.error('[DESTAQUES] list error:', e.message);
    res.status(500).json({ error: 'Erro ao listar destaques' });
  }
});


router.post('/', uploadMw.single('imagem'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Imagem não fornecida' });
    const id = crypto.randomUUID();
    const imagem_url = await uploadImagem(id, req.file);
    const { data, error } = await supabase
      .from('app_destaques')
      .insert({ id, imagem_url, ...camposDe(req.body) })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    console.error('[DESTAQUES] create error:', e.message);
    res.status(500).json({ error: `Erro ao criar destaque: ${e.message}` });
  }
});


router.put('/:id', async (req, res) => {
  try {
    const campos = camposDe(req.body);
    if (Object.keys(campos).length === 0) return res.status(400).json({ error: 'Nada para atualizar' });
    campos.atualizada_em = new Date().toISOString();
    const { data, error } = await supabase
      .from('app_destaques')
      .update(campos)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[DESTAQUES] update error:', e.message);
    res.status(500).json({ error: `Erro ao atualizar destaque: ${e.message}` });
  }
});


router.post('/:id/imagem', uploadMw.single('imagem'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Imagem não fornecida' });
    const imagem_url = await uploadImagem(req.params.id, req.file);
    const { data, error } = await supabase
      .from('app_destaques')
      .update({ imagem_url, atualizada_em: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[DESTAQUES] imagem error:', e.message);
    res.status(500).json({ error: `Erro ao trocar imagem: ${e.message}` });
  }
});


router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from('app_destaques').delete().eq('id', id);
    if (error) throw error;
    await supabase.storage.from(BUCKET).remove(Object.values(EXTS).map(e => `${id}.${e}`));
    res.json({ ok: true });
  } catch (e) {
    console.error('[DESTAQUES] delete error:', e.message);
    res.status(500).json({ error: 'Erro ao remover destaque' });
  }
});

module.exports = router;
