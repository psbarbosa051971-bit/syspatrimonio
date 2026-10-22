-- Adiciona DANFE original em PDF e libera impressão de termos sem preencher recebimento
-- Aplicada no Lovable Cloud pela extensão, com autorização do usuário.
-- Registrada por GeckoAI em 2026-10-22T11:29:25.604Z

CREATE TABLE IF NOT EXISTS public.notas_fiscais_danfes (
  nota_fiscal_id uuid PRIMARY KEY REFERENCES public.notas_fiscais(id),
  arquivo_path text NOT NULL UNIQUE,
  arquivo_nome text NOT NULL CHECK (length(arquivo_nome) BETWEEN 1 AND 255),
  criado_por uuid NOT NULL REFERENCES auth.users(id),
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT danfe_caminho_valido CHECK (
    arquivo_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}[.]pdf$'
    AND split_part(arquivo_path, '/', 1) = nota_fiscal_id::text
  )
);
ALTER TABLE public.notas_fiscais_danfes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "editores consultam danfes originais" ON public.notas_fiscais_danfes;
CREATE POLICY "editores consultam danfes originais" ON public.notas_fiscais_danfes
  FOR SELECT TO authenticated USING (public.can_edit(auth.uid()));
DROP POLICY IF EXISTS "editores anexam danfes originais" ON public.notas_fiscais_danfes;
CREATE POLICY "editores anexam danfes originais" ON public.notas_fiscais_danfes
  FOR INSERT TO authenticated WITH CHECK (public.can_edit(auth.uid()) AND criado_por = auth.uid());
GRANT SELECT, INSERT ON public.notas_fiscais_danfes TO authenticated;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('danfes-originais', 'danfes-originais', false, 15728640, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS "editores leem pdfs danfes" ON storage.objects;
CREATE POLICY "editores leem pdfs danfes" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'danfes-originais' AND public.can_edit(auth.uid())
    AND EXISTS (SELECT 1 FROM public.notas_fiscais_danfes d WHERE d.arquivo_path = name)
  );
DROP POLICY IF EXISTS "editores enviam pdfs danfes" ON storage.objects;
CREATE POLICY "editores enviam pdfs danfes" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'danfes-originais' AND public.can_edit(auth.uid())
    AND owner_id = auth.uid()::text
    AND name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}[.]pdf$'
    AND EXISTS (SELECT 1 FROM public.notas_fiscais n WHERE n.id::text = split_part(name, '/', 1))
    AND NOT EXISTS (SELECT 1 FROM public.notas_fiscais_danfes d WHERE d.nota_fiscal_id::text = split_part(name, '/', 1))
  );
