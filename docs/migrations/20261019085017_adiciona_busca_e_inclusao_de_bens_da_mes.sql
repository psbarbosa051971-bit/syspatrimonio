-- Adiciona busca e inclusão de bens da mesma sala em termos existentes
-- Aplicada no Lovable Cloud pela extensão, com autorização do usuário.
-- Registrada por GeckoAI em 2026-10-19T11:50:17.662Z

CREATE OR REPLACE FUNCTION public.incluir_bens_no_termo(_termo uuid, _sala uuid, _itens uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  documento jsonb;
  novos jsonb;
  quantidade integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_edit(auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissão para incluir bens em termos';
  END IF;
  quantidade := coalesce(cardinality(_itens), 0);
  IF quantidade < 1 OR quantidade > 500 OR (SELECT count(DISTINCT x) FROM unnest(_itens) x) <> quantidade THEN
    RAISE EXCEPTION 'Selecione de 1 a 500 bens diferentes';
  END IF;
  PERFORM s.id FROM public.salas s WHERE s.id = _sala FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sala não encontrada'; END IF;
  PERFORM b.id FROM public.bens b WHERE b.id = ANY(_itens) ORDER BY b.id FOR UPDATE;
  SELECT i.termo_snapshot INTO documento FROM public.importacoes i
    WHERE i.id = _termo AND i.sala_id = _sala FOR UPDATE;
  IF NOT FOUND OR documento IS NULL OR jsonb_typeof(documento) <> 'object'
    OR jsonb_typeof(documento->'bens') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'O termo não possui documento válido nesta sala';
  END IF;
  IF jsonb_array_length(documento->'bens') = 0 THEN
    RAISE EXCEPTION 'Os dados deste termo não estão disponíveis';
  END IF;
  IF (SELECT count(*) FROM public.bens b WHERE b.id = ANY(_itens) AND b.sala_id = _sala) <> quantidade THEN
    RAISE EXCEPTION 'Um dos bens foi removido ou mudou de sala. Atualize a busca antes de incluir';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'codigo_red', b.codigo_red, 'descricao', b.descricao, 'valor', b.valor,
    'incorporacao', b.incorporacao, 'tipo', b.tipo
  ) ORDER BY b.codigo_red), '[]'::jsonb) INTO novos
    FROM public.bens b WHERE b.id = ANY(_itens)
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(documento->'bens') item
      WHERE item->>'codigo_red' = b.codigo_red);
  UPDATE public.importacoes SET termo_snapshot = jsonb_set(documento, '{bens}', (documento->'bens') || novos)
    WHERE id = _termo AND sala_id = _sala;
  UPDATE public.bens SET importacao_id = _termo
    WHERE id = ANY(_itens) AND sala_id = _sala AND importacao_id IS DISTINCT FROM _termo;
  RETURN jsonb_build_object('quantidade', quantidade);
END;
$function$;
REVOKE ALL ON FUNCTION public.incluir_bens_no_termo(uuid, uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.incluir_bens_no_termo(uuid, uuid, uuid[]) TO authenticated;
