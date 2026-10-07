-- Fixture estrutural para inspeção textual. Não aplicar em banco.
CREATE TABLE app_decisoes (
 membro_id uuid
);
CREATE TABLE app_inscricoes (
 membro_id uuid
);
CREATE TABLE app_suporte_mensagens (
 membro_id uuid
);
CREATE TABLE app_verificacoes (
 membro_id uuid
);
CREATE TABLE batismo_inscricoes (
 membro_id uuid
);
CREATE TABLE camp_agradecimentos (
 membro_id uuid
);
CREATE TABLE camp_disparo_envios (
 membro_id uuid
);
CREATE TABLE cen_convite (
 membro_id uuid
);
CREATE TABLE cen_cuidado (
 membro_id uuid
);
CREATE TABLE cen_resposta (
 membro_id uuid
);
CREATE TABLE cui_acompanhamentos (
 membro_id uuid
);
CREATE TABLE cui_convertidos (
 membro_id uuid
);
CREATE TABLE cui_j180_turma_membros (
 membro_id uuid
);
CREATE TABLE cui_jornada180 (
 membro_id uuid
);
CREATE TABLE cui_pedidos (
 membro_id uuid
);
CREATE TABLE cui_visitas (
 membro_id uuid
);
CREATE TABLE cultos_decisoes_pessoas (
 membro_id uuid
);
CREATE TABLE devocional_envios (
 membro_id uuid
);
CREATE TABLE ext_inscricoes (
 membro_id uuid
);
CREATE TABLE face_presencas (
 membro_id uuid
);
CREATE TABLE fin_alertas (
 membro_id uuid
);
CREATE TABLE fin_lancamentos_brutos (
 membro_id uuid
);
CREATE TABLE fin_regras_classificacao (
 membro_id uuid
);
CREATE TABLE fin_transacoes (
 membro_id uuid
);
CREATE TABLE flx_acoes (
 membro_id uuid
);
CREATE TABLE identidade_pendencias (
 membro_id uuid
);
CREATE TABLE inscricao_consentimentos (
 membro_id uuid
);
CREATE TABLE inscricoes (
 membro_id uuid
);
CREATE TABLE jornada_encaminhamentos (
 membro_id uuid
);
CREATE TABLE kids_responsaveis (
 membro_id uuid
);
CREATE TABLE kids_sala_voluntarios (
 membro_id uuid
);
CREATE TABLE marketing_capacidade_override (
 membro_id uuid
);
CREATE TABLE marketing_card_checklist (
 membro_id uuid
);
CREATE TABLE marketing_ciclo_itens_padrao (
 membro_id uuid
);
CREATE TABLE marketing_compromissos_recorrentes (
 membro_id uuid
);
CREATE TABLE marketing_entrega_arquivos (
 membro_id uuid
);
CREATE TABLE marketing_grupo_padrao (
 membro_id uuid
);
CREATE TABLE marketing_recorrentes_participantes (
 membro_id uuid
);
CREATE TABLE marketing_rotina_execucoes (
 membro_id uuid
);
CREATE TABLE mem_cadastros_pendentes (
 membro_id uuid
);
CREATE TABLE mem_censo_convites (
 membro_id uuid
);
CREATE TABLE mem_checkins (
 membro_id uuid
);
CREATE TABLE mem_contatos (
 membro_id uuid
);
CREATE TABLE mem_contribuicoes (
 membro_id uuid
);
CREATE TABLE mem_devocionais (
 membro_id uuid
);
CREATE TABLE mem_escalas (
 membro_id uuid
);
CREATE TABLE mem_grupo_encontro_presencas (
 membro_id uuid
);
CREATE TABLE mem_grupo_membros (
 membro_id uuid
);
CREATE TABLE mem_grupo_pedidos (
 membro_id uuid
);
CREATE TABLE mem_grupo_transferencias (
 membro_id uuid
);
CREATE TABLE mem_historico (
 membro_id uuid
);
CREATE TABLE mem_identidade_observacoes (
 membro_id uuid
);
CREATE TABLE mem_lider_inscricoes (
 membro_id uuid
);
CREATE TABLE mem_trilha_valores (
 membro_id uuid
);
CREATE TABLE mem_voluntarios (
 membro_id uuid
);
CREATE TABLE next_inscricoes (
 membro_id uuid
);
CREATE TABLE next_matriculas (
 membro_id uuid
);
CREATE TABLE next_pessoa_aula_manual (
 membro_id uuid
);
CREATE TABLE nsm_eventos (
 membro_id uuid
);
CREATE TABLE pag_cobrancas (
 membro_id uuid
);
CREATE TABLE profiles (
 membro_id uuid
);
CREATE TABLE vis_visitas (
 membro_id uuid
);
CREATE TABLE vol_area_supervisores (
 membro_id uuid
);
CREATE TABLE vol_background_checks (
 membro_id uuid
);
CREATE TABLE vol_inscricoes (
 membro_id uuid
);
CREATE TABLE vol_inscritos (
 membro_id uuid
);
CREATE TABLE vol_servicos_historico (
 membro_id uuid
);
CREATE TABLE wa_conversas (
 membro_id uuid
);
CREATE TABLE wifi_visitantes (
 membro_id uuid
);
GRANT EXECUTE ON FUNCTION public._kpi_agregar_dado(text, text, date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.agg_solicitacoes_kpi(text, text, text, date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.aplicar_classificacao_lancamento(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.aplicar_meta_institucional(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_marcar_senha_trocada() TO authenticated;
GRANT EXECUTE ON FUNCTION public.app_restore(TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_soft_delete(TEXT, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.atribuir_kpi_area(text, text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.atribuir_ministerio(text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.atualizar_encontro_grupo(uuid, date, text, text, uuid[])
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.calcular_kpi(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.calcular_sla_deadlines(area_adm_resp, text, boolean, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_edit_dado_bruto(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_edit_kpi_area(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_validate_dado_bruto(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cruzar_pessoas(jsonb, int, int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_e_diretoria_ou_pastor() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_funcionario_id() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.current_user_igreja_ids() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.current_user_membro_id() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.current_user_module_level(TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.decrementar_presenca_grupo_membro(uuid, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fechar_mes_financeiro(int,int,uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fin_arrecadacoes_listar TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fin_classificar_movimento TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fin_dizimo_oferta_mensal TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fin_generosidade_mes TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fin_metas_progresso TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fin_metas_progresso(date, date, uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fin_saude_financeira TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fin_saude_financeira(integer, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_consolidar_temporada(text, uuid, text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_grupos_kpis_relatorio(text, int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_marketing_calcular_capacidade_semana(date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_marketing_estimar_prazo(uuid, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_monitoramento_okr_raw() TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.fn_normalizar_setor(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_nsm_serie_mensal(int, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_nsm_sinais_engajados(uuid, text, text, date, int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_nsm_valores_engajados(uuid, date, int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_solicitacoes_resolver_diretor_origem(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_solicitacoes_rotear_origem(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_solicitacoes_rotear_origem(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_temporada_metricas(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_temporada_sem_presenca(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_temporada_series(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.gerar_alertas_financeiros() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.gerar_codigo_grupo(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.gerar_contas_pagar_recorrentes(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.incrementar_presenca_grupo(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.kpi_adm_data_to_periodo(text, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.listar_devocional_mural(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.listar_matches_seed(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.marcar_diretoria_geral(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.merge_membros(uuid, uuid[], uuid, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.nsm_inserir_evento(uuid, text, text, uuid, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pat_dashboard_indicadores() TO authenticated;
GRANT EXECUTE ON FUNCTION public.reabrir_mes_financeiro(int,int,uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recalcular_kpi(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recalcular_kpi_adm(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recalcular_kpis_adm_para_area_datas(text, date[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recalcular_kpis_por_dado(text, text, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recalcular_nsm() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recalcular_todos_kpis_adm() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reclassificar_fila_pendente() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.refresh_vw_pessoas_papeis_mat() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.registrar_encontro_grupo(uuid, date, text, text, uuid, text, uuid[])
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resumo_meus_planos_devocionais() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.santander_proximo_nosso_numero() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.seedar_krs_especificos(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_is_kids_responsavel(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.user_is_lider_de(UUID) TO authenticated, anon;
grant execute on function public.app_batismo_checkin(uuid) to authenticated;
grant execute on function public.app_desmarcar_batizado_outra() to authenticated;
grant execute on function public.app_marcar_batizado_outra(text) to authenticated;
grant execute on function public.app_meu_qrcode() to authenticated;
grant execute on function public.app_salvar_membro(text, text, text, text, date) to authenticated;
grant execute on function public.current_user_module_level(text) to authenticated;
grant execute on function public.is_super_admin() to authenticated;
grant execute on function public.kpi_servir_comunidade(timestamptz) to authenticated, service_role, anon;
CREATE TABLE apresentacao_criancas (id uuid);

CREATE TABLE apresentacao_bebes (id uuid);
