









const express = require('express');
const router = express.Router();
const { supabase } = require('../utils/supabase');
const { authenticate, authorizeModule } = require('../middleware/auth');
const arrecadacao = require('../services/campanhaArrecadacao');
const disparo = require('../services/campanhaDisparo');
const agradece = require('../services/campanhaAgradece');
const campIdent = require('../utils/campanhaIdentidade');
const { normalizarDigito, checarDigitoLivre, sugerirDigito } = require('../utils/digitoCampanha');
const { SEGMENTOS, CANAIS } = require('../utils/campanhaPublico');
const svcMarcos = require('../services/campanhaMarcos');
const ciclo = require('../services/campanhaCiclo');
const T = require('../utils/campanhaTemplates');
const adesao = require('../services/campanhaAdesao');
let notificar; try { ({ notificar } = require('../services/notificar')); } catch { notificar = async () => {}; }

router.use(authenticate);


const CAMPOS_CAMPANHA = [
  'nome', 'descricao_curta', 'descricao', 'meta_centavos', 'meta_minima_centavos',
  'plano_contas_id', 'centro_custo_id', 'data_inicio', 'data_lancamento', 'data_fim',
  'publica', 'mostrar_valor', 'aceita_online', 'video_url', 'imagem_url',
  'cor_destaque', 'observacao',

  'edicao_rotulo', 'meta_pessoas', 'faixas', 'meses', 'mostrar_adesoes',
];

async function carregarCampanha(id) {
  const { data, error } = await supabase.from('camp_campanhas')
    .select('*').eq('id', id).is('deleted_at', null).maybeSingle();
  if (error) throw error;
  return data || null;
}

function mascararCpf(cpf) {
  const d = String(cpf || '').replace(/\D/g, '');
  return d.length === 11 ? `${d.slice(0, 3)}.***.***-${d.slice(9)}` : null;
}


function slugificar(nome) {
  return String(nome || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'campanha';
}








async function digitosOcupados() {
  const ocupados = [];
  const { data: camps } = await supabase.from('camp_campanhas')
    .select('id, nome, digito, status').is('deleted_at', null)
    .not('digito', 'is', null).in('status', ['rascunho', 'ativa', 'pausada']);
  for (const c of camps || []) ocupados.push({ dono: c.id, digito: c.digito, descricao: c.nome });

  const { data: idents } = await supabase.from('fin_identificadores_centavo')
    .select('id, centavo, descricao').eq('ativo', true);
  for (const i of idents || []) {
    ocupados.push({ dono: `fin:${i.id}`, digito: i.centavo, descricao: i.descricao });
  }
  return ocupados;
}



router.get('/', authorizeModule('campanhas', 1), async (req, res) => {
  try {
    const lista = await arrecadacao.listar({ incluirEncerradas: req.query.encerradas !== 'false' });


    try {
      const ids = lista.map((c) => c.campanha_id).filter(Boolean);
      if (ids.length) {
        const { data: extra, error } = await supabase.from('camp_campanhas')
          .select('id, template, valor, programa_id, edicao_rotulo, meta_pessoas').in('id', ids);
        if (error) throw error;
        const progIds = [...new Set((extra || []).map((e) => e.programa_id).filter(Boolean))];
        let progs = new Map();
        if (progIds.length) {
          const { data: pr } = await supabase.from('camp_programas').select('id, nome, valor, recorrente').in('id', progIds);
          progs = new Map((pr || []).map((x) => [x.id, x]));
        }
        const porId = new Map((extra || []).map((e) => [e.id, e]));
        for (const c of lista) {
          const e = porId.get(c.campanha_id) || {};
          const t = T.templateDe({ template: e.template });
          c.template = t.id; c.template_nome = t.nome; c.unidade = t.unidade; c.sinal = !!t.sinal;
          c.valor = e.valor || t.valor; c.valor_nome = T.VALORES[c.valor] || null;
          c.edicao_rotulo = e.edicao_rotulo || null; c.meta_pessoas = e.meta_pessoas || null;
          c.programa_id = e.programa_id || null;
          c.programa = e.programa_id ? (progs.get(e.programa_id) || null) : null;
        }
      }
    } catch (e) {
      console.warn('[campanhas] lista sem template/valor:', e.message);
    }
    res.json(lista);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});






router.get('/templates', authorizeModule('campanhas', 1), (_req, res) => {
  res.json({ templates: T.listarTemplates(), valores: T.VALORES, por_valor: T.listarValores() });
});


router.get('/programas', authorizeModule('campanhas', 1), async (req, res) => {
  try {
    let q = supabase.from('camp_programas').select('*').is('deleted_at', null).order('nome');
    if (req.query.valor) q = q.eq('valor', String(req.query.valor));
    const { data: progs, error } = await q;
    if (error) {
      if (error.code === '42P01') return res.status(503).json({ error: 'A migration 20260929120000 (programas) ainda não foi aplicada.' });
      return res.status(400).json({ error: error.message });
    }
    const ids = (progs || []).map((p) => p.id);
    let eds = [];
    if (ids.length) {
      const { data } = await supabase.from('camp_campanhas')
        .select('id, nome, edicao_rotulo, status, data_inicio, data_fim, programa_id')
        .in('programa_id', ids).is('deleted_at', null).order('data_inicio', { ascending: false });
      eds = data || [];
    }
    res.json((progs || []).map((p) => ({
      ...p, valor_nome: T.VALORES[p.valor] || p.valor,
      edicoes: eds.filter((e) => e.programa_id === p.id),
    })));
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.get('/programas/:id/edicoes', authorizeModule('campanhas', 1), async (req, res) => {
  try {
    const { data: prog } = await supabase.from('camp_programas').select('*').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!prog) return res.status(404).json({ error: 'Programa não encontrado' });
    const edicoes = await adesao.resumoEdicoes(prog.id);
    res.json({ programa: { ...prog, valor_nome: T.VALORES[prog.valor] || prog.valor }, edicoes });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.patch('/programas/:id', authorizeModule('campanhas', 3), async (req, res) => {
  try {
    const patch = {};
    if (req.body?.nome !== undefined) {
      const nome = String(req.body.nome || '').trim();
      if (nome.length < 2) return res.status(400).json({ error: 'O nome do programa precisa de pelo menos 2 letras.' });
      patch.nome = nome.slice(0, 120);
    }
    if (req.body?.descricao !== undefined) patch.descricao = req.body.descricao ? String(req.body.descricao).slice(0, 2000) : null;
    if (req.body?.recorrente !== undefined) patch.recorrente = req.body.recorrente === true;
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nada a atualizar.' });
    patch.updated_at = new Date().toISOString();
    const { data, error } = await supabase.from('camp_programas').update(patch).eq('id', req.params.id).is('deleted_at', null).select().maybeSingle();
    if (error) return res.status(400).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Programa não encontrado' });
    res.json(data);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.get('/digitos', authorizeModule('campanhas', 1), async (_req, res) => {
  try {
    const ocupados = await digitosOcupados();
    res.json({
      ocupados: ocupados.map((o) => ({ digito: o.digito, descricao: o.descricao })),
      sugestao: sugerirDigito(ocupados),
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.get('/segmentos', authorizeModule('campanhas', 1), (_req, res) => {
  res.json({ segmentos: SEGMENTOS, canais: CANAIS });
});










router.get('/aux', authorizeModule('campanhas', 1), async (_req, res) => {
  try {
    const [pessoas, areas] = await Promise.all([
      svcMarcos.pessoasAtribuiveis(),
      svcMarcos.areasAtivas(),
    ]);
    res.json({ ...pessoas, areas });
  } catch (e) {


    res.status(400).json({ error: e.message });
  }
});







router.get('/aux-contabil', authorizeModule('campanhas', 3), async (_req, res) => {
  try {
    const [pc, cc] = await Promise.all([
      supabase.from('fin_plano_contas').select('id, codigo, nome, tipo, aceita_lancamento, ativo')
        .eq('tipo', 'receita').eq('aceita_lancamento', true).eq('ativo', true).order('codigo'),
      supabase.from('fin_centros_custo').select('id, codigo, nome, aceita_lancamento, ativo').eq('ativo', true).order('codigo'),
    ]);
    if (pc.error) return res.status(400).json({ error: pc.error.message });
    if (cc.error) return res.status(400).json({ error: cc.error.message });
    res.json({ plano_contas: pc.data || [], centros_custo: (cc.data || []).filter((c) => c.aceita_lancamento !== false) });
  } catch (e) { res.status(400).json({ error: e.message }); }
});




router.get('/:id', authorizeModule('campanhas', 1), async (req, res) => {
  try {
    const { data: camp, error } = await supabase.from('camp_campanhas')
      .select('*').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (error) return res.status(400).json({ error: error.message });
    if (!camp) return res.status(404).json({ error: 'Campanha não encontrada' });

    const retrato = await arrecadacao.retrato(camp.id);


    let extra = {};
    try {
      extra = await adesao.retratoCompleto(camp, retrato);
    } catch (e) {
      console.error('[campanhas] retrato completo:', e.message);
      const t = T.templateDe(camp);
      extra = { template: { id: t.id, nome: t.nome, unidade: t.unidade, dinheiro: t.dinheiro, porta: t.porta, abas: t.abas },
        aviso_reguas: e.message };
    }

    let programa = null; let edicoes = [];
    try {
      if (camp.programa_id) {
        const { data: pr } = await supabase.from('camp_programas').select('*').eq('id', camp.programa_id).maybeSingle();
        programa = pr ? { ...pr, valor_nome: T.VALORES[pr.valor] || pr.valor } : null;
        edicoes = await adesao.resumoEdicoes(camp.programa_id, { exceto: camp.id });
      }
    } catch (e) { console.warn('[campanhas] programa/edições:', e.message); }
    extra.programa = programa; extra.edicoes = edicoes;
    try { extra.ciclo_criativo = await ciclo.estadoDoCiclo(camp); } catch (e) { extra.ciclo_criativo = null; }
    extra.valor = camp.valor || extra.template?.valor || null;
    extra.valor_nome = T.VALORES[extra.valor] || null;
    const { data: marcosRaw, error: eM } = await supabase.from('camp_marcos')
      .select('*').eq('campanha_id', camp.id).is('deleted_at', null)
      .order('ordem').order('data_prevista');
    if (eM) return res.status(400).json({ error: eM.message });



    let marcosLista = (marcosRaw || []).map((m) => ({ ...m, responsaveis: [], area_nome: null }));
    let atribuicao_incompleta = null;
    try {
      marcosLista = await svcMarcos.anexarAtribuicao(marcosRaw || []);
    } catch (e) {
      console.error('[campanhas] anexar atribuição:', e.message);
      atribuicao_incompleta = e.message;
    }
    const { data: disparos } = await supabase.from('camp_disparos')
      .select('*').eq('campanha_id', camp.id).is('deleted_at', null)
      .order('created_at', { ascending: false }).limit(50);

    res.json({
      campanha: camp, ...retrato, ...extra,
      marcos: marcosLista, disparos: disparos || [],
      ...(atribuicao_incompleta ? { atribuicao_incompleta } : {}),
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/', authorizeModule('campanhas', 3), async (req, res) => {
  try {
    const template = String(req.body?.template || '').trim();
    const valorPedido = String(req.body?.valor || '').trim();




    if (!template && !valorPedido) return criarLegado(req, res);
    if (template === 'legado') return criarLegado(req, res, { valor: valorPedido || 'generosidade' });
    const v = T.validarNova({ ...req.body, template: template || undefined, valor: valorPedido || undefined });
    if (v.erro) return res.status(400).json({ error: v.erro });
    const t = v.template;
    const nome = v.valores.nome;
    let digito = null;
    if (t.dinheiro) {
      digito = normalizarDigito(req.body?.digito);
      if (req.body?.digito && !digito) {
        return res.status(400).json({ error: 'O dígito precisa ser dois números de 01 a 99 (o 00 não pode).' });
      }
      if (digito) {
        const livre = checarDigitoLivre(digito, await digitosOcupados());
        if (!livre.ok) return res.status(409).json({ error: livre.motivo, codigo: 'digito_ocupado' });
      }
    }

    let programaId = null;
    try {
      programaId = await resolverPrograma(req, { valor: t.valor, template: t.id, nomeEdicao: nome });
    } catch (e) {
      if (e.code === '42P01') return res.status(503).json({ error: 'A migration 20260929120000 (programas) ainda não foi aplicada.' });
      return res.status(400).json({ error: e.message });
    }
    const payload = {
      nome, digito, slug: slugificar(req.body?.slug || nome),
      template: t.id, valor: t.valor, programa_id: programaId,
      meta_centavos: v.valores.meta_centavos,
      meta_pessoas: v.valores.meta_pessoas,
      faixas: v.valores.faixas,
      meses: v.valores.meses,
      edicao_rotulo: v.valores.edicao_rotulo,
      alvo_definido_em: new Date().toISOString(),
    };
    const jaTratados = new Set(['nome', 'meta_centavos', 'meta_pessoas', 'faixas', 'meses', 'edicao_rotulo']);
    for (const c of CAMPOS_CAMPANHA) {
      if (jaTratados.has(c)) continue;
      if (req.body?.[c] !== undefined) payload[c] = req.body[c];
    }
    payload.created_by = req.user?.userId || null;
    const { data, error } = await supabase.from('camp_campanhas').insert(payload).select().single();
    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Já existe campanha com esse dígito ou endereço.', codigo: 'duplicado' });
      }
      if (error.code === '42703') {
        return res.status(503).json({ error: 'A migration 20260928170000 (campanhas em três réguas) ainda não foi aplicada.' });
      }
      return res.status(400).json({ error: error.message });
    }

    try {
      const r = await ciclo.criarCicloDaCampanha(data, req.user?.userId);
      if (r.ok) { data.evento_id = r.evento_id; data.ciclo_ativado = r.ciclo_ativado; if (r.aviso) data.aviso_ciclo = r.aviso; }
      else if (r.motivo !== 'sem_data') data.aviso_ciclo = r.detalhe || r.motivo;
    } catch (e) { data.aviso_ciclo = `Ciclo criativo não criado: ${e.message}`; }
    let aviso = null;
    let evento_adesao_id = null;
    try {
      evento_adesao_id = await adesao.garantirEventoAdesao(data, req.user?.userId);
    } catch (e) {
      console.error('[campanhas] evento de adesão:', e.message);
      aviso = `A campanha foi criada, mas o formulário de adesão não: ${e.message}`;
    }
    res.status(201).json({ ...data, evento_adesao_id: evento_adesao_id || data.evento_adesao_id || null, ...(aviso ? { aviso } : {}) });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});






async function resolverPrograma(req, { valor, template, nomeEdicao }) {
  const pid = String(req.body?.programa_id || '').trim();
  if (pid) {
    const { data: pr, error } = await supabase.from('camp_programas').select('id, valor').eq('id', pid).is('deleted_at', null).maybeSingle();
    if (error) throw error;
    if (!pr) throw new Error('Programa (campanha) não encontrado.');
    if (pr.valor !== valor) throw new Error('A edição precisa incentivar o mesmo valor da campanha que ela continua.');
    return pr.id;
  }
  const nomeProg = String(req.body?.programa_nome || nomeEdicao || '').trim().slice(0, 120);
  const { data, error } = await supabase.from('camp_programas').insert({
    nome: nomeProg || nomeEdicao, valor, template,
    descricao: req.body?.programa_descricao ? String(req.body.programa_descricao).slice(0, 2000) : null,
    recorrente: req.body?.recorrente === undefined ? true : req.body.recorrente === true,
    created_by: req.user?.userId || null,
  }).select('id').single();
  if (error) throw error;
  return data.id;
}


async function criarLegado(req, res, opts = {}) {
  try {
    const nome = String(req.body?.nome || '').trim();
    if (!nome) return res.status(400).json({ error: 'O nome da campanha é obrigatório.' });
    const meta = Math.round(Number(req.body?.meta_centavos) || 0);
    if (meta <= 0) return res.status(400).json({ error: 'A meta precisa ser maior que zero.' });
    const digito = normalizarDigito(req.body?.digito);
    if (req.body?.digito && !digito) {
      return res.status(400).json({ error: 'O dígito precisa ser dois números de 01 a 99 (o 00 não pode).' });
    }
    if (digito) {
      const livre = checarDigitoLivre(digito, await digitosOcupados());
      if (!livre.ok) return res.status(409).json({ error: livre.motivo, codigo: 'digito_ocupado' });
    }
    const payload = { nome, digito, meta_centavos: meta, slug: slugificar(req.body?.slug || nome) };
    const novos = new Set(['edicao_rotulo', 'meta_pessoas', 'faixas', 'meses', 'mostrar_adesoes']);
    for (const c of CAMPOS_CAMPANHA) {
      if (c === 'nome' || c === 'meta_centavos' || novos.has(c)) continue;
      if (req.body?.[c] !== undefined) payload[c] = req.body[c];
    }

    if (opts.valor) {
      try {
        payload.valor = opts.valor; payload.template = 'legado';
        if (req.body?.edicao_rotulo) payload.edicao_rotulo = String(req.body.edicao_rotulo).trim().slice(0, 40) || null;
        payload.programa_id = await resolverPrograma(req, { valor: opts.valor, template: 'legado', nomeEdicao: nome });
      } catch (e) {
        if (e.code === '42P01' || e.code === '42703') return res.status(503).json({ error: 'A migration 20260929120000 (programas) ainda não foi aplicada.' });
        return res.status(400).json({ error: e.message });
      }
    }
    payload.created_by = req.user?.userId || null;
    const { data, error } = await supabase.from('camp_campanhas').insert(payload).select().single();
    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Já existe campanha com esse dígito ou endereço.', codigo: 'duplicado' });
      }
      return res.status(400).json({ error: error.message });
    }


    if (opts.valor) {
      try {
        const r = await ciclo.criarCicloDaCampanha(data, req.user?.userId);
        if (r.ok) { data.evento_id = r.evento_id; data.ciclo_ativado = r.ciclo_ativado; if (r.aviso) data.aviso_ciclo = r.aviso; }
        else if (r.motivo !== 'sem_data') data.aviso_ciclo = r.detalhe || r.motivo;
      } catch (e) { data.aviso_ciclo = `Ciclo criativo não criado: ${e.message}`; }
    }
    res.status(201).json(data);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}

router.put('/:id', authorizeModule('campanhas', 3), async (req, res) => {
  try {
    const patch = {};
    for (const c of CAMPOS_CAMPANHA) if (req.body?.[c] !== undefined) patch[c] = req.body[c];





    if (patch.nome !== undefined) {
      const v = campIdent.validarNome(patch.nome);
      if (!v.ok) {
        return res.status(400).json({ error: campIdent.mensagemDoMotivo(v.motivo), campo: 'nome' });
      }
      patch.nome = v.nome;
    }
    if (patch.descricao_curta !== undefined) {
      const v = campIdent.validarDescricaoCurta(patch.descricao_curta);
      if (!v.ok) {
        return res.status(400).json({ error: campIdent.mensagemDoMotivo(v.motivo), campo: 'descricao_curta' });
      }
      patch.descricao_curta = v.descricao_curta;
    }











    if (req.body?.digito !== undefined) {
      const digito = req.body.digito === null || req.body.digito === ''
        ? null : normalizarDigito(req.body.digito);
      if (req.body.digito && !digito) {
        return res.status(400).json({ error: 'O dígito precisa ser dois números de 01 a 99 (o 00 não pode).' });
      }
      if (digito) {


        const livre = checarDigitoLivre(digito, await digitosOcupados(), { ignorar: req.params.id });
        if (!livre.ok) return res.status(409).json({ error: livre.motivo, codigo: 'digito_ocupado' });
      }
      patch.digito = digito;
    }

    if (patch.meta_centavos !== undefined) {
      patch.meta_centavos = Math.round(Number(patch.meta_centavos) || 0);
      if (patch.meta_centavos <= 0) return res.status(400).json({ error: 'A meta precisa ser maior que zero.' });
    }
    if (patch.meta_pessoas !== undefined) {
      patch.meta_pessoas = patch.meta_pessoas === null || patch.meta_pessoas === '' ? null : Math.round(Number(patch.meta_pessoas) || 0);
      if (patch.meta_pessoas !== null && patch.meta_pessoas <= 0) return res.status(400).json({ error: 'O alvo em pessoas precisa ser maior que zero.' });
    }
    if (patch.faixas !== undefined) {
      const vf = T.validarFaixas(patch.faixas);
      if (vf.erro) return res.status(400).json({ error: vf.erro, campo: 'faixas' });
      patch.faixas = vf.faixas;
    }
    if (patch.meses !== undefined) {
      patch.meses = patch.meses === null || patch.meses === '' ? null : Math.round(Number(patch.meses) || 0);
      if (patch.meses !== null && !(patch.meses >= 1 && patch.meses <= 60)) return res.status(400).json({ error: 'Os meses do compromisso vão de 1 a 60.' });
    }
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nada a atualizar.' });


    let antesAlvo = null;
    if (patch.meta_centavos !== undefined || patch.meta_pessoas !== undefined) {
      antesAlvo = await carregarCampanha(req.params.id);
      if (!antesAlvo) return res.status(404).json({ error: 'Campanha não encontrada' });
      const mudou = (patch.meta_centavos !== undefined && Number(patch.meta_centavos) !== Number(antesAlvo.meta_centavos || 0))
        || (patch.meta_pessoas !== undefined && Number(patch.meta_pessoas || 0) !== Number(antesAlvo.meta_pessoas || 0));
      if (!mudou) antesAlvo = null;
      else if (antesAlvo.status !== 'rascunho' && !String(req.body?.motivo || '').trim()) {
        return res.status(400).json({ error: 'A campanha já foi publicada: para mudar o alvo, escreva o motivo.', campo: 'motivo', codigo: 'motivo_obrigatorio' });
      }
    }
    patch.updated_at = new Date().toISOString();
    const { data, error } = await supabase.from('camp_campanhas')
      .update(patch).eq('id', req.params.id).is('deleted_at', null).select().maybeSingle();
    if (error) return res.status(400).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Campanha não encontrada' });
    if (antesAlvo) {
      await supabase.from('camp_alvo_historico').insert({
        campanha_id: data.id,
        meta_centavos_anterior: antesAlvo.meta_centavos ?? null, meta_centavos_novo: data.meta_centavos ?? null,
        meta_pessoas_anterior: antesAlvo.meta_pessoas ?? null, meta_pessoas_novo: data.meta_pessoas ?? null,
        motivo: String(req.body?.motivo || (antesAlvo.status === 'rascunho' ? 'ajuste em rascunho' : '')).trim().slice(0, 500),
        alterado_por: req.user?.userId || null,
      }).then(({ error: eH }) => { if (eH) console.error('[campanhas] histórico do alvo:', eH.message); });
    }
    const toca = ['faixas', 'nome', 'descricao_curta', 'imagem_url', 'data_fim'].some((c) => patch[c] !== undefined);
    if (toca && data.evento_adesao_id) {
      adesao.sincronizarEventoAdesao(data, data.status).catch((e) => console.error('[campanhas] sync adesão:', e.message));
    }
    res.json(data);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});








router.post('/:id/status', authorizeModule('campanhas', 4), async (req, res) => {
  const STATUS = ['rascunho', 'ativa', 'pausada', 'encerrada', 'cancelada'];
  const status = String(req.body?.status || '');
  if (!STATUS.includes(status)) {
    return res.status(400).json({ error: `Status inválido. Use: ${STATUS.join(', ')}` });
  }
  try {
    const { data: antes } = await supabase.from('camp_campanhas')
      .select('*').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!antes) return res.status(404).json({ error: 'Campanha não encontrada' });




    if (status === 'ativa' && !antes.digito && T.templateDe(antes).dinheiro) {
      const { data: c } = await supabase.from('camp_campanhas')
        .select('aceita_online').eq('id', req.params.id).maybeSingle();
      if (!c?.aceita_online) {
        return res.status(400).json({
          error: 'Esta campanha não tem dígito verificador nem doação online — não haveria como identificar o dinheiro dela. Configure um dos dois antes de ativar.',
          codigo: 'sem_caminho_de_arrecadacao',
        });
      }
    }

    const { data, error } = await supabase.from('camp_campanhas')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', req.params.id).is('deleted_at', null).select().maybeSingle();
    if (error) return res.status(400).json({ error: error.message });
    if (data?.evento_adesao_id) {
      adesao.sincronizarEventoAdesao(data, status).catch((e) => console.error('[campanhas] sync adesão:', e.message));
    }

    if (antes.status !== status) {
      await notificar({
        modulo: 'campanhas',
        tipo: 'campanha_status',
        titulo: `Campanha "${antes.nome}" agora está ${status}`,
        mensagem: status === 'ativa'
          ? `A campanha passou a ATIVA. O dígito ${antes.digito || '(sem dígito)'} começa a classificar as doações e a barrinha pode ir para as telas.`
          : `A campanha mudou de "${antes.status}" para "${status}".`,
        link: '/campanhas',
        chaveDedup: `camp_status_${req.params.id}_${status}`,
      }).catch((e) => console.error('[campanhas] notificar:', e.message));
    }
    res.json(data);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});





router.get('/:id/inscritos', authorizeModule('campanhas', 1), async (req, res) => {
  try {
    const camp = await carregarCampanha(req.params.id);
    if (!camp) return res.status(404).json({ error: 'Campanha não encontrada' });
    const r = await adesao.listarInscritos(camp);



    let anotados = r.inscritos; let resumo = null; let avisoStatus = null;
    try {
      const e = await adesao.entradasPorAderente(camp, r.inscritos);
      anotados = e.inscritos; resumo = e.resumo; avisoStatus = e.aviso || null;
    } catch (e) {
      console.error('[campanhas] entradas por aderente:', e.message);
      avisoStatus = 'Não foi possível calcular o status dos aderentes agora.';
    }
    res.json({
      porta: r.porta, aviso: r.aviso || avisoStatus || null, resumo,
      status_labels: T.STATUS_ADERENTE,
      inscritos: anotados.map((i) => ({ ...i, cpf: mascararCpf(i.cpf), dados: undefined })),
    });
  } catch (e) { res.status(400).json({ error: e.message }); }
});


router.get('/:id/ativacoes', authorizeModule('campanhas', 1), async (req, res) => {
  try {
    const camp = await carregarCampanha(req.params.id);
    if (!camp) return res.status(404).json({ error: 'Campanha não encontrada' });
    const [at, li, url] = await Promise.all([adesao.ativacoes(camp), adesao.listarInscritos(camp), adesao.urlAdesao(camp)]);
    const por = T.inscritosPorAtivacao(at.ativacoes, li.inscritos);
    res.json({ ativacoes: por.ativacoes, sem_qr: por.sem_qr, adesao: url, aviso: at.aviso || li.aviso || null });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/:id/ativacoes', authorizeModule('campanhas', 3), async (req, res) => {
  try {
    const camp = await carregarCampanha(req.params.id);
    if (!camp) return res.status(404).json({ error: 'Campanha não encontrada' });
    const r = await adesao.criarAtivacao(camp, req.body || {}, req.user?.userId);
    if (r.erro) return res.status(400).json({ error: r.erro });
    res.status(201).json(r.ativacao);
  } catch (e) {
    if (e.code === '42703') return res.status(503).json({ error: 'A migration 20260928170000 ainda não foi aplicada.' });
    res.status(400).json({ error: e.message });
  }
});


router.post('/:id/ativacoes/adotar', authorizeModule('campanhas', 3), async (req, res) => {
  try {
    const camp = await carregarCampanha(req.params.id);
    if (!camp) return res.status(404).json({ error: 'Campanha não encontrada' });
    const r = await adesao.adotarAtivacao(camp, String(req.body?.link_id || ''), req.body || {}, req.user?.userId);
    if (r.erro) return res.status(400).json({ error: r.erro });
    res.json(r);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/:id/ativacoes/:linkId', authorizeModule('campanhas', 3), async (req, res) => {
  try {
    const camp = await carregarCampanha(req.params.id);
    if (!camp) return res.status(404).json({ error: 'Campanha não encontrada' });
    const r = await adesao.removerAtivacao(camp, req.params.linkId, req.user?.userId);
    if (!r.ok) return res.status(404).json({ error: 'Ativação não encontrada nesta campanha.' });
    res.json(r);
  } catch (e) { res.status(400).json({ error: e.message }); }
});


router.post('/:id/ciclo-criativo', authorizeModule('campanhas', 3), async (req, res) => {
  try {
    const camp = await carregarCampanha(req.params.id);
    if (!camp) return res.status(404).json({ error: 'Campanha não encontrada' });
    const r = await ciclo.criarCicloDaCampanha(camp, req.user?.userId);
    if (!r.ok) {
      const http = r.motivo === 'ja_tem_evento' ? 409 : r.motivo === 'sem_data' ? 400 : 503;
      return res.status(http).json({ error: r.detalhe || (r.motivo === 'ja_tem_evento' ? 'Esta campanha já tem um evento com ciclo.' : r.motivo), codigo: r.motivo, evento_id: r.evento_id || null });
    }
    res.json(r);
  } catch (e) { res.status(400).json({ error: e.message }); }
});


router.get('/:id/comparativo', authorizeModule('campanhas', 1), async (req, res) => {
  try {
    const camp = await carregarCampanha(req.params.id);
    if (!camp) return res.status(404).json({ error: 'Campanha não encontrada' });
    const retrato = await arrecadacao.retrato(camp.id);
    res.json(await adesao.comparativo(camp, retrato));
  } catch (e) {
    if (e.code === '42703' || e.code === '42P01') return res.status(503).json({ error: `Migration pendente (${e.code}): ${e.message}` });
    res.status(400).json({ error: e.message });
  }
});

router.get('/:id/alvo-historico', authorizeModule('campanhas', 1), async (req, res) => {
  try {
    const { data, error } = await supabase.from('camp_alvo_historico')
      .select('*').eq('campanha_id', req.params.id).order('alterado_em', { ascending: false }).limit(50);
    if (error) return res.status(400).json({ error: error.message });
    res.json(data || []);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/:id', authorizeModule('campanhas', 4), async (req, res) => {
  try {
    const { data, error } = await supabase.rpc('app_soft_delete', {
      p_table_name: 'camp_campanhas',
      p_row_id: req.params.id,
      p_deleted_by: req.user?.userId ?? null,
    });


    if (error) return res.status(500).json({ error: 'Erro ao excluir a campanha', detalhe: error.message });
    res.json({ ok: !!data });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao excluir a campanha', detalhe: e.message });
  }
});














router.post('/:id/digito', authorizeModule('campanhas', 4), async (req, res) => {
  try {
    const cru = req.body?.digito;

    const remover = cru === null || cru === '';
    const digito = remover ? null : normalizarDigito(cru);
    if (!remover && !digito) {
      return res.status(400).json({
        error: 'O dígito precisa ser dois números de 01 a 99. O 00 não pode: ele é o centavo de quem não declarou nada, e está em 87% dos créditos da igreja.',
      });
    }

    if (digito) {


      const livre = checarDigitoLivre(digito, await digitosOcupados(), { ignorar: req.params.id });
      if (!livre.ok) return res.status(409).json({ error: livre.motivo, codigo: 'digito_ocupado' });
    }

    const r = await arrecadacao.trocarDigito({
      campanhaId: req.params.id,
      digitoNovo: digito,
      motivo: req.body?.motivo || null,
      autorId: req.user?.userId || null,
    });
    if (!r.ok) return res.status(404).json({ error: 'Campanha não encontrada' });

    if (!r.sem_mudanca) {
      await notificar({
        modulo: 'campanhas',
        tipo: 'campanha_digito',
        titulo: `Dígito da campanha mudou: ${r.anterior || '(nenhum)'} → ${r.novo || '(nenhum)'}`,
        mensagem: r.fixados
          ? `${r.fixados} lançamento(s) que já estavam identificados pelo dígito ${r.anterior} foram FIXADOS na campanha, então o total não muda. Doações novas passam a ser identificadas pelo dígito ${r.novo}.`
          : `Não havia nenhum lançamento identificado pelo dígito anterior, então nada precisou ser fixado.`,
        link: '/campanhas',
        chaveDedup: `camp_digito_${req.params.id}_${r.novo || 'nulo'}`,
      }).catch((e) => console.error('[campanhas] notificar dígito:', e.message));
    }
    res.json(r);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});


router.get('/:id/digito-historico', authorizeModule('campanhas', 1), async (req, res) => {
  const { data, error } = await supabase.from('camp_digito_historico')
    .select('id, digito_anterior, digito_novo, lancamentos_fixados, motivo, created_at')
    .eq('campanha_id', req.params.id).order('created_at', { ascending: false }).limit(50);
  if (error) return res.status(400).json({ error: error.message });
  res.json(data || []);
});



router.get('/:id/lancamentos', authorizeModule('campanhas', 1), async (req, res) => {
  try {


    res.json(await arrecadacao.lancamentos(req.params.id));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.get('/:id/pendentes', authorizeModule('campanhas', 1), async (req, res) => {
  try {
    res.json(await arrecadacao.pendentesDeConciliacao(req.params.id));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});








router.post('/:id/vinculo', authorizeModule('campanhas', 3), async (req, res) => {
  const { lancamento_bruto_id, transacao_id, incluir, motivo } = req.body || {};
  if (!lancamento_bruto_id && !transacao_id) {
    return res.status(400).json({ error: 'Informe o lançamento ou a transação.' });
  }
  if (typeof incluir !== 'boolean') {
    return res.status(400).json({ error: 'Diga explicitamente se o lançamento entra (true) ou não entra (false) nesta campanha.' });
  }
  try {
    const { data, error } = await supabase.from('camp_vinculos').upsert({
      campanha_id: req.params.id,
      lancamento_bruto_id: lancamento_bruto_id || null,
      transacao_id: transacao_id || null,
      incluir,
      motivo: motivo ? String(motivo).slice(0, 500) : null,
      created_by: req.user?.userId || null,
    }, { onConflict: lancamento_bruto_id ? 'campanha_id,lancamento_bruto_id' : 'campanha_id,transacao_id' })
      .select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.status(201).json(data);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.delete('/:id/vinculo/:vinculoId', authorizeModule('campanhas', 3), async (req, res) => {
  const { error } = await supabase.from('camp_vinculos')
    .delete().eq('id', req.params.vinculoId).eq('campanha_id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});







const CAMPOS_MARCO = ['titulo', 'descricao', 'tipo', 'area_id',
  'data_prevista', 'data_conclusao', 'status', 'ordem', 'marketing_card_id'];

router.post('/:id/marcos', authorizeModule('campanhas', 3), async (req, res) => {
  try {
    const titulo = String(req.body?.titulo || '').trim();
    if (!titulo) return res.status(400).json({ error: 'O título da tarefa é obrigatório.' });
    const payload = { campanha_id: req.params.id, titulo, created_by: req.user?.userId || null };
    for (const c of CAMPOS_MARCO) if (c !== 'titulo' && req.body?.[c] !== undefined) payload[c] = req.body[c];
    payload.area_id = svcMarcos.normalizarArea(req.body?.area_id);

    const { data, error } = await supabase.from('camp_marcos').insert(payload).select().single();
    if (error) return res.status(400).json({ error: error.message });

    const atrib = await aplicarAtribuicao({
      marco: data, body: req.body, campanhaId: req.params.id, autorId: req.user?.userId,
    });
    res.status(201).json({ ...data, ...atrib });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});








async function aplicarAtribuicao({ marco, body, campanhaId, autorId }) {
  const out = {};
  const { data: camp } = await supabase.from('camp_campanhas')
    .select('nome').eq('id', campanhaId).maybeSingle();
  const contexto = {
    marcoId: marco.id,
    marcoTitulo: marco.titulo,
    campanhaNome: camp?.nome || 'campanha',
    prazo: marco.data_prevista,
  };

  if (body?.responsaveis !== undefined) {
    Object.assign(out, await svcMarcos.definirResponsaveis({
      marcoId: marco.id, bruto: body.responsaveis, autorId, contexto,
    }));
  }



  const semNomeados = !Array.isArray(body?.responsaveis) || !body.responsaveis.length;
  if (marco.area_id && semNomeados) {
    out.avisados_area = await svcMarcos.avisarAtribuidos({
      adicionados: [], autorId, contexto, areaId: marco.area_id,
    });
  }
  return out;
}

router.put('/marcos/:marcoId', authorizeModule('campanhas', 3), async (req, res) => {
 try {
  const patch = {};
  for (const c of CAMPOS_MARCO) if (req.body?.[c] !== undefined) patch[c] = req.body[c];
  if (req.body?.area_id !== undefined) patch.area_id = svcMarcos.normalizarArea(req.body.area_id);
  if (req.body?.titulo !== undefined && !String(req.body.titulo).trim()) {
    return res.status(400).json({ error: 'O título da tarefa não pode ficar vazio.' });
  }


  if (!Object.keys(patch).length && req.body?.responsaveis === undefined) {
    return res.status(400).json({ error: 'Nada a atualizar.' });
  }


  if (patch.status === 'concluido' && patch.data_conclusao === undefined) {
    patch.data_conclusao = arrecadacao.hojeBrt();
  }
  if (patch.status && patch.status !== 'concluido' && patch.data_conclusao === undefined) {
    patch.data_conclusao = null;
  }
  patch.updated_at = new Date().toISOString();

  let atual = null;
  if (Object.keys(patch).length) {
    const { data, error } = await supabase.from('camp_marcos')
      .update(patch).eq('id', req.params.marcoId).is('deleted_at', null).select().maybeSingle();
    if (error) return res.status(400).json({ error: error.message });
    atual = data;
  } else {
    const { data } = await supabase.from('camp_marcos')
      .select('*').eq('id', req.params.marcoId).is('deleted_at', null).maybeSingle();
    atual = data;
  }
  if (!atual) return res.status(404).json({ error: 'Tarefa não encontrada' });

  const atrib = await aplicarAtribuicao({
    marco: atual, body: req.body, campanhaId: atual.campanha_id, autorId: req.user?.userId,
  });
  res.json({ ...atual, ...atrib });
 } catch (e) {
  res.status(400).json({ error: e.message });
 }
});

router.delete('/marcos/:marcoId', authorizeModule('campanhas', 3), async (req, res) => {
  const { data, error } = await supabase.rpc('app_soft_delete', {
    p_table_name: 'camp_marcos',
    p_row_id: req.params.marcoId,
    p_deleted_by: req.user?.userId ?? null,
  });
  if (error) return res.status(500).json({ error: 'Erro ao excluir o marco', detalhe: error.message });
  res.json({ ok: !!data });
});



const CAMPOS_DISPARO = ['nome', 'canal', 'segmento', 'assunto', 'corpo_texto',
  'corpo_html', 'wa_template', 'agendado_para', 'recorrencia'];








router.post('/:id/disparos/previa', authorizeModule('campanhas', 3), async (req, res) => {
  const canal = String(req.body?.canal || 'email');
  if (!CANAIS.includes(canal)) return res.status(400).json({ error: `Canal inválido. Use: ${CANAIS.join(', ')}` });
  const segmento = String(req.body?.segmento || 'todos');
  if (!SEGMENTOS[segmento]) return res.status(400).json({ error: 'Segmento inválido.' });
  try {
    const pub = await disparo.previa({ campanha_id: req.params.id, canal, segmento });


    res.json({
      canal: pub.canal,
      segmento,
      total_base: pub.total_base,
      total_alvo: pub.total_alvo,
      total_fora: pub.total_fora,
      motivos: pub.motivos,
      exemplo: pub.alvo.slice(0, 3).map((a) => a.nome).filter(Boolean),
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/:id/disparos', authorizeModule('campanhas', 3), async (req, res) => {
  const nome = String(req.body?.nome || '').trim();
  if (!nome) return res.status(400).json({ error: 'Dê um nome ao disparo (é o que aparece no histórico).' });
  const canal = String(req.body?.canal || 'email');
  if (!CANAIS.includes(canal)) return res.status(400).json({ error: `Canal inválido. Use: ${CANAIS.join(', ')}` });

  const payload = { campanha_id: req.params.id, nome, canal, created_by: req.user?.userId || null };
  for (const c of CAMPOS_DISPARO) if (c !== 'nome' && c !== 'canal' && req.body?.[c] !== undefined) payload[c] = req.body[c];
  const { data, error } = await supabase.from('camp_disparos').insert(payload).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

router.put('/disparos/:disparoId', authorizeModule('campanhas', 3), async (req, res) => {
  const patch = {};
  for (const c of CAMPOS_DISPARO) if (req.body?.[c] !== undefined) patch[c] = req.body[c];
  if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nada a atualizar.' });
  patch.updated_at = new Date().toISOString();



  const { data: atual } = await supabase.from('camp_disparos')
    .select('status').eq('id', req.params.disparoId).is('deleted_at', null).maybeSingle();
  if (!atual) return res.status(404).json({ error: 'Disparo não encontrado' });
  if (['enviando', 'enviado'].includes(atual.status)) {
    return res.status(409).json({
      error: 'Este disparo já começou a ser enviado e não pode mais ser alterado. Crie outro.',
      codigo: 'disparo_em_curso',
    });
  }

  const { data, error } = await supabase.from('camp_disparos')
    .update(patch).eq('id', req.params.disparoId).is('deleted_at', null).select().maybeSingle();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});









router.post('/disparos/:disparoId/agendar', authorizeModule('campanhas', 4), async (req, res) => {
  try {
    const quando = req.body?.agendado_para ? new Date(req.body.agendado_para) : new Date();
    if (Number.isNaN(quando.getTime())) return res.status(400).json({ error: 'Data de agendamento inválida.' });

    const { data: d } = await supabase.from('camp_disparos')
      .select('*, campanha:campanha_id(status, nome)')
      .eq('id', req.params.disparoId).is('deleted_at', null).maybeSingle();
    if (!d) return res.status(404).json({ error: 'Disparo não encontrado' });
    if (d.campanha?.status !== 'ativa') {
      return res.status(409).json({
        error: `A campanha está "${d.campanha?.status}". Pedido de doação só sai com a campanha ATIVA.`,
        codigo: 'campanha_nao_ativa',
      });
    }
    if (!d.corpo_texto && !d.corpo_html && !d.wa_template) {
      return res.status(400).json({ error: 'Escreva a mensagem antes de agendar.' });
    }

    const { data, error } = await supabase.from('camp_disparos')
      .update({ status: 'agendado', agendado_para: quando.toISOString(), erro: null, updated_at: new Date().toISOString() })
      .eq('id', req.params.disparoId).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/disparos/:disparoId/cancelar', authorizeModule('campanhas', 3), async (req, res) => {
  const { data, error } = await supabase.from('camp_disparos')
    .update({ status: 'cancelado', updated_at: new Date().toISOString() })
    .eq('id', req.params.disparoId).in('status', ['rascunho', 'agendado'])
    .is('deleted_at', null).select().maybeSingle();
  if (error) return res.status(400).json({ error: error.message });


  if (!data) return res.status(409).json({ error: 'Este disparo já saiu (ou está saindo) e não pode ser cancelado.', codigo: 'ja_enviado' });
  res.json(data);
});

router.get('/disparos/:disparoId/envios', authorizeModule('campanhas', 2), async (req, res) => {


  const { data, error } = await supabase.from('camp_disparo_envios')
    .select('id, membro_id, canal, destino, status, motivo, enviado_em')
    .eq('disparo_id', req.params.disparoId)
    .order('enviado_em', { ascending: false, nullsFirst: false }).limit(500);
  if (error) return res.status(400).json({ error: error.message });
  res.json(data || []);
});



router.get('/:id/agradecimentos', authorizeModule('campanhas', 1), async (req, res) => {
  const { data, error } = await supabase.from('camp_agradecimentos')
    .select('id, membro_id, canal, status, motivo, enviado_em, transacao_id, cobranca_id')
    .eq('campanha_id', req.params.id)
    .order('enviado_em', { ascending: false, nullsFirst: false }).limit(300);
  if (error) return res.status(400).json({ error: error.message });
  res.json(data || []);
});


router.post('/agradecimentos/rodar', authorizeModule('campanhas', 4), async (_req, res) => {
  try {
    res.json(await agradece.rodar({ limite: 40 }));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});













module.exports = router;
module.exports.enviarPendentes = disparo.enviarPendentes;
module.exports.rodarAgradecimentos = agradece.rodar;
module.exports.garantirSemanal = disparo.garantirSemanal;
