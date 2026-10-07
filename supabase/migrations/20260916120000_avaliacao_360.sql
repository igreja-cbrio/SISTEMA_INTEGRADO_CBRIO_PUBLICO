














































COMMENT ON TABLE public.rh_avaliacoes IS
  'Ficha de ENQUADRAMENTO do PCS (auto + líder + calibração sobre pcs_criterios, '
  'que são critérios de CARGO). NÃO é avaliação 360 — esta vive em rh_aval360_*. '
  'A nota daqui alimenta pontuacao_pcs/grau_sugerido_id, ou seja faixa salarial; '
  'nenhuma fonte par/liderado pode chegar aqui.';



ALTER TABLE public.rh_avaliacoes        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.rh_avaliacao_fatores ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_rh_avaliacoes_ativas
  ON public.rh_avaliacoes (id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_rh_avaliacao_fatores_ativas
  ON public.rh_avaliacao_fatores (id) WHERE deleted_at IS NULL;





DO $$
DECLARE v_lista TEXT;
BEGIN
  SELECT string_agg(quote_literal(t), ', ' ORDER BY t) INTO v_lista
  FROM (
    SELECT unnest(public.app_soft_deletable_tables()) AS t
    UNION SELECT 'rh_avaliacoes'
    UNION SELECT 'rh_avaliacao_fatores'
    UNION SELECT 'rh_aval360_ciclo'
    UNION SELECT 'rh_aval360_competencia'
    UNION SELECT 'rh_aval360_ciclo_competencia'
    UNION SELECT 'rh_aval360_convite'
    UNION SELECT 'rh_aval360_resposta'
  ) s;

  EXECUTE format($f$
    CREATE OR REPLACE FUNCTION public.app_soft_deletable_tables()
    RETURNS TEXT[] LANGUAGE sql IMMUTABLE AS $body$
      SELECT ARRAY[%s]::TEXT[]
    $body$;
  $f$, v_lista);
END $$;


DROP TRIGGER IF EXISTS trg_audit_rh_avaliacoes ON public.rh_avaliacoes;
CREATE TRIGGER trg_audit_rh_avaliacoes
AFTER INSERT OR UPDATE OR DELETE ON public.rh_avaliacoes
FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes(
  'autoavaliacao_pts,lider_pts,calibracao_pts,pontuacao_final,pontuacao_pcs,grau_sugerido_id,status,deleted_at'
);













DROP POLICY IF EXISTS rh_avaliacoes_select ON public.rh_avaliacoes;
CREATE POLICY rh_avaliacoes_select ON public.rh_avaliacoes
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (public.user_is_lider_de(funcionario_id)
         OR public.current_user_module_level('rh') >= 3)
  );

DROP POLICY IF EXISTS rh_avaliacoes_update ON public.rh_avaliacoes;
CREATE POLICY rh_avaliacoes_update ON public.rh_avaliacoes
  FOR UPDATE TO authenticated
  USING (public.current_user_module_level('rh') >= 3)
  WITH CHECK (public.current_user_module_level('rh') >= 3);








CREATE TABLE IF NOT EXISTS public.rh_aval360_ciclo (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome             TEXT NOT NULL,
  descricao        TEXT,
  periodo_inicio   DATE NOT NULL,
  periodo_fim      DATE NOT NULL,
  
  
  indicacao_ate    DATE,
  validacao_ate    DATE,
  coleta_ate       DATE,
  
  
  
  piso_respondentes INT NOT NULL DEFAULT 3 CHECK (piso_respondentes >= 3),
  
  
  
  max_pares        INT NOT NULL DEFAULT 3 CHECK (max_pares BETWEEN 1 AND 10),
  escala_max       INT NOT NULL DEFAULT 5 CHECK (escala_max BETWEEN 3 AND 10),
  status           TEXT NOT NULL DEFAULT 'rascunho'
                   CHECK (status IN ('rascunho','indicacao','coleta','apuracao','publicado','encerrado')),
  
  
  
  
  alimenta_pcs     BOOLEAN NOT NULL DEFAULT FALSE CHECK (alimenta_pcs = FALSE),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by       UUID,
  deleted_at       TIMESTAMPTZ,
  CHECK (periodo_fim >= periodo_inicio)
);
CREATE INDEX IF NOT EXISTS idx_aval360_ciclo_ativo
  ON public.rh_aval360_ciclo (status) WHERE deleted_at IS NULL;

COMMENT ON COLUMN public.rh_aval360_ciclo.alimenta_pcs IS
  'Trava deliberada em FALSE. A 360 é insumo de desenvolvimento; progressão '
  'salarial é do PCS. Ver o teste no gate que impede fonte par/liderado de '
  'alcançar pontuacao_pcs.';
COMMENT ON COLUMN public.rh_aval360_ciclo.piso_respondentes IS
  'Mínimo de respostas para REVELAR um agregado de par/liderado. auto e gestor '
  'ficam fora do piso (são identificados por natureza). Régua em '
  'backend/utils/avaliacaoAnonimato.js, com teste no gate.';




CREATE TABLE IF NOT EXISTS public.rh_aval360_competencia (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo       TEXT NOT NULL UNIQUE,
  nome         TEXT NOT NULL,
  descricao    TEXT,
  
  
  
  eixo         TEXT NOT NULL DEFAULT 'comportamento'
               CHECK (eixo IN ('comportamento','resultado')),
  
  aplica_a     TEXT NOT NULL DEFAULT 'todos'
               CHECK (aplica_a IN ('todos','gestores','area')),
  area         TEXT,
  ordem        INT NOT NULL DEFAULT 0,
  ativo        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ
);



CREATE TABLE IF NOT EXISTS public.rh_aval360_ciclo_competencia (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ciclo_id        UUID NOT NULL REFERENCES public.rh_aval360_ciclo(id) ON DELETE RESTRICT,
  competencia_id  UUID NOT NULL REFERENCES public.rh_aval360_competencia(id) ON DELETE RESTRICT,
  peso            NUMERIC(4,3) NOT NULL DEFAULT 1.000 CHECK (peso > 0),
  ordem           INT NOT NULL DEFAULT 0,
  deleted_at      TIMESTAMPTZ,
  UNIQUE (ciclo_id, competencia_id)
);




CREATE TABLE IF NOT EXISTS public.rh_aval360_convite (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ciclo_id       UUID NOT NULL REFERENCES public.rh_aval360_ciclo(id) ON DELETE RESTRICT,
  
  
  
  avaliado_id    UUID NOT NULL REFERENCES public.rh_funcionarios(id) ON DELETE RESTRICT,
  avaliador_id   UUID NOT NULL REFERENCES public.rh_funcionarios(id) ON DELETE RESTRICT,
  papel          TEXT NOT NULL CHECK (papel IN ('auto','gestor','par','liderado')),
  origem         TEXT NOT NULL DEFAULT 'automatico'
                 CHECK (origem IN ('automatico','indicado','rh')),
  
  aprovado_em    TIMESTAMPTZ,
  aprovado_por   UUID,
  
  
  
  
  suprimido_em   TIMESTAMPTZ,
  suprimido_motivo TEXT,
  respondido_em  TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at     TIMESTAMPTZ,
  
  UNIQUE (ciclo_id, avaliado_id, avaliador_id, papel),
  
  CHECK ((papel = 'auto') = (avaliado_id = avaliador_id))
);
CREATE INDEX IF NOT EXISTS idx_aval360_convite_avaliador
  ON public.rh_aval360_convite (avaliador_id, ciclo_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_aval360_convite_avaliado
  ON public.rh_aval360_convite (avaliado_id, ciclo_id) WHERE deleted_at IS NULL;

COMMENT ON TABLE public.rh_aval360_convite IS
  'IDENTIDADE (quem avalia quem). Legível só pelo próprio avaliador e por RH '
  'nível 3 — o AVALIADO nunca lê, porque ver a lista de quem te avalia é ver '
  'quem te avaliou.';




CREATE TABLE IF NOT EXISTS public.rh_aval360_resposta (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ciclo_id       UUID NOT NULL REFERENCES public.rh_aval360_ciclo(id) ON DELETE RESTRICT,
  avaliado_id    UUID NOT NULL REFERENCES public.rh_funcionarios(id) ON DELETE RESTRICT,
  papel          TEXT NOT NULL CHECK (papel IN ('auto','gestor','par','liderado')),
  
  
  
  
  convite_id     UUID NOT NULL UNIQUE REFERENCES public.rh_aval360_convite(id) ON DELETE RESTRICT,
  
  
  respondido_dia DATE NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_aval360_resposta_avaliado
  ON public.rh_aval360_resposta (avaliado_id, ciclo_id, papel) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.rh_aval360_nota (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resposta_id    UUID NOT NULL REFERENCES public.rh_aval360_resposta(id) ON DELETE CASCADE,
  competencia_id UUID NOT NULL REFERENCES public.rh_aval360_competencia(id) ON DELETE RESTRICT,
  nota           INT CHECK (nota >= 1),
  
  comentario     TEXT,
  UNIQUE (resposta_id, competencia_id)
);





ALTER TABLE public.rh_aval360_ciclo              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rh_aval360_competencia        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rh_aval360_ciclo_competencia  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rh_aval360_convite            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rh_aval360_resposta           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rh_aval360_nota               ENABLE ROW LEVEL SECURITY;



CREATE POLICY aval360_ciclo_service ON public.rh_aval360_ciclo
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY aval360_competencia_service ON public.rh_aval360_competencia
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY aval360_ciclo_comp_service ON public.rh_aval360_ciclo_competencia
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY aval360_convite_service ON public.rh_aval360_convite
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY aval360_resposta_service ON public.rh_aval360_resposta
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY aval360_nota_service ON public.rh_aval360_nota
  FOR ALL TO service_role USING (true) WITH CHECK (true);




CREATE POLICY aval360_convite_select ON public.rh_aval360_convite
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (avaliador_id = public.current_user_funcionario_id()
         OR public.current_user_module_level('rh') >= 3)
  );

CREATE POLICY aval360_ciclo_select ON public.rh_aval360_ciclo
  FOR SELECT TO authenticated USING (deleted_at IS NULL);
CREATE POLICY aval360_competencia_select ON public.rh_aval360_competencia
  FOR SELECT TO authenticated USING (deleted_at IS NULL AND ativo);
CREATE POLICY aval360_ciclo_comp_select ON public.rh_aval360_ciclo_competencia
  FOR SELECT TO authenticated USING (deleted_at IS NULL);

























INSERT INTO public.rh_aval360_competencia (codigo, nome, descricao, eixo, aplica_a, ordem)
VALUES
  ('combinado', 'Cumpre o combinado',
   'Entrega o que disse, na data que disse. Quando não vai dar, avisa ANTES do prazo estourar — não depois.',
   'comportamento', 'todos', 1),
  ('informacao', 'A informação chega',
   'O que ele sabe e os outros precisam saber chega a quem precisa, sem alguém ter que ir buscar.',
   'comportamento', 'todos', 2),
  ('atravessa_area', 'Atravessa área',
   'Quando a demanda passa pela área dele, resolve — em vez de devolver com "não é comigo".',
   'comportamento', 'todos', 3),
  ('sob_pressao', 'Trata bem sob pressão',
   'Domingo de manhã é ambiente de estresse alto. Como trata colega e voluntário quando dá errado ao vivo?',
   'comportamento', 'todos', 4),
  ('aceita_correcao', 'Aceita correção',
   'Recebe apontamento sem se defender — e, meses depois, dá para ver que mudou.',
   'comportamento', 'todos', 5),
  ('prioridade', 'Clareza de prioridade',
   'A equipe dele sabe o que é mais importante nesta semana, sem precisar perguntar.',
   'comportamento', 'gestores', 6),
  ('acessivel', 'Está acessível',
   'Quando o liderado precisa de uma decisão, consegue falar com ele e sai com a decisão.',
   'comportamento', 'gestores', 7),
  ('desenvolve', 'Desenvolve a equipe',
   'Dá feedback específico (não "tá indo bem") e delega com responsabilidade real, não só tarefa.',
   'comportamento', 'gestores', 8),
  ('autoridade', 'Separa autoridade espiritual de decisão de trabalho',
   'Resolve conflito de trabalho com argumento de trabalho — sem recorrer à posição espiritual que ocupa.',
   'comportamento', 'gestores', 9)
ON CONFLICT (codigo) DO NOTHING;

COMMENT ON TABLE public.rh_aval360_competencia IS
  'Competências de DESEMPENHO (comportamento observável). NÃO confundir com '
  'pcs_criterios, que são de enquadramento de CARGO e decidem faixa salarial. '
  'O catálogo inicial é rascunho editável pela equipe.';
