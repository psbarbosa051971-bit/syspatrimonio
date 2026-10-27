CREATE OR REPLACE FUNCTION public.bem_em_outro_termo_da_sala(_sala uuid, _itens uuid[], _termo_atual uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT jsonb_build_object('codigo_red', b.codigo_red, 'termo', lpad(i.numero::text, 5, '0'))
  FROM public.bens b
  JOIN public.importacoes i ON i.sala_id = _sala AND i.id IS DISTINCT FROM _termo_atual
   AND jsonb_typeof(i.termo_snapshot->'bens') = 'array'
   AND EXISTS (SELECT 1 FROM jsonb_array_elements(i.termo_snapshot->'bens') it
               WHERE ltrim(it->>'codigo_red','0') = ltrim(b.codigo_red,'0'))
  WHERE b.id = ANY(_itens)
    AND NOT EXISTS (
      SELECT 1 FROM public.transferencias_bens_itens t
      WHERE t.bem_id = b.id AND t.destino_sala_id = _sala AND t.estornado_em IS NULL
        AND t.origem_sala_id IS DISTINCT FROM _sala AND t.created_at > i.created_at)
  ORDER BY i.numero LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.bem_em_outro_termo_da_sala(uuid, uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bem_em_outro_termo_da_sala(uuid, uuid[], uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.criar_termo_bens_sala(_sala uuid, _itens uuid[], _pedido uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  local_sala public.salas%ROWTYPE;
  dept public.departamentos%ROWTYPE;
  lote public.importacoes%ROWTYPE;
  quantidade integer;
  itens_snapshot jsonb;
  responsavel jsonb;
  conflito jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_edit(auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissão para criar termos de responsabilidade';
  END IF;
  IF _sala IS NULL OR _pedido IS NULL OR NOT public.pode_ver_sala(auth.uid(), _sala) THEN
    RAISE EXCEPTION 'Selecione uma sala disponível para sua conta';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(_pedido::text, 0));
  SELECT * INTO lote FROM public.importacoes WHERE id = _pedido;
  IF FOUND THEN
    IF lote.user_id IS DISTINCT FROM auth.uid() OR lote.sala_id IS DISTINCT FROM _sala OR lote.termo_snapshot->>'tipo_documento' IS DISTINCT FROM 'novo_termo' THEN
      RAISE EXCEPTION 'Pedido inválido';
    END IF;
    RETURN to_jsonb(lote);
  END IF;
  quantidade := coalesce(cardinality(_itens), 0);
  IF quantidade < 1 OR quantidade > 500 THEN
    RAISE EXCEPTION 'Selecione de 1 a 500 bens por termo';
  END IF;
  IF (SELECT count(DISTINCT id) FROM unnest(_itens) AS t(id)) <> quantidade THEN
    RAISE EXCEPTION 'Lista de bens inválida ou repetida';
  END IF;
  SELECT * INTO local_sala FROM public.salas WHERE id = _sala FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sala não encontrada'; END IF;
  PERFORM b.id FROM public.bens b WHERE b.id = ANY(_itens) ORDER BY b.id FOR SHARE;
  IF (SELECT count(*) FROM public.bens b WHERE b.id = ANY(_itens) AND b.sala_id = _sala) <> quantidade THEN
    RAISE EXCEPTION 'Um bem foi removido ou não está nesta sala. Atualize a lista e selecione novamente';
  END IF;
  conflito := public.bem_em_outro_termo_da_sala(_sala, _itens, _pedido);
  IF conflito IS NOT NULL THEN
    RAISE EXCEPTION 'O bem % já está no termo % desta sala. Um bem só pode estar em outro termo da mesma sala se tiver ido para outra sala e retornado depois', conflito->>'codigo_red', conflito->>'termo';
  END IF;
  SELECT * INTO dept FROM public.departamentos WHERE id = local_sala.departamento_id;
  responsavel := public.dados_responsavel_sala_termo(_sala);
  SELECT jsonb_agg(jsonb_build_object('codigo_red', b.codigo_red, 'descricao', b.descricao,
    'valor', b.valor, 'incorporacao', b.incorporacao, 'tipo', b.tipo) ORDER BY b.codigo_red)
    INTO itens_snapshot FROM public.bens b WHERE b.id = ANY(_itens);
  INSERT INTO public.importacoes(id, sala_id, user_id, arquivo, termo_ano, termo_snapshot)
  VALUES (_pedido, _sala, auth.uid(), 'Novo termo de responsabilidade',
    extract(year FROM timezone('America/Sao_Paulo', now()))::integer,
    jsonb_build_object('tipo_documento', 'novo_termo', 'bem_ids', to_jsonb(_itens),
      'local', local_sala.nome, 'endereco', coalesce(local_sala.endereco, ''),
      'historico', 'Termo de responsabilidade de ' || quantidade || ' bem(ns) já pertencente(s) ao Local Físico. Sem movimentação patrimonial.',
      'data_origem', to_char(timezone('America/Sao_Paulo', now()), 'DD/MM/YYYY'),
      'data_termo', to_char(timezone('America/Sao_Paulo', now()), 'DD/MM/YYYY'),
      'departamento', coalesce(dept.departamento, ''), 'diretor', coalesce(dept.diretor, ''),
      'almoxarifado', coalesce(dept.almoxarifado, ''), 'endereco_departamento', coalesce(dept.endereco, ''),
      'bens', itens_snapshot) || responsavel)
  RETURNING * INTO lote;
  RETURN to_jsonb(lote);
END;
$function$;

CREATE OR REPLACE FUNCTION public.incluir_bens_no_termo(_termo uuid, _sala uuid, _itens uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  documento jsonb;
  novos jsonb;
  quantidade integer;
  conflito jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_edit(auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissão para incluir bens em termos';
  END IF;
  quantidade := coalesce(cardinality(_itens), 0);
  IF quantidade < 1 OR quantidade > 500 OR (SELECT count(DISTINCT x) FROM unnest(_itens) x) <> quantidade THEN
    RAISE EXCEPTION 'Selecione de 1 a 500 bens diferentes';
  END IF;
  PERFORM s.id FROM public.salas s WHERE s.id = _sala FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sala não encontrada'; END IF;
  PERFORM b.id FROM public.bens b WHERE b.id = ANY(_itens) ORDER BY b.id FOR UPDATE;
  SELECT i.termo_snapshot INTO documento FROM public.importacoes i
    WHERE i.id = _termo AND i.sala_id = _sala FOR UPDATE;
  IF NOT FOUND OR documento IS NULL OR jsonb_typeof(documento) <> 'object'
    OR jsonb_typeof(documento->'bens') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'O termo não possui documento válido nesta sala';
  END IF;
  IF jsonb_array_length(documento->'bens') = 0 THEN
    RAISE EXCEPTION 'Os dados deste termo não estão disponíveis';
  END IF;
  IF (SELECT count(*) FROM public.bens b WHERE b.id = ANY(_itens) AND b.sala_id = _sala) <> quantidade THEN
    RAISE EXCEPTION 'Um dos bens foi removido ou mudou de sala. Atualize a busca antes de incluir';
  END IF;
  conflito := public.bem_em_outro_termo_da_sala(_sala, _itens, _termo);
  IF conflito IS NOT NULL THEN
    RAISE EXCEPTION 'O bem % já está no termo % desta sala. Um bem só pode estar em outro termo da mesma sala se tiver ido para outra sala e retornado depois', conflito->>'codigo_red', conflito->>'termo';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'codigo_red', b.codigo_red, 'descricao', b.descricao, 'valor', b.valor,
    'incorporacao', b.incorporacao, 'tipo', b.tipo
  ) ORDER BY b.codigo_red), '[]'::jsonb) INTO novos
    FROM public.bens b WHERE b.id = ANY(_itens)
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(documento->'bens') item
      WHERE item->>'codigo_red' = b.codigo_red);
  UPDATE public.importacoes SET termo_snapshot = jsonb_set(documento, '{bens}', (documento->'bens') || novos)
    WHERE id = _termo AND sala_id = _sala;
  UPDATE public.bens SET importacao_id = _termo
    WHERE id = ANY(_itens) AND sala_id = _sala AND importacao_id IS DISTINCT FROM _termo;
  RETURN jsonb_build_object('quantidade', quantidade);
END;
$function$;