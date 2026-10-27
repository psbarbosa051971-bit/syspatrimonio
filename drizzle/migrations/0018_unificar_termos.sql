CREATE OR REPLACE FUNCTION public.unificar_termos(_sala uuid, _termos uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  destino public.importacoes%ROWTYPE;
  origem public.importacoes%ROWTYPE;
  novos jsonb;
  movidos integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_edit(auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissão para unificar termos';
  END IF;
  IF _sala IS NULL OR coalesce(cardinality(_termos), 0) <> 2 OR _termos[1] = _termos[2] THEN
    RAISE EXCEPTION 'Selecione exatamente dois termos diferentes';
  END IF;
  PERFORM 1 FROM public.importacoes i WHERE i.id = ANY(_termos) ORDER BY i.id FOR UPDATE;
  IF (SELECT count(*) FROM public.importacoes i WHERE i.id = ANY(_termos) AND i.sala_id = _sala
      AND jsonb_typeof(i.termo_snapshot) = 'object' AND jsonb_typeof(i.termo_snapshot->'bens') = 'array') <> 2 THEN
    RAISE EXCEPTION 'Os dois termos precisam pertencer a esta sala. Atualize a lista';
  END IF;
  SELECT * INTO destino FROM public.importacoes WHERE id = ANY(_termos) ORDER BY numero DESC LIMIT 1;
  SELECT * INTO origem FROM public.importacoes WHERE id = ANY(_termos) AND id <> destino.id;
  PERFORM b.id FROM public.bens b WHERE b.importacao_id = origem.id ORDER BY b.id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.bens b WHERE b.importacao_id = origem.id AND b.sala_id IS DISTINCT FROM _sala) THEN
    RAISE EXCEPTION 'O termo % tem bens em outra sala. Confira as movimentações antes de unificar', lpad(origem.numero::text, 5, '0');
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('codigo_red', b.codigo_red, 'descricao', b.descricao, 'valor', b.valor,
    'incorporacao', b.incorporacao, 'tipo', b.tipo) ORDER BY b.codigo_red), '[]'::jsonb) INTO novos
  FROM public.bens b WHERE b.importacao_id = origem.id
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(destino.termo_snapshot->'bens') item WHERE item->>'codigo_red' = b.codigo_red);
  UPDATE public.importacoes SET termo_snapshot = jsonb_set(termo_snapshot, '{bens}', (termo_snapshot->'bens') || novos)
    WHERE id = destino.id;
  UPDATE public.bens SET importacao_id = destino.id WHERE importacao_id = origem.id;
  GET DIAGNOSTICS movidos = ROW_COUNT;
  UPDATE public.transferencias_bens_itens SET transferencia_id = destino.id, numero = destino.numero, termo_ano = destino.termo_ano
    WHERE transferencia_id = origem.id;
  UPDATE public.transferencias_bens_itens SET origem_importacao_id = destino.id WHERE origem_importacao_id = origem.id;
  DELETE FROM public.entregas_termos WHERE importacao_id = origem.id;
  DELETE FROM public.importacoes WHERE id = origem.id;
  RETURN jsonb_build_object('destino', destino.id, 'numero', destino.numero, 'removido', origem.numero, 'movidos', movidos);
END; $$;
REVOKE ALL ON FUNCTION public.unificar_termos(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unificar_termos(uuid, uuid[]) TO authenticated;