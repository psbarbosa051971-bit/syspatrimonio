CREATE OR REPLACE FUNCTION public.incluir_bens_fornecedor(_itens jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_edit(auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissão para incluir bens';
  END IF;
  INSERT INTO public.bens(user_id, sala_id, codigo_red, descricao, ano_pedido, pedido, ano_empenho, empenho, nota_fiscal, fornecedor)
  SELECT DISTINCT ON (ltrim(x.codigo_red,'0')) auth.uid(), NULL, x.codigo_red, coalesce(nullif(btrim(x.descricao),''),'Sem descrição'),
    nullif(x.ano_pedido,''), nullif(x.pedido,''), nullif(x.ano_empenho,''), nullif(x.empenho,''), nullif(x.nota_fiscal,''), nullif(x.fornecedor,'')
  FROM jsonb_to_recordset(_itens) AS x(codigo_red text, descricao text, ano_pedido text, pedido text, ano_empenho text, empenho text, nota_fiscal text, fornecedor text)
  WHERE nullif(btrim(x.codigo_red),'') IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.bens b WHERE ltrim(b.codigo_red,'0') = ltrim(x.codigo_red,'0'));
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.incluir_bens_fornecedor(jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.incluir_bens_fornecedor(jsonb) TO authenticated;