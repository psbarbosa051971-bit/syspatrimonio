-- Amplia pesquisa por códigos e palavras e preenche transferência com seleção independente
-- Aplicada no Lovable Cloud pela extensão, com autorização do usuário.
-- Registrada por GeckoAI em 2026-10-12T15:52:36.305Z

CREATE OR REPLACE FUNCTION public.pesquisar_bens_salas(_termo text)
RETURNS TABLE(bem jsonb, local_nome text)
LANGUAGE sql STABLE
SET search_path TO 'pg_catalog', 'public'
AS $function$
  WITH busca AS MATERIALIZED (
    SELECT public.normalizar_texto_pesquisa_bens(_termo) AS termo,
      regexp_split_to_array(btrim(regexp_replace(public.normalizar_texto_pesquisa_bens(_termo), '[^[:alnum:]]+', ' ', 'g')), ' +') AS palavras,
      replace(regexp_replace(_termo, '[[:space:]' || chr(160) || ']+', '', 'g'), '.', '') AS numeros
  ), consulta AS MATERIALIZED (
    SELECT *, CASE WHEN numeros ~ '^[0-9]+(,[0-9]+)+,?$'
      THEN string_to_array(rtrim(numeros, ','), ',') ELSE ARRAY[]::text[] END AS codigos
    FROM busca
  )
  SELECT to_jsonb(b), s.nome
  FROM public.bens b
  JOIN public.salas s ON s.id = b.sala_id
  CROSS JOIN consulta q
  WHERE q.termo <> '' AND (
    (cardinality(q.codigos) > 0 AND replace(b.codigo_red, '.', '') = ANY(q.codigos))
    OR (cardinality(q.codigos) = 0 AND strpos(replace(public.normalizar_texto_pesquisa_bens(b.codigo_red), '.', ''), q.numeros) > 0)
    OR (cardinality(q.codigos) = 0 AND cardinality(q.palavras) > 0 AND q.palavras[1] <> '' AND NOT EXISTS (
      SELECT 1 FROM unnest(q.palavras) AS palavra
      WHERE strpos(public.normalizar_texto_pesquisa_bens(b.descricao), palavra) = 0
    ))
    OR strpos(b.valor::text, q.termo) > 0
    OR strpos(replace(b.valor::text, '.', ','), q.termo) > 0
    OR strpos('r$ ' || translate(to_char(b.valor, 'FM999,999,999,990.00'), ',.', '.,'), q.termo) > 0
  )
  ORDER BY b.codigo_red, b.id;
$function$;
