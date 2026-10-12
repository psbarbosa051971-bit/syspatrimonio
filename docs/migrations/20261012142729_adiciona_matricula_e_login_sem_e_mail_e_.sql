-- Adiciona matrícula e login sem e-mail e ajusta os formulários conforme o anexo
-- Aplicada no Lovable Cloud pela extensão, com autorização do usuário.
-- Registrada por GeckoAI em 2026-10-12T17:27:29.138Z

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS matricula text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS login text;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_login_unico ON public.profiles (lower(login)) WHERE login IS NOT NULL;
