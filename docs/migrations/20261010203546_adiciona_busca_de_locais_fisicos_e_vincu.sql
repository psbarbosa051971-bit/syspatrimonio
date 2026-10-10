-- Adiciona busca de locais físicos e vínculo por unidade no cadastro de usuários
-- Aplicada no Lovable Cloud pela extensão, com autorização do usuário.
-- Registrada por GeckoAI em 2026-10-10T23:35:46.784Z

ALTER TABLE public.salas ADD COLUMN IF NOT EXISTS unidade text;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.salas'::regclass AND conname = 'salas_unidade_valida'
  ) THEN
    ALTER TABLE public.salas ADD CONSTRAINT salas_unidade_valida
      CHECK (unidade IS NULL OR unidade IN ('CENTRAL', 'SAÚDE', 'EDUCAÇÃO'));
  END IF;
END $$;
