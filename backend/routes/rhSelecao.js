const { validarFormulario, PADRAO } = require('../utils/rhSelecaoFormulario');
const router = require('express').Router();
const multer = require('multer');
const ia = require('../services/rhSelecaoIA');
const rateLimit = require('express-rate-limit');
const limitarIA = rateLimit({ windowMs: 60000, limit: 10, keyGenerator: req => req.user.userId, message: { error: 'Aguarde um minuto antes de solicitar mais análises.' } });
const { randomUUID } = require('crypto');
const { authenticate, apenasColaborador, authorizeModule } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { notificar } = require('../services/notificar');
const { BUCKET, UUID, validarInscricao, validarProcesso, extensaoArquivo } = require('../utils/rhSelecao');
router.use(authenticate, apenasColaborador);
const gestao = authorizeModule('rh', 4);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 3 * 1024 * 1024, files: 1, fields: 1, fieldSize: 300000 } }).single('arquivo');
const receberArquivo = (req, res, next) => upload(req, res, e => e ? res.status(400).json({ error: 'Envie apenas um PDF, DOCX, TXT, JPG ou PNG de até 3 MB.' }) : next());
const rota = fn => async (req, res) => { try { await fn(req, res); } catch (e) { console.error('[rh-selecao]', e.message); res.status(500).json({ error: 'Não foi possível concluir. Tente novamente.' }); } };
router.param('id', (req, res, next, id) => UUID.test(id) ? next() : res.status(400).json({ error: 'Identificador inválido.' }));
async function funcionario(req, res, next) {
  try {

    const email = String(req.user.email || '').trim().toLowerCase();
    if (!email) return res.status(403).json({ error: 'Seu login não tem e-mail vinculado. Procure o RH.' });
    const { data, error } = await supabase.from('rh_funcionarios').select('id,nome,cargo,area,email')
      .ilike('email', email.replace(/[\\%_]/g, '\\$&').replace(/\*/g, '_')).in('status', ['ativo','ferias','licenca']).is('deleted_at', null);
    if (error) throw error;
    const candidatos = (data || []).filter(f => f.email?.trim().toLowerCase() === email);
    if (candidatos.length !== 1) return res.status(candidatos.length ? 409 : 403).json({ error: candidatos.length ? 'Há cadastros duplicados para seu login. Procure o RH.' : 'Este processo é exclusivo para colaboradores. Peça ao RH para conferir o vínculo do seu login.' });
    req.funcionario = candidatos[0]; next();
  } catch { res.status(503).json({ error: 'Não foi possível confirmar seu cadastro no RH. Tente novamente.' }); }
}
async function processo(id) {
  const { data, error } = await supabase.from('rh_processos_seletivos').select('*').eq('id', id).is('deleted_at', null).maybeSingle();
  if (error) throw error; return data;
}
const camposInscricao = 'id,processo_id,profile_id,funcionario_id,nome,cargo_area,vagas,motivacao,experiencia,restricao,anexo_link,anexo_nome,consentimento_em,consentimento_versao,status,criado_em,respostas,formulario_snapshot,formulario_versao';
router.get('/gestao', gestao, rota(async (req, res) => {
  const { data, error } = await supabase.from('rh_processos_seletivos').select('*').is('deleted_at', null).order('criado_em', { ascending: false }).limit(100);
  if (error) throw error; res.json(data);
}));
router.post('/gestao', gestao, rota(async (req, res) => {
  let body; try { body = validarProcesso(req.body); } catch (e) { return res.status(400).json({ error: e.message }); }
  const { data, error } = await supabase.from('rh_processos_seletivos').insert({ ...body, criado_por: req.user.userId }).select().single();
  if (error) throw error; res.status(201).json(data);
}));
router.patch('/gestao/:id', gestao, rota(async (req, res) => {
  if (!['rascunho','aberto','encerrado'].includes(req.body.status)) return res.status(400).json({ error: 'Status inválido.' });
  const { data, error } = await supabase.from('rh_processos_seletivos').update({ status: req.body.status }).eq('id', req.params.id).is('deleted_at', null).select().maybeSingle();
  if (error) throw error; if (!data) return res.status(404).json({ error: 'Processo não encontrado.' }); res.json(data);
}));
router.put('/gestao/:id/formulario', gestao, rota(async (req, res) => {
  const p = await processo(req.params.id);
  if (!p) return res.status(404).json({ error: 'Processo não encontrado.' });
  let formulario, titulo;
  try {
    formulario = validarFormulario(req.body.formulario);
    titulo = req.body.titulo;
    if (typeof titulo !== 'string' || titulo.trim().length < 3 || titulo.trim().length > 160) throw new Error('Informe um nome entre 3 e 160 caracteres.');
    if (!Number.isInteger(req.body.versao)) throw new Error('Versão inválida. Reabra o editor.');
  } catch (e) { return res.status(400).json({ error: e.message }); }
  const { data, error } = await supabase.from('rh_processos_seletivos')
    .update({ titulo: titulo.trim(), formulario }).eq('id', p.id).is('deleted_at', null)
    .eq('formulario_versao', req.body.versao).select().maybeSingle();
  if (error) throw error;
  if (!data) return res.status(409).json({ error: 'O formulário foi editado por outra pessoa. Atualize a página antes de editar novamente.' });
  res.json(data);
}));
router.get('/gestao/:id/inscricoes', gestao, rota(async (req, res) => {
  const p = await processo(req.params.id);
  if (!p) return res.status(404).json({ error: 'Processo não encontrado.' });
  const vaga = typeof req.query.vaga === 'string' ? req.query.vaga : '';
  if (vaga && !p.vagas.includes(vaga)) return res.status(400).json({ error: 'Vaga inválida.' });

  const todos = [];
  for (let offset = 0; ; offset += 500) {
    let q = supabase.from('rh_selecao_inscricoes').select(`${camposInscricao},material_ia,anexo_path,rh_selecao_analises(*)`).eq('processo_id', p.id).is('deleted_at', null).order('criado_em', { ascending: false }).order('id').range(offset, offset + 499);
    if (vaga) q = q.contains('vagas', [vaga]);
    const { data, error } = await q; if (error) throw error;
    for (const i of data || []) {
      const hash = ia.hashFontes(i);
      const analises = (i.rh_selecao_analises || []).sort((a,b) => b.criado_em.localeCompare(a.criado_em)).map(a => ({ ...a, atual: !a.deleted_at && a.fontes_hash === hash && a.criterios_hash === ia.hashCriterios(p.criterios_ia[a.vaga]) }));
      delete i.rh_selecao_analises; delete i.anexo_path;
      todos.push({ ...i, analises });
    }
    if (!data || data.length < 500) break;
  }
  if (vaga) todos.sort((a,b) => (b.analises.find(x => x.vaga === vaga && x.atual)?.pontuacao ?? -1) - (a.analises.find(x => x.vaga === vaga && x.atual)?.pontuacao ?? -1));
  const pagina = Math.max(0, Number.parseInt(req.query.pagina,10) || 0);
  res.set('Cache-Control','no-store').json({ inscricoes: todos.slice(pagina*50,pagina*50+50), total: todos.length, pagina });
}));
router.put('/gestao/:id/criterios', gestao, rota(async (req, res) => {
  const p = await processo(req.params.id);
  if (!p) return res.status(404).json({ error: 'Processo não encontrado.' });
  if (!p.vagas.includes(req.body.vaga)) return res.status(400).json({ error: 'Vaga inválida.' });
  try { ia.criteriosValidos(req.body.instrucoes); } catch (e) { return res.status(400).json({ error: e.message }); }
  const { data, error } = await supabase.from('rh_processos_seletivos').update({ criterios_ia: { ...p.criterios_ia, [req.body.vaga]: req.body.instrucoes.trim() } }).eq('id',p.id).eq('criterios_ia',JSON.stringify(p.criterios_ia)).select().maybeSingle();
  if (error) throw error; if (!data) return res.status(409).json({ error: 'Os critérios foram alterados por outra pessoa. Atualize a página.' }); res.json(data);
}));
router.post('/inscricoes/:id/preparar', gestao, rota(async (req, res) => {
  const { data, error } = await supabase.from('rh_selecao_inscricoes').select('*').eq('id',req.params.id).is('deleted_at',null).maybeSingle();
  if (error) throw error; if (!data) return res.status(404).json({ error: 'Inscrição não encontrada.' });
  try { res.json(await ia.preparar(data)); } catch (e) { res.status(422).json({ error: e.message }); }
}));
router.put('/inscricoes/:id/curriculo', gestao, rota(async (req, res) => {
  if (typeof req.body.texto !== 'string' || req.body.texto.length > 30000) return res.status(400).json({ error: 'Use até 30.000 caracteres.' });
  const { data, error } = await supabase.from('rh_selecao_inscricoes').update({ material_ia: req.body.texto.trim() || null }).eq('id',req.params.id).is('deleted_at',null).select(camposInscricao).maybeSingle();
  if (error) throw error; if (!data) return res.status(404).json({ error: 'Inscrição não encontrada.' }); res.json(data);
}));
router.post('/inscricoes/:id/analisar', gestao, limitarIA, rota(async (req, res) => {
  const { data: i, error } = await supabase.from('rh_selecao_inscricoes').select('*').eq('id',req.params.id).is('deleted_at',null).maybeSingle();
  if (error) throw error; if (!i) return res.status(404).json({ error: 'Inscrição não encontrada.' });
  const p = await processo(i.processo_id), vaga = req.body.vaga;
  if (!p || !i.vagas.includes(vaga) || !p.criterios_ia[vaga]) return res.status(400).json({ error: 'Salve os critérios desta vaga antes de analisar uma candidatura a ela.' });
  let resultado;
  try { resultado = await ia.analisar(i,vaga,p.criterios_ia[vaga]); } catch (e) { return res.status(422).json({ error: e.message }); }
  const { data, error: erro } = await supabase.from('rh_selecao_analises').insert({ inscricao_id: i.id, vaga, criterios: p.criterios_ia[vaga], criterios_hash: ia.hashCriterios(p.criterios_ia[vaga]), fontes_hash: ia.hashFontes(i), resultado, pontuacao: resultado.pontuacao, modelo: ia.MODEL, criado_por: req.user.userId, criado_em: new Date().toISOString(), deleted_at: null }).select().single();
  if (erro) throw erro; res.json(data);
}));
router.patch('/inscricoes/:id', gestao, rota(async (req, res) => {
  if (!['recebida','em_analise','concluida'].includes(req.body.status)) return res.status(400).json({ error: 'Status inválido.' });
  const { data, error } = await supabase.from('rh_selecao_inscricoes').update({ status: req.body.status }).eq('id', req.params.id).is('deleted_at', null).select(camposInscricao).maybeSingle();
  if (error) throw error; if (!data) return res.status(404).json({ error: 'Inscrição não encontrada.' }); res.json(data);
}));
router.get('/inscricoes/:id/anexo', gestao, rota(async (req, res) => {
  const { data, error } = await supabase.from('rh_selecao_inscricoes').select('anexo_path').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
  if (error) throw error; if (!data?.anexo_path) return res.status(404).json({ error: 'Anexo não encontrado.' });
  const result = await supabase.storage.from(BUCKET).createSignedUrl(data.anexo_path, 60, { download: true });
  if (result.error) throw result.error; res.set('Cache-Control','no-store').json({ url: result.data.signedUrl });
}));
router.get('/:id', funcionario, rota(async (req, res) => {
  const p = await processo(req.params.id);
  if (!p || p.status === 'rascunho') return res.status(404).json({ error: 'Processo indisponível. Aguarde a abertura pelo RH.' });
  const { data, error } = await supabase.from('rh_selecao_inscricoes').select(camposInscricao).eq('processo_id', p.id).eq('profile_id', req.user.userId).is('deleted_at', null).maybeSingle();
  if (error) throw error;
  const { nome, cargo, area } = req.funcionario;
  res.set('Cache-Control','no-store').json({ processo: { id: p.id, titulo: p.titulo, vagas: p.vagas, status: p.status, formulario: p.formulario || PADRAO, formulario_versao: p.formulario_versao || 1 }, funcionario: { nome, cargo, area }, inscricao: data });
}));
router.post('/:id/inscricoes', funcionario, receberArquivo, rota(async (req, res) => {
  const p = await processo(req.params.id);
  if (!p || p.status !== 'aberto') return res.status(409).json({ error: 'Este processo não está aberto para inscrições.' });
  let body, ext;
  try {
    const dados = JSON.parse(req.body.dados || '{}');
    if ((dados.formulario_versao ?? 1) !== (p.formulario_versao || 1)) return res.status(409).json({ error: 'O formulário foi atualizado pelo RH. Consulte sua inscrição para carregar as perguntas atuais; seu rascunho será mantido.' });
    ext = extensaoArquivo(req.file); body = validarInscricao(dados, p, !!req.file);
  }
  catch (e) { return res.status(400).json({ error: e instanceof SyntaxError ? 'Formulário inválido.' : e.message }); }
  const id = randomUUID(), path = ext ? `${p.id}/${id}.${ext}` : null;
  if (path) {
    const result = await supabase.storage.from(BUCKET).upload(path, req.file.buffer, { contentType: req.file.mimetype, upsert: false });
    if (result.error) throw result.error;
  }
  const { data, error } = await supabase.from('rh_selecao_inscricoes').insert({ ...body, id, processo_id: p.id, profile_id: req.user.userId, funcionario_id: req.funcionario.id, anexo_path: path, anexo_nome: path ? req.file.originalname.slice(0,200) : null }).select(camposInscricao).single();
  if (error) {
    if (path) await supabase.storage.from(BUCKET).remove([path]);
    if (error.code === '23505') return res.status(409).json({ error: 'Sua inscrição já foi recebida. Atualize a página para consultar a confirmação.' });
    if (error.code === '23514') return res.status(409).json({ error: 'O processo ou o formulário foi atualizado. Consulte sua inscrição para carregar a versão atual.' });
    throw error;
  }

  await notificar({ modulo: 'rh', tipo: 'rh_selecao_inscricao', titulo: 'Nova candidatura interna', mensagem: 'Há uma nova inscrição para avaliação em Processos seletivos.', link: '/admin/rh?tab=processos-seletivos', chaveDedup: `rh_selecao_${id}` }).catch(e => console.error('[rh-selecao] notificação:', e.message));
  res.status(201).json(data);
}));
module.exports = router;
