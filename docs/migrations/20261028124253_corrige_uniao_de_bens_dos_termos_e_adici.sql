-- Corrige união de bens dos termos e adiciona aceite para repetição entre documentos
-- Aplicada no Lovable Cloud pela extensão, com autorização do usuário.
-- Registrada por GeckoAI em 2026-10-28T15:42:53.752Z

CREATE OR REPLACE FUNCTION public.unificar_termos(_sala uuid, _termos uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  destino public.importacoes%ROWTYPE;
  origem public.importacoes%ROWTYPE;
  itens jsonb;
  ids uuid[];
  movidos integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_edit(auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissão para unificar termos';
  END IF;
  IF _sala IS NULL OR coalesce(cardinality(_termos), 0) <> 2 OR _termos[1] IS NULL OR _termos[2] IS NULL OR _termos[1] = _termos[2] THEN
    RAISE EXCEPTION 'Selecione exatamente dois termos diferentes';
  END IF;
  IF NOT public.pode_ver_sala(auth.uid(), _sala) THEN RAISE EXCEPTION 'Sala indisponível para sua conta'; END IF;
  PERFORM s.id FROM public.salas s WHERE s.id = _sala FOR UPDATE;
  PERFORM b.id FROM public.bens b WHERE b.sala_id = _sala OR b.importacao_id = ANY(_termos) ORDER BY b.id FOR UPDATE;
  PERFORM i.id FROM public.importacoes i WHERE i.id = ANY(_termos) ORDER BY i.id FOR UPDATE;
  IF (SELECT count(*) FROM public.importacoes i WHERE i.id = ANY(_termos) AND i.sala_id = _sala
      AND jsonb_typeof(i.termo_snapshot) = 'object' AND jsonb_typeof(i.termo_snapshot->'bens') = 'array') <> 2 THEN
    RAISE EXCEPTION 'Os dois termos precisam pertencer a esta sala. Atualize a lista';
  END IF;
  SELECT * INTO destino FROM public.importacoes WHERE id = ANY(_termos) ORDER BY numero DESC LIMIT 1;
  SELECT * INTO origem FROM public.importacoes WHERE id = ANY(_termos) AND id <> destino.id;
  IF EXISTS (SELECT 1 FROM public.bens b WHERE b.importacao_id = origem.id AND b.sala_id IS DISTINCT FROM _sala) THEN
    RAISE EXCEPTION 'O termo % tem bens em outra sala. Confira as movimentações antes de unificar', lpad(origem.numero::text, 5, '0');
  END IF;
  SELECT coalesce(array_agg(b.id ORDER BY b.id), ARRAY[]::uuid[]) INTO ids
  FROM public.bens b WHERE b.sala_id = _sala AND (
    b.importacao_id = ANY(_termos) OR EXISTS (
      SELECT 1 FROM public.importacoes i
      CROSS JOIN LATERAL jsonb_array_elements_text(CASE WHEN jsonb_typeof(i.termo_snapshot->'bem_ids') = 'array' THEN i.termo_snapshot->'bem_ids' ELSE '[]'::jsonb END) x(id)
      WHERE i.id = ANY(_termos) AND i.termo_snapshot->>'tipo_documento' = 'novo_termo' AND x.id = b.id::text
    )
  );
  SELECT coalesce(jsonb_agg(escolhidos.item ORDER BY escolhidos.chave), '[]'::jsonb) INTO itens
  FROM (
    SELECT DISTINCT ON (chave) item, chave FROM (
      SELECT x.item, public.chave_codigo_red_importacao(x.item->>'codigo_red') AS chave, 1 AS prioridade
      FROM jsonb_array_elements(destino.termo_snapshot->'bens') x(item)
      UNION ALL
      SELECT x.item, public.chave_codigo_red_importacao(x.item->>'codigo_red'), 2
      FROM jsonb_array_elements(origem.termo_snapshot->'bens') x(item)
      UNION ALL
      SELECT jsonb_build_object('codigo_red', b.codigo_red, 'descricao', b.descricao, 'valor', b.valor, 'incorporacao', b.incorporacao, 'tipo', b.tipo), public.chave_codigo_red_importacao(b.codigo_red), 3
      FROM public.bens b WHERE b.id = ANY(ids)
    ) todos ORDER BY chave, prioridade
  ) escolhidos;
  UPDATE public.importacoes SET termo_snapshot = jsonb_set(jsonb_set(termo_snapshot, '{bens}', itens), '{bem_ids}', to_jsonb(ids)) WHERE id = destino.id;
  UPDATE public.bens SET importacao_id = destino.id WHERE id = ANY(ids) AND importacao_id IS DISTINCT FROM destino.id;
  GET DIAGNOSTICS movidos = ROW_COUNT;
  -- Movimentações anteriores do mesmo bem continuam no histórico, sem apagar registros de estorno.
  UPDATE public.transferencias_bens_itens t SET transferencia_id = destino.id, numero = destino.numero, termo_ano = destino.termo_ano
    WHERE t.transferencia_id = origem.id AND NOT EXISTS (
      SELECT 1 FROM public.transferencias_bens_itens d WHERE d.transferencia_id = destino.id AND d.bem_id = t.bem_id
    );
  UPDATE public.transferencias_bens_itens SET origem_importacao_id = destino.id WHERE origem_importacao_id = origem.id;
  IF EXISTS (SELECT 1 FROM public.bens WHERE importacao_id = origem.id) THEN RAISE EXCEPTION 'Há bens vinculados ao termo anterior. Nenhuma alteração foi realizada'; END IF;
  DELETE FROM public.entregas_termos WHERE importacao_id = origem.id;
  DELETE FROM public.importacoes WHERE id = origem.id;
  RETURN jsonb_build_object('destino', destino.id, 'numero', destino.numero, 'removido', origem.numero, 'movidos', movidos, 'quantidade', cardinality(ids));
END;
$function$;

-- Mantém as versões antigas estritas e cria versões com aceite explícito.
DO $migration$
DECLARE definicao text; original text;
BEGIN
  original := pg_get_functiondef('public.criar_termo_bens_sala(uuid,uuid[],uuid)'::regprocedure);
  definicao := replace(original, '_pedido uuid)', '_pedido uuid, _aceitar_repetidos boolean)');
  definicao := replace(definicao, 'IF conflito IS NOT NULL THEN', 'IF conflito IS NOT NULL AND NOT coalesce(_aceitar_repetidos, false) THEN');
  IF definicao = original OR position('_aceitar_repetidos boolean' IN definicao) = 0 OR position('AND NOT coalesce(_aceitar_repetidos, false)' IN definicao) = 0 THEN RAISE EXCEPTION 'Não foi possível preparar o aceite para novos termos'; END IF;
  EXECUTE definicao;
  original := pg_get_functiondef('public.incluir_bens_no_termo(uuid,uuid,uuid[])'::regprocedure);
  definicao := replace(original, '_itens uuid[])', '_itens uuid[], _aceitar_repetidos boolean)');
  definicao := replace(definicao, 'IF conflito IS NOT NULL THEN', 'IF conflito IS NOT NULL AND NOT coalesce(_aceitar_repetidos, false) THEN');
  IF definicao = original OR position('_aceitar_repetidos boolean' IN definicao) = 0 OR position('AND NOT coalesce(_aceitar_repetidos, false)' IN definicao) = 0 THEN RAISE EXCEPTION 'Não foi possível preparar o aceite para inclusão'; END IF;
  EXECUTE definicao;
  original := pg_get_functiondef('public.transferir_bens(uuid,jsonb,uuid)'::regprocedure);
  definicao := replace(original, '_pedido uuid)', '_pedido uuid, _aceitar_repetidos boolean)');
  definicao := replace(definicao, 'WHERE b.sala_id IS DISTINCT FROM _destino) <> quantidade', 'WHERE (b.sala_id IS DISTINCT FROM _destino OR coalesce(_aceitar_repetidos, false))) <> quantidade');
  definicao := replace(definicao, '  SELECT * INTO dept FROM public.departamentos WHERE id=destino.departamento_id;', '  IF NOT coalesce(_aceitar_repetidos, false) AND public.bem_em_outro_termo_da_sala(_destino, ARRAY(SELECT x.id FROM jsonb_to_recordset(_itens) AS x(id uuid, sala_id uuid)), _pedido) IS NOT NULL THEN RAISE EXCEPTION ''Um dos bens já consta em outro termo desta sala. Clique em Aceitar bens em termos diferentes para autorizar''; END IF;
  SELECT * INTO dept FROM public.departamentos WHERE id=destino.departamento_id;');
  definicao := replace(definicao, 'WHERE d.sala_id=_destino) THEN', 'WHERE d.sala_id=_destino AND d.id <> b.id) THEN');
  IF definicao = original OR position('_aceitar_repetidos boolean' IN definicao) = 0 OR position('OR coalesce(_aceitar_repetidos, false)' IN definicao) = 0 OR position('d.id <> b.id' IN definicao) = 0 THEN RAISE EXCEPTION 'Não foi possível preparar o aceite para transferências'; END IF;
  EXECUTE definicao;
END;
$migration$;
REVOKE ALL ON FUNCTION public.criar_termo_bens_sala(uuid,uuid[],uuid,boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.incluir_bens_no_termo(uuid,uuid,uuid[],boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transferir_bens(uuid,jsonb,uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.criar_termo_bens_sala(uuid,uuid[],uuid,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.incluir_bens_no_termo(uuid,uuid,uuid[],boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transferir_bens(uuid,jsonb,uuid,boolean) TO authenticated;
