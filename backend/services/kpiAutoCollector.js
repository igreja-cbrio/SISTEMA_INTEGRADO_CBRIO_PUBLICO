









const { supabase } = require('../utils/supabase');
const { resultadoSemana, semanaFechada } = require('../utils/crescimentoDs');
const MKT_LINHA = require('../utils/marketingLinha');
const MKT_KPIS = require('../utils/marketingKpis');
const MKT_CARGA = require('../utils/marketingCargaPessoa');
const { lerCargaEquipe } = require('./marketingCargaEquipe');



function periodoAtual(periodicidade, date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  switch (periodicidade) {
    case 'semanal': {
      const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
      const day = d.getUTCDay() || 7;
      d.setUTCDate(d.getUTCDate() + 4 - day);
      const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
      const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
      return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
    }
    case 'mensal':     return `${y}-${m}`;
    case 'trimestral': return `${y}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
    case 'semestral':  return `${y}-S${date.getUTCMonth() < 6 ? 1 : 2}`;
    case 'anual':      return `${y}`;
    default:           return `${y}-${m}`;
  }
}


function periodoRange(periodo, periodicidade) {
  if (periodicidade === 'semanal') {
    const [year, week] = periodo.split('-W').map(Number);
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const day = jan4.getUTCDay() || 7;
    const monday = new Date(jan4);
    monday.setUTCDate(jan4.getUTCDate() - day + 1 + (week - 1) * 7);
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 7);
    return { inicio: monday.toISOString().slice(0, 10), fim: sunday.toISOString().slice(0, 10) };
  }
  if (periodicidade === 'mensal') {
    const [y, m] = periodo.split('-').map(Number);
    const ini = new Date(Date.UTC(y, m - 1, 1));
    const fim = new Date(Date.UTC(y, m, 1));
    return { inicio: ini.toISOString().slice(0, 10), fim: fim.toISOString().slice(0, 10) };
  }
  if (periodicidade === 'trimestral') {
    const [y, qStr] = periodo.split('-Q');
    const q = Number(qStr);
    const ini = new Date(Date.UTC(Number(y), (q - 1) * 3, 1));
    const fim = new Date(Date.UTC(Number(y), q * 3, 1));
    return { inicio: ini.toISOString().slice(0, 10), fim: fim.toISOString().slice(0, 10) };
  }
  if (periodicidade === 'semestral') {
    const [y, sStr] = periodo.split('-S');
    const s = Number(sStr);
    const ini = new Date(Date.UTC(Number(y), (s - 1) * 6, 1));
    const fim = new Date(Date.UTC(Number(y), s * 6, 1));
    return { inicio: ini.toISOString().slice(0, 10), fim: fim.toISOString().slice(0, 10) };
  }

  const y = Number(periodo);
  return { inicio: `${y}-01-01`, fim: `${y + 1}-01-01` };
}




function isAmiCulto(c) {
  const t = (c.service_type_name || '').toLowerCase();
  if (t) return t === 'ami';
  const n = (c.nome || '').toLowerCase();
  return (n.includes('ami') || n.includes('sabado') || n.includes('sábado')) && !n.includes('bridge');
}

function isBridgeCulto(c) {
  const t = (c.service_type_name || '').toLowerCase();
  if (t) return t === 'bridge';
  const n = (c.nome || '').toLowerCase();
  return n.includes('bridge');
}





function isSedeCulto(c) {
  const t = (c.service_type_name || '').toLowerCase();
  if (t) return t.startsWith('domingo') || t === 'quarta com deus';
  const n = (c.nome || '').toLowerCase();
  return n.startsWith('domingo') || n.includes('quarta');
}


function isAmiBridgeCulto(c) {
  return isAmiCulto(c) || isBridgeCulto(c);
}






async function fetchAll(table, columns, applyFilter) {
  const out = []; let from = 0; const page = 1000;
  while (true) {
    let q = supabase.from(table).select(columns).range(from, from + page - 1);
    if (applyFilter) q = applyFilter(q);
    const { data, error } = await q;
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < page) break;
    from += page;
  }
  return out;
}



async function cohortNoPrazoPct({ inicio, fim, area, marco }) {
  const DIA = 86400000;
  const dig = (v) => String(v || '').replace(/\D/g, '');

  let cq = supabase.from('cui_convertidos')
    .select('id, nome, cpf, membro_id, data_culto')
    .is('deleted_at', null).gte('data_culto', inicio).lt('data_culto', fim);
  if (area) cq = cq.eq('area', area);
  const { data: convs } = await cq;
  if (!convs || !convs.length) return null;

  const byMembro = new Map(), byCpf = new Map(), byNome = new Map();
  const put = (m, k, d) => { if (!k || !d) return; const c = m.get(k); if (!c || d < c) m.set(k, d); };
  if (marco === 'batismo') {
    const rows = await fetchAll('batismo_inscricoes', 'membro_id, cpf, nome, data_batismo',
      q => q.eq('status', 'realizado').is('deleted_at', null).not('data_batismo', 'is', null));
    for (const b of rows) { put(byMembro, b.membro_id, b.data_batismo); put(byCpf, dig(b.cpf).length === 11 ? dig(b.cpf) : null, b.data_batismo); put(byNome, String(b.nome || '').trim().toLowerCase() || null, b.data_batismo); }
  } else {

    const rows = await fetchAll('vw_next_formado_pessoa', 'membro_id, cpf, nome, formado_em');
    for (const n of rows) {
      const d = n.formado_em ? String(n.formado_em).slice(0, 10) : null; if (!d) continue;
      put(byMembro, n.membro_id, d); put(byCpf, dig(n.cpf).length === 11 ? dig(n.cpf) : null, d); put(byNome, String(n.nome || '').trim().toLowerCase() || null, d);
    }
  }
  const dataEventoDe = (c) => {
    const cands = [c.membro_id ? byMembro.get(c.membro_id) : null, dig(c.cpf).length === 11 ? byCpf.get(dig(c.cpf)) : null, byNome.get(String(c.nome || '').trim().toLowerCase())].filter(Boolean);
    return cands.length ? cands.sort()[0] : null;
  };

  let noPrazo = 0;
  for (const c of convs) {
    const dEvento = dataEventoDe(c);
    if (!dEvento) continue;
    const dias = Math.floor((new Date(dEvento + 'T12:00:00').getTime() - new Date(c.data_culto + 'T12:00:00').getTime()) / DIA);
    if (dias >= 0 && dias <= 90) noPrazo++;
  }
  return { valor: Math.round((noPrazo / convs.length) * 100), observacao: `${noPrazo} de ${convs.length} em <=90 dias` };
}

const COLLECTORS = {

  'cultos.ami_freq': async ({ inicio, fim }) => {
    const { data } = await supabase.from('vw_culto_stats').select('nome, service_type_name, presencial_adulto').gte('data', inicio).lt('data', fim);
    const ami = (data || []).filter(isAmiCulto);
    const total = ami.reduce((s, c) => s + (c.presencial_adulto || 0), 0);
    return { valor: total, observacao: `${ami.length} culto(s) AMI` };
  },

  'cultos.ami_conv': async ({ inicio, fim }) => {
    const { data } = await supabase.from('vw_culto_stats').select('nome, service_type_name, decisoes_presenciais, decisoes_online').gte('data', inicio).lt('data', fim);
    const ami = (data || []).filter(isAmiCulto);
    const total = ami.reduce((s, c) => s + (c.decisoes_presenciais || 0) + (c.decisoes_online || 0), 0);
    return { valor: total, observacao: `${ami.length} culto(s) AMI` };
  },


  'cultos.bridge_freq': async ({ inicio, fim }) => {
    const { data } = await supabase.from('vw_culto_stats').select('nome, service_type_name, presencial_adulto').gte('data', inicio).lt('data', fim);
    const bridge = (data || []).filter(isBridgeCulto);
    const total = bridge.reduce((s, c) => s + (c.presencial_adulto || 0), 0);
    return { valor: total, observacao: `${bridge.length} culto(s) Bridge` };
  },

  'cultos.bridge_conv': async ({ inicio, fim }) => {
    const { data } = await supabase.from('vw_culto_stats').select('nome, service_type_name, decisoes_presenciais, decisoes_online').gte('data', inicio).lt('data', fim);
    const bridge = (data || []).filter(isBridgeCulto);
    const total = bridge.reduce((s, c) => s + (c.decisoes_presenciais || 0) + (c.decisoes_online || 0), 0);
    return { valor: total, observacao: `${bridge.length} culto(s) Bridge` };
  },


  'cultos.amibridge_freq': async ({ inicio, fim }) => {
    const { data } = await supabase.from('vw_culto_stats').select('nome, service_type_name, presencial_adulto').gte('data', inicio).lt('data', fim);
    const total = (data || []).filter(isAmiBridgeCulto).reduce((s, c) => s + (c.presencial_adulto || 0), 0);
    return { valor: total, observacao: `${(data || []).filter(isAmiBridgeCulto).length} culto(s) AMI/Bridge (DEPRECATED)` };
  },

  'cultos.amibridge_conv': async ({ inicio, fim }) => {
    const { data } = await supabase.from('vw_culto_stats').select('nome, service_type_name, decisoes_presenciais, decisoes_online').gte('data', inicio).lt('data', fim);
    const total = (data || []).filter(isAmiBridgeCulto).reduce((s, c) => s + (c.decisoes_presenciais || 0) + (c.decisoes_online || 0), 0);
    return { valor: total, observacao: 'DEPRECATED: usar cultos.ami_conv ou cultos.bridge_conv' };
  },

  'cultos.kids_freq': async ({ inicio, fim }) => {
    const { data } = await supabase.from('vw_culto_stats').select('presencial_kids').gte('data', inicio).lt('data', fim);
    const total = (data || []).reduce((s, c) => s + (c.presencial_kids || 0), 0);
    return { valor: total };
  },




  'cultos.kids_conv': async ({ inicio, fim }) => {
    const { data } = await supabase.from('cultos').select('decisoes_kids, data').gte('data', inicio).lt('data', fim);
    const total = (data || []).reduce((s, c) => s + (c.decisoes_kids || 0), 0);
    return { valor: total, observacao: `${total} decisão(ões) kids no período` };
  },


  'cultos.sede_freq': async ({ inicio, fim }) => {
    const { data } = await supabase.from('vw_culto_stats').select('nome, service_type_name, presencial_adulto').gte('data', inicio).lt('data', fim);
    const sede = (data || []).filter(isSedeCulto);
    const total = sede.reduce((s, c) => s + (c.presencial_adulto || 0), 0);
    return { valor: total, observacao: `${sede.length} culto(s) Sede` };
  },

  'cultos.sede_conv': async ({ inicio, fim }) => {
    const { data } = await supabase.from('vw_culto_stats').select('nome, service_type_name, decisoes_presenciais, decisoes_online').gte('data', inicio).lt('data', fim);
    const sede = (data || []).filter(isSedeCulto);
    const total = sede.reduce((s, c) => s + (c.decisoes_presenciais || 0) + (c.decisoes_online || 0), 0);
    return { valor: total, observacao: `${sede.length} culto(s) Sede` };
  },


  'cultos.online_freq': async ({ inicio, fim }) => {
    const { data } = await supabase.from('cultos').select('online_pico').gte('data', inicio).lt('data', fim).not('online_pico', 'is', null);
    const cultos = (data || []).filter(c => (c.online_pico || 0) > 0);
    const total = cultos.reduce((s, c) => s + (c.online_pico || 0), 0);
    return { valor: total, observacao: `${cultos.length} culto(s) com transmissão` };
  },













  'cultos.online_ds_cresc': async ({ inicio, fim }) => {




    const hoje = new Date().toISOString().slice(0, 10);
    if (!semanaFechada(fim, hoje)) return null;

    const menos7 = (d) => {
      const x = new Date(d + 'T12:00:00Z');
      x.setUTCDate(x.getUTCDate() - 7);
      return x.toISOString().slice(0, 10);
    };
    const [atual, anterior] = await Promise.all([
      supabase.from('cultos').select('online_ds').gte('data', inicio).lt('data', fim),
      supabase.from('cultos').select('online_ds').gte('data', menos7(inicio)).lt('data', inicio),
    ]);
    const r = resultadoSemana(atual.data || [], anterior.data || []);


    if (r.valor === null) return null;
    return { valor: r.valor, observacao: r.observacao };
  },

  'cultos.online_conv': async ({ inicio, fim }) => {
    const { data } = await supabase.from('cultos').select('decisoes_online').gte('data', inicio).lt('data', fim).not('decisoes_online', 'is', null);
    const total = (data || []).reduce((s, c) => s + (c.decisoes_online || 0), 0);
    return { valor: total };
  },




  'cultos.conv_visit': async ({ inicio, fim }) => {
    const { data } = await supabase.from('vw_culto_stats').select('decisoes_presenciais, decisoes_online').gte('data', inicio).lt('data', fim);
    const conv = (data || []).reduce((s, c) => s + (c.decisoes_presenciais || 0) + (c.decisoes_online || 0), 0);
    return { valor: conv, observacao: `${conv} conversoes` };
  },









  'cultos.online_pico_avg': async ({ inicio, fim }) => {
    const { data } = await supabase
      .from('cultos')
      .select('online_pico')
      .gte('data', inicio).lt('data', fim)
      .not('online_pico', 'is', null);
    const vals = (data || []).map(c => c.online_pico).filter(v => v > 0);
    if (vals.length === 0) return { valor: 0, observacao: 'Nenhum culto com pico online no período' };
    const media = Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
    return { valor: media, observacao: `Media de ${vals.length} culto(s)` };
  },

  'cultos.online_ds_total': async ({ inicio, fim }) => {
    const { data } = await supabase
      .from('cultos')
      .select('online_ds')
      .gte('data', inicio).lt('data', fim)
      .not('online_ds', 'is', null);
    const total = (data || []).reduce((s, c) => s + (c.online_ds || 0), 0);
    return { valor: total, observacao: `${(data || []).length} culto(s) com vídeo` };
  },

  'cultos.online_ddus_total': async ({ inicio, fim }) => {
    const { data } = await supabase
      .from('cultos')
      .select('online_ddus')
      .gte('data', inicio).lt('data', fim)
      .not('online_ddus', 'is', null);
    const total = (data || []).reduce((s, c) => s + (c.online_ddus || 0), 0);
    return { valor: total, observacao: `${(data || []).length} culto(s) com vídeo` };
  },


  'cuidados.convertidos_pos_culto': async ({ inicio, fim }) => {
    const { count: total } = await supabase.from('cui_convertidos').select('id', { count: 'exact', head: true }).gte('data_culto', inicio).lt('data_culto', fim);
    const { count: atendidos } = await supabase.from('cui_convertidos').select('id', { count: 'exact', head: true }).eq('atendido_apos_culto', true).gte('data_culto', inicio).lt('data_culto', fim);
    if (!total) return { valor: 0, observacao: 'Nenhum convertido no período' };
    const pct = Math.round((atendidos / total) * 100);
    return { valor: pct, observacao: `${atendidos} de ${total} atendidos` };
  },



  'cuidados.reuniao_aceita_pct': async ({ inicio, fim, area }) => {
    let q = supabase.from('cui_convertidos').select('id, encontro_marcado')
      .is('deleted_at', null).gte('data_culto', inicio).lt('data_culto', fim);
    if (area) q = q.eq('area', area);
    const { data } = await q;
    if (!data || !data.length) return null;
    const aceitos = data.filter(c => c.encontro_marcado).length;
    return { valor: Math.round((aceitos / data.length) * 100), observacao: `${aceitos} de ${data.length} aceitaram a reunião` };
  },

  'cuidados.batismo_90d_pct': async ({ inicio, fim, area }) => cohortNoPrazoPct({ inicio, fim, area, marco: 'batismo' }),

  'cuidados.next_90d_pct': async ({ inicio, fim, area }) => cohortNoPrazoPct({ inicio, fim, area, marco: 'next' }),

  'cuidados.jornada180': async ({ inicio, fim }) => {
    const { count } = await supabase.from('cui_jornada180').select('id', { count: 'exact', head: true }).gte('data_encontro', inicio).lt('data_encontro', fim);
    return { valor: count || 0 };
  },

  'cuidados.atendimentos_pastorais': async ({ inicio }) => {


    const mesIni = inicio.slice(0, 7) + '-01';
    const dt = new Date(mesIni + 'T12:00:00'); dt.setMonth(dt.getMonth() + 1);
    const mesFim = dt.toISOString().slice(0, 10);
    const tipos = ['capelania', 'aconselhamento'];
    let total = 0;
    const partes = [];
    for (const tipo of tipos) {
      const { count } = await supabase.from('cui_acompanhamentos')
        .select('id', { count: 'exact', head: true })
        .is('deleted_at', null).eq('tipo', tipo)
        .gte('created_at', mesIni).lt('created_at', mesFim);
      total += count || 0;
      if (count) partes.push(`${tipo}: ${count}`);
    }
    return { valor: total, observacao: partes.join(' | ') || 'Sem atendimentos' };
  },

  'cuidados.engajados_valor': async () => {





    const d90 = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
    const convertidos = await fetchAll('cui_convertidos', 'membro_id',
      q => q.not('membro_id', 'is', null).order('id'));
    const membroIds = new Set(convertidos.map(c => c.membro_id).filter(Boolean));
    if (membroIds.size === 0) return { valor: 0, observacao: 'Sem convertidos com membro vinculado' };

    const [grupos, vols, contribs] = await Promise.all([
      fetchAll('mem_grupo_membros', 'membro_id', q => q.is('saiu_em', null).order('id')),
      fetchAll('mem_voluntarios', 'membro_id', q => q.is('ate', null).order('id')),
      fetchAll('mem_contribuicoes', 'membro_id', q => q.gte('data', d90).order('id')),
    ]);
    const engajados = new Set();
    for (const r of [...grupos, ...vols, ...contribs]) {
      if (r.membro_id && membroIds.has(r.membro_id)) engajados.add(r.membro_id);
    }
    const pct = Math.round((engajados.size / membroIds.size) * 100);
    return { valor: pct, observacao: `${engajados.size} de ${membroIds.size} convertidos com 1+ valor` };
  },

  'cuidados.membros_2mais_valores': async () => {




    const { computeJornada, agregar } = require('./jornadaEngajamento');
    const { membros, total_base } = await computeJornada('3m');
    if (!total_base) return { valor: 0, observacao: 'Sem membros ativos' };
    const { engajados } = agregar(membros);
    return { valor: engajados.pct, observacao: `${engajados.total} de ${total_base} membros engajados (conversão + 1)` };
  },




  'cuidados.devocional_membros': async ({ inicio, fim }) => {
    const data = await fetchAll('mem_devocionais', 'membro_id, concluida',



      q => q.eq('concluida', true)
        .is('deleted_at', null)
        .gte('data_devocional', inicio)
        .lt('data_devocional', fim)
        .order('id'));
    const distinct = new Set((data || []).map(d => d.membro_id));
    return {
      valor: distinct.size,
      observacao: `${distinct.size} membros fizeram pelo menos 1 devocional no período`,
    };
  },



  'cuidados.jornada180_inscricoes': async ({ inicio, fim }) => {
    const { data } = await supabase
      .from('cui_jornada180')
      .select('membro_id, nome')
      .eq('etapa', 1)
      .gte('data_encontro', inicio)
      .lt('data_encontro', fim);

    const distinct = new Set((data || []).map(d => d.membro_id || `nome:${d.nome}`));
    return {
      valor: distinct.size,
      observacao: `${distinct.size} pessoas iniciaram a Jornada 180 (etapa 1)`,
    };
  },


  'grupos.lideres_treinados': async () => {

    const { count } = await supabase
      .from('mem_grupo_membros')
      .select('id', { count: 'exact', head: true })
      .eq('funcao', 'lider_treinamento')
      .is('saiu_em', null);
    return {
      valor: count || 0,
      observacao: `${count || 0} membros marcados como líder em treinamento (Grupos)`,
    };
  },

  'grupos.lideres_acompanhados': async ({ inicio, fim }) => {


    const { data } = await supabase
      .from('grupo_supervisao_visitas')
      .select('grupo_id')
      .eq('status', 'realizada')
      .gte('data_visita', inicio)
      .lt('data_visita', fim);
    const distinct = new Set((data || []).map(v => v.grupo_id));
    return {
      valor: distinct.size,
      observacao: `${distinct.size} grupos visitados no período`,
    };
  },


  'grupos.total_grupos': async () => {
    const { count } = await supabase.from('mem_grupos').select('id', { count: 'exact', head: true }).eq('ativo', true);
    return { valor: count || 0 };
  },

  'grupos.participantes': async () => {
    const { count } = await supabase.from('mem_grupo_membros').select('id', { count: 'exact', head: true }).is('saiu_em', null);
    return { valor: count || 0, observacao: 'Membros ativos em grupos' };
  },


  'voluntariado.ativos': async ({ inicio }) => {
    try {
      const { data } = await supabase.rpc('kpi_servir_comunidade', { _since: inicio });
      const valor = (data && data[0]?.voluntarios_ativos) || 0;
      return { valor, observacao: 'Via kpi_servir_comunidade RPC' };
    } catch (e) {
      return null;
    }
  },

  'voluntariado.escalados': async ({ inicio, fim }) => {

    try {
      const { data } = await supabase.rpc('kpi_servir_comunidade', { _since: inicio });
      const ativos = (data && data[0]?.voluntarios_ativos) || 0;
      const escalados = (data && data[0]?.voluntarios_escalados) || 0;
      if (!ativos) return { valor: 0, observacao: 'Sem voluntários ativos' };
      const pct = Math.round((escalados / ativos) * 100);
      return { valor: pct, observacao: `${escalados} escalados de ${ativos} ativos` };
    } catch (e) {
      return null;
    }
  },

  'voluntariado.funil': async ({ inicio, fim }) => {

    const { count } = await supabase.from('mem_membros').select('id', { count: 'exact', head: true }).gte('created_at', inicio).lt('created_at', fim);
    return { valor: count || 0, observacao: 'Novos membros (aprox. funil)' };
  },




  'integracao.1x1_mensal': async ({ inicio, fim }) => {
    const { data: teams } = await supabase
      .from('vol_teams')
      .select('id')
      .ilike('name', '%integ%');
    const teamIds = (teams || []).map(t => t.id);
    if (teamIds.length === 0) return { valor: 0, observacao: 'Equipe Integração não encontrada' };


    const { data: members } = await supabase
      .from('vol_team_members')
      .select('volunteer_profile_id')
      .in('team_id', teamIds);
    const profileIds = [...new Set((members || []).map(m => m.volunteer_profile_id).filter(Boolean))];
    if (profileIds.length === 0) return { valor: 0, observacao: 'Sem voluntários na Integração' };


    const { data: meetings } = await supabase
      .from('vol_1x1_meetings')
      .select('volunteer_profile_id')
      .in('team_id', teamIds)
      .gte('meeting_date', inicio)
      .lt('meeting_date', fim);
    const comReuniaoSet = new Set((meetings || []).map(m => m.volunteer_profile_id));
    const comReuniao = profileIds.filter(id => comReuniaoSet.has(id)).length;

    const pct = Math.round((comReuniao / profileIds.length) * 100);
    return {
      valor: pct,
      observacao: `${comReuniao} de ${profileIds.length} voluntários da Integração com 1x1 no mês`,
    };
  },




  'integracao.treinamento': async ({ inicio, fim }) => {

    const { data: teams } = await supabase
      .from('vol_teams')
      .select('id, name')
      .ilike('name', '%integ%');

    const teamIds = (teams || []).map(t => t.id);
    if (teamIds.length === 0) {
      return { valor: 0, observacao: 'Equipe Integração não encontrada em vol_teams' };
    }


    const { count: ativos } = await supabase
      .from('vol_team_members')
      .select('id', { count: 'exact', head: true })
      .in('team_id', teamIds);

    if (!ativos) {
      return { valor: 0, observacao: 'Sem voluntários na equipe Integração' };
    }


    const { data: checkins } = await supabase
      .from('vol_training_checkins')
      .select('volunteer_name')
      .gte('created_at', inicio)
      .lt('created_at', fim)
      .ilike('team_name', '%integ%');

    const treinandoSet = new Set((checkins || []).map(c => c.volunteer_name?.toLowerCase().trim()).filter(Boolean));
    const treinando = treinandoSet.size;

    const pct = Math.round((treinando / ativos) * 100);
    return {
      valor: pct,
      observacao: `${treinando} em treinamento de ${ativos} voluntários ativos da Integração`,
    };
  },




  'next.batismos': async ({ inicio, fim }) => {

    const { data: inscritos } = await supabase
      .from('next_matriculas')
      .select('id, indicou_batismo')
      .eq('ja_batizado', false)
      .is('deleted_at', null)
      .gte('created_at', inicio)
      .lt('created_at', fim);
    const total = (inscritos || []).length;
    if (!total) return { valor: 0, observacao: 'Nenhum inscrito nao-batizado no período' };
    const indicaram = (inscritos || []).filter(i => i.indicou_batismo).length;
    const pct = Math.round((indicaram / total) * 100);
    return {
      valor: pct,
      observacao: `${indicaram} de ${total} inscritos nao-batizados indicaram batismo`,
    };
  },


  'next.voluntarios': async ({ inicio, fim }) => {
    const { data: inscritos } = await supabase
      .from('next_matriculas')
      .select('id, indicou_servir')
      .eq('ja_voluntario', false)
      .is('deleted_at', null)
      .gte('created_at', inicio)
      .lt('created_at', fim);
    const total = (inscritos || []).length;
    if (!total) return { valor: 0, observacao: 'Nenhum inscrito nao-voluntario no período' };
    const indicaram = (inscritos || []).filter(i => i.indicou_servir).length;
    const pct = Math.round((indicaram / total) * 100);
    return {
      valor: pct,
      observacao: `${indicaram} de ${total} inscritos nao-voluntarios indicaram servir`,
    };
  },


  'next.dizimo': async ({ inicio, fim }) => {
    const { data: inscritos } = await supabase
      .from('next_matriculas')
      .select('id, indicou_dizimo')
      .is('deleted_at', null)
      .gte('created_at', inicio)
      .lt('created_at', fim);
    const total = (inscritos || []).length;
    if (!total) return { valor: 0, observacao: 'Nenhum inscrito no período' };
    const indicaram = (inscritos || []).filter(i => i.indicou_dizimo).length;
    const pct = Math.round((indicaram / total) * 100);
    return {
      valor: pct,
      observacao: `${indicaram} de ${total} inscritos indicaram dizimo`,
    };
  },


















  'next.nps': async ({ inicio, fim }) => {
    const { data: pesquisas } = await supabase
      .from('nps_pesquisas')
      .select('id')
      .eq('contexto_kpi', 'nps_next')
      .is('deleted_at', null);
    const ids = (pesquisas || []).map(p => p.id);
    if (!ids.length) return null;
    const rows = await fetchAll('nps_respostas', 'score',
      q => q.in('pesquisa_id', ids).gte('created_at', inicio).lt('created_at', fim));
    if (!rows.length) return null;
    const total = rows.length;
    const promotores = rows.filter(r => Number(r.score) >= 9).length;
    const detratores = rows.filter(r => Number(r.score) <= 6).length;
    const nps = Math.round(((promotores - detratores) / total) * 1000) / 10;
    const media = rows.reduce((s, r) => s + Number(r.score || 0), 0) / total;
    const alerta = total < 5 ? ` · ATENCAO amostra pequena (n=${total})` : '';
    return {
      valor: nps,
      observacao: `${total} resposta(s) · NPS ${nps} · media ${media.toFixed(1)} (0-10) · ${promotores} promotor(es)/${detratores} detrator(es)${alerta}`,
    };
  },








  'next.frequencia': async ({ inicio, fim }) => {
    const { data, error } = await supabase.rpc('fn_next_frequencia_periodo', {
      p_inicio: inicio,
      p_fim: fim,
    });


    if (error) {
      console.warn('[kpi next.frequencia]', error.message);
      return null;
    }
    const pessoas = Number(data || 0);
    return {
      valor: pessoas,
      observacao: `${pessoas} pessoa(s) distinta(s) presente(s) em encontro do Next no periodo`,
    };
  },












  'next.engajados_valor': async ({ fim }) => {
    const formados = await fetchAll('vw_next_formado_pessoa', 'membro_id, formado_em',
      q => q.lt('formado_em', fim));
    const ids = [...new Set(formados.map(f => f.membro_id).filter(Boolean))];
    const semCadastro = formados.filter(f => !f.membro_id).length;
    if (!ids.length) return null;





    let engajados = 0;
    let medidos = 0;
    for (let i = 0; i < ids.length; i += 200) {
      const lote = ids.slice(i, i + 200);
      const { data, error } = await supabase
        .from('vw_pessoas_papeis_mat')
        .select('membresia_id, valor_seguir, valor_conectar, valor_investir, valor_servir, valor_generosidade')
        .in('membresia_id', lote);
      if (error) {
        console.warn('[kpi next.engajados_valor]', error.message);
        return null;
      }
      medidos += (data || []).length;
      engajados += (data || []).filter(p => p.valor_seguir || p.valor_conectar
        || p.valor_investir || p.valor_servir || p.valor_generosidade).length;
    }
    if (!medidos) return null;

    const pct = Math.round((engajados / medidos) * 1000) / 10;




    const foraBase = ids.length - medidos;
    const fora = [
      semCadastro ? `${semCadastro} sem cadastro ligado` : null,
      foraBase > 0 ? `${foraBase} fora da base viva` : null,
    ].filter(Boolean).join(' · ');
    return {
      valor: pct,
      observacao: `${engajados} de ${medidos} pessoas que fizeram o Next tem sinal em >=1 valor `
        + `(estado ATUAL; denominador acumulado ate ${fim})${fora ? ` · ${fora}` : ''}`,
    };
  },




  ...['kids', 'sede', 'bridge', 'ami', 'online'].reduce((acc, area) => {
    acc[`batismos.${area}`] = async ({ inicio, fim }) => {
      const { data } = await supabase
        .from('batismo_inscricoes')
        .select('id, data_batismo, created_at')
        .eq('status', 'realizado')
        .eq('area_kpi', area);
      const total = (data || []).filter(b => {
        const dt = b.data_batismo || (b.created_at || '').slice(0, 10);
        return dt >= inicio && dt < fim;
      }).length;
      return { valor: total, observacao: `${total} batismo(s) ${area} no período` };
    };
    return acc;
  }, {}),




  'voluntariado.ativos_semanal': async ({ inicio, fim }) => {
    const data = await fetchAll('vol_check_ins', 'volunteer_id',
      q => q.gte('checked_in_at', inicio).lt('checked_in_at', fim).order('checked_in_at'));
    const unique = new Set(data.map(d => d.volunteer_id).filter(Boolean)).size;
    return { valor: unique, observacao: `${unique} voluntários com check-in na semana` };
  },



  'voluntariado.ativos_trimestral': async ({ inicio, fim }) => {
    const data = await fetchAll('vol_check_ins', 'volunteer_id',
      q => q.gte('checked_in_at', inicio).lt('checked_in_at', fim).order('checked_in_at'));
    const unique = new Set(data.map(d => d.volunteer_id).filter(Boolean)).size;
    return { valor: unique, observacao: `${unique} voluntários com check-in no trimestre` };
  },


  'voluntariado.integrados': async ({ inicio, fim }) => {
    const { count } = await supabase.from('mem_voluntarios').select('id', { count: 'exact', head: true })
      .gte('desde', inicio).lt('desde', fim);
    return { valor: count || 0, observacao: `${count || 0} voluntários integrados no período` };
  },






  'voluntariado.desaparecidos': async () => {
    const d90 = new Date(Date.now() - 90 * 86400000).toISOString();
    const { data: ativos } = await supabase.from('mem_voluntarios').select('membro_id').is('ate', null);
    if (!ativos || ativos.length === 0) return { valor: 0 };
    const ids = [...new Set(ativos.map(a => a.membro_id).filter(Boolean))];


    const membroPorPerfil = new Map();
    for (let i = 0; i < ids.length; i += 100) {
      const { data: perfis } = await supabase.from('vol_profiles')
        .select('id, membresia_id').in('membresia_id', ids.slice(i, i + 100));
      for (const p of perfis || []) membroPorPerfil.set(p.id, p.membresia_id);
    }


    const comCheckin = new Set();
    for (let offset = 0; ; offset += 1000) {
      const { data: page } = await supabase.from('vol_check_ins')
        .select('volunteer_id').gte('checked_in_at', d90)
        .order('checked_in_at').range(offset, offset + 999);
      for (const r of page || []) {
        const membro = membroPorPerfil.get(r.volunteer_id);
        if (membro) comCheckin.add(membro);
      }
      if (!page || page.length < 1000) break;
    }

    const desaparecidos = ids.filter(id => !comCheckin.has(id)).length;
    return { valor: desaparecidos, observacao: `${desaparecidos} voluntários sem check-in 90+ dias` };
  },


  'voluntariado.interessados_integrados': async ({ inicio, fim }) => {
    const { data: indicacoes } = await supabase.from('next_indicacoes').select('id, status')
      .eq('tipo', 'servir').gte('created_at', inicio).lt('created_at', fim);
    const total = (indicacoes || []).length;
    if (!total) return { valor: 0, observacao: 'Sem indicacoes de servir no período' };
    const concluidos = (indicacoes || []).filter(i => i.status === 'concluido').length;
    const pct = Math.round((concluidos / total) * 100);
    return { valor: pct, observacao: `${concluidos} de ${total} indicacoes concluídas` };
  },




  'generosidade.recorrencia': async () => {
    const d90 = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);

    const recentes = await fetchAll('mem_contribuicoes', 'membro_id, data',
      q => q.gte('data', d90).order('id'));
    const doadores = {};
    recentes.forEach(c => {
      if (!c.membro_id || !c.data) return;
      if (!doadores[c.membro_id]) doadores[c.membro_id] = new Set();
      doadores[c.membro_id].add(c.data.slice(0, 7));
    });
    const totalDoadores = Object.keys(doadores).length;
    if (!totalDoadores) return { valor: 0, observacao: 'Sem doadores no período' };
    const recorrentes = Object.values(doadores).filter(meses => meses.size >= 3).length;
    const pct = Math.round((recorrentes / totalDoadores) * 100);
    return { valor: pct, observacao: `${recorrentes} de ${totalDoadores} doadores com 3+ meses` };
  },








  'generosidade.valor_total': async ({ inicio, fim }) => {

    const rows = await fetchAll('vw_doacoes_unificada', 'valor',
      q => q.eq('fonte', 'fin_transacoes').in('tipo', ['dizimo', 'oferta']).gte('data', inicio).lt('data', fim).order('id'));
    const total = rows.reduce((s, r) => s + Number(r.valor || 0), 0);
    if (!rows.length) return { valor: 0, observacao: 'Sem doações no período' };
    return { valor: Math.round(total), observacao: `R$ ${Math.round(total).toLocaleString('pt-BR')} em ${rows.length} doações` };
  },


  'generosidade.next_doadores': async ({ inicio, fim }) => {
    const { data: indicacoes } = await supabase.from('next_indicacoes').select('id, status')
      .eq('tipo', 'dizimo').gte('created_at', inicio).lt('created_at', fim);
    const total = (indicacoes || []).length;
    if (!total) return { valor: 0, observacao: 'Sem indicacoes de dizimo no período' };
    const concluidos = (indicacoes || []).filter(i => i.status === 'concluido').length;
    const pct = Math.round((concluidos / total) * 100);
    return { valor: pct, observacao: `${concluidos} de ${total} convertidos em doadores` };
  },










  'nps.culto_area': async ({ fim, area }) => {
    if (!area) return null;
    const { data: pesquisas } = await supabase.from('nps_pesquisas')
      .select('id').eq('area', String(area).toLowerCase())
      .eq('contexto_kpi', 'nps_geral').is('deleted_at', null);
    const ids = (pesquisas || []).map(p => p.id);
    if (!ids.length) return null;
    const rows = await fetchAll('nps_respostas', 'score',
      q => q.in('pesquisa_id', ids).lt('created_at', fim));
    if (!rows.length) return null;
    const media = rows.reduce((s, r) => s + Number(r.score || 0), 0) / rows.length;
    return { valor: Math.round(media * 10) / 10, observacao: `${rows.length} respostas · média ${media.toFixed(1)} (0-10)` };
  },




  'devocionais.familias': async ({ inicio, fim }) => {
    const data = await fetchAll('mem_devocionais', 'membro_id, mem_membros(familia_id)',



      q => q.eq('tipo', 'familiar')
        .is('deleted_at', null)
        .gte('data_devocional', inicio)
        .lt('data_devocional', fim)
        .order('id'));
    const familias = new Set();
    (data || []).forEach(d => {
      const fid = d.mem_membros?.familia_id;
      if (fid) familias.add(fid);
    });
    return { valor: familias.size, observacao: `${familias.size} famílias com devocionais no período` };
  },




  'devocionais.checkins': async ({ inicio, fim }) => {
    const { count } = await supabase.from('mem_devocionais')
      .select('id', { count: 'exact', head: true })


      .is('deleted_at', null)
      .gte('data_devocional', inicio)
      .lt('data_devocional', fim);
    return { valor: count || 0, observacao: `${count || 0} check-ins de devocional no período` };
  },


  'devocionais.pessoas': async ({ inicio, fim }) => {
    const pessoas = new Set();
    let offset = 0;
    const pageSize = 1000;
    while (true) {
      const { data } = await supabase.from('mem_devocionais')
        .select('membro_id')


        .is('deleted_at', null)
        .gte('data_devocional', inicio)
        .lt('data_devocional', fim)
        .order('id', { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (!data || data.length === 0) break;
      data.forEach(d => { if (d.membro_id) pessoas.add(d.membro_id); });
      if (data.length < pageSize) break;
      offset += pageSize;
    }
    return { valor: pessoas.size, observacao: `${pessoas.size} pessoas com devocional no período` };
  },



  'cba.batismos_conversoes': async ({ inicio, fim }) => {
    const { count: decisoes } = await supabase.from('int_visitantes')
      .select('id', { count: 'exact', head: true })
      .eq('fez_decisao', true)
      .gte('data_visita', inicio).lt('data_visita', fim);
    if (!decisoes) return { valor: 0, observacao: 'Sem decisões no período' };
    const { count: batismos } = await supabase.from('batismo_inscricoes')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'realizado')
      .gte('data_batismo', inicio).lt('data_batismo', fim);
    const pct = Math.round(((batismos || 0) / decisoes) * 100);
    return { valor: pct, observacao: `${batismos || 0} batismos / ${decisoes} decisoes` };
  },


  'cba.contato_5dias': async ({ inicio, fim }) => {
    const { data: visitantes } = await supabase.from('int_visitantes')
      .select('id, data_visita')
      .eq('fez_decisao', true)
      .gte('data_visita', inicio).lt('data_visita', fim);
    const total = (visitantes || []).length;
    if (!total) return { valor: 0, observacao: 'Sem visitantes com decisão no período' };
    const ids = visitantes.map(v => v.id);
    const { data: contatos } = await supabase.from('int_acompanhamentos')
      .select('visitante_id, data_contato')
      .in('visitante_id', ids)
      .order('data_contato', { ascending: true });
    const primeiroContato = {};
    (contatos || []).forEach(c => {
      if (!primeiroContato[c.visitante_id]) primeiroContato[c.visitante_id] = c.data_contato;
    });
    let dentro5 = 0;
    visitantes.forEach(v => {
      const c = primeiroContato[v.id];
      if (!c) return;
      const dias = (new Date(c) - new Date(v.data_visita)) / 86400000;
      if (dias <= 5) dentro5++;
    });
    const pct = Math.round((dentro5 / total) * 100);
    return { valor: pct, observacao: `${dentro5} de ${total} visitantes contactados em <=5 dias` };
  },





  'marketing.prazo_no_alvo': async ({ inicio, fim }) => {


    const { data, error } = await supabase
      .from('marketing_kanban_cards')
      .select('id, entregue_em, data_fim, prazo_producao, prazo_confirmado, prazo_preliminar')
      .eq('estado', 'concluido')
      .is('deleted_at', null)
      .not('entregue_em', 'is', null)
      .gte('entregue_em', inicio).lt('entregue_em', fim);

    if (error) throw error;
    return MKT_KPIS.prazoNoAlvo(data || []);
  },

  'marketing.lead_time_medio': async ({ inicio, fim }) => {

    const { data, error } = await supabase
      .from('marketing_kanban_cards')
      .select('id, entregue_em, origem, event_id, campanha_id, solicitacao_id')
      .eq('estado', 'concluido')
      .is('deleted_at', null)
      .not('entregue_em', 'is', null)
      .gte('entregue_em', inicio).lt('entregue_em', fim);
    if (error) throw error;
    const pedidos = (data || []).filter(c => MKT_LINHA.frenteDoCard(c) === 'sis');
    const lerPorId = async (tabela, cols, ids) => {
      const unicos = [...new Set(ids.filter(Boolean))];
      const out = [];
      for (let i = 0; i < unicos.length; i += 200) {
        const r = await supabase.from(tabela).select(cols).in('id', unicos.slice(i, i + 200));
        if (r.error) throw r.error;
        out.push(...(r.data || []));
      }
      return out;
    };
    const camps = await lerPorId('marketing_campanhas', 'id, solicitacao_id, created_at', pedidos.map(c => c.campanha_id));
    const campPorId = Object.fromEntries(camps.map(c => [c.id, c]));
    const sols = await lerPorId('solicitacoes', 'id, created_at',
      pedidos.map(c => c.solicitacao_id || campPorId[c.campanha_id]?.solicitacao_id));
    const solPorId = Object.fromEntries(sols.map(s => [s.id, s]));
    return MKT_KPIS.leadDosPedidos(pedidos, (c) => {
      const camp = campPorId[c.campanha_id] || null;
      const sol = solPorId[c.solicitacao_id] || solPorId[camp?.solicitacao_id] || null;
      return sol?.created_at || camp?.created_at || null;
    });
  },

  'marketing.throughput': async ({ inicio, fim }) => {
    const { count, error } = await supabase
      .from('marketing_kanban_cards')
      .select('id', { count: 'exact', head: true })
      .eq('estado', 'concluido')
      .is('deleted_at', null)
      .not('entregue_em', 'is', null)
      .gte('entregue_em', inicio).lt('entregue_em', fim);

    if (error) throw error;
    return { valor: count || 0, observacao: `${count || 0} cards entregues na semana` };
  },

  'marketing.razao_demanda_capacidade': async ({ inicio, fim }) => {










    const hoje = MKT_LINHA.dataSP(new Date());
    if (!(inicio <= hoje && hoje < fim)) return null;
    const r = await lerCargaEquipe({ hoje });



    const quarta = new Date(Date.parse(`${inicio}T12:00:00Z`) + 2 * 86400000).toISOString().slice(0, 10);
    if (MKT_LINHA.semanaDe(quarta, r.semanas) !== r.semanaAtual) return null;

    const eq = MKT_CARGA.resumoDaEquipe(r.carga, { excluir: r.coordenacao });
    const h = (n) => `${String(n).replace('.', ',')}h`;
    const coord = eq.coordenacao_h > 0 ? ` · coordenação fora da conta (${h(eq.coordenacao_h)})` : '';
    if (eq.motivo === 'sem_equipe') {
      return { valor: null, observacao: 'Sem medição: ninguém ativo na equipe além da coordenação' };
    }
    if (eq.motivo === 'sem_capacidade') {
      return { valor: null, observacao: `Sem medição: a equipe está sem horas disponíveis na semana (folgas)${coord}` };
    }
    if (eq.motivo === 'sem_estimativa') {
      return {
        valor: null,
        observacao: `Sem medição: ${eq.sem_estimativa} subtarefa(s) abertas na semana e nenhuma com horas estimadas${coord}`,
      };
    }
    const semHoras = eq.sem_estimativa > 0 ? ` · ${eq.sem_estimativa} subtarefa(s) sem horas não entram` : '';
    return {
      valor: eq.pct,
      observacao: `Semana ${eq.semana}: ${h(eq.usado_h)} de ${h(eq.capacidade_h)} (${eq.pessoas} pessoas)${semHoras}${coord}`,
    };
  },
};













function inicioDoPeriodoAnterior(periodicidade, date) {
  const d = new Date(date);
  switch (periodicidade) {
    case 'semanal':    d.setUTCDate(d.getUTCDate() - 7); break;
    case 'trimestral': d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 3); break;
    case 'semestral':  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 6); break;
    case 'anual':      d.setUTCFullYear(d.getUTCFullYear() - 1); break;
    default:           d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1); break;
  }
  return d;
}














function periodosAlvo(periodicidade, dataRef, incluirAnterior) {
  const atual = periodoAtual(periodicidade, dataRef);
  if (!incluirAnterior) return [atual];
  const anterior = periodoAtual(periodicidade, inicioDoPeriodoAnterior(periodicidade, dataRef));
  return anterior === atual ? [atual] : [atual, anterior];
}

async function coletarTodos({ dryRun = false, fontes = null, areas = null, referenceDate = null, fecharAnterior = false } = {}) {
  let query = supabase
    .from('kpi_indicadores_taticos')
    .select('id, periodicidade, fonte_auto, indicador, area')
    .eq('ativo', true)
    .not('fonte_auto', 'is', null);


  if (Array.isArray(fontes) && fontes.length > 0) {
    const ors = fontes.map(f => `fonte_auto.ilike.${f}%`).join(',');
    query = query.or(ors);
  }

  if (Array.isArray(areas) && areas.length > 0) {
    query = query.in('area', areas);
  }

  const { data: indicadores, error } = await query;

  if (error) throw error;

  const dataRef = referenceDate ? new Date(referenceDate) : new Date();

  const resultados = [];
  for (const ind of (indicadores || [])) {
    const collector = COLLECTORS[ind.fonte_auto];
    if (!collector) {
      resultados.push({ id: ind.id, status: 'sem_coletor', fonte: ind.fonte_auto });
      continue;
    }




    for (const periodo of periodosAlvo(ind.periodicidade, dataRef, fecharAnterior)) {
    const range = periodoRange(periodo, ind.periodicidade);

    try {
      const result = await collector({ ...range, periodo, periodicidade: ind.periodicidade, area: ind.area });
      if (result == null) {
        resultados.push({ id: ind.id, status: 'sem_dado', periodo });
        continue;
      }
      const { valor, observacao } = result;

      if (dryRun) {
        resultados.push({ id: ind.id, status: 'dry_run', periodo, valor, observacao });
        continue;
      }



      const { data: existente } = await supabase
        .from('kpi_registros')
        .select('id, origem')
        .eq('indicador_id', ind.id)
        .eq('periodo_referencia', periodo)
        .maybeSingle();

      if (existente && existente.origem === 'manual') {
        resultados.push({ id: ind.id, status: 'pulou_manual', periodo, valor });
        continue;
      }

      const payload = {
        indicador_id: ind.id,
        periodo_referencia: periodo,
        valor_realizado: valor,
        observacoes: observacao || null,
        responsavel: 'sistema',
        origem: 'auto',
        data_preenchimento: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { error: upErr } = await supabase
        .from('kpi_registros')
        .upsert(payload, { onConflict: 'indicador_id,periodo_referencia' });

      if (upErr) {
        resultados.push({ id: ind.id, status: 'erro', erro: upErr.message });
        continue;
      }




      const { data: processosVinculados } = await supabase
        .from('processos')
        .select('id, responsavel_nome')
        .contains('indicador_ids', [ind.id])
        .neq('status', 'arquivado');

      const processosCount = (processosVinculados || []).length;

      for (const p of (processosVinculados || [])) {
        const procPayload = {
          processo_id: p.id,
          indicador_id: ind.id,
          valor: valor,
          periodo: periodo,
          periodo_referencia: periodo,
          data_preenchimento: new Date().toISOString().slice(0, 10),
          responsavel_nome: 'sistema',
          observacoes: observacao || null,
          origem: 'auto',
        };



        await supabase
          .from('processo_registros')
          .delete()
          .eq('processo_id', p.id)
          .eq('indicador_id', ind.id)
          .eq('periodo_referencia', periodo)
          .eq('origem', 'auto');

        await supabase.from('processo_registros').insert(procPayload);
      }

      resultados.push({
        id: ind.id,
        status: 'ok',
        periodo,
        valor,
        processos_alimentados: processosCount,
      });
    } catch (e) {
      resultados.push({ id: ind.id, status: 'erro', erro: e.message });
    }
    }
  }

  return resultados;
}

module.exports = { coletarTodos, COLLECTORS, periodoAtual, periodoRange, periodosAlvo, inicioDoPeriodoAnterior };
