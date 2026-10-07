

















const { supabase } = require('../utils/supabase');

const TETO_PESSOAS = 200;


function hojeBrt(agora = new Date()) {
  return new Date(agora.getTime() - 3 * 3600 * 1000);
}
function mmddBrt(d) {
  return `${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}


async function paginado(montarQuery) {
  const out = [];
  for (let off = 0; ; off += 1000) {
    const { data, error } = await montarQuery(off, off + 999);
    if (error) throw error;
    if (!data?.length) break;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}










async function publicoAniversario() {
  const vols = new Set();
  (await paginado((a, b) => supabase.from('mem_voluntarios')
    .select('membro_id').is('deleted_at', null).is('ate', null)
    .not('membro_id', 'is', null).range(a, b))).forEach(v => vols.add(v.membro_id));

  const membros = await paginado((a, b) => supabase.from('mem_membros')
    .select('id, nome, telefone, data_nascimento, whatsapp_optin')
    .is('deleted_at', null).not('data_nascimento', 'is', null)
    .not('telefone', 'is', null).range(a, b));

  const doMinisterio = membros.filter(m => vols.has(m.id));
  const elegiveis = doMinisterio.filter(m => m.whatsapp_optin);

  const hoje = hojeBrt();
  const mmddHoje = mmddBrt(hoje);
  const pessoas = elegiveis
    .map(m => ({
      nome: m.nome, telefone: m.telefone,
      quando: String(m.data_nascimento).slice(5, 10),
      hoje: String(m.data_nascimento).slice(5, 10) === mmddHoje,
    }))
    .sort((x, y) => x.quando.localeCompare(y.quando));

  return {
    total: elegiveis.length,
    pessoas: pessoas.slice(0, TETO_PESSOAS),


    fora: [
      { motivo: 'sem consentimento (opt-in)', qtd: doMinisterio.length - elegiveis.length },
    ],
    universo: { rotulo: 'voluntários ativos com nascimento e telefone', qtd: doMinisterio.length },
  };
}







async function publicoBatismo() {
  const d = hojeBrt();
  d.setUTCDate(d.getUTCDate() + 1);
  const amanha = d.toISOString().slice(0, 10);

  const { data, error } = await supabase.from('batismo_inscricoes')
    .select('id, membro_id, data_batismo, horario_culto, status')
    .is('deleted_at', null).eq('data_batismo', amanha)
    .not('membro_id', 'is', null)
    .neq('status', 'realizado').neq('status', 'cancelado');
  if (error) throw error;

  const ids = [...new Set((data || []).map(b => b.membro_id))];
  const nomes = new Map();
  for (let i = 0; i < ids.length; i += 200) {
    const { data: ms } = await supabase.from('mem_membros')
      .select('id, nome, telefone').in('id', ids.slice(i, i + 200));
    (ms || []).forEach(m => nomes.set(m.id, m));
  }

  return {
    total: (data || []).length,
    pessoas: (data || []).slice(0, TETO_PESSOAS).map(b => ({
      nome: nomes.get(b.membro_id)?.nome || '(sem cadastro)',
      telefone: nomes.get(b.membro_id)?.telefone || null,
      quando: `batismo em ${amanha.split('-').reverse().join('/')}`,
      hoje: true,
    })),
    fora: [],
    universo: { rotulo: `inscritos pro batismo de ${amanha.split('-').reverse().join('/')}`, qtd: (data || []).length },
  };
}





async function publicoDevocional() {
  const rows = await paginado((a, b) => supabase.from('profiles')
    .select('membro_id, mem_membros!inner(id, nome, telefone, active, whatsapp_optin)')
    .eq('is_membro_only', true).not('membro_id', 'is', null)
    .eq('mem_membros.active', true).not('mem_membros.telefone', 'is', null)
    .range(a, b));

  const pessoas = rows.filter(p => p.mem_membros?.telefone).map(p => ({
    nome: p.mem_membros.nome, telefone: p.mem_membros.telefone,
    quando: 'todo dia', hoje: true, optin: !!p.mem_membros.whatsapp_optin,
  }));
  const semOptin = pessoas.filter(p => !p.optin).length;

  return {
    total: pessoas.length,
    pessoas: pessoas.slice(0, TETO_PESSOAS),

    fora: semOptin ? [{ motivo: `⚠️ ${semOptin} SEM opt-in — este envio não filtra consentimento`, qtd: semOptin }] : [],
    universo: { rotulo: 'membros com login no app e telefone', qtd: pessoas.length },
  };
}






async function publicoGruposFrequencia() {
  const grupos = await paginado((a, b) => supabase.from('mem_grupos')
    .select('id, nome, lider_id, ativo, deleted_at')
    .is('deleted_at', null).eq('ativo', true)
    .not('lider_id', 'is', null).range(a, b));

  const ids = [...new Set(grupos.map(g => g.lider_id))];
  const lideres = new Map();
  for (let i = 0; i < ids.length; i += 200) {
    const { data: ms } = await supabase.from('mem_membros')
      .select('id, nome, telefone').in('id', ids.slice(i, i + 200))
      .is('deleted_at', null);
    (ms || []).forEach(m => lideres.set(m.id, m));
  }


  const optOut = new Set();
  try {
    const { data: wl } = await supabase.from('whatsapp_lideres')
      .select('telefone, recebe_lembretes').eq('recebe_lembretes', false);
    (wl || []).forEach(l => optOut.add(String(l.telefone || '').replace(/\D/g, '').slice(-8)));
  } catch {                                                          }

  const comTelefone = grupos.filter(g => lideres.get(g.lider_id)?.telefone);
  const pessoas = comTelefone
    .filter(g => !optOut.has(String(lideres.get(g.lider_id).telefone).replace(/\D/g, '').slice(-8)))
    .map(g => ({
      nome: lideres.get(g.lider_id).nome,
      telefone: lideres.get(g.lider_id).telefone,
      quando: g.nome, hoje: false,
    }));

  return {
    total: pessoas.length,
    pessoas: pessoas.slice(0, TETO_PESSOAS),
    fora: [
      { motivo: 'líder sem telefone no cadastro', qtd: grupos.length - comTelefone.length },
      { motivo: 'pediu pra não receber lembretes', qtd: comTelefone.length - pessoas.length },
    ],
    universo: { rotulo: 'grupos ativos com líder definido', qtd: grupos.length },
  };
}







async function gruposAutoLigado() {
  try {
    const { data } = await supabase.from('whatsapp_config')
      .select('grupos_auto_envios').limit(1).maybeSingle();
    return !!data?.grupos_auto_envios;
  } catch { return null; }
}


async function temporadaEmCurso() {
  try {
    const hoje = hojeBrt().toISOString().slice(0, 10);
    const { data } = await supabase.from('mem_temporadas')
      .select('id, label').eq('ativa', true)
      .lte('data_inicio', hoje).gte('data_fim', hoje).limit(1).maybeSingle();
    return data || null;
  } catch { return null; }
}

async function bloqueiosGruposFrequencia() {
  const bloqueios = [];
  const [ligado, temporada] = await Promise.all([gruposAutoLigado(), temporadaEmCurso()]);
  if (ligado === false) {
    bloqueios.push('Os envios automáticos de grupos estão DESLIGADOS (chave central na aba Envios do módulo Grupos). Nada sai enquanto isso.');
  }
  if (!temporada) {
    bloqueios.push('Não há temporada ativa em curso — esta mensagem só sai com temporada rodando.');
  }
  return bloqueios;
}




























async function publicoEscalaVespera() {
  const { agruparParaAviso } = require('../utils/avisoEscala');
  const { perfisPorId } = require('./agenteVoluntariado');

  const agora = new Date().toISOString();
  const DIAS = 4;
  const fim = new Date(Date.now() + DIAS * 86400000).toISOString();

  const { data: cultos, error: cErr } = await supabase.from('vol_services')
    .select('id, name, scheduled_at')
    .gte('scheduled_at', agora).lte('scheduled_at', fim).order('scheduled_at');
  if (cErr) throw cErr;
  if (!cultos?.length) {
    return { total: 0, pessoas: [], fora: [], universo: { rotulo: 'nenhum culto nos próximos 4 dias', qtd: 0 } };
  }
  const porCulto = Object.fromEntries(cultos.map(c => [c.id, c]));

  const escalasBrutas = [];
  const ids = cultos.map(c => c.id);
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase.from('vol_schedules')




      .select('id, service_id, team_id, volunteer_id, planning_center_person_id, volunteer_name, team_name, confirmation_status')
      .in('service_id', ids.slice(i, i + 200));
    if (error) throw error;
    escalasBrutas.push(...(data || []));
  }
  if (!escalasBrutas.length) {
    return { total: 0, pessoas: [], fora: [], universo: { rotulo: 'ninguém escalado nos próximos 4 dias', qtd: 0 } };
  }



  let areaPorEquipe = {};
  try {
    const teamIds = [...new Set(escalasBrutas.map(e => e.team_id).filter(Boolean))];
    for (let i = 0; i < teamIds.length; i += 200) {
      const { data } = await supabase.from('vol_teams').select('id, area').in('id', teamIds.slice(i, i + 200));
      (data || []).forEach(t => { areaPorEquipe[t.id] = t.area; });
    }
  } catch {                        }

  const grupos = agruparParaAviso({
    escalas: escalasBrutas.map(e => ({
      ...e,
      team_area: areaPorEquipe[e.team_id] || null,
      scheduled_at: porCulto[e.service_id]?.scheduled_at,
      service_name: porCulto[e.service_id]?.name,
    })),
    agora, dias: DIAS, diasAlvo: null, porAntecedencia: true,
  });

  const perfis = await perfisPorId(grupos.map(g => g.volunteer_id).filter(Boolean));
  const comTelefone = [];
  let semTelefone = 0;
  for (const g of grupos) {
    const tel = g.volunteer_id ? perfis[g.volunteer_id]?.phone : null;
    if (tel) comTelefone.push({ g, tel });
    else semTelefone++;
  }

  return {
    total: comTelefone.length,



    pessoas: comTelefone.slice(0, TETO_PESSOAS).map(({ g, tel }) => ({
      nome: g.nome || '(sem nome na escala)',
      telefone: tel,
      quando: [g.params?.[1], g.params?.[2]].filter(Boolean).join(' · ') || null,
      hoje: false,
    })),
    fora: [{ rotulo: 'escalados sem telefone alcançável (recebem só pelo app)', qtd: semTelefone }],
    universo: { rotulo: 'escalados na antecedência de aviso (Kids em 3 dias, o resto na véspera)', qtd: grupos.length },
  };
}












async function publicoCampanhaSemanal() {
  const { data: campanhas } = await supabase.from('camp_campanhas')
    .select('id, nome').eq('status', 'ativa').is('deleted_at', null);
  if (!campanhas?.length) {
    return {
      total: 0, pessoas: [], fora: [],
      universo: { rotulo: 'nenhuma campanha ativa — o disparo semanal não sai', qtd: 0 },
    };
  }
  const { previa } = require('./campanhaDisparo');

  const { data: modelo } = await supabase.from('camp_disparos')
    .select('segmento').eq('campanha_id', campanhas[0].id)
    .eq('recorrencia', 'semanal_segunda').is('deleted_at', null)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();

  const pub = await previa({
    campanha_id: campanhas[0].id,
    canal: 'email',
    segmento: modelo?.segmento || 'todos',
  });

  return {
    total: pub.total_alvo,
    pessoas: pub.alvo.slice(0, TETO_PESSOAS).map(a => ({
      nome: a.nome || '(sem nome)', email: a.destino, hoje: false,
    })),
    fora: Object.entries(pub.motivos || {}).map(([rotulo, qtd]) => ({ rotulo, qtd })),
    universo: { rotulo: `base do segmento "${modelo?.segmento || 'todos'}"`, qtd: pub.total_base },
  };
}













async function publicoConvertidoBoasVindas() {
  const desde = new Date(Date.now() - 30 * 86400000).toISOString();
  const { count } = await supabase.from('cultos_decisoes_pessoas')
    .select('id', { count: 'exact', head: true })
    .eq('observacoes', 'Registrado no totem · fluxo novo convertido')
    .is('deleted_at', null)
    .gte('created_at', desde);
  return {
    total: count || 0,
    pessoas: [],
    universo: { rotulo: 'decisões registradas pelo totem nos últimos 30 dias', qtd: count || 0 },
  };
}






async function publicoVisitantePesquisa() {
  const { publicoPesquisaVisitante } = require('./visitantePesquisa');
  return publicoPesquisaVisitante();
}

async function publicoCampanhaAgradecimento() {
  const { data: campanhas } = await supabase.from('camp_campanhas')
    .select('id, nome, digito, data_inicio, data_fim')
    .eq('status', 'ativa').is('deleted_at', null);
  if (!campanhas?.length) {
    return {
      total: 0, pessoas: [], fora: [],
      universo: { rotulo: 'nenhuma campanha ativa', qtd: 0 },
    };
  }

  let pendentes = 0;
  let jaFeitos = 0;
  for (const c of campanhas) {
    if (!c.digito) continue;
    let q = supabase.from('fin_transacoes')
      .select('id', { count: 'exact', head: true })
      .eq('tipo', 'receita').eq('identificador_centavo', c.digito)
      .not('membro_id', 'is', null);
    if (c.data_inicio) q = q.gte('data_competencia', c.data_inicio);
    if (c.data_fim) q = q.lte('data_competencia', c.data_fim);
    const { count: doacoes } = await q;

    const { count: feitos } = await supabase.from('camp_agradecimentos')
      .select('id', { count: 'exact', head: true })
      .eq('campanha_id', c.id).in('status', ['enviado', 'pulado']);

    pendentes += Math.max(0, (doacoes || 0) - (feitos || 0));
    jaFeitos += feitos || 0;
  }

  return {
    total: pendentes,
    pessoas: [],
    fora: [{ rotulo: 'doações já agradecidas ou puladas (anônimas, sem contato)', qtd: jaFeitos }],
    universo: { rotulo: 'doações com cadastro vinculado nas campanhas ativas', qtd: pendentes + jaFeitos },
  };
}







async function publicoBotVarredura() {
  const { lerConfigBotIa } = require('../utils/botIaRegras');
  const { data, error } = await supabase.from('whatsapp_config').select('bot_ia').eq('id', 1).maybeSingle();
  if (error) throw error;
  const emails = lerConfigBotIa(data?.bot_ia).varredura_emails;
  return {
    total: emails.length,
    pessoas: emails.map((e) => ({ nome: e, telefone: null, quando: 'dia 1 de cada mês' })),
    universo: { rotulo: 'e-mails configurados em Comunicação → Bot → IA por área', qtd: emails.length },
  };
}


async function bloqueiosBotVarredura() {
  const out = [];
  try {
    if (!process.env.ANTHROPIC_API_KEY) out.push('ANTHROPIC_API_KEY não está configurada — a IA não roda.');
    const { data: cfg } = await supabase.from('whatsapp_config').select('bot_ia').eq('id', 1).maybeSingle();
    const { lerConfigBotIa } = require('../utils/botIaRegras');
    if (!lerConfigBotIa(cfg?.bot_ia).varredura_emails.length) out.push('Nenhum e-mail configurado para receber a varredura.');
    const { isConfigured } = require('./email');
    if (!isConfigured()) out.push('Nenhum canal de e-mail configurado no servidor — o resumo fica só no sistema.');
    const { data: ultima, error } = await supabase.from('wa_bot_varreduras')
      .select('periodo, status, erro').order('periodo', { ascending: false }).limit(1).maybeSingle();
    if (error && (error.code === '42P01' || error.code === 'PGRST205')) out.push('A migration 20260926130000 ainda não foi aplicada.');
    else if (ultima?.status === 'erro' && ultima.erro === 'anthropic_sem_credito') {
      out.push(`A conta da Anthropic está sem crédito — a varredura de ${ultima.periodo} não rodou.`);
    }
  } catch {                                                  }
  return out;
}

const CATALOGO = [
  {
    id: 'aniversario_voluntario',
    nome: 'Parabéns de aniversário',
    quando: 'Todo dia às 9h · envia a quem faz aniversário naquele dia',
    regra: 'Voluntário com vínculo aberto, que tenha data de nascimento, telefone e CONSENTIMENTO (opt-in). O template é Marketing, então a Meta exige o opt-in.',
    fonte: 'GET /api/whatsapp-cron/aniversarios',
    contexto: 'app.aniversario',
    envTemplate: 'WHATSAPP_TEMPLATE_ANIVERSARIO2',
    publico: publicoAniversario,
  },
  {
    id: 'batismo_lembrete',
    nome: 'Lembrete de batismo',
    quando: 'Todo dia às 18h · envia a quem se batiza no dia seguinte',
    regra: 'Inscrito no batismo de amanhã, com cadastro vinculado, que não esteja realizado nem cancelado.',
    fonte: 'GET /api/whatsapp-cron/batismos-lembrete',
    contexto: 'app.batismo_lembrete',
    envTemplate: 'WHATSAPP_TEMPLATE_BATISMO',
    publico: publicoBatismo,
  },
  {
    id: 'grupos_frequencia',
    nome: 'Chamada do mês (grupos)',
    quando: 'Dia 28 de cada mês · só com temporada em curso',
    regra: 'Líder do grupo (um por grupo — co-líder não recebe), com telefone, que não tenha pedido pra parar de receber lembretes.',
    fonte: 'GET /api/public/grupos/cron/frequencia-mensal',
    contexto: 'grupos.frequencia_mes',
    envTemplate: null,
    bloqueios: bloqueiosGruposFrequencia,
    publico: publicoGruposFrequencia,
  },





  {
    id: 'devocional_diario',
    nome: 'Devocional do dia',
    quando: 'Todo dia às 9h',
    regra: 'Todo membro ativo com login no app e telefone. ⚠️ Este envio NÃO checa consentimento.',
    fonte: 'GET /api/devocional-planos/cron/enviar-diario',
    contexto: null,
    envTemplate: 'WHATSAPP_TEMPLATE_DEVOCIONAL',




    envComDefaultLiteral: 'devocional_diario',
    tabelaPropria: 'devocional_envios',
    bloqueios: async () => {
      const temEnv = !!String(process.env.WHATSAPP_TEMPLATE_DEVOCIONAL || '').trim();
      if (temEnv) return [];
      return ['O nome do template não está configurado (env WHATSAPP_TEMPLATE_DEVOCIONAL) e o código cai num nome fixo, "devocional_diario", que não existe na conta da Meta. Resultado: ele TENTA todo dia e a Meta recusa todas.'];
    },
    publico: publicoDevocional,
  },
  {
    id: 'escala_vespera',
    nome: 'Você está escalado(a) (véspera)',
    quando: 'Todo dia às 8h10 BRT · Kids com 3 dias de antecedência, o resto na véspera',
    regra: 'Quem está escalado na antecedência da sua área, ainda não avisado por nenhum dos dois canais, e com telefone alcançável pela cadeia canônica (perfil → cadastro → CPF → formulário → contato secundário). Teto de 200 por rodada; quem não couber sai amanhã.',
    fonte: 'GET /api/agente-voluntariado/cron/checar → services/escalaAviso.js',
    contexto: 'voluntariado.escala_aviso',
    envTemplate: 'WHATSAPP_TEMPLATE_ESCALA',



    publico: publicoEscalaVespera,
  },
  {
    id: 'convertido_boas_vindas',
    nome: 'Boas-vindas ao novo convertido (totem)',
    quando: 'Reativo · na hora em que a pessoa registra a decisão no fluxo "Novo convertido" do totem',
    regra: 'Quem registra a própria decisão no totem E marcou o opt-in de WhatsApp na tela 1 '
      + '(o template pode ser da categoria Marketing pela régua da Meta — "boas-vindas" é '
      + 'Marketing pra eles, e Marketing exige opt-in; a prova fica em inscricao_consentimentos). '
      + '1 mensagem por pessoa (só no primeiro registro do dia; a retentativa do quiosque não '
      + 'duplica). A mensagem cita quem vai contatar (o responsável escolhido na tela da equipe).',
    fonte: 'POST /api/membresia/totem/novo-convertido → routes/membresia.js',
    contexto: 'cuidados.convertido_boas_vindas',





    envTemplate: null,



    publico: publicoConvertidoBoasVindas,
  },
  {
    id: 'campanha_semanal',
    nome: 'Pocket semanal da campanha (e-mail)',
    quando: 'Toda segunda-feira · o resumo do domingo, com o link do vídeo e o CTA de contribuição',
    regra: 'Base VIVA do segmento configurado no disparo, com e-mail válido e sem opt-out. '
      + 'Uma pessoa por DESTINO: a casa com 4 cadastros no mesmo e-mail recebe 1 cópia. '
      + 'Só sai com campanha ATIVA.',
    fonte: 'GET /api/comunicacao/cron/agendamentos → services/campanhaDisparo.js',
    contexto: null,
    envTemplate: null,
    tabelaPropria: 'camp_disparo_envios',
    publico: publicoCampanhaSemanal,
  },
  {
    id: 'campanha_agradecimento',
    nome: 'Obrigado ao doador da campanha',
    quando: 'De hora em hora · reativo, quando uma doação é confirmada',
    regra: 'Quem doou para uma campanha ativa, TEM cadastro vinculado e tem e-mail (ou opt-in de '
      + 'WhatsApp, na falta de e-mail). ⚠️ A mensagem é GENÉRICA: não cita nome nem valor, porque '
      + 'telefone e e-mail nesta base estão cadastrados em nome de familiares e filhos. '
      + 'Doação anônima não é agradecida (não há para onde mandar). '
      + 'Janela de silêncio de 72h por pessoa: quem doa 3× na semana recebe 1 obrigado.',
    fonte: 'GET /api/comunicacao/cron/agendamentos → services/campanhaAgradece.js',
    contexto: 'campanha.agradecimento',







    envTemplate: null,
    bloqueios: async () => {
      const { data } = await supabase.from('camp_campanhas')
        .select('id').eq('status', 'ativa').is('deleted_at', null).limit(1);
      if (!data?.length) return ['Nenhuma campanha está ATIVA — nada é agradecido enquanto isso.'];
      return [];
    },
    tabelaPropria: 'camp_agradecimentos',
    publico: publicoCampanhaAgradecimento,
  },
  {
    id: 'visitante_pesquisa',
    nome: 'Pesquisa de satisfação do visitante (depois do culto)',
    quando: 'Horário · na rodada seguinte ao fim do culto (início + 2h30; sem culto, registro + 2h) · validade 72h',
    regra: 'Quem registrou a visita pelo QR dos cartazes (/visitante) E marcou o opt-in de WhatsApp. '
      + '1 mensagem por visita, com o botão "Avaliar minha visita" que abre o formulário no WhatsApp (estrelas 1 a 5 + comentário). '
      + 'Depois de 72h a pesquisa não sai mais (fora de hora).',
    fonte: 'GET /api/public/grupos/cron/whatsapp-fila → services/visitantePesquisa.js',
    contexto: 'cuidados.visitante_pesquisa',



    envTemplate: null,


    publico: publicoVisitantePesquisa,
  },
  {
    id: 'bot_varredura_mensal',
    nome: 'Varredura mensal do WhatsApp (e-mail)',
    quando: 'Dia 1 de cada mês, a partir das 6h BRT, de carona no cron horário da Comunicação',
    regra: 'Lê as mensagens RECEBIDAS no WhatsApp no mês anterior, tira as pastorais (conversas de Cuidados e '
      + 'palavras de oração, luto, saúde, separação, vício) e o que identifica a pessoa, agrupa por tema com IA e '
      + 'aponta o que o bot não saberia responder. O e-mail leva só temas, contagens e lacunas — NUNCA o texto de '
      + 'ninguém. Vai para os e-mails configurados em Comunicação → Bot → IA por área. Desligar aqui para o cron; '
      + 'o botão "Rodar agora" da tela do bot continua funcionando (é decisão de quem clica).',
    fonte: 'GET /api/comunicacao/cron/agendamentos → services/botIaVarredura.js',
    contexto: null,
    envTemplate: null,
    tabelaPropria: 'wa_bot_varreduras',
    bloqueios: bloqueiosBotVarredura,
    publico: publicoBotVarredura,
  },
];








async function enviosDoItem(item, dias = 30) {
  const desde = new Date(Date.now() - dias * 86400000).toISOString();
  try {
    if (item.tabelaPropria === 'devocional_envios') {
      const { data } = await supabase.from('devocional_envios')
        .select('enviado, motivo, created_at').gte('created_at', desde);
      const rows = data || [];
      return {
        enviados: rows.filter(r => r.enviado).length,
        nao_entregues: rows.filter(r => !r.enviado).length,
        fora_do_historico: true,
        motivo_falha: rows.find(r => !r.enviado)?.motivo || null,
      };
    }
    if (item.tabelaPropria === 'wa_bot_varreduras') {


      const { data, error } = await supabase.from('wa_bot_varreduras')
        .select('status, email_enviado_em, email_erro, erro').gte('iniciado_em', desde);
      if (error) return { enviados: null, nao_entregues: null, fora_do_historico: true, erro: error.message };
      const rows = data || [];
      const falha = rows.find(r => r.status === 'erro' || r.email_erro);
      return {
        enviados: rows.filter(r => r.email_enviado_em).length,
        nao_entregues: rows.filter(r => !r.email_enviado_em && (r.status === 'erro' || r.email_erro)).length,
        fora_do_historico: true,
        motivo_falha: falha ? (falha.erro || falha.email_erro) : null,
      };
    }
    if (!item.contexto) return { enviados: 0, nao_entregues: 0 };
    const { data } = await supabase.from('whatsapp_envios')
      .select('status, failed_at').eq('contexto', item.contexto).gte('criado_em', desde);
    const rows = data || [];
    return {
      enviados: rows.filter(r => r.status === 'enviado').length,
      nao_entregues: rows.filter(r => r.failed_at).length,
    };
  } catch (e) {
    return { enviados: null, nao_entregues: null, erro: e.message };
  }
}







async function listar({ comPessoas = false, dias = 30 } = {}) {
  const itens = [];
  for (const item of CATALOGO) {
    const base = {
      id: item.id, nome: item.nome, quando: item.quando, regra: item.regra,
      fonte: item.fonte, contexto: item.contexto,
      template_configurado: item.envTemplate ? !!String(process.env[item.envTemplate] || '').trim() : null,
      env_template: item.envTemplate,
    };
    try {
      const [pub, env, bloqueios] = await Promise.all([
        item.publico(),
        enviosDoItem(item, dias),
        item.bloqueios ? item.bloqueios() : Promise.resolve([]),
      ]);



      if (item.envTemplate && !item.envComDefaultLiteral
          && !String(process.env[item.envTemplate] || '').trim()) {
        bloqueios.push(`O template não está configurado (env ${item.envTemplate}) — sem isso a mensagem não sai.`);
      }
      itens.push({
        ...base,
        bloqueios,
        total: pub.total,
        universo: pub.universo,
        fora: (pub.fora || []).filter(f => f.qtd > 0),
        pessoas: comPessoas ? pub.pessoas : undefined,
        pessoas_truncadas: comPessoas ? pub.total > (pub.pessoas?.length || 0) : undefined,
        ...env,
      });
    } catch (e) {



      itens.push({ ...base, erro: e.message, total: null });
    }
  }
  return { dias, itens };
}

const IDS_CATALOGO = CATALOGO.map((i) => i.id);

module.exports = { IDS_CATALOGO, listar, CATALOGO };
