-- Adiciona chat privado com administradores e testes de acesso por perfil
-- Aplicada no Lovable Cloud pela extensão, com autorização do usuário.
-- Registrada por GeckoAI em 2026-10-14T15:22:29.407Z

CREATE TABLE IF NOT EXISTS public.chat_conversas (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text NOT NULL DEFAULT 'Usuário',
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.chat_mensagens (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conversa_id uuid NOT NULL REFERENCES public.chat_conversas(user_id) ON DELETE CASCADE,
  autor_id uuid NOT NULL REFERENCES auth.users(id),
  conteudo text NOT NULL CHECK (char_length(btrim(conteudo)) BETWEEN 1 AND 2000),
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chat_mensagens_conversa_id_idx ON public.chat_mensagens(conversa_id, id DESC);
ALTER TABLE public.chat_conversas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_mensagens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS chat_conversas_ler ON public.chat_conversas;
CREATE POLICY chat_conversas_ler ON public.chat_conversas FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(), 'admin'::public.app_role) OR
  (user_id = auth.uid() AND (public.has_role(auth.uid(), 'operador'::public.app_role) OR public.has_role(auth.uid(), 'visualizador'::public.app_role)))
);
DROP POLICY IF EXISTS chat_conversas_criar ON public.chat_conversas;
CREATE POLICY chat_conversas_criar ON public.chat_conversas FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid() AND (public.has_role(auth.uid(), 'operador'::public.app_role) OR public.has_role(auth.uid(), 'visualizador'::public.app_role))
);
DROP POLICY IF EXISTS chat_mensagens_ler ON public.chat_mensagens;
CREATE POLICY chat_mensagens_ler ON public.chat_mensagens FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(), 'admin'::public.app_role) OR
  (conversa_id = auth.uid() AND (public.has_role(auth.uid(), 'operador'::public.app_role) OR public.has_role(auth.uid(), 'visualizador'::public.app_role)))
);
DROP POLICY IF EXISTS chat_mensagens_enviar ON public.chat_mensagens;
CREATE POLICY chat_mensagens_enviar ON public.chat_mensagens FOR INSERT TO authenticated WITH CHECK (
  autor_id = auth.uid() AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR
  (conversa_id = auth.uid() AND (public.has_role(auth.uid(), 'operador'::public.app_role) OR public.has_role(auth.uid(), 'visualizador'::public.app_role))))
);
CREATE OR REPLACE FUNCTION public.chat_identificar_usuario() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  SELECT COALESCE(NULLIF(btrim(p.nome), ''), NULLIF(btrim(p.login), ''), 'Usuário') INTO NEW.nome FROM public.profiles p WHERE p.id = NEW.user_id;
  NEW.nome := COALESCE(NEW.nome, 'Usuário');
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS chat_identificar_usuario ON public.chat_conversas;
CREATE TRIGGER chat_identificar_usuario BEFORE INSERT ON public.chat_conversas FOR EACH ROW EXECUTE FUNCTION public.chat_identificar_usuario();
GRANT SELECT, INSERT ON public.chat_conversas TO authenticated;
GRANT SELECT, INSERT ON public.chat_mensagens TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.chat_mensagens_id_seq TO authenticated;
