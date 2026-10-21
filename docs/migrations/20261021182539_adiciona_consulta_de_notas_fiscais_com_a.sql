-- Adiciona consulta de notas fiscais com anexo XML e bens vinculados
-- Aplicada no Lovable Cloud pela extensão, com autorização do usuário.
-- Registrada por GeckoAI em 2026-10-21T21:25:39.331Z

CREATE TABLE IF NOT EXISTS public.notas_fiscais (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 fornecedor text NOT NULL CHECK (length(trim(fornecedor)) > 0),
 numero text NOT NULL CHECK (numero ~ '^[0-9]+$'),
 serie text NOT NULL,
 chave text NOT NULL UNIQUE CHECK (chave ~ '^[0-9]{44}$'),
 xml text NOT NULL CHECK (octet_length(xml) <= 2097152),
 arquivo text NOT NULL,
 criado_por uuid NOT NULL REFERENCES auth.users(id),
 criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notas_fiscais_busca_idx ON public.notas_fiscais (fornecedor, numero);
CREATE INDEX IF NOT EXISTS bens_fornecedor_nota_normalizada_idx ON public.bens (fornecedor, (coalesce(nullif(ltrim(trim(nota_fiscal), '0'), ''), '0')));
ALTER TABLE public.notas_fiscais ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "editores consultam notas fiscais" ON public.notas_fiscais;
CREATE POLICY "editores consultam notas fiscais" ON public.notas_fiscais FOR SELECT TO authenticated USING (public.can_edit(auth.uid()));
DROP POLICY IF EXISTS "editores anexam notas fiscais" ON public.notas_fiscais;
CREATE POLICY "editores anexam notas fiscais" ON public.notas_fiscais FOR INSERT TO authenticated WITH CHECK (public.can_edit(auth.uid()) AND criado_por = auth.uid());
CREATE OR REPLACE FUNCTION public.fornecedores_notas_fiscais()
RETURNS TABLE (fornecedor text) LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
 SELECT DISTINCT f.fornecedor FROM (
 SELECT b.fornecedor FROM public.bens b WHERE nullif(trim(b.fornecedor), '') IS NOT NULL
 UNION SELECT n.fornecedor FROM public.notas_fiscais n
 ) f ORDER BY f.fornecedor;
$$;
CREATE OR REPLACE FUNCTION public.bens_da_nota_fiscal(_fornecedor text, _numero text)
RETURNS SETOF public.bens LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
 SELECT b.* FROM public.bens b
 WHERE b.fornecedor = _fornecedor
 AND coalesce(nullif(ltrim(trim(b.nota_fiscal), '0'), ''), '0') = coalesce(nullif(ltrim(trim(_numero), '0'), ''), '0')
 AND nullif(trim(b.nota_fiscal), '') IS NOT NULL
 ORDER BY b.codigo_red, b.id;
$$;
REVOKE ALL ON FUNCTION public.fornecedores_notas_fiscais() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fornecedores_notas_fiscais() TO authenticated;
REVOKE ALL ON FUNCTION public.bens_da_nota_fiscal(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bens_da_nota_fiscal(text, text) TO authenticated;
GRANT SELECT, INSERT ON public.notas_fiscais TO authenticated;
