-- Adiciona formulário de estorno seletivo por código RED e testes automatizados sem renderização na interface
-- Aplicada no Lovable Cloud pela extensão, com autorização do usuário.
-- Registrada por GeckoAI em 2026-10-11T16:29:11.517Z

CREATE TABLE IF NOT EXISTS public.transferencias_bens_itens (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  transferencia_id uuid NOT NULL,
  numero bigint NOT NULL,
  termo_ano integer,
  bem_id uuid NOT NULL,
  codigo_red text NOT NULL,
  descricao text NOT NULL,
  valor numeric(12,2) NOT NULL,
  origem_sala_id uuid,
  origem_nome text NOT NULL,
  origem_importacao_id uuid,
  destino_sala_id uuid NOT NULL,
  destino_nome text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  estornado_em timestamptz,
  estornado_por uuid,
  estorno_pedido uuid,
  UNIQUE (transferencia_id, bem_id)
);
CREATE INDEX IF NOT EXISTS transferencias_itens_codigo_idx ON public.transferencias_bens_itens (codigo_red, id DESC);
CREATE INDEX IF NOT EXISTS transferencias_itens_estorno_idx ON public.transferencias_bens_itens (estorno_pedido);
ALTER TABLE public.transferencias_bens_itens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Editores consultam historico de transferencias" ON public.transferencias_bens_itens;
CREATE POLICY "Editores consultam historico de transferencias" ON public.transferencias_bens_itens FOR SELECT TO authenticated USING (public.can_edit(auth.uid()));
GRANT SELECT ON public.transferencias_bens_itens TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.transferencias_bens_itens FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.registrar_item_transferido()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  lote public.importacoes%ROWTYPE;
BEGIN
  SELECT * INTO lote FROM public.importacoes WHERE id = NEW.importacao_id AND arquivo = 'Transferência de bens';
  IF FOUND THEN
    INSERT INTO public.transferencias_bens_itens (
      transferencia_id, numero, termo_ano, bem_id, codigo_red, descricao, valor,
      origem_sala_id, origem_nome, origem_importacao_id, destino_sala_id, destino_nome
    ) VALUES (
      lote.id, lote.numero, lote.termo_ano, NEW.id, NEW.codigo_red, NEW.descricao, NEW.valor,
      OLD.sala_id, coalesce((SELECT nome FROM public.salas WHERE id = OLD.sala_id), 'Sem sala'), OLD.importacao_id,
      NEW.sala_id, coalesce((SELECT nome FROM public.salas WHERE id = NEW.sala_id), 'Sala removida')
    ) ON CONFLICT (transferencia_id, bem_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_item_transferido() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS registrar_item_transferido ON public.bens;
CREATE TRIGGER registrar_item_transferido AFTER UPDATE ON public.bens FOR EACH ROW
WHEN (OLD.sala_id IS DISTINCT FROM NEW.sala_id AND OLD.importacao_id IS DISTINCT FROM NEW.importacao_id)
EXECUTE FUNCTION public.registrar_item_transferido();

CREATE OR REPLACE FUNCTION public.buscar_ultima_transferencia(_codigo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  transferencia uuid;
  resultado jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_edit(auth.uid()) THEN RAISE EXCEPTION 'Sem permissão para consultar transferências'; END IF;
  IF _codigo IS NULL OR btrim(_codigo) !~ '^[0-9]+$' THEN RAISE EXCEPTION 'Digite apenas um código RED, somente com números'; END IF;
  SELECT transferencia_id INTO transferencia FROM public.transferencias_bens_itens
    WHERE codigo_red = btrim(_codigo) ORDER BY id DESC LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT jsonb_build_object(
    'id', transferencia, 'numero', min(t.numero), 'ano', min(t.termo_ano),
    'data', min(t.created_at), 'destino', min(t.destino_nome),
    'itens', jsonb_agg(jsonb_build_object(
      'id', t.bem_id, 'codigo_red', t.codigo_red, 'descricao', t.descricao, 'valor', t.valor,
      'origem', t.origem_nome, 'estornado_em', t.estornado_em,
      'impedimento', CASE
        WHEN t.estornado_em IS NOT NULL THEN 'Já estornado'
        WHEN b.id IS NULL THEN 'Bem removido'
        WHEN b.sala_id IS DISTINCT FROM t.destino_sala_id OR b.importacao_id IS DISTINCT FROM t.transferencia_id THEN 'Bem movimentado após esta transferência'
        WHEN t.origem_sala_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.salas s WHERE s.id = t.origem_sala_id) THEN 'Sala de origem removida'
        WHEN EXISTS (SELECT 1 FROM public.bens outro WHERE outro.id <> t.bem_id AND outro.codigo_red = t.codigo_red AND outro.sala_id IS NOT DISTINCT FROM t.origem_sala_id) THEN 'O local de origem já contém este código RED'
        ELSE NULL END
    ) ORDER BY t.codigo_red, t.id)
  ) INTO resultado FROM public.transferencias_bens_itens t LEFT JOIN public.bens b ON b.id = t.bem_id
    WHERE t.transferencia_id = transferencia;
  RETURN resultado;
END;
$$;

CREATE OR REPLACE FUNCTION public.estornar_transferencia(_transferencia uuid, _itens uuid[], _pedido uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  quantidade integer;
  ja_feitos integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_edit(auth.uid()) THEN RAISE EXCEPTION 'Sem permissão para estornar transferências'; END IF;
  IF _transferencia IS NULL OR _pedido IS NULL THEN RAISE EXCEPTION 'Pedido de estorno inválido'; END IF;
  quantidade := coalesce(cardinality(_itens), 0);
  IF quantidade < 1 OR quantidade > 500 OR (SELECT count(DISTINCT x) FROM unnest(_itens) x) <> quantidade THEN RAISE EXCEPTION 'Selecione de 1 a 500 bens diferentes'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(_pedido::text, 0));
  SELECT count(*) INTO ja_feitos FROM public.transferencias_bens_itens WHERE estorno_pedido = _pedido;
  IF ja_feitos > 0 THEN
    IF ja_feitos <> quantidade OR EXISTS (SELECT 1 FROM public.transferencias_bens_itens WHERE estorno_pedido = _pedido AND (transferencia_id <> _transferencia OR estornado_por <> auth.uid() OR NOT (bem_id = ANY(_itens)))) THEN
      RAISE EXCEPTION 'Este pedido pertence a outro estorno';
    END IF;
    RETURN jsonb_build_object('quantidade', ja_feitos);
  END IF;
  PERFORM s.id FROM public.salas s WHERE s.id IN (
    SELECT origem_sala_id FROM public.transferencias_bens_itens WHERE transferencia_id = _transferencia AND bem_id = ANY(_itens)
    UNION SELECT destino_sala_id FROM public.transferencias_bens_itens WHERE transferencia_id = _transferencia AND bem_id = ANY(_itens)
  ) ORDER BY s.id FOR UPDATE;
  PERFORM b.id FROM public.bens b WHERE b.id = ANY(_itens) ORDER BY b.id FOR UPDATE;
  PERFORM t.id FROM public.transferencias_bens_itens t WHERE t.transferencia_id = _transferencia AND t.bem_id = ANY(_itens) ORDER BY t.id FOR UPDATE;
  IF (SELECT count(*) FROM public.transferencias_bens_itens t JOIN public.bens b ON b.id = t.bem_id
    WHERE t.transferencia_id = _transferencia AND t.bem_id = ANY(_itens) AND t.estornado_em IS NULL
      AND b.sala_id = t.destino_sala_id AND b.importacao_id = t.transferencia_id
      AND (t.origem_sala_id IS NULL OR EXISTS (SELECT 1 FROM public.salas s WHERE s.id = t.origem_sala_id))) <> quantidade THEN
    RAISE EXCEPTION 'Um item já foi estornado, removido ou movimentado, ou sua sala de origem foi removida. Busque novamente antes de estornar';
  END IF;
  IF EXISTS (SELECT 1 FROM public.transferencias_bens_itens t JOIN public.bens b
    ON b.codigo_red = t.codigo_red AND b.sala_id IS NOT DISTINCT FROM t.origem_sala_id AND b.id <> t.bem_id
    WHERE t.transferencia_id = _transferencia AND t.bem_id = ANY(_itens)) THEN
    RAISE EXCEPTION 'A sala de origem já contém um dos códigos RED selecionados. Nenhum item foi estornado';
  END IF;
  UPDATE public.bens b SET sala_id = t.origem_sala_id,
    importacao_id = (SELECT i.id FROM public.importacoes i WHERE i.id = t.origem_importacao_id AND i.sala_id IS NOT DISTINCT FROM t.origem_sala_id),
    conferido = false, conferencia_finalizada = false
  FROM public.transferencias_bens_itens t WHERE t.transferencia_id = _transferencia AND t.bem_id = ANY(_itens) AND b.id = t.bem_id;
  UPDATE public.solicitacoes_bens SET ativa = false, updated_at = now() WHERE ativa AND bem_id = ANY(_itens);
  UPDATE public.transferencias_bens_itens SET estornado_em = now(), estornado_por = auth.uid(), estorno_pedido = _pedido
    WHERE transferencia_id = _transferencia AND bem_id = ANY(_itens);
  RETURN jsonb_build_object('quantidade', quantidade);
END;
$$;
REVOKE ALL ON FUNCTION public.buscar_ultima_transferencia(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.estornar_transferencia(uuid, uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buscar_ultima_transferencia(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.estornar_transferencia(uuid, uuid[], uuid) TO authenticated;
