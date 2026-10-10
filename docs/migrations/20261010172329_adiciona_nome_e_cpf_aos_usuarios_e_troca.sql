-- Adiciona nome e CPF aos usuários e troca importação de bens para HTML
-- Aplicada no Lovable Cloud pela extensão, com autorização do usuário.
-- Registrada por GeckoAI em 2026-10-10T20:23:29.544Z

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cpf text;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_cpf_unico ON public.profiles (cpf) WHERE cpf IS NOT NULL;
