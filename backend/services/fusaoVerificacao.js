



































const TABELAS_COM_MEMBRO = Object.freeze([
  'app_decisoes', 'app_inscricoes', 'app_suporte_mensagens', 'app_verificacoes',
  'batismo_inscricoes', 'camp_agradecimentos', 'camp_disparo_envios',
  'cen_convite', 'cen_cuidado', 'cen_resposta',
  'cui_acompanhamentos', 'cui_convertidos', 'cui_j180_turma_membros', 'cui_jornada180',
  'cui_pedidos', 'cui_visitas', 'cultos_decisoes_pessoas', 'devocional_envios',
  'ext_inscricoes', 'face_presencas', 'fin_alertas', 'fin_lancamentos_brutos',
  'fin_regras_classificacao', 'fin_transacoes', 'flx_acoes', 'identidade_pendencias',
  'inscricao_consentimentos', 'inscricoes', 'jornada_encaminhamentos',
  'kids_responsaveis', 'kids_sala_voluntarios', 'marketing_capacidade_override', 'marketing_card_checklist', 'marketing_ciclo_itens_padrao',
  'marketing_compromissos_recorrentes', 'marketing_grupo_padrao',
  'marketing_recorrentes_participantes', 'mem_cadastros_pendentes', 'mem_censo_convites',
  'mem_checkins', 'mem_contatos', 'mem_contribuicoes', 'mem_devocionais', 'mem_escalas',
  'mem_grupo_encontro_presencas', 'mem_grupo_membros', 'mem_grupo_pedidos',
  'mem_grupo_transferencias', 'mem_historico', 'mem_identidade_observacoes',
  'mem_lider_inscricoes', 'mem_trilha_valores', 'mem_voluntarios',
  'next_inscricoes', 'next_matriculas', 'next_pessoa_aula_manual', 'nsm_eventos',
  'pag_cobrancas', 'profiles', 'vis_visitas', 'vol_area_supervisores',
  'vol_background_checks', 'vol_inscricoes', 'vol_inscritos', 'vol_servicos_historico',
  'wa_conversas', 'wifi_visitantes',
]);








const COLUNA_ALTERNATIVA = Object.freeze({
  vol_profiles: 'membresia_id',
  mem_identidade_pares: 'membro_b_id',
  entradas_pares_adiados: 'membro_b_id',
});
















async function verificarSobrasDaFusao(supabase, idsRemovidos) {
  const ids = (Array.isArray(idsRemovidos) ? idsRemovidos : [idsRemovidos]).filter(Boolean);
  if (!ids.length) return { ok: true, sobras: [], naoConferidas: [] };

  const alvos = [
    ...TABELAS_COM_MEMBRO.map((t) => [t, 'membro_id']),
    ...Object.entries(COLUNA_ALTERNATIVA),
  ];
  const sobras = [];
  const naoConferidas = [];



  const LOTE = 8;
  for (let i = 0; i < alvos.length; i += LOTE) {
    await Promise.all(alvos.slice(i, i + LOTE).map(async ([tabela, coluna]) => {
      try {
        const { data, error } = await supabase.from(tabela).select(coluna).in(coluna, ids);
        if (error) { naoConferidas.push({ tabela, coluna, motivo: error.message }); return; }
        if (data && data.length) sobras.push({ tabela, coluna, linhas: data.length });
      } catch (e) {
        naoConferidas.push({ tabela, coluna, motivo: String(e.message).slice(0, 120) });
      }
    }));
  }
  return { ok: sobras.length === 0, sobras, naoConferidas };
}

module.exports = { TABELAS_COM_MEMBRO, COLUNA_ALTERNATIVA, verificarSobrasDaFusao };
