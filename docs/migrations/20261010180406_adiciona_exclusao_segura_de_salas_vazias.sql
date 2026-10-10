-- Adiciona exclusão segura de salas vazias e vincula responsáveis aos locais físicos
-- Aplicada no Lovable Cloud pela extensão, com autorização do usuário.
-- Registrada por GeckoAI em 2026-10-10T21:04:06.693Z

CREATE OR REPLACE FUNCTION public.excluir_sala_vazia(_sala_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_edit(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas administradores e operadores podem excluir salas';
  END IF;
  PERFORM id FROM public.salas WHERE id = _sala_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sala não encontrada ou acesso não autorizado';
  END IF;
  IF EXISTS (SELECT 1 FROM public.bens WHERE sala_id = _sala_id) THEN
    RAISE EXCEPTION 'Esta sala possui bens e não pode ser excluída';
  END IF;
  DELETE FROM public.salas WHERE id = _sala_id;
END;
$$;
REVOKE ALL ON FUNCTION public.excluir_sala_vazia(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.excluir_sala_vazia(uuid) TO authenticated;
