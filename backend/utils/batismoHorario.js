





















function normalizarHorario(valor) {
  if (valor == null) return null;
  const s = String(valor).trim().slice(0, 80);
  return s === '' ? null : s;
}











function avaliarHorarioBatismo(escolhido, { configurados, ocupacao = {}, exigir = false } = {}) {
  const horario = normalizarHorario(escolhido);













  if (horario === null) {
    if (!exigir) return { ok: true, horario: null, motivo: null, mensagem: null };
    if (!Array.isArray(configurados)) {
      return {
        ok: false,
        horario: null,
        motivo: 'indisponivel',
        mensagem: 'Não conseguimos confirmar os horários agora. Tente de novo em instantes.',
      };
    }



    if (horariosDisponiveis(configurados, ocupacao).length === 0) {
      return {
        ok: false,
        horario: null,
        motivo: 'sem_horario_aberto',
        mensagem: 'Não há horário de batismo aberto no momento. Fale com a equipe da Integração.',
      };
    }
    return {
      ok: false,
      horario: null,
      motivo: 'obrigatorio',
      mensagem: 'Escolha o horário do batismo.',
    };
  }

  if (!Array.isArray(configurados)) {
    return {
      ok: false,
      horario,
      motivo: 'indisponivel',
      mensagem: 'Não conseguimos confirmar os horários agora. Tente de novo em instantes.',
    };
  }

  const conf = configurados.find((h) => h && h.horario === horario);
  if (!conf || conf.aberto !== true) {
    return {
      ok: false,
      horario,
      motivo: 'fechado',
      mensagem: 'Esse horário não está mais disponível. Escolha outro.',
    };
  }




  if (conf.limite != null && (ocupacao[horario] || 0) >= conf.limite) {
    const label = conf.label || horario;
    return {
      ok: false,
      horario,
      motivo: 'lotado',
      label,
      limite: conf.limite,



      mensagem:
        `O horário ${label} já está completo (${conf.limite} pessoas). `
        + 'Escolha outro horário — os que ainda têm vaga aparecem na lista.',
    };
  }

  return { ok: true, horario, motivo: null, mensagem: null };
}










function horariosDisponiveis(configurados, ocupacao = {}) {
  return (Array.isArray(configurados) ? configurados : [])
    .filter((h) => h && h.aberto === true)
    .map((h) => ({
      horario: h.horario,
      label: h.label || h.horario,
      vagas_restantes: h.limite != null ? Math.max(0, h.limite - (ocupacao[h.horario] || 0)) : null,
    }))
    .filter((h) => h.vagas_restantes === null || h.vagas_restantes > 0);
}

module.exports = { avaliarHorarioBatismo, horariosDisponiveis, normalizarHorario };
