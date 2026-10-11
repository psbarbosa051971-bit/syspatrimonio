-- Adiciona seleção e estorno de bens no relatório de inservíveis
-- Aplicada no Lovable Cloud pela extensão, com autorização do usuário.
-- Registrada por GeckoAI em 2026-10-11T17:11:13.302Z

CREATE OR REPLACE FUNCTION public.estornar_bens_inserviveis(_solicitacoes uuid[], _sala_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _quantidade integer;
  _validos integer;
BEGIN
  IF auth.uid() IS NULL OR _sala_id IS NULL OR NOT public.pode_ver_sala(auth.uid(), _sala_id) THEN
    RAISE EXCEPTION 'Você não tem permissão para estornar bens deste local.';
  END IF;
  _quantidade := cardinality(_solicitacoes);
  IF _quantidade IS NULL OR _quantidade < 1 OR _quantidade > 1000 OR EXISTS (SELECT 1 FROM unnest(_solicitacoes) AS ids(id) WHERE id IS NULL) OR (SELECT count(DISTINCT id) FROM unnest(_solicitacoes) AS ids(id)) <> _quantidade THEN
    RAISE EXCEPTION 'Selecione de 1 a 1000 bens distintos para estornar.';
  END IF;
  PERFORM b.id FROM public.bens b
    WHERE b.id IN (SELECT s.bem_id FROM public.solicitacoes_bens s WHERE s.id = ANY(_solicitacoes))
    ORDER BY b.id FOR UPDATE;
  PERFORM s.id FROM public.solicitacoes_bens s WHERE s.id = ANY(_solicitacoes) ORDER BY s.id FOR UPDATE;
  SELECT count(*) INTO _validos FROM public.solicitacoes_bens s
    JOIN public.bens b ON b.id = s.bem_id
    WHERE s.id = ANY(_solicitacoes) AND s.ativa AND s.tipo = 'inservivel'
      AND s.sala_id = _sala_id AND b.sala_id = _sala_id;
  IF _validos <> _quantidade THEN
    RAISE EXCEPTION 'Algum bem não está mais pendente como inservível neste local. Feche e abra novamente o relatório antes de tentar de novo.';
  END IF;
  UPDATE public.solicitacoes_bens SET ativa = false, updated_at = clock_timestamp()
    WHERE id = ANY(_solicitacoes) AND ativa AND tipo = 'inservivel' AND sala_id = _sala_id;
  RETURN _quantidade;
END;
$function$;
REVOKE ALL ON FUNCTION public.estornar_bens_inserviveis(uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.estornar_bens_inserviveis(uuid[], uuid) TO authenticated;
