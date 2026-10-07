







const express = require('express');
const router = express.Router();
const { supabase } = require('../utils/supabase');
const { authenticate, authorizeModule } = require('../middleware/auth');

router.use(authenticate);

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/;



const RESERVADOS = new Set([
  'api', 'admin', 'app', 'r', 'login', 'logout', 'assets', 'static',
  'privacidade', 'aplicativo', 'null', 'undefined', 'www',
]);













function normalizarDestino(bruto) {
  const v = String(bruto || '').trim();
  if (!v) return { erro: 'Informe o destino do link' };
  let u;
  try { u = new URL(v); } catch { return { erro: 'Destino precisa ser uma URL completa (com https://)' }; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') {
    return { erro: 'Só aceito destino http ou https' };
  }


  if (/\/r\/[a-z0-9-]/i.test(u.pathname)) {
    return { erro: 'O destino não pode ser outro link curto — isso criaria um laço' };
  }
  return { destino: u.toString() };
}

function limpar(v, max) {
  const s = String(v ?? '').trim();
  return s ? s.slice(0, max) : null;
}


router.get('/', authorizeModule('links', 1), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('vw_link_curto_stats').select('*').order('criado_em', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});




router.get('/catalogo', authorizeModule('links', 1), catalogoHandler);

router.get('/:id', authorizeModule('links', 1), async (req, res) => {
  try {
    const [link, hist, porDia] = await Promise.all([
      supabase.from('link_curto').select('*').eq('id', req.params.id)
        .is('deleted_at', null).maybeSingle(),
      supabase.from('link_curto_destino_hist').select('*')
        .eq('link_id', req.params.id).order('alterado_em', { ascending: false }).limit(50),
      supabase.from('link_curto_acesso').select('em, aparelho')
        .eq('link_id', req.params.id).order('em', { ascending: false }).limit(2000),
    ]);
    if (link.error) throw link.error;
    if (!link.data) return res.status(404).json({ error: 'Link não encontrado' });


    const dias = {};
    const aparelhos = {};
    for (const a of porDia.data || []) {
      const d = String(a.em).slice(0, 10);
      dias[d] = (dias[d] || 0) + 1;
      aparelhos[a.aparelho || 'outro'] = (aparelhos[a.aparelho || 'outro'] || 0) + 1;
    }
    res.json({
      ...link.data,
      historico: hist.data || [],
      por_dia: Object.entries(dias).map(([dia, total]) => ({ dia, total }))
        .sort((a, b) => a.dia.localeCompare(b.dia)),
      por_aparelho: Object.entries(aparelhos).map(([aparelho, total]) => ({ aparelho, total })),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


router.post('/', authorizeModule('links', 4), async (req, res) => {
  try {
    const slug = String(req.body?.slug || '').trim().toLowerCase();
    if (!SLUG_RE.test(slug)) {
      return res.status(400).json({
        error: 'O código deve ter de 3 a 50 caracteres, só letras minúsculas, números e hífen',
      });
    }
    if (RESERVADOS.has(slug)) {
      return res.status(400).json({ error: `"${slug}" é um nome reservado do sistema` });
    }
    const d = normalizarDestino(req.body?.destino);
    if (d.erro) return res.status(400).json({ error: d.erro });
    const titulo = limpar(req.body?.titulo, 160);
    if (!titulo) return res.status(400).json({ error: 'Dê um nome ao link (é como você vai achá-lo depois)' });

    const { data, error } = await supabase.from('link_curto').insert({
      slug, titulo, destino: d.destino,
      descricao: limpar(req.body?.descricao, 500),
      onde: limpar(req.body?.onde, 300),
      criado_por: req.user?.id || null,
      atualizado_por: req.user?.id || null,
    }).select('*').single();

    if (error) {

      if (error.code === '23505') {
        return res.status(409).json({ error: `O código "${slug}" já está em uso` });
      }
      throw error;
    }

    await supabase.from('link_curto_destino_hist').insert({
      link_id: data.id, destino_antigo: null, destino_novo: d.destino,
      alterado_por: req.user?.id || null,
    });
    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});



router.put('/:id', authorizeModule('links', 4), async (req, res) => {
  try {
    const { data: atual, error: e0 } = await supabase.from('link_curto')
      .select('id, destino').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (e0) throw e0;
    if (!atual) return res.status(404).json({ error: 'Link não encontrado' });

    const patch = { atualizado_por: req.user?.id || null, atualizado_em: new Date().toISOString() };
    if (req.body?.titulo !== undefined) {
      const t = limpar(req.body.titulo, 160);
      if (!t) return res.status(400).json({ error: 'O nome não pode ficar vazio' });
      patch.titulo = t;
    }
    if (req.body?.descricao !== undefined) patch.descricao = limpar(req.body.descricao, 500);
    if (req.body?.onde !== undefined) patch.onde = limpar(req.body.onde, 300);
    if (req.body?.ativo !== undefined) patch.ativo = req.body.ativo === true;

    let mudouDestino = false;
    if (req.body?.destino !== undefined) {
      const d = normalizarDestino(req.body.destino);
      if (d.erro) return res.status(400).json({ error: d.erro });
      if (d.destino !== atual.destino) { patch.destino = d.destino; mudouDestino = true; }
    }

    const { data, error } = await supabase.from('link_curto')
      .update(patch).eq('id', req.params.id).select('*').single();
    if (error) throw error;

    if (mudouDestino) {
      await supabase.from('link_curto_destino_hist').insert({
        link_id: data.id, destino_antigo: atual.destino, destino_novo: patch.destino,
        alterado_por: req.user?.id || null,
      });
    }
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});




router.delete('/:id', authorizeModule('links', 5), async (req, res) => {
  try {
    const { error } = await supabase.from('link_curto')
      .update({ deleted_at: new Date().toISOString(), atualizado_por: req.user?.id || null })
      .eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});






router.post('/para-destino', authorizeModule('links', 4), async (req, res) => {
  try {
    const d = normalizarDestino(req.body?.destino);
    if (d.erro) return res.status(400).json({ error: d.erro });

    const { data: existente } = await supabase.from('link_curto')
      .select('*').eq('destino', d.destino).eq('ativo', true).is('deleted_at', null)
      .order('criado_em', { ascending: false }).limit(1).maybeSingle();
    if (existente) return res.json({ ...existente, reusado: true });

    const base = String(req.body?.slug_sugerido || req.body?.titulo || 'link')
      .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'link';


    for (let i = 0; i < 12; i += 1) {
      const slug = i === 0 ? base : `${base}-${i + 1}`;
      if (!SLUG_RE.test(slug) || RESERVADOS.has(slug)) continue;
      const { data, error } = await supabase.from('link_curto').insert({
        slug, titulo: limpar(req.body?.titulo, 160) || slug, destino: d.destino,
        onde: limpar(req.body?.onde, 300),
        criado_por: req.user?.id || null, atualizado_por: req.user?.id || null,
      }).select('*').single();
      if (!error) {
        await supabase.from('link_curto_destino_hist').insert({
          link_id: data.id, destino_antigo: null, destino_novo: d.destino,
          alterado_por: req.user?.id || null,
        });
        return res.status(201).json({ ...data, reusado: false });
      }
      if (error.code !== '23505') throw error;
    }
    res.status(409).json({ error: 'Não consegui gerar um código livre — crie um manualmente' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});























const { catalogoPublico } = require('../services/inscricaoPortas');



const OUTROS_FORMULARIOS = [
  { chave: 'cadastro_membresia', nome: 'Cadastro de membresia', caminho: '/cadastro-membresia',
    grupo: 'Membresia', descricao: 'Ficha completa de cadastro — a porta principal da membresia.' },
  { chave: 'doar', nome: 'Doação / generosidade', caminho: '/doar',
    grupo: 'Generosidade', descricao: 'Página de contribuição (PIX e cartão).' },



  { chave: 'decisao', nome: 'Decisão por Cristo', caminho: '/decisao',
    grupo: 'Ministerial', descricao: 'Registro de decisão — usado no culto e no online.',
    chamada_qr: 'Decidiu seguir a Jesus agora? Queremos caminhar com você.' },



  { chave: 'visitante', nome: 'Visitante · registro + voucher', caminho: '/visitante',
    grupo: 'Integração', descricao: 'Porta do visitante (sem local): nome, WhatsApp e CPF · voucher da cafeteria · pesquisa depois do culto.',
    chamada_qr: 'Primeira vez na CBRio? Registre sua visita e ganhe um café por nossa conta.' },
  { chave: 'visitante_lounge', nome: 'Visitante · cartaz do Lounge', caminho: '/visitante?local=lounge',
    grupo: 'Integração', descricao: 'Mesma porta, etiquetada como Lounge.',
    chamada_qr: 'Primeira vez aqui? Ganhe um café por nossa conta.' },
  { chave: 'visitante_banheiro', nome: 'Visitante · cartaz do Banheiro', caminho: '/visitante?local=banheiro',
    grupo: 'Integração', descricao: 'Mesma porta, etiquetada como Banheiro.',
    chamada_qr: 'É visitante? Um café te espera na cafeteria.' },
  { chave: 'visitante_estacionamento', nome: 'Visitante · cartaz do Estacionamento', caminho: '/visitante?local=estacionamento',
    grupo: 'Integração', descricao: 'Mesma porta, etiquetada como Estacionamento.',
    chamada_qr: 'Chegou pela primeira vez? Seu café é presente nosso.' },
  { chave: 'visitante_templo', nome: 'Visitante · cartaz do Templo', caminho: '/visitante?local=templo',
    grupo: 'Integração', descricao: 'Mesma porta, etiquetada como Templo.',
    chamada_qr: 'Que bom ter você aqui! Registre sua visita e ganhe um café.' },
  { chave: 'wallet', nome: 'Carteirinha do membro', caminho: '/wallet',
    grupo: 'Membresia', descricao: 'Onde a pessoa acessa a própria carteirinha.' },
  { chave: 'vol_self_checkin', nome: 'Check-in do voluntário', caminho: '/voluntariado/self-checkin',
    grupo: 'Voluntariado', descricao: 'Voluntário marca a própria presença na escala.' },
  { chave: 'suporte', nome: 'Suporte', caminho: '/suporte',
    grupo: 'Interno', descricao: 'Canal de suporte do sistema.' },
];

const BASE_PUBLICA = process.env.PUBLIC_BASE_URL || 'https://www.cbrio.org';

async function catalogoHandler(req, res) {
  try {
    const url = (caminho) => `${BASE_PUBLICA}${caminho}`;
    const itens = [];


    for (const p of catalogoPublico()) {
      const caminho = (p.rotas_publicas || [])[0];

      if (!caminho || caminho.includes(':')) continue;
      itens.push({
        chave: `porta_${p.chave}`, nome: p.nome, grupo: 'Inscrições',
        url: url(caminho), descricao: `Porta de inscrição · módulo ${p.modulo || '—'}`,
      });
    }


    for (const f of OUTROS_FORMULARIOS) {
      itens.push({
        chave: f.chave, nome: f.nome, grupo: f.grupo, url: url(f.caminho),
        descricao: f.descricao, chamada_qr: f.chamada_qr || null,
      });
    }







    const [pesquisas, eventosNovos, eventosExternos, links] = await Promise.all([
      supabase.from('cen_pesquisa').select('slug, titulo, status')
        .eq('status', 'aberta').is('deleted_at', null).limit(50),
      supabase.from('insc_eventos').select('slug, nome, status')
        .eq('status', 'publicado').is('deleted_at', null)
        .order('data', { ascending: false }).limit(50),
      supabase.from('ext_eventos').select('slug, nome, form_ativo')
        .eq('form_ativo', true).is('deleted_at', null).limit(50),
      supabase.from('link_curto').select('slug, destino, titulo, ativo')
        .is('deleted_at', null),
    ]);

    for (const p of pesquisas.data || []) {
      itens.push({
        chave: `censo_${p.slug}`, nome: p.titulo, grupo: 'Pesquisas',
        url: url(`/censo/p/${p.slug}`), descricao: 'Pesquisa aberta para respostas',
      });
    }


    const vistos = new Set();
    for (const [fonte, rotulo] of [[eventosNovos, 'Evento com inscrição aberta'],
                                   [eventosExternos, 'Evento externo com formulário ativo']]) {
      if (fonte.error) continue;
      for (const e of fonte.data || []) {
        if (!e.slug || vistos.has(e.slug)) continue;
        vistos.add(e.slug);
        itens.push({
          chave: `evento_${e.slug}`, nome: e.nome, grupo: 'Eventos',
          url: url(`/evento/${e.slug}`), descricao: rotulo,
        });
      }
    }



    const porDestino = new Map();
    for (const l of links.data || []) {
      if (l.ativo) porDestino.set(String(l.destino).replace(/\/$/, ''), l);
    }
    const comStatus = itens.map((i) => {
      const curto = porDestino.get(i.url.replace(/\/$/, ''));
      return { ...i, link_curto: curto ? { slug: curto.slug, titulo: curto.titulo } : null };
    });

    res.json({
      base: BASE_PUBLICA,
      itens: comStatus.sort((a, b) => a.grupo.localeCompare(b.grupo) || a.nome.localeCompare(b.nome)),

      excluidos_por_serem_pessoais: [
        'Convite de família', 'Aprovação de pedido de grupo', 'Frequência do grupo',
        'Pesquisa NPS', 'Retirada do Kids', 'Pagamento de inscrição', 'Onboarding de colaborador',
      ],
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
}

module.exports = router;
module.exports.normalizarDestino = normalizarDestino;
module.exports.SLUG_RE = SLUG_RE;
module.exports.RESERVADOS = RESERVADOS;




module.exports.OUTROS_FORMULARIOS = OUTROS_FORMULARIOS;
