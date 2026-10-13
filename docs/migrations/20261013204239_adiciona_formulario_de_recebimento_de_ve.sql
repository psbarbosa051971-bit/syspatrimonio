-- Adiciona formulário de recebimento de veículos e check-list conforme modelo
-- Aplicada no Lovable Cloud pela extensão, com autorização do usuário.
-- Registrada por GeckoAI em 2026-10-13T23:42:39.995Z

CREATE TABLE IF NOT EXISTS public.recebimentos_veiculos (
  bem_id uuid PRIMARY KEY REFERENCES public.bens(id) ON DELETE CASCADE,
  dados jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(dados) = 'object'),
  atualizado_por uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.recebimentos_veiculos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "consulta recebimento do local" ON public.recebimentos_veiculos;
CREATE POLICY "consulta recebimento do local" ON public.recebimentos_veiculos FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.bens b WHERE b.id = bem_id AND b.sala_id IS NOT NULL AND public.pode_ver_sala(auth.uid(), b.sala_id))
);
DROP POLICY IF EXISTS "cadastra recebimento do local" ON public.recebimentos_veiculos;
CREATE POLICY "cadastra recebimento do local" ON public.recebimentos_veiculos FOR INSERT TO authenticated WITH CHECK (
  atualizado_por = auth.uid() AND EXISTS (SELECT 1 FROM public.bens b WHERE b.id = bem_id AND b.sala_id IS NOT NULL AND public.pode_ver_sala(auth.uid(), b.sala_id))
);
DROP POLICY IF EXISTS "edita recebimento do local" ON public.recebimentos_veiculos;
CREATE POLICY "edita recebimento do local" ON public.recebimentos_veiculos FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.bens b WHERE b.id = bem_id AND b.sala_id IS NOT NULL AND public.pode_ver_sala(auth.uid(), b.sala_id))
) WITH CHECK (
  atualizado_por = auth.uid() AND EXISTS (SELECT 1 FROM public.bens b WHERE b.id = bem_id AND b.sala_id IS NOT NULL AND public.pode_ver_sala(auth.uid(), b.sala_id))
);
GRANT SELECT, INSERT, UPDATE ON public.recebimentos_veiculos TO authenticated;
