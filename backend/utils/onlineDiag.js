









































const ESTADOS_ESPERADOS = Object.freeze([


  'live_encerrada_ou_sem_dado',

  'sem_live_ativa',



  'sem_video_compativel',


  'sem_horario_culto',
]);





function classificarDiagOnline(motivo) {
  const m = String(motivo ?? '').trim();
  if (!m) return 'estado';
  return ESTADOS_ESPERADOS.includes(m) ? 'estado' : 'erro';
}










function patchDiagOnline(motivo, agoraIso) {
  return {
    last_check_at: agoraIso,
    last_error: classificarDiagOnline(motivo) === 'erro' ? String(motivo) : null,
  };
}

module.exports = { ESTADOS_ESPERADOS, classificarDiagOnline, patchDiagOnline };
