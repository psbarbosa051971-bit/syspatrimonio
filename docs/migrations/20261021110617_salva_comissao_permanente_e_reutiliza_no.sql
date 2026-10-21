-- Salva comissão permanente e reutiliza nomes e cargos nos novos recebimentos
-- Aplicada no Lovable Cloud pela extensão, com autorização do usuário.
-- Registrada por GeckoAI em 2026-10-21T14:06:17.445Z

CREATE TABLE IF NOT EXISTS public.comissao_recebimento_veiculos (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  dados jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(dados) = 'object'),
  atualizado_por uuid NOT NULL REFERENCES auth.users(id),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.comissao_recebimento_veiculos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "consulta comissao permanente" ON public.comissao_recebimento_veiculos;
CREATE POLICY "consulta comissao permanente" ON public.comissao_recebimento_veiculos FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "cadastra comissao permanente" ON public.comissao_recebimento_veiculos;
CREATE POLICY "cadastra comissao permanente" ON public.comissao_recebimento_veiculos FOR INSERT TO authenticated WITH CHECK (
  atualizado_por = auth.uid() AND EXISTS (SELECT 1 FROM public.bens b WHERE b.sala_id IS NOT NULL AND public.pode_ver_sala(auth.uid(), b.sala_id))
);
DROP POLICY IF EXISTS "edita comissao permanente" ON public.comissao_recebimento_veiculos;
CREATE POLICY "edita comissao permanente" ON public.comissao_recebimento_veiculos FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.bens b WHERE b.sala_id IS NOT NULL AND public.pode_ver_sala(auth.uid(), b.sala_id))
) WITH CHECK (
  atualizado_por = auth.uid() AND EXISTS (SELECT 1 FROM public.bens b WHERE b.sala_id IS NOT NULL AND public.pode_ver_sala(auth.uid(), b.sala_id))
);
INSERT INTO public.comissao_recebimento_veiculos (id, dados, atualizado_por, atualizado_em)
SELECT true,
  (SELECT jsonb_object_agg(e.key, e.value) FROM jsonb_each(r.dados) e WHERE e.key ~ '^(assinante|cargo)_[1-5]$'),
  r.atualizado_por, r.atualizado_em
FROM public.recebimentos_veiculos r
WHERE EXISTS (
  SELECT 1 FROM jsonb_each_text(r.dados) e WHERE e.key ~ '^assinante_[1-5]$' AND btrim(e.value) <> ''
)
ORDER BY r.atualizado_em DESC
LIMIT 1
ON CONFLICT (id) DO NOTHING;
