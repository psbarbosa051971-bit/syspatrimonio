-- Adiciona confirmação de recebimento após transferência e data atual no termo
-- Aplicada no Lovable Cloud pela extensão, com autorização do usuário.
-- Registrada por GeckoAI em 2026-10-14T11:32:27.942Z

CREATE OR REPLACE FUNCTION public.salvar_recebimento_termo(_importacao_id uuid, _recebedor text, _cpf text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _entregador text;
  _snapshot jsonb;
  _cpf_limpo text := regexp_replace(coalesce(_cpf, ''), '[^0-9]', '', 'g');
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_edit(auth.uid()) THEN
    RAISE EXCEPTION 'Você não tem permissão para registrar o recebimento.';
  END IF;
  IF length(btrim(coalesce(_recebedor, ''))) < 2 OR length(_cpf_limpo) <> 11 THEN
    RAISE EXCEPTION 'Informe o nome do recebedor e um CPF com 11 dígitos.';
  END IF;
  SELECT coalesce(nullif(btrim(nome), ''), nullif(btrim(login), ''), nullif(btrim(email), ''))
    INTO _entregador FROM public.profiles WHERE id = auth.uid();
  _entregador := coalesce(_entregador, nullif(auth.jwt()->'user_metadata'->>'nome', ''), nullif(auth.jwt()->'user_metadata'->>'full_name', ''), nullif(auth.jwt()->>'email', ''));
  IF _entregador IS NULL THEN
    RAISE EXCEPTION 'Complete o nome do seu usuário antes de imprimir o termo.';
  END IF;
  SELECT termo_snapshot INTO _snapshot FROM public.importacoes WHERE id = _importacao_id FOR UPDATE;
  IF _snapshot IS NULL OR jsonb_typeof(_snapshot) <> 'object' THEN
    RAISE EXCEPTION 'Os dados desta importação não estão disponíveis.';
  END IF;
  _snapshot := _snapshot || jsonb_build_object('responsavel', btrim(_recebedor), 'cpf', _cpf_limpo, 'entregador', _entregador, 'entregador_id', auth.uid(), 'data_termo', to_char(timezone('America/Sao_Paulo', now()), 'DD/MM/YYYY'));
  UPDATE public.importacoes SET termo_snapshot = _snapshot WHERE id = _importacao_id;
  RETURN _snapshot;
END;
$function$;
