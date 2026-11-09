-- Importa e salva o valor dos bens no HTML por fornecedor
-- Aplicada no Lovable Cloud pela extensão, com autorização do usuário.
-- Registrada por GeckoAI em 2026-11-09T13:06:51.068Z

CREATE OR REPLACE FUNCTION public.vincular_dados_fornecedor(_itens jsonb)
RETURNS TABLE(codigo_red text, vinculados integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '120s'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_edit(auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissão para vincular dados';
  END IF;
  RETURN QUERY
  WITH entrada AS (
    SELECT DISTINCT ON (ltrim(x.codigo_red,'0')) x.*, ltrim(x.codigo_red,'0') AS chave
    FROM jsonb_to_recordset(_itens) AS x(codigo_red text, ano_pedido text, pedido text, ano_empenho text, empenho text, nota_fiscal text, fornecedor text, valor numeric)
    WHERE x.codigo_red IS NOT NULL
  ), atualizados AS (
    UPDATE public.bens b SET
      ano_pedido = NULLIF(e.ano_pedido,''), pedido = NULLIF(e.pedido,''),
      ano_empenho = NULLIF(e.ano_empenho,''), empenho = NULLIF(e.empenho,''),
      nota_fiscal = NULLIF(e.nota_fiscal,''), fornecedor = NULLIF(e.fornecedor,''),
      valor = COALESCE(e.valor, b.valor)
    FROM entrada e
    WHERE ltrim(b.codigo_red,'0') = e.chave
    RETURNING e.chave
  )
  SELECT e.codigo_red, (SELECT count(*)::int FROM atualizados a WHERE a.chave = e.chave)
  FROM entrada e;
END $function$;

CREATE OR REPLACE FUNCTION public.incluir_bens_fornecedor(_itens jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE n integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_edit(auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissão para incluir bens';
  END IF;
  INSERT INTO public.bens(user_id, sala_id, codigo_red, descricao, ano_pedido, pedido, ano_empenho, empenho, nota_fiscal, fornecedor, valor)
  SELECT DISTINCT ON (ltrim(x.codigo_red,'0')) auth.uid(), NULL, x.codigo_red, coalesce(nullif(btrim(x.descricao),''),'Sem descrição'),
    nullif(x.ano_pedido,''), nullif(x.pedido,''), nullif(x.ano_empenho,''), nullif(x.empenho,''), nullif(x.nota_fiscal,''), nullif(x.fornecedor,''), coalesce(x.valor,0)
  FROM jsonb_to_recordset(_itens) AS x(codigo_red text, descricao text, ano_pedido text, pedido text, ano_empenho text, empenho text, nota_fiscal text, fornecedor text, valor numeric)
  WHERE nullif(btrim(x.codigo_red),'') IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.bens b WHERE ltrim(b.codigo_red,'0') = ltrim(x.codigo_red,'0'));
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $function$;
