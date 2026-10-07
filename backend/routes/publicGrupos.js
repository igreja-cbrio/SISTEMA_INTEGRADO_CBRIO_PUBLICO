

const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const { supabase } = require('../utils/supabase');
const { uploadModuleFile, SHAREPOINT_CONFIGURED } = require('../services/storageService');
const {
  normalizarCpf, normalizarTelefone, normalizarEmail, nomesMesmaPessoa,
  acharMembroGuardado, acharOuCriarGuardado, registrarContatoDaPorta,
} = require('../services/membroMatch');
const {
  verificarToken, notificarLiderNovoPedido, formatarQuando, formatarOnde,
  montarEnvioFrequencia, rotuloMes, enviarInscricaoConfirmada,
} = require('../services/gruposWhatsapp');
const { processarFila, enfileirarLote } = require('../services/whatsappFila');
const { enviosAutomaticosAtivos } = require('../services/gruposEnviosConfig');
const { registrarEventoPedido } = require('../services/grupoPedidoEventos');
const { registrarObservacaoSegura } = require('../services/identidadeProgressiva');
const {
  temAbreviacaoNome, registrarConsentimentos, cpfValido, emailValido,
  validarCamposPadrao,
  tirarCodigoPaisTelefone,
} = require('../services/inscricaoContrato');


const { contatoParaLider } = require('../services/contatoPessoa');
const { requireCron } = require('../utils/cronAuth');

const { normalizarBusca, contemNormalizado, algumContemNormalizado } = require('../services/busca');

const { enderecoPublicoGrupo, ondePublicoGrupo } = require('../utils/enderecoGrupoPublico');





const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;








const totemLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,






  max: parseInt(process.env.GRUPOS_PUBLIC_RATE_LIMIT_MAX) || (process.env.NODE_ENV === 'production' ? 10000 : 20000),
  message: { error: 'Muitas tentativas em pouco tempo. Aguarde um instante e tente de novo.' },
  skip: () => process.env.NODE_ENV !== 'production',
  standardHeaders: true,
  legacyHeaders: false,
});
router.use(totemLimiter);


const uploadMw = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) cb(null, true);
    else cb(new Error('Formato de imagem não suportado.'));
  },
});

const RATE_HEADERS = ['x-forwarded-for'];
function getIp(req) {
  return (req.headers[RATE_HEADERS[0]] || '').toString().split(',')[0].trim() || req.ip;
}

function distanciaKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}









async function buscarApelidos(ids) {
  const mapa = {};
  const unicos = [...new Set((ids || []).filter(Boolean))];
  if (!unicos.length) return mapa;
  for (let i = 0; i < unicos.length; i += 200) {
    const { data, error } = await supabase.from('mem_membros')
      .select('id, apelido').in('id', unicos.slice(i, i + 200));
    if (error) {
      console.warn('[public grupos] apelido indisponível (migration pendente?):', error.message);
      return {};
    }
    (data || []).forEach(m => {
      const ap = (m.apelido || '').trim();
      if (ap) mapa[m.id] = ap;
    });
  }
  return mapa;
}


function nomeComApelido(nome, apelido) {
  if (!nome) return null;
  return apelido ? `${nome} (${apelido})` : nome;
}








function montarListaLideres({ principalNome, principalId, roster = [], apelidos = {} }) {
  const lideresNomes = [];
  const lideresExibicao = [];
  const lideresBusca = [];
  const addLider = (nome, membroId) => {
    if (!nome || lideresNomes.includes(nome)) return;
    const ap = membroId ? (apelidos[membroId] || null) : null;
    lideresNomes.push(nome);
    lideresExibicao.push(nomeComApelido(nome, ap));
    lideresBusca.push(nome);
    if (ap) lideresBusca.push(ap);
  };
  addLider(principalNome, principalId);
  roster.forEach(r => addLider(r.nome, r.membro_id));
  return {
    lideres_nomes: lideresNomes,
    lideres_exibicao: lideresExibicao,
    lideres_busca: [...new Set(lideresBusca)],
  };
}












async function rosterLideresDoGrupo(grupoId) {
  try {
    const { data, error } = await supabase.from('mem_grupo_membros')
      .select('membro_id, mem_membros!inner(nome)')
      .eq('grupo_id', grupoId)
      .in('funcao', ['lider'])
      .is('saiu_em', null).is('deleted_at', null);
    if (error) {
      console.warn('[public grupos] roster de líderes indisponível:', error.message);
      return [];
    }
    return (data || [])
      .filter(v => v.mem_membros?.nome)
      .map(v => ({ nome: v.mem_membros.nome, membro_id: v.membro_id || null }));
  } catch (e) {
    console.warn('[public grupos] roster de líderes falhou:', e.message);
    return [];
  }
}


router.get('/temporadas', async (req, res) => {
  try {
    const { data } = await supabase.from('mem_temporadas').select('id, label, ano, numero, ativa, inscricoes_abertas').order('ano', { ascending: false }).order('numero', { ascending: false });
    res.json(data || []);
  } catch { res.status(500).json({ error: 'Erro' }); }
});











function semDadosDePorta(g) {
  if (!g) return g;
  const { endereco, complemento, ...publico } = g;
  return { ...publico, endereco_publico: enderecoPublicoGrupo(g) };
}

async function buscarGruposInscriveis({ categoria, bairro, temporada } = {}) {
  let query = supabase.from('mem_grupos')
    .select('id, codigo, nome, categoria, faixa_etaria, idade_min, idade_max, dia_semana, horario, recorrencia, local, endereco, descricao, bairro, lat, lng, lider_id, status_temporada, temporada, foto_url, modo_inscricao')
    .eq('ativo', true)
    .is('deleted_at', null)
    .eq('aceitando_inscricoes', true)
    .neq('modo_inscricao', 'fechado')



    .not('lider_id', 'is', null);

  query = query.in('status_temporada', ['ativo', 'novo', 'a_confirmar']);
  if (categoria) query = query.eq('categoria', categoria);
  if (bairro) query = query.eq('bairro', bairro);
  if (temporada) query = query.eq('temporada', temporada);
  query = query.order('nome');

  const { data: gruposCrus, error } = await query;
  if (error) throw error;



  const { data: temporadasAll } = await supabase.from('mem_temporadas')
    .select('id, label, ano, numero, inscricoes_abertas');
  const abertas = new Set((temporadasAll || []).filter(t => t.inscricoes_abertas).map(t => t.id));
  const grupos = (gruposCrus || []).filter(g =>
    g.modo_inscricao === 'sempre_aberto'
    || (g.modo_inscricao !== 'fechado' && (!g.temporada || abertas.has(g.temporada))));
  return { grupos, temporadas: temporadasAll || [] };
}







router.get('/app-inscricao', async (_req, res) => {
  try {
    const { grupos, temporadas } = await buscarGruposInscriveis();
    const atual = temporadas
      .filter(t => t.inscricoes_abertas)
      .sort((a, b) => (b.ano - a.ano) || (b.numero - a.numero))[0] || null;
    res.json({
      aberta: grupos.length > 0,
      titulo: atual?.label || null,
      grupos: grupos.map(g => ({
        id: g.id,
        codigo: g.codigo,
        nome: g.nome,
        categoria: g.categoria,
        bairro: g.bairro,
        dia_semana: g.dia_semana,
        horario: g.horario,
        recorrencia: g.recorrencia,
        modo_inscricao: g.modo_inscricao,
      })),
    });
  } catch (e) {
    console.error('[public grupos app-inscricao]', e.message);
    res.status(500).json({ error: 'Erro ao carregar grupos' });
  }
});


router.get('/buscar', async (req, res) => {
  try {
    const { lider_nome, categoria, bairro, cep, raio_km, temporada, q } = req.query;
    const { grupos } = await buscarGruposInscriveis({ categoria, bairro, temporada });





    const liderIds = [...new Set((grupos || []).map(g => g.lider_id).filter(Boolean))];
    let lideresMap = {};
    if (liderIds.length > 0) {
      const { data: lideres } = await supabase.from('mem_membros').select('id, nome, foto_url').in('id', liderIds);
      (lideres || []).forEach(l => { lideresMap[l.id] = l; });
    }
    const gIds = (grupos || []).map(g => g.id);
    const rosterLideres = {};
    for (let i = 0; i < gIds.length; i += 200) {
      const { data: rl } = await supabase.from('mem_grupo_membros')
        .select('grupo_id, membro_id, mem_membros!inner(nome)')
        .in('grupo_id', gIds.slice(i, i + 200))
        .in('funcao', ['lider'])
        .is('saiu_em', null).is('deleted_at', null);
      (rl || []).forEach(v => {
        if (!v.mem_membros?.nome) return;
        (rosterLideres[v.grupo_id] = rosterLideres[v.grupo_id] || [])
          .push({ nome: v.mem_membros.nome, membro_id: v.membro_id || null });
      });
    }



    const apelidos = await buscarApelidos([
      ...liderIds,
      ...Object.values(rosterLideres).flat().map(r => r.membro_id),
    ]);

    let resultado = (grupos || []).map(g => {
      const principal = lideresMap[g.lider_id]?.nome || null;
      return {
        ...semDadosDePorta(g),
        lider_nome: principal,
        lider_apelido: g.lider_id ? (apelidos[g.lider_id] || null) : null,
        lider_foto: lideresMap[g.lider_id]?.foto_url || null,
        ...montarListaLideres({
          principalNome: principal,
          principalId: g.lider_id,
          roster: rosterLideres[g.id] || [],
          apelidos,
        }),
      };
    });



    const alvosLider = (g) => (g.lideres_busca && g.lideres_busca.length ? g.lideres_busca : (g.lideres_nomes || []));
    if (lider_nome) {
      resultado = resultado.filter(g => algumContemNormalizado(alvosLider(g), lider_nome));
    }
    if (q) {
      resultado = resultado.filter(g =>
        contemNormalizado(g.nome, q)
        || algumContemNormalizado(alvosLider(g), q)
        || contemNormalizado(g.bairro, q)
        || contemNormalizado(g.local, q)
        || contemNormalizado(g.endereco_publico, q)
        || contemNormalizado(g.codigo, q)
      );
    }

    if (cep && raio_km) {
      const cepLimpo = String(cep).replace(/\D/g, '');
      if (cepLimpo.length === 8) {
        try {
          const viaCepRes = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
          const viaCep = await viaCepRes.json();
          if (!viaCep.erro) {
            const qStr = encodeURIComponent(`${viaCep.logradouro || ''} ${viaCep.localidade} ${viaCep.uf} Brasil`.trim());
            const nomRes = await fetch(`https://nominatim.openstreetmap.org/search?q=${qStr}&format=json&limit=1`, {
              headers: { 'User-Agent': 'CBRio-Sistema/1.0 (contato@cbrio.com.br)' },
            });
            const nom = await nomRes.json();
            const cepLat = nom?.[0] ? parseFloat(nom[0].lat) : null;
            const cepLng = nom?.[0] ? parseFloat(nom[0].lon) : null;
            const raio = parseFloat(raio_km) || 20;
            if (cepLat != null && cepLng != null) {
              resultado = resultado
                .filter(g => g.lat != null && g.lng != null)
                .map(g => ({ ...g, dist_km: distanciaKm(cepLat, cepLng, Number(g.lat), Number(g.lng)) }))
                .filter(g => g.dist_km <= raio)
                .sort((a, b) => a.dist_km - b.dist_km);
            }
          }
        } catch (e) { console.warn('[public grupos buscar geocode]', e.message); }
      }
    }

    res.json(resultado);
  } catch (e) { console.error('[public grupos buscar]', e.message); res.status(500).json({ error: 'Erro ao buscar grupos' }); }
});


router.get('/lideres/buscar', async (req, res) => {
  try {
    const { q, temporada } = req.query;
    const term = normalizarBusca(q);
    if (term.length < 2) return res.json([]);

    let query = supabase.from('mem_grupos').select('lider_id').eq('ativo', true).is('deleted_at', null).not('lider_id', 'is', null);
    if (temporada) query = query.eq('temporada', temporada);
    const { data: grupos } = await query;
    const liderIds = [...new Set((grupos || []).map(g => g.lider_id))];
    if (!liderIds.length) return res.json([]);




    const lideres = [];
    for (let i = 0; i < liderIds.length; i += 200) {
      const { data } = await supabase.from('mem_membros')
        .select('id, nome, foto_url').in('id', liderIds.slice(i, i + 200));
      lideres.push(...(data || []));
    }
    const apelidos = await buscarApelidos(liderIds);

    const casam = lideres
      .map(l => ({ ...l, apelido: apelidos[l.id] || null }))
      .filter(l => contemNormalizado(l.nome, q) || contemNormalizado(l.apelido, q))
      .sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'))
      .slice(0, 20)


      .map(l => ({ ...l, nome_exibicao: nomeComApelido(l.nome, l.apelido) }));

    res.json(casam);
  } catch { res.status(500).json({ error: 'Erro' }); }
});



router.get('/:id', async (req, res) => {
  if (!UUID_RE.test(req.params.id)) return res.status(404).json({ error: 'Grupo não encontrado' });
  try {
    const { data: grupo, error } = await supabase
      .from('mem_grupos')
      .select('id, codigo, nome, categoria, faixa_etaria, idade_min, idade_max, dia_semana, horario, recorrencia, local, endereco, descricao, bairro, lat, lng, lider_id, status_temporada, temporada, foto_url, complemento, ativo, aceitando_inscricoes, modo_inscricao')
      .eq('id', req.params.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    if (!grupo || !grupo.ativo) return res.status(404).json({ error: 'Grupo não encontrado' });

    let lider_nome = null;
    let lider_foto = null;
    if (grupo.lider_id) {
      const { data: lider } = await supabase.from('mem_membros').select('nome, foto_url').eq('id', grupo.lider_id).maybeSingle();
      if (lider) { lider_nome = lider.nome; lider_foto = lider.foto_url; }
    }




    const roster = await rosterLideresDoGrupo(grupo.id);


    const apelidos = await buscarApelidos([grupo.lider_id, ...roster.map(r => r.membro_id)]);
    const lider_apelido = grupo.lider_id ? (apelidos[grupo.lider_id] || null) : null;
    res.json({
      ...semDadosDePorta(grupo),
      lider_nome,
      lider_apelido,
      lider_foto,
      ...montarListaLideres({
        principalNome: lider_nome,
        principalId: grupo.lider_id,
        roster,
        apelidos,
      }),
    });
  } catch (e) {
    console.error('[public grupos getById]', e.message);
    res.status(500).json({ error: 'Erro ao buscar grupo' });
  }
});



router.get('/lideres/:liderId/grupos', async (req, res) => {
  try {
    const { temporada } = req.query;
    let query = supabase.from('mem_grupos')
      .select('id, codigo, nome, categoria, faixa_etaria, idade_min, idade_max, dia_semana, horario, recorrencia, local, endereco, descricao, bairro, lat, lng, lider_id, status_temporada, temporada, modo_inscricao')
      .eq('lider_id', req.params.liderId).eq('ativo', true)
      .is('deleted_at', null)
      .eq('aceitando_inscricoes', true)
      .neq('modo_inscricao', 'fechado')
      .in('status_temporada', ['ativo', 'novo', 'a_confirmar']);
    if (temporada) query = query.eq('temporada', temporada);
    const { data, error } = await query.order('nome');
    if (error) throw error;
    const { data: temporadasAll } = await supabase.from('mem_temporadas').select('id, inscricoes_abertas');
    const abertas = new Set((temporadasAll || []).filter(t => t.inscricoes_abertas).map(t => t.id));
    res.json((data || []).filter(g =>
      g.modo_inscricao === 'sempre_aberto' || !g.temporada || abertas.has(g.temporada))
      .map(semDadosDePorta));
  } catch { res.status(500).json({ error: 'Erro' }); }
});


const { notificar } = require('../services/notificar');
const { donosDoGrupo } = require('../services/gruposDestinatarios');
const { avisarPedidoNovoNoApp } = require('../services/gruposAvisoApp');

function soDigitos(v) { return (v || '').toString().replace(/\D+/g, ''); }




function telefoneExibicao(v) {
  const d = soDigitos(v);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d || '';
}






function fotoUrlValida(u) {
  if (!u || typeof u !== 'string') return false;
  const s = u.slice(0, 1000);
  const raiz = process.env.SUPABASE_URL
    ? `${process.env.SUPABASE_URL.replace(/\/+$/, '')}/storage/v1/object/public/fotos-membros/`
    : null;
  if (raiz) return s.startsWith(raiz);
  return /^https:\/\/[^/]+\/storage\/v1\/object\/public\/fotos-membros\//.test(s);
}


async function fetchAllRange(tabela, sel, filtros = []) {
  let todos = [], from = 0; const size = 1000;
  for (;;) {
    let q = supabase.from(tabela).select(sel).range(from, from + size - 1);
    for (const [fn, ...args] of filtros) q = q[fn](...args);
    const { data, error } = await q;
    if (error) throw error;
    todos = todos.concat(data || []);
    if (!data || data.length < size) break;
    from += size;
  }
  return todos;
}







function matchInfo(inc, cand) {
  const cpfI = normalizarCpf(inc.cpf), cpfC = normalizarCpf(cand.cpf);
  const telI = normalizarTelefone(inc.telefone), telC = normalizarTelefone(cand.telefone);
  const emI = normalizarEmail(inc.email), emC = normalizarEmail(cand.email);
  const cpfMatch = !!(cpfI && cpfC && cpfI === cpfC);
  const motivos = []; let fracos = 0;
  if (cpfMatch) motivos.push('cpf');
  if (telI && telC && telI === telC) { fracos++; motivos.push('telefone'); }
  if (emI && emC && emI === emC) { fracos++; motivos.push('email'); }
  if (inc.nome && cand.nome && nomesMesmaPessoa(inc.nome, cand.nome)) { fracos++; motivos.push('nome'); }
  return { dispara: cpfMatch || fracos >= 2, motivos };
}












async function checarDuplicataInscricao(grupoId, inc, opts = {}) {
  const ignorarMembroIds = new Set((opts.ignorarMembroIds || []).filter(Boolean));
  const ignorarPedidoIds = new Set((opts.ignorarPedidoIds || []).filter(Boolean));

  const links = await fetchAllRange('mem_grupo_membros', 'membro_id',
    [['eq', 'grupo_id', grupoId], ['is', 'saiu_em', null], ['is', 'deleted_at', null]]);
  const ids = [...new Set(links.map(l => l.membro_id).filter(Boolean))]
    .filter(id => !ignorarMembroIds.has(id));
  for (let i = 0; i < ids.length; i += 200) {
    const { data: membros } = await supabase.from('mem_membros')
      .select('id, nome, cpf, telefone, email').in('id', ids.slice(i, i + 200));
    for (const m of (membros || [])) {
      if (matchInfo(inc, m).dispara) return { tipo: 'membro_ativo' };
    }
  }

  const peds = await fetchAllRange('mem_grupo_pedidos',
    'id, nome, email, telefone, membro_id, cadastro_pendente_id',
    [['eq', 'grupo_id', grupoId], ['eq', 'status', 'pendente'], ['is', 'deleted_at', null]]);
  for (const p of peds) {
    if (ignorarPedidoIds.has(p.id)) continue;
    let cand = { nome: p.nome, email: p.email, telefone: p.telefone, cpf: null };
    if (p.membro_id) {
      const { data } = await supabase.from('mem_membros')
        .select('nome, cpf, telefone, email').eq('id', p.membro_id).maybeSingle();
      if (data) cand = { nome: data.nome || p.nome, cpf: data.cpf, telefone: data.telefone || p.telefone, email: data.email || p.email };
    } else if (p.cadastro_pendente_id) {
      const { data } = await supabase.from('mem_cadastros_pendentes')
        .select('nome, cpf, telefone, email').eq('id', p.cadastro_pendente_id).maybeSingle();
      if (data) cand = { nome: data.nome || p.nome, cpf: data.cpf, telefone: data.telefone || p.telefone, email: data.email || p.email };
    }
    if (matchInfo(inc, cand).dispara) return { tipo: 'pedido_pendente', pedido_id: p.id };
  }
  return null;
}



function uploadFotoMw(req, res, next) {
  uploadMw.single('foto')(req, res, (err) => {
    if (!err) return next();
    const msg = err instanceof multer.MulterError
      ? (err.code === 'LIMIT_FILE_SIZE' ? 'Imagem muito grande (máximo 5MB).' : 'Falha no envio da imagem.')
      : (err.message || 'Formato de imagem não suportado.');
    return res.status(400).json({ error: msg });
  });
}



router.post('/upload-foto', uploadFotoMw, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Imagem não fornecida' });
    const id = `grp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const ext = req.file.mimetype === 'image/png' ? 'png' : req.file.mimetype === 'image/webp' ? 'webp' : 'jpg';
    const path = `cadastros/${id}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from('fotos-membros')
      .upload(path, req.file.buffer, { contentType: req.file.mimetype, upsert: true });
    if (upErr) throw upErr;

    const { data: urlData } = supabase.storage.from('fotos-membros').getPublicUrl(path);



    if (SHAREPOINT_CONFIGURED) {
      uploadModuleFile('membresia', 'Cadastros_Publicos', `${id}.${ext}`, req.file.buffer)
        .then(() => console.log(`[public grupos] foto sincronizada com SharePoint: ${id}`))
        .catch(spErr => console.error('[public grupos] SharePoint sync (nao-critico):', spErr.message));
    }

    res.json({ foto_url: urlData.publicUrl });
  } catch (e) {
    console.error('[public grupos upload-foto]', e.message);
    res.status(500).json({ error: 'Erro ao enviar foto' });
  }
});



























async function processarPessoaPedido({ grupo, pessoa = {}, contexto = {}, principalId = null, principalMembroId = null }) {
  const grupoId = grupo.id;
  const nomeLimpo = String(pessoa.nome || '').trim();
  const cpfLimpo = pessoa.cpf ? soDigitos(pessoa.cpf) : null;
  const emailLimpo = pessoa.email ? String(pessoa.email).trim().toLowerCase() : null;
  const telDigitos = tirarCodigoPaisTelefone(soDigitos(pessoa.telefone));
  const generoLimpo = ['masculino', 'feminino'].includes(String(pessoa.genero || '').toLowerCase())
    ? String(pessoa.genero).toLowerCase() : null;
  const dataNascimento = pessoa.data_nascimento || null;
  const fotoUrl = fotoUrlValida(pessoa.foto_url) ? String(pessoa.foto_url).slice(0, 1000) : null;


  const enderecoLimpo = pessoa.endereco ? String(pessoa.endereco).trim().slice(0, 300) : null;
  const confirmarNovo = pessoa.confirmar_novo === true;
  const souEu = pessoa.sou_eu === true;
  const optin = pessoa.whatsapp_optin === true;
  const consentimentoTexto = pessoa.consentimento_texto
    ? String(pessoa.consentimento_texto).slice(0, 2000) : null;
  const { ip: ipInsc = null, userAgent: uaInsc = null, origem = 'formulario_publico' } = contexto;




  const achado = await acharMembroGuardado(
    { cpf: cpfLimpo, email: emailLimpo, telefone: pessoa.telefone, nome: nomeLimpo, dataNascimento },
    { soChaveForte: confirmarNovo },
  );
  const membroId = achado?.membro_id || null;








  if (membroId) {
    const { data: mem } = await supabase.from('mem_membros')
      .select('foto_url, genero, data_nascimento, email, telefone').eq('id', membroId).maybeSingle();
    if (mem) {
      const upd = {};
      if (fotoUrl && !mem.foto_url) upd.foto_url = fotoUrl;
      if (generoLimpo && !mem.genero) upd.genero = generoLimpo;
      if (dataNascimento && !mem.data_nascimento) upd.data_nascimento = dataNascimento;
      if (emailLimpo && !mem.email) upd.email = emailLimpo;
      const telAtual = soDigitos(mem.telefone);
      if (telDigitos && [10, 11].includes(telDigitos.length) && !telAtual) upd.telefone = telDigitos;
      if (Object.keys(upd).length) await supabase.from('mem_membros').update(upd).eq('id', membroId);

      const emailDiverge = emailLimpo && mem.email && String(mem.email).trim().toLowerCase() !== emailLimpo;
      const telDiverge = telDigitos && telAtual && telAtual !== telDigitos;
      if (emailDiverge || telDiverge) {
        registrarContatoDaPorta(membroId, {
          telefone: telDiverge ? telDigitos : null,
          email: emailDiverge ? emailLimpo : null,
        }, 'grupos_formulario');
      }
    }








    if (cpfLimpo && achado?.matched_by !== 'cpf') {
      try {
        const { reconciliarCpfTardio } = require('../services/cpfReconciliar');
        await reconciliarCpfTardio({
          membroId, cpf: cpfLimpo, origem: 'grupos_formulario',
          dataNascimento,
          confianca: achado?.matched_by === 'nome+nascimento' ? 'forte' : 'fraca',
        });
      } catch (e) {
        console.warn('[public grupos inscrever] cpf tardio:', e.message);
      }
    }
  }





  if (optin && membroId) {
    try {
      await supabase.from('mem_membros')
        .update({ whatsapp_optin: true, whatsapp_optin_em: new Date().toISOString() })
        .eq('id', membroId).is('deleted_at', null);
    } catch (e) {
      console.warn('[public grupos inscrever] optin membro:', e.message);
    }
  }








  const jaExiste = (tipo, refRenovacao = null) => {
    if (refRenovacao) {
      registrarConsentimentos({
        porta: 'grupos', refId: refRenovacao, membroId,
        ip: ipInsc, userAgent: uaInsc,
        itens: [
          { tipo: 'termos_lgpd', aceito: true, texto: consentimentoTexto || undefined },
          { tipo: 'whatsapp', aceito: optin },
        ],
      }).catch((err) => console.error('[public grupos inscrever] consentimentos renovação:', err.message));
    }
    return tipo === 'membro_ativo'
      ? { ok: true, ja_membro: true, renovado: true, membro_id: membroId, vinculo_id: refRenovacao, mensagem: 'Renovamos a sua inscrição no grupo para esta temporada. Nos vemos no encontro!' }


      : { ok: true, ja_pedido: true, membro_id: membroId, pedido_id: refRenovacao, mensagem: 'Seu pedido já está registrado — o líder vai te chamar em breve.' };
  };








  let dup = null;
  let refRenovacao = null;
  if (membroId) {
    const { data: ativo } = await supabase.from('mem_grupo_membros')
      .select('id').eq('grupo_id', grupoId).eq('membro_id', membroId).is('saiu_em', null).is('deleted_at', null).limit(1);
    if (ativo && ativo.length) { dup = { tipo: 'membro_ativo' }; refRenovacao = ativo[0].id; }
    else {
      const { data: ped } = await supabase.from('mem_grupo_pedidos')
        .select('id').eq('grupo_id', grupoId).eq('membro_id', membroId).eq('status', 'pendente').is('deleted_at', null).limit(1);
      if (ped && ped.length) { dup = { tipo: 'pedido_pendente' }; refRenovacao = ped[0].id; }
    }
  }
  if (!dup && !confirmarNovo) {
    dup = await checarDuplicataInscricao(grupoId, { nome: nomeLimpo, cpf: cpfLimpo, telefone: pessoa.telefone, email: emailLimpo }, {
      ignorarPedidoIds: [principalId],
      ignorarMembroIds: [principalMembroId],
    });
  }

  if (dup) {


    if (dup.tipo === 'membro_ativo' && membroId) return jaExiste('membro_ativo', refRenovacao);









    if (souEu || confirmarNovo) return jaExiste(dup.tipo, refRenovacao);
    return {
      ok: false,
      status: 409,
      codigo: 'possivel_duplicado',
      onde: dup.tipo,
      error: dup.tipo === 'membro_ativo'
        ? 'Parece que você já participa deste grupo.'
        : 'Já recebemos um pedido parecido para este grupo.',
    };
  }

  let cadastroPendenteId = null;
  if (!membroId) {

    const { data: cad, error: eCad } = await supabase.from('mem_cadastros_pendentes').insert({
      nome: nomeLimpo,
      cpf: cpfLimpo,
      email: emailLimpo,
      telefone: telDigitos || null,
      data_nascimento: dataNascimento,
      genero: generoLimpo,
      foto_url: fotoUrl,
      endereco: enderecoLimpo,
      origem: 'qr_code',
      aceita_termos: pessoa.aceita_termos !== false,
      aceita_contato: true,
      whatsapp_optin: optin,
      whatsapp_optin_em: optin ? new Date().toISOString() : null,
      consentimento_texto: consentimentoTexto,
      status: 'pendente',
      ip_origem: ipInsc,
      user_agent: uaInsc,


      nao_vincular_fraco: confirmarNovo,
    }).select('id').single();
    if (eCad) {
      console.error('[public grupos inscrever] cadastro pendente:', eCad.message);
      return { ok: false, status: 500, error: 'Erro ao registrar cadastro.' };
    }
    cadastroPendenteId = cad.id;
  }

  await registrarObservacaoSegura({
    membroId, origem: 'grupos_formulario', origemId: cadastroPendenteId,
    nome: nomeLimpo, cpf: cpfLimpo, email: emailLimpo,
    telefone: pessoa.telefone, dataNascimento,
  });




  const obsPartes = [];
  if (confirmarNovo) obsPartes.push('[Verificar identidade] A pessoa confirmou que NÃO é o cadastro parecido já existente.');
  if (pessoa.observacao) obsPartes.push(String(pessoa.observacao).trim().slice(0, 400));
  const pedidoBase = {
    grupo_id: grupoId,
    nome: nomeLimpo,
    email: emailLimpo,
    telefone: telDigitos || null,
    origem,
    observacao: obsPartes.length ? obsPartes.join(' · ').slice(0, 500) : null,
    status: 'pendente',
  };
  if (membroId) pedidoBase.membro_id = membroId;
  else pedidoBase.cadastro_pendente_id = cadastroPendenteId;


  if (principalId) pedidoBase.casal_pedido_id = principalId;

  const { data: pedido, error: ePed } = await supabase.from('mem_grupo_pedidos').insert(pedidoBase).select('id').single();
  if (ePed) {



    if (ePed.code === '23505') return jaExiste('pedido_pendente');
    console.error('[public grupos inscrever] pedido:', ePed.message);
    return { ok: false, status: 500, error: 'Erro ao registrar pedido.' };
  }


  registrarEventoPedido(pedido.id, 'criado', { grupo: grupo.nome, origem });



  registrarConsentimentos({
    porta: 'grupos', refId: pedido.id, membroId,
    ip: ipInsc, userAgent: uaInsc,
    itens: [
      { tipo: 'termos_lgpd', aceito: true, texto: consentimentoTexto || undefined },
      { tipo: 'whatsapp', aceito: optin },
    ],
  }).catch((err) => console.error('[public grupos inscrever] consentimentos:', err.message));

  return {
    ok: true,
    criado: true,
    pedido_id: pedido.id,
    membro_id: membroId,
    cadastro_pendente_id: cadastroPendenteId,
    nome: nomeLimpo,
    telefone: telDigitos || null,
    email: emailLimpo,
    whatsapp_optin: optin,
  };
}




const CAMPO_CONJUGE = {
  nome_completo: 'conjuge.nome',
  telefone: 'conjuge.telefone',
  cpf: 'conjuge.cpf',
  email: 'conjuge.email',
  data_nascimento: 'conjuge.data_nascimento',
  sexo: 'conjuge.genero',
};
function primeiroErroConjuge(conjuge, cpfTitular) {
  const { erros } = validarCamposPadrao(conjuge || {}, {
    exigirCpf: true, exigirEmail: true, exigirNascimento: true, exigirSexo: true,
  });
  for (const [chave, campo] of Object.entries(CAMPO_CONJUGE)) {
    if (erros[chave]) return { campo, error: erros[chave] };
  }


  const cpfConjuge = soDigitos(conjuge?.cpf);
  if (cpfTitular && cpfConjuge && cpfTitular === cpfConjuge) {
    return { campo: 'conjuge.cpf', error: 'O CPF do cônjuge é o mesmo que você informou — confira os números.' };
  }


  if (conjuge?.aceita_termos !== true) {
    return { campo: 'conjuge.aceita_termos', error: 'Confirme que seu cônjuge está ciente e concorda com a inscrição.' };
  }
  return null;
}








router.post('/inscrever', async (req, res) => {
  try {
    const {
      grupo_id,
      nome,
      cpf,
      email,
      telefone,
      data_nascimento,
      genero,
      observacao,
      foto_url,
      aceita_termos,
      consentimento_texto,
      whatsapp_optin,
      website,
      qr,
      sou_eu,
      confirmar_novo,



      conjuge,
    } = req.body || {};

    if (website && String(website).trim() !== '') return res.status(201).json({ ok: true });



    if (!grupo_id) return res.status(400).json({ error: 'Grupo obrigatório.' });
    if (!nome || nome.trim().length < 3) return res.status(400).json({ error: 'Digite o nome completo.', campo: 'nome' });
    if (nome.trim().split(/\s+/).length < 2 || temAbreviacaoNome(nome)) {
      return res.status(400).json({ error: 'Escreva o nome completo, sem abreviações.', campo: 'nome' });
    }
    const telInscDigitos = soDigitos(telefone);
    if (telInscDigitos.length < 10 || telInscDigitos.length > 11) return res.status(400).json({ error: 'Digite um celular válido com DDD.', campo: 'telefone' });


    if (!cpf || soDigitos(cpf).length !== 11) return res.status(400).json({ error: 'Informe o CPF completo.', campo: 'cpf' });
    if (!cpfValido(cpf)) return res.status(400).json({ error: 'Este CPF não é válido — confira os números.', campo: 'cpf' });
    if (!email || !emailValido(email)) return res.status(400).json({ error: 'Informe um e-mail válido.', campo: 'email' });
    if (!aceita_termos) return res.status(400).json({ error: 'É necessário aceitar os termos.', campo: 'aceita_termos' });

    if (!data_nascimento || !/^\d{4}-\d{2}-\d{2}$/.test(String(data_nascimento))) {
      return res.status(400).json({ error: 'Informe a data de nascimento.', campo: 'data_nascimento' });
    }
    const nascDate = new Date(String(data_nascimento) + 'T12:00:00');
    if (Number.isNaN(nascDate.getTime())) {
      return res.status(400).json({ error: 'Data de nascimento inválida.', campo: 'data_nascimento' });
    }
    if (nascDate > new Date()) {
      return res.status(400).json({ error: 'A data de nascimento não pode estar no futuro.', campo: 'data_nascimento' });
    }
    if (nascDate.getFullYear() < 1900) {
      return res.status(400).json({ error: 'Confira o ano de nascimento.', campo: 'data_nascimento' });
    }
    const generoLimpo = ['masculino', 'feminino'].includes(String(genero || '').toLowerCase())
      ? String(genero).toLowerCase() : null;
    if (!generoLimpo) return res.status(400).json({ error: 'Marque o sexo (masculino ou feminino).', campo: 'genero' });

    const cpfLimpo = cpf ? soDigitos(cpf) : null;
    const emailLimpo = email.trim().toLowerCase();
    const fotoUrl = fotoUrlValida(foto_url) ? String(foto_url).slice(0, 1000) : null;


    const enderecoLimpo = req.body?.endereco ? String(req.body.endereco).trim().slice(0, 300) : null;
    const ipInsc = (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim() || req.ip || null;
    const uaInsc = (req.headers['user-agent'] || '').toString().slice(0, 500);


    const { data: grupo } = await supabase.from('mem_grupos')
      .select('id, nome, ativo, aceitando_inscricoes, modo_inscricao, status_temporada, temporada, lider_id, categoria, idade_min, idade_max, dia_semana, horario, recorrencia, local, endereco, complemento, bairro').eq('id', grupo_id).is('deleted_at', null).single();
    if (!grupo || !grupo.ativo) {
      return res.status(404).json({ error: 'Grupo não encontrado ou inativo.' });
    }





















    if (grupo.aceitando_inscricoes === false) {
      return res.status(403).json({
        error: 'Este grupo não está recebendo novas inscrições no momento.',
        codigo: 'inscricoes_fechadas',
      });
    }



    if (grupo.temporada && grupo.modo_inscricao !== 'sempre_aberto') {
      const { data: temporada } = await supabase.from('mem_temporadas')
        .select('inscricoes_abertas, label').eq('id', grupo.temporada).maybeSingle();
      if (!temporada?.inscricoes_abertas) {
        return res.status(403).json({
          error: 'As inscrições para esta temporada estão fechadas no momento. Aguarde a próxima abertura.',
          codigo: 'inscricoes_fechadas',
        });
      }
    }






















    const catLower = String(grupo.categoria || '').toLowerCase();
    if ((catLower === 'mulheres' && generoLimpo === 'masculino') || (catLower === 'homens' && generoLimpo === 'feminino')) {
      return res.status(422).json({
        codigo: 'grupo_incompativel',
        error: catLower === 'mulheres'
          ? 'Este é um grupo só de mulheres, então sua inscrição não pode seguir nele.'
          : 'Este é um grupo só de homens, então sua inscrição não pode seguir nele.',
      });
    }








    const querCasal = Boolean(conjuge && typeof conjuge === 'object' && ['casais', 'misto'].includes(catLower));
    const conjugeNome = querCasal ? String(conjuge.nome || '').trim() : null;
    if (querCasal) {
      const erroConj = primeiroErroConjuge(conjuge, cpfLimpo);
      if (erroConj) return res.status(400).json({ error: erroConj.error, campo: erroConj.campo });
    }

    const contexto = { ip: ipInsc, userAgent: uaInsc, origem: 'formulario_publico' };


    const rt = await processarPessoaPedido({
      grupo,
      pessoa: {
        nome, cpf: cpfLimpo, email: emailLimpo, telefone, endereco: enderecoLimpo,
        data_nascimento, genero: generoLimpo, observacao, foto_url: fotoUrl,
        whatsapp_optin, aceita_termos, consentimento_texto, sou_eu, confirmar_novo,
      },
      contexto,
    });
    if (!rt.ok) {


      const corpoErro = { error: rt.error };
      if (rt.codigo) corpoErro.codigo = rt.codigo;
      if (rt.onde) corpoErro.onde = rt.onde;
      if (rt.campo) corpoErro.campo = rt.campo;
      return res.status(rt.status || 500).json(corpoErro);
    }




    let rc = null;
    if (querCasal) {
      try {
        rc = await processarPessoaPedido({
          grupo,
          pessoa: {
            nome: conjuge.nome,
            cpf: conjuge.cpf,
            email: conjuge.email,
            telefone: conjuge.telefone,
            endereco: conjuge.endereco || null,
            data_nascimento: conjuge.data_nascimento,
            genero: conjuge.genero ?? conjuge.sexo,
            observacao: null,
            foto_url: null,


            whatsapp_optin: conjuge.whatsapp_optin === true,
            aceita_termos: true,
            consentimento_texto: conjuge.consentimento_texto || consentimento_texto,
          },
          contexto,
          principalId: rt.pedido_id || null,
          principalMembroId: rt.membro_id || null,
        });
      } catch (e) {
        console.error('[public grupos inscrever conjuge]', e.message);
        rc = { ok: false, error: 'Não conseguimos registrar a inscrição do seu cônjuge agora. Fale com a equipe de Grupos.' };
      }



      if (rc && rc.ok && rc.pedido_id && rt.pedido_id) {
        const { error: eLink } = await supabase.from('mem_grupo_pedidos')
          .update({ casal_pedido_id: rc.pedido_id }).eq('id', rt.pedido_id);
        if (eLink) console.error('[public grupos inscrever] vínculo de casal:', eLink.message);
      }
    }




    const criados = [];
    if (rt.criado) criados.push({ nome: rt.nome, telefone: rt.telefone, email: rt.email, optin: rt.whatsapp_optin, pedidoId: rt.pedido_id });
    if (rc && rc.ok && rc.criado) criados.push({ nome: rc.nome, telefone: rc.telefone, email: rc.email, optin: rc.whatsapp_optin, pedidoId: rc.pedido_id });

    if (criados.length) {
      const nomes = criados.map(p => p.nome).join(' e ');
      const ehCasal = criados.length > 1;












      try {













        const contatoDe = (p) => contatoParaLider({
          telefone: p.telefone,
          email: p.email,
          telefoneExibicao: telefoneExibicao(p.telefone),
        });
        await notificarLiderNovoPedido({
          grupo,
          pedidoId: criados[0].pedidoId,
          pessoa: {
            nome: nomes,
            telefone: criados[0].telefone || null,
            email: criados[0].email || null,
            contato: ehCasal
              ? criados.map(p => `${(p.nome || '').split(/\s+/)[0]}: ${contatoDe(p)}`).join(' · ')
              : contatoDe(criados[0]),
          },
        });








        for (const p of criados) {
          if (!p.optin) continue;
          await enviarInscricaoConfirmada({
            telefone: p.telefone,
            nome: p.nome,
            grupoNome: grupo.nome,
            pedidoId: p.pedidoId,
          });
        }
      } catch (err) { console.error('[public grupos inscrever wpp]', err.message); }














      try {
        await avisarPedidoNovoNoApp({
          grupoId: grupo.id,
          pedidoId: criados[0].pedidoId,
          grupoNome: grupo.nome,
          pessoaNome: nomes,
        });
      } catch (err) { console.warn('[public grupos] aviso app:', err.message); }

      (async () => {
        try {
          const donos = await donosDoGrupo(grupo.id);
          if (!donos.length) return;
          await notificar({
            modulo: 'grupos',
            tipo: 'pedido_grupo',
            titulo: `Novo pedido para ${grupo.nome}`,
            mensagem: ehCasal
              ? `${nomes} (casal) pediram para entrar no grupo via QR code.`
              : `${nomes} pediu para entrar no grupo via QR code.`,
            link: '/grupos',
            severidade: 'aviso',
            chaveDedup: `pedido_grupo_${criados[0].pedidoId}`,
            targetIds: donos,
          });
        } catch (err) { console.error('[public grupos inscrever notify]', err.message); }
      })();
    }



    {
      const qrSlug = require('../utils/campanhaTemplates').qrSlugValido(qr);
      const idsQr = [rt?.criado ? rt.pedido_id : null, (rc && rc.ok && rc.criado) ? rc.pedido_id : null].filter(Boolean);
      if (qrSlug && idsQr.length) {
        const { error: eQr } = await supabase.from('mem_grupo_pedidos').update({ qr_slug: qrSlug }).in('id', idsQr);
        if (eQr && eQr.code !== '42703') console.warn('[publicGrupos] qr_slug:', eQr.message);
      }
    }


    const corpo = { ok: true };
    if (rt.criado) corpo.pedido_id = rt.pedido_id;
    if (rt.ja_membro) { corpo.ja_membro = true; corpo.renovado = rt.renovado === true; corpo.mensagem = rt.mensagem; }
    if (rt.ja_pedido) { corpo.ja_pedido = true; corpo.mensagem = rt.mensagem; }
    if (querCasal) {
      corpo.casal = true;
      corpo.conjuge = (rc && rc.ok)
        ? {
            ok: true,
            nome: conjugeNome,
            ja_membro: rc.ja_membro === true,
            ja_pedido: rc.ja_pedido === true,
            mensagem: rc.mensagem || null,
            pedido_id: rc.criado ? rc.pedido_id : null,
            criado: rc.criado === true,
          }





        : (rc && rc.codigo === 'possivel_duplicado')
          ? {
              ok: true,
              nome: conjugeNome,
              ja_membro: false,
              ja_pedido: true,
              criado: false,
              mensagem: 'Já havia um pedido parecido para este grupo no nome do seu cônjuge — o líder vai conferir na aprovação.',
              pedido_id: null,
            }
          : {
              ok: false,
              nome: conjugeNome,
              error: (rc && rc.error) || 'Não conseguimos registrar a inscrição do seu cônjuge.',
              codigo: (rc && rc.codigo) || null,
            };
    }
    res.status(rt.criado ? 201 : 200).json(corpo);
  } catch (e) {
    console.error('[public grupos inscrever]', e.message);
    res.status(500).json({ error: 'Erro ao processar inscrição.' });
  }
});





function validarCandidatoLider(c, { prefixo = '', exigirEndereco = false } = {}) {
  const campo = (k) => `${prefixo}${k}`;
  const nome = String(c?.nome || '').trim();
  if (!nome || nome.length < 3) return { erro: { error: 'Digite o nome completo.', campo: campo('nome') } };
  if (nome.split(/\s+/).length < 2 || temAbreviacaoNome(nome)) {
    return { erro: { error: 'Escreva o nome completo, sem abreviações.', campo: campo('nome') } };
  }
  const telDigitos = tirarCodigoPaisTelefone(soDigitos(c?.telefone));
  if (telDigitos.length < 10 || telDigitos.length > 11) {
    return { erro: { error: 'Digite um celular válido com DDD.', campo: campo('telefone') } };
  }
  if (!c?.cpf || soDigitos(c.cpf).length !== 11) return { erro: { error: 'Informe o CPF completo.', campo: campo('cpf') } };
  if (!cpfValido(c.cpf)) return { erro: { error: 'Este CPF não é válido — confira os números.', campo: campo('cpf') } };
  if (!c?.email || !emailValido(c.email)) return { erro: { error: 'Informe um e-mail válido.', campo: campo('email') } };
  const dataNascimento = c?.data_nascimento;
  if (!dataNascimento || !/^\d{4}-\d{2}-\d{2}$/.test(String(dataNascimento))) {
    return { erro: { error: 'Informe a data de nascimento.', campo: campo('data_nascimento') } };
  }
  const nascDate = new Date(String(dataNascimento) + 'T12:00:00');
  if (Number.isNaN(nascDate.getTime())) return { erro: { error: 'Data de nascimento inválida.', campo: campo('data_nascimento') } };
  if (nascDate > new Date()) return { erro: { error: 'A data de nascimento não pode estar no futuro.', campo: campo('data_nascimento') } };
  if (nascDate.getFullYear() < 1900) return { erro: { error: 'Confira o ano de nascimento.', campo: campo('data_nascimento') } };
  const generoLimpo = ['masculino', 'feminino'].includes(String(c?.genero || '').toLowerCase())
    ? String(c.genero).toLowerCase() : null;
  if (!generoLimpo) return { erro: { error: 'Marque o sexo (masculino ou feminino).', campo: campo('genero') } };
  if (exigirEndereco) {
    if (!c?.endereco || String(c.endereco).trim().length < 5) {
      return { erro: { error: 'Como anfitrião, informe o endereço onde o grupo aconteceria.', campo: campo('endereco') } };
    }
    if (!c?.bairro || String(c.bairro).trim().length < 2) {
      return { erro: { error: 'Como anfitrião, informe o bairro.', campo: campo('bairro') } };
    }
  }
  return {
    dados: {
      nome,
      telefone: c?.telefone || null,
      telDigitos,
      cpfLimpo: soDigitos(c.cpf),
      emailLimpo: String(c.email).trim().toLowerCase(),
      dataNascimento,
      generoLimpo,
      fotoUrl: fotoUrlValida(c?.foto_url) ? String(c.foto_url).slice(0, 1000) : null,
      optin: c?.whatsapp_optin === true,
    },
  };
}








async function efetivarCandidaturaLider(p) {
  const {
    dados, papel, motivacao, bairro, endereco, consentimentoTexto,
    ip, userAgent, ignorarInscricaoIds = [],
  } = p;
  const { nome, telefone, telDigitos, cpfLimpo, emailLimpo, dataNascimento, generoLimpo, fotoUrl, optin } = dados;



  const achado = await acharMembroGuardado({
    cpf: cpfLimpo, email: emailLimpo, telefone, nome,
    dataNascimento: dataNascimento || null,
  });
  const membroId = achado?.membro_id || null;



  let cadastrosMesmoCpf = [];
  if (!membroId) {
    const { data: cads } = await supabase.from('mem_cadastros_pendentes')
      .select('id').eq('cpf', cpfLimpo).is('deleted_at', null).limit(100);
    cadastrosMesmoCpf = (cads || []).map(c => c.id);
  }
  const { data: abertas } = await supabase.from('mem_lider_inscricoes')
    .select('id, membro_id, cadastro_pendente_id, telefone')
    .in('status', ['pendente', 'aceito']).is('deleted_at', null).limit(1000);
  const jaTem = (abertas || []).some(i =>
    !ignorarInscricaoIds.includes(i.id)
    && ((membroId && i.membro_id === membroId)
      || (telDigitos && soDigitos(i.telefone) === telDigitos)
      || (i.cadastro_pendente_id && cadastrosMesmoCpf.includes(i.cadastro_pendente_id))));
  if (jaTem) return { ja_inscrito: true };


  if (membroId && (fotoUrl || generoLimpo || dataNascimento)) {
    const { data: mem } = await supabase.from('mem_membros').select('foto_url, genero, data_nascimento').eq('id', membroId).maybeSingle();
    if (mem) {
      const upd = {};
      if (fotoUrl && !mem.foto_url) upd.foto_url = fotoUrl;
      if (generoLimpo && !mem.genero) upd.genero = generoLimpo;
      if (dataNascimento && !mem.data_nascimento) upd.data_nascimento = dataNascimento;
      if (Object.keys(upd).length) await supabase.from('mem_membros').update(upd).eq('id', membroId);
    }
  }


  if (membroId && optin) {
    try {
      await supabase.from('mem_membros')
        .update({ whatsapp_optin: true, whatsapp_optin_em: new Date().toISOString() })
        .eq('id', membroId).is('deleted_at', null);
    } catch (e) { console.warn('[public grupos inscrever-lider] optin membro:', e.message); }
  }

  let cadastroPendenteId = null;
  if (!membroId) {
    const { data: cad, error: eCad } = await supabase.from('mem_cadastros_pendentes').insert({
      nome,
      cpf: cpfLimpo,
      email: emailLimpo,
      telefone: telefone || null,
      data_nascimento: dataNascimento || null,
      genero: generoLimpo,
      foto_url: fotoUrl,
      endereco: endereco ? String(endereco).trim().slice(0, 300) : null,
      bairro: bairro ? String(bairro).trim().slice(0, 120) : null,



      origem: 'qr_code',
      aceita_termos: true,
      aceita_contato: true,
      whatsapp_optin: optin,
      whatsapp_optin_em: optin ? new Date().toISOString() : null,
      consentimento_texto: consentimentoTexto || null,
      status: 'pendente',
      ip_origem: ip,
      user_agent: userAgent,
    }).select('id').single();
    if (eCad) {
      console.error('[public grupos inscrever-lider] cadastro pendente:', eCad.message);
      const err = new Error('Erro ao registrar cadastro.');
      err.publico = 'Erro ao registrar cadastro.';
      throw err;
    }
    cadastroPendenteId = cad.id;
  }

  await registrarObservacaoSegura({
    membroId, origem: 'grupos_lider_formulario', origemId: cadastroPendenteId,
    nome, cpf: cpfLimpo, email: emailLimpo,
    telefone, dataNascimento: dataNascimento || null,
  });

  const { data: insc, error: eInsc } = await supabase.from('mem_lider_inscricoes').insert({
    membro_id: membroId,
    cadastro_pendente_id: membroId ? null : cadastroPendenteId,
    nome,
    telefone: telefone || null,
    email: emailLimpo,
    bairro: bairro ? String(bairro).trim().slice(0, 120) : null,
    endereco: endereco ? String(endereco).trim().slice(0, 300) : null,
    quer_lider: papel.querLider,
    quer_anfitriao: papel.querAnfitriao,
    motivacao: motivacao ? String(motivacao).trim().slice(0, 500) : null,
    status: 'pendente',
    origem: 'formulario_publico',
  }).select('id').single();
  if (eInsc) {
    console.error('[public grupos inscrever-lider] inscricao:', eInsc.message);
    const err = new Error('Erro ao registrar inscrição.');
    err.publico = 'Erro ao registrar inscrição.';
    throw err;
  }



  registrarConsentimentos({
    porta: 'grupos_lider', refId: insc.id, membroId,
    ip, userAgent,
    itens: [
      { tipo: 'termos_lgpd', aceito: true, texto: consentimentoTexto || undefined },
      { tipo: 'whatsapp', aceito: optin },
    ],
  }).catch((err) => console.error('[public grupos inscrever-lider] consentimentos:', err.message));

  return { inscricaoId: insc.id, membroId };
}











router.post('/inscrever-lider', async (req, res) => {
  try {
    const {
      nome, cpf, email, telefone, data_nascimento, genero,
      quer_lider, quer_anfitriao, motivacao, bairro, endereco,
      foto_url, aceita_termos, consentimento_texto, whatsapp_optin,
      conjuge, consentimento_conjuge_texto,
      website,
    } = req.body || {};

    if (website && String(website).trim() !== '') return res.status(201).json({ ok: true });

    const vTitular = validarCandidatoLider(
      { nome, cpf, email, telefone, data_nascimento, genero, foto_url, whatsapp_optin, endereco, bairro },
      { exigirEndereco: quer_anfitriao === true },
    );
    if (vTitular.erro) return res.status(400).json(vTitular.erro);
    if (!aceita_termos) return res.status(400).json({ error: 'É necessário aceitar os termos.', campo: 'aceita_termos' });

    const querLider = quer_lider === true;
    const querAnfitriao = quer_anfitriao === true;
    if (!querLider && !querAnfitriao) {
      return res.status(400).json({ error: 'Marque pelo menos uma opção: líder e/ou anfitrião.', campo: 'papel' });
    }



    const querCasal = Boolean(conjuge && typeof conjuge === 'object');
    let vConj = null;
    if (querCasal) {
      vConj = validarCandidatoLider(conjuge, { prefixo: 'conjuge.' });
      if (vConj.erro) return res.status(400).json(vConj.erro);
      if (vConj.dados.cpfLimpo === vTitular.dados.cpfLimpo) {
        return res.status(400).json({ error: 'O CPF do cônjuge é o mesmo do titular — confira os números.', campo: 'conjuge.cpf' });
      }


      if (conjuge.aceita_termos !== true) {
        return res.status(400).json({ error: 'Confirme que seu cônjuge está ciente e concorda com a inscrição.', campo: 'conjuge.aceita_termos' });
      }
    }

    const ip = (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim() || req.ip || null;
    const userAgent = (req.headers['user-agent'] || '').toString().slice(0, 500);
    const consentimentoTexto = consentimento_texto ? String(consentimento_texto).slice(0, 2000) : null;
    const papel = { querLider, querAnfitriao };
    const base = { papel, motivacao, bairro, endereco, ip, userAgent };

    const rt = await efetivarCandidaturaLider({ ...base, dados: vTitular.dados, consentimentoTexto });
    if (rt.ja_inscrito && !querCasal) {
      return res.json({ ok: true, ja_inscrito: true, mensagem: 'Já recebemos a sua inscrição — a equipe de Grupos vai falar com você em breve.' });
    }


    let rc = null;
    if (querCasal) {
      try {
        rc = await efetivarCandidaturaLider({
          ...base,
          dados: vConj.dados,
          consentimentoTexto: consentimento_conjuge_texto
            ? String(consentimento_conjuge_texto).slice(0, 2000) : consentimentoTexto,
          ignorarInscricaoIds: rt.inscricaoId ? [rt.inscricaoId] : [],
        });
      } catch (e) {
        console.error('[public grupos inscrever-lider] conjuge:', e.message);
        rc = { erro: e.publico || 'Não conseguimos registrar a inscrição do seu cônjuge.' };
      }



      if (rt.inscricaoId && rc?.inscricaoId) {
        try {
          await supabase.from('mem_lider_inscricoes')
            .update({ casal_inscricao_id: rc.inscricaoId }).eq('id', rt.inscricaoId);
          await supabase.from('mem_lider_inscricoes')
            .update({ casal_inscricao_id: rt.inscricaoId }).eq('id', rc.inscricaoId);
        } catch (e) { console.warn('[public grupos inscrever-lider] casal vínculo:', e.message); }
      }
    }



    const inscricaoIdAviso = rt.inscricaoId || rc?.inscricaoId || null;
    if (inscricaoIdAviso) {
      (async () => {
        try {
          const papelTxt = [querLider && 'líder', querAnfitriao && 'anfitrião'].filter(Boolean).join(' e ');
          const nomes = rc?.inscricaoId
            ? `${vTitular.dados.nome} e ${vConj.dados.nome} (casal)`
            : vTitular.dados.nome;
          await notificar({
            modulo: 'grupos',
            tipo: 'lider_inscricao',
            titulo: 'Nova inscrição de líder/anfitrião',
            mensagem: `${nomes} se inscreveu como ${papelTxt}.`,
            link: '/grupos?tab=entrada',
            severidade: 'aviso',
            chaveDedup: `lider_inscricao_${inscricaoIdAviso}`,
          });
        } catch (err) { console.error('[public grupos inscrever-lider notify]', err.message); }
      })();
    }

    const corpo = { ok: true };
    if (rt.inscricaoId) corpo.inscricao_id = rt.inscricaoId;
    if (rt.ja_inscrito) { corpo.ja_inscrito = true; corpo.mensagem = 'Já recebemos a sua inscrição — a equipe de Grupos vai falar com você em breve.'; }
    if (querCasal) {
      corpo.conjuge = rc?.erro
        ? { ok: false, nome: vConj.dados.nome, error: rc.erro }
        : { ok: true, nome: vConj.dados.nome, ja_inscrito: rc?.ja_inscrito === true, inscricao_id: rc?.inscricaoId || null };
    }
    res.status(rt.inscricaoId || rc?.inscricaoId ? 201 : 200).json(corpo);
  } catch (e) {
    console.error('[public grupos inscrever-lider]', e.message);
    res.status(500).json({ error: e.publico || 'Erro ao processar inscrição.' });
  }
});

























async function carregarParCasal(pedido) {
  if (!pedido || !pedido.id) return null;
  const { data: vinc, error } = await supabase.from('mem_grupo_pedidos')
    .select('casal_pedido_id').eq('id', pedido.id).maybeSingle();
  if (error || !vinc || !vinc.casal_pedido_id) return null;
  const { data: par } = await supabase.from('mem_grupo_pedidos')
    .select('id, nome, telefone, email, status, grupo_id, casal_pedido_id')
    .eq('id', vinc.casal_pedido_id).is('deleted_at', null).maybeSingle();
  if (!par || par.grupo_id !== pedido.grupo_id) return null;




  if (par.casal_pedido_id && par.casal_pedido_id !== pedido.id) return null;
  return par;
}















let _tempAbertaCache = { em: 0, valor: false };
async function haTemporadaAberta() {
  if (Date.now() - _tempAbertaCache.em < 60_000) return _tempAbertaCache.valor;
  try {
    const { data, error } = await supabase.from('mem_temporadas')
      .select('id').eq('inscricoes_abertas', true).limit(1);
    if (error) throw error;
    _tempAbertaCache = { em: Date.now(), valor: !!(data && data.length) };
  } catch (e) {
    console.error('[public grupos temporada-aberta]', e.message);
    return false;
  }
  return _tempAbertaCache.valor;
}



router.get('/pedido/por-token', async (req, res) => {
  try {
    const payload = verificarToken(req.query.token, 'aprov', Date.now(),
      { aceitarExpirado: await haTemporadaAberta() });
    if (!payload) return res.status(401).json({ error: 'Link inválido ou expirado. Você ainda pode aprovar pelo sistema em /grupos.' });

    const { data: pedido, error: ePed } = await supabase.from('mem_grupo_pedidos')
      .select('id, nome, telefone, email, observacao, status, created_at, motivo_rejeicao, grupo_id, mem_grupos(id, nome, codigo, bairro, dia_semana, horario, recorrencia, local, endereco, complemento, capacidade, lider_id)')
      .eq('id', payload.p).is('deleted_at', null).maybeSingle();
    if (ePed) throw ePed;
    if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado.' });

    const grupo = pedido.mem_grupos || {};


    if (!payload.l || grupo.lider_id !== payload.l) {
      return res.status(403).json({ error: 'A liderança deste grupo mudou — este link não vale mais. O novo líder decide pelo sistema em /grupos.' });
    }
    delete grupo.lider_id;
    let membrosAtivos = null;
    if (grupo.id) {
      const { count } = await supabase.from('mem_grupo_membros')
        .select('id', { count: 'exact', head: true })
        .eq('grupo_id', grupo.id).is('saiu_em', null).is('deleted_at', null);
      membrosAtivos = count || 0;
    }



    const par = await carregarParCasal(pedido);

    res.json({
      pedido: {
        id: pedido.id, nome: pedido.nome, telefone: pedido.telefone, email: pedido.email,
        observacao: pedido.observacao, status: pedido.status, created_at: pedido.created_at,
        motivo_rejeicao: pedido.motivo_rejeicao,
      },
      casal: par ? {
        nome: par.nome, telefone: par.telefone, email: par.email, status: par.status,
      } : null,
      grupo: {
        nome: grupo.nome, codigo: grupo.codigo, bairro: grupo.bairro,
        quando: formatarQuando(grupo), onde: formatarOnde(grupo),
        capacidade: grupo.capacidade ?? null, membros_ativos: membrosAtivos,
      },
    });
  } catch (e) {
    console.error('[public grupos pedido-por-token]', e.message);
    res.status(500).json({ error: 'Erro ao carregar pedido.' });
  }
});


router.post('/aprovar', async (req, res) => {
  try {
    const { token, acao, motivo } = req.body || {};



    const payload = verificarToken(token, 'aprov', Date.now(),
      { aceitarExpirado: await haTemporadaAberta() });
    if (!payload) return res.status(401).json({ error: 'Link inválido ou expirado. Você ainda pode decidir pelo sistema em /grupos.' });



    if (!['aprovar', 'rejeitar', 'sem_contato'].includes(acao)) return res.status(400).json({ error: 'Ação inválida.' });

    const { data: pedido, error: ePed } = await supabase.from('mem_grupo_pedidos')
      .select('id, status, grupo_id, membro_id, nome').eq('id', payload.p).is('deleted_at', null).maybeSingle();
    if (ePed) throw ePed;
    if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado.' });
    if (pedido.status !== 'pendente') {

      const STATUS_TXT = {
        aprovado: 'aprovado',
        rejeitado: 'recusado',
        devolvido: 'recusado — a equipe de grupos está cuidando do próximo passo',
        encaminhado: 'levado pela equipe de grupos, que sugeriu outro grupo à pessoa',
        cancelado: 'encerrado',
      };
      return res.status(409).json({ error: `Este pedido já foi ${STATUS_TXT[pedido.status] || pedido.status}.`, status: pedido.status });
    }




    let liderNome = 'Líder do grupo';
    const { data: grupo } = await supabase.from('mem_grupos')
      .select('id, nome, lider_id').eq('id', pedido.grupo_id).is('deleted_at', null).maybeSingle();
    if (!payload.l || !grupo || grupo.lider_id !== payload.l) {
      return res.status(403).json({ error: 'A liderança deste grupo mudou — este link não vale mais. O novo líder decide pelo sistema em /grupos.' });
    }
    if (grupo.lider_id) {
      const { data: lider } = await supabase.from('mem_membros')
        .select('nome').eq('id', grupo.lider_id).maybeSingle();
      if (lider?.nome) liderNome = lider.nome;
    }
    const decididoPorNome = `${liderNome} (link WhatsApp)`;



    const par = await carregarParCasal(pedido);

    if (acao === 'aprovar') {


      const { aprovarPedidoCore } = require('./grupos');
      const r = await aprovarPedidoCore(pedido.id, { userId: null, name: decididoPorNome });
      if (!r.ok) return res.status(r.code).json({ error: r.error });





      let casal = null;
      if (par) {
        if (par.status === 'pendente') {
          try {
            const rp = await aprovarPedidoCore(par.id, { userId: null, name: decididoPorNome });
            casal = rp.ok
              ? { nome: par.nome, ok: true, status: 'aprovado' }
              : { nome: par.nome, ok: false, status: par.status, error: rp.error };
          } catch (e) {
            console.error('[public grupos aprovar casal]', e.message);
            casal = { nome: par.nome, ok: false, status: par.status, error: 'Não foi possível aprovar o cônjuge agora — faça pelo sistema em /grupos.' };
          }
        } else {
          casal = { nome: par.nome, ok: par.status === 'aprovado', status: par.status };
        }
      }
      return res.json({ ok: true, acao: 'aprovado', casal });
    }











    const semContato = acao === 'sem_contato';
    const novoStatus = semContato ? 'sem_contato' : 'devolvido';
    const tipoEvento = semContato ? 'sem_contato_lider' : 'recusado_lider';


    const motivoInterno = (!semContato && motivo) ? String(motivo).trim().slice(0, 500) : null;
    const { data: claimed } = await supabase.from('mem_grupo_pedidos').update({
      status: novoStatus,
      motivo_rejeicao: motivoInterno,
      decidido_por: null,
      decidido_por_nome: decididoPorNome,
      decidido_em: new Date().toISOString(),
    }).eq('id', pedido.id).eq('status', 'pendente').select('id');
    if (!claimed || !claimed.length) {
      return res.status(409).json({ error: 'Este pedido já foi decidido.', status: 'decidido' });
    }

    registrarEventoPedido(pedido.id, tipoEvento, { motivo_interno: motivoInterno }, decididoPorNome);




    let casal = null;
    if (par) {
      if (par.status === 'pendente') {
        const { data: parClaimed } = await supabase.from('mem_grupo_pedidos').update({
          status: novoStatus,
          motivo_rejeicao: motivoInterno,
          decidido_por: null,
          decidido_por_nome: decididoPorNome,
          decidido_em: new Date().toISOString(),
        }).eq('id', par.id).eq('status', 'pendente').select('id');
        if (parClaimed && parClaimed.length) {
          registrarEventoPedido(par.id, tipoEvento, { motivo_interno: motivoInterno, casal: true }, decididoPorNome);
          casal = { nome: par.nome, ok: true, status: novoStatus };
        } else {
          casal = { nome: par.nome, ok: false, status: 'decidido' };
        }
      } else {
        casal = { nome: par.nome, ok: false, status: par.status };
      }
    }






    (async () => {
      try {
        const nomesTriagem = casal && casal.ok ? `${pedido.nome} e ${casal.nome} (casal)` : pedido.nome;
        const alvo = casal && casal.ok ? 'eles' : 'a pessoa';
        await notificar({
          modulo: 'grupos',
          tipo: semContato ? 'pedido_sem_contato' : 'pedido_devolvido',
          titulo: semContato
            ? `Sem contato — o líder não conseguiu falar: ${nomesTriagem}`
            : `Pedido devolvido pra triagem: ${nomesTriagem}`,
          mensagem: semContato
            ? `O líder de ${grupo?.nome || 'um grupo'} tentou falar com ${alvo} e não conseguiu. Não é recusa — tente por outro canal ou encerre o pedido.`
            : `O líder de ${grupo?.nome || 'um grupo'} recusou o pedido${casal && casal.ok ? ' do casal' : ''}${motivoInterno ? ` (motivo interno: ${motivoInterno.slice(0, 200)})` : ''}. Sugira outro grupo pra ${casal && casal.ok ? 'eles' : 'pessoa'} ou rejeite de vez.`,
          link: '/grupos?tab=entrada',
          severidade: 'aviso',
          chaveDedup: `pedido_${semContato ? 'sem_contato' : 'devolvido'}_${pedido.id}`,
        });
      } catch (err) { console.error('[public grupos recusar notify]', err.message); }
    })();

    res.json({ ok: true, acao: semContato ? 'sem_contato' : 'rejeitado', casal });
  } catch (e) {
    console.error('[public grupos aprovar]', e.message);
    res.status(500).json({ error: 'Erro ao processar decisão.' });
  }
});











router.get('/pedido/sugestao', async (req, res) => {
  try {
    const payload = verificarToken(req.query.token, 'suges');
    if (!payload) return res.status(401).json({ error: 'Link inválido ou expirado.' });

    const { data: pedido } = await supabase.from('mem_grupo_pedidos')
      .select('*, mem_grupos(nome)')
      .eq('id', payload.p).is('deleted_at', null).maybeSingle();
    if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado.' });

    const { data: sugerido } = await supabase.from('mem_grupos')
      .select('id, nome, codigo, bairro, dia_semana, horario, recorrencia, local, endereco, complemento, capacidade, ativo, aceitando_inscricoes')
      .eq('id', payload.g).is('deleted_at', null).maybeSingle();
    if (!sugerido || !sugerido.ativo) {
      return res.status(410).json({ error: 'O grupo sugerido não está mais disponível. Seu pedido original continua valendo.' });
    }




    let pessoa = { nome: pedido.nome || null, telefone: pedido.telefone || null, email: pedido.email || null, data_nascimento: null, genero: null };
    try {
      if (pedido.membro_id) {
        const { data: m } = await supabase.from('mem_membros')
          .select('nome, telefone, email, data_nascimento, genero').eq('id', pedido.membro_id).maybeSingle();
        if (m) pessoa = { nome: m.nome || pessoa.nome, telefone: m.telefone || pessoa.telefone, email: m.email || pessoa.email, data_nascimento: m.data_nascimento || null, genero: m.genero || null };
      } else if (pedido.cadastro_pendente_id) {
        const { data: cadp } = await supabase.from('mem_cadastros_pendentes')
          .select('nome, telefone, email, data_nascimento, genero').eq('id', pedido.cadastro_pendente_id).maybeSingle();
        if (cadp) pessoa = { nome: cadp.nome || pessoa.nome, telefone: cadp.telefone || pessoa.telefone, email: cadp.email || pessoa.email, data_nascimento: cadp.data_nascimento || null, genero: cadp.genero || null };
      }
    } catch (e) { console.error('[public grupos sugestao pessoa]', e.message); }

    res.json({
      pedido: {
        nome: pedido.nome,
        status: pedido.status,
        grupo_original: pedido.mem_grupos?.nome || null,

        resolvido_em_outro: Boolean(pedido.resolvido_grupo_id),
      },
      pessoa,
      grupo: {
        nome: sugerido.nome, codigo: sugerido.codigo, bairro: sugerido.bairro,




        quando: formatarQuando(sugerido), onde: ondePublicoGrupo(sugerido),
      },
    });
  } catch (e) {
    console.error('[public grupos sugestao]', e.message);
    res.status(500).json({ error: 'Erro ao carregar sugestão.' });
  }
});


router.post('/sugestao/aceitar', async (req, res) => {
  try {
    const payload = verificarToken(req.body?.token, 'suges');
    if (!payload) return res.status(401).json({ error: 'Link inválido ou expirado.' });

    const { data: pedido } = await supabase.from('mem_grupo_pedidos')
      .select('id, status, grupo_id, nome').eq('id', payload.p).is('deleted_at', null).maybeSingle();
    if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado.' });


    if (!['pendente', 'devolvido', 'encaminhado'].includes(pedido.status)) {
      return res.status(409).json({ error: `Este pedido já foi ${pedido.status}.`, status: pedido.status });
    }

    const { data: sugerido } = await supabase.from('mem_grupos')
      .select('id, nome, ativo, aceitando_inscricoes, modo_inscricao').eq('id', payload.g).is('deleted_at', null).maybeSingle();
    if (!sugerido || !sugerido.ativo || sugerido.aceitando_inscricoes === false || sugerido.modo_inscricao === 'fechado') {



      return res.status(410).json({ error: 'O grupo sugerido não está mais disponível. Seu pedido original continua valendo.' });
    }




    const { error: eMove } = await supabase.from('mem_grupo_pedidos')
      .update({ grupo_id: payload.g, status: 'pendente' })
      .eq('id', pedido.id).in('status', ['pendente', 'devolvido', 'encaminhado']);
    if (eMove) {
      if (eMove.code === '23505') {
        return res.status(409).json({ error: 'Você já tem um pedido para esse grupo — o líder vai te responder por lá.' });
      }
      throw eMove;
    }





    const reverterMove = () => supabase.from('mem_grupo_pedidos')
      .update({ grupo_id: pedido.grupo_id, status: pedido.status }).eq('id', pedido.id).eq('status', 'pendente');

    const { aprovarPedidoCore } = require('./grupos');
    let r;
    try {
      r = await aprovarPedidoCore(pedido.id, { userId: null, name: 'Aceite da pessoa (sugestão de grupo)' });
    } catch (e) {
      await reverterMove().then(() => {}, () => {});
      throw e;
    }
    if (!r.ok) {



      await reverterMove();
      return res.status(r.code).json({ error: r.error });
    }



    let grupoFinal = sugerido.nome;
    if (r.grupo_id && r.grupo_id !== payload.g) {
      const { data: real } = await supabase.from('mem_grupos')
        .select('nome').eq('id', r.grupo_id).maybeSingle();
      if (real?.nome) grupoFinal = real.nome;
    }

    res.json({ ok: true, grupo: grupoFinal });
  } catch (e) {
    console.error('[public grupos sugestao aceitar]', e.message);
    res.status(500).json({ error: 'Erro ao processar aceite.' });
  }
});











function ultimoDiaDoMes(m) {
  const [ano, mes] = String(m || '').split('-').map(Number);
  if (!ano || !mes || mes < 1 || mes > 12) return null;
  const dia = new Date(ano, mes, 0).getDate();
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}


async function contextoFrequencia(token) {
  const payload = verificarToken(token, 'freq');
  if (!payload) return { erro: { status: 401, msg: 'Link inválido ou expirado.' } };
  const dataEncontro = ultimoDiaDoMes(payload.m);
  if (!dataEncontro) return { erro: { status: 400, msg: 'Mês inválido no link.' } };
  const { data: grupo, error } = await supabase.from('mem_grupos')
    .select('id, nome, lider_id, ativo').eq('id', payload.p).is('deleted_at', null).maybeSingle();
  if (error) throw error;
  if (!grupo || !grupo.ativo) return { erro: { status: 404, msg: 'Grupo não encontrado.' } };
  if (!payload.l || grupo.lider_id !== payload.l) {
    return { erro: { status: 403, msg: 'A liderança deste grupo mudou — este link não vale mais.' } };
  }
  return { payload, grupo, dataEncontro };
}



router.get('/grupo/frequencia', async (req, res) => {
  try {
    const ctx = await contextoFrequencia(req.query.token);
    if (ctx.erro) return res.status(ctx.erro.status).json({ error: ctx.erro.msg });
    const { payload, grupo, dataEncontro } = ctx;

    const { data: vinculos } = await supabase.from('mem_grupo_membros')
      .select('membro_id, mem_membros!inner(id, nome, foto_url)')
      .eq('grupo_id', grupo.id).is('saiu_em', null).is('deleted_at', null)
      .limit(1000);


    const { data: encontro } = await supabase.from('mem_grupo_encontros')
      .select('id').eq('grupo_id', grupo.id).eq('data', dataEncontro).maybeSingle();
    let presentes = [];
    if (encontro) {
      const { data: pres } = await supabase.from('mem_grupo_encontro_presencas')
        .select('membro_id').eq('encontro_id', encontro.id).eq('presente', true);
      presentes = (pres || []).map(p => p.membro_id);
    }

    res.json({
      grupo: { nome: grupo.nome },
      mes: payload.m,
      mes_rotulo: rotuloMes(payload.m),
      ja_salvo: !!encontro,
      membros: (vinculos || [])
        .map(v => ({
          id: v.mem_membros.id,
          nome: v.mem_membros.nome,
          foto_url: v.mem_membros.foto_url || null,
          presente: presentes.includes(v.mem_membros.id),
        }))
        .sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR')),
    });
  } catch (e) {
    console.error('[public grupos frequencia get]', e.message);
    res.status(500).json({ error: 'Erro ao carregar o grupo.' });
  }
});


router.post('/grupo/frequencia', async (req, res) => {
  try {
    const { token, presentes } = req.body || {};
    if (!Array.isArray(presentes)) return res.status(400).json({ error: 'presentes deve ser uma lista.' });
    const ctx = await contextoFrequencia(token);
    if (ctx.erro) return res.status(ctx.erro.status).json({ error: ctx.erro.msg });
    const { payload, grupo, dataEncontro } = ctx;


    const { data: vinculos } = await supabase.from('mem_grupo_membros')
      .select('membro_id').eq('grupo_id', grupo.id).is('saiu_em', null).is('deleted_at', null).limit(1000);
    const roster = new Set((vinculos || []).map(v => v.membro_id));
    const marcados = [...new Set(presentes.filter(id => roster.has(id)))];

    let liderNome = 'Líder do grupo';
    const { data: lider } = await supabase.from('mem_membros').select('nome').eq('id', grupo.lider_id).maybeSingle();
    if (lider?.nome) liderNome = lider.nome;

    const observacoes = `Frequência do mês (${rotuloMes(payload.m)}) registrada pelo líder via WhatsApp.`;
    const { data: encontro } = await supabase.from('mem_grupo_encontros')
      .select('id, tema, observacoes').eq('grupo_id', grupo.id).eq('data', dataEncontro).maybeSingle();

    if (encontro) {






      const nosso = (encontro.observacoes || '').includes('Frequência do mês');
      let presencasFinais = marcados;
      let temaFinal = encontro.tema || 'Frequência do mês';
      let obsFinal = observacoes;
      if (!nosso) {
        const { data: presAtuais } = await supabase.from('mem_grupo_encontro_presencas')
          .select('membro_id').eq('encontro_id', encontro.id).eq('presente', true);
        presencasFinais = [...new Set([...(presAtuais || []).map(p => p.membro_id), ...marcados])];
        temaFinal = encontro.tema || null;
        obsFinal = [encontro.observacoes, observacoes].filter(Boolean).join(' · ');
      }

      const { error } = await supabase.rpc('atualizar_encontro_grupo', {
        p_encontro_id: encontro.id,
        p_data: null, p_tema: temaFinal, p_observacoes: obsFinal,
        p_membros_presentes: presencasFinais,
      });
      if (error) throw error;
    } else {
      const { error } = await supabase.rpc('registrar_encontro_grupo', {
        p_grupo_id: grupo.id,
        p_data: dataEncontro,
        p_tema: 'Frequência do mês',
        p_observacoes: observacoes,
        p_registrado_por: null,
        p_registrado_por_nome: `${liderNome} (link WhatsApp)`,
        p_membros_presentes: marcados,
      });
      if (error) throw error;
    }

    res.json({ ok: true, marcados: marcados.length, total: roster.size });
  } catch (e) {
    console.error('[public grupos frequencia post]', e.message);
    res.status(500).json({ error: 'Erro ao salvar a frequência.' });
  }
});







router.post('/grupo/frequencia/visitante', async (req, res) => {
  try {
    const { token, nome, telefone } = req.body || {};
    const ctx = await contextoFrequencia(token);
    if (ctx.erro) return res.status(ctx.erro.status).json({ error: ctx.erro.msg });
    const { grupo } = ctx;

    if (!nome || nome.trim().length < 3) return res.status(400).json({ error: 'Digite o nome do visitante.', campo: 'nome' });
    if (!telefone || soDigitos(telefone).length < 10) return res.status(400).json({ error: 'Digite um celular válido com DDD.', campo: 'telefone' });



    const r = await acharOuCriarGuardado({ nome: nome.trim(), telefone, status: 'visitante' });
    const membroId = r?.membro_id;
    if (!membroId) return res.status(500).json({ error: 'Não foi possível registrar o visitante.' });


    const { data: jaAtivo } = await supabase.from('mem_grupo_membros')
      .select('id').eq('grupo_id', grupo.id).eq('membro_id', membroId)
      .is('saiu_em', null).is('deleted_at', null).limit(1);
    if (!jaAtivo || !jaAtivo.length) {
      const { error: eVinc } = await supabase.from('mem_grupo_membros').insert({
        grupo_id: grupo.id, membro_id: membroId, funcao: 'visitante',
        entrou_em: new Date().toISOString().slice(0, 10),
      });
      if (eVinc) throw eVinc;
    }

    const { data: mem } = await supabase.from('mem_membros')
      .select('id, nome, foto_url').eq('id', membroId).maybeSingle();
    res.json({ ok: true, membro: { id: membroId, nome: mem?.nome || nome.trim(), foto_url: mem?.foto_url || null } });
  } catch (e) {
    console.error('[public grupos frequencia visitante]', e.message);
    res.status(500).json({ error: 'Erro ao adicionar o visitante.' });
  }
});















async function contextoRenovacao(token) {
  const payload = verificarToken(token, 'renov');
  if (!payload) return { erro: { status: 401, msg: 'Link inválido ou expirado.' } };
  const { data: ren, error } = await supabase.from('mem_grupo_renovacoes')
    .select('*').eq('id', payload.r).is('deleted_at', null).maybeSingle();
  if (error) throw error;
  if (!ren || ren.grupo_id !== payload.p) return { erro: { status: 404, msg: 'Renovação não encontrada.' } };
  if ((payload.g || 1) !== (ren.token_geracao || 1)) {
    return { erro: { status: 403, msg: 'Este link foi substituído por um mais novo — abra o último que você recebeu no WhatsApp.' } };
  }
  const { data: grupo } = await supabase.from('mem_grupos')
    .select('id, nome, lider_id, ativo').eq('id', ren.grupo_id).is('deleted_at', null).maybeSingle();
  if (!grupo || !grupo.ativo) return { erro: { status: 404, msg: 'Grupo não encontrado ou já encerrado.' } };
  if (!payload.l || grupo.lider_id !== payload.l) {
    return { erro: { status: 403, msg: 'A liderança deste grupo mudou — este link não vale mais.' } };
  }
  if (ren.status === 'triada') {
    return { erro: { status: 409, msg: 'A coordenação já tratou a renovação deste grupo. Se algo mudou, fale direto com ela.' } };
  }
  const { data: temporada } = await supabase.from('mem_temporadas')
    .select('id, label, inscricoes_abertas').eq('id', ren.temporada_id).maybeSingle();
  if (temporada?.inscricoes_abertas) {
    return { erro: { status: 409, msg: 'As inscrições da nova temporada já abriram — ajustes na lista agora são com a coordenação.' } };
  }
  return { payload, ren, grupo, temporada };
}



async function rosterRenovacao(ren, jaRespondeu) {
  const linhas = new Map();
  const { data: ativos } = await supabase.from('mem_grupo_membros')
    .select('membro_id, mem_membros!inner(id, nome, foto_url)')
    .eq('grupo_id', ren.grupo_id).is('saiu_em', null).is('deleted_at', null)
    .limit(1000);
  for (const v of (ativos || [])) {
    if (!linhas.has(v.membro_id)) {
      linhas.set(v.membro_id, {
        id: v.mem_membros.id, nome: v.mem_membros.nome,
        foto_url: v.mem_membros.foto_url || null,


        marcado: !!jaRespondeu,
      });
    }
  }
  const { data: removidos } = await supabase.from('mem_grupo_membros')
    .select('membro_id, mem_membros!inner(id, nome, foto_url)')
    .eq('grupo_id', ren.grupo_id).eq('renovacao_id', ren.id)
    .not('saiu_em', 'is', null).is('deleted_at', null)
    .limit(1000);
  for (const v of (removidos || [])) {
    if (!linhas.has(v.membro_id)) {
      linhas.set(v.membro_id, {
        id: v.mem_membros.id, nome: v.mem_membros.nome,
        foto_url: v.mem_membros.foto_url || null, marcado: false,
      });
    }
  }
  return [...linhas.values()].sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));
}


router.get('/grupo/renovacao', async (req, res) => {
  try {
    const ctx = await contextoRenovacao(req.query.token);
    if (ctx.erro) return res.status(ctx.erro.status).json({ error: ctx.erro.msg });
    const { ren, grupo, temporada } = ctx;
    const jaRespondeu = ren.status !== 'enviada';
    const membros = await rosterRenovacao(ren, ren.status === 'continua');
    res.json({
      grupo: { nome: grupo.nome },
      temporada: { id: ren.temporada_id, label: temporada?.label || ren.temporada_id },
      status: ren.status,
      motivo: ren.motivo || null,
      ja_respondeu: jaRespondeu,
      membros,
    });
  } catch (e) {
    console.error('[public grupos renovacao get]', e.message);
    res.status(500).json({ error: 'Erro ao carregar a renovação.' });
  }
});







router.post('/grupo/renovacao', async (req, res) => {
  try {
    const { token, resposta, motivo } = req.body || {};
    const ctx = await contextoRenovacao(token);
    if (ctx.erro) return res.status(ctx.erro.status).json({ error: ctx.erro.msg });
    const { ren, grupo, temporada } = ctx;
    const agora = new Date().toISOString();
    const hoje = agora.slice(0, 10);
    const label = temporada?.label || ren.temporada_id;

    if (resposta === 'nao_continua') {
      const motivoLimpo = String(motivo || '').trim();
      if (motivoLimpo.length < 5) {
        return res.status(400).json({ error: 'Conte pra gente o motivo — ele ajuda a coordenação a cuidar do grupo.', campo: 'motivo' });
      }
      const { error } = await supabase.from('mem_grupo_renovacoes')
        .update({
          status: 'nao_continua', motivo: motivoLimpo.slice(0, 2000),
          primeira_resposta_em: ren.primeira_resposta_em || agora,
          ultima_resposta_em: agora, updated_at: agora,
        }).eq('id', ren.id);
      if (error) throw error;

      try {
        await notificar({
          modulo: 'grupos',
          tipo: 'renovacao_nao_continua',
          titulo: `Líder não continua: ${grupo.nome}`,
          mensagem: `O líder do grupo ${grupo.nome} respondeu que não continua na temporada ${label}. Motivo: ${motivoLimpo.slice(0, 200)}. O grupo aguarda triagem na caixa de entrada.`,
          link: '/grupos?tab=entrada',
          severidade: 'aviso',
          chaveDedup: `renovacao_nao_continua_${ren.id}`,
        });
      } catch (eN) { console.error('[renovacao notificar]', eN.message); }
      return res.json({ ok: true, status: 'nao_continua' });
    }

    if (resposta !== 'continua') {
      return res.status(400).json({ error: 'Resposta inválida.' });
    }
    const continuam = Array.isArray(req.body?.continuam) ? req.body.continuam : null;
    const exibidos = Array.isArray(req.body?.exibidos) ? req.body.exibidos : null;
    if (!continuam || !exibidos) {
      return res.status(400).json({ error: 'Lista de participantes inválida.' });
    }


    const { data: ativos } = await supabase.from('mem_grupo_membros')
      .select('id, membro_id')
      .eq('grupo_id', grupo.id).is('saiu_em', null).is('deleted_at', null)
      .limit(1000);
    const ativosPorMembro = new Map();
    for (const v of (ativos || [])) {
      if (!ativosPorMembro.has(v.membro_id)) ativosPorMembro.set(v.membro_id, []);
      ativosPorMembro.get(v.membro_id).push(v.id);
    }

    const setExibidos = new Set(exibidos);
    const setContinuam = new Set(continuam.filter(id => setExibidos.has(id)));



    const removerVincIds = [];
    const removidosMembroIds = [];
    for (const [membroId, vincIds] of ativosPorMembro) {
      if (!setExibidos.has(membroId)) continue;
      if (setContinuam.has(membroId)) continue;
      removerVincIds.push(...vincIds);
      removidosMembroIds.push(membroId);
    }
    if (removerVincIds.length) {
      for (let i = 0; i < removerVincIds.length; i += 150) {
        const { error } = await supabase.from('mem_grupo_membros')
          .update({
            saiu_em: hoje,
            motivo_saida: `Não confirmado na renovação da temporada ${label}`,
            renovacao_id: ren.id,
          })
          .in('id', removerVincIds.slice(i, i + 150));
        if (error) throw error;
      }
    }




    const { data: fechadosPorNos } = await supabase.from('mem_grupo_membros')
      .select('id, membro_id')
      .eq('grupo_id', grupo.id).eq('renovacao_id', ren.id)
      .not('saiu_em', 'is', null).is('deleted_at', null)
      .limit(1000);
    const reativarIds = [];
    const reativadosMembroIds = new Set();
    for (const v of (fechadosPorNos || [])) {
      if (!setContinuam.has(v.membro_id)) continue;
      if (ativosPorMembro.has(v.membro_id)) continue;
      if (reativadosMembroIds.has(v.membro_id)) continue;
      reativarIds.push(v.id);
      reativadosMembroIds.add(v.membro_id);
    }
    if (reativarIds.length) {
      for (let i = 0; i < reativarIds.length; i += 150) {
        const { error } = await supabase.from('mem_grupo_membros')
          .update({ saiu_em: null, motivo_saida: null, renovacao_id: null })
          .in('id', reativarIds.slice(i, i + 150));
        if (error) throw error;
      }
    }





    const confirmadosFinal = [...setContinuam];




    const seguemFora = (fechadosPorNos || []).filter(v => !setContinuam.has(v.membro_id));
    const foraAgoraIds = [...removerVincIds, ...seguemFora.map(v => v.id)];
    const foraAgoraMembros = new Set([...removidosMembroIds, ...seguemFora.map(v => v.membro_id)]);
    const { error: eUp } = await supabase.from('mem_grupo_renovacoes')
      .update({
        status: 'continua', motivo: null,
        roster_total: setExibidos.size,
        confirmados_count: confirmadosFinal.length,
        removidos_count: foraAgoraMembros.size,
        confirmados_ids: confirmadosFinal,
        removidos_vinculo_ids: [...new Set(foraAgoraIds)],
        primeira_resposta_em: ren.primeira_resposta_em || agora,
        ultima_resposta_em: agora, updated_at: agora,
      }).eq('id', ren.id);
    if (eUp) throw eUp;

    res.json({
      ok: true, status: 'continua',
      confirmados: confirmadosFinal.length,
      removidos: foraAgoraMembros.size,
      reativados: reativarIds.length,
    });
  } catch (e) {
    console.error('[public grupos renovacao post]', e.message);
    res.status(500).json({ error: 'Erro ao salvar a resposta.' });
  }
});























const RE_SCHEMA_AUSENTE = /(does not exist|could not find|schema cache|42703|42P01|PGRST20[24])/i;
function schemaAusente(e) {
  return RE_SCHEMA_AUSENTE.test(`${e?.code || ''} ${e?.message || ''} ${e?.details || ''}`);
}
const AVISO_SEM_MIGRATION = 'A conferência da lista ainda não está disponível no servidor (migration pendente). Avise a coordenação.';

async function contextoConferencia(token) {
  const payload = verificarToken(token, 'conf');
  if (!payload) return { erro: { status: 401, msg: 'Link inválido ou expirado.' } };
  const { data: conf, error } = await supabase.from('mem_grupo_conferencias')
    .select('*').eq('id', payload.c).is('deleted_at', null).maybeSingle();
  if (error) throw error;
  if (!conf || conf.grupo_id !== payload.p) return { erro: { status: 404, msg: 'Conferência não encontrada.' } };
  if ((payload.g || 1) !== (conf.token_geracao || 1)) {
    return { erro: { status: 403, msg: 'Este link foi substituído por um mais novo — abra o último que você recebeu no WhatsApp.' } };
  }
  const { data: grupo } = await supabase.from('mem_grupos')
    .select('id, nome, lider_id, ativo').eq('id', conf.grupo_id).is('deleted_at', null).maybeSingle();
  if (!grupo || !grupo.ativo) return { erro: { status: 404, msg: 'Grupo não encontrado ou já encerrado.' } };
  if (!payload.l || grupo.lider_id !== payload.l) {
    return { erro: { status: 403, msg: 'A liderança deste grupo mudou — este link não vale mais.' } };
  }
  if (conf.status === 'triada') {
    return { erro: { status: 409, msg: 'A coordenação já tratou a conferência deste grupo. Se algo mudou, fale direto com ela.' } };
  }





  const { data: maisNova, error: eNova } = await supabase.from('mem_grupo_conferencias')
    .select('id').eq('grupo_id', conf.grupo_id).is('deleted_at', null)
    .gt('rodada', conf.rodada || 1).limit(1);
  if (eNova) throw eNova;
  if (maisNova && maisNova.length) {
    return { erro: { status: 403, msg: 'Este link foi substituído por um mais novo — abra o último que você recebeu no WhatsApp.' } };
  }


  return { payload, conf, grupo };
}













const FUNCOES_PROTEGIDAS = new Set(['lider', 'lider_treinamento']);












async function temporadaAtualInfo() {
  const { data } = await supabase.from('mem_temporadas')
    .select('id, label, data_inicio').eq('inscricoes_abertas', true)
    .order('ano', { ascending: false }).order('numero', { ascending: false }).limit(1);
  return (data && data[0]) || null;
}







async function vinculosRenovados(vincIds) {
  const renovados = new Set();
  for (let i = 0; i < vincIds.length; i += 150) {
    const { data, error } = await supabase.from('inscricao_consentimentos')
      .select('ref_id').eq('porta', 'grupos').in('ref_id', vincIds.slice(i, i + 150));
    if (error) throw error;
    (data || []).forEach(r => { if (r.ref_id) renovados.add(r.ref_id); });
  }
  return renovados;
}



const vincNaTemporada = (createdAt, temporada) =>
  !!(temporada?.data_inicio && createdAt && String(createdAt) >= temporada.data_inicio);










const PRE_ABERTURA_DIAS = 30;
function inicioJanelaPreAbertura(temporada) {
  if (!temporada?.data_inicio) return null;

  const d = new Date(`${temporada.data_inicio}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() - PRE_ABERTURA_DIAS);
  return d.toISOString().slice(0, 10);
}


async function membrosInscritosPreAbertura(grupoId, vincs, temporada) {
  const inscritos = new Set();
  const desde = inicioJanelaPreAbertura(temporada);
  if (!desde) return inscritos;
  const candidatos = [...new Set((vincs || [])
    .filter(v => v.membro_id && v.created_at
      && !vincNaTemporada(v.created_at, temporada)
      && String(v.created_at) >= desde)
    .map(v => v.membro_id))];
  for (let i = 0; i < candidatos.length; i += 150) {
    const { data, error } = await supabase.from('mem_grupo_pedidos')
      .select('membro_id').eq('grupo_id', grupoId).eq('status', 'aprovado')
      .is('deleted_at', null).in('membro_id', candidatos.slice(i, i + 150));
    if (error) throw error;
    (data || []).forEach(p => { if (p.membro_id) inscritos.add(p.membro_id); });
  }
  return inscritos;
}



const RANK_FUNCAO = { coordenador: 7, supervisor: 6, lider: 5, co_lider: 4, lider_treinamento: 4, frequentador: 2, visitante: 1 };
const rotuloFuncao = (f) => ({
  coordenador: 'Coordenador', supervisor: 'Supervisor', lider: 'Líder',
  co_lider: 'Líder em treinamento', lider_treinamento: 'Líder em treinamento',
}[f] || null);







async function rosterConferencia(conf) {
  const temporada = await temporadaAtualInfo();
  const linhas = new Map();
  const { data: ativos, error: eA } = await supabase.from('mem_grupo_membros')
    .select('id, membro_id, funcao, created_at, mem_membros!inner(id, nome, foto_url)')
    .eq('grupo_id', conf.grupo_id).is('saiu_em', null).is('deleted_at', null)
    .limit(1000);
  if (eA) throw eA;
  const renovadosVinc = await vinculosRenovados((ativos || []).map(v => v.id));
  const preAbertura = await membrosInscritosPreAbertura(conf.grupo_id, ativos || [], temporada);
  const renovadoMembro = new Set();
  const novoMembro = new Set();
  for (const v of (ativos || [])) {
    if (renovadosVinc.has(v.id)) renovadoMembro.add(v.membro_id);
    if (vincNaTemporada(v.created_at, temporada) || preAbertura.has(v.membro_id)) novoMembro.add(v.membro_id);
    const atual = linhas.get(v.membro_id);
    if (!atual) {
      linhas.set(v.membro_id, {
        id: v.mem_membros.id, nome: v.mem_membros.nome,
        foto_url: v.mem_membros.foto_url || null,


        marcado: true,
        funcao: v.funcao || null,
        papel: rotuloFuncao(v.funcao),
        protegido: FUNCOES_PROTEGIDAS.has(v.funcao),
      });
    } else if ((RANK_FUNCAO[v.funcao] || 0) > (RANK_FUNCAO[atual.funcao] || 0)) {
      atual.funcao = v.funcao || null;
      atual.papel = rotuloFuncao(v.funcao);
      atual.protegido = atual.protegido || FUNCOES_PROTEGIDAS.has(v.funcao);
    }
  }
  const { data: removidos, error: eR } = await supabase.from('mem_grupo_membros')
    .select('membro_id, funcao, mem_membros!inner(id, nome, foto_url)')
    .eq('grupo_id', conf.grupo_id).eq('conferencia_id', conf.id)
    .not('saiu_em', 'is', null).is('deleted_at', null)
    .limit(1000);
  if (eR) throw eR;
  for (const v of (removidos || [])) {
    if (!linhas.has(v.membro_id)) {
      linhas.set(v.membro_id, {
        id: v.mem_membros.id, nome: v.mem_membros.nome,
        foto_url: v.mem_membros.foto_url || null, marcado: false,
        funcao: v.funcao || null, papel: rotuloFuncao(v.funcao),


        protegido: false,
      });
    }
  }
  for (const linha of linhas.values()) {



    linha.categoria = linha.protegido ? 'lideranca'
      : renovadoMembro.has(linha.id) ? 'renovado'
        : novoMembro.has(linha.id) ? 'inscrito'
          : 'sem_confirmacao';
    linha.travado = linha.categoria !== 'sem_confirmacao';
  }
  const membros = [...linhas.values()].sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));
  return { membros, temporada };
}


router.get('/grupo/confira', async (req, res) => {
  try {
    const ctx = await contextoConferencia(req.query.token);
    if (ctx.erro) return res.status(ctx.erro.status).json({ error: ctx.erro.msg });
    const { conf, grupo } = ctx;
    const { membros, temporada } = await rosterConferencia(conf);




    const { data: pendentes, error: ePen } = await supabase.from('mem_grupo_pedidos')
      .select('id, nome, created_at').eq('grupo_id', grupo.id)
      .eq('status', 'pendente').is('deleted_at', null)
      .order('created_at', { ascending: true }).limit(500);
    if (ePen) throw ePen;



    let pedidosDevolvidos = [];
    try {
      const { data: evs } = await supabase.from('mem_grupo_pedido_eventos')
        .select('pedido_id').eq('tipo', 'recusado_lider')
        .eq('detalhe->>conferencia_id', conf.id).limit(300);
      const ids = [...new Set((evs || []).map(e => e.pedido_id).filter(Boolean))];
      if (ids.length) {
        const { data: peds } = await supabase.from('mem_grupo_pedidos')
          .select('id, nome').in('id', ids).eq('status', 'devolvido').is('deleted_at', null);
        pedidosDevolvidos = (peds || []).map(p => ({ id: p.id, nome: p.nome }));
      }
    } catch (eDev) { console.warn('[public grupos confira get] devolvidos:', eDev.message); }

    res.json({
      grupo: { nome: grupo.nome },
      status: conf.status,
      ja_respondeu: conf.status !== 'enviada',
      observacao: conf.observacao || null,
      temporada: temporada?.label || null,
      membros,
      pedidos_pendentes: (pendentes || []).map(p => ({ id: p.id, nome: p.nome, criado_em: p.created_at })),
      pedidos_devolvidos: pedidosDevolvidos,
    });
  } catch (e) {
    if (schemaAusente(e)) {
      console.error('[public grupos confira get] migration pendente:', e.message);
      return res.status(503).json({ error: AVISO_SEM_MIGRATION });
    }
    console.error('[public grupos confira get]', e.message);
    res.status(500).json({ error: 'Erro ao carregar a lista do grupo.' });
  }
});






router.post('/grupo/confira', async (req, res) => {
  try {
    const { token, observacao } = req.body || {};
    const ctx = await contextoConferencia(token);
    if (ctx.erro) return res.status(ctx.erro.status).json({ error: ctx.erro.msg });
    const { conf, grupo } = ctx;
    const agora = new Date().toISOString();
    const hoje = agora.slice(0, 10);

    const mantem = Array.isArray(req.body?.mantem) ? req.body.mantem : null;
    const exibidos = Array.isArray(req.body?.exibidos) ? req.body.exibidos : null;
    if (!mantem || !exibidos) {
      return res.status(400).json({ error: 'Lista de participantes inválida.' });
    }


    const { data: ativos, error: eAt } = await supabase.from('mem_grupo_membros')
      .select('id, membro_id, funcao, created_at')
      .eq('grupo_id', grupo.id).is('saiu_em', null).is('deleted_at', null)
      .limit(1000);
    if (eAt) throw eAt;



    const renovadosVinc = await vinculosRenovados((ativos || []).map(v => v.id));
    const temporadaAtual = await temporadaAtualInfo();
    const preAbertura = await membrosInscritosPreAbertura(grupo.id, ativos || [], temporadaAtual);
    const ativosPorMembro = new Map();
    const travados = new Set();
    for (const v of (ativos || [])) {
      if (!ativosPorMembro.has(v.membro_id)) ativosPorMembro.set(v.membro_id, []);
      ativosPorMembro.get(v.membro_id).push(v.id);
      if (FUNCOES_PROTEGIDAS.has(v.funcao)
        || renovadosVinc.has(v.id)
        || vincNaTemporada(v.created_at, temporadaAtual)
        || preAbertura.has(v.membro_id)) travados.add(v.membro_id);
    }

    const setExibidos = new Set(exibidos);
    const setMantem = new Set(mantem.filter(id => setExibidos.has(id)));


    for (const membroId of travados) {
      if (setExibidos.has(membroId)) setMantem.add(membroId);
    }
    const obsLimpa = String(observacao || '').trim().slice(0, 2000) || null;


    const rotuloSaida = obsLimpa
      ? `Removido pelo líder na conferência da lista: ${obsLimpa.slice(0, 160)}`
      : 'Removido pelo líder na conferência da lista do grupo';



    const removerVincIds = [];
    const removidosMembroIds = [];
    for (const [membroId, vincIds] of ativosPorMembro) {
      if (!setExibidos.has(membroId)) continue;
      if (setMantem.has(membroId)) continue;
      removerVincIds.push(...vincIds);
      removidosMembroIds.push(membroId);
    }
    if (removerVincIds.length) {
      for (let i = 0; i < removerVincIds.length; i += 150) {




        const { error } = await supabase.from('mem_grupo_membros')
          .update({ saiu_em: hoje, motivo_saida: rotuloSaida, conferencia_id: conf.id })
          .in('id', removerVincIds.slice(i, i + 150))
          .is('saiu_em', null);
        if (error) throw error;
      }
    }




    const { data: fechadosPorNos, error: eF } = await supabase.from('mem_grupo_membros')
      .select('id, membro_id')
      .eq('grupo_id', grupo.id).eq('conferencia_id', conf.id)
      .not('saiu_em', 'is', null).is('deleted_at', null)
      .limit(1000);
    if (eF) throw eF;
    const reativarIds = [];
    const reativadosMembroIds = new Set();
    for (const v of (fechadosPorNos || [])) {
      if (!setMantem.has(v.membro_id)) continue;
      if (ativosPorMembro.has(v.membro_id)) continue;
      if (reativadosMembroIds.has(v.membro_id)) continue;
      reativarIds.push(v.id);
      reativadosMembroIds.add(v.membro_id);
    }
    if (reativarIds.length) {
      for (let i = 0; i < reativarIds.length; i += 150) {
        const { error } = await supabase.from('mem_grupo_membros')
          .update({ saiu_em: null, motivo_saida: null, conferencia_id: null })
          .in('id', reativarIds.slice(i, i + 150));
        if (error) throw error;
      }
    }






    const pedExibidos = Array.isArray(req.body?.pedidos_exibidos) ? req.body.pedidos_exibidos : [];
    const pedDevolver = Array.isArray(req.body?.pedidos_devolver) ? req.body.pedidos_devolver : [];
    let pedidosDevolvidos = [];
    if (pedDevolver.length) {
      const setPedExib = new Set(pedExibidos);
      const alvo = [...new Set(pedDevolver.filter(id => setPedExib.has(id)))].slice(0, 500);
      if (alvo.length) {
        const quemDevolveu = `${conf.lider_nome || 'Líder'} (confira a lista)`;
        const { data: claimed, error: eDev } = await supabase.from('mem_grupo_pedidos')
          .update({
            status: 'devolvido',
            motivo_rejeicao: 'Devolvido pelo líder na conferência da lista do grupo',
            decidido_por: null,
            decidido_por_nome: quemDevolveu,
            decidido_em: agora,
          })
          .in('id', alvo).eq('grupo_id', grupo.id)
          .eq('status', 'pendente').is('deleted_at', null)
          .select('id, nome');
        if (eDev) throw eDev;
        pedidosDevolvidos = claimed || [];


        await Promise.all(pedidosDevolvidos.map(p => registrarEventoPedido(
          p.id, 'recusado_lider',
          { origem: 'confira_lista', conferencia_id: conf.id }, quemDevolveu)));
      }
    }




    const mantidosFinal = [...setMantem];
    const seguemFora = (fechadosPorNos || []).filter(v => !setMantem.has(v.membro_id));
    const foraAgoraIds = [...removerVincIds, ...seguemFora.map(v => v.id)];
    const foraAgoraMembros = new Set([...removidosMembroIds, ...seguemFora.map(v => v.membro_id)]);
    const { error: eUp } = await supabase.from('mem_grupo_conferencias')
      .update({
        status: 'respondida',
        observacao: obsLimpa,
        roster_total: setExibidos.size,
        mantidos_count: mantidosFinal.length,
        removidos_count: foraAgoraMembros.size,
        mantidos_ids: mantidosFinal,
        removidos_vinculo_ids: [...new Set(foraAgoraIds)],
        primeira_resposta_em: conf.primeira_resposta_em || agora,
        ultima_resposta_em: agora, updated_at: agora,
      }).eq('id', conf.id);
    if (eUp) throw eUp;




    if (foraAgoraMembros.size > 0 || pedidosDevolvidos.length > 0) {
      try {
        await notificar({
          modulo: 'grupos',
          tipo: 'confira_lista_respondida',
          titulo: `Lista conferida: ${grupo.nome}`,
          mensagem: `O líder do grupo ${grupo.nome} conferiu a lista: ${mantidosFinal.length} continua(m) e ${foraAgoraMembros.size} saiu(ram).`
            + (pedidosDevolvidos.length ? ` ${pedidosDevolvidos.length} pedido(s) aguardando aprovação devolvido(s) pra triagem — sugira outro grupo ou rejeite de vez.` : '')
            + (obsLimpa ? ` Observação: ${obsLimpa.slice(0, 200)}` : ''),
          link: pedidosDevolvidos.length ? '/grupos?tab=entrada' : '/grupos?tab=envios',
          severidade: 'info',
          chaveDedup: `confira_lista_${conf.id}_${hoje}`,
        });
      } catch (eN) { console.error('[confira lista notificar]', eN.message); }
    }

    res.json({
      ok: true, status: 'respondida',
      mantidos: mantidosFinal.length,
      removidos: foraAgoraMembros.size,
      reativados: reativarIds.length,
      pedidos_devolvidos: pedidosDevolvidos.length,
    });
  } catch (e) {
    if (schemaAusente(e)) {
      console.error('[public grupos confira post] migration pendente:', e.message);
      return res.status(503).json({ error: AVISO_SEM_MIGRATION });
    }
    console.error('[public grupos confira post]', e.message);
    res.status(500).json({ error: 'Erro ao salvar a resposta.' });
  }
});











router.get('/cron/frequencia-mensal', requireCron, async (req, res) => {
  try {



    if (!(await enviosAutomaticosAtivos())) {
      console.log('[grupos frequencia cron] envios automáticos DESLIGADOS — nada enviado');
      return res.json({ ok: true, enviados: 0, motivo: 'envios_automaticos_desligados' });
    }

    if (await require('../services/comunicacaoDisparosOff').disparoDesligado('grupos_frequencia')) {
      return res.json({ ok: true, enviados: 0, motivo: 'desligado_na_comunicacao' });
    }
    const hoje = new Date().toISOString().slice(0, 10);
    const { data: temporadaEmCurso } = await supabase
      .from('mem_temporadas')
      .select('id, data_inicio, data_fim')
      .eq('ativa', true)
      .lte('data_inicio', hoje)
      .gte('data_fim', hoje)
      .limit(1)
      .maybeSingle();
    if (!temporadaEmCurso) {
      console.log('[grupos frequencia cron] sem temporada ativa em curso — nada enviado');
      return res.json({ ok: true, enviados: 0, motivo: 'sem_temporada_em_curso' });
    }
    const mes = new Date().toISOString().slice(0, 7);
    const { data: grupos } = await supabase.from('mem_grupos')
      .select('id, nome, lider_id')
      .eq('ativo', true).not('lider_id', 'is', null).is('deleted_at', null)
      .limit(1000);




    const comRoster = new Set();
    for (let offset = 0; ; offset += 1000) {
      const { data: pagina, error: eR } = await supabase.from('mem_grupo_membros')
        .select('grupo_id')
        .is('saiu_em', null).is('deleted_at', null)
        .order('id').range(offset, offset + 999);
      if (eR) throw eR;
      (pagina || []).forEach(p => comRoster.add(p.grupo_id));
      if (!pagina || pagina.length < 1000) break;
    }

    const liderIds = [...new Set((grupos || [])
      .filter(g => comRoster.has(g.id))
      .map(g => g.lider_id).filter(Boolean))];
    const lideres = new Map();
    for (let i = 0; i < liderIds.length; i += 200) {
      const { data: pagina, error: eL } = await supabase.from('mem_membros')
        .select('id, nome, telefone')
        .in('id', liderIds.slice(i, i + 200)).is('deleted_at', null);
      if (eL) throw eL;
      (pagina || []).forEach(l => lideres.set(l.id, l));
    }

    const envios = [];
    const pulados = [];
    for (const g of (grupos || [])) {

      if (!comRoster.has(g.id)) { pulados.push({ grupo: g.nome, motivo: 'sem_roster' }); continue; }
      const m = montarEnvioFrequencia({ grupo: g, lider: lideres.get(g.lider_id), mes });
      if (m.erro) { pulados.push({ grupo: g.nome, motivo: m.erro }); continue; }
      envios.push(m.envio);
    }
    const lote = await enfileirarLote(envios);
    console.log(`[grupos frequencia cron] mês ${mes}: ${lote.queued} na fila · ${pulados.length} pulados`);
    res.json({ ok: true, mes, enfileirados: lote.queued, pulados: pulados.length });
  } catch (e) {
    console.error('[public grupos frequencia cron]', e.message);
    res.status(500).json({ error: 'Erro no envio mensal.' });
  }
});




async function cronWhatsappFila(req, res) {
  try {




    let pesquisas = null;
    try {
      const { enviarPesquisasDevidas } = require('../services/visitantePesquisa');
      pesquisas = await enviarPesquisasDevidas();
    } catch (e) {
      console.error('[whatsapp-fila cron] pesquisa do visitante:', e.message);
      pesquisas = { erro: e.message };
    }
    const r = await processarFila();
    r.visitante_pesquisa = pesquisas;
    console.log('[whatsapp-fila cron]', JSON.stringify(r));
    res.json({ ok: true, ...r });
  } catch (e) {
    console.error('[whatsapp-fila cron]', e.message);
    res.status(500).json({ error: e.message });
  }
}
router.get('/cron/whatsapp-fila', requireCron, cronWhatsappFila);
router.post('/cron/whatsapp-fila', requireCron, cronWhatsappFila);

module.exports = router;
