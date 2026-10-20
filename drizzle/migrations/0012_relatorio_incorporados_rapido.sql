CREATE OR REPLACE FUNCTION public.data_br_segura(_t text) RETURNS date LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
BEGIN
  IF _t !~ '^\d{2}/\d{2}/\d{4}$' THEN RETURN NULL; END IF;
  RETURN make_date(substr(_t,7,4)::int, substr(_t,4,2)::int, substr(_t,1,2)::int);
EXCEPTION WHEN others THEN RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.demonstrativo_bens_incorporados(_inicio date, _fim date)
RETURNS TABLE(tipo text, quantidade bigint, sem_codigo bigint, total numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH salas_ok AS (
    SELECT s.id FROM public.salas s WHERE auth.uid() IS NOT NULL AND public.pode_ver_sala(auth.uid(), s.id)
  )
  SELECT coalesce(nullif(trim(b.tipo), ''), 'Outras') AS tipo,
         count(*) AS quantidade,
         count(*) FILTER (WHERE coalesce(trim(b.codigo_red::text), '') = '') AS sem_codigo,
         coalesce(sum(b.valor), 0)::numeric AS total
  FROM public.bens b
  JOIN salas_ok so ON so.id = b.sala_id
  WHERE public.data_br_segura(b.incorporacao) BETWEEN _inicio AND _fim
  GROUP BY 1
$$;
REVOKE EXECUTE ON FUNCTION public.demonstrativo_bens_incorporados(date,date) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.demonstrativo_bens_incorporados(date,date) TO authenticated;