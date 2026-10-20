CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
CREATE INDEX IF NOT EXISTS bens_codigo_red_sem_ponto_idx ON public.bens ((replace(codigo_red, '.', '')));
CREATE INDEX IF NOT EXISTS bens_codigo_red_trgm_idx ON public.bens USING gin ((replace(codigo_red, '.', '')) extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS bens_descricao_norm_trgm_idx ON public.bens USING gin ((public.normalizar_texto_pesquisa_bens(descricao)) extensions.gin_trgm_ops);

CREATE OR REPLACE FUNCTION public.pesquisar_bens_salas(_termo text)
RETURNS TABLE(bem jsonb, local_nome text)
LANGUAGE plpgsql STABLE
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE
  termo text := public.normalizar_texto_pesquisa_bens(_termo);
  numeros text := replace(regexp_replace(coalesce(_termo, ''), '[[:space:]' || chr(160) || ']+', '', 'g'), '.', '');
  codigos text[];
  palavras text[];
BEGIN
  IF termo = '' THEN RETURN; END IF;
  IF numeros ~ '^[0-9]+(,[0-9]+)+,?$' THEN
    codigos := string_to_array(rtrim(numeros, ','), ',');
    RETURN QUERY SELECT to_jsonb(b), s.nome FROM public.bens b JOIN public.salas s ON s.id = b.sala_id
      WHERE replace(b.codigo_red, '.', '') = ANY(codigos) ORDER BY b.codigo_red, b.id;
    RETURN;
  END IF;
  IF numeros ~ '^[0-9]+$' THEN
    -- Código exato primeiro (índice); se não houver, procura trecho do código.
    RETURN QUERY SELECT to_jsonb(b), s.nome FROM public.bens b JOIN public.salas s ON s.id = b.sala_id
      WHERE replace(b.codigo_red, '.', '') = numeros ORDER BY b.id;
    IF FOUND THEN RETURN; END IF;
    RETURN QUERY SELECT to_jsonb(b), s.nome FROM public.bens b JOIN public.salas s ON s.id = b.sala_id
      WHERE replace(b.codigo_red, '.', '') LIKE '%' || numeros || '%'
      ORDER BY b.codigo_red, b.id;
    RETURN;
  END IF;
  palavras := array_remove(regexp_split_to_array(btrim(regexp_replace(termo, '[^[:alnum:]]+', ' ', 'g')), ' +'), '');
  RETURN QUERY SELECT to_jsonb(b), s.nome FROM public.bens b JOIN public.salas s ON s.id = b.sala_id
    WHERE (cardinality(palavras) > 0 AND NOT EXISTS (
        SELECT 1 FROM unnest(palavras) p WHERE public.normalizar_texto_pesquisa_bens(b.descricao) NOT LIKE '%' || p || '%'))
      OR replace(lower(b.codigo_red), '.', '') LIKE '%' || numeros || '%'
      OR strpos(replace(b.valor::text, '.', ','), termo) > 0
      OR strpos(b.valor::text, termo) > 0
      OR strpos('r$ ' || translate(to_char(b.valor, 'FM999,999,999,990.00'), ',.', '.,'), termo) > 0
    ORDER BY b.codigo_red, b.id;
END;
$function$;
REVOKE ALL ON FUNCTION public.pesquisar_bens_salas(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pesquisar_bens_salas(text) TO authenticated;