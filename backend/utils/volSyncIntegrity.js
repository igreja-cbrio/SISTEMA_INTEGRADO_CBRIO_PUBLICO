






function decidirReconciliacao({ tiposComFalha, pessoasCompletas, pcoAtivo = true }) {







  if (!pcoAtivo) return { podeReconciliar: false, motivo: 'pco_desativado' };
  if (tiposComFalha > 0) return { podeReconciliar: false, motivo: 'tipos_de_servico_com_falha' };
  if (!pessoasCompletas) return { podeReconciliar: false, motivo: 'pessoas_do_services_incompletas' };
  return { podeReconciliar: true, motivo: null };
}


















function podeGerarCulto({ servicosDoDia = [], serviceTypeId, pcoAtivo = true }) {
  if (servicosDoDia.some(s => s.service_type_id === serviceTypeId)) {
    return { pode: false, motivo: 'ja_existe_deste_tipo' };
  }
  if (pcoAtivo && servicosDoDia.some(s => s.planning_center_id || s.service_type_id == null)) {
    return { pode: false, motivo: 'dia_tem_culto_do_planning_center' };
  }
  return { pode: true, motivo: null };
}

module.exports = { decidirReconciliacao, podeGerarCulto };
