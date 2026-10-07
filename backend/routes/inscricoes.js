







const express = require('express');
const router = express.Router();
const multer = require('multer');
const { authenticate, authorizeModule } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { camposAgrupaveis, opcoesMarcadas, resumoPorOpcao } = require('../utils/respostaOpcoes');
const { escapePostgrestValue } = require('../utils/sanitize');
const { fetchAllRows } = require('../utils/pagination');
const { verificarTokenComprovanteAtivo, extrairToken } = require('../services/inscricaoComprovante');
const { portasSatelites, fontesUnificadas, catalogoPublico } = require('../services/inscricaoPortas');
const { elegiveisDoSorteio, motivoSemElegivel } = require('../services/inscricaoSorteio');


const { contarInscritosVivos } = require('../services/inscricaoContagem');
const { normalizarIds, separarExclusaoLote, resumoDoLote } = require('../utils/exclusaoInscricaoLote');
const checkoutExterno = require('../utils/checkoutExterno');
const { sanitizarLotes, anexarLoteNasInscricoes } = require('../utils/lotesEvento');
const eInscricao = require('../utils/eInscricao');
const { resumoPorPlataforma } = eInscricao;


const importarEInscricao = require('../services/importarEInscricao');


const { acharOuCriarGuardado } = require('../services/membroMatch');
const {
  previewTemplate,
  esqueletoPadrao,
  carregarAssinatura,
  sanitizarHtml: sanitizarHtmlEmail,
  TIPOS: TIPOS_EMAIL,
  VARIAVEIS: VARIAVEIS_EMAIL,
} = require('../services/inscricaoEmail');


const TIPOS_EDITAVEIS = [...TIPOS_EMAIL, 'assinatura'];
const { enviarEmail } = require('../services/email');

const { notificarApp } = require('../services/appPush');
const { previaAvisoEmail, enviarAvisoEmail } = require('../services/avisoComprovanteEmail');
const { avaliarCadastroPessoa } = require('../utils/prontidaoCadastro');


const { cpfValido } = require('../services/inscricaoContrato');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

router.use(authenticate);

function slugify(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'evento';
}





const { keyCampoPreservada } = require('../utils/campoKey');

const TIPOS_CAMPO = ['texto', 'textarea', 'email', 'select', 'escolha', 'multi', 'rede_social', 'imagem', 'numero', 'data'];












function sanitizeMostrarSe(bruto) {
  if (!bruto || typeof bruto !== 'object') return null;
  const key = String(bruto.key ?? '').trim().slice(0, 60);
  if (!key) return null;
  const brutos = Array.isArray(bruto.valores) ? bruto.valores : (bruto.valor !== undefined ? [bruto.valor] : []);
  const valores = [...new Set(brutos.map(v => String(v ?? '').trim()).filter(Boolean))].slice(0, 20);
  if (!valores.length) return null;
  return { key, valores };
}

function sanitizeCampos(campos) {
  if (!Array.isArray(campos)) return [];
  return campos
    .filter(c => c && String(c.label || '').trim())
    .slice(0, 40)
    .map(c => {
      const campo = {
        key: keyCampoPreservada(c.key),
        label: String(c.label).trim().slice(0, 200),
        tipo: TIPOS_CAMPO.includes(c.tipo) ? c.tipo : 'texto',
        obrigatorio: c.obrigatorio !== false,
        opcoes: Array.isArray(c.opcoes) ? c.opcoes.map(o => String(o).trim()).filter(Boolean).slice(0, 60) : [],
      };


      const cond = sanitizeMostrarSe(c.mostrar_se);
      if (cond) campo.mostrar_se = cond;
      return campo;
    });
}













function sanitizeTermosExtra(lista) {
  if (!Array.isArray(lista)) return null;
  const usadas = new Set();
  return lista
    .map((t) => {
      if (!t || typeof t !== 'object') return null;
      const texto = String(t.texto ?? '').trim().slice(0, 4000);
      if (!texto) return null;
      let chave = String(t.chave ?? '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 40);
      if (!chave || usadas.has(chave)) chave = `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      usadas.add(chave);
      const item = { chave, titulo: String(t.titulo ?? '').trim().slice(0, 160) || 'Termo do evento', texto };
      const url = String(t.url ?? '').trim();
      if (/^https:\/\/[^\s/@]+\.[^\s/@]+/.test(url)) item.url = url.slice(0, 500);




      if (t.so_menor === true) item.so_menor = true;
      return item;
    })
    .filter(Boolean)
    .slice(0, 6);
}


function rotuloEdicao(periodicidade, dataISO) {
  const s = String(dataISO || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return periodicidade === 'anual' ? s.slice(0, 4) : s.slice(0, 7);
}

async function slugUnico(base) {
  let slug = base;
  for (let i = 2; i < 60; i++) {
    const { data } = await supabase.from('insc_eventos').select('id').eq('slug', slug).limit(1);
    if (!data || !data.length) return slug;
    slug = `${base}-${i}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}



async function areaValida(nome) {
  const n = String(nome || '').trim();
  if (!n) return null;
  if (/^administra/i.test(n)) return 'Administração';
  const { data } = await supabase.from('areas')
    .select('nome').eq('ativo', true).ilike('nome', n).limit(1);
  return data && data.length ? data[0].nome : null;
}

const { igrejaParceiraPorId, eventoEhParceiro, idsEventosParceiros, TIPO_PARCEIRA } = require('../services/igrejaParceira');
const genesis = require('../utils/genesisCba');





async function igrejaDoCorpo(b) {
  if (b.igreja_id === undefined) return { skip: true };
  if (b.igreja_id === null || b.igreja_id === '') return { valor: null };
  const igreja = await igrejaParceiraPorId(String(b.igreja_id));
  if (!igreja) return { erro: 'Igreja parceira inválida (cadastre a igreja antes).' };
  return { valor: igreja.id };
}

const CAMPOS_EVENTO = [
  'nome', 'descricao', 'data', 'hora', 'local', 'capa_url', 'vagas',
  'inscricoes_abrem_em', 'inscricoes_encerram_em',
  'msg_sucesso_titulo', 'msg_sucesso_texto', 'msg_whatsapp',
  'tem_sorteio', 'premios', 'checkin_ativo',
  'pagamento_ativo', 'valor_centavos', 'pagamento_expira_horas',


  'parcelas_max', 'juros_repassados',


  'no_totem',





  'checkout_externo_url', 'checkout_externo_nome', 'checkout_externo_valor_centavos',




  'exigir_endereco', 'exige_dados_menor',


  'data_fim', 'instrucoes_url', 'instrucoes_nome',

  'whatsapp_duvidas_url',
];















const CAMPOS_EVENTO_NAO_NULO = new Set([
  'tem_sorteio', 'premios', 'checkin_ativo',
  'pagamento_ativo', 'pagamento_expira_horas', 'juros_repassados',
  'no_totem',

  'exigir_endereco', 'exige_dados_menor',
]);


function aplicarCamposEvento(b, patch) {
  for (const k of CAMPOS_EVENTO) {
    if (b[k] === undefined) continue;
    if (b[k] === null && CAMPOS_EVENTO_NAO_NULO.has(k)) continue;
    patch[k] = b[k];
  }
  return patch;
}











function conferirCheckoutExterno(patch) {
  if (patch.checkout_externo_url === undefined) return null;
  const bruto = String(patch.checkout_externo_url ?? '').trim();
  if (!bruto) { patch.checkout_externo_url = null; return null; }
  const url = checkoutExterno.linkExternoValido(bruto);
  if (!url) {
    return 'O link do checkout externo precisa começar com https:// e apontar para um site '
      + '(ex.: https://www.e-inscricao.com/…). Deixe em branco para cobrar o cartão por aqui.';
  }
  patch.checkout_externo_url = url;
  if (patch.checkout_externo_nome !== undefined) {
    const nome = String(patch.checkout_externo_nome ?? '').trim();
    patch.checkout_externo_nome = nome ? nome.slice(0, 40) : null;
  }
  return null;
}









function sanitizeValorCartaoExterno(patch) {
  if (patch.checkout_externo_valor_centavos === undefined) return null;
  const bruto = patch.checkout_externo_valor_centavos;
  if (bruto === null || bruto === '') { patch.checkout_externo_valor_centavos = null; return null; }
  const n = Math.round(Number(bruto));
  if (!Number.isFinite(n) || n <= 0) { patch.checkout_externo_valor_centavos = null; return null; }
  if (n > 10000000) {
    return 'O valor do cartão na outra plataforma passou de R$ 100.000 — confira se não sobrou um zero.';
  }
  patch.checkout_externo_valor_centavos = n;
  return null;
}





const METODOS_CHECKOUT = ['pix', 'cartao', 'boleto', 'apple_pay'];
function sanitizeMetodos(v) {
  if (!Array.isArray(v)) return null;
  return [...new Set(v.map((m) => String(m).trim()).filter((m) => METODOS_CHECKOUT.includes(m)))];
}





const RE_ADMIN = /gest[aã]o|administra|operac|recursos humanos|\brh\b|patrim|financeir|log[íi]st|tecnologia|\bt\.?i\.?\b|jur[íi]dic|contab|secretar/i;
router.get('/areas', authorizeModule('inscricoes', 1), async (_req, res) => {
  try {
    const { data, error } = await supabase.from('areas')
      .select('id, nome, setor:setores(nome)').eq('ativo', true).order('nome');
    if (error) throw error;
    const naoAdmin = (data || []).filter(a => !RE_ADMIN.test(a.nome || '') && !RE_ADMIN.test(a.setor?.nome || ''));
    res.json([...naoAdmin.map(a => ({ id: a.id, nome: a.nome })), { id: 'administracao', nome: 'Administração' }]);
  } catch (e) {
    console.error('[inscricoes] areas:', e.message);
    res.json([{ id: 'administracao', nome: 'Administração' }]);
  }
});


router.get('/series', authorizeModule('inscricoes', 1), async (_req, res) => {
  try {
    const { data, error } = await supabase.from('insc_series')
      .select('id, nome, slug_base, area, periodicidade, tipo, ativo, recorre_ate')
      .is('deleted_at', null).order('nome');
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    console.error('[inscricoes] series:', e.message);
    res.status(500).json({ error: 'Erro ao listar séries' });
  }
});


router.put('/series/:id', authorizeModule('inscricoes', 3), async (req, res) => {
  try {
    const b = req.body || {};
    const patch = {};
    if (b.nome !== undefined) {
      const nome = String(b.nome).trim();
      if (nome.length < 2) return res.status(400).json({ error: 'Informe o nome da série' });
      patch.nome = nome;
    }
    if (b.recorre_ate !== undefined) {
      patch.recorre_ate = b.recorre_ate && /^\d{4}-\d{2}-\d{2}$/.test(String(b.recorre_ate))
        ? String(b.recorre_ate) : null;
    }
    if (b.ativo !== undefined) patch.ativo = !!b.ativo;
    const { data, error } = await supabase.from('insc_series')
      .update(patch).eq('id', req.params.id).is('deleted_at', null).select('id').single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[inscricoes] atualizar série:', e.message);
    res.status(500).json({ error: 'Erro ao atualizar série' });
  }
});





const PORTAS_UNIFICADAS = fontesUnificadas();
const STATUS_CANONICOS = ['recebida', 'em_tratamento', 'confirmada', 'concluida', 'nao_concluida', 'recusada', 'cancelada'];
router.get('/unificadas', authorizeModule('inscricoes', 1), async (req, res) => {
  try {
    const page = Math.max(0, parseInt(req.query.page) || 0);
    const porPagina = Math.min(1000, Math.max(10, parseInt(req.query.limit) || 50));
    let q = supabase.from('vw_inscricoes_unificadas')
      .select('*', { count: 'exact' })
      .order('criado_em', { ascending: false })
      .range(page * porPagina, page * porPagina + porPagina - 1);

    if (PORTAS_UNIFICADAS.includes(req.query.porta)) q = q.eq('porta', req.query.porta);
    if (STATUS_CANONICOS.includes(req.query.status)) q = q.eq('status_canonico', req.query.status);
    if (req.query.area) q = q.eq('area_display', String(req.query.area).slice(0, 60));
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(req.query.de || ''))) q = q.gte('criado_em', `${req.query.de}T00:00:00-03:00`);
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(req.query.ate || ''))) q = q.lte('criado_em', `${req.query.ate}T23:59:59-03:00`);

    const busca = String(req.query.q || '').trim().slice(0, 120);
    if (busca) {
      const digits = busca.replace(/\D/g, '');
      if (digits.length >= 8) {

        q = q.or(`cpf_norm.like.%${digits}%,telefone_norm.like.%${digits}%`);
      } else {
        q = q.ilike('nome_display', `%${escapePostgrestValue(busca)}%`);
      }
    }

    const { data, error, count } = await q;
    if (error) throw error;
    res.json({ items: data || [], total: count ?? 0, page, porPagina });
  } catch (e) {
    console.error('[inscricoes] unificadas:', e.message);
    res.status(500).json({ error: 'Erro na busca unificada' });
  }
});





async function lerViewUnificada(filtro = (q) => q, colunas = '*') {
  const out = [];
  for (let off = 0; ; off += 1000) {
    const { data, error } = await filtro(
      supabase.from('vw_inscricoes_unificadas').select(colunas).range(off, off + 999)
    );
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}



function chavePessoa(i) {
  if (i.membro_id) return `m:${i.membro_id}`;
  if (i.cpf_norm) return `c:${i.cpf_norm}`;
  if (i.telefone_norm) return `t:${i.telefone_norm}`;
  const nome = String(i.nome_display || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  return `n:${nome}`;
}




router.get('/unificadas/pessoas', authorizeModule('inscricoes', 2), async (req, res) => {
  try {
    const linhas = await lerViewUnificada();
    const mapa = new Map();
    for (const i of linhas) {
      const k = chavePessoa(i);
      if (!mapa.has(k)) {
        mapa.set(k, {
          chave: k, membro_id: i.membro_id || null, nome: i.nome_display,
          cpf: i.cpf_norm || null, telefone: i.telefone_norm || null,
          areas: new Set(), portas: new Set(), inscricoes: [],
        });
      }
      const p = mapa.get(k);
      if (!p.membro_id && i.membro_id) p.membro_id = i.membro_id;
      if (!p.cpf && i.cpf_norm) p.cpf = i.cpf_norm;
      if (!p.telefone && i.telefone_norm) p.telefone = i.telefone_norm;
      if (i.area_display) p.areas.add(i.area_display);
      p.portas.add(i.porta);
      p.inscricoes.push({
        porta: i.porta, evento_rotulo: i.evento_rotulo, edicao_rotulo: i.edicao_rotulo,
        criado_em: i.criado_em, status_canonico: i.status_canonico, rota_detalhe: i.rota_detalhe,
      });
    }

    let pessoas = [...mapa.values()].map(p => ({
      ...p,
      areas: [...p.areas], portas: [...p.portas],
      total: p.inscricoes.length,
      inscricoes: p.inscricoes
        .sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)))
        .slice(0, 20),
    }));

    const busca = String(req.query.q || '').trim().toLowerCase();
    if (busca) {
      const digits = busca.replace(/\D/g, '');
      pessoas = pessoas.filter(p =>
        String(p.nome || '').toLowerCase().includes(busca)
        || (digits.length >= 4 && (String(p.cpf || '').includes(digits) || String(p.telefone || '').includes(digits))));
    } else if (req.query.todas !== '1') {
      pessoas = pessoas.filter(p => p.total >= 2);
    }

    pessoas.sort((a, b) => b.total - a.total || String(a.nome).localeCompare(String(b.nome)));
    const page = Math.max(0, parseInt(req.query.page) || 0);
    const porPagina = 50;
    res.json({
      total_pessoas: pessoas.length,
      total_inscricoes: linhas.length,
      page,
      items: pessoas.slice(page * porPagina, (page + 1) * porPagina),
    });
  } catch (e) {
    console.error('[inscricoes] unificadas/pessoas:', e.message);
    res.status(500).json({ error: 'Erro no rollup de pessoas' });
  }
});






router.get('/unificadas/dashboard', authorizeModule('inscricoes', 1), async (req, res) => {
  try {
    const de = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.de || '')) ? String(req.query.de) : null;
    const ate = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.ate || '')) ? String(req.query.ate) : null;
    const linhas = await lerViewUnificada((q) => {
      let f = q;
      if (de) f = f.gte('criado_em', `${de}T00:00:00-03:00`);
      if (ate) f = f.lte('criado_em', `${ate}T23:59:59-03:00`);
      if (PORTAS_UNIFICADAS.includes(req.query.porta)) f = f.eq('porta', req.query.porta);
      if (req.query.area) f = f.eq('area_display', String(req.query.area).slice(0, 60));
      return f;
    });
    const validas = linhas.filter(l => l.status_canonico !== 'cancelada');

    const hoje = new Date().toISOString().slice(0, 10);
    const chaveEvento = (l) => l.evento_ref ? `${l.porta}:${l.evento_ref}` : (l.serie_chave ? `${l.serie_chave}:${l.edicao_rotulo || ''}` : null);
    const eventos = new Map();
    for (const l of validas) {
      const k = chaveEvento(l);
      if (!k) continue;
      if (!eventos.has(k)) eventos.set(k, { rotulo: l.evento_rotulo, data: l.evento_data, total: 0 });
      eventos.get(k).total += 1;
    }
    const realizados = [...eventos.values()].filter(e => e.data && e.data < hoje).length;

    const mensuraveis = validas.filter(l => l.compareceu !== null && l.compareceu !== undefined);
    const presentes = mensuraveis.filter(l => l.compareceu === true).length;


    let arrecadacao = 0;
    try {
      const { data: pagos } = await supabase.from('insc_pagamentos')
        .select('valor_centavos, inscricao:inscricoes(evento_id)').eq('status', 'pago').limit(10000);

      const parceiros = new Set(await idsEventosParceiros());
      arrecadacao = (pagos || [])
        .filter((p) => !parceiros.has(p.inscricao?.evento_id))
        .reduce((s, p) => s + (p.valor_centavos || 0), 0);
    } catch {                                                             }


    const porDia = new Map();
    const fmtBRT = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
    for (const l of validas) {
      const d = fmtBRT.format(new Date(l.criado_em));
      porDia.set(d, (porDia.get(d) || 0) + 1);
    }
    const serieDiaria = [...porDia.entries()].sort((a, b) => a[0].localeCompare(b[0]))
      .map(([data, total]) => ({ data, total }));


    const series = new Map();
    for (const l of validas) {
      if (!l.serie_chave || !l.edicao_rotulo) continue;
      if (!series.has(l.serie_chave)) series.set(l.serie_chave, new Map());
      const ed = series.get(l.serie_chave);
      ed.set(l.edicao_rotulo, (ed.get(l.edicao_rotulo) || 0) + 1);
    }
    const comparador = [...series.entries()]
      .map(([serie, ed]) => ({
        serie,
        total: [...ed.values()].reduce((s, n) => s + n, 0),
        edicoes: [...ed.entries()].sort((a, b) => a[0].localeCompare(b[0]))
          .map(([edicao, total]) => ({ edicao, total })),
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);

    const ranking = [...eventos.values()].sort((a, b) => b.total - a.total).slice(0, 10);
    const porPorta = {};
    for (const l of validas) porPorta[l.porta] = (porPorta[l.porta] || 0) + 1;

    res.json({
      cards: {
        inscricoes_total: validas.length,
        eventos_realizados: realizados,
        media_por_evento: eventos.size ? Math.round((validas.length / eventos.size) * 10) / 10 : 0,
        arrecadacao_centavos: arrecadacao,
        comparecimento_pct: mensuraveis.length ? Math.round((presentes / mensuraveis.length) * 1000) / 10 : null,
        comparecimento_base: mensuraveis.length,
      },
      serie_diaria: serieDiaria,
      comparador,
      ranking,
      por_porta: porPorta,
    });
  } catch (e) {
    console.error('[inscricoes] unificadas/dashboard:', e.message);
    res.status(500).json({ error: 'Erro no dashboard' });
  }
});









const PORTAS_SISTEMA = portasSatelites();




async function statusPortas() {
  const st = { grupos: { aberta: null, detalhe: null }, next: { aberta: null, detalhe: null } };
  try {
    const { data, error } = await supabase.from('mem_temporadas')
      .select('label, inscricoes_abertas').eq('inscricoes_abertas', true).limit(1);
    if (error) throw error;
    st.grupos = data && data.length
      ? { aberta: true, detalhe: data[0].label || 'temporada aberta' }
      : { aberta: false, detalhe: 'nenhuma temporada com inscrições abertas' };
  } catch (e) { console.error('[inscricoes] portas/status grupos:', e.message); }
  try {
    const { data, error } = await supabase.from('next_turmas')
      .select('nome').eq('status', 'aberta').is('deleted_at', null).limit(1);
    if (error) throw error;
    st.next = data && data.length
      ? { aberta: true, detalhe: data[0].nome || 'turma aberta' }
      : { aberta: false, detalhe: 'nenhuma turma aberta' };
  } catch (e) { console.error('[inscricoes] portas/status next:', e.message); }
  return st;
}




async function resumoPortas(fontes) {
  const corte30d = new Date(Date.now() - 30 * 86400000).toISOString();
  const { data, error } = await supabase.rpc('fn_insc_portas_resumo', {
    p_portas: fontes,
    p_corte_30d: corte30d,
  });
  if (!error && Array.isArray(data)) {
    const mapa = new Map();
    for (const linha of data) {
      if (!mapa.has(linha.porta)) {
        mapa.set(linha.porta, {
          total: Number(linha.total || 0),
          ultimos_30d: Number(linha.ultimos_30d || 0),
          edicoes: [],
        });
      }
      if (linha.edicao_rotulo) {
        mapa.get(linha.porta).edicoes.push({
          rotulo: linha.edicao_rotulo,
          total: Number(linha.edicao_total || 0),
          ultima_em: linha.ultima_em || null,
        });
      }
    }
    return mapa;
  }

  if (error) {
    console.warn('[inscricoes] fn_insc_portas_resumo indisponível; usando fallback compatível:', error.message);
  }
  const linhas = await lerViewUnificada(
    (q) => q.in('porta', fontes),
    'porta, edicao_rotulo, status_canonico, criado_em',
  );
  const mapa = new Map();
  for (const linha of linhas) {
    if (linha.status_canonico === 'cancelada') continue;
    if (!mapa.has(linha.porta)) mapa.set(linha.porta, { total: 0, ultimos_30d: 0, edicoes: [] });
    const item = mapa.get(linha.porta);
    item.total += 1;
    if (linha.criado_em >= corte30d) item.ultimos_30d += 1;
    const rotulo = linha.edicao_rotulo || 'sem edição';
    let edicao = item.edicoes.find((e) => e.rotulo === rotulo);
    if (!edicao) {
      edicao = { rotulo, total: 0, ultima_em: null };
      item.edicoes.push(edicao);
    }
    edicao.total += 1;
    if (!edicao.ultima_em || linha.criado_em > edicao.ultima_em) edicao.ultima_em = linha.criado_em;
  }
  return mapa;
}








router.get('/pagamento-saude', authorizeModule('inscricoes', 1), async (req, res) => {
  try {
    const pagamentos = require('../services/pagamentos');
    if (req.query.verificar === '1') {
      const nivel = req.user?.granular?.modulePerms?.inscricoes?.leitura ?? 0;
      if (nivel < 3) return res.status(403).json({ error: 'sem permissão para forçar a verificação' });
      await pagamentos.verificarSaude({ forcar: true });
    }
    res.json(await pagamentos.saudeAtual());
  } catch (e) {


    console.error('[inscricoes] pagamento-saude:', e.message);
    res.json({ aviso: 'não foi possível ler o estado da credencial', detalhe: e.message });
  }
});




router.get('/portas', authorizeModule('inscricoes', 1), async (_req, res) => {
  try {
    const todasPortas = PORTAS_SISTEMA.flatMap((p) => p.portas);
    const [resumos, st] = await Promise.all([
      resumoPortas(todasPortas),
      statusPortas(),
    ]);

    const portas = PORTAS_SISTEMA.map((p) => {
      const combinado = { total: 0, ultimos_30d: 0, edicoes: new Map() };
      for (const fonte of p.portas) {
        const resumo = resumos.get(fonte);
        if (!resumo) continue;
        combinado.total += resumo.total;
        combinado.ultimos_30d += resumo.ultimos_30d;
        for (const item of resumo.edicoes) {
          const edicao = combinado.edicoes.get(item.rotulo)
            || { rotulo: item.rotulo, total: 0, ultima_em: null };
          edicao.total += item.total;
          if (!edicao.ultima_em || item.ultima_em > edicao.ultima_em) edicao.ultima_em = item.ultima_em;
          combinado.edicoes.set(item.rotulo, edicao);
        }
      }
      const status = p.continua
        ? { aberta: true, detalhe: 'porta contínua — o formulário não fecha' }
        : (st[p.chave] || { aberta: null, detalhe: null });
      return {
        chave: p.chave, nome: p.nome, modulo: p.modulo,
        link: p.link, gestao: p.gestao, continua: !!p.continua,
        aberta: status.aberta, aberta_detalhe: status.detalhe,
        total: combinado.total,
        ultimos_30d: combinado.ultimos_30d,
        edicoes: [...combinado.edicoes.values()]
          .sort((a, b) => String(b.ultima_em || '').localeCompare(String(a.ultima_em || '')))
          .slice(0, 10),
      };
    });


    res.json({ portas, catalogo: catalogoPublico() });
  } catch (e) {
    console.error('[inscricoes] portas:', e.message);
    res.status(500).json({ error: 'Erro ao carregar as portas públicas' });
  }
});




const QR_SELECT_BASE = `id, primeira_emissao_em, ultima_emissao_em, emissoes, canais,
  revogado_em, revogado_por, revogacao_motivo,
  inscricao:inscricoes!inner(id, nome_completo, status, evento_id,
    evento:insc_eventos!inner(id, nome, slug))`;
const QR_SELECT_REATIVACAO = ', reativado_em, reativado_por, reativacao_motivo';
const tabelaAusente = (error) => !!error && ['PGRST205', '42P01'].includes(error.code);
const colunaAusente = (error) => !!error && ['42703', 'PGRST204'].includes(error.code);



async function nomesDeOperadores(ids) {
  const unicos = [...new Set(ids.filter(Boolean))];
  if (!unicos.length) return {};
  try {
    const { data } = await supabase.from('profiles').select('id, name').in('id', unicos.slice(0, 200));
    return Object.fromEntries((data || []).map((p) => [p.id, p.name]));
  } catch { return {}; }
}






router.get('/qrs', authorizeModule('inscricoes', 2), async (req, res) => {
  try {
    const page = Math.max(0, parseInt(req.query.page) || 0);
    const limit = Math.min(200, Math.max(20, parseInt(req.query.limit) || 50));
    const eventoId = /^[0-9a-f-]{36}$/i.test(String(req.query.evento_id || ''))
      ? String(req.query.evento_id) : null;
    const busca = String(req.query.q || '').trim().slice(0, 120);

    const montarLista = (select) => {
      let q = supabase.from('insc_qr_tokens')
        .select(select, { count: 'exact' })
        .order('ultima_emissao_em', { ascending: false })
        .range(page * limit, page * limit + limit - 1);
      if (eventoId) q = q.eq('inscricao.evento_id', eventoId);
      if (busca) q = q.ilike('inscricao.nome_completo', `%${escapePostgrestValue(busca)}%`);
      if (req.query.estado === 'ativo') q = q.is('revogado_em', null);
      if (req.query.estado === 'revogado') q = q.not('revogado_em', 'is', null);
      return q;
    };

    let lista = await montarLista(QR_SELECT_BASE + QR_SELECT_REATIVACAO);
    let temReativacao = true;
    if (colunaAusente(lista.error)) {

      temReativacao = false;
      lista = await montarLista(QR_SELECT_BASE);
    }
    if (tabelaAusente(lista.error)) {
      return res.json({
        items: [], total_registrados: 0, total_elegiveis: 0, total_paginas: 0,
        page: 0, por_pagina: limit, reativacao_disponivel: false, inventario_disponivel: false,
        aviso: 'O inventário de QR ainda não foi criado no banco (migration pendente).',
      });
    }
    if (lista.error) throw lista.error;

    let elegiveisQuery = supabase.from('inscricoes')
      .select('*', { count: 'exact', head: true })
      .is('deleted_at', null).neq('status', 'cancelada');
    if (eventoId) elegiveisQuery = elegiveisQuery.eq('evento_id', eventoId);
    const elegiveis = await elegiveisQuery;
    if (elegiveis.error) throw elegiveis.error;

    const dados = lista.data || [];
    const nomes = await nomesDeOperadores(
      dados.flatMap((item) => [item.revogado_por, item.reativado_por]),
    );
    const itens = dados.map((item) => ({
      id: item.id,
      primeira_emissao_em: item.primeira_emissao_em,
      ultima_emissao_em: item.ultima_emissao_em,
      emissoes: item.emissoes,
      canais: item.canais,
      ativo: !item.revogado_em,
      revogado_em: item.revogado_em,
      revogacao_motivo: item.revogacao_motivo,
      revogado_por_nome: nomes[item.revogado_por] || null,
      reativado_em: item.reativado_em ?? null,
      reativacao_motivo: item.reativacao_motivo ?? null,
      reativado_por_nome: nomes[item.reativado_por] || null,
      inscricao: item.inscricao,
    }));
    const total = lista.count ?? 0;
    res.json({
      items: itens,
      total_registrados: total,
      total_ativos_pagina: itens.filter((item) => item.ativo).length,
      total_elegiveis: elegiveis.count ?? 0,
      total_paginas: Math.max(1, Math.ceil(total / limit)),
      page,
      por_pagina: limit,
      inventario_disponivel: true,
      reativacao_disponivel: temReativacao,
    });
  } catch (e) {
    console.error('[inscricoes] inventário QR:', e.message);
    res.status(500).json({ error: 'Erro ao carregar o inventário de QR' });
  }
});



router.patch('/qrs/:id/revogar', authorizeModule('inscricoes', 3), async (req, res) => {
  try {
    const motivo = String(req.body?.motivo || '').trim().slice(0, 500);
    if (motivo.length < 3) return res.status(400).json({ error: 'Informe o motivo da revogação' });
    const { data, error } = await supabase.from('insc_qr_tokens')
      .update({
        revogado_em: new Date().toISOString(),
        revogado_por: req.user?.id || null,
        revogacao_motivo: motivo,
      })
      .eq('id', req.params.id).is('revogado_em', null)
      .select('id, revogado_em').maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'QR ativo não encontrado' });
    res.json({ ok: true, ...data });
  } catch (e) {
    console.error('[inscricoes] revogar QR:', e.message);
    res.status(500).json({ error: 'Erro ao revogar o QR' });
  }
});






router.patch('/qrs/:id/reativar', authorizeModule('inscricoes', 3), async (req, res) => {
  try {
    const motivo = String(req.body?.motivo || '').trim().slice(0, 500);
    if (motivo.length < 3) return res.status(400).json({ error: 'Informe o motivo da reativação' });
    const { data, error } = await supabase.from('insc_qr_tokens')
      .update({
        revogado_em: null,
        revogado_por: null,
        revogacao_motivo: null,
        reativado_em: new Date().toISOString(),
        reativado_por: req.user?.id || null,
        reativacao_motivo: motivo,
      })
      .eq('id', req.params.id).not('revogado_em', 'is', null)
      .select('id, reativado_em').maybeSingle();
    if (colunaAusente(error)) {
      return res.status(409).json({
        error: 'A reativação de QR depende de uma migration ainda não aplicada no banco.',
        motivo: 'migration_pendente',
      });
    }
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'QR revogado não encontrado' });
    res.json({ ok: true, ...data });
  } catch (e) {
    console.error('[inscricoes] reativar QR:', e.message);
    res.status(500).json({ error: 'Erro ao reativar o QR' });
  }
});





router.get('/igrejas-parceiras', authorizeModule('inscricoes', 1), async (_req, res) => {
  try {
    const { data, error } = await supabase.from('igrejas')
      .select('id, nome, slug, cidade, estado, ativa')
      .eq('tipo', TIPO_PARCEIRA)
      .order('nome');
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    console.error('[inscricoes] igrejas parceiras:', e.message);
    res.status(500).json({ error: 'Erro ao listar igrejas parceiras' });
  }
});

router.post('/igrejas-parceiras', authorizeModule('inscricoes', 3), async (req, res) => {
  try {
    const b = req.body || {};
    const nome = String(b.nome || '').trim().slice(0, 120);
    if (nome.length < 3) return res.status(400).json({ error: 'Informe o nome da igreja parceira.' });
    const base = slugify(nome) || 'igreja';

    let slug = base;
    for (let i = 2; i < 20; i += 1) {
      const { data: ex } = await supabase.from('igrejas').select('id').eq('slug', slug).maybeSingle();
      if (!ex) break;
      slug = `${base}-${i}`;
    }
    const { data, error } = await supabase.from('igrejas').insert({
      nome, slug, tipo: TIPO_PARCEIRA,
      cidade: String(b.cidade || '').trim().slice(0, 80) || null,
      estado: String(b.estado || '').trim().slice(0, 2).toUpperCase() || null,
      observacoes: 'Igreja parceira (CBA) · cadastrada pelo módulo de Inscrições',
      ativa: true,
    }).select('id, nome, slug, cidade, estado, ativa').single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    console.error('[inscricoes] criar igreja parceira:', e.message);
    res.status(500).json({ error: 'Erro ao cadastrar igreja parceira' });
  }
});




async function serieGenesis() {
  const { data, error } = await supabase.from('insc_series')
    .select('id, nome, slug_base, area, responsavel_id, responsavel:profiles!insc_series_responsavel_id_fkey(id, name)')
    .eq('slug_base', genesis.SLUG_BASE_GENESIS).is('deleted_at', null).maybeSingle();
  if (!error) return data;


  const r = await supabase.from('insc_series').select('id, nome, slug_base, area')
    .eq('slug_base', genesis.SLUG_BASE_GENESIS).is('deleted_at', null).maybeSingle();
  if (r.error) throw r.error;
  return r.data;
}

router.get('/genesis', authorizeModule('inscricoes', 1), async (_req, res) => {
  try {
    const serie = await serieGenesis();
    if (!serie) return res.json({ serie: null, edicoes: [], resumo: genesis.resumoGenesis([]) });
    const { data: eds, error } = await supabase.from('insc_eventos')
      .select('id, nome, slug, data, hora, local, status, vagas, igreja_id, igreja:igrejas(id, nome, cidade, estado)')
      .eq('serie_id', serie.id).is('deleted_at', null)
      .order('data', { ascending: false, nullsFirst: false });
    if (error) throw error;
    const contagem = await contarInscritosVivos(supabase, (eds || []).map((e) => e.id));
    const edicoes = (eds || []).map((e) => ({ ...e, inscritos: contagem.get(e.id) || 0 }));
    res.json({ serie, edicoes, resumo: genesis.resumoGenesis(edicoes) });
  } catch (e) {
    console.error('[inscricoes] genesis:', e.message);
    res.status(500).json({ error: 'Erro ao carregar o Genesis CBA' });
  }
});



router.post('/genesis/edicoes', authorizeModule('inscricoes', 3), async (req, res) => {
  try {
    const b = req.body || {};
    const data = genesis.rotuloEdicaoGenesis(String(b.data || '').slice(0, 10));
    if (!data) return res.status(400).json({ error: 'Informe a data do Genesis' });
    const igreja = b.igreja_id ? await igrejaParceiraPorId(String(b.igreja_id)) : null;
    if (!igreja) return res.status(400).json({ error: 'Escolha a igreja sede (igreja parceira)' });
    const serie = await serieGenesis();
    if (!serie) return res.status(409).json({ error: 'A série Genesis CBA não existe (migration 20260924170000).' });

    const { data: ultima } = await supabase.from('insc_eventos').select('*')
      .eq('serie_id', serie.id).is('deleted_at', null)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();

    const slug = await slugUnico(slugify(`genesis-${igreja.slug || igreja.nome}-${data}`));
    const novo = {
      nome: genesis.nomeEdicao(igreja.nome), slug, area: serie.area, tipo: 'evento',
      serie_id: serie.id, edicao_rotulo: data, igreja_id: igreja.id, no_totem: false,
      data, hora: b.hora ? String(b.hora).slice(0, 5) : (ultima?.hora || null),
      local: String(b.local || '').trim() || null,
      campos: ultima?.campos?.length ? ultima.campos : genesis.camposGenesis(),
      descricao: ultima?.descricao || null, capa_url: ultima?.capa_url || null,
      msg_sucesso_titulo: ultima?.msg_sucesso_titulo || null, msg_sucesso_texto: ultima?.msg_sucesso_texto || null,
      checkin_ativo: ultima?.checkin_ativo ?? false,
      status: 'rascunho', created_by: req.user?.id || null,
    };
    const { data: criado, error } = await supabase.from('insc_eventos').insert(novo).select('id, slug').single();
    if (error) throw error;
    res.status(201).json(criado);
  } catch (e) {
    console.error('[inscricoes] nova edição genesis:', e.message);
    res.status(500).json({ error: 'Erro ao criar o Genesis' });
  }
});

router.get('/eventos', authorizeModule('inscricoes', 1), async (_req, res) => {
  try {
    const { data, error } = await supabase.from('insc_eventos')
      .select('id, nome, slug, area, tipo, data, hora, local, capa_url, status, vagas, tem_sorteio, checkin_ativo, no_totem, pagamento_ativo, valor_centavos, edicao_rotulo, serie_id, igreja_id, serie:insc_series(id, nome, periodicidade, recorre_ate, slug_base), igreja:igrejas(id, nome, tipo)')
      .is('deleted_at', null)
      .order('data', { ascending: false, nullsFirst: false });
    if (error) throw error;
    const contagem = await contarInscritosVivos(supabase, (data || []).map((e) => e.id));
    res.json((data || []).map(e => ({ ...e, inscritos: contagem.get(e.id) || 0 })));
  } catch (e) {
    console.error('[inscricoes] eventos:', e.message);
    res.status(500).json({ error: 'Erro ao listar eventos' });
  }
});


router.get('/eventos/:id', authorizeModule('inscricoes', 1), async (req, res) => {
  try {
    const { data, error } = await supabase.from('insc_eventos')
      .select('*, serie:insc_series(id, nome, periodicidade, slug_base), sorteios:insc_sorteios(id, premio, numero_sorteado, inscricao_id, ganhador_nome, sorteado_em)')
      .eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Evento não encontrado' });








    const substituidos = new Set();
    try {
      const { data: subs } = await supabase.from('insc_sorteios')
        .select('id').eq('evento_id', req.params.id).not('substituido_em', 'is', null);
      for (const s of (subs || [])) substituidos.add(s.id);
    } catch {                                    }
    const sorteios = (data.sorteios || [])
      .filter((s) => !substituidos.has(s.id))
      .sort((a, b) => String(b.sorteado_em).localeCompare(String(a.sorteado_em)));

    const contagem = await contarInscritosVivos(supabase, [data.id]);
    res.json({ ...data, inscritos: contagem.get(data.id) || 0, sorteios });
  } catch (e) {
    console.error('[inscricoes] evento:', e.message);
    res.status(500).json({ error: 'Erro ao carregar evento' });
  }
});







const INSCRITOS_COLS = 'id, codigo, nome_completo, telefone, email, data_nascimento, sexo, membro_id, status, numero_sorte, whatsapp_optin, dados, created_at, origem, '



  + 'valor_cobrado_centavos, bolsa_tipo, bolsa_motivo, bolsa_por_nome, bolsa_em';
















async function lerInscritosDoEvento(eventoId, { busca = '', status = '', limit = 0, offset = 0 } = {}) {
  const monta = (comContagem) => {
    let q = supabase.from('inscricoes')
      .select(INSCRITOS_COLS, comContagem ? { count: 'exact' } : undefined)
      .eq('evento_id', eventoId).is('deleted_at', null);
    if (status) q = q.eq('status', status);
    const termo = String(busca || '').trim().slice(0, 80);
    if (termo) {
      const digits = termo.replace(/\D/g, '');


      q = digits.length >= 4
        ? q.or(`nome_completo.ilike.%${escapePostgrestValue(termo)}%,telefone.like.%${digits}%`)
        : q.ilike('nome_completo', `%${termo}%`);
    }
    return q.order('created_at', { ascending: false });
  };

  let inscritos = [];
  let total = null;
  if (limit > 0) {
    const { data, error, count } = await monta(true).range(offset, offset + limit - 1);
    if (error) throw error;
    inscritos = data || [];
    total = count ?? null;
  } else {
    for (let off = 0; off < 20000; off += 1000) {
      const { data, error } = await monta(false).range(off, off + 999);
      if (error) throw error;
      inscritos.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    total = inscritos.length;
  }









  try {
    const idsResp = inscritos.map((i) => i.id);
    const resps = [];
    for (let i = 0; i < idsResp.length; i += 200) {
      const { data, error } = await supabase.from('inscricoes')
        .select('id, responsavel_nome, responsavel_cpf, responsavel_parentesco, responsavel_telefone, responsavel_email, responsavel_autoriza_batismo')
        .in('id', idsResp.slice(i, i + 200));
      if (error) throw error;
      resps.push(...(data || []));
    }
    const porId = new Map(resps.map((r) => [r.id, r]));
    for (const ins of inscritos) {
      const r = porId.get(ins.id);



      if (r && r.responsavel_nome) {
        ins.responsavel = {
          nome: r.responsavel_nome,
          cpf: r.responsavel_cpf || null,
          parentesco: r.responsavel_parentesco || null,
          telefone: r.responsavel_telefone || null,
          email: r.responsavel_email || null,
          autoriza_batismo: r.responsavel_autoriza_batismo,
        };
      }
    }
  } catch (e) {
    console.warn('[inscricoes] responsável do menor indisponível:', e.message);
  }



  let porInscricao = new Map();
  try {
    const pagamentos = [];
    if (limit > 0) {


      const ids = inscritos.map((i) => i.id);
      for (let i = 0; i < ids.length; i += 200) {
        const { data, error } = await supabase.from('vw_insc_pagamento_estado')
          .select('inscricao_id, metodo, status_pagamento, valor_centavos, valor_pago_centavos, pago_em, parcelas_total, cartao_brand, cartao_last4')
          .in('inscricao_id', ids.slice(i, i + 200));
        if (error) throw error;
        pagamentos.push(...(data || []));
      }
    } else {
      for (let off = 0; off < 20000; off += 1000) {
        const { data, error } = await supabase.from('vw_insc_pagamento_estado')
          .select('inscricao_id, metodo, status_pagamento, valor_centavos, valor_pago_centavos, pago_em, parcelas_total, cartao_brand, cartao_last4')
          .eq('evento_id', eventoId)
          .range(off, off + 999);
        if (error) throw error;
        pagamentos.push(...(data || []));
        if (!data || data.length < 1000) break;
      }
    }
    porInscricao = new Map(pagamentos.map((p) => [p.inscricao_id, p]));
  } catch (e) {
    console.error('[inscricoes] estado de pagamento indisponível:', e.message);
  }




  const porComprovante = await comprovantesResumoPorInscricao(
    eventoId, limit > 0 ? inscritos.map((i) => i.id) : null,
  );





  let comLote = inscritos;
  try {
    const { data: evLotes, error: eLotes } = await supabase.from('insc_eventos')
      .select('lotes').eq('id', eventoId).maybeSingle();
    if (eLotes) throw eLotes;
    comLote = anexarLoteNasInscricoes(evLotes?.lotes || [], inscritos, { completo: !(limit > 0) });
  } catch (e) {
    console.error('[inscricoes] lote por inscrição indisponível:', e.message);
  }

  return {
    itens: comLote.map((i) => ({
      ...i,
      pagamento: porInscricao.get(i.id) || null,
      comprovantes: porComprovante.get(i.id) || null,
    })),
    total,
  };
}








async function comprovantesResumoPorInscricao(eventoId, ids) {
  const mapa = new Map();
  try {
    const linhas = [];
    if (Array.isArray(ids)) {
      for (let i = 0; i < ids.length; i += 200) {
        const { data, error } = await supabase.from('insc_comprovantes')
          .select('inscricao_id, status, created_at')
          .in('inscricao_id', ids.slice(i, i + 200)).is('deleted_at', null);
        if (error) throw error;
        linhas.push(...(data || []));
      }
    } else {
      for (let off = 0; off < 20000; off += 1000) {
        const { data, error } = await supabase.from('insc_comprovantes')
          .select('inscricao_id, status, created_at, inscricoes!inner(evento_id)')
          .eq('inscricoes.evento_id', eventoId).is('deleted_at', null)
          .range(off, off + 999);
        if (error) throw error;
        linhas.push(...(data || []));
        if (!data || data.length < 1000) break;
      }
    }
    for (const l of linhas) {
      const atual = mapa.get(l.inscricao_id)
        || { total: 0, em_analise: 0, ultimo_status: null, ultimo_em: null };
      atual.total += 1;
      if (l.status === 'em_analise') atual.em_analise += 1;
      if (!atual.ultimo_em || l.created_at > atual.ultimo_em) {
        atual.ultimo_em = l.created_at;
        atual.ultimo_status = l.status;
      }
      mapa.set(l.inscricao_id, atual);
    }
  } catch (e) {
    console.error('[inscricoes] comprovantes indisponíveis:', e.message);
  }
  return mapa;
}






async function contadoresEvento(eventoId) {
  const base = () => supabase.from('inscricoes')
    .select('id', { count: 'exact', head: true })
    .eq('evento_id', eventoId).is('deleted_at', null);
  const conta = async (q) => { const { count, error } = await q; if (error) throw error; return count || 0; };

  const [inscritos, confirmadas, aguardando, canceladas] = await Promise.all([
    conta(base()),
    conta(base().eq('status', 'confirmada')),
    conta(base().eq('status', 'recebida')),
    conta(base().eq('status', 'cancelada')),
  ]);


  let presentes = 0;
  try {
    presentes = await conta(supabase.from('insc_checkins')
      .select('inscricao_id, inscricao:inscricoes!inner(evento_id)', { count: 'exact', head: true })
      .eq('inscricao.evento_id', eventoId));
  } catch (e) {
    console.error('[inscricoes] contagem de check-in indisponível:', e.message);
  }







  let arrecadado_centavos = null;
  let por_metodo = null;
  try {
    let soma = 0;
    const formas = {};
    for (let off = 0; off < 20000; off += 1000) {
      const { data, error } = await supabase.from('vw_insc_pagamento_estado')
        .select('valor_pago_centavos, metodo')
        .eq('evento_id', eventoId).eq('status_pagamento', 'pago')
        .range(off, off + 999);
      if (error) throw error;
      for (const p of (data || [])) {
        soma += Number(p.valor_pago_centavos || 0);

        const k = p.metodo || 'nao_informado';
        formas[k] = (formas[k] || 0) + 1;
      }
      if (!data || data.length < 1000) break;
    }
    arrecadado_centavos = soma;
    por_metodo = formas;
  } catch (e) {
    console.error('[inscricoes] arrecadação indisponível:', e.message);
  }



  let isentas = 0;
  try {
    isentas = await conta(supabase.from('inscricoes')
      .select('id', { count: 'exact', head: true })
      .eq('evento_id', eventoId).is('deleted_at', null)
      .eq('bolsa_tipo', 'integral'));
  } catch (e) {

    console.error('[inscricoes] contagem de isentas indisponível:', e.message);
  }




  let comprovantes_em_analise = 0;
  try {
    comprovantes_em_analise = await conta(supabase.from('insc_comprovantes')
      .select('id, inscricoes!inner(evento_id)', { count: 'exact', head: true })
      .eq('inscricoes.evento_id', eventoId).is('deleted_at', null)
      .eq('status', 'em_analise'));
  } catch (e) {

    console.error('[inscricoes] contagem de comprovantes indisponível:', e.message);
  }







  let por_plataforma = null;
  try {
    const linhas = [];
    for (let off = 0; off < 20000; off += 1000) {
      const { data, error } = await supabase.from('inscricoes')
        .select('origem, status, valor_cobrado_centavos')
        .eq('evento_id', eventoId).is('deleted_at', null)
        .range(off, off + 999);
      if (error) throw error;
      linhas.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    por_plataforma = resumoPorPlataforma(linhas, arrecadado_centavos);
  } catch (e) {
    console.error('[inscricoes] placar por plataforma indisponível:', e.message);
  }

  return {
    inscritos, ativos: inscritos - canceladas, confirmadas,
    aguardando_pagamento: aguardando, canceladas, presentes,
    arrecadado_centavos, por_metodo, isentas, comprovantes_em_analise,
    por_plataforma,
  };
}


router.get('/eventos/:id/inscricoes', authorizeModule('inscricoes', 1), async (req, res) => {
  try {
    const { itens } = await lerInscritosDoEvento(req.params.id);
    res.json(itens);
  } catch (e) {
    console.error('[inscricoes] inscricoes do evento:', e.message);
    res.status(500).json({ error: 'Erro ao listar inscrições' });
  }
});





















router.post('/eventos/:id/inscricoes/:inscricaoId/bolsa', authorizeModule('inscricoes', 3), async (req, res) => {
  try {
    const tipo = String(req.body?.tipo || '').trim();
    const motivo = String(req.body?.motivo || '').trim();
    if (!['integral', 'parcial'].includes(tipo)) {
      return res.status(400).json({ error: 'Tipo da bolsa deve ser "integral" (gratuidade) ou "parcial" (desconto).' });
    }
    if (motivo.length < 3) {
      return res.status(400).json({ error: 'Diga o motivo da bolsa — é o que sustenta a decisão depois.' });
    }

    const { data: ev } = await supabase.from('insc_eventos')
      .select('id, nome, slug, valor_centavos, pagamento_ativo, pagamento_expira_horas, parcelas_max, juros_repassados, pagamento_metodos')
      .eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!ev) return res.status(404).json({ error: 'Evento não encontrado' });
    if (!ev.pagamento_ativo) return res.status(400).json({ error: 'Este evento não é pago — não há o que descontar.' });

    const { data: insc } = await supabase.from('inscricoes')
      .select('id, nome_completo, telefone, email, cpf, status, membro_id, valor_cobrado_centavos')
      .eq('id', req.params.inscricaoId).eq('evento_id', req.params.id)
      .is('deleted_at', null).maybeSingle();
    if (!insc) return res.status(404).json({ error: 'Inscrição não encontrada' });
    if (insc.status === 'cancelada') {
      return res.status(400).json({ error: 'Esta inscrição está cancelada. Reative antes de conceder a bolsa.' });
    }

    const tabela = Number(ev.valor_centavos || 0);
    let valorCobrado = 0;
    if (tipo === 'parcial') {
      const reais = String(req.body?.valor ?? '').replace(',', '.');
      valorCobrado = Math.round(Number(reais) * 100);
      if (!(valorCobrado > 0)) return res.status(400).json({ error: 'Informe quanto esta pessoa vai pagar.' });
      if (valorCobrado >= tabela) {
        return res.status(400).json({ error: `Desconto tem que ser menor que o valor de tabela (R$ ${(tabela / 100).toFixed(2)}).` });
      }
    }

    const pagamentos = require('../services/pagamentos');
    const cobrancaAtual = await pagamentos.consultarPorReferencia(`inscricao:${insc.id}`)
      .catch(() => null);


    const jaPagou = !!cobrancaAtual && cobrancaAtual.valor_pago_centavos > 0;

    const patch = {
      valor_cobrado_centavos: valorCobrado,
      bolsa_tipo: tipo,
      bolsa_motivo: motivo,
      bolsa_por: req.user?.id || null,
      bolsa_por_nome: req.user?.name || req.user?.email || null,
      bolsa_em: new Date().toISOString(),
    };

    if (tipo === 'integral' && !jaPagou) patch.status = 'confirmada';

    const { data: atualizada, error: eUp } = await supabase.from('inscricoes')
      .update(patch).eq('id', insc.id).select('*').single();
    if (eUp) throw eUp;

    const avisos = [];
    if (jaPagou) {
      avisos.push('Esta pessoa já pagou. A bolsa ficou registrada, mas a devolução não é automática — decidam e façam o estorno.');
    } else if (cobrancaAtual && ['criada', 'aguardando_pagamento'].includes(cobrancaAtual.status)) {


      const r = await pagamentos.cancelar(cobrancaAtual.id, {
        motivo: `Bolsa ${tipo} concedida — cobrança reemitida`, preservar_dominio: true,
      });
      if (!r.ok) avisos.push('Não conseguimos cancelar a cobrança anterior no provedor — confira antes de reenviar o link.');


      await supabase.from('insc_pagamentos').update({ status: 'expirado' })
        .eq('cobranca_id', cobrancaAtual.id);
    }

    let novaCobranca = null;
    if (tipo === 'parcial' && !jaPagou) {


      const horas = Number(ev.pagamento_expira_horas) > 0 ? Number(ev.pagamento_expira_horas) : 48;
      try {
        const { cobranca } = await pagamentos.criarCobranca({
          origem_tipo: pagamentos.ORIGENS.INSCRICAO,
          origem_id: insc.id,


          referencia: `inscricao:${insc.id}:b${Date.now().toString(36)}`,
          valor_centavos: valorCobrado,
          descricao: `Inscrição (bolsa) · ${ev.nome}`,




          metodos_ofertados: pagamentos.metodosDisponiveis(
            Array.isArray(ev.pagamento_metodos) ? ev.pagamento_metodos : [],
          ),
          parcelas_max: ev.parcelas_max || null,
          juros_repassados: ev.juros_repassados !== false,
          expira_em: new Date(Date.now() + horas * 3600000).toISOString(),
          pagador_nome: insc.nome_completo,
          pagador_cpf: insc.cpf,
          pagador_email: insc.email,
          pagador_telefone: insc.telefone,
          membro_id: insc.membro_id || null,
          metadata: { evento_id: ev.id, evento_slug: ev.slug, evento_nome: ev.nome, bolsa: tipo },
        });
        novaCobranca = {
          valor_centavos: cobranca.valor_centavos,

          link: `${(process.env.FRONTEND_URL || 'https://cbrio.org').replace(/\/$/, '')}/pagamento/${cobranca.public_token}`,
        };
        await supabase.from('insc_pagamentos').insert({
          inscricao_id: insc.id, cobranca_id: cobranca.id,
          metodo: cobranca.metodo || null, provider: 'psp',
          provider_ref: cobranca.provider_cobranca_id || null,
          valor_centavos: cobranca.valor_centavos, status: 'aguardando',
          qr_payload: cobranca.pix_payload || null, expira_em: cobranca.expira_em || null,
        });
      } catch (e) {
        console.error('[inscricoes] cobrança da bolsa:', e.message);
        avisos.push('A bolsa foi registrada, mas não conseguimos emitir a cobrança nova agora. Tente reemitir em instantes.');
      }
    }

    res.json({ ok: true, inscricao: atualizada, cobranca: novaCobranca, avisos });
  } catch (e) {
    console.error('[inscricoes] bolsa:', e.message);
    res.status(500).json({ error: 'Erro ao registrar a bolsa' });
  }
});




router.delete('/eventos/:id/inscricoes/:inscricaoId/bolsa', authorizeModule('inscricoes', 3), async (req, res) => {
  try {
    const { data, error } = await supabase.from('inscricoes')
      .update({
        valor_cobrado_centavos: null, bolsa_tipo: null, bolsa_motivo: null,
        bolsa_por: null, bolsa_por_nome: null, bolsa_em: null,
      })
      .eq('id', req.params.inscricaoId).eq('evento_id', req.params.id)
      .is('deleted_at', null).select('*').maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Inscrição não encontrada' });
    res.json({ ok: true, inscricao: data });
  } catch (e) {
    console.error('[inscricoes] remover bolsa:', e.message);
    res.status(500).json({ error: 'Erro ao remover a bolsa' });
  }
});











router.get('/eventos/:id/beneficios', authorizeModule('inscricoes', 2), async (req, res) => {
  try {
    const { data, error } = await supabase.from('insc_beneficios')
      .select('*').eq('evento_id', req.params.id).is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ itens: data || [] });
  } catch (e) {
    console.error('[inscricoes] beneficios:', e.message);
    if (/insc_beneficios|does not exist|schema cache/i.test(e.message || '')) {
      return res.json({ itens: [], aviso: 'Benefícios indisponíveis: migration 20260730210000 pendente.' });
    }
    res.status(500).json({ error: 'Erro ao carregar os benefícios' });
  }
});


router.post('/eventos/:id/beneficios', authorizeModule('inscricoes', 3), async (req, res) => {
  try {
    const cpf = String(req.body?.cpf || '').replace(/\D/g, '');



    if (!cpfValido(cpf)) return res.status(400).json({ error: 'CPF inválido' });

    const tipo = req.body?.tipo === 'integral' ? 'integral' : 'parcial';
    const motivo = String(req.body?.motivo || '').trim();
    if (motivo.length < 3) return res.status(400).json({ error: 'Diga o motivo do benefício (fica registrado).' });



    let valor_centavos = null;
    if (tipo === 'parcial') {
      const reais = Number(String(req.body?.valor ?? '').toString().replace(',', '.'));
      valor_centavos = Math.round(reais * 100);
      if (!(valor_centavos > 0)) {
        return res.status(400).json({ error: 'Informe quanto essa pessoa vai pagar (maior que zero).' });
      }


      const { data: ev } = await supabase.from('insc_eventos')
        .select('valor_centavos').eq('id', req.params.id).maybeSingle();
      if (ev?.valor_centavos && valor_centavos >= Number(ev.valor_centavos)) {
        return res.status(400).json({
          error: `O valor com desconto precisa ser menor que o do evento (R$ ${(Number(ev.valor_centavos) / 100).toFixed(2).replace('.', ',')}).`,
        });
      }
    }

    const { data, error } = await supabase.from('insc_beneficios').insert({
      evento_id: req.params.id,
      cpf,
      nome_referencia: req.body?.nome_referencia ? String(req.body.nome_referencia).trim().slice(0, 120) : null,
      tipo,
      valor_centavos,
      motivo: motivo.slice(0, 500),
      criado_por: req.user?.id || null,
      criado_por_nome: req.user?.name || req.user?.email || null,
    }).select('*').single();
    if (error) {

      if (error.code === '23505') {
        return res.status(409).json({ error: 'Este CPF já tem um benefício cadastrado neste evento.' });
      }
      throw error;
    }
    res.status(201).json({ ok: true, beneficio: data });
  } catch (e) {
    console.error('[inscricoes] criar beneficio:', e.message);
    res.status(500).json({ error: 'Erro ao cadastrar o benefício' });
  }
});




router.delete('/eventos/:id/beneficios/:beneficioId', authorizeModule('inscricoes', 3), async (req, res) => {
  try {
    const { data, error } = await supabase.from('insc_beneficios')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', req.params.beneficioId).eq('evento_id', req.params.id)
      .is('deleted_at', null).select('id, usado_em').maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Benefício não encontrado' });
    res.json({
      ok: true,
      ja_usado: !!data.usado_em,
      aviso: data.usado_em
        ? 'A autorização saiu da lista, mas a inscrição que já usou continua com o valor concedido — altere na ficha da pessoa se precisar.'
        : null,
    });
  } catch (e) {
    console.error('[inscricoes] remover beneficio:', e.message);
    res.status(500).json({ error: 'Erro ao remover o benefício' });
  }
});











const COMPROVANTE_URL_SEGUNDOS = 900;

async function carregarComprovantes(eventoId, inscricaoId) {
  const { data, error } = await supabase.from('insc_comprovantes')
    .select('*, inscricoes!inner(id, evento_id, nome_completo)')
    .eq('inscricao_id', inscricaoId).eq('inscricoes.evento_id', eventoId)
    .is('deleted_at', null).order('created_at', { ascending: false });
  if (error) throw error;
  const linhas = data || [];



  let urls = new Map();
  if (linhas.length) {
    try {
      const { data: assinadas } = await supabase.storage.from('inscricao-comprovantes')
        .createSignedUrls(linhas.map((l) => l.storage_path), COMPROVANTE_URL_SEGUNDOS);
      urls = new Map((assinadas || []).map((a) => [a.path, a.signedUrl]));
    } catch (e) {
      console.error('[inscricoes] assinar comprovantes:', e.message);
    }
  }
  return linhas.map((l) => {


    const { storage_path, inscricoes, ...resto } = l;
    return { ...resto, url: urls.get(storage_path) || null };
  });
}



router.get('/eventos/:id/inscricoes/:inscricaoId/comprovantes', authorizeModule('inscricoes', 1), async (req, res) => {
  try {
    res.json({ itens: await carregarComprovantes(req.params.id, req.params.inscricaoId) });
  } catch (e) {
    console.error('[inscricoes] comprovantes:', e.message);


    if (/insc_comprovantes|does not exist|schema cache/i.test(e.message || '')) {
      return res.json({ itens: [], aviso: 'Comprovantes indisponíveis: migration 20260730200000 pendente.' });
    }
    res.status(500).json({ error: 'Erro ao carregar os comprovantes' });
  }
});







router.post('/eventos/:id/inscricoes/:inscricaoId/comprovantes/:comprovanteId/aceitar',
  authorizeModule('inscricoes', 3), async (req, res) => {
    try {
      const { data: comp, error } = await supabase.from('insc_comprovantes')
        .select('*, inscricoes!inner(id, evento_id)')
        .eq('id', req.params.comprovanteId).eq('inscricao_id', req.params.inscricaoId)
        .eq('inscricoes.evento_id', req.params.id).is('deleted_at', null).maybeSingle();
      if (error) throw error;
      if (!comp) return res.status(404).json({ error: 'Comprovante não encontrado' });

      const pagamentos = require('../services/pagamentos');
      const autor = req.user?.name || req.user?.email || req.user?.id || 'equipe';
      let resultado = { semCobranca: true };

      if (comp.cobranca_id) {
        const r = await pagamentos.marcarPagoManual(comp.cobranca_id, {
          confirmado_por: autor,


          valor_centavos: Number(req.body?.valor_centavos) > 0 ? Number(req.body.valor_centavos) : undefined,
          metodo: comp.metodo_declarado,
          observacao: `Comprovante ${comp.id} conferido por ${autor}`,
        });


        if (!r.ok) return res.status(409).json({ error: r.motivo || 'Não foi possível baixar o pagamento' });
        resultado = { pago: true, ja_estava_pago: !!r.semMudanca };
      }

      const { data: atualizado, error: e2 } = await supabase.from('insc_comprovantes')
        .update({
          status: 'aceito', motivo_recusa: null,
          revisado_por: req.user?.id || null, revisado_por_nome: autor,
          revisado_em: new Date().toISOString(),
        })
        .eq('id', comp.id).select('id, status, revisado_em, revisado_por_nome').single();
      if (e2) throw e2;

      res.json({ ok: true, comprovante: atualizado, ...resultado });
    } catch (e) {
      console.error('[inscricoes] aceitar comprovante:', e.message);
      res.status(500).json({ error: 'Erro ao aceitar o comprovante' });
    }
  });




router.post('/eventos/:id/inscricoes/:inscricaoId/comprovantes/:comprovanteId/recusar',
  authorizeModule('inscricoes', 3), async (req, res) => {
    try {
      const motivo = String(req.body?.motivo || '').trim();
      if (motivo.length < 3) return res.status(400).json({ error: 'Diga o motivo da recusa (a pessoa vai ler pra corrigir).' });

      const autor = req.user?.name || req.user?.email || req.user?.id || 'equipe';
      const { data, error } = await supabase.from('insc_comprovantes')
        .update({
          status: 'recusado', motivo_recusa: motivo.slice(0, 500),
          revisado_por: req.user?.id || null, revisado_por_nome: autor,
          revisado_em: new Date().toISOString(),
        })
        .eq('id', req.params.comprovanteId).eq('inscricao_id', req.params.inscricaoId)
        .is('deleted_at', null).select('id, status, motivo_recusa, revisado_em, revisado_por_nome').maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: 'Comprovante não encontrado' });
      res.json({ ok: true, comprovante: data });
    } catch (e) {
      console.error('[inscricoes] recusar comprovante:', e.message);
      res.status(500).json({ error: 'Erro ao recusar o comprovante' });
    }
  });






router.get('/eventos/:id/resumo', authorizeModule('inscricoes', 1), async (req, res) => {
  try {
    const { data: ev, error } = await supabase.from('insc_eventos')
      .select('id, nome, slug, data, hora, local, status, vagas, valor_centavos, pagamento_ativo, checkin_ativo, tem_sorteio')
      .eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (error) throw error;
    if (!ev) return res.status(404).json({ error: 'Evento não encontrado' });
    res.json({ evento: ev, contadores: await contadoresEvento(req.params.id) });
  } catch (e) {
    console.error('[inscricoes] resumo do evento:', e.message);
    res.status(500).json({ error: 'Erro ao carregar o resumo do evento' });
  }
});











router.get('/app/eventos', authorizeModule('inscricoes', 1), async (req, res) => {
  try {
    let q = supabase.from('insc_eventos')
      .select('id, nome, slug, area, data, hora, local, status, vagas, pagamento_ativo, valor_centavos, checkin_ativo, edicao_rotulo')
      .is('deleted_at', null);


    if (req.query.todos !== '1') q = q.in('status', ['publicado', 'encerrado']);
    const { data, error } = await q.order('data', { ascending: false, nullsFirst: false }).limit(100);
    if (error) throw error;


    const contagem = await contarInscritosVivos(supabase, (data || []).map((e) => e.id));
    res.json((data || []).map((e) => ({ ...e, inscritos: contagem.get(e.id) || 0 })));
  } catch (e) {
    console.error('[inscricoes] app/eventos:', e.message);
    res.status(500).json({ error: 'Erro ao listar eventos' });
  }
});




router.get('/app/eventos/:id/inscricoes', authorizeModule('inscricoes', 1), async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 40, 1), 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const status = STATUS_CANONICOS.includes(String(req.query.status)) ? String(req.query.status) : '';

    const [lista, contadores] = await Promise.all([
      lerInscritosDoEvento(req.params.id, { busca: req.query.busca || '', status, limit, offset }),

      offset === 0 ? contadoresEvento(req.params.id) : Promise.resolve(null),
    ]);

    res.json({ itens: lista.itens, total: lista.total, limit, offset, contadores });
  } catch (e) {
    console.error('[inscricoes] app/inscricoes:', e.message);
    res.status(500).json({ error: 'Erro ao listar inscrições' });
  }
});





router.patch('/eventos/:id/inscricoes/:inscricaoId', authorizeModule('inscricoes', 3), async (req, res) => {
  try {
    const { data: atual } = await supabase.from('inscricoes')
      .select('id, dados').eq('id', req.params.inscricaoId)
      .eq('evento_id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!atual) return res.status(404).json({ error: 'Inscrição não encontrada' });

    const patch = {};
    if (typeof req.body?.nome_completo === 'string' && req.body.nome_completo.trim().length >= 2) {
      patch.nome_completo = req.body.nome_completo.trim().slice(0, 200);
    }
    if ('telefone' in (req.body || {})) patch.telefone = String(req.body.telefone || '').replace(/\D/g, '') || null;
    if ('email' in (req.body || {})) patch.email = req.body.email ? String(req.body.email).toLowerCase().trim().slice(0, 200) : null;
    if (req.body?.status !== undefined) {

      if (!['confirmada', 'cancelada'].includes(req.body.status)) {
        return res.status(400).json({ error: 'Status inválido' });
      }
      patch.status = req.body.status;
    }
    if (req.body?.dados && typeof req.body.dados === 'object' && !Array.isArray(req.body.dados)) {
      const dados = { ...(atual.dados || {}) };
      for (const [k, v] of Object.entries(req.body.dados)) {
        const key = String(k).slice(0, 80);
        if (v === null || v === undefined || String(v).trim() === '') delete dados[key];
        else dados[key] = String(v).slice(0, 500);
      }
      patch.dados = dados;
    }
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nada pra atualizar' });

    const { data, error } = await supabase.from('inscricoes')
      .update(patch)
      .eq('id', req.params.inscricaoId).eq('evento_id', req.params.id).is('deleted_at', null)
      .select('id, nome_completo, telefone, email, status, numero_sorte, whatsapp_optin, dados, created_at').maybeSingle();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[inscricoes] atualizar inscrição:', e.message);
    res.status(500).json({ error: 'Erro ao atualizar a inscrição' });
  }
});



router.delete('/eventos/:id/inscricoes/:inscricaoId', authorizeModule('inscricoes', 3), async (req, res) => {
  try {
    const { data: atual } = await supabase.from('inscricoes')
      .select('id').eq('id', req.params.inscricaoId)
      .eq('evento_id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!atual) return res.status(404).json({ error: 'Inscrição não encontrada' });
    const { error } = await supabase.rpc('app_soft_delete', {
      p_table_name: 'inscricoes', p_row_id: req.params.inscricaoId, p_deleted_by: req.user?.id ?? null,
    });
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('[inscricoes] excluir inscrição:', e.message);






    res.status(500).json({ error: 'Erro ao excluir a inscrição', detalhe: e.message });
  }
});














router.post('/eventos/:id/inscricoes/excluir-lote', authorizeModule('inscricoes', 3), async (req, res) => {
  try {
    const { ids, ignorados, acimaDoTeto } = normalizarIds(req.body?.ids);
    if (!ids.length) return res.status(400).json({ error: 'Selecione ao menos uma inscrição' });

    const { data: evento } = await supabase.from('insc_eventos')
      .select('id').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!evento) return res.status(404).json({ error: 'Evento não encontrado' });

    const { data: vivas, error: eVivas } = await supabase.from('inscricoes')
      .select('id, nome_completo')
      .eq('evento_id', req.params.id).is('deleted_at', null).in('id', ids);
    if (eVivas) throw eVivas;




    let comPagamento = [];
    const { data: pagos, error: ePag } = await supabase.from('vw_insc_pagamento_estado')
      .select('inscricao_id, status_pagamento')
      .eq('evento_id', req.params.id).in('inscricao_id', ids);
    if (ePag) {
      console.error('[inscricoes] excluir-lote · pagamentos:', ePag.message);
      return res.status(503).json({ error: 'Não deu pra conferir os pagamentos agora — tente de novo em instantes.' });
    }
    comPagamento = (pagos || [])
      .filter((p) => p.status_pagamento && p.status_pagamento !== 'expirada' && p.status_pagamento !== 'cancelada')
      .map((p) => p.inscricao_id);

    const plano = separarExclusaoLote(ids, vivas || [], comPagamento);




    const excluidas = [];
    const falhas = [];




    const motivos = new Set();
    const BLOCO = 8;
    for (let i = 0; i < plano.excluir.length; i += BLOCO) {
      const fatia = plano.excluir.slice(i, i + BLOCO);
      const r = await Promise.all(fatia.map(async (id) => {
        const { error } = await supabase.rpc('app_soft_delete', {
          p_table_name: 'inscricoes', p_row_id: id, p_deleted_by: req.user?.id ?? null,
        });
        return { id, erro: error?.message || null };
      }));
      for (const item of r) {
        (item.erro ? falhas : excluidas).push(item.id);
        if (item.erro) motivos.add(item.erro);
      }
      if (r.some((x) => x.erro)) console.error('[inscricoes] excluir-lote falhas:', r.filter((x) => x.erro));
    }

    res.json({
      ok: true,
      excluidas,
      com_pagamento: plano.comPagamento,
      nao_encontradas: plano.naoEncontradas,
      falhas,
      falhas_motivo: [...motivos],
      ignorados,
      acima_do_teto: acimaDoTeto,
      resumo: resumoDoLote({
        excluidas: excluidas.length,
        comPagamento: plano.comPagamento.length,
        naoEncontradas: plano.naoEncontradas.length,
        falhas: falhas.length,
      }),
      contadores: await contadoresEvento(req.params.id),
    });
  } catch (e) {
    console.error('[inscricoes] excluir inscrições em lote:', e.message);

    res.status(500).json({ error: 'Erro ao excluir as inscrições', detalhe: e.message });
  }
});


















router.post('/eventos/:id/importar-einscricao', authorizeModule('inscricoes', 3), upload.single('arquivo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Arquivo não enviado' });
    const confirmar = ['1', 'true', 'sim'].includes(String(req.body?.confirmar ?? '').toLowerCase());

    const { data: ev, error: eEv } = await supabase.from('insc_eventos')
      .select('id, nome, slug, vagas, lotes, campos, checkout_externo_url')
      .eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (eEv) throw eEv;
    if (!ev) return res.status(404).json({ error: 'Evento não encontrado' });



    const texto = eInscricao.decodificarCsv(req.file.buffer);
    const registros = eInscricao.parseCsvEInscricao(texto);

    const faltam = eInscricao.faltamColunasEInscricao(registros);
    if (faltam.length) {
      return res.status(400).json({
        error: `Este arquivo não parece a exportação de inscrições do E-Inscrição — faltam as colunas: ${faltam.join(', ')}.`,
      });
    }
    if (!registros.length) return res.status(400).json({ error: 'A planilha não tem nenhuma linha de inscrição.' });

    const agora = new Date().toISOString();
    const linhas = registros.map((r) => eInscricao.mapearLinhaEInscricao(r, {
      arquivo: String(req.file.originalname || 'planilha.csv').slice(0, 200),
      importadoEm: agora,
    }));





    const vivas = [];
    for (;;) {
      const { data, error } = await supabase.from('inscricoes')
        .select('id, codigo, nome_completo, cpf, status, origem, dados')
        .eq('evento_id', ev.id).is('deleted_at', null)
        .range(vivas.length, vivas.length + 999);
      if (error) throw error;
      vivas.push(...(data || []));
      if ((data || []).length < 1000) break;
    }
    const plano = importarEInscricao.planejar(linhas, vivas, {
      keysEvento: new Set((ev.campos || []).map((c) => c.key)),
    });


    const resumoLinha = (l) => ({
      nome: l.nome_completo,
      codigo_plataforma: l.dados?.e_inscricao?.codigo || null,
      inscrito_em: l.created_at,
      valor_centavos: l.valor_cobrado_centavos,
      responsavel_nome: l.responsavel_nome || null,
      idade: importarEInscricao.idadeEmAnos(l.data_nascimento),
    });
    const previa = {
      arquivo: String(req.file.originalname || '').slice(0, 200),
      total_linhas: plano.total_linhas,
      dinheiro: plano.dinheiro,
      keys_desconhecidas: plano.keys_desconhecidas,
      inserir: plano.inserir.map((x) => ({ ...resumoLinha(x.linha), alertas: x.alertas })),
      cancelar: plano.cancelar.map((x) => ({ ...resumoLinha(x.linha), codigo: x.existente.codigo })),
      pular: plano.pular.map((x) => ({ nome: x.linha.nome_completo, motivo: x.motivo })),
      invalidas: plano.invalidas.map((x) => ({ ...resumoLinha(x.linha), faltam: x.faltam })),
    };

    if (!confirmar) return res.json({ ok: true, confirmado: false, previa });

    const r = await importarEInscricao.executar({
      supabase, acharOuCriarGuardado, eventoId: ev.id, plano,
    });
    console.log(`[inscricoes] importar-einscricao · ${ev.slug} · ${req.user?.email || req.user?.id} · +${r.inseridas.length} ×${r.canceladas.length} !${r.erros.length}`);
    res.json({
      ok: true,
      confirmado: true,
      previa,
      resultado: r,
      contadores: await contadoresEvento(ev.id),
    });
  } catch (e) {
    console.error('[inscricoes] importar-einscricao:', e.message);
    res.status(500).json({ error: 'Erro ao importar a planilha', detalhe: e.message });
  }
});


















router.post('/eventos/:id/sortear', authorizeModule('inscricoes', 3), async (req, res) => {
  try {
    const { premio, substituir } = req.body || {};
    const nomePremio = premio ? String(premio).trim().slice(0, 200) : null;



    const inscritos = [];
    for (let off = 0; off < 20000; off += 1000) {
      const { data, error } = await supabase.from('inscricoes')
        .select('id, nome_completo, numero_sorte, status, membro_id, cpf, telefone')
        .eq('evento_id', req.params.id).is('deleted_at', null)
        .neq('status', 'cancelada').not('numero_sorte', 'is', null)
        .range(off, off + 999);
      if (error) throw error;
      inscritos.push(...(data || []));
      if (!data || data.length < 1000) break;
    }


    const presentesIds = [];
    for (let off = 0; off < 20000; off += 1000) {
      const { data, error } = await supabase.from('insc_checkins')
        .select('inscricao_id, inscricao:inscricoes!inner(evento_id)')
        .eq('inscricao.evento_id', req.params.id)
        .range(off, off + 999);
      if (error) throw error;
      for (const c of (data || [])) presentesIds.push(c.inscricao_id);
      if (!data || data.length < 1000) break;
    }





    let sorteios = [];
    {
      const r1 = await supabase.from('insc_sorteios')
        .select('id, inscricao_id, premio, substituido_em').eq('evento_id', req.params.id);
      if (r1.error) {
        const r2 = await supabase.from('insc_sorteios')
          .select('id, inscricao_id, premio').eq('evento_id', req.params.id);
        if (r2.error) throw r2.error;
        sorteios = r2.data || [];
      } else {
        sorteios = r1.data || [];
      }
    }


    if (substituir && nomePremio) {
      const anteriores = sorteios.filter((s) => (s.premio || '') === nomePremio && !s.substituido_em);
      if (anteriores.length) {
        const { error: eSub } = await supabase.from('insc_sorteios')
          .update({ substituido_em: new Date().toISOString() })
          .in('id', anteriores.map((s) => s.id));
        if (eSub) throw eSub;
        const trocados = new Set(anteriores.map((s) => s.id));
        sorteios = sorteios.map((s) => (trocados.has(s.id) ? { ...s, substituido_em: 'agora' } : s));
      }
    }

    const elegiveis = elegiveisDoSorteio({ inscritos, presentesIds, sorteios });
    if (!elegiveis.length) {
      const m = motivoSemElegivel({ inscritos, presentesIds, sorteios });
      const texto = m.motivo === 'sem_inscritos'
        ? 'Sem inscritos com número da sorte neste evento.'
        : m.motivo === 'ninguem_presente'
          ? `O sorteio é entre quem fez check-in, e ninguém foi marcado ainda (${m.ativos} inscritos). Ative o check-in e marque a presença na portaria.`
          : `As ${m.presentes} pessoas presentes já ganharam um prêmio — uma pessoa não leva dois no mesmo evento.`;
      return res.status(400).json({ error: texto, motivo: m.motivo, presentes: m.presentes, inscritos: m.ativos });
    }

    const g = elegiveis[Math.floor(Math.random() * elegiveis.length)];
    const { data: sorteio, error } = await supabase.from('insc_sorteios').insert({
      evento_id: req.params.id, premio: nomePremio,
      numero_sorteado: g.numero_sorte, inscricao_id: g.id, ganhador_nome: g.nome_completo,
      sorteado_por: req.user?.id || null,
    }).select('*').single();
    if (error) throw error;
    res.status(201).json({ ...sorteio, elegiveis: elegiveis.length, presentes: presentesIds.length });
  } catch (e) {
    console.error('[inscricoes] sortear:', e.message);
    res.status(500).json({ error: 'Erro ao sortear' });
  }
});







const {
  marcarCheckinAuditavel, desfazerCheckinAuditavel,
} = require('../services/inscricaoCheckin');
const { montarLinkCheckin } = require('../utils/eventoCheckinToken');




async function publicoAvisoCheckin(eventoId) {
  const membros = new Set();
  for (let off = 0; off < 20000; off += 1000) {
    const { data, error } = await supabase.from('inscricoes')
      .select('membro_id')
      .eq('evento_id', eventoId).is('deleted_at', null)
      .eq('status', 'confirmada').not('membro_id', 'is', null)
      .range(off, off + 999);
    if (error) throw error;
    for (const i of (data || [])) membros.add(i.membro_id);
    if (!data || data.length < 1000) break;
  }
  const ids = [...membros];
  const users = new Set();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase.from('profiles')
      .select('id, membro_id').in('membro_id', ids.slice(i, i + 200));
    if (error) throw error;
    for (const p of (data || [])) users.add(p.id);
  }
  return {
    inscritos_confirmados: ids.length,
    com_conta_no_app: users.size,


    sem_conta_no_app: Math.max(0, ids.length - users.size),
    user_ids: [...users],
  };
}









router.get('/eventos/:id/checkin/aviso-email', authorizeModule('inscricoes', 2), async (req, res) => {
  try {
    res.json(await previaAvisoEmail(req.params.id));
  } catch (e) {
    console.error('[inscricoes] aviso-email previa:', e.message);
    res.status(500).json({ error: 'Erro ao calcular quem receberia o e-mail' });
  }
});



router.post('/eventos/:id/checkin/aviso-email', authorizeModule('inscricoes', 4), async (req, res) => {
  try {
    const { data: ev } = await supabase.from('insc_eventos')
      .select('id, nome, data, hora, tem_sorteio, checkin_ativo')
      .eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!ev) return res.status(404).json({ error: 'Evento não encontrado' });
    const r = await enviarAvisoEmail(req.params.id, ev);


    if (r.motivo === 'sem_canal') {
      return res.status(503).json({ error: 'Nenhum canal de e-mail configurado', codigo: 'sem_canal' });
    }
    res.json(r);
  } catch (e) {
    console.error('[inscricoes] aviso-email:', e.message);
    res.status(500).json({ error: 'Erro ao enviar os comprovantes' });
  }
});

router.get('/eventos/:id/checkin/aviso-app', authorizeModule('inscricoes', 2), async (req, res) => {
  try {
    res.json(await publicoAvisoCheckin(req.params.id));
  } catch (e) {
    console.error('[inscricoes] aviso-app previa:', e.message);
    res.status(500).json({ error: 'Erro ao calcular quem receberia o aviso' });
  }
});

router.post('/eventos/:id/checkin/aviso-app', authorizeModule('inscricoes', 4), async (req, res) => {
  try {
    const { data: ev } = await supabase.from('insc_eventos')
      .select('id, nome, checkin_ativo').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!ev) return res.status(404).json({ error: 'Evento não encontrado' });


    if (!ev.checkin_ativo) {
      return res.status(409).json({ error: 'Ative o check-in do evento antes de avisar', codigo: 'checkin_inativo' });
    }
    const previa = await publicoAvisoCheckin(req.params.id);
    if (!previa.com_conta_no_app) {
      return res.status(409).json({ error: 'Ninguém inscrito tem conta no app', codigo: 'sem_publico', ...previa });
    }
    const r = await notificarApp(previa.user_ids, {
      tipo: 'inscricao_evento_checkin',
      titulo: ev.nome,
      body: 'Seu QR de entrada já está no app. Abra e apresente na portaria.',
      data: { evento_id: ev.id },

      chaveDedup: `evento_checkin:${ev.id}`,
    });
    res.json({ ok: true, ...previa, enviados: r?.enviados ?? 0 });
  } catch (e) {
    console.error('[inscricoes] aviso-app:', e.message);
    res.status(500).json({ error: 'Erro ao enviar o aviso' });
  }
});










router.get('/eventos/:id/pessoas/buscar', authorizeModule('inscricoes', 2), async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 3) return res.json({ pessoas: [] });
    const digitos = q.replace(/\D/g, '');


    let query = supabase.from('mem_membros')
      .select('id, nome, cpf, telefone, email, data_nascimento, genero, status')
      .is('deleted_at', null).limit(40);
    query = digitos.length >= 8
      ? query.or(`cpf.like.%${digitos}%,telefone.like.%${digitos}%`)
      : query.ilike('nome', `%${escapePostgrestValue(q)}%`);
    const { data, error } = await query;
    if (error) throw error;



    const ids = (data || []).map((m) => m.id);
    const jaInscritos = new Set();
    if (ids.length) {
      const { data: ins } = await supabase.from('inscricoes')
        .select('membro_id').eq('evento_id', req.params.id)
        .is('deleted_at', null).neq('status', 'cancelada')
        .in('membro_id', ids);
      for (const i of (ins || [])) jaInscritos.add(i.membro_id);
    }

    res.json({
      pessoas: (data || []).map((m) => {
        const p = avaliarCadastroPessoa(m);
        return {
          id: m.id, nome: m.nome, status: m.status,

          cpf: m.cpf || null, telefone: m.telefone || null, email: m.email || null,
          data_nascimento: m.data_nascimento || null, sexo: m.genero || null,
          falta: p.faltando, falta_rotulos: p.rotulos, completo: p.completo,
          ja_inscrita: jaInscritos.has(m.id),
        };
      }),
    });
  } catch (e) {
    console.error('[inscricoes] buscar pessoa:', e.message);
    res.status(500).json({ error: 'Erro ao buscar no cadastro' });
  }
});


router.post('/eventos/:id/inscrever-na-hora', authorizeModule('inscricoes', 3), async (req, res) => {
  try {
    const ev = await eventoEspinhaPorId(req.params.id);
    if (!ev) return res.status(404).json({ error: 'Evento não encontrado' });





    const quem = req.user?.nome || req.user?.name || req.user?.email || 'operador do balcão';
    return await inscreverEspinha(req, res, ev, {
      origem: 'balcao',
      consentDeclaradoPor: quem,
    });
  } catch (e) {
    console.error('[inscricoes] inscrever na hora:', e.message);
    res.status(500).json({ error: 'Erro ao concluir a inscrição' });
  }
});




router.get('/eventos/:id/checkin/qr-autoatendimento', authorizeModule('inscricoes', 2), async (req, res) => {
  try {
    const { data: ev } = await supabase.from('insc_eventos')
      .select('id, nome, checkin_ativo').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!ev) return res.status(404).json({ error: 'Evento não encontrado' });
    const url = montarLinkCheckin(ev.id, process.env.FRONTEND_URL);


    if (!url) {
      return res.status(503).json({
        error: 'O QR de autoatendimento não está configurado (falta CRON_SECRET no ambiente).',
        motivo: 'sem_segredo',
      });
    }
    res.json({ url, checkin_ativo: !!ev.checkin_ativo });
  } catch (e) {
    console.error('[inscricoes] qr autoatendimento:', e.message);
    res.status(500).json({ error: 'Erro ao gerar o QR' });
  }
});



router.get('/eventos/:id/checkin', authorizeModule('inscricoes', 2), async (req, res) => {
  try {
    const { data: ev, error: eEv } = await supabase.from('insc_eventos')
      .select('id, nome, slug, data, hora, local, status, checkin_ativo, tem_sorteio, pagamento_ativo, vagas, campos')
      .eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (eEv) throw eEv;
    if (!ev) return res.status(404).json({ error: 'Evento não encontrado' });




    const lista = [];
    for (let off = 0; off < 20000; off += 1000) {
      const { data, error } = await supabase.from('inscricoes')



        .select('id, nome_completo, telefone, numero_sorte, status, dados')
        .eq('evento_id', req.params.id).is('deleted_at', null)
        .order('nome_completo')
        .range(off, off + 999);
      if (error) throw error;
      lista.push(...(data || []));
      if (!data || data.length < 1000) break;
    }


    const marcas = new Map();
    for (let off = 0; off < 20000; off += 1000) {
      const { data, error } = await supabase.from('insc_checkins')
        .select('inscricao_id, em, modo, inscricao:inscricoes!inner(evento_id)')
        .eq('inscricao.evento_id', req.params.id)
        .range(off, off + 999);
      if (error) throw error;
      for (const c of (data || [])) marcas.set(c.inscricao_id, c);
      if (!data || data.length < 1000) break;
    }







    const agrupaveis = camposAgrupaveis(ev.campos);
    const pedido = String(req.query.campo || '').trim();
    const campo = (pedido && agrupaveis.find((c) => c.key === pedido)) || agrupaveis[0] || null;


    const valorPorId = new Map();
    if (campo) for (const i of lista) valorPorId.set(i.id, i.dados?.[campo.key]);

    const itens = lista.map((i) => ({
      id: i.id, nome_completo: i.nome_completo, telefone: i.telefone,
      numero_sorte: i.numero_sorte, status: i.status,
      checkin_em: marcas.get(i.id)?.em || null,
      checkin_modo: marcas.get(i.id)?.modo || null,


      opcoes: campo ? opcoesMarcadas(i.dados?.[campo.key], campo.opcoes) : [],
    }));
    const ativos = itens.filter((i) => i.status !== 'cancelada');

    const agrupamento = campo ? {
      campo: { key: campo.key, label: campo.label || campo.key, opcoes: campo.opcoes },





      ...resumoPorOpcao(
        ativos.map((i) => ({ valor: valorPorId.get(i.id), presente: !!i.checkin_em })),
        campo.opcoes,
      ),

      multipla: String(campo.tipo || '') === 'multi',
      opcoes_disponiveis: agrupaveis.map((c) => ({ key: c.key, label: c.label || c.key })),
    } : null;

    res.json({
      evento: ev,
      inscritos: ativos.length,
      presentes: ativos.filter((i) => i.checkin_em).length,
      lista: itens,
      agrupamento,
    });
  } catch (e) {
    console.error('[inscricoes] checkin/estado:', e.message);
    res.status(500).json({ error: 'Erro ao carregar o check-in' });
  }
});





router.get('/eventos/:id/checkin/buscar', authorizeModule('inscricoes', 2), async (req, res) => {
  try {
    const digits = String(req.query.q || '').replace(/\D/g, '').slice(0, 14);
    if (digits.length < 4) return res.json([]);




    const filtros = [`cpf.like.%${digits}%`, `telefone.like.%${digits}%`];
    const comoCodigo = digits.length === 4 ? Number(digits) : null;
    if (comoCodigo) filtros.push(`numero_sorte.eq.${comoCodigo}`);
    const { data, error } = await supabase.from('inscricoes')
      .select('id, nome_completo, telefone, numero_sorte, status')
      .eq('evento_id', req.params.id).is('deleted_at', null)
      .or(filtros.join(','))
      .limit(20);
    if (error) throw error;


    if (comoCodigo && data) {
      data.sort((a, b) => (b.numero_sorte === comoCodigo ? 1 : 0) - (a.numero_sorte === comoCodigo ? 1 : 0));
    }
    const ids = (data || []).map((i) => i.id);
    const marcas = new Map();
    if (ids.length) {
      const { data: cks } = await supabase.from('insc_checkins')
        .select('inscricao_id, em').in('inscricao_id', ids);
      for (const c of (cks || [])) marcas.set(c.inscricao_id, c.em);
    }
    res.json((data || []).map((i) => ({ ...i, checkin_em: marcas.get(i.id) || null })));
  } catch (e) {
    console.error('[inscricoes] checkin/buscar:', e.message);
    res.status(500).json({ error: 'Erro na busca' });
  }
});





router.post('/eventos/:id/checkin', authorizeModule('inscricoes', 2), async (req, res) => {
  try {
    const { data: ev } = await supabase.from('insc_eventos')
      .select('id, nome, checkin_ativo').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!ev) return res.status(404).json({ error: 'Evento não encontrado' });
    if (!ev.checkin_ativo) {
      return res.status(409).json({
        error: 'O check-in não está ativado neste evento — ative nas configurações do evento.',
        motivo: 'checkin_inativo',
      });
    }

    const b = req.body || {};
    let inscricaoId = null;
    let modo = 'busca';
    if (b.token) {
      inscricaoId = await verificarTokenComprovanteAtivo(extrairToken(b.token));
      modo = 'qr';
      if (!inscricaoId) {
        return res.status(422).json({ error: 'QR inválido — não é um comprovante de inscrição.', motivo: 'qr_invalido' });
      }
    } else if (typeof b.inscricao_id === 'string' && /^[0-9a-f-]{36}$/i.test(b.inscricao_id)) {
      inscricaoId = b.inscricao_id;
    }
    if (!inscricaoId) return res.status(400).json({ error: 'Informe a inscrição ou o QR do comprovante.' });

    const { data: ins } = await supabase.from('inscricoes')
      .select('id, evento_id, nome_completo, numero_sorte, status')
      .eq('id', inscricaoId).is('deleted_at', null).maybeSingle();
    if (!ins) return res.status(404).json({ error: 'Inscrição não encontrada neste evento.', motivo: 'nao_encontrada' });
    if (ins.evento_id !== req.params.id) {



      let outroNome = null;
      try {
        const { data: outro } = await supabase.from('insc_eventos')
          .select('nome').eq('id', ins.evento_id).maybeSingle();
        outroNome = outro?.nome || null;
      } catch {                        }
      return res.status(409).json({
        error: `Este comprovante é de outro evento${outroNome ? ` (${outroNome})` : ''}.`,
        motivo: 'outro_evento', evento_nome: outroNome, nome: ins.nome_completo,
      });
    }
    if (ins.status === 'cancelada') {
      return res.status(409).json({
        error: `A inscrição de ${ins.nome_completo} está cancelada.`,
        motivo: 'cancelada', nome: ins.nome_completo,
      });
    }
    if (ins.status === 'recebida' && !b.confirmar_pendente) {
      return res.status(409).json({
        error: `${ins.nome_completo} está com o pagamento pendente.`,
        motivo: 'pagamento_pendente', nome: ins.nome_completo, inscricao_id: ins.id,
      });
    }

    const marcado = await marcarCheckinAuditavel({
      inscricaoId: ins.id,
      por: req.user?.id || null,
      modo,
      overridePendente: ins.status === 'recebida' && !!b.confirmar_pendente,
      motivo: String(b.motivo_override || '').trim().slice(0, 500)
        || (ins.status === 'recebida' ? 'liberação de pagamento pendente pela portaria' : null),
    });
    if (marcado.ja_checkin) {
      return res.json({
        ok: true, ja_checkin: true, em: marcado.em || null,
        inscricao: { id: ins.id, nome_completo: ins.nome_completo, numero_sorte: ins.numero_sorte },
      });
    }
    res.status(201).json({
      ok: true, em: marcado.em,
      pendente: ins.status === 'recebida' || undefined,
      inscricao: { id: ins.id, nome_completo: ins.nome_completo, numero_sorte: ins.numero_sorte },
    });
  } catch (e) {
    console.error('[inscricoes] checkin:', e.message);
    res.status(500).json({ error: 'Erro ao marcar o check-in' });
  }
});





router.delete('/eventos/:id/checkin/:inscricaoId', authorizeModule('inscricoes', 2), async (req, res) => {
  try {
    const { data: ins } = await supabase.from('inscricoes')
      .select('id').eq('id', req.params.inscricaoId)
      .eq('evento_id', req.params.id).maybeSingle();
    if (!ins) return res.status(404).json({ error: 'Inscrição não encontrada' });
    const resultado = await desfazerCheckinAuditavel({
      eventoId: req.params.id,
      inscricaoId: req.params.inscricaoId,
      por: req.user?.id || null,
      motivo: String(req.body?.motivo || '').trim().slice(0, 500) || 'desfeito pela portaria',
    });
    res.json({ ok: true, ja_desfeito: !!resultado?.ja_desfeito });
  } catch (e) {
    console.error('[inscricoes] desfazer checkin:', e.message);
    res.status(500).json({ error: 'Erro ao desfazer o check-in' });
  }
});





router.get('/eventos/:id/checkin/historico', authorizeModule('inscricoes', 2), async (req, res) => {
  try {
    const limit = Math.min(300, Math.max(20, parseInt(req.query.limit) || 100));
    const { data, error } = await supabase.from('insc_checkin_eventos')
      .select(`id, acao, modo, motivo, em, ator_id, metadata,
        inscricao:inscricoes(id, nome_completo)`)
      .eq('evento_id', req.params.id)
      .order('em', { ascending: false })
      .limit(limit);


    if (tabelaAusente(error)) {
      return res.json({ disponivel: false, items: [], aviso: 'A trilha de check-in ainda não foi criada no banco (migration pendente).' });
    }
    if (error) throw error;
    const nomes = await nomesDeOperadores((data || []).map((l) => l.ator_id));
    res.json({
      disponivel: true,
      items: (data || []).map((l) => ({
        id: l.id,
        acao: l.acao,
        modo: l.modo,
        motivo: l.motivo,
        em: l.em,
        por_nome: nomes[l.ator_id] || null,
        override_pendente: !!l.metadata?.override_pendente,
        nome_completo: l.inscricao?.nome_completo || null,
        inscricao_id: l.inscricao?.id || null,
      })),
    });
  } catch (e) {
    console.error('[inscricoes] histórico de check-in:', e.message);
    res.status(500).json({ error: 'Erro ao carregar a trilha do check-in' });
  }
});


router.post('/eventos', authorizeModule('inscricoes', 3), async (req, res) => {
  try {
    const b = req.body || {};
    const nome = String(b.nome || '').trim();
    if (nome.length < 2) return res.status(400).json({ error: 'Informe o nome do evento' });
    const area = await areaValida(b.area);
    if (!area) return res.status(400).json({ error: 'Selecione uma área válida (catálogo oficial)' });

    const periodicidade = ['unica', 'semanal', 'mensal', 'anual', 'custom'].includes(b.periodicidade)
      ? b.periodicidade : 'unica';
    const slug = await slugUnico(slugify(nome));

    let serieId = null;
    let edicao = null;
    if (periodicidade !== 'unica') {
      const recorreAte = b.recorre_ate && /^\d{4}-\d{2}-\d{2}$/.test(String(b.recorre_ate))
        ? String(b.recorre_ate) : null;
      const { data: serie, error: eS } = await supabase.from('insc_series').insert({
        nome, slug_base: slug, area, periodicidade, recorre_ate: recorreAte,
        tipo: b.tipo === 'retiro' ? 'retiro' : 'evento',
      }).select('id').single();
      if (eS) throw eS;
      serieId = serie.id;
      edicao = rotuloEdicao(periodicidade, b.data);
    }

    const payload = {
      nome, slug, area, serie_id: serieId, edicao_rotulo: edicao,
      tipo: b.tipo === 'retiro' ? 'retiro' : 'evento',
      campos: sanitizeCampos(b.campos),
      status: 'rascunho',
      created_by: req.user?.id || null,
    };

    for (const k of CAMPOS_EVENTO) {
      if (k === 'nome' || b[k] === undefined) continue;
      if (b[k] === null && CAMPOS_EVENTO_NAO_NULO.has(k)) continue;
      payload[k] = b[k];
    }
    const metodos = sanitizeMetodos(b.pagamento_metodos);
    if (metodos) payload.pagamento_metodos = metodos;
    const igrejaPost = await igrejaDoCorpo(b);
    if (igrejaPost.erro) return res.status(400).json({ error: igrejaPost.erro });
    if (!igrejaPost.skip && igrejaPost.valor) {
      payload.igreja_id = igrejaPost.valor;
      payload.no_totem = false;
    }
    const termos = sanitizeTermosExtra(b.termos_extra);
    if (termos) payload.termos_extra = termos;

    const lotes = sanitizarLotes(b.lotes);
    if (lotes) payload.lotes = lotes;
    const erroCheckout = conferirCheckoutExterno(payload)
      || sanitizeValorCartaoExterno(payload);
    if (erroCheckout) return res.status(400).json({ error: erroCheckout });

    const { data, error } = await supabase.from('insc_eventos').insert(payload).select('id, slug').single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    console.error('[inscricoes] criar evento:', e.message);
    res.status(500).json({ error: 'Erro ao criar evento' });
  }
});





async function notificarNovoEventoApp(evento) {
  if (!evento?.slug) return;


  if (await eventoEhParceiro(evento)) return;



  const toks = await fetchAllRows(() => supabase.from('app_push_tokens').select('user_id'));
  const userIds = [...new Set((toks || []).map((t) => t.user_id).filter(Boolean))];
  if (!userIds.length) return;
  const payload = {
    tipo: 'inscricao_evento',
    titulo: 'Inscrições abertas',
    body: `${evento.nome} — inscreva-se pelo app`,
    data: { tipo: 'inscricao_evento', slug: evento.slug, evento_id: evento.id },
  };
  for (let i = 0; i < userIds.length; i += 500) {
    await notificarApp(userIds.slice(i, i + 500), payload);
  }
}

router.put('/eventos/:id', authorizeModule('inscricoes', 3), async (req, res) => {
  try {
    const b = req.body || {};
    const patch = {};
    aplicarCamposEvento(b, patch);
    if (b.nome !== undefined) {
      const nome = String(b.nome).trim();
      if (nome.length < 2) return res.status(400).json({ error: 'Informe o nome do evento' });
      patch.nome = nome;
    }
    if (b.area !== undefined) {
      const area = await areaValida(b.area);
      if (!area) return res.status(400).json({ error: 'Selecione uma área válida' });
      patch.area = area;
    }
    if (b.campos !== undefined) patch.campos = sanitizeCampos(b.campos);
    if (b.pagamento_metodos !== undefined) {
      const metodos = sanitizeMetodos(b.pagamento_metodos);
      if (metodos) patch.pagamento_metodos = metodos;
    }


    if (b.termos_extra !== undefined) {
      const termos = sanitizeTermosExtra(b.termos_extra);
      if (termos) patch.termos_extra = termos;
    }

    if (b.lotes !== undefined) {
      const lotes = sanitizarLotes(b.lotes);
      if (lotes) patch.lotes = lotes;
    }
    const erroCheckout = conferirCheckoutExterno(patch)
      || sanitizeValorCartaoExterno(patch);
    if (erroCheckout) return res.status(400).json({ error: erroCheckout });
    const igrejaPut = await igrejaDoCorpo(b);
    if (igrejaPut.erro) return res.status(400).json({ error: igrejaPut.erro });
    if (!igrejaPut.skip) {
      const { data: atualIg } = await supabase.from('insc_eventos')
        .select('igreja_id').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
      if ((atualIg?.igreja_id || null) !== igrejaPut.valor) {



        const { count, error: eCnt } = await supabase.from('inscricoes')
          .select('id', { count: 'exact', head: true })
          .eq('evento_id', req.params.id).is('deleted_at', null);
        if (eCnt) throw eCnt;
        if (count > 0) {
          return res.status(409).json({ error: 'A igreja do evento só pode mudar enquanto ele não tem inscrições.' });
        }
        patch.igreja_id = igrejaPut.valor;
        if (igrejaPut.valor) patch.no_totem = false;
      }
    }
    if (b.status !== undefined) {
      if (!['rascunho', 'publicado', 'encerrado', 'arquivado'].includes(b.status)) {
        return res.status(400).json({ error: 'Status inválido' });
      }
      patch.status = b.status;
    }


    let statusAntes = null;
    if (patch.status === 'publicado') {
      const { data: atual } = await supabase.from('insc_eventos')
        .select('status').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
      statusAntes = atual?.status || null;
    }
    const { data, error } = await supabase.from('insc_eventos')
      .update(patch).eq('id', req.params.id).is('deleted_at', null)
      .select('id, nome, slug, status, igreja_id').single();
    if (error) throw error;
    if (data?.status === 'publicado' && statusAntes && statusAntes !== 'publicado') {
      notificarNovoEventoApp(data).catch((e) => console.warn('[inscricoes] push evento publicado:', e.message));
    }
    res.json({ id: data.id });
  } catch (e) {
    console.error('[inscricoes] atualizar evento:', e.message);
    res.status(500).json({ error: 'Erro ao atualizar evento' });
  }
});


router.delete('/eventos/:id', authorizeModule('inscricoes', 4), async (req, res) => {
  try {
    const { error } = await supabase.rpc('app_soft_delete', {
      p_table_name: 'insc_eventos', p_row_id: req.params.id, p_deleted_by: req.user?.id ?? null,
    });
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('[inscricoes] excluir evento:', e.message);
    res.status(500).json({ error: 'Erro ao excluir evento' });
  }
});



router.post('/eventos/:id/nova-edicao', authorizeModule('inscricoes', 3), async (req, res) => {
  try {
    const dataNova = String(req.body?.data || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataNova)) {
      return res.status(400).json({ error: 'Informe a data da nova edição' });
    }
    const { data: ev, error: eEv } = await supabase.from('insc_eventos')
      .select('*').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (eEv) throw eEv;
    if (!ev) return res.status(404).json({ error: 'Evento não encontrado' });

    let serieId = ev.serie_id;
    let periodicidade = 'mensal';
    if (serieId) {
      const { data: s } = await supabase.from('insc_series')
        .select('periodicidade').eq('id', serieId).maybeSingle();
      periodicidade = s?.periodicidade || 'mensal';
    } else {
      periodicidade = ['semanal', 'mensal', 'anual', 'custom'].includes(req.body?.periodicidade)
        ? req.body.periodicidade : 'mensal';
      const { data: serie, error: eS } = await supabase.from('insc_series').insert({
        nome: ev.nome, slug_base: ev.slug, area: ev.area, periodicidade,
        tipo: ev.tipo || 'evento',
      }).select('id, slug_base').single();
      if (eS) throw eS;
      serieId = serie.id;
      await supabase.from('insc_eventos').update({
        serie_id: serieId, edicao_rotulo: rotuloEdicao(periodicidade, ev.data),
      }).eq('id', ev.id);
    }

    const { data: serie } = await supabase.from('insc_series')
      .select('slug_base').eq('id', serieId).maybeSingle();
    const rotulo = rotuloEdicao(periodicidade, dataNova) || dataNova;
    const slug = await slugUnico(`${serie?.slug_base || ev.slug}-${rotulo}`);

    const novo = {
      nome: ev.nome, slug, area: ev.area, tipo: ev.tipo,
      serie_id: serieId, edicao_rotulo: rotulo,
      descricao: ev.descricao, data: dataNova, hora: ev.hora, local: ev.local,
      capa_url: ev.capa_url, campos: ev.campos, vagas: ev.vagas,
      msg_sucesso_titulo: ev.msg_sucesso_titulo, msg_sucesso_texto: ev.msg_sucesso_texto,
      msg_whatsapp: ev.msg_whatsapp, tem_sorteio: ev.tem_sorteio, premios: ev.premios,
      pagamento_ativo: ev.pagamento_ativo, valor_centavos: ev.valor_centavos,
      pagamento_metodos: ev.pagamento_metodos, pagamento_expira_horas: ev.pagamento_expira_horas,
      checkin_ativo: ev.checkin_ativo,



      igreja_id: ev.igreja_id || null,
      ...(ev.igreja_id ? { no_totem: false } : {}),
      status: 'rascunho',
      created_by: req.user?.id || null,
    };
    const { data: criado, error: eNovo } = await supabase.from('insc_eventos')
      .insert(novo).select('id, slug').single();
    if (eNovo) throw eNovo;
    res.status(201).json(criado);
  } catch (e) {
    console.error('[inscricoes] nova edição:', e.message);
    res.status(500).json({ error: 'Erro ao criar a nova edição' });
  }
});


router.post('/upload-capa', authorizeModule('inscricoes', 3), upload.single('arquivo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Arquivo não enviado' });
    const ext = (req.file.originalname.split('.').pop() || 'jpg').toLowerCase();
    const path = `espinha/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from('evento-capas').upload(path, req.file.buffer, {
      contentType: req.file.mimetype || 'image/jpeg', upsert: false,
    });
    if (error) throw error;
    const { data } = supabase.storage.from('evento-capas').getPublicUrl(path);
    res.json({ url: data.publicUrl });
  } catch (e) {
    console.error('[inscricoes] upload-capa:', e.message);
    res.status(500).json({ error: 'Erro ao enviar a capa' });
  }
});





const TIPOS_ARQUIVO_EVENTO = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
};
router.post('/upload-arquivo', authorizeModule('inscricoes', 3), upload.single('arquivo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Arquivo não enviado' });


    const ext = TIPOS_ARQUIVO_EVENTO[req.file.mimetype];
    if (!ext) return res.status(400).json({ error: 'Só PDF ou Word (.doc/.docx) — este arquivo vai para download público.' });
    const path = `espinha/arquivos/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from('evento-arquivos').upload(path, req.file.buffer, {
      contentType: req.file.mimetype, upsert: false,
    });
    if (error) throw error;
    const { data } = supabase.storage.from('evento-arquivos').getPublicUrl(path);

    res.json({ url: data.publicUrl, nome: String(req.file.originalname || `arquivo.${ext}`).slice(0, 160) });
  } catch (e) {
    console.error('[inscricoes] upload-arquivo:', e.message);
    res.status(500).json({ error: 'Erro ao enviar o arquivo' });
  }
});













router.get('/email-templates', authorizeModule('inscricoes', 2), async (req, res) => {
  try {



    const padrao = {};
    TIPOS_EDITAVEIS.forEach((t) => { padrao[t] = esqueletoPadrao(t); });

    let q = supabase.from('insc_email_templates')
      .select('id, tipo, evento_id, assunto, corpo_html, ativo, incluir_assinatura, atualizado_por_nome, updated_at');
    if (req.query.evento_id) {
      q = q.or(`evento_id.eq.${escapePostgrestValue(String(req.query.evento_id))},evento_id.is.null`);
    } else {
      q = q.is('evento_id', null);
    }
    const { data, error } = await q;


    if (error) {
      console.warn('[inscricoes] email-templates indisponível:', error.message);
      return res.json({
        templates: [], tipos: TIPOS_EMAIL, variaveis: VARIAVEIS_EMAIL, padrao,
        aviso: 'Personalização ainda não disponível (migration pendente). Os e-mails estão saindo no texto padrão.',
      });
    }
    res.json({ templates: data || [], tipos: TIPOS_EMAIL, variaveis: VARIAVEIS_EMAIL, padrao });
  } catch (e) {
    console.error('[inscricoes] GET email-templates:', e.message);
    res.status(500).json({ error: 'Erro ao carregar os templates' });
  }
});


router.put('/email-templates/:tipo', authorizeModule('inscricoes', 5), async (req, res) => {
  try {
    const tipo = String(req.params.tipo || '');
    if (!TIPOS_EDITAVEIS.includes(tipo)) return res.status(400).json({ error: 'Tipo inválido' });

    const ehAssinatura = tipo === 'assinatura';


    const assunto = ehAssinatura ? '' : String(req.body?.assunto || '').trim();
    const corpo = String(req.body?.corpo_html || '').trim();
    if (!ehAssinatura && !assunto) return res.status(400).json({ error: 'O assunto é obrigatório' });
    if (!corpo) return res.status(400).json({ error: ehAssinatura ? 'A assinatura está vazia' : 'O corpo do e-mail é obrigatório' });


    const eventoId = ehAssinatura ? null : (req.body?.evento_id || null);
    const linha = {
      tipo,
      evento_id: eventoId,
      assunto,


      corpo_html: sanitizarHtmlEmail(corpo),
      ativo: req.body?.ativo !== false,
      incluir_assinatura: req.body?.incluir_assinatura !== false,
      atualizado_por: req.user?.id || null,
      atualizado_por_nome: req.user?.name || req.user?.email || null,
    };



    let existente = supabase.from('insc_email_templates').select('id').eq('tipo', tipo);
    existente = eventoId ? existente.eq('evento_id', eventoId) : existente.is('evento_id', null);
    const { data: achado } = await existente.maybeSingle();

    const q = achado?.id
      ? supabase.from('insc_email_templates').update(linha).eq('id', achado.id).select().single()
      : supabase.from('insc_email_templates').insert(linha).select().single();

    const { data, error } = await q;
    if (error) throw error;
    res.json({ ok: true, template: data });
  } catch (e) {
    console.error('[inscricoes] PUT email-templates:', e.message);
    res.status(500).json({ error: 'Erro ao salvar o template' });
  }
});


router.delete('/email-templates/:tipo', authorizeModule('inscricoes', 5), async (req, res) => {
  try {
    const tipo = String(req.params.tipo || '');
    if (!TIPOS_EDITAVEIS.includes(tipo)) return res.status(400).json({ error: 'Tipo inválido' });
    let q = supabase.from('insc_email_templates').delete().eq('tipo', tipo);
    q = req.query.evento_id ? q.eq('evento_id', String(req.query.evento_id)) : q.is('evento_id', null);
    const { error } = await q;
    if (error) throw error;
    res.json({ ok: true, restaurado: 'padrao' });
  } catch (e) {
    console.error('[inscricoes] DELETE email-templates:', e.message);
    res.status(500).json({ error: 'Erro ao restaurar o padrão' });
  }
});


router.post('/email-templates/preview', authorizeModule('inscricoes', 2), async (req, res) => {
  try {


    const p = previewTemplate({
      tipo: String(req.body?.tipo || ''),
      assunto: String(req.body?.assunto || ''),
      corpo_html: String(req.body?.corpo_html || ''),
      assinaturaHtml: await carregarAssinatura(),
      incluirAssinatura: req.body?.incluir_assinatura !== false,
    });
    res.json(p);
  } catch (e) {
    console.error('[inscricoes] preview email:', e.message);
    res.status(500).json({ error: 'Erro ao gerar a prévia' });
  }
});








router.post('/email-templates/teste', authorizeModule('inscricoes', 5), async (req, res) => {
  try {
    const para = req.user?.email;
    if (!para) return res.status(400).json({ error: 'Sua conta não tem e-mail cadastrado' });

    const p = previewTemplate({
      tipo: String(req.body?.tipo || ''),
      assunto: String(req.body?.assunto || ''),
      corpo_html: String(req.body?.corpo_html || ''),
      assinaturaHtml: await carregarAssinatura(),
      incluirAssinatura: req.body?.incluir_assinatura !== false,
    });
    const r = await enviarEmail({
      to: para,
      subject: `[TESTE] ${p.assunto}`,
      html: p.html,
      text: p.html.replace(/<[^>]+>/g, ''),
      fromName: 'CBRio',
    });
    if (!r.ok) return res.status(502).json({ error: `Não foi possível enviar: ${r.error}` });
    res.json({ ok: true, enviado_para: para });
  } catch (e) {
    console.error('[inscricoes] teste email:', e.message);
    res.status(500).json({ error: 'Erro ao enviar o teste' });
  }
});


















const { inscreverEspinha, eventoEspinhaPorId, ocupacaoEspinha } = require('./publicEventoExterno');
const totemEstacao = require('../services/totemEstacao');




router.get('/totem/eventos', authorizeModule('inscricoes-totem', 1), async (req, res) => {
  try {
    const hoje = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase.from('insc_eventos')
      .select('id, nome, slug, area, data, hora, local, descricao, campos, capa_url, vagas, valor_centavos, pagamento_ativo, pagamento_metodos, parcelas_max, tem_sorteio, inscricoes_abrem_em, inscricoes_encerram_em')
      .eq('status', 'publicado').eq('no_totem', true).is('deleted_at', null)


      .or(`data.is.null,data.gte.${hoje}`)
      .order('data', { ascending: true, nullsFirst: false });
    if (error) throw error;

    const agora = Date.now();
    const abertos = (data || []).filter((ev) => {



      if (ev.inscricoes_abrem_em && new Date(ev.inscricoes_abrem_em).getTime() > agora) return false;
      if (ev.inscricoes_encerram_em && new Date(ev.inscricoes_encerram_em).getTime() < agora) return false;
      return true;
    });



    const comVagas = await Promise.all(abertos.map(async (ev) => {
      const ocup = ev.vagas ? await ocupacaoEspinha(ev.id) : null;
      return { ...ev, vagas_restantes: ocup ? ocup.restantes : null };
    }));



    res.json({ eventos: comVagas.filter((ev) => ev.vagas_restantes === null || ev.vagas_restantes > 0) });
  } catch (e) {
    console.error('[inscricoes] totem eventos:', e.message);
    res.status(500).json({ error: 'Erro ao carregar os eventos' });
  }
});


router.post('/totem/eventos/:id/inscrever', authorizeModule('inscricoes-totem', 1), async (req, res) => {
  try {
    const ev = await eventoEspinhaPorId(req.params.id);
    if (!ev) return res.status(404).json({ error: 'Evento não encontrado' });


    if (!ev.no_totem) return res.status(403).json({ error: 'Este evento não está disponível no totem.' });

    const estacao = await totemEstacao.estacaoDaConta(req.user?.id);



    return await inscreverEspinha(req, res, ev, {
      origem: 'totem',
      estacaoId: estacao?.id || null,
    });
  } catch (e) {
    console.error('[inscricoes] totem inscrever:', e.message);
    res.status(500).json({ error: 'Erro ao concluir a inscrição' });
  }
});














const { sanitizarIps } = require('../utils/totemCerco');




router.get('/totens', authorizeModule('inscricoes', 1), async (req, res) => {
  try {
    const { data: estacoes, error } = await supabase.from('totem_estacoes')
      .select('*').order('codigo');
    if (error) throw error;

    const ids = (estacoes || []).map((e) => e.id);
    let tokens = [];
    if (ids.length) {
      const { data, error: e2 } = await supabase.from('totem_estacao_tokens')
        .select('id, estacao_id, tipo, prefixo, rotulo, linhagem, expira_em, pareado_em, usado_em, ultimo_uso_em, revogado_em, revogado_motivo, created_at')
        .in('estacao_id', ids).order('created_at', { ascending: false });
      if (e2) throw e2;
      tokens = data || [];
    }





    const contaIds = [...new Set((estacoes || []).map((e) => e.conta_id).filter(Boolean))];
    const emailPorConta = new Map();
    if (contaIds.length) {
      const { data: profs } = await supabase.from('profiles').select('id, email, name').in('id', contaIds);
      for (const p of profs || []) emailPorConta.set(p.id, p.email || p.name || null);
    }

    const agora = Date.now();
    const lista = (estacoes || []).map((e) => {
      const meus = tokens.filter((t) => t.estacao_id === e.id);
      const vivo = (t) => !t.revogado_em && (!t.expira_em || new Date(t.expira_em).getTime() > agora);
      return {
        ...e,
        conta_email: e.conta_id ? (emailPorConta.get(e.conta_id) || null) : null,


        online: !!e.ultima_batida_em && (agora - new Date(e.ultima_batida_em).getTime()) < 120000,
        dispositivo: meus.find((t) => t.tipo === 'dispositivo' && vivo(t)) || null,
        agente: meus.find((t) => t.tipo === 'agente' && vivo(t)) || null,
        pareamento_pendente: meus.find((t) => t.tipo === 'pareamento' && vivo(t) && !t.usado_em) || null,
        historico: meus.slice(0, 20),
      };
    });

    res.json({ estacoes: lista });
  } catch (e) {
    console.error('[inscricoes] listar totens:', e.message);
    res.status(500).json({ error: 'Erro ao carregar os totens' });
  }
});


router.post('/totens', authorizeModule('inscricoes', 4), async (req, res) => {
  try {
    const codigo = String(req.body?.codigo || '').trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{1,30}$/.test(codigo)) {
      return res.status(400).json({ error: 'Código: minúsculas, números e hífen (ex.: hall-01).' });
    }
    const nome = String(req.body?.nome || '').trim();
    if (nome.length < 3) return res.status(400).json({ error: 'Dê um nome que a equipe reconheça (ex.: Totem do Hall).' });

    const finalidades = Array.isArray(req.body?.finalidades) && req.body.finalidades.length
      ? req.body.finalidades.filter((f) => ['inscricoes', 'kids', 'membro', 'voluntariado'].includes(f))
      : ['inscricoes'];
    if (!finalidades.length) return res.status(400).json({ error: 'Finalidade inválida.' });

    const ips = sanitizarIps(req.body?.ip_permitidos);
    const linha = {
      codigo, nome, finalidades,
      local: String(req.body?.local || '').trim() || null,
      evento_fixo_id: req.body?.evento_fixo_id || null,
      ip_permitidos: ips.lista,
      created_by: req.user?.id || null,
    };

    const { data, error } = await supabase.from('totem_estacoes').insert(linha).select('*').single();
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: `Já existe um totem com o código "${codigo}".` });
      throw error;
    }


    res.status(201).json({
      ok: true,
      estacao: data,
      aviso: ips.descartados.length
        ? `Não entendi como IP: ${ips.descartados.join(', ')}. ${ips.lista ? 'O resto foi salvo.' : 'O totem ficou SEM cerco de rede.'}`
        : undefined,
    });
  } catch (e) {
    console.error('[inscricoes] criar totem:', e.message);
    res.status(500).json({ error: 'Erro ao criar o totem' });
  }
});


router.patch('/totens/:id', authorizeModule('inscricoes', 4), async (req, res) => {
  try {
    const patch = {};
    if (req.body?.nome !== undefined) patch.nome = String(req.body.nome).trim();
    if (req.body?.local !== undefined) patch.local = String(req.body.local || '').trim() || null;
    if (req.body?.evento_fixo_id !== undefined) patch.evento_fixo_id = req.body.evento_fixo_id || null;
    let avisoIps;
    if (req.body?.ip_permitidos !== undefined) {
      const ips = sanitizarIps(req.body.ip_permitidos);
      patch.ip_permitidos = ips.lista;
      if (ips.descartados.length) {
        avisoIps = `Não entendi como IP: ${ips.descartados.join(', ')}. ${ips.lista ? 'O resto foi salvo.' : 'O totem ficou SEM cerco de rede.'}`;
      }
    }
    if (req.body?.ativo !== undefined) patch.ativo = !!req.body.ativo;


    if (req.body?.conta_id !== undefined) patch.conta_id = req.body.conta_id || null;
    if (req.body?.finalidades !== undefined && Array.isArray(req.body.finalidades)) {
      const f = req.body.finalidades.filter((x) => ['inscricoes', 'kids', 'membro', 'voluntariado'].includes(x));
      if (f.length) patch.finalidades = f;
    }


    for (const c of ['tef_provider', 'tef_terminal_serie', 'tef_terminal_logico']) {
      if (req.body?.[c] !== undefined) patch[c] = String(req.body[c] || '').trim() || null;
    }
    if (req.body?.tef_ativo !== undefined) patch.tef_ativo = !!req.body.tef_ativo;
    for (const c of ['printer_target', 'printer_modelo']) {
      if (req.body?.[c] !== undefined) patch[c] = String(req.body[c] || '').trim() || null;
    }

    if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nada a atualizar.' });



    if (patch.ativo === true) {
      patch.revogada_em = null; patch.revogada_motivo = null; patch.revogada_por = null;
    }

    const { data, error } = await supabase.from('totem_estacoes')
      .update(patch).eq('id', req.params.id).select('*').maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Totem não encontrado' });

    totemEstacao.limparCache();
    res.json({ ok: true, estacao: data, aviso: avisoIps });
  } catch (e) {
    console.error('[inscricoes] editar totem:', e.message);
    res.status(500).json({ error: 'Erro ao atualizar o totem' });
  }
});






router.post('/totens/:id/pareamento', authorizeModule('inscricoes', 4), async (req, res) => {
  try {
    const { data: est, error } = await supabase.from('totem_estacoes')
      .select('id, codigo, nome, ativo, revogada_em').eq('id', req.params.id).maybeSingle();
    if (error) throw error;
    if (!est) return res.status(404).json({ error: 'Totem não encontrado' });
    if (!est.ativo || est.revogada_em) {
      return res.status(400).json({ error: 'Reative este totem antes de parear.' });
    }

    const r = await totemEstacao.gerarPareamento(est.id, {
      criadoPor: req.user?.id || null,
      rotulo: String(req.body?.rotulo || '').trim() || null,
    });



    res.json({ ok: true, codigo: r.codigo, expira_em: r.expira_em, estacao: { id: est.id, codigo: est.codigo, nome: est.nome } });
  } catch (e) {
    console.error('[inscricoes] pareamento totem:', e.message);
    res.status(500).json({ error: 'Erro ao gerar o código de pareamento' });
  }
});




router.get('/totens/contas', authorizeModule('inscricoes', 4), async (req, res) => {
  try {




    const { data: cargos, error: e0 } = await supabase.from('cargos')
      .select('id, slug').in('slug', ['totem-kiosk', 'totem-kids']);
    if (e0) throw e0;
    const cargoIds = (cargos || []).map((c) => c.id);
    if (!cargoIds.length) return res.json({ contas: [] });

    const { data: us, error: e1 } = await supabase.from('usuarios')
      .select('email, cargo_id').in('cargo_id', cargoIds);
    if (e1) throw e1;
    const emails = [...new Set((us || []).map((u) => String(u.email || '').toLowerCase()).filter(Boolean))];
    if (!emails.length) return res.json({ contas: [] });

    const { data: profs, error: e2 } = await supabase.from('profiles')
      .select('id, email, name').in('email', emails);
    if (e2) throw e2;



    const { data: usadas } = await supabase.from('totem_estacoes')
      .select('conta_id, codigo').not('conta_id', 'is', null);
    const porConta = new Map((usadas || []).map((e) => [e.conta_id, e.codigo]));

    res.json({
      contas: (profs || []).map((p) => ({
        id: p.id, email: p.email, nome: p.name,
        em_uso_por: porConta.get(p.id) || null,
      })).sort((a, b) => String(a.email).localeCompare(String(b.email))),
    });
  } catch (e) {
    console.error('[inscricoes] contas de totem:', e.message);
    res.status(500).json({ error: 'Erro ao carregar as contas de quiosque' });
  }
});


router.post('/totens/:id/revogar', authorizeModule('inscricoes', 4), async (req, res) => {
  try {
    const r = await totemEstacao.revogarEstacao(req.params.id, {
      por: req.user?.id || null,
      motivo: req.body?.motivo,
    });
    if (!r.ok) {
      return res.status(400).json({ error: 'Diga o motivo da revogação (fica no registro de auditoria).' });
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('[inscricoes] revogar totem:', e.message);
    res.status(500).json({ error: 'Erro ao revogar o totem' });
  }
});



router.post('/totens/tokens/:tokenId/revogar', authorizeModule('inscricoes', 4), async (req, res) => {
  try {
    const r = await totemEstacao.revogarToken(req.params.tokenId, {
      por: req.user?.id || null,
      motivo: req.body?.motivo || 'revogado pela equipe',
    });
    if (!r.ok) return res.status(400).json({ error: 'Diga o motivo da revogação.' });
    if (!r.revogados) return res.status(404).json({ error: 'Credencial não encontrada ou já revogada' });
    res.json({ ok: true });
  } catch (e) {
    console.error('[inscricoes] revogar credencial:', e.message);
    res.status(500).json({ error: 'Erro ao revogar a credencial' });
  }
});

module.exports = router;
