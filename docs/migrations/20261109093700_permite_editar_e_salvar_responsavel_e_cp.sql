-- Permite editar e salvar responsável e CPF diretamente em Bens da sala
-- Aplicada no Lovable Cloud pela extensão, com autorização do usuário.
-- Registrada por GeckoAI em 2026-11-09T12:37:00.196Z

ALTER TABLE public.salas ADD COLUMN IF NOT EXISTS cpf_responsavel text;
COMMENT ON COLUMN public.salas.cpf_responsavel IS 'CPF informado diretamente no cadastro do responsável da sala; nulo mantém a consulta ao usuário vinculado.';

ALTER TABLE public.salas ADD COLUMN IF NOT EXISTS cpf_responsavel text;
CREATE OR REPLACE FUNCTION public.dados_responsavel_sala_termo(_sala_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _sala public.salas%ROWTYPE;
  _nome text;
  _cpf text;
  _nome_sala text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_edit(auth.uid()) THEN
    RAISE EXCEPTION 'Você não tem permissão para consultar o responsável pela sala.';
  END IF;
  SELECT * INTO _sala FROM public.salas WHERE id = _sala_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sala não encontrada.'; END IF;
  IF _sala.cpf_responsavel IS NOT NULL THEN
    RETURN jsonb_build_object('responsavel', coalesce(_sala.responsavel, ''), 'cpf', _sala.cpf_responsavel);
  END IF;
  _nome_sala := nullif(btrim(_sala.responsavel), '');
  SELECT p.nome, p.cpf INTO _nome, _cpf
    FROM public.user_salas us JOIN public.profiles p ON p.id = us.user_id
    WHERE us.sala_id = _sala_id AND nullif(btrim(p.nome), '') IS NOT NULL
    ORDER BY (lower(btrim(p.nome)) = lower(coalesce(_nome_sala, ''))) DESC, p.created_at DESC, p.id
    LIMIT 1;
  IF _nome_sala IS NOT NULL AND lower(btrim(coalesce(_nome, ''))) <> lower(_nome_sala) THEN
    _cpf := '';
  END IF;
  RETURN jsonb_build_object('responsavel', coalesce(_nome_sala, _nome, ''), 'cpf', coalesce(_cpf, ''));
END;
$function$;
