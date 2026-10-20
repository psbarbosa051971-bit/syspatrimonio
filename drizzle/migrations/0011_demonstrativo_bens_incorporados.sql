CREATE OR REPLACE FUNCTION public.demonstrativo_bens_incorporados(_inicio date, _fim date)
RETURNS TABLE(tipo text, quantidade bigint, sem_codigo bigint, total numeric)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT coalesce(nullif(trim(b.tipo), ''), 'Outras') AS tipo,
         count(*) AS quantidade,
         count(*) FILTER (WHERE coalesce(trim(b.codigo_red::text), '') = '') AS sem_codigo,
         coalesce(sum(b.valor), 0)::numeric AS total
  FROM public.bens b
  WHERE b.incorporacao ~ '^\d{2}/\d{2}/\d{4}$'
    AND to_date(b.incorporacao, 'DD/MM/YYYY') BETWEEN _inicio AND _fim
  GROUP BY 1
$$;
GRANT EXECUTE ON FUNCTION public.demonstrativo_bens_incorporados(date, date) TO authenticated;