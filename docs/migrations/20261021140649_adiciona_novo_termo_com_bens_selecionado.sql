-- Adiciona novo termo com bens selecionados da sala sem movimentação
-- Aplicada no Lovable Cloud pela extensão, com autorização do usuário.
-- Registrada por GeckoAI em 2026-10-21T17:06:49.270Z

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
REVOKE ALL ON FUNCTION public.criar_termo_bens_sala(uuid, uuid[], uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.criar_termo_bens_sala(uuid, uuid[], uuid) TO authenticated;
