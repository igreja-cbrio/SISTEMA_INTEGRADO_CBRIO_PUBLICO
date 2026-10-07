









const { supabase } = require('../utils/supabase');
const { notificar } = require('./notificar');

const CATEGORIA_TO_AREA_RESP = {
  compras: { area: 'logistica_compras', subcategoria: 'default' },
  reserva_espaco: { area: 'reserva_espaco', subcategoria: 'default' },
};
const CATEGORIA_MODULO = { compras: 'logistica', reserva_espaco: 'administrativo' };

const DIAS_SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

function rotuloRecorrencia(recorrencia, diaSemana) {
  const diaTxt = (diaSemana != null && DIAS_SEMANA[diaSemana]) ? ` toda ${DIAS_SEMANA[diaSemana]}` : '';
  const MAPA = {
    unica: 'única vez',
    diaria: 'diária',
    semanal: `semanal${diaTxt}`,
    mensal: 'mensal',
    trimestral: 'trimestral',
    semestral: 'semestral',
    personalizada: 'personalizada',
  };
  return MAPA[recorrencia] || recorrencia || 'recorrência não definida';
}






function valorTotalItens(itens) {
  return (Array.isArray(itens) ? itens : []).reduce((acc, it) => {
    const valor = Number(it?.valor_estimado) || 0;
    const qtd = Number(it?.quantidade) > 0 ? Number(it.quantidade) : 1;
    return acc + (it?.valor_tipo === 'por_unid' ? valor * qtd : valor);
  }, 0);
}




async function criarSolicitacaoRotina({ proposta, categoria, dados }) {
  if (!['compras', 'reserva_espaco'].includes(categoria)) {
    return { erro: `Categoria de rotina não suportada para geração automática: ${categoria}` };
  }
  const userId = proposta.lider_id;
  const mapa = CATEGORIA_TO_AREA_RESP[categoria];

  let rota = null;
  try {
    const { data: r, error } = await supabase.rpc('fn_solicitacoes_rotear_origem', {
      p_solicitante_id: userId, p_setor_hint: null, p_categoria: categoria,
    });
    if (error) throw error;
    rota = r;
  } catch (e) {
    console.error('[planejamento-anual] rotina: roteamento de origem falhou:', e.message);
  }







  const itensLista = Array.isArray(dados?.itens) ? dados.itens : [];
  const valorTotalCompra = valorTotalItens(itensLista);

  const planejado = Boolean(dados?.planejado);
  if (categoria === 'compras') {
    if (planejado && valorTotalCompra <= 1000) {
      rota = {
        diretor_id: null, aprovacao_status: 'dispensada', status: 'pendente',
        motivo: 'Compra planejada até R$ 1.000 · direto para cotação',
      };
    }
  } else {

    rota = {
      diretor_id: null, aprovacao_status: 'dispensada', status: 'pendente',
      motivo: 'Reserva de espaço vai direto para operações',
    };
  }

  const agoraIso = new Date().toISOString();
  const titulo = `${proposta.nome} (rotina)`;

  let insert = {
    titulo,
    categoria,
    urgencia: 'normal',
    eh_urgente: false,
    solicitante_id: userId,
    compartilhar_area: true,
    area_solicitante: proposta.area,
    area_cliente: proposta.area,
    area_responsavel: mapa.area,
    subcategoria: mapa.subcategoria,
    eh_planejado: planejado,
    ...(planejado && { planejado_por: userId }),
    ...(rota && {
      aprovacao_origem_diretor_id: rota.diretor_id || null,
      aprovacao_origem_status: rota.aprovacao_status,
      aprovacao_origem_motivo: rota.motivo || null,
      aprovacao_origem_em: rota.aprovacao_status === 'dispensada' ? agoraIso : null,
    }),
    aprovacao_gestao_status: 'dispensada',
    aprovacao_gestao_em: agoraIso,
    aprovacao_gestao_motivo: categoria === 'compras'
      ? 'Compras não passam pela Gestão · origem (quando aplicável) + cotação + financeiro'
      : 'Reserva de espaço não passa pela Gestão',
    ...((rota && ['pendente', 'triagem'].includes(rota.aprovacao_status))
      ? { status: 'aguardando_aprovacao_origem' }
      : (rota ? { status: rota.status } : {})),
  };

  if (categoria === 'compras') {
    const itensTexto = itensLista.map((it) => `${Number(it.quantidade) > 0 ? it.quantidade : 1}x ${it.descricao}`).join('\n');
    insert = {
      ...insert,
      descricao: `Compra recorrente da rotina "${proposta.nome}".`,
      justificativa: proposta.descricao || `Compra recorrente vinculada à proposta de rotina "${proposta.nome}" (Planejamento Anual).`,
      valor_estimado: valorTotalCompra || null,
      itens: itensTexto || null,
      favorecido_nome: dados?.fornecedor_sugerido || null,
      link_referencia: itensLista.find((it) => it.link_referencia)?.link_referencia || null,
    };
  } else {
    const rotuloRec = rotuloRecorrencia(proposta.recorrencia, proposta.dia_semana);
    insert = {
      ...insert,
      descricao: `Reserva recorrente (${rotuloRec}), enquanto a rotina "${proposta.nome}" estiver ativa.`,
      justificativa: `Reserva vinculada à proposta de rotina "${proposta.nome}" (Planejamento Anual).`,
      espaco_solicitado: dados?.espaco_solicitado || null,
      data_uso: dados?.data_uso || null,
      horario_inicio: proposta.hora_inicio || null,
      horario_fim: proposta.hora_fim || null,
      qtde_pessoas: dados?.qtde_pessoas || null,
    };
  }

  const { data, error } = await supabase.from('solicitacoes').insert(insert).select('*').single();
  if (error) {
    console.error('[planejamento-anual] rotina: erro ao criar solicitação:', error.message);
    return { erro: 'Não foi possível criar a solicitação automática' };
  }

  if (categoria === 'compras' && itensLista.length) {
    const rows = itensLista.map((it, i) => ({
      solicitacao_id: data.id,
      descricao: String(it.descricao || '').trim().slice(0, 500),
      quantidade: Number(it.quantidade) > 0 ? Number(it.quantidade) : 1,
      unidade: 'un',
      link_referencia: it.link_referencia ? String(it.link_referencia).slice(0, 1000) : null,
      valor_estimado: it.valor_estimado != null && it.valor_estimado !== '' ? Number(it.valor_estimado) : null,
      ordem: i,
    }));
    const { error: itErr } = await supabase.from('solicitacao_itens').insert(rows);
    if (itErr) console.error('[planejamento-anual] rotina: erro ao gravar itens:', itErr.message);
  }

  let responsaveisDaArea = [];
  if (mapa.area) {
    const { data: resps } = await supabase
      .from('area_solicitacoes_responsaveis').select('profile_id').eq('area', mapa.area);
    responsaveisDaArea = (resps || []).map((r) => r.profile_id);
    if (responsaveisDaArea.length === 1) {
      await supabase.from('solicitacoes').update({ responsavel_id: responsaveisDaArea[0] }).eq('id', data.id);
    }
  }

  notificar({
    modulo: CATEGORIA_MODULO[categoria] || 'administrativo',
    tipo: 'solicitacao',
    titulo: `Nova solicitação (rotina): ${titulo}`,
    mensagem: `Gerada automaticamente pela rotina "${proposta.nome}" do Planejamento Anual.`,
    link: '/solicitacoes',
    severidade: 'info',
    chaveDedup: `solicitacao_nova_${data.id}`,
    extraTargetIds: responsaveisDaArea,
  }).catch(() => {});

  return { solicitacao: data };
}

function hojeSaoPaulo() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

function parseDataISO(s) {
  if (!s) return null;
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
}

function mesesEntre(aISO, bISO) {
  const a = parseDataISO(aISO), b = parseDataISO(bISO);
  if (!a || !b) return Infinity;
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
}










function dentroDaVigencia(proposta, cicloAno, hojeISO) {
  const hoje = parseDataISO(hojeISO);
  if (!hoje) return false;
  const inicio = proposta.data_inicio ? parseDataISO(String(proposta.data_inicio).slice(0, 10)) : null;
  if (inicio && hoje < inicio) return false;
  const fimExplicito = proposta.multi_dia && proposta.data_fim
    ? parseDataISO(String(proposta.data_fim).slice(0, 10))
    : null;
  const fim = fimExplicito || (cicloAno ? new Date(Date.UTC(cicloAno, 11, 31)) : null);
  if (fim && hoje > fim) return false;
  return true;
}




function estaNoVencimento(recorrencia, diaSemana, ultimaGeracaoEm, hojeISO) {
  const ultimaData = ultimaGeracaoEm ? String(ultimaGeracaoEm).slice(0, 10) : null;
  if (ultimaData === hojeISO) return false;
  const hoje = parseDataISO(hojeISO);
  if (!hoje) return false;
  const refDia = ultimaData ? parseDataISO(ultimaData).getUTCDate() : 1;
  switch (recorrencia) {
    case 'unica':
      return !ultimaData;
    case 'diaria':
      return true;
    case 'semanal':
      return diaSemana != null && hoje.getUTCDay() === Number(diaSemana);
    case 'mensal':
      return hoje.getUTCDate() === refDia && (!ultimaData || mesesEntre(ultimaData, hojeISO) >= 1);
    case 'trimestral':
      return hoje.getUTCDate() === refDia && (!ultimaData || mesesEntre(ultimaData, hojeISO) >= 3);
    case 'semestral':
      return hoje.getUTCDate() === refDia && (!ultimaData || mesesEntre(ultimaData, hojeISO) >= 6);
    default:
      return false;
  }
}








async function gerarSolicitacoesRotinaCompras() {
  const hoje = hojeSaoPaulo();
  const { data: linhas, error } = await supabase
    .from('plan_propostas_rotina_solicitacao')
    .select('*, proposta:proposta_id(*, ciclo:ciclo_id(ano))')
    .eq('categoria', 'compras').eq('ativo', true);
  if (error) throw error;

  const candidatas = (linhas || []).filter((l) => {
    const p = l.proposta;
    return p && !p.deleted_at && p.natureza === 'rotina' && ['aprovada', 'aprovada_ressalvas'].includes(p.estado);
  });

  let gerados = 0;
  const erros = [];
  for (const cfg of candidatas) {
    const p = cfg.proposta;
    if (!dentroDaVigencia(p, p.ciclo?.ano, hoje)) continue;
    if (!estaNoVencimento(p.recorrencia, p.dia_semana, cfg.ultima_geracao_em, hoje)) continue;
    try {
      const r = await criarSolicitacaoRotina({ proposta: p, categoria: 'compras', dados: cfg.dados || {} });
      if (r.solicitacao) {
        gerados += 1;
        const patch = { ultima_geracao_em: new Date().toISOString() };
        if (p.recorrencia === 'unica') patch.ativo = false;
        await supabase.from('plan_propostas_rotina_solicitacao').update(patch).eq('id', cfg.id);
      } else {
        erros.push({ proposta_id: p.id, erro: r.erro });
      }
    } catch (e) {
      erros.push({ proposta_id: p.id, erro: e.message });
    }
  }
  return { avaliadas: candidatas.length, gerados, erros };
}

module.exports = {
  criarSolicitacaoRotina, rotuloRecorrencia, gerarSolicitacoesRotinaCompras,
  valorTotalItens, estaNoVencimento, dentroDaVigencia,
};
