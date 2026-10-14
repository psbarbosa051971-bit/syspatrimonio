-- Adiciona saudação, encerramento e exclusão no chat com testes de apoio
-- Aplicada no Lovable Cloud pela extensão, com autorização do usuário.
-- Registrada por GeckoAI em 2026-10-14T16:06:21.338Z

GRANT DELETE ON TABLE public.chat_mensagens TO authenticated;
DROP POLICY IF EXISTS chat_mensagens_excluir ON public.chat_mensagens;
CREATE POLICY chat_mensagens_excluir ON public.chat_mensagens
FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    conversa_id = auth.uid()
    AND (
      public.has_role(auth.uid(), 'operador'::public.app_role)
      OR public.has_role(auth.uid(), 'visualizador'::public.app_role)
    )
  )
);
