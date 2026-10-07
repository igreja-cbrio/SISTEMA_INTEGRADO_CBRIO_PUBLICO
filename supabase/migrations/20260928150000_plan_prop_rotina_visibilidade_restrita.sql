



















DROP POLICY IF EXISTS plan_prop_rotina_select ON public.plan_propostas_rotina_solicitacao;
CREATE POLICY plan_prop_rotina_select ON public.plan_propostas_rotina_solicitacao
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.current_user_e_diretoria_ou_pastor()
    OR EXISTS (
      SELECT 1 FROM public.plan_propostas p
      WHERE p.id = plan_propostas_rotina_solicitacao.proposta_id
        AND (p.lider_id = auth.uid() OR p.preenchido_por_id = auth.uid() OR p.created_by = auth.uid())
    )
  );
