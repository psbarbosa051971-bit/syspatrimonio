CREATE INDEX IF NOT EXISTS bens_codigo_red_sem_zeros_idx ON public.bens ((ltrim(codigo_red,'0')));

CREATE OR REPLACE FUNCTION public.vincular_dados_fornecedor(_itens jsonb)
RETURNS TABLE(codigo_red text, vinculados integer)
LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$
  WITH entrada AS (
    SELECT DISTINCT ON (ltrim(x.codigo_red,'0')) x.*, ltrim(x.codigo_red,'0') AS chave
    FROM jsonb_to_recordset(_itens) AS x(codigo_red text, ano_pedido text, pedido text, ano_empenho text, empenho text, nota_fiscal text, fornecedor text)
    WHERE x.codigo_red IS NOT NULL
  ), atualizados AS (
    UPDATE public.bens b SET
      ano_pedido = NULLIF(e.ano_pedido,''), pedido = NULLIF(e.pedido,''),
      ano_empenho = NULLIF(e.ano_empenho,''), empenho = NULLIF(e.empenho,''),
      nota_fiscal = NULLIF(e.nota_fiscal,''), fornecedor = NULLIF(e.fornecedor,'')
    FROM entrada e
    WHERE ltrim(b.codigo_red,'0') = e.chave
    RETURNING e.chave
  )
  SELECT e.codigo_red, (SELECT count(*)::int FROM atualizados a WHERE a.chave = e.chave)
  FROM entrada e;
$$;
REVOKE ALL ON FUNCTION public.vincular_dados_fornecedor(jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.vincular_dados_fornecedor(jsonb) TO authenticated;