



















CREATE TABLE IF NOT EXISTS public.assistente_conversa_temas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canal text NOT NULL CHECK (canal IN ('video', 'texto')),
  conversa_hash text NOT NULL,
  dia date NOT NULL,
  tela_rotulo text CHECK (tela_rotulo IS NULL OR char_length(tela_rotulo) <= 80),
  tema text,
  tipo text,
  resolvido text CHECK (resolvido IS NULL OR resolvido IN ('sim', 'parcial', 'nao', 'indefinido')),
  resumo text CHECK (resumo IS NULL OR char_length(resumo) <= 160),
  sensivel_descartado boolean NOT NULL DEFAULT false,
  duracao_s integer CHECK (duracao_s IS NULL OR duracao_s >= 0),
  n_turnos integer CHECK (n_turnos IS NULL OR n_turnos >= 0),
  status text NOT NULL CHECK (status IN ('classificado', 'descartado', 'erro')),
  erro text CHECK (erro IS NULL OR char_length(erro) <= 120),
  modelo text,
  tokens_in integer,
  tokens_out integer,
  versao_temas integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'assistente_conversa_temas_conversa_uk'
       AND conrelid = 'public.assistente_conversa_temas'::regclass
  ) THEN
    ALTER TABLE public.assistente_conversa_temas
      ADD CONSTRAINT assistente_conversa_temas_conversa_uk UNIQUE (canal, conversa_hash);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_assistente_conversa_temas_dia
  ON public.assistente_conversa_temas (dia);

ALTER TABLE public.assistente_conversa_temas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.assistente_conversa_temas FROM anon, authenticated;

DROP POLICY IF EXISTS assistente_conversa_temas_service ON public.assistente_conversa_temas;
CREATE POLICY assistente_conversa_temas_service ON public.assistente_conversa_temas
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.assistente_conversa_temas IS
  'Temas das conversas do assistente em vídeo (Tavus). Sem coluna de pessoa e sem transcrição, por desenho: finalidade = melhorar o manual e as telas; análise por pessoa é proibida (monitoramento de desempenho). Retenção 12 meses via cron de notificações. Só service_role.';
