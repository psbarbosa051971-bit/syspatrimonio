-- Separa responsável pelo recebimento dos dados automáticos do responsável pela sala
-- Aplicada no Lovable Cloud pela extensão, com autorização do usuário.
-- Registrada por GeckoAI em 2026-10-16T11:53:20.791Z

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
REVOKE ALL ON FUNCTION public.dados_responsavel_sala_termo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dados_responsavel_sala_termo(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.salvar_recebimento_termo(_importacao_id uuid, _recebedor text, _cpf text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _entregador text;
  _snapshot jsonb;
  _sala_id uuid;
  _responsavel jsonb;
  _cpf_limpo text := regexp_replace(coalesce(_cpf, ''), '[^0-9]', '', 'g');
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_edit(auth.uid()) THEN
    RAISE EXCEPTION 'Você não tem permissão para registrar o recebimento.';
  END IF;
  IF length(btrim(coalesce(_recebedor, ''))) < 2 OR length(btrim(_recebedor)) > 200 OR length(_cpf_limpo) <> 11 THEN
    RAISE EXCEPTION 'Informe o responsável pelo recebimento e um CPF com 11 dígitos.';
  END IF;
  SELECT coalesce(nullif(btrim(nome), ''), nullif(btrim(login), ''), nullif(btrim(email), ''))
    INTO _entregador FROM public.profiles WHERE id = auth.uid();
  _entregador := coalesce(_entregador, nullif(auth.jwt()->'user_metadata'->>'nome', ''), nullif(auth.jwt()->'user_metadata'->>'full_name', ''), nullif(auth.jwt()->>'email', ''));
  IF _entregador IS NULL THEN
    RAISE EXCEPTION 'Complete o nome do seu usuário antes de imprimir o termo.';
  END IF;
  SELECT termo_snapshot, sala_id INTO _snapshot, _sala_id FROM public.importacoes WHERE id = _importacao_id FOR UPDATE;
  IF _snapshot IS NULL OR jsonb_typeof(_snapshot) <> 'object' THEN
    RAISE EXCEPTION 'Os dados desta importação não estão disponíveis.';
  END IF;
  _responsavel := public.dados_responsavel_sala_termo(_sala_id);
  _snapshot := _snapshot || _responsavel || jsonb_build_object(
    'responsavel_recebimento', btrim(_recebedor), 'cpf_recebimento', _cpf_limpo,
    'entregador', _entregador, 'entregador_id', auth.uid(),
    'data_termo', to_char(timezone('America/Sao_Paulo', now()), 'DD/MM/YYYY'));
  UPDATE public.importacoes SET termo_snapshot = _snapshot WHERE id = _importacao_id;
  RETURN _snapshot;
END;
$function$;
REVOKE ALL ON FUNCTION public.salvar_recebimento_termo(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.salvar_recebimento_termo(uuid, text, text) TO authenticated;
