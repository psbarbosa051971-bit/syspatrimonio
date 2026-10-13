-- Impede RED duplicado e confirma movimentação entre salas na importação
-- Aplicada no Lovable Cloud pela extensão, com autorização do usuário.
-- Registrada por GeckoAI em 2026-10-13T16:05:24.570Z

CREATE OR REPLACE FUNCTION public.chave_codigo_red_importacao(_codigo text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path TO 'public'
AS $$ SELECT regexp_replace(btrim(_codigo), '[.[:space:]]', '', 'g') $$;

CREATE INDEX IF NOT EXISTS bens_codigo_red_importacao_idx ON public.bens (public.chave_codigo_red_importacao(codigo_red));

CREATE OR REPLACE FUNCTION public.consultar_bens_importacao(_bens jsonb)
RETURNS TABLE(id uuid, sala_id uuid, codigo_red text, sala_nome text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_edit(auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissão para importar';
  END IF;
  IF jsonb_typeof(_bens) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Lista de bens inválida';
  END IF;
  RETURN QUERY SELECT b.id, b.sala_id, b.codigo_red, coalesce(s.nome, 'Sem sala')
    FROM public.bens b LEFT JOIN public.salas s ON s.id = b.sala_id
    WHERE public.chave_codigo_red_importacao(b.codigo_red) IN (
      SELECT public.chave_codigo_red_importacao(x->>'codigo_red') FROM jsonb_array_elements(_bens) x
    ) ORDER BY b.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.impedir_codigo_red_duplicado()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE chave text; local_existente text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF public.chave_codigo_red_importacao(NEW.codigo_red) = public.chave_codigo_red_importacao(OLD.codigo_red)
      AND NEW.sala_id IS NOT DISTINCT FROM OLD.sala_id THEN RETURN NEW; END IF;
  END IF;
  chave := public.chave_codigo_red_importacao(NEW.codigo_red);
  IF chave IS NULL OR chave = '' THEN RAISE EXCEPTION 'Informe o código RED do bem'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('codigo-red:' || chave, 0));
  SELECT coalesce(s.nome, 'Sem sala') INTO local_existente FROM public.bens b
    LEFT JOIN public.salas s ON s.id = b.sala_id
    WHERE public.chave_codigo_red_importacao(b.codigo_red) = chave AND b.id <> NEW.id LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'O código RED % já existe no local %. Use a importação com confirmação para mover o bem, sem duplicá-lo.', NEW.codigo_red, local_existente;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER impedir_codigo_red_duplicado
BEFORE INSERT OR UPDATE OF codigo_red, sala_id ON public.bens
FOR EACH ROW EXECUTE FUNCTION public.impedir_codigo_red_duplicado();

CREATE OR REPLACE FUNCTION public.importar_bens_html_confirmado(
  _sala_id uuid, _arquivo text, _bens jsonb, _cabecalho jsonb, _existentes jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  itens jsonb; atuais jsonb; esperados jsonb; chave text; escolhido uuid;
  lote_id uuid; resultado jsonb; movidos integer := 0; removidos integer := 0; qtd integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_edit(auth.uid()) THEN RAISE EXCEPTION 'Sem permissão para importar'; END IF;
  IF jsonb_typeof(_bens) IS DISTINCT FROM 'array' OR jsonb_typeof(_existentes) IS DISTINCT FROM 'array' THEN
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
  FOR chave IN SELECT x->>'codigo_red' FROM jsonb_array_elements(itens) x ORDER BY x->>'codigo_red' LOOP
    SELECT b.id INTO escolhido FROM public.bens b WHERE public.chave_codigo_red_importacao(b.codigo_red) = chave
      ORDER BY (b.sala_id IS NOT DISTINCT FROM _sala_id) DESC, b.created_at, b.id LIMIT 1;
    IF escolhido IS NOT NULL THEN
      IF EXISTS (SELECT 1 FROM public.bens WHERE id = escolhido AND sala_id IS DISTINCT FROM _sala_id)
        OR EXISTS (SELECT 1 FROM public.bens WHERE public.chave_codigo_red_importacao(codigo_red) = chave AND sala_id IS DISTINCT FROM _sala_id) THEN
        movidos := movidos + 1;
      END IF;
      UPDATE public.solicitacoes_bens SET ativa = false, updated_at = now()
        WHERE ativa AND bem_id IN (SELECT b.id FROM public.bens b
          WHERE public.chave_codigo_red_importacao(b.codigo_red) = chave AND (b.id <> escolhido OR b.sala_id IS DISTINCT FROM _sala_id));
      DELETE FROM public.bens WHERE public.chave_codigo_red_importacao(codigo_red) = chave AND id <> escolhido;
      GET DIAGNOSTICS qtd = ROW_COUNT;
      removidos := removidos + qtd;
      UPDATE public.bens SET sala_id = _sala_id, importacao_id = null, conferido = false, conferencia_finalizada = false
        WHERE id = escolhido AND sala_id IS DISTINCT FROM _sala_id;
    END IF;
  END LOOP;
  resultado := public.importar_bens_html(_sala_id, _arquivo, itens, _cabecalho);
  lote_id := (resultado->>'importacao_id')::uuid;
  UPDATE public.bens b SET importacao_id = lote_id WHERE b.sala_id = _sala_id AND b.id IN (
    SELECT x.id FROM jsonb_to_recordset(_existentes) AS x(id uuid, sala_id uuid)
    WHERE x.sala_id IS DISTINCT FROM _sala_id
  );
  RETURN resultado || jsonb_build_object('transferidos', movidos, 'duplicatas_removidas', removidos);
END;
$$;

REVOKE ALL ON FUNCTION public.consultar_bens_importacao(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.importar_bens_html_confirmado(uuid, text, jsonb, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consultar_bens_importacao(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.importar_bens_html_confirmado(uuid, text, jsonb, jsonb, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.importar_bens_pdf(_sala_id uuid, _arquivo text, _bens jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'public'
AS $$
DECLARE
  lote public.importacoes%ROWTYPE;
  quantidade integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_edit(auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissão para importar';
  END IF;
  PERFORM id FROM public.salas WHERE id = _sala_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Local não encontrado'; END IF;
  IF jsonb_typeof(_bens) IS DISTINCT FROM 'array' OR jsonb_array_length(_bens) = 0 THEN
    RAISE EXCEPTION 'Nenhum bem encontrado no PDF';
  END IF;
  INSERT INTO public.importacoes(sala_id, user_id, arquivo)
    VALUES (_sala_id, auth.uid(), _arquivo) RETURNING * INTO lote;
  INSERT INTO public.bens(user_id, sala_id, importacao_id, codigo_red, descricao, valor, incorporacao, tipo)
    SELECT auth.uid(), _sala_id, lote.id, public.chave_codigo_red_importacao(b.codigo_red), b.descricao, COALESCE(b.valor, 0), b.incorporacao, b.tipo
    FROM (
      SELECT DISTINCT ON (public.chave_codigo_red_importacao(x.codigo_red)) x.* FROM jsonb_to_recordset(_bens)
        AS x(codigo_red text, descricao text, valor numeric, incorporacao text, tipo text)
      WHERE x.codigo_red IS NOT NULL AND x.descricao IS NOT NULL
      ORDER BY public.chave_codigo_red_importacao(x.codigo_red)
    ) b
    WHERE NOT EXISTS (SELECT 1 FROM public.bens e WHERE e.sala_id = _sala_id
      AND public.chave_codigo_red_importacao(e.codigo_red) = public.chave_codigo_red_importacao(b.codigo_red));
  GET DIAGNOSTICS quantidade = ROW_COUNT;
  RETURN jsonb_build_object('numero', lote.numero, 'novos', quantidade, 'repetidos', jsonb_array_length(_bens) - quantidade);
END;
$$;
