

























CREATE TABLE IF NOT EXISTS public.kids_codigos_reservados (
  codigo        text        PRIMARY KEY,
  estacao_id    uuid        REFERENCES public.kids_estacoes(id) ON DELETE SET NULL,
  
  
  
  
  estacao_ref   text        NOT NULL,
  sessao_id     uuid        REFERENCES public.kids_sessoes(id) ON DELETE CASCADE,
  status        text        NOT NULL DEFAULT 'reservado'
                            CHECK (status IN ('reservado','usado','descartado')),
  reservado_em  timestamptz NOT NULL DEFAULT now(),
  usado_em      timestamptz,
  checkin_id    uuid        REFERENCES public.kids_checkins(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.kids_codigos_reservados IS
  'Blocos de codigo de seguranca pre-alocados pelo SERVIDOR para o totem usar OFFLINE. '
  'O cliente NUNCA gera codigo: ele saca daqui. E o que torna colisao impossivel por '
  'construcao (offline nao ha INSERT, logo o trigger de unicidade nao roda). '
  'Ver migration 20260902200000.';

COMMENT ON COLUMN public.kids_codigos_reservados.estacao_ref IS
  'Dono do bloco. Um bloco NUNCA e compartilhado entre estacoes — e o que impede '
  'dois totens offline sacarem o mesmo codigo.';

CREATE INDEX IF NOT EXISTS idx_kids_cod_reserv_saque
  ON public.kids_codigos_reservados (estacao_ref, sessao_id)
  WHERE status = 'reservado';

CREATE INDEX IF NOT EXISTS idx_kids_cod_reserv_sessao
  ON public.kids_codigos_reservados (sessao_id);




ALTER TABLE public.kids_codigos_reservados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kids_cod_reserv_service ON public.kids_codigos_reservados;
CREATE POLICY kids_cod_reserv_service ON public.kids_codigos_reservados
  FOR ALL TO service_role USING (true) WITH CHECK (true);










CREATE OR REPLACE FUNCTION public.fn_kids_gerar_codigo_seguranca()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  DECLARE
    chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    
    
    
    
    
    
    v_codigo text;
    tentativa integer := 0;
  BEGIN
    LOOP
      tentativa := tentativa + 1;
      v_codigo := '';

      FOR i IN 1..4 LOOP
        v_codigo := v_codigo || substr(
          chars,
          1 + floor(random() * length(chars))::integer,
          1
        );
      END LOOP;

      EXIT WHEN NOT EXISTS (
        SELECT 1
        FROM public.kids_checkins k
        WHERE k.codigo_seguranca = v_codigo
          AND k.checkout_at IS NULL
          AND k.deleted_at IS NULL
      )
      
      
      
      AND NOT EXISTS (
        SELECT 1
        FROM public.kids_codigos_reservados r
        WHERE r.codigo = v_codigo
          AND r.status = 'reservado'
      );

      IF tentativa >= 100 THEN
        RAISE EXCEPTION
          'Não foi possível gerar código de segurança livre';
      END IF;
    END LOOP;

    RETURN v_codigo;
  END;
  $function$;






CREATE OR REPLACE FUNCTION public.fn_kids_reservar_codigos(
  p_estacao_ref text,
  p_sessao_id   uuid,
  p_quantidade  integer DEFAULT 60,
  p_estacao_id  uuid DEFAULT NULL
)
RETURNS TABLE (codigo text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  DECLARE
    v_falta integer;
    v_novo  text;
    v_i     integer := 0;
  BEGIN
    IF p_estacao_ref IS NULL OR btrim(p_estacao_ref) = '' THEN
      RAISE EXCEPTION 'estacao_ref obrigatorio';
    END IF;
    
    
    IF p_quantidade IS NULL OR p_quantidade < 1 OR p_quantidade > 200 THEN
      RAISE EXCEPTION 'quantidade fora da faixa (1..200)';
    END IF;

    
    
    PERFORM pg_advisory_xact_lock(hashtextextended('kids-reserva:' || p_estacao_ref, 0));

    SELECT p_quantidade - count(*) INTO v_falta
      FROM public.kids_codigos_reservados r
     WHERE r.estacao_ref = p_estacao_ref
       AND r.sessao_id IS NOT DISTINCT FROM p_sessao_id
       AND r.status = 'reservado';

    WHILE v_falta > 0 AND v_i < p_quantidade * 5 LOOP
      v_i := v_i + 1;
      v_novo := public.fn_kids_gerar_codigo_seguranca();
      BEGIN
        INSERT INTO public.kids_codigos_reservados
          (codigo, estacao_id, estacao_ref, sessao_id)
        VALUES (v_novo, p_estacao_id, p_estacao_ref, p_sessao_id);
        v_falta := v_falta - 1;
      EXCEPTION WHEN unique_violation THEN
        
        NULL;
      END;
    END LOOP;

    RETURN QUERY
      SELECT r.codigo
        FROM public.kids_codigos_reservados r
       WHERE r.estacao_ref = p_estacao_ref
         AND r.sessao_id IS NOT DISTINCT FROM p_sessao_id
         AND r.status = 'reservado'
       ORDER BY r.reservado_em;
  END;
  $function$;

REVOKE ALL ON FUNCTION public.fn_kids_reservar_codigos(text, uuid, integer, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_kids_reservar_codigos(text, uuid, integer, uuid) TO service_role;

COMMENT ON FUNCTION public.fn_kids_reservar_codigos(text, uuid, integer, uuid) IS
  'Reserva um bloco de codigos para o totem usar OFFLINE. Idempotente por '
  '(estacao_ref, sessao): completa o bloco ate a quantidade pedida em vez de '
  'emitir de novo. So service_role — a lista de codigos do dia nao pode ser '
  'alcancavel pela chave publica.';
