-- Adiciona impressão e protege edição de termos entregues com senha
-- Aplicada no Lovable Cloud pela extensão, com autorização do usuário.
-- Registrada por GeckoAI em 2026-10-31T12:53:09.023Z

DROP POLICY IF EXISTS "editores atualizam entregas dos termos" ON public.entregas_termos;
CREATE POLICY "editores atualizam entregas dos termos" ON public.entregas_termos
FOR UPDATE TO authenticated
USING (public.can_edit(auth.uid()) AND status <> 'Entregue')
WITH CHECK (public.can_edit(auth.uid()) AND EXISTS (
  SELECT 1 FROM public.importacoes i
  WHERE i.id = entregas_termos.importacao_id AND i.termo_snapshot IS NOT NULL
));
