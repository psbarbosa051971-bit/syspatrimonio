-- Adiciona avisos do chat fora do sistema e controles de ativação; mantém testes fora da interface
-- Aplicada no Lovable Cloud pela extensão, com autorização do usuário.
-- Registrada por GeckoAI em 2026-10-14T16:25:59.609Z

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.chat_push_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  dispatch_token text NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  vapid_public_key text,
  vapid_private_key text
);
CREATE TABLE IF NOT EXISTS public.chat_push_assinaturas (
  endpoint text PRIMARY KEY CHECK (length(endpoint) <= 2048 AND endpoint LIKE 'https://%'),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chat_push_assinaturas_usuario_idx ON public.chat_push_assinaturas(user_id);
ALTER TABLE public.chat_push_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_push_assinaturas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chat_push_config FROM anon, authenticated;
REVOKE ALL ON public.chat_push_assinaturas FROM anon, authenticated;
GRANT ALL ON public.chat_push_config TO service_role;
GRANT ALL ON public.chat_push_assinaturas TO service_role;
INSERT INTO public.chat_push_config(id) VALUES (true) ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.chat_notificar_push()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $function$
DECLARE segredo text;
BEGIN
  SELECT dispatch_token INTO segredo FROM public.chat_push_config WHERE id = true;
  PERFORM net.http_post(
    url := 'https://wdkimydszbyxnmduedid.supabase.co/functions/v1/chat-push',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('action', 'dispatch', 'messageId', NEW.id, 'token', segredo),
    timeout_milliseconds := 10000
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Não foi possível agendar o aviso do chat: %', SQLERRM;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.chat_notificar_push() FROM PUBLIC;
CREATE OR REPLACE TRIGGER chat_mensagem_push
AFTER INSERT ON public.chat_mensagens
FOR EACH ROW EXECUTE FUNCTION public.chat_notificar_push();

DROP POLICY IF EXISTS chat_push_config_servico ON public.chat_push_config;
CREATE POLICY chat_push_config_servico ON public.chat_push_config FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS chat_push_assinaturas_servico ON public.chat_push_assinaturas;
CREATE POLICY chat_push_assinaturas_servico ON public.chat_push_assinaturas FOR ALL TO service_role USING (true) WITH CHECK (true);
