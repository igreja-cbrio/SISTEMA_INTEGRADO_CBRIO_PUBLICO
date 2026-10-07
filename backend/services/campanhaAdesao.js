
















const { supabase } = require('../utils/supabase');
const T = require('../utils/campanhaTemplates');
const { creditoNaJanela } = require('../utils/digitoCampanha');

const BASE_PUBLICA = process.env.PUBLIC_BASE_URL || 'https://www.cbrio.org';
const AREA_ADESAO = 'Administração';

function hojeBrt() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

function colunaFaltando(err) {
  return err && (err.code === '42703' || err.code === '42P01' || /column .* does not exist|relation .* does not exist/i.test(err.message || ''));
}

async function slugEventoLivre(base) {
  let slug = base;
  for (let i = 2; i < 40; i += 1) {
    const { data } = await supabase.from('insc_eventos').select('id').eq('slug', slug).limit(1);
    if (!data || !data.length) return slug;
    slug = `${base}-${i}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}

async function slugLinkLivre(base) {
  let slug = base;
  for (let i = 2; i < 40; i += 1) {
    const { data } = await supabase.from('link_curto').select('id').eq('slug', slug).limit(1);
    if (!data || !data.length) return slug;
    const sufixo = `-${i}`;
    slug = `${base.slice(0, 50 - sufixo.length)}${sufixo}`;
  }
  return null;
}


const URL_PORTA = {
  voluntariado: '/inscricao-voluntariado', grupos: '/inscricao-grupos', batismo: '/inscricao-batismo',

  devocional: '/aplicativo',
};

async function urlAdesao(camp) {
  const t = T.templateDe(camp);
  if (!t.porta) return { porta: null, url: null };
  if (t.porta !== 'adesao') {
    return { porta: t.porta, url: `${BASE_PUBLICA}${URL_PORTA[t.porta] || ''}`, evento_slug: null, evento_status: null };
  }
  if (!camp.evento_adesao_id) return { porta: 'adesao', url: null, evento_slug: null, evento_status: null };
  const { data: ev } = await supabase.from('insc_eventos').select('slug, status').eq('id', camp.evento_adesao_id).maybeSingle();
  if (!ev) return { porta: 'adesao', url: null, evento_slug: null, evento_status: null };
  return { porta: 'adesao', url: `${BASE_PUBLICA}/evento/${ev.slug}`, evento_slug: ev.slug, evento_status: ev.status };
}






async function garantirEventoAdesao(camp, userId) {
  const t = T.templateDe(camp);
  if (t.porta !== 'adesao') return null;
  if (camp.evento_adesao_id) return camp.evento_adesao_id;
  const slug = await slugEventoLivre(`adesao-${T.slugify(camp.slug || camp.nome)}`.slice(0, 48));
  const payload = {
    nome: camp.nome,
    slug,
    area: AREA_ADESAO,
    tipo: 'adesao',
    contrato: 'minimo',
    campanha_id: camp.id,
    campos: T.camposAdesao(camp.faixas),
    descricao: camp.descricao_curta || null,
    capa_url: camp.imagem_url || null,
    status: T.statusEventoAdesao(camp.status),
    inscricoes_encerram_em: camp.data_fim ? `${camp.data_fim}T23:59:59-03:00` : null,
    msg_sucesso_titulo: 'Adesão registrada!',
    msg_sucesso_texto: 'Obrigado por caminhar com a gente nesta campanha. Você vai receber as novidades pelo WhatsApp.',
    created_by: userId || null,
  };
  const { data, error } = await supabase.from('insc_eventos').insert(payload).select('id, slug').single();
  if (error) throw error;
  const { error: eUp } = await supabase.from('camp_campanhas')
    .update({ evento_adesao_id: data.id, updated_at: new Date().toISOString() }).eq('id', camp.id);
  if (eUp) throw eUp;
  return data.id;
}


async function sincronizarEventoAdesao(camp, statusCampanha) {
  if (!camp?.evento_adesao_id) return;
  const patch = {
    status: T.statusEventoAdesao(statusCampanha || camp.status),
    inscricoes_encerram_em: camp.data_fim ? `${camp.data_fim}T23:59:59-03:00` : null,
    nome: camp.nome,
    descricao: camp.descricao_curta || null,
    capa_url: camp.imagem_url || null,
    campos: T.camposAdesao(camp.faixas),
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('insc_eventos').update(patch).eq('id', camp.evento_adesao_id);
  if (error) console.error('[campanhaAdesao] sincronizar evento:', error.message);
}


async function listarInscritos(camp) {
  const t = T.templateDe(camp);
  try {
    if (t.porta === 'adesao') {
      if (!camp.evento_adesao_id) return { inscritos: [], porta: 'adesao' };
      const out = [];
      for (let off = 0; off < 20000; off += 1000) {
        const { data, error } = await supabase.from('inscricoes')
          .select('id, nome_completo, cpf, telefone, compromisso_centavos, qr_slug, status, created_at, membro_id, dados')
          .eq('evento_id', camp.evento_adesao_id).is('deleted_at', null)
          .order('created_at', { ascending: false }).range(off, off + 999);
        if (error) throw error;
        out.push(...(data || []));
        if (!data || data.length < 1000) break;
      }
      return { inscritos: out, porta: 'adesao' };
    }
    if (t.porta === 'grupos' || t.porta === 'batismo' || t.porta === 'devocional') {
      if (!camp.data_inicio || !camp.data_fim) return { inscritos: [], porta: t.porta, aviso: 'Defina início e fim: a janela é o que diz quais inscrições são desta campanha.' };
      const ini = `${String(camp.data_inicio).slice(0, 10)}T03:00:00Z`;
      const fim = `${String(camp.data_fim).slice(0, 10)}T02:59:59.999Z`;
      const fimMais = new Date(new Date(fim).getTime() + 24 * 3600 * 1000).toISOString();
      const out = [];
      const tabela = t.porta === 'grupos' ? 'mem_grupo_pedidos' : t.porta === 'batismo' ? 'batismo_inscricoes' : 'devocional_inscricoes';
      const cols = t.porta === 'grupos'
        ? 'id, nome, email, telefone, status, qr_slug, created_at, membro_id, grupo_id'
        : t.porta === 'batismo'
          ? 'id, nome, sobrenome, cpf, telefone, status, qr_slug, created_at, membro_id, data_batismo'
          : 'membro_id, plano_id, created_at';
      for (let off = 0; off < 20000; off += 1000) {
        let q = supabase.from(tabela).select(cols).gte('created_at', ini).lte('created_at', fimMais)
          .order('created_at', { ascending: false }).range(off, off + 999);
        if (t.porta !== 'devocional') q = q.is('deleted_at', null);
        const { data, error } = await q;
        if (error) {


          if (colunaFaltando(error)) return { inscritos: [], porta: t.porta, aviso: `A porta ${t.porta} não pôde ser lida (${error.code}).` };
          throw error;
        }
        out.push(...(data || []));
        if (!data || data.length < 1000) break;
      }

      const inscritos = out.map((r) => ({
        ...r,
        id: r.id || `${r.membro_id}:${r.plano_id}`,
        nome_completo: r.nome_completo || [r.nome, r.sobrenome].filter(Boolean).join(' ') || null,
      }));
      return { inscritos, porta: t.porta };
    }
    if (t.porta === 'voluntariado') {
      if (!camp.data_inicio || !camp.data_fim) return { inscritos: [], porta: 'voluntariado', aviso: 'Defina início e fim: a janela é o que diz quais inscrições são desta campanha.' };
      const out = [];
      for (let off = 0; off < 20000; off += 1000) {
        const { data, error } = await supabase.from('vol_inscricoes')
          .select('id, nome_completo, cpf, telefone, status, qr_slug, data_inscricao, membro_id, area')
          .gte('data_inscricao', `${camp.data_inicio}T00:00:00-03:00`)
          .lte('data_inscricao', `${camp.data_fim}T23:59:59-03:00`)
          .order('data_inscricao', { ascending: false }).range(off, off + 999);
        if (error) throw error;
        out.push(...(data || []));
        if (!data || data.length < 1000) break;
      }
      return { inscritos: out.map((v) => ({ ...v, created_at: v.data_inscricao })), porta: 'voluntariado' };
    }
    return { inscritos: [], porta: null };
  } catch (e) {
    if (colunaFaltando(e)) return { inscritos: [], porta: t.porta, aviso: 'Migration 20260928170000 ainda não aplicada.' };
    throw e;
  }
}





function realizadoPessoas(camp, inscritos) {
  const t = T.templateDe(camp);
  if (t.porta === 'voluntariado') {
    return { pessoas: (inscritos || []).filter((i) => i.status === 'integrado').length };
  }
  return { pessoas: 0 };
}






async function realizadoPorPorta(camp, inscritos = []) {
  const t = T.templateDe(camp);
  const vivos = inscritos.filter((i) => i && i.status !== 'cancelada' && i.status !== 'cancelado');
  if (t.porta === 'voluntariado') return { pessoas: vivos.filter((i) => i.status === 'integrado').length };
  if (t.porta === 'grupos') return { pessoas: vivos.filter((i) => i.status === 'aprovado').length };
  if (t.porta === 'batismo') return { pessoas: vivos.filter((i) => i.status === 'realizado').length };
  if (t.porta === 'devocional') {
    const ids = [...new Set(vivos.map((i) => i.membro_id).filter(Boolean))];
    if (!ids.length || !camp.data_inicio || !camp.data_fim) return { pessoas: 0 };
    const feitos = new Set();
    for (let i = 0; i < ids.length; i += 200) {


      const { data, error } = await supabase.from('mem_devocionais').select('membro_id')
        .in('membro_id', ids.slice(i, i + 200)).is('deleted_at', null)
        .gte('data_devocional', camp.data_inicio).lte('data_devocional', camp.data_fim).limit(5000);
      if (error) throw error;
      for (const d of data || []) feitos.add(d.membro_id);
    }
    return { pessoas: feitos.size };
  }
  return realizadoPessoas(camp, inscritos);
}

const TABELA_PORTA = {
  voluntariado: { tabela: 'vol_inscricoes', quando: 'data_inscricao', softDelete: true },
  grupos: { tabela: 'mem_grupo_pedidos', quando: 'created_at', softDelete: true },
  batismo: { tabela: 'batismo_inscricoes', quando: 'created_at', softDelete: true },
  devocional: { tabela: 'devocional_inscricoes', quando: 'created_at', softDelete: false },
};






async function serieMensalPorta(camp, hoje = hojeBrt()) {
  const t = T.templateDe(camp);
  const cfg = TABELA_PORTA[t.porta];
  if (!cfg) return null;
  const fimCamp = String(camp.data_fim || '').slice(0, 10);
  const ate = (fimCamp && fimCamp < hoje ? fimCamp : hoje).slice(0, 7);

  const y = Number(ate.slice(0, 4)); const m = Number(ate.slice(5, 7));
  const ini = new Date(Date.UTC(y, m - 1 - 11, 1, 3)).toISOString().slice(0, 10);
  const fimUtc = new Date(Date.UTC(y, m, 1, 3)).toISOString();
  const linhas = [];
  try {
    for (let off = 0; off < 50000; off += 1000) {
      let q = supabase.from(cfg.tabela).select(`${cfg.quando}, qr_slug`)
        .gte(cfg.quando, cfg.quando === 'created_at' ? `${ini}T03:00:00Z` : ini)
        .lt(cfg.quando, cfg.quando === 'created_at' ? fimUtc : fimUtc.slice(0, 10))
        .range(off, off + 999);
      if (cfg.softDelete) q = q.is('deleted_at', null);
      const { data, error } = await q;
      if (error) throw error;
      for (const r of data || []) linhas.push({ quando: r[cfg.quando], qr_slug: r.qr_slug });
      if (!data || data.length < 1000) break;
    }
  } catch (e) {
    if (colunaFaltando(e)) return { serie: [], aviso: 'Migration 20260929120000 ainda não aplicada (qr_slug).' };
    throw e;
  }
  return {
    porta: t.porta, ate, entrada_label: (T.INDICADOR_POR_VALOR[t.valor] || {}).entrada_label || null,
    serie: T.serieMensal({ linhas, ate, meses: 12, janela: { data_inicio: camp.data_inicio, data_fim: camp.data_fim } }),
  };
}


async function indicadorChave(camp) {
  const t = T.templateDe(camp);
  const ind = T.INDICADOR_POR_VALOR[t.valor];
  if (!ind) return null;
  try {
    const { data, error } = await supabase.rpc('fn_indice_engajamento_base');
    if (error) throw error;
    const pv = data?.por_valor?.[ind.manutencao] || null;
    return {
      valor: t.valor, manutencao_label: ind.manutencao_label, entrada_label: ind.entrada_label,
      manutencao: pv ? { n: pv.n ?? null, pct: pv.pct ?? null, base: data?.base_membros ?? data?.base ?? null } : null,
    };
  } catch (e) {
    console.warn('[campanhaAdesao] indicador-chave indisponível:', e.message);
    return { valor: t.valor, manutencao_label: ind.manutencao_label, entrada_label: ind.entrada_label, manutencao: null, aviso: 'Índice da base indisponível agora.' };
  }
}





async function resumoEdicoes(programaId, { exceto } = {}) {
  const { data: eds, error } = await supabase.from('camp_campanhas').select('*')
    .eq('programa_id', programaId).is('deleted_at', null).order('data_inicio', { ascending: false });
  if (error) throw error;
  const hoje = hojeBrt();
  const out = [];
  for (const camp of eds || []) {
    if (exceto && camp.id === exceto) { out.push({ id: camp.id, atual: true, nome: camp.nome, edicao_rotulo: camp.edicao_rotulo, status: camp.status, data_inicio: camp.data_inicio, data_fim: camp.data_fim }); continue; }
    const t = T.templateDe(camp);
    let reguas = null; let aviso = null;
    try {
      const li = await listarInscritos(camp);
      let realizado;
      if (t.unidade === 'centavos') {
        const { data: arr } = await supabase.from('vw_camp_arrecadacao').select('caixa_confirmado_centavos, caixa_conciliando_centavos, online_pago_centavos').eq('campanha_id', camp.id).maybeSingle();
        realizado = { total_centavos: (arr?.caixa_confirmado_centavos || 0) + (arr?.caixa_conciliando_centavos || 0) + (arr?.online_pago_centavos || 0) };
      } else realizado = await realizadoPorPorta(camp, li.inscritos);
      reguas = T.reguas({ campanha: camp, inscritos: li.inscritos, realizado, hoje });
      aviso = li.aviso || null;
    } catch (e) { aviso = e.message; }
    out.push({
      id: camp.id, atual: false, nome: camp.nome, edicao_rotulo: camp.edicao_rotulo, status: camp.status,
      data_inicio: camp.data_inicio, data_fim: camp.data_fim, template: t.id, unidade: t.unidade, reguas, aviso,
    });
  }
  return out;
}






async function comparativo(camp, retratoDinheiro) {
  const t = T.templateDe(camp);
  const hoje = hojeBrt();
  const [li, at, histRes] = await Promise.all([
    listarInscritos(camp), ativacoes(camp),
    supabase.from('camp_alvo_historico').select('*').eq('campanha_id', camp.id).order('alterado_em', { ascending: true }).limit(100),
  ]);
  let inscritos = li.inscritos;
  const avisos = [];
  if (li.aviso) avisos.push(li.aviso);
  if (at.aviso) avisos.push(at.aviso);
  if (histRes.error) avisos.push(`Histórico do alvo indisponível: ${histRes.error.message}`);
  if (t.unidade === 'centavos') {
    try {
      const e = await entradasPorAderente(camp, inscritos, hoje);
      inscritos = e.inscritos; if (e.aviso) avisos.push(e.aviso);
    } catch (err) { avisos.push(`Entradas por aderente indisponíveis: ${err.message}`); }
  }
  const realizado = t.unidade === 'centavos'
    ? { total_centavos: retratoDinheiro?.total_centavos || 0 }
    : await realizadoPorPorta(camp, inscritos);
  const reguas = T.reguas({ campanha: camp, inscritos, realizado, hoje });
  let serie = null;
  if (!t.sinal) { try { serie = await serieMensalPorta(camp, hoje); } catch (err) { avisos.push(`Série da porta indisponível: ${err.message}`); } }
  const c = T.comparativoEncerramento({
    campanha: camp, reguas, alvoHistorico: histRes.data || [],
    porAtivacao: T.inscritosPorAtivacao(at.ativacoes, inscritos), inscritos, serie, hoje,
  });
  return { ...c, hoje, avisos };
}

async function ativacoes(camp) {
  try {
    const { data: links, error } = await supabase.from('link_curto')
      .select('id, slug, titulo, destino, ativo, onde, canal, area_id, criado_em')
      .eq('campanha_id', camp.id).is('deleted_at', null).order('criado_em', { ascending: true });
    if (error) throw error;
    if (!links || !links.length) return { ativacoes: [] };
    const ids = links.map((l) => l.id);
    const { data: stats } = await supabase.from('vw_link_curto_stats')
      .select('link_id, acessos, acessos_7d, acessos_30d, ultimo_acesso').in('link_id', ids);
    const porId = new Map((stats || []).map((s) => [s.link_id, s]));
    let areas = new Map();
    const areaIds = [...new Set(links.map((l) => l.area_id).filter(Boolean))];
    if (areaIds.length) {
      const { data: ar } = await supabase.from('areas').select('id, nome').in('id', areaIds);
      areas = new Map((ar || []).map((a) => [a.id, a.nome]));
    }
    return {
      ativacoes: links.map((l) => ({
        ...l,
        area_nome: l.area_id ? (areas.get(l.area_id) || null) : null,
        url_curta: `${BASE_PUBLICA}/r/${l.slug}`,
        acessos: Number(porId.get(l.id)?.acessos || 0),
        acessos_7d: Number(porId.get(l.id)?.acessos_7d || 0),
        acessos_30d: Number(porId.get(l.id)?.acessos_30d || 0),
        ultimo_acesso: porId.get(l.id)?.ultimo_acesso || null,
      })),
    };
  } catch (e) {
    if (colunaFaltando(e)) return { ativacoes: [], aviso: 'Migration 20260928170000 ainda não aplicada.' };
    throw e;
  }
}

async function criarAtivacao(camp, { titulo, canal, onde, area_id } = {}, userId) {
  const tit = String(titulo || '').trim().slice(0, 160);
  if (!tit) return { erro: 'Dê um nome à ativação (ex.: "Banner do lounge").' };
  const canalOk = ['fisico', 'digital', 'culto'].includes(canal) ? canal : null;
  const destinoBase = await urlAdesao(camp);
  if (!destinoBase.url) return { erro: 'Esta campanha ainda não tem formulário de adesão.' };
  const slug = await slugLinkLivre(T.slugAtivacao(camp.slug || camp.nome, tit));
  if (!slug) return { erro: 'Não consegui gerar um código livre para o QR.' };
  const destino = `${destinoBase.url}?qr=${slug}`;
  const { data, error } = await supabase.from('link_curto').insert({
    slug, titulo: tit, destino,
    descricao: `Ativação da campanha "${camp.nome}"`,
    onde: String(onde || '').trim().slice(0, 300) || null,
    canal: canalOk,
    area_id: Number.isInteger(Number(area_id)) && area_id !== null && area_id !== '' ? Number(area_id) : null,
    campanha_id: camp.id,
    criado_por: userId || null, atualizado_por: userId || null,
  }).select('*').single();
  if (error) {
    if (error.code === '23505') return { erro: `O código "${slug}" já está em uso.` };
    throw error;
  }
  await supabase.from('link_curto_destino_hist').insert({
    link_id: data.id, destino_antigo: null, destino_novo: destino, alterado_por: userId || null,
  });
  return { ativacao: { ...data, url_curta: `${BASE_PUBLICA}/r/${slug}`, acessos: 0 } };
}


async function adotarAtivacao(camp, linkId, { canal, area_id } = {}, userId) {
  const { data: link, error } = await supabase.from('link_curto')
    .select('id, slug, campanha_id, destino').eq('id', linkId).is('deleted_at', null).maybeSingle();
  if (error) throw error;
  if (!link) return { erro: 'Link não encontrado.' };
  if (link.campanha_id && link.campanha_id !== camp.id) return { erro: 'Este QR já pertence a outra campanha.' };
  const patch = { campanha_id: camp.id, atualizado_por: userId || null, atualizado_em: new Date().toISOString() };
  if (['fisico', 'digital', 'culto'].includes(canal)) patch.canal = canal;
  if (area_id !== undefined) patch.area_id = area_id === null || area_id === '' ? null : Number(area_id);
  const { error: eUp } = await supabase.from('link_curto').update(patch).eq('id', link.id);
  if (eUp) throw eUp;
  const temQr = /[?&]qr=/.test(link.destino || '');
  return { ok: true, aviso: temQr ? null : 'O destino deste link não tem ?qr=<código>: os acessos contam, mas as inscrições não serão etiquetadas.' };
}

async function removerAtivacao(camp, linkId, userId) {
  const { data, error } = await supabase.from('link_curto')
    .update({ deleted_at: new Date().toISOString(), ativo: false, atualizado_por: userId || null })
    .eq('id', linkId).eq('campanha_id', camp.id).is('deleted_at', null).select('id').maybeSingle();
  if (error) throw error;
  return { ok: !!data };
}


const soDigitos = (v) => String(v || '').replace(/\D/g, '');
const cpfFormatado = (d) => (d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : d);
const centavoDoValor = (v) => String(Math.round(Math.abs(Number(v) || 0) * 100) % 100).padStart(2, '0');


const dentroDaJanela = (dia, camp) => creditoNaJanela(dia, camp);










async function entradasPorAderente(camp, inscritos = [], hoje = hojeBrt()) {
  const t = T.templateDe(camp);
  if (t.unidade !== 'centavos') return { inscritos, resumo: null };
  const decorridos = T.mesesDecorridos({ data_inicio: camp.data_inicio, hoje, meses: camp.meses });
  const porCpf = new Map();
  const cpfs = [];
  for (const i of inscritos) {
    const d = soDigitos(i.cpf);
    if (d.length === 11 && !porCpf.has(d)) { porCpf.set(d, { total_centavos: 0, entradas: 0, ultima: null }); cpfs.push(d); }
  }
  const somar = (cpf, centavos, dia) => {
    const e = porCpf.get(cpf); if (!e) return;
    e.total_centavos += centavos; e.entradas += 1;
    const d = String(dia || '').slice(0, 10);
    if (d && (!e.ultima || d > e.ultima)) e.ultima = d;
  };
  const vistos = new Set();
  const contarBruto = (b, cpf) => {
    if (!b || vistos.has(b.id)) return;
    const credito = b.tipo_trn === 'CREDIT' || (b.tipo_trn !== 'DEBIT' && Number(b.valor) > 0);
    if (!credito) return;
    if (camp.digito && centavoDoValor(b.valor) !== String(camp.digito)) return;
    if (!dentroDaJanela(b.data_lancamento, camp)) return;
    vistos.add(b.id);
    somar(cpf, Math.round(Math.abs(Number(b.valor) || 0) * 100), b.data_lancamento);
  };
  try {
    if (cpfs.length && camp.digito) {
      for (let i = 0; i < cpfs.length; i += 100) {
        const fatia = cpfs.slice(i, i + 100);

        const chaves = [...fatia, ...fatia.map(cpfFormatado)];
        const { data: brutos, error } = await supabase.from('fin_lancamentos_brutos')
          .select('id, valor, data_lancamento, documento_contraparte, tipo_trn')
          .in('documento_contraparte', chaves).gt('valor', 0).limit(5000);
        if (error) throw error;
        for (const b of brutos || []) contarBruto(b, soDigitos(b.documento_contraparte));
        const { data: pix, error: ePix } = await supabase.from('fin_pix_detalhe')
          .select('lancamento_bruto_id, pagador_documento').in('pagador_documento', chaves).limit(5000);
        if (ePix) throw ePix;
        const idsPix = [...new Set((pix || []).map((x) => x.lancamento_bruto_id).filter((id) => id && !vistos.has(id)))];
        const docPorBruto = new Map((pix || []).map((x) => [x.lancamento_bruto_id, soDigitos(x.pagador_documento)]));
        for (let j = 0; j < idsPix.length; j += 200) {
          const { data: b2, error: e2 } = await supabase.from('fin_lancamentos_brutos')
            .select('id, valor, data_lancamento, tipo_trn').in('id', idsPix.slice(j, j + 200));
          if (e2) throw e2;
          for (const b of b2 || []) contarBruto(b, docPorBruto.get(b.id));
        }
      }
    }
    if (cpfs.length) {
      for (let i = 0; i < cpfs.length; i += 100) {
        const fatia = cpfs.slice(i, i + 100);
        const { data: cob, error } = await supabase.from('pag_cobrancas')
          .select('id, pagador_cpf, valor_pago_centavos, pago_em, metadata')
          .eq('origem_tipo', 'generosidade').eq('status', 'pago').is('deleted_at', null)
          .in('pagador_cpf', [...fatia, ...fatia.map(cpfFormatado)]).limit(5000);
        if (error) throw error;
        for (const c of cob || []) {
          if (String(c.metadata?.campanha_id || '') !== String(camp.id)) continue;
          somar(soDigitos(c.pagador_cpf), Number(c.valor_pago_centavos) || 0, c.pago_em);
        }
      }
    }
  } catch (e) {
    if (colunaFaltando(e)) return { inscritos, resumo: null, aviso: 'Não foi possível casar as entradas por CPF (coluna ausente).' };
    throw e;
  }
  const anotados = inscritos.map((i) => {
    const e = porCpf.get(soDigitos(i.cpf)) || { total_centavos: 0, entradas: 0, ultima: null };
    const esperado = Math.max(0, Math.round(Number(i.compromisso_centavos) || 0)) * decorridos;
    return {
      ...i,
      total_centavos: e.total_centavos, entradas: e.entradas, ultima_entrada: e.ultima,
      esperado_centavos: esperado,
      status_aderente: T.statusAderente({
        compromisso_centavos: i.compromisso_centavos, total_centavos: e.total_centavos, meses_decorridos: decorridos,
      }),
    };
  });
  return { inscritos: anotados, resumo: { ...T.resumoAderentes(anotados), meses_decorridos: decorridos, hoje } };
}

async function retratoCompleto(camp, retratoDinheiro) {
  const t = T.templateDe(camp);
  const hoje = hojeBrt();
  const [li, at, adesao] = await Promise.all([listarInscritos(camp), ativacoes(camp), urlAdesao(camp)]);
  const realizado = t.unidade === 'centavos'
    ? { total_centavos: retratoDinheiro?.total_centavos || 0 }
    : await realizadoPorPorta(camp, li.inscritos);


  let serie_porta = null; let indicador_chave = null;
  try { serie_porta = t.sinal ? null : await serieMensalPorta(camp, hoje); } catch (e) { serie_porta = { serie: [], aviso: e.message }; }
  try { indicador_chave = await indicadorChave(camp); } catch (e) { indicador_chave = null; }
  const reguas = T.reguas({ campanha: camp, inscritos: li.inscritos, realizado, hoje });
  const porAtivacao = T.inscritosPorAtivacao(at.ativacoes, li.inscritos);
  return {
    template: {
      id: t.id, nome: t.nome, valor: t.valor, valor_nome: T.VALORES[t.valor], unidade: t.unidade,
      dinheiro: t.dinheiro, porta: t.porta, abas: t.abas, sinal: !!t.sinal,
    },
    reguas,
    serie_porta,
    indicador_chave,
    adesao,
    ativacoes: porAtivacao.ativacoes,
    inscritos_sem_qr: porAtivacao.sem_qr,
    inscritos_resumo: {
      total: reguas.inscritos.pessoas,
      porta: li.porta,
      aviso: li.aviso || at.aviso || null,
    },
  };
}

module.exports = {
  hojeBrt, urlAdesao, garantirEventoAdesao, sincronizarEventoAdesao,
  listarInscritos, realizadoPessoas, ativacoes, criarAtivacao, adotarAtivacao, removerAtivacao,
  entradasPorAderente, realizadoPorPorta, serieMensalPorta, indicadorChave, resumoEdicoes, comparativo,
  retratoCompleto, BASE_PUBLICA,
};
