-- Adiciona exclusão segura de termos com retorno dos bens à origem
-- Aplicada no Lovable Cloud pela extensão, com autorização do usuário.
-- Registrada por GeckoAI em 2026-10-19T12:30:06.359Z

CREATE OR REPLACE FUNCTION public.excluir_termo_sala(_termo uuid, _sala uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  documento jsonb;
  devolvidos integer := 0;
  desvinculados integer := 0;
  pedido uuid := gen_random_uuid();
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_edit(auth.uid()) THEN
    RAISE EXCEPTION 'Você não tem permissão para excluir termos';
  END IF;
  IF _termo IS NULL OR _sala IS NULL THEN RAISE EXCEPTION 'Informe o termo e a sala'; END IF;
  PERFORM s.id FROM public.salas s WHERE s.id = _sala OR s.id IN (
    SELECT t.origem_sala_id FROM public.transferencias_bens_itens t
    WHERE t.transferencia_id = _termo AND t.estornado_em IS NULL
  ) ORDER BY s.id FOR UPDATE;
  PERFORM b.id FROM public.bens b WHERE b.importacao_id = _termo OR b.id IN (
    SELECT t.bem_id FROM public.transferencias_bens_itens t
    WHERE t.transferencia_id = _termo AND t.estornado_em IS NULL
  ) ORDER BY b.id FOR UPDATE;
  SELECT i.termo_snapshot INTO documento FROM public.importacoes i
    WHERE i.id = _termo AND i.sala_id = _sala FOR UPDATE;
  IF NOT FOUND OR documento IS NULL THEN RAISE EXCEPTION 'Termo não encontrado nesta sala. Atualize a lista'; END IF;
  PERFORM t.id FROM public.transferencias_bens_itens t
    WHERE t.transferencia_id = _termo ORDER BY t.id FOR UPDATE;
  IF EXISTS (
    SELECT 1 FROM public.transferencias_bens_itens t LEFT JOIN public.bens b ON b.id = t.bem_id
    WHERE t.transferencia_id = _termo AND t.estornado_em IS NULL AND (
      b.id IS NULL OR b.sala_id IS DISTINCT FROM t.destino_sala_id
      OR b.importacao_id IS DISTINCT FROM _termo
      OR (t.origem_sala_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.salas s WHERE s.id = t.origem_sala_id))
    )
  ) THEN
    RAISE EXCEPTION 'Não é possível excluir: um bem foi removido, movimentado para outro termo ou sua sala de origem não existe mais. Nenhum bem foi alterado';
  END IF;
  IF EXISTS (SELECT 1 FROM public.bens b WHERE b.importacao_id = _termo AND b.sala_id IS DISTINCT FROM _sala) THEN
    RAISE EXCEPTION 'Há bens vinculados a este termo em outra sala. Confira as movimentações antes de excluir';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.transferencias_bens_itens t JOIN public.bens b
      ON b.codigo_red = t.codigo_red AND b.sala_id IS NOT DISTINCT FROM t.origem_sala_id AND b.id <> t.bem_id
    WHERE t.transferencia_id = _termo AND t.estornado_em IS NULL
  ) THEN RAISE EXCEPTION 'A sala de origem já contém um dos códigos RED. Nenhum bem foi alterado'; END IF;
  UPDATE public.bens b SET sala_id = t.origem_sala_id,
    importacao_id = (SELECT i.id FROM public.importacoes i WHERE i.id = t.origem_importacao_id
      AND i.id <> _termo AND i.sala_id IS NOT DISTINCT FROM t.origem_sala_id),
    conferido = false, conferencia_finalizada = false
  FROM public.transferencias_bens_itens t
  WHERE t.transferencia_id = _termo AND t.estornado_em IS NULL AND b.id = t.bem_id;
  GET DIAGNOSTICS devolvidos = ROW_COUNT;
  UPDATE public.solicitacoes_bens SET ativa = false, updated_at = now()
    WHERE ativa AND bem_id IN (SELECT t.bem_id FROM public.transferencias_bens_itens t
      WHERE t.transferencia_id = _termo AND t.estornado_em IS NULL);
  UPDATE public.transferencias_bens_itens SET estornado_em = now(), estornado_por = auth.uid(), estorno_pedido = pedido
    WHERE transferencia_id = _termo AND estornado_em IS NULL;
  UPDATE public.bens SET importacao_id = NULL WHERE importacao_id = _termo;
  GET DIAGNOSTICS desvinculados = ROW_COUNT;
  DELETE FROM public.importacoes WHERE id = _termo AND sala_id = _sala;
  RETURN jsonb_build_object('devolvidos', devolvidos, 'desvinculados', desvinculados);
END;
$function$;
REVOKE ALL ON FUNCTION public.excluir_termo_sala(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.excluir_termo_sala(uuid, uuid) TO authenticated;
