-- Adiciona rolagem, totais em destaque e conclusão da conferência com situação dos bens
-- Aplicada no Lovable Cloud pela extensão, com autorização do usuário.
-- Registrada por GeckoAI em 2026-10-10T21:28:55.120Z

ALTER TABLE public.bens ADD COLUMN IF NOT EXISTS conferencia_finalizada boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.salvar_conferencia(_sala_id uuid, _bens_ids uuid[], _localizados uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.pode_ver_sala(auth.uid(), _sala_id) THEN
    RAISE EXCEPTION 'Sem permissão para salvar a conferência deste local.';
  END IF;
  IF _bens_ids IS NULL OR _localizados IS NULL OR cardinality(_bens_ids) = 0 THEN
    RAISE EXCEPTION 'Nenhum bem informado para conferência.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(_bens_ids) AS item(id)
    WHERE NOT EXISTS (SELECT 1 FROM public.bens b WHERE b.id = item.id AND b.sala_id = _sala_id)
  ) OR EXISTS (
    SELECT 1 FROM unnest(_localizados) AS item(id)
    WHERE item.id IS NULL OR NOT (item.id = ANY(_bens_ids))
  ) THEN
    RAISE EXCEPTION 'A lista de bens mudou. Recarregue o local antes de salvar.';
  END IF;
  UPDATE public.bens
  SET conferido = (id = ANY(_localizados)), conferencia_finalizada = true
  WHERE sala_id = _sala_id AND id = ANY(_bens_ids);
END;
$function$;
REVOKE ALL ON FUNCTION public.salvar_conferencia(uuid, uuid[], uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.salvar_conferencia(uuid, uuid[], uuid[]) TO authenticated;
