



const router = require('express').Router();
const Anthropic = require('@anthropic-ai/sdk');
const multer = require('multer');
const mammoth = require('mammoth');
const { authenticate, authorize } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const devSender = require('../services/devocionalSender');
const devVideo = require('../utils/devocionalVideo');
const { isAuthorizedCron } = require('../utils/cronAuth');


const uploadDocx = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });






async function cronEnviarDiario(req, res) {
  if (!isAuthorizedCron(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {

    if (await require('../services/comunicacaoDisparosOff').disparoDesligado('devocional_diario')) {
      return res.json({ ok: true, pulado: 'desligado_na_comunicacao' });
    }
    const r = await devSender.enviarDoDia();
    console.log('[devocional-cron] resultado:', r);
    res.json({ ok: true, ...r });
  } catch (e) {
    console.error('[devocional-cron]:', e.message);
    res.status(500).json({ error: e.message });
  }
}
router.get('/cron/enviar-diario', cronEnviarDiario);
router.post('/cron/enviar-diario', cronEnviarDiario);












function hojeBRT() {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  return p;
}

async function cronLancarSemanal(req, res) {
  if (!isAuthorizedCron(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const hoje = hojeBRT();
    const d = new Date(hoje + 'T12:00:00Z');
    const dow = d.getUTCDay();
    const seg = new Date(d); seg.setUTCDate(d.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
    const sex = new Date(seg); sex.setUTCDate(seg.getUTCDate() + 4);
    const segIso = seg.toISOString().slice(0, 10);
    const sexIso = sex.toISOString().slice(0, 10);


    const { data: expirados } = await supabase
      .from('devocional_planos')
      .update({ ativo: false })
      .eq('ativo', true)
      .lt('data_fim', hoje)
      .select('id');


    const { data: vigentes } = await supabase
      .from('devocional_planos')
      .select('id, titulo')
      .eq('ativo', true)
      .lte('data_inicio', hoje)
      .gte('data_fim', hoje)
      .limit(1);
    if (vigentes && vigentes.length > 0) {
      return res.json({
        ok: true, modo: 'manual', plano: vigentes[0].titulo,
        expirados: expirados?.length || 0,
      });
    }


    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: 'ANTHROPIC_API_KEY não configurada' });
    }
    const [, mm, dd] = segIso.split('-');
    const { data: plano, error: e1 } = await supabase
      .from('devocional_planos')
      .insert({
        titulo: `Devocional da semana ${dd}/${mm}`,
        descricao: 'Lançamento automático semanal (gerado por IA — revise os itens)',
        data_inicio: segIso,
        data_fim: sexIso,
        ativo: true,
      })
      .select()
      .single();
    if (e1) throw e1;

    const dias = eachDay(segIso, sexIso);
    const rows = await gerarItensViaIA(plano, dias, '', 'pastoral, edificante, com aplicação pratica');
    const { error: e2 } = await supabase.from('devocional_itens').insert(rows);
    if (e2) throw e2;
    pushDevocionalApp(plano.id).catch(() => {});

    try {
      const { notificar } = require('../services/notificar');
      await notificar({
        modulo: 'cuidados',
        tipo: 'devocional_auto',
        titulo: 'Devocional da semana lançado automaticamente',
        mensagem: `Ninguém lançou o devocional desta semana até segunda 05:00 — o sistema criou "${plano.titulo}" com ${rows.length} itens por IA. Revise o conteúdo em Cuidados → Devocionais.`,
        link: '/ministerial/cuidados',
        chaveDedup: `devocional_auto_${segIso}`,
      });
    } catch (nErr) {
      console.error('[devocional-cron-semanal] notificar:', nErr.message);
    }

    console.log(`[devocional-cron-semanal] plano ${plano.id} criado com ${rows.length} itens`);
    res.json({ ok: true, modo: 'automatico', plano_id: plano.id, itens: rows.length, expirados: expirados?.length || 0 });
  } catch (e) {
    console.error('[devocional-cron-semanal]:', e.message);
    res.status(500).json({ error: e.message });
  }
}
router.get('/cron/lancar-semanal', cronLancarSemanal);
router.post('/cron/lancar-semanal', cronLancarSemanal);


router.use(authenticate);


function parseDate(s) { return new Date(s + 'T12:00:00'); }
function fmtDate(d) { return d.toISOString().slice(0, 10); }
function eachDay(inicio, fim) {
  const out = [];
  const cur = parseDate(inicio);
  const end = parseDate(fim);
  while (cur <= end) {
    out.push(fmtDate(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}




router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('devocional_planos')
      .select('*, devocional_itens(count)')
      .order('data_inicio', { ascending: false });
    if (error) throw error;
    res.json({ data: data || [] });
  } catch (e) {
    console.error('devocional-planos list:', e.message);
    res.status(500).json({ error: 'Erro ao listar planos' });
  }
});




router.get('/:id', async (req, res) => {
  try {
    const { data: plano, error: e1 } = await supabase
      .from('devocional_planos')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (e1) throw e1;
    const { data: itens, error: e2 } = await supabase
      .from('devocional_itens')
      .select('*')
      .eq('plano_id', req.params.id)
      .order('data', { ascending: true });
    if (e2) throw e2;
    res.json({ plano, itens: itens || [] });
  } catch (e) {
    console.error('devocional-planos detail:', e.message);
    res.status(500).json({ error: 'Erro ao buscar plano' });
  }
});





router.post('/', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { titulo, descricao, data_inicio, data_fim, ativo = true } = req.body || {};
    if (!titulo || !data_inicio || !data_fim) {
      return res.status(400).json({ error: 'título, data_inicio e data_fim são obrigatórios' });
    }
    const { data, error } = await supabase
      .from('devocional_planos')
      .insert({ titulo, descricao, data_inicio, data_fim, ativo, criado_por: req.user?.id || null })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    console.error('devocional-planos create:', e.message);
    res.status(500).json({ error: 'Erro ao criar plano' });
  }
});




router.put('/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const patch = {};
    ['titulo', 'descricao', 'data_inicio', 'data_fim', 'ativo'].forEach(k => {
      if (req.body[k] !== undefined) patch[k] = req.body[k];
    });
    const { data, error } = await supabase
      .from('devocional_planos')
      .update(patch)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('devocional-planos update:', e.message);
    res.status(500).json({ error: 'Erro ao atualizar plano' });
  }
});




router.delete('/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { error } = await supabase
      .from('devocional_planos')
      .delete()
      .eq('id', req.params.id);
    if (error) throw error;
    res.status(204).end();
  } catch (e) {
    console.error('devocional-planos delete:', e.message);
    res.status(500).json({ error: 'Erro ao deletar plano' });
  }
});





async function pushDevocionalApp(planoId) {
  try {
    const { data: p } = await supabase.from('devocional_planos').select('id, notificado_app').eq('id', planoId).maybeSingle();
    if (!p || p.notificado_app) return;
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      fetch(`${process.env.SUPABASE_URL}/functions/v1/notify-devocional-semana`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ titulo: 'Devocional da semana 📖', body: 'O devocional desta semana já está no app. Bora começar?' }),
      }).catch((e) => console.error('[devocional] push fetch:', e.message));
    }
    await supabase.from('devocional_planos').update({ notificado_app: true }).eq('id', planoId);
  } catch (e) { console.error('[devocional] pushDevocionalApp:', e.message); }
}

async function gerarItensViaIA(plano, diasAlvo, tema, tom) {
  const client = new Anthropic();
  const systemPrompt = `Você e um pastor protestante brasileiro escrevendo devocionais diarios para a Igreja CBRio. Estilo: ${tom}.

Cada devocional deve ter:
- **passagem**: referência bíblica curta (1-3 versiculos) · formato "Livro Cap:Vers"
- **passagem_texto**: o TEXTO COMPLETO da passagem em portugues, traducao NAA ou ARA. NUNCA omita · a pessoa que le o devocional deve poder ler o texto bíblico ali mesmo, sem precisar abrir a Bíblia.
- **reflexao**: 4-6 paragrafos curtos
- **aplicação**: 1 paragrafo de aplicação pratica
- **oração**: oração curta encerrando

Use linguagem acessivel e contemporanea. NUNCA cite mais de uma passagem central por devocional.`;



  async function gerarUmDia(data, idx) {
    const userPrompt = `Gere 1 devocional diario para o plano "${plano.titulo}" (dia ${idx + 1} de ${diasAlvo.length}).
${tema ? `Tema/serie: ${tema}\n` : ''}${plano.descricao ? `Contexto: ${plano.descricao}\n` : ''}Data: ${data}

Retorne APENAS um objeto JSON (sem markdown, sem texto fora do JSON) no formato:
{
  "data": "${data}",
  "titulo": "...",
  "passagem": "Livro Cap:Vers",
  "passagem_texto": "Texto biblico completo aqui, em portugues",
  "reflexao": "...",
  "aplicacao": "...",
  "oracao": "..."
}`;
    const resp = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });
    const text = resp.content?.filter(b => b.type === 'text').map(b => b.text).join('') || '';
    const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
    try { return { ...JSON.parse(cleaned), data }; }
    catch (err) { console.error('IA JSON parse error (dia ' + data + '):', err.message); return null; }
  }

  const resultados = await Promise.all(diasAlvo.map((d, i) => gerarUmDia(d, i).catch(() => null)));
  const arr = resultados.filter(Boolean);
  if (arr.length === 0) throw new Error('IA retornou JSON invalido');

  const rows = arr
    .filter(o => o && o.data && o.titulo && o.reflexao)
    .map(o => ({
      plano_id: plano.id,
      data: o.data,
      titulo: String(o.titulo).slice(0, 200),
      passagem: o.passagem ? String(o.passagem).slice(0, 100) : null,
      passagem_texto: o.passagem_texto ? String(o.passagem_texto) : null,
      reflexao: String(o.reflexao),
      aplicacao: o.aplicacao ? String(o.aplicacao) : null,
      oracao: o.oracao ? String(o.oracao) : null,
      gerado_por_ia: true,
    }));
  if (rows.length === 0) throw new Error('IA não retornou itens validos');
  return rows;
}





async function estruturarDocxViaIA(texto) {
  const client = new Anthropic();
  const systemPrompt = `Você recebe o TEXTO BRUTO de um documento (.docx) com devocionais diários escritos por um pastor — normalmente um por dia da semana. Sua tarefa é SEGMENTAR o documento em devocionais e EXTRAIR os campos de cada um.

REGRA DE OURO: copie o texto FIELMENTE, exatamente como está. NÃO reescreva, NÃO resuma, NÃO corrija, NÃO complete, NÃO invente nada. Se um campo não existir, retorne null.

Cada devocional do documento costuma ter:
- Uma LINHA DE TÍTULO no formato "<Livro Cap-Cap> – <Tema>" (ex.: "Jó 1-6 – Bancando o forte").
- Um VERSÍCULO em destaque entre aspas, com a referência entre parênteses, logo abaixo do título.
- O CORPO da reflexão (um ou mais parágrafos de meditação).
- Uma linha de APLICAÇÃO que costuma começar com "Viva esta mensagem", "Pratique esta mensagem" ou equivalente.
- O AUTOR, normalmente após "Escrito por".

Para cada devocional, extraia:
- "passagem": a referência de leitura do título (ex.: "Jó 1-6"). Sem o tema.
- "titulo": o tema do título, depois do travessão (ex.: "Bancando o forte").
- "passagem_texto": o versículo em destaque, copiado na íntegra COM a referência entre parênteses, exatamente como no documento.
- "reflexao": o corpo da reflexão, com todos os parágrafos, exatamente como escrito.
- "aplicacao": o parágrafo de aplicação (linha "Viva/Pratique esta mensagem..."), exatamente como escrito, ou null.
- "autor": o nome do autor (após "Escrito por"), ou null.`;

  const userPrompt = `Segmente e extraia os devocionais do documento abaixo. Retorne APENAS um JSON array (sem markdown, sem texto fora do JSON), na ORDEM em que aparecem, no formato:
[
  { "passagem": "...", "titulo": "...", "passagem_texto": "...", "reflexao": "...", "aplicacao": "...", "autor": "..." }
]

=== DOCUMENTO ===
${texto}`;

  const resp = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 8000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const text = resp.content?.filter(b => b.type === 'text').map(b => b.text).join('') || '';
  const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
  let arr;
  try { arr = JSON.parse(cleaned); }
  catch (err) {
    console.error('docx IA JSON parse error:', err.message, 'raw:', text.slice(0, 500));
    throw new Error('Não consegui ler o formato do documento. Confira se ele segue o modelo.');
  }
  if (!Array.isArray(arr)) throw new Error('Estrutura inesperada do documento');
  return arr.filter(o => o && o.titulo && o.reflexao);
}









const BATCH_MAX = 10;

router.post('/:id/gerar-ia', authorize('admin', 'diretor'), async (req, res) => {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: 'ANTHROPIC_API_KEY não configurada' });
    }
    const {
      tema = '',
      tom = 'pastoral, edificante, com aplicação pratica',
      sobrescrever = false,
      apenas_datas,
    } = req.body || {};

    const { data: plano, error: e1 } = await supabase
      .from('devocional_planos')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (e1) throw e1;

    const todasDias = eachDay(plano.data_inicio, plano.data_fim);
    const candidatas = Array.isArray(apenas_datas) && apenas_datas.length
      ? apenas_datas.filter(d => todasDias.includes(d))
      : todasDias;

    const { data: existentes } = await supabase
      .from('devocional_itens')
      .select('data')
      .eq('plano_id', plano.id);
    const setExistente = new Set((existentes || []).map(r => r.data));
    const pendentes = sobrescrever ? candidatas : candidatas.filter(d => !setExistente.has(d));


    const diasAlvo = pendentes.slice(0, BATCH_MAX);
    const restantes = Math.max(0, pendentes.length - diasAlvo.length);

    if (diasAlvo.length === 0) {
      return res.json({
        message: 'Todos os dias solicitados já tem item',
        criados: 0,
        restantes: 0,
        total_pendentes: 0,
      });
    }

    let rows;
    try {
      rows = await gerarItensViaIA(plano, diasAlvo, tema, tom);
    } catch (iaErr) {
      return res.status(500).json({ error: iaErr.message, preview: iaErr.preview });
    }

    if (sobrescrever) {
      await supabase
        .from('devocional_itens')
        .delete()
        .eq('plano_id', plano.id)
        .in('data', diasAlvo);
    }

    const { error: e2 } = await supabase.from('devocional_itens').insert(rows);
    if (e2) throw e2;
    pushDevocionalApp(req.params.id).catch(() => {});

    res.json({
      criados: rows.length,
      total_solicitado: diasAlvo.length,
      restantes,
    });
  } catch (e) {
    console.error('devocional-planos gerar-ia:', e.message);
    res.status(500).json({ error: e.message || 'Erro na geração IA' });
  }
});









router.post('/preview-docx', authorize('admin', 'diretor'), uploadDocx.single('arquivo'), async (req, res) => {
  try {
    if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY não configurada' });
    if (!req.file || !req.file.buffer) return res.status(400).json({ error: 'Envie o arquivo .docx em "arquivo"' });
    if (!String(req.file.originalname || '').toLowerCase().endsWith('.docx')) {
      return res.status(400).json({ error: 'Apenas arquivos .docx são aceitos' });
    }
    const { value: texto } = await mammoth.extractRawText({ buffer: req.file.buffer });
    if (!texto || texto.trim().length < 40) return res.status(400).json({ error: 'Não consegui ler texto no documento.' });
    const extraidos = await estruturarDocxViaIA(texto);
    if (extraidos.length === 0) return res.status(422).json({ error: 'Nenhum devocional reconhecido no documento.' });
    const itens = extraidos.map((o) => ({
      titulo: String(o.titulo || '').slice(0, 200),
      passagem: o.passagem ? String(o.passagem).slice(0, 100) : '',
      passagem_texto: o.passagem_texto ? String(o.passagem_texto) : '',
      reflexao: o.autor ? `${String(o.reflexao || '').trim()}\n\n— Escrito por ${String(o.autor).trim()}` : String(o.reflexao || '').trim(),
      aplicacao: o.aplicacao ? String(o.aplicacao) : '',
    }));
    res.json({ itens, reconhecidos: itens.length });
  } catch (e) {
    console.error('devocional-planos preview-docx:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao ler o documento' });
  }
});





router.post('/:id/itens-lote', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { itens, sobrescrever } = req.body || {};
    if (!Array.isArray(itens) || itens.length === 0) return res.status(400).json({ error: 'Nenhum item para publicar' });
    const { data: plano, error: ePlano } = await supabase
      .from('devocional_planos').select('*').eq('id', req.params.id).single();
    if (ePlano || !plano) return res.status(404).json({ error: 'Plano não encontrado' });

    let dias = eachDay(plano.data_inicio, plano.data_fim);
    const alvo = Math.min(itens.length, 14);
    if (alvo > dias.length) {
      const ultimo = parseDate(plano.data_inicio);
      ultimo.setUTCDate(ultimo.getUTCDate() + (alvo - 1));
      const dataFimNova = fmtDate(ultimo);
      await supabase.from('devocional_planos').update({ data_fim: dataFimNova }).eq('id', plano.id);
      plano.data_fim = dataFimNova;
      dias = eachDay(plano.data_inicio, plano.data_fim);
    }
    const usados = Math.min(itens.length, dias.length);
    const rows = [];
    for (let i = 0; i < usados; i++) {
      const o = itens[i] || {};
      if (!o.titulo || !o.reflexao) continue;
      rows.push({
        plano_id: plano.id,
        data: dias[i],
        titulo: String(o.titulo).slice(0, 200),
        passagem: o.passagem ? String(o.passagem).slice(0, 100) : null,
        passagem_texto: o.passagem_texto ? String(o.passagem_texto) : null,
        reflexao: String(o.reflexao),
        aplicacao: o.aplicacao ? String(o.aplicacao) : null,
        oracao: o.oracao ? String(o.oracao) : null,
        gerado_por_ia: false,
      });
    }
    if (rows.length === 0) return res.status(400).json({ error: 'Itens inválidos (faltou título ou reflexão)' });

    if (sobrescrever) {
      await supabase.from('devocional_itens').delete().eq('plano_id', plano.id).in('data', rows.map(r => r.data));
    }
    const { error: eIns } = await supabase.from('devocional_itens').insert(rows);
    if (eIns) {
      if (eIns.code === '23505') return res.status(409).json({ error: 'Já existem itens em algumas datas. Marque "substituir".' });
      throw eIns;
    }
    pushDevocionalApp(req.params.id).catch(() => {});
    res.status(201).json({ criados: rows.length, dias_do_plano: dias.length, ignorados: Math.max(0, itens.length - usados) });
  } catch (e) {
    console.error('devocional-planos itens-lote:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao publicar os itens' });
  }
});




router.post('/:id/carregar-docx', authorize('admin', 'diretor'), uploadDocx.single('arquivo'), async (req, res) => {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: 'ANTHROPIC_API_KEY não configurada' });
    }
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'Envie o arquivo .docx em "arquivo"' });
    }
    const nome = String(req.file.originalname || '').toLowerCase();
    if (!nome.endsWith('.docx')) {
      return res.status(400).json({ error: 'Apenas arquivos .docx são aceitos' });
    }

    const { data: plano, error: ePlano } = await supabase
      .from('devocional_planos')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (ePlano || !plano) return res.status(404).json({ error: 'Plano não encontrado' });


    const { value: texto } = await mammoth.extractRawText({ buffer: req.file.buffer });
    if (!texto || texto.trim().length < 40) {
      return res.status(400).json({ error: 'Não consegui ler texto no documento.' });
    }


    const extraidos = await estruturarDocxViaIA(texto);
    if (extraidos.length === 0) {
      return res.status(422).json({ error: 'Nenhum devocional reconhecido no documento.' });
    }




    let dias = eachDay(plano.data_inicio, plano.data_fim);
    const alvo = Math.min(extraidos.length, 14);
    if (alvo > dias.length) {
      const ultimo = parseDate(plano.data_inicio);
      ultimo.setUTCDate(ultimo.getUTCDate() + (alvo - 1));
      const dataFimNova = fmtDate(ultimo);
      await supabase.from('devocional_planos').update({ data_fim: dataFimNova }).eq('id', plano.id);
      plano.data_fim = dataFimNova;
      dias = eachDay(plano.data_inicio, plano.data_fim);
    }
    const usados = Math.min(extraidos.length, dias.length);
    const rows = [];
    for (let i = 0; i < usados; i++) {
      const o = extraidos[i];
      const reflexao = o.autor
        ? `${String(o.reflexao).trim()}\n\n— Escrito por ${String(o.autor).trim()}`
        : String(o.reflexao).trim();
      rows.push({
        plano_id: plano.id,
        data: dias[i],
        titulo: String(o.titulo).slice(0, 200),
        passagem: o.passagem ? String(o.passagem).slice(0, 100) : null,
        passagem_texto: o.passagem_texto ? String(o.passagem_texto) : null,
        reflexao,
        aplicacao: o.aplicacao ? String(o.aplicacao) : null,
        oracao: null,
        gerado_por_ia: false,
      });
    }


    const sobrescrever = req.query.sobrescrever === '1' || req.query.sobrescrever === 'true';
    if (sobrescrever) {
      await supabase
        .from('devocional_itens')
        .delete()
        .eq('plano_id', plano.id)
        .in('data', rows.map(r => r.data));
    }

    const { error: eIns } = await supabase.from('devocional_itens').insert(rows);
    if (eIns) {
      if (eIns.code === '23505') {
        return res.status(409).json({ error: 'Já existem itens em algumas datas. Use "substituir" para regravar.' });
      }
      throw eIns;
    }

    res.status(201).json({
      criados: rows.length,
      reconhecidos: extraidos.length,
      dias_do_plano: dias.length,
      ignorados: Math.max(0, extraidos.length - usados),
    });
  } catch (e) {
    console.error('devocional-planos carregar-docx:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao carregar o documento' });
  }
});





router.post('/:id/itens', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { data, titulo, passagem, reflexao, aplicacao, oracao } = req.body || {};
    if (!data || !titulo || !reflexao) {
      return res.status(400).json({ error: 'data, título e reflexao são obrigatórios' });
    }
    const { data: novo, error } = await supabase
      .from('devocional_itens')
      .insert({
        plano_id: req.params.id,
        data,
        titulo,
        passagem: passagem || null,
        reflexao,
        aplicacao: aplicacao || null,
        oracao: oracao || null,
        gerado_por_ia: false,
      })
      .select()
      .single();
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Já existe item pra essa data' });
      throw error;
    }
    res.status(201).json(novo);
  } catch (e) {
    console.error('devocional-itens create:', e.message);
    res.status(500).json({ error: 'Erro ao criar item' });
  }
});

router.put('/itens/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const patch = {};
    ['titulo', 'passagem', 'passagem_texto', 'reflexao', 'aplicacao', 'oracao'].forEach(k => {
      if (req.body[k] !== undefined) patch[k] = req.body[k];
    });



    let pathAntigo = null;


    if (req.body.video_url !== undefined && req.body.video_path === undefined) {
      const link = req.body.video_url === null ? null : devVideo.linkDoYoutube(req.body.video_url);
      if (req.body.video_url !== null && !link) {
        return res.status(400).json({ error: 'Cole um link do YouTube (youtube.com/watch?v=… ou youtu.be/…).' });
      }
      const { data: atual, error: eAtual } = await supabase
        .from('devocional_itens').select('video_path').eq('id', req.params.id).maybeSingle();
      if (eAtual) throw eAtual;
      pathAntigo = atual?.video_path || null;
      patch.video_path = null;
      patch.video_url = link;
    }
    if (req.body.video_path !== undefined) {
      const novo = req.body.video_path;
      if (novo !== null && !devVideo.caminhoEhDoItem(req.params.id, novo)) {
        return res.status(400).json({ error: 'Arquivo de vídeo inválido para este item.' });
      }
      const { data: atual, error: eAtual } = await supabase
        .from('devocional_itens').select('video_path').eq('id', req.params.id).maybeSingle();
      if (eAtual) throw eAtual;
      pathAntigo = atual?.video_path || null;
      patch.video_path = novo;
      patch.video_url = novo ? supabase.storage.from(devVideo.BUCKET).getPublicUrl(novo).data.publicUrl : null;
    }
    const { data, error } = await supabase
      .from('devocional_itens')
      .update(patch)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;


    if (pathAntigo && pathAntigo !== patch.video_path) {
      const { error: eRm } = await supabase.storage.from(devVideo.BUCKET).remove([pathAntigo]);
      if (eRm) console.error('devocional-itens video remove:', eRm.message);
    }
    res.json(data);
  } catch (e) {
    console.error('devocional-itens update:', e.message);
    if (e.code === '42703') return res.status(503).json({ error: 'O vídeo do devocional ainda não foi ativado no banco (migration 20260925120000).' });
    res.status(500).json({ error: 'Erro ao atualizar item' });
  }
});







router.post('/itens/:id/video/upload', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const v = devVideo.validarVideo(req.body || {});
    if (v.erro) return res.status(400).json({ error: v.erro });
    const { data: item, error: eItem } = await supabase
      .from('devocional_itens').select('id').eq('id', req.params.id).maybeSingle();
    if (eItem) throw eItem;
    if (!item) return res.status(404).json({ error: 'Item não encontrado' });
    const path = devVideo.caminhoDoVideo(item.id, v.ext, Date.now());
    const { data, error } = await supabase.storage.from(devVideo.BUCKET).createSignedUploadUrl(path);
    if (error) {
      if (/not found|bucket/i.test(error.message || '')) {
        return res.status(503).json({ error: 'O vídeo do devocional ainda não foi ativado no banco (migration 20260925120000).' });
      }
      throw error;
    }
    res.json({ path, signedUrl: data.signedUrl, token: data.token });
  } catch (e) {
    console.error('devocional-itens video upload:', e.message);
    res.status(500).json({ error: 'Erro ao preparar o envio do vídeo' });
  }
});




router.delete('/itens/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { error } = await supabase.from('devocional_itens').delete().eq('id', req.params.id);
    if (error) throw error;
    res.status(204).end();
  } catch (e) {
    console.error('devocional-itens delete:', e.message);
    res.status(500).json({ error: 'Erro ao deletar item' });
  }
});





router.get('/:id/adesao', async (req, res) => {
  try {
    const planoId = req.params.id;
    const { detalhe } = req.query;

    const { data: dias, error: e1 } = await supabase
      .from('vw_devocional_adesao_dia')
      .select('*')
      .eq('plano_id', planoId)
      .order('data', { ascending: true });
    if (e1) throw e1;

    const { count: totalMembros } = await supabase
      .from('mem_membros')
      .select('id', { count: 'exact', head: true })
      .eq('active', true)
      .in('status', ['membro_ativo', 'membro', 'frequentador']);

    const diasComPct = (dias || []).map(d => ({
      ...d,
      total_membros: totalMembros || 0,
      pct_adesao: totalMembros > 0 ? Math.round((d.check_ins / totalMembros) * 100) : 0,
    }));

    const resposta = { dias: diasComPct, total_membros: totalMembros || 0 };

    if (detalhe === 'membros') {
      const { data: detalheData, error: e2 } = await supabase
        .from('vw_devocional_adesao_membro')
        .select('membro_id, membro_nome, foto_url, data, concluido, item_id')
        .eq('plano_id', planoId)
        .order('membro_nome', { ascending: true });
      if (e2) throw e2;
      resposta.detalhe = detalheData || [];
    }

    res.json(resposta);
  } catch (e) {
    console.error('devocional-planos adesao:', e.message);
    res.status(500).json({ error: 'Erro ao calcular adesao' });
  }
});






router.post('/:id/enviar-hoje', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const hoje = new Date().toISOString().slice(0, 10);
    const { data: item, error } = await supabase
      .from('devocional_itens')
      .select('id, plano_id, titulo, passagem, data, devocional_planos!inner(id, ativo)')
      .eq('plano_id', req.params.id)
      .eq('data', hoje)
      .maybeSingle();
    if (error) throw error;
    if (!item) return res.status(404).json({ error: 'Plano não tem item pra hoje' });
    if (!item.devocional_planos?.ativo) return res.status(400).json({ error: 'Plano esta inativo' });

    const r = await devSender.enviarDoDia({ item });
    res.json(r);
  } catch (e) {
    console.error('devocional-planos enviar-hoje:', e.message);
    res.status(500).json({ error: e.message });
  }
});





router.get('/:id/envios', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('devocional_envios')
      .select('item_id, enviado, motivo, devocional_itens!inner(id, data, titulo)')
      .eq('plano_id', req.params.id)
      .order('created_at', { ascending: false });
    if (error) throw error;

    const porItem = new Map();
    for (const e of data || []) {
      const key = e.item_id;
      if (!porItem.has(key)) {
        porItem.set(key, {
          item_id: key,
          data: e.devocional_itens?.data,
          titulo: e.devocional_itens?.titulo,
          enviados: 0,
          erros: 0,
          ultimos_motivos: {},
        });
      }
      const agg = porItem.get(key);
      if (e.enviado) agg.enviados++;
      else {
        agg.erros++;
        if (e.motivo) agg.ultimos_motivos[e.motivo] = (agg.ultimos_motivos[e.motivo] || 0) + 1;
      }
    }
    const itens = Array.from(porItem.values()).sort((a, b) => (b.data || '').localeCompare(a.data || ''));
    res.json({ itens });
  } catch (e) {
    console.error('devocional-planos envios:', e.message);
    res.status(500).json({ error: e.message });
  }
});










router.get('/metricas-cuidados', async (req, res) => {
  try {
    const hoje = new Date().toISOString().slice(0, 10);
    const d7 = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const d30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

    const [
      { count: checkinsHoje },
      { count: planosAtivos },
      { count: membrosLogados },
      { data: checkins7d },
      { data: checkins30d },
    ] = await Promise.all([



      supabase.from('mem_devocionais').select('id', { count: 'exact', head: true }).eq('data_devocional', hoje).is('deleted_at', null),
      supabase.from('devocional_planos').select('id', { count: 'exact', head: true }).eq('ativo', true),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('is_membro_only', true).not('membro_id', 'is', null),
      supabase.from('mem_devocionais').select('membro_id, data_devocional').gte('data_devocional', d7).is('deleted_at', null),
      supabase.from('mem_devocionais').select('membro_id').gte('data_devocional', d30).is('deleted_at', null),
    ]);

    const checkins7dCount = (checkins7d || []).length;
    const membrosEngajados30d = new Set((checkins30d || []).map(r => r.membro_id)).size;
    const adesaoHojePct = (membrosLogados || 0) > 0
      ? Math.round(((checkinsHoje || 0) / (membrosLogados || 1)) * 100)
      : 0;

    res.json({
      checkins_hoje: checkinsHoje || 0,
      checkins_7d: checkins7dCount,
      membros_engajados_30d: membrosEngajados30d,
      planos_ativos: planosAtivos || 0,
      membros_logados: membrosLogados || 0,
      adesao_hoje_pct: adesaoHojePct,
    });
  } catch (e) {
    console.error('devocional-planos/metricas-cuidados:', e.message);
    res.status(500).json({ error: 'Erro ao calcular metricas' });
  }
});

module.exports = router;
