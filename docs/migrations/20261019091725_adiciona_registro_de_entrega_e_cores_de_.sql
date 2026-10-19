-- Adiciona registro de entrega e cores de status nos termos da sala
-- Aplicada no Lovable Cloud pela extensão, com autorização do usuário.
-- Registrada por GeckoAI em 2026-10-19T12:17:25.983Z

CREATE TABLE IF NOT EXISTS public.entregas_termos (
  importacao_id uuid PRIMARY KEY REFERENCES public.importacoes(id) ON DELETE CASCADE,
  entregue_por text NOT NULL DEFAULT '',
  recebido_por text NOT NULL DEFAULT '',
  cpf text NOT NULL DEFAULT '',
  data_entrega date,
  status text NOT NULL DEFAULT 'Aguardando Entrega' CHECK (status IN ('Aguardando Entrega', 'Entregue')),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT entregas_termos_dados_completos CHECK (status <> 'Entregue' OR (btrim(entregue_por) <> '' AND btrim(recebido_por) <> '' AND cpf ~ '^[0-9]{11}$' AND data_entrega IS NOT NULL))
);
ALTER TABLE public.entregas_termos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "editores consultam entregas dos termos" ON public.entregas_termos;
CREATE POLICY "editores consultam entregas dos termos" ON public.entregas_termos FOR SELECT TO authenticated USING (public.can_edit(auth.uid()));
DROP POLICY IF EXISTS "editores registram entregas dos termos" ON public.entregas_termos;
CREATE POLICY "editores registram entregas dos termos" ON public.entregas_termos FOR INSERT TO authenticated WITH CHECK (public.can_edit(auth.uid()) AND EXISTS (SELECT 1 FROM public.importacoes i WHERE i.id = importacao_id AND i.termo_snapshot IS NOT NULL));
DROP POLICY IF EXISTS "editores atualizam entregas dos termos" ON public.entregas_termos;
CREATE POLICY "editores atualizam entregas dos termos" ON public.entregas_termos FOR UPDATE TO authenticated USING (public.can_edit(auth.uid())) WITH CHECK (public.can_edit(auth.uid()) AND EXISTS (SELECT 1 FROM public.importacoes i WHERE i.id = importacao_id AND i.termo_snapshot IS NOT NULL));
GRANT SELECT, INSERT, UPDATE ON public.entregas_termos TO authenticated;
