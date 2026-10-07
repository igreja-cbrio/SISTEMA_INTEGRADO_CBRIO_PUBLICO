
















const { supabase } = require('../utils/supabase');
const { notificar, resolverDestinatarios } = require('./notificar');
const { moduloDaAreaEvento } = require('../utils/moduloDaAreaEvento');
const { equipeSupervisionada } = require('../utils/supervisorArea');
const { notificarApp } = require('./appPush');

const STATUS_VALIDOS = ['confirmed', 'declined'];

function _quandoBRT(iso) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  const brt = new Date(d.getTime() - 3 * 3600000);
  const dd = String(brt.getUTCDate()).padStart(2, '0');
  const mm = String(brt.getUTCMonth() + 1).padStart(2, '0');
  const hh = String(brt.getUTCHours()).padStart(2, '0');
  const mi = String(brt.getUTCMinutes()).padStart(2, '0');
  return `${dd}/${mm} às ${hh}:${mi}`;
}









async function _contaDoSupervisor(teamId) {
  if (!teamId) return null;
  try {
    const { data: team } = await supabase.from('vol_teams')
      .select('id, name, leader_profile_id').eq('id', teamId).maybeSingle();
    if (!team?.leader_profile_id) return null;

    const { data: perfil } = await supabase.from('vol_profiles')
      .select('id, full_name, membresia_id').eq('id', team.leader_profile_id).maybeSingle();
    if (!perfil?.membresia_id) return null;

    const { data: conta } = await supabase.from('profiles')
      .select('id').eq('membro_id', perfil.membresia_id).maybeSingle();
    if (!conta?.id) return null;

    return { userId: conta.id, nome: perfil.full_name, equipe: team.name };
  } catch (e) {
    console.error('[escalaResposta] supervisor não resolvido:', e.message);
    return null;
  }
}
















async function _areaDaEquipe(teamId) {
  if (!teamId) return null;
  const { data, error } = await supabase
    .from('vol_teams').select('area').eq('id', teamId).maybeSingle();
  if (error) throw error;
  return data?.area || null;
}




























async function _supervisoresDaArea(area) {
  const ids = new Set();
  const { data, error } = await supabase
    .from('vol_area_supervisores').select('membro_id, area');
  if (error) throw error;
  const membros = (data || [])
    .filter((r) => equipeSupervisionada({ area }, [r.area]))
    .map((r) => r.membro_id)
    .filter(Boolean);
  if (!membros.length) return [];


  const { data: perfis, error: pErr } = await supabase
    .from('profiles').select('id').in('membro_id', [...new Set(membros)]);
  if (pErr) throw pErr;
  for (const p of perfis || []) if (p?.id) ids.add(p.id);
  return [...ids];
}


async function _donosDoModulo(area) {
  const modulo = moduloDaAreaEvento(area);
  if (!modulo) return [];
  return (await resolverDestinatarios(modulo, 'escala_recusada')).filter(Boolean);
}

async function responderEscala(scheduleId, status, opts = {}) {
  if (!STATUS_VALIDOS.includes(status)) {
    return { ok: false, status: 400, erro: 'Status deve ser confirmed ou declined' };
  }

  const { data: atual, error: lErr } = await supabase.from('vol_schedules')
    .select('id, service_id, volunteer_id, volunteer_name, team_id, team_name, position_name, confirmation_status')
    .eq('id', scheduleId).maybeSingle();
  if (lErr) return { ok: false, status: 400, erro: lErr.message };
  if (!atual) return { ok: false, status: 404, erro: 'Escala não encontrada' };

  const { data: servico } = await supabase.from('vol_services')
    .select('id, name, scheduled_at').eq('id', atual.service_id).maybeSingle();









  const patch = { confirmation_status: status };
  if (status === 'declined') {
    const m = String(opts.motivo || '').trim().slice(0, 200);
    if (m) patch.recusa_motivo = m;
  } else {
    patch.recusa_motivo = null;
  }
  const { data: mudadas, error: uErr } = await supabase.from('vol_schedules')
    .update(patch)
    .eq('id', scheduleId).neq('confirmation_status', status)
    .select('id');
  if (uErr) return { ok: false, status: 400, erro: uErr.message };

  const mudou = (mudadas || []).length > 0;
  const escala = { ...atual, confirmation_status: status, service: servico || null };
  if (!mudou || status !== 'declined') return { ok: true, escala, mudou };


  const quando = servico?.scheduled_at ? _quandoBRT(servico.scheduled_at) : '';
  const area = atual.team_name || 'Voluntariado';
  const funcao = atual.position_name ? ` (${atual.position_name})` : '';
  const nome = atual.volunteer_name || 'Um voluntário';
  const ondeVer = '/ministerial/voluntariado/montar-escala';

















  try {
    const { data: jaTem } = await supabase.from('vol_availability')
      .select('id').eq('service_id', atual.service_id)
      .eq('volunteer_profile_id', atual.volunteer_id).limit(1);
    if (!jaTem?.length) {
      const { error: eDisp } = await supabase.from('vol_availability').insert({
        volunteer_profile_id: atual.volunteer_id,
        service_id: atual.service_id,
        reason: 'Avisou que não pode servir neste culto',
      });
      if (eDisp) throw eDisp;
    }
  } catch (e) {
    console.error('[escalaResposta] não consegui travar a disponibilidade:', e.message);
  }



















  let areaEquipe = null;
  try { areaEquipe = await _areaDaEquipe(atual.team_id); }
  catch (e) { console.error('[escalaResposta] área da equipe falhou:', e.message); }





  let supervisores = [];
  try { supervisores = await _supervisoresDaArea(areaEquipe); }
  catch (e) { console.error('[escalaResposta] supervisores da área falharam:', e.message); }

  let avisarTambem = [...supervisores];
  try {


    for (const id of await _donosDoModulo(areaEquipe)) {
      if (!avisarTambem.includes(id)) avisarTambem.push(id);
    }
  } catch (e) {


    console.error('[escalaResposta] donos do módulo falharam:', e.message);
  }

  try {
    await notificar({
      modulo: 'voluntariado',
      tipo: 'escala_recusada',
      extraTargetIds: avisarTambem,
      titulo: `${nome} não vai poder servir`,
      mensagem: `${nome} avisou que não vai poder servir em ${area}${funcao}${quando ? ` · ${quando}` : ''}${servico?.name ? ` (${servico.name})` : ''}. A vaga voltou a ficar em aberto.`,
      link: ondeVer,


      chaveDedup: `escala_recusada_${scheduleId}`,
    });
  } catch (e) {
    console.error('[escalaResposta] aviso à coordenação falhou:', e.message);
  }














  try {
    const alvos = new Set(supervisores);
    const sup = await _contaDoSupervisor(atual.team_id);
    if (sup?.userId) alvos.add(sup.userId);
    if (alvos.size) {
      await notificarApp([...alvos], {
        tipo: 'escala',
        titulo: `${nome} não vai poder servir`,
        body: `${area}${funcao}${quando ? ` · ${quando}` : ''}. A vaga está em aberto.`,
        data: { tipo: 'escala' },
        chaveDedup: `escala_recusada:${scheduleId}`,
      });
    }
  } catch (e) {
    console.error('[escalaResposta] aviso no app do membro falhou:', e.message);
  }

  return { ok: true, escala, mudou };
}

module.exports = { responderEscala, STATUS_VALIDOS };
