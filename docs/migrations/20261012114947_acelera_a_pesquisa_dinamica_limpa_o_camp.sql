-- Acelera a pesquisa dinâmica, limpa o campo e ajusta o cabeçalho dos bens
-- Aplicada no Lovable Cloud pela extensão, com autorização do usuário.
-- Registrada por GeckoAI em 2026-10-12T14:49:47.268Z

CREATE OR REPLACE FUNCTION public.normalizar_texto_pesquisa_bens(_texto text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog
AS $function$
  SELECT lower(btrim(regexp_replace(
    regexp_replace(normalize(coalesce(_texto, ''), NFD), U&'[\0300-\036f]', '', 'g'),
    '[[:space:]' || chr(160) || ']+', ' ', 'g'
  )));
$function$;

CREATE OR REPLACE FUNCTION public.pesquisar_bens_salas(_termo text)
RETURNS TABLE (bem jsonb, local_nome text)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
  WITH busca AS MATERIALIZED (
    SELECT public.normalizar_texto_pesquisa_bens(_termo) AS termo
  )
  SELECT to_jsonb(b), s.nome
  FROM public.bens b
  JOIN public.salas s ON s.id = b.sala_id
  CROSS JOIN busca q
  WHERE q.termo <> '' AND (
    strpos(public.normalizar_texto_pesquisa_bens(b.codigo_red), q.termo) > 0
    OR strpos(public.normalizar_texto_pesquisa_bens(b.descricao), q.termo) > 0
    OR strpos(b.valor::text, q.termo) > 0
    OR strpos(replace(b.valor::text, '.', ','), q.termo) > 0
    OR strpos('r$ ' || translate(to_char(b.valor, 'FM999,999,999,990.00'), ',.', '.,'), q.termo) > 0
  )
  ORDER BY b.codigo_red, b.id;
$function$;

REVOKE ALL ON FUNCTION public.normalizar_texto_pesquisa_bens(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.normalizar_texto_pesquisa_bens(text) TO authenticated;
REVOKE ALL ON FUNCTION public.pesquisar_bens_salas(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pesquisar_bens_salas(text) TO authenticated;
