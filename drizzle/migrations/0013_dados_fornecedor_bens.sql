ALTER TABLE public.bens
  ADD COLUMN IF NOT EXISTS ano_pedido text,
  ADD COLUMN IF NOT EXISTS pedido text,
  ADD COLUMN IF NOT EXISTS ano_empenho text,
  ADD COLUMN IF NOT EXISTS empenho text,
  ADD COLUMN IF NOT EXISTS nota_fiscal text,
  ADD COLUMN IF NOT EXISTS fornecedor text;

CREATE OR REPLACE FUNCTION public.vincular_dados_fornecedor(_itens jsonb)
RETURNS TABLE(codigo_red text, vinculados integer)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE i jsonb; n integer;
BEGIN
  FOR i IN SELECT * FROM jsonb_array_elements(_itens) LOOP
    UPDATE public.bens b SET
      ano_pedido = NULLIF(i->>'ano_pedido',''),
      pedido = NULLIF(i->>'pedido',''),
      ano_empenho = NULLIF(i->>'ano_empenho',''),
      empenho = NULLIF(i->>'empenho',''),
      nota_fiscal = NULLIF(i->>'nota_fiscal',''),
      fornecedor = NULLIF(i->>'fornecedor','')
    WHERE ltrim(b.codigo_red,'0') = ltrim(i->>'codigo_red','0');
    GET DIAGNOSTICS n = ROW_COUNT;
    codigo_red := i->>'codigo_red'; vinculados := n; RETURN NEXT;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.vincular_dados_fornecedor(jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.vincular_dados_fornecedor(jsonb) TO authenticated;