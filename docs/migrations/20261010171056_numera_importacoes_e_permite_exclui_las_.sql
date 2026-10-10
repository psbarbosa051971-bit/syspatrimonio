-- Numera importações e permite excluí-las preservando o local
-- Aplicada no Lovable Cloud pela extensão, com autorização do usuário.
-- Registrada por GeckoAI em 2026-10-10T20:10:56.751Z

CREATE TABLE IF NOT EXISTS public.importacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero bigint GENERATED ALWAYS AS IDENTITY UNIQUE NOT NULL,
  sala_id uuid NOT NULL REFERENCES public.salas(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  arquivo text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.bens ADD COLUMN IF NOT EXISTS importacao_id uuid REFERENCES public.importacoes(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS importacoes_sala_idx ON public.importacoes(sala_id);
CREATE INDEX IF NOT EXISTS bens_importacao_idx ON public.bens(importacao_id);
ALTER TABLE public.importacoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "editores leem importacoes" ON public.importacoes;
CREATE POLICY "editores leem importacoes" ON public.importacoes FOR SELECT TO authenticated USING (public.can_edit(auth.uid()));
DROP POLICY IF EXISTS "editores criam importacoes" ON public.importacoes;
CREATE POLICY "editores criam importacoes" ON public.importacoes FOR INSERT TO authenticated WITH CHECK (public.can_edit(auth.uid()) AND user_id = auth.uid());
GRANT SELECT, INSERT ON public.importacoes TO authenticated;
GRANT USAGE ON SEQUENCE public.importacoes_numero_seq TO authenticated;
GRANT ALL ON public.importacoes TO service_role;
GRANT ALL ON SEQUENCE public.importacoes_numero_seq TO service_role;
CREATE OR REPLACE FUNCTION public.importar_bens_pdf(_sala_id uuid, _arquivo text, _bens jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $function$
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
    SELECT auth.uid(), _sala_id, lote.id, b.codigo_red, b.descricao, COALESCE(b.valor, 0), b.incorporacao, b.tipo
    FROM (
      SELECT DISTINCT ON (x.codigo_red) x.* FROM jsonb_to_recordset(_bens)
        AS x(codigo_red text, descricao text, valor numeric, incorporacao text, tipo text)
      WHERE x.codigo_red IS NOT NULL AND x.descricao IS NOT NULL
    ) b
    WHERE NOT EXISTS (SELECT 1 FROM public.bens e WHERE e.sala_id = _sala_id AND e.codigo_red = b.codigo_red);
  GET DIAGNOSTICS quantidade = ROW_COUNT;
  RETURN jsonb_build_object('numero', lote.numero, 'novos', quantidade, 'repetidos', jsonb_array_length(_bens) - quantidade);
END;
$function$;
REVOKE ALL ON FUNCTION public.importar_bens_pdf(uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.importar_bens_pdf(uuid, text, jsonb) TO authenticated;
CREATE OR REPLACE FUNCTION public.excluir_importacoes_sala(_sala_id uuid, _modo text, _importacao_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $function$
BEGIN
  PERFORM id FROM public.salas WHERE id = _sala_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Local não encontrado'; END IF;
  IF _modo = 'todas' THEN
    DELETE FROM public.bens WHERE sala_id = _sala_id;
    DELETE FROM public.importacoes WHERE sala_id = _sala_id;
  ELSIF _modo = 'anteriores' THEN
    DELETE FROM public.bens WHERE sala_id = _sala_id AND importacao_id IS NULL;
  ELSIF _modo = 'uma' AND _importacao_id IS NOT NULL THEN
    DELETE FROM public.importacoes WHERE sala_id = _sala_id AND id = _importacao_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Importação não encontrada neste local'; END IF;
  ELSE
    RAISE EXCEPTION 'Selecione uma importação';
  END IF;
END;
$function$;
REVOKE ALL ON FUNCTION public.excluir_importacoes_sala(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.excluir_importacoes_sala(uuid, text, uuid) TO service_role;
