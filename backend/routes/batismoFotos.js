const router = require('express').Router();
const multer = require('multer');
const crypto = require('crypto');
const { authenticate, authorizeModule } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');






const uploadMw = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 40 },
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) cb(null, true);
    else cb(new Error('Formato de imagem não suportado. Use JPG, PNG ou WebP.'));
  },
});

const BUCKET = 'batismos';
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;
const EXTS = { 'image/png': 'png', 'image/webp': 'webp', 'image/jpeg': 'jpg' };















const podeVer = authorizeModule('marketing', 1);
const podeEditar = authorizeModule('marketing', 3);
router.use(authenticate, (req, res, next) => (
  ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) ? podeEditar : podeVer
)(req, res, next));

function validarData(req, res, next) {
  if (!DATA_RE.test(req.params.data)) return res.status(400).json({ error: 'Data inválida (use YYYY-MM-DD)' });
  next();
}

async function listarFotos(data) {
  const { data: arquivos, error } = await supabase.storage
    .from(BUCKET)
    .list(data, { limit: 200, sortBy: { column: 'name', order: 'asc' } });
  if (error) throw error;
  return (arquivos || [])
    .filter((f) => f.name && !f.name.startsWith('.'))
    .map((f) => ({
      nome: f.name,
      url: supabase.storage.from(BUCKET).getPublicUrl(`${data}/${f.name}`).data.publicUrl,
    }));
}


router.get('/', async (_req, res) => {
  try {
    const { data: inscricoes, error } = await supabase
      .from('batismo_inscricoes')
      .select('data_batismo, status')
      .not('data_batismo', 'is', null)
      .neq('status', 'cancelado');
    if (error) throw error;

    const porData = {};
    for (const i of inscricoes || []) {
      porData[i.data_batismo] = (porData[i.data_batismo] || 0) + 1;
    }
    const datas = Object.keys(porData).sort().reverse().slice(0, 24);
    const comFotos = await Promise.all(
      datas.map(async (d) => {
        let fotos = 0;
        try { fotos = (await listarFotos(d)).length; } catch {                              }
        return { data: d, batizandos: porData[d], fotos };
      })
    );
    res.json(comFotos);
  } catch (e) {
    console.error('[BATISMO-FOTOS] datas error:', e.message);
    res.status(500).json({ error: 'Erro ao listar batismos' });
  }
});


router.get('/:data/fotos', validarData, async (req, res) => {
  try {
    res.json(await listarFotos(req.params.data));
  } catch (e) {
    console.error('[BATISMO-FOTOS] list error:', e.message);
    res.status(500).json({ error: 'Erro ao listar fotos' });
  }
});


router.post('/:data/fotos', validarData, uploadMw.array('fotos', 40), async (req, res) => {
  try {
    if (!req.files?.length) return res.status(400).json({ error: 'Nenhuma foto enviada' });
    const { data } = req.params;
    const enviadas = [];
    for (const file of req.files) {
      const ext = EXTS[file.mimetype] || 'jpg';
      const nome = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(`${data}/${nome}`, file.buffer, { contentType: file.mimetype, upsert: false });
      if (error) throw error;
      enviadas.push(nome);
    }



    if (process.env.SUPABASE_URL) {
      fetch(`${process.env.SUPABASE_URL}/functions/v1/notify-batismo-fotos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data }),
      }).catch((e) => console.error('[BATISMO-FOTOS] notify falhou:', e.message));
    }

    res.status(201).json({ ok: true, enviadas: enviadas.length });
  } catch (e) {
    console.error('[BATISMO-FOTOS] upload error:', e.message);
    res.status(500).json({ error: `Erro ao enviar fotos: ${e.message}` });
  }
});


router.delete('/:data/fotos/:nome', validarData, async (req, res) => {
  try {
    const nome = req.params.nome;
    if (nome.includes('/') || nome.includes('..')) return res.status(400).json({ error: 'Nome inválido' });
    const { error } = await supabase.storage.from(BUCKET).remove([`${req.params.data}/${nome}`]);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('[BATISMO-FOTOS] delete error:', e.message);
    res.status(500).json({ error: 'Erro ao remover foto' });
  }
});

module.exports = router;
