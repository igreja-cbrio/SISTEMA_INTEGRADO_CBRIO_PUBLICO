







const { supabase } = require('../utils/supabase');
const { proximoEncontro, ancoraDeInicio } = require('../utils/agendaGrupo');
const { ancorasDeGrupos, iniciosDeGrupos } = require('./grupoAncora');
const { montarRespostaAgenda, montarRespostaLink } = require('../utils/respostaGrupoAgenda');
const { assuntoDaMensagem } = require('../utils/assuntoGrupoConversa');
const { ehGrupoOnline } = require('../utils/grupoOnline');













async function grupoDaConversa(conversa) {
  if (!conversa?.membro_id) return { grupo: null, motivo: 'sem_cadastro' };

  const { data, error } = await supabase.from('mem_grupo_membros')
    .select('grupo_id, mem_grupos!inner(id, nome, dia_semana, horario, recorrencia, local, endereco, bairro, temporada, lider_id, ativo, deleted_at)')
    .eq('membro_id', conversa.membro_id).is('saiu_em', null);
  if (error) { console.warn('[sugestaoGrupo] vinculos:', error.message); return { grupo: null, motivo: 'erro' }; }

  const vivos = (data || [])
    .map(v => v.mem_grupos)
    .filter(g => g && g.ativo && !g.deleted_at);

  if (vivos.length === 1) return { grupo: vivos[0], motivo: 'vinculo' };
  if (!vivos.length) return { grupo: null, motivo: 'sem_grupo' };

  const escolhido = await desempatarPeloDisparo(conversa.telefone, vivos);
  return escolhido
    ? { grupo: escolhido, motivo: 'vinculo_disparo' }
    : { grupo: null, motivo: 'ambiguo', candidatos: vivos.map(g => g.nome) };
}


async function desempatarPeloDisparo(telefone, candidatos) {
  const d = String(telefone || '').replace(/\D+/g, '');
  if (d.length < 8) return null;
  const { data, error } = await supabase.from('whatsapp_envios')
    .select('ref_id, criado_em')
    .ilike('telefone', `%${d.slice(-8)}`)
    .like('contexto', 'grupos%')
    .not('ref_id', 'is', null)
    .order('criado_em', { ascending: false }).limit(5);
  if (error || !data?.length) return null;

  const { data: pedidos } = await supabase.from('mem_grupo_pedidos')
    .select('id, grupo_id').in('id', data.map(e => e.ref_id));
  const ids = new Set((pedidos || []).map(p => p.grupo_id));
  const casa = candidatos.filter(g => ids.has(g.id));

  return casa.length === 1 ? casa[0] : null;
}









async function ancoraDoGrupo(grupo) {
  const [reais, inicios] = await Promise.all([
    ancorasDeGrupos([grupo.id]).catch(() => ({})),
    iniciosDeGrupos([grupo.id]).catch(() => ({})),
  ]);
  const real = reais?.[grupo.id] || null;
  if (real) return { ancoraISO: real, estimada: false };

  const semanal = String(grupo.recorrencia || 'semanal').toLowerCase() === 'semanal';
  if (semanal) return { ancoraISO: null, estimada: false };

  const derivada = ancoraDeInicio({ diaSemana: grupo.dia_semana, inicioISO: inicios?.[grupo.id] || null });
  return { ancoraISO: derivada, estimada: !!derivada };
}


function localDoGrupo(g) {
  return [g.local, g.endereco, g.bairro].map(x => String(x || '').trim()).filter(Boolean).join(' — ');
}

async function liderDoGrupo(grupo) {
  if (!grupo?.lider_id) return { nome: '', telefone: '' };
  const { data } = await supabase.from('mem_membros')
    .select('nome, telefone').eq('id', grupo.lider_id).is('deleted_at', null).maybeSingle();
  return { nome: data?.nome || '', telefone: data?.telefone || '' };
}










async function ultimaMensagemDela(conversaId) {
  const { data, error } = await supabase.from('wa_mensagens')
    .select('texto, criado_em').eq('conversa_id', conversaId).eq('direcao', 'in')
    .order('criado_em', { ascending: false }).limit(1).maybeSingle();
  if (error) { console.warn('[sugestaoGrupo] ultima msg:', error.message); return null; }
  return data?.texto || null;
}








async function sugerirAgenda(conversaId, { somenteSeReconhecer = false } = {}) {
  const { data: conversa, error } = await supabase.from('wa_conversas')
    .select('id, nome, telefone, membro_id').eq('id', conversaId).is('deleted_at', null).maybeSingle();
  if (error || !conversa) return { disponivel: false, motivo: 'conversa_nao_encontrada' };

  const { grupo, motivo, candidatos } = await grupoDaConversa(conversa);
  if (!grupo) return { disponivel: false, motivo, candidatos };

  const assunto = assuntoDaMensagem(await ultimaMensagemDela(conversa.id));






  if (somenteSeReconhecer && !assunto) return { disponivel: false, motivo: 'sem_assunto' };

  const { ancoraISO, estimada } = await ancoraDoGrupo(grupo);






  const { data: exc, error: eExc } = await supabase.from('mem_grupo_agenda_excecoes')
    .select('data_original, status, nova_data, novo_horario').eq('grupo_id', grupo.id);
  if (eExc) {
    console.warn('[sugestaoGrupo] excecoes:', eExc.message);
    return { disponivel: false, motivo: 'agenda_indisponivel' };
  }

  const prox = proximoEncontro({
    diaSemana: grupo.dia_semana, horario: grupo.horario,
    recorrencia: grupo.recorrencia, ancoraISO, excecoes: exc || [],
  });

  const lider = await liderDoGrupo(grupo);





  if (assunto === 'link') {
    const r = montarRespostaLink({
      nome: conversa.nome, grupoNome: grupo.nome,
      online: ehGrupoOnline(grupo), local: localDoGrupo(grupo),
      liderNome: lider.nome, liderTelefone: lider.telefone,



      proximaISO: (estimada || prox?.ancora_incerta || prox?.data_estimada) ? null : (prox?.data || null),
      horario: grupo.horario,
    });
    return {
      disponivel: true, texto: r.texto, confianca: r.confianca, assunto: 'link',
      grupo: { id: grupo.id, nome: grupo.nome, recorrencia: grupo.recorrencia, online: ehGrupoOnline(grupo) },
      proxima: prox?.data || null, origem_grupo: motivo,
    };
  }

  const { texto, confianca } = montarRespostaAgenda({
    nome: conversa.nome, grupoNome: grupo.nome,
    proximaISO: prox?.data || null, horario: grupo.horario,
    recorrencia: grupo.recorrencia, local: localDoGrupo(grupo),
    liderNome: lider.nome, liderTelefone: lider.telefone,


    estimada: estimada || !!prox?.ancora_incerta || !!prox?.data_estimada,
  });

  return {
    disponivel: true, texto, confianca, assunto: assunto || 'agenda',
    grupo: { id: grupo.id, nome: grupo.nome, recorrencia: grupo.recorrencia },
    proxima: prox?.data || null, origem_grupo: motivo,
  };
}

module.exports = { sugerirAgenda, grupoDaConversa, ancoraDoGrupo, localDoGrupo };
