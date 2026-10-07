







const { supabase } = require('../utils/supabase');
const {
  normalizarResponsaveis, normalizarArea, diffResponsaveis, destinatariosDoAviso,
  MAX_RESPONSAVEIS,
} = require('../utils/marcoAtribuicao');
let notificar; try { ({ notificar } = require('../services/notificar')); } catch { notificar = async () => {}; }















async function pessoasAtribuiveis() {
  const { data: equipe, error: e1 } = await supabase
    .from('vw_colaboradores')
    .select('id, name, email, area, cargo')
    .order('name');


  if (e1) throw e1;

  const naEquipe = new Set((equipe || []).map((p) => p.id));

  const { data: outros, error: e2 } = await supabase
    .from('profiles')
    .select('id, name, email, area')
    .eq('active', true)
    .order('name');
  if (e2) throw e2;

  const fora = (outros || []).filter((p) => !naEquipe.has(p.id)
    && p.is_membro_only !== true && p.is_servico !== true);

  return {
    equipe: (equipe || []).map((p) => ({
      id: p.id, nome: p.name, email: p.email, area: p.area, cargo: p.cargo, grupo: 'equipe',
    })),




    fora_da_equipe: fora.map((p) => ({
      id: p.id, nome: p.name, email: p.email, area: p.area, grupo: 'fora_da_equipe',
    })),
    max_responsaveis: MAX_RESPONSAVEIS,
  };
}


async function areasAtivas() {
  const { data, error } = await supabase.from('areas')
    .select('id, nome').eq('ativo', true).order('nome');
  if (error) throw error;
  return (data || []).map((a) => ({ id: a.id, nome: a.nome }));
}


async function anexarAtribuicao(marcos) {
  const lista = Array.isArray(marcos) ? marcos : [];
  if (!lista.length) return lista;

  const ids = lista.map((m) => m.id);
  const porMarco = new Map();


  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase.from('camp_marco_responsaveis')
      .select('marco_id, profile_id, profiles:profile_id(id, name, email, avatar_url)')
      .in('marco_id', ids.slice(i, i + 200));
    if (error) throw error;
    for (const r of data || []) {
      if (!porMarco.has(r.marco_id)) porMarco.set(r.marco_id, []);
      porMarco.get(r.marco_id).push({
        profile_id: r.profile_id,
        nome: r.profiles?.name || null,
        email: r.profiles?.email || null,
        avatar_url: r.profiles?.avatar_url || null,
      });
    }
  }

  const areaIds = [...new Set(lista.map((m) => m.area_id).filter(Boolean))];
  const nomeArea = new Map();
  if (areaIds.length) {
    const { data } = await supabase.from('areas').select('id, nome').in('id', areaIds);
    for (const a of data || []) nomeArea.set(a.id, a.nome);
  }

  return lista.map((m) => ({
    ...m,
    responsaveis: (porMarco.get(m.id) || []).sort((a, b) => String(a.nome).localeCompare(String(b.nome))),
    area_nome: m.area_id ? (nomeArea.get(m.area_id) || null) : null,
  }));
}








async function definirResponsaveis({ marcoId, bruto, autorId, contexto }) {
  const { ids, invalidos, truncados } = normalizarResponsaveis(bruto);

  const { data: atuaisRows, error: eLer } = await supabase
    .from('camp_marco_responsaveis').select('profile_id').eq('marco_id', marcoId);
  if (eLer) throw eLer;
  const atuais = (atuaisRows || []).map((r) => r.profile_id);

  const { adicionados, removidos } = diffResponsaveis(atuais, ids);



  if (removidos.length) {


    const paraRemover = atuais.filter((id) => removidos.includes(String(id).toLowerCase()));
    if (paraRemover.length) {
      const { error } = await supabase.from('camp_marco_responsaveis')
        .delete().eq('marco_id', marcoId).in('profile_id', paraRemover);
      if (error) throw error;
    }
  }
  if (adicionados.length) {
    const paraInserir = ids.filter((id) => adicionados.includes(String(id).toLowerCase()));
    const { error } = await supabase.from('camp_marco_responsaveis')
      .upsert(paraInserir.map((profile_id) => ({
        marco_id: marcoId, profile_id, created_by: autorId || null,
      })), { onConflict: 'marco_id,profile_id', ignoreDuplicates: true });

    if (error && error.code !== '23505') throw error;
  }

  let avisados = 0;
  if (adicionados.length && contexto) {
    avisados = await avisarAtribuidos({
      adicionados, autorId, contexto, areaId: null,
    });
  }

  return {
    adicionados: adicionados.length,
    removidos: removidos.length,
    avisados,
    invalidos,
    truncados,
    max_responsaveis: MAX_RESPONSAVEIS,
  };
}












async function avisarAtribuidos({ adicionados = [], autorId, contexto, areaId }) {
  let pessoasDaArea = [];
  if (!adicionados.length && areaId) {




    const { data, error } = await supabase.rpc('fn_camp_pessoas_da_area', { p_area_id: areaId });
    if (error) { console.error('[campanhaMarcos] pessoas da área:', error.message); return 0; }
    pessoasDaArea = data || [];
  }

  const { ids, via } = destinatariosDoAviso({ adicionados, pessoasDaArea, autorId });
  if (!ids.length) return 0;

  await notificar({
    modulo: 'campanhas',
    tipo: 'campanha_tarefa_atribuida',
    titulo: via === 'area'
      ? `Sua área recebeu uma tarefa: ${contexto.marcoTitulo}`
      : `Você recebeu uma tarefa: ${contexto.marcoTitulo}`,
    mensagem: [
      `Campanha: ${contexto.campanhaNome}.`,
      contexto.prazo ? `Prazo: ${String(contexto.prazo).split('-').reverse().join('/')}.` : null,
      via === 'area'
        ? 'A tarefa foi atribuída à área, sem nome específico — combinem quem puxa.'
        : null,
    ].filter(Boolean).join(' '),
    link: '/campanhas',
    targetIds: ids,
    chaveDedup: `camp_tarefa_${contexto.marcoId}_${via}`,
  }).catch((e) => console.error('[campanhaMarcos] notificar:', e.message));

  return ids.length;
}

module.exports = {
  pessoasAtribuiveis,
  areasAtivas,
  anexarAtribuicao,
  definirResponsaveis,
  avisarAtribuidos,
  normalizarArea,
};
