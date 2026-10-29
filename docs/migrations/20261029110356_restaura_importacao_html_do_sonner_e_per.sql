-- Restaura importação HTML do Sonner e permite anexar PDF da nota sem XML
-- Aplicada no Lovable Cloud pela extensão, com autorização do usuário.
-- Registrada por GeckoAI em 2026-10-29T14:03:56.433Z

CREATE TABLE IF NOT EXISTS public.notas_fiscais_pdfs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fornecedor text NOT NULL CHECK (length(btrim(fornecedor)) > 0),
  numero text NOT NULL CHECK (numero ~ '^[0-9]+$'),
  arquivo_path text NOT NULL UNIQUE CHECK (arquivo_path ~ '^notas/[0-9a-f-]{36}/[0-9a-f-]{36}[.]pdf$'),
  arquivo_nome text NOT NULL CHECK (length(arquivo_nome) BETWEEN 1 AND 255),
  criado_por uuid NOT NULL REFERENCES auth.users(id),
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fornecedor, numero)
);
ALTER TABLE public.notas_fiscais_pdfs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "editores consultam notas em pdf" ON public.notas_fiscais_pdfs;
CREATE POLICY "editores consultam notas em pdf" ON public.notas_fiscais_pdfs FOR SELECT TO authenticated USING (public.can_edit(auth.uid()));
DROP POLICY IF EXISTS "editores anexam notas em pdf" ON public.notas_fiscais_pdfs;
CREATE POLICY "editores anexam notas em pdf" ON public.notas_fiscais_pdfs FOR INSERT TO authenticated WITH CHECK (public.can_edit(auth.uid()) AND criado_por = auth.uid() AND split_part(arquivo_path, '/', 2) = auth.uid()::text);
GRANT SELECT, INSERT ON public.notas_fiscais_pdfs TO authenticated;
DROP POLICY IF EXISTS "editores leem notas pdf sem xml" ON storage.objects;
CREATE POLICY "editores leem notas pdf sem xml" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'danfes-originais' AND public.can_edit(auth.uid()) AND EXISTS (SELECT 1 FROM public.notas_fiscais_pdfs n WHERE n.arquivo_path = name));
DROP POLICY IF EXISTS "editores enviam notas pdf sem xml" ON storage.objects;
CREATE POLICY "editores enviam notas pdf sem xml" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'danfes-originais' AND public.can_edit(auth.uid()) AND owner_id = auth.uid()::text AND name ~ '^notas/[0-9a-f-]{36}/[0-9a-f-]{36}[.]pdf$' AND split_part(name, '/', 2) = auth.uid()::text);
