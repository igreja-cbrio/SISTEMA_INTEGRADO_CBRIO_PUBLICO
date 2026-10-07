

























const STATUS_INATIVO = 'inativo';
const MOTIVO_MAX = 500;


function limparMotivo(v) {
  const s = String(v == null ? '' : v).trim().replace(/\s+/g, ' ');
  return s ? s.slice(0, MOTIVO_MAX) : null;
}








function decidirDesativacao(membro, opts = {}) {
  if (!membro) return { ok: false, codigo: 'nao_encontrado' };
  if (membro.deleted_at) return { ok: false, codigo: 'apagado' };
  if (membro.status === STATUS_INATIVO) return { ok: false, codigo: 'ja_inativo' };

  const motivo = limparMotivo(opts.motivo);
  return {
    ok: true,
    motivo,
    patch: {
      status: STATUS_INATIVO,
      inativado_em: opts.agora || new Date().toISOString(),
      inativado_motivo: motivo,
      inativado_por: opts.porUsuario || null,

      inativado_status_anterior: membro.status || null,
    },
  };
}









function decidirReativacao(membro, opts = {}) {
  if (!membro) return { ok: false, codigo: 'nao_encontrado' };
  if (membro.deleted_at) return { ok: false, codigo: 'apagado' };
  if (membro.status !== STATUS_INATIVO) return { ok: false, codigo: 'nao_esta_inativo' };

  const escolhido = typeof opts.statusEscolhido === 'string' ? opts.statusEscolhido.trim() : '';
  const anterior = typeof membro.inativado_status_anterior === 'string'
    ? membro.inativado_status_anterior.trim()
    : '';
  const destino = anterior || escolhido;
  if (!destino) return { ok: false, codigo: 'sem_status_anterior' };

  if (destino === STATUS_INATIVO) return { ok: false, codigo: 'destino_invalido' };

  return { ok: true, statusDestino: destino, patch: { status: destino } };
}

module.exports = {
  STATUS_INATIVO,
  MOTIVO_MAX,
  limparMotivo,
  decidirDesativacao,
  decidirReativacao,
};
