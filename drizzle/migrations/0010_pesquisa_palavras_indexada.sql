CREATE OR REPLACE FUNCTION public.pesquisar_bens_salas(_termo text)
RETURNS TABLE(bem jsonb, local_nome text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE
  uid uuid := auth.uid();
  todas boolean;
  permitidas uuid[];
  termo text := public.normalizar_texto_pesquisa_bens(_termo);
  numeros text := replace(regexp_replace(coalesce(_termo, ''), '[[:space:]' || chr(160) || ']+', '', 'g'), '.', '');
  codigos text[];
  palavras text[];
  padroes text[];
BEGIN
  IF uid IS NULL OR termo = '' THEN RETURN; END IF;
  -- Mesmas regras de acesso das salas, verificadas uma única vez por pesquisa.
  todas := public.can_edit(uid);
  IF NOT todas THEN
    SELECT coalesce(array_agg(sala_id), ARRAY[]::uuid[]) INTO permitidas FROM public.user_salas WHERE user_id = uid;
    IF cardinality(permitidas) = 0 THEN RETURN; END IF;
  END IF;

  IF numeros ~ '^[0-9]+(,[0-9]+)+,?$' THEN
    codigos := string_to_array(rtrim(numeros, ','), ',');
    RETURN QUERY SELECT to_jsonb(b), s.nome FROM public.bens b JOIN public.salas s ON s.id = b.sala_id
      WHERE replace(b.codigo_red, '.', '') = ANY(codigos) AND (todas OR b.sala_id = ANY(permitidas))
      ORDER BY b.codigo_red, b.id;
    RETURN;
  END IF;
  IF numeros ~ '^[0-9]+$' THEN
    RETURN QUERY SELECT to_jsonb(b), s.nome FROM public.bens b JOIN public.salas s ON s.id = b.sala_id
      WHERE replace(b.codigo_red, '.', '') = numeros AND (todas OR b.sala_id = ANY(permitidas))
      ORDER BY b.id;
    IF FOUND THEN RETURN; END IF;
    RETURN QUERY SELECT to_jsonb(b), s.nome FROM public.bens b JOIN public.salas s ON s.id = b.sala_id
      WHERE replace(b.codigo_red, '.', '') LIKE '%' || numeros || '%' AND (todas OR b.sala_id = ANY(permitidas))
      ORDER BY b.codigo_red, b.id;
    RETURN;
  END IF;

  palavras := array_remove(regexp_split_to_array(btrim(regexp_replace(termo, '[^[:alnum:]]+', ' ', 'g')), ' +'), '');
  IF termo ~ '[[:alpha:]]' AND cardinality(palavras) > 0 THEN
    SELECT array_agg('%' || p || '%') INTO padroes FROM unnest(palavras) p;
    RETURN QUERY SELECT to_jsonb(b), s.nome FROM public.bens b JOIN public.salas s ON s.id = b.sala_id
      WHERE (todas OR b.sala_id = ANY(permitidas)) AND (
        (public.normalizar_texto_pesquisa_bens(b.descricao) LIKE padroes[1]
          AND public.normalizar_texto_pesquisa_bens(b.descricao) LIKE ALL (padroes))
        OR replace(b.codigo_red, '.', '') LIKE '%' || upper(numeros) || '%'
        OR replace(b.codigo_red, '.', '') LIKE '%' || numeros || '%')
      ORDER BY b.codigo_red, b.id;
    RETURN;
  END IF;

  -- Valores em reais (ex.: 1.250,75 ou R$ 1.250,75).
  RETURN QUERY SELECT to_jsonb(b), s.nome FROM public.bens b JOIN public.salas s ON s.id = b.sala_id
    WHERE (todas OR b.sala_id = ANY(permitidas)) AND (
      strpos(replace(b.valor::text, '.', ','), termo) > 0
      OR strpos(b.valor::text, termo) > 0
      OR strpos('r$ ' || translate(to_char(b.valor, 'FM999,999,999,990.00'), ',.', '.,'), termo) > 0)
    ORDER BY b.codigo_red, b.id;
END;
$function$;
REVOKE ALL ON FUNCTION public.pesquisar_bens_salas(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pesquisar_bens_salas(text) TO authenticated;