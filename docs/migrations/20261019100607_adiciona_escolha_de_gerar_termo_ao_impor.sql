-- Adiciona escolha de gerar termo ao importar HTML
-- Aplicada no Lovable Cloud pela extensão, com autorização do usuário.
-- Registrada por GeckoAI em 2026-10-19T13:06:07.484Z

CREATE OR REPLACE FUNCTION public.importar_bens_html_com_opcao(
  _sala_id uuid, _arquivo text, _bens jsonb, _cabecalho jsonb, _existentes jsonb, _gerar_termo boolean
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  itens jsonb;
  atuais jsonb;
  esperados jsonb;
  chave text;
  novos integer := 0;
  movidos integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_edit(auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissão para importar';
  END IF;
  IF _gerar_termo IS NULL THEN RAISE EXCEPTION 'Escolha se deseja gerar um termo'; END IF;
  IF _gerar_termo THEN
    RETURN public.importar_bens_html_confirmado(_sala_id, _arquivo, _bens, _cabecalho, _existentes);
  END IF;
  IF jsonb_typeof(_bens) IS DISTINCT FROM 'array' OR jsonb_typeof(_existentes) IS DISTINCT FROM 'array'
    OR jsonb_typeof(_cabecalho) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Dados da confirmação inválidos';
  END IF;
  IF jsonb_array_length(_bens) = 0 OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(_bens) b WHERE jsonb_typeof(b) IS DISTINCT FROM 'object'
      OR nullif(public.chave_codigo_red_importacao(b->>'codigo_red'), '') IS NULL
      OR nullif(btrim(b->>'descricao'), '') IS NULL OR jsonb_typeof(b->'valor') IS DISTINCT FROM 'number'
  ) THEN RAISE EXCEPTION 'O HTML contém dados de bens inválidos'; END IF;
  SELECT jsonb_agg(item ORDER BY codigo) INTO itens FROM (
    SELECT DISTINCT ON (public.chave_codigo_red_importacao(b->>'codigo_red'))
      public.chave_codigo_red_importacao(b->>'codigo_red') AS codigo,
      b || jsonb_build_object('codigo_red', public.chave_codigo_red_importacao(b->>'codigo_red')) AS item
    FROM jsonb_array_elements(_bens) WITH ORDINALITY AS x(b, ordem)
    ORDER BY public.chave_codigo_red_importacao(b->>'codigo_red'), ordem
  ) t;
  FOR chave IN SELECT x->>'codigo_red' FROM jsonb_array_elements(itens) x ORDER BY x->>'codigo_red' LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('codigo-red:' || chave, 0));
  END LOOP;
  PERFORM s.id FROM public.salas s WHERE s.id = _sala_id OR s.id IN (
    SELECT b.sala_id FROM public.bens b WHERE public.chave_codigo_red_importacao(b.codigo_red) IN (
      SELECT x->>'codigo_red' FROM jsonb_array_elements(itens) x
    )
  ) ORDER BY s.id FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM public.salas WHERE id = _sala_id) THEN RAISE EXCEPTION 'Local de destino não encontrado'; END IF;
  PERFORM b.id FROM public.bens b WHERE public.chave_codigo_red_importacao(b.codigo_red) IN (
    SELECT x->>'codigo_red' FROM jsonb_array_elements(itens) x
  ) ORDER BY b.id FOR UPDATE;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'sala_id', b.sala_id,
    'codigo_red', public.chave_codigo_red_importacao(b.codigo_red)) ORDER BY b.id), '[]'::jsonb)
    INTO atuais FROM public.bens b WHERE public.chave_codigo_red_importacao(b.codigo_red) IN (
      SELECT x->>'codigo_red' FROM jsonb_array_elements(itens) x
    );
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'sala_id', x.sala_id,
    'codigo_red', public.chave_codigo_red_importacao(x.codigo_red)) ORDER BY x.id), '[]'::jsonb)
    INTO esperados FROM jsonb_to_recordset(_existentes) AS x(id uuid, sala_id uuid, codigo_red text);
  IF atuais IS DISTINCT FROM esperados THEN
    RAISE EXCEPTION 'A localização de um dos bens mudou. Nenhum bem foi importado. Importe o arquivo novamente para conferir o aviso atualizado.';
  END IF;
  UPDATE public.solicitacoes_bens SET ativa = false, updated_at = now()
    WHERE ativa AND bem_id IN (
      SELECT b.id FROM public.bens b WHERE b.sala_id IS DISTINCT FROM _sala_id
        AND public.chave_codigo_red_importacao(b.codigo_red) IN (SELECT x->>'codigo_red' FROM jsonb_array_elements(itens) x)
    );
  UPDATE public.bens b SET sala_id = _sala_id, importacao_id = null, conferido = false, conferencia_finalizada = false
    WHERE b.sala_id IS DISTINCT FROM _sala_id
      AND public.chave_codigo_red_importacao(b.codigo_red) IN (SELECT x->>'codigo_red' FROM jsonb_array_elements(itens) x);
  GET DIAGNOSTICS movidos = ROW_COUNT;
  INSERT INTO public.bens(user_id, sala_id, codigo_red, descricao, valor, incorporacao, tipo)
    SELECT auth.uid(), _sala_id, x.codigo_red, x.descricao, x.valor, x.incorporacao, x.tipo
    FROM jsonb_to_recordset(itens) AS x(codigo_red text, descricao text, valor numeric, incorporacao text, tipo text)
    WHERE NOT EXISTS (SELECT 1 FROM public.bens b WHERE public.chave_codigo_red_importacao(b.codigo_red) = x.codigo_red);
  GET DIAGNOSTICS novos = ROW_COUNT;
  RETURN jsonb_build_object('importacao_id', null, 'numero', null, 'termo_numero', null,
    'novos', novos, 'repetidos', jsonb_array_length(itens) - novos, 'transferidos', movidos);
END;
$function$;
REVOKE ALL ON FUNCTION public.importar_bens_html_com_opcao(uuid,text,jsonb,jsonb,jsonb,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.importar_bens_html_com_opcao(uuid,text,jsonb,jsonb,jsonb,boolean) TO authenticated;
