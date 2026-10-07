













async function resolverVoluntarioPorQr(qrCode, sb) {
  if (!qrCode) return { ok: false, statusCode: 400, error: 'qr_code obrigatorio' };


  const { data: profile } = await sb.from('vol_profiles')
    .select('id, planning_center_id, full_name').eq('qr_code', qrCode).maybeSingle();
  if (profile) {
    return { ok: true, volunteerData: {
      type: 'profile', id: profile.id,
      planning_center_id: profile.planning_center_id, name: profile.full_name || 'Voluntario',
    } };
  }


  const { data: vqr } = await sb.from('vol_volunteer_qrcodes')
    .select('id, planning_center_person_id, volunteer_name').eq('qr_code', qrCode).maybeSingle();
  if (vqr) {
    return { ok: true, volunteerData: {
      type: 'volunteer_qrcode', id: null,
      planning_center_id: vqr.planning_center_person_id, name: vqr.volunteer_name,
    } };
  }


  const { data: membro } = await sb.rpc('fn_vol_resolver_membro_token', { p_token: qrCode });
  if (!membro) return { ok: false, statusCode: 404, error: 'Voluntário não encontrado' };
  if (!membro.is_voluntario) return { ok: false, statusCode: 403, error: 'Pessoa não é voluntária ativa' };
  return { ok: true, volunteerData: {
    type: 'profile', id: membro.vol_profile_id || null,
    planning_center_id: membro.planning_center_id || null, name: membro.nome || 'Voluntario',
  } };
}

module.exports = { resolverVoluntarioPorQr };
