-- Adiciona status de localização e cores na conferência e nos bens da sala
-- Aplicada no Lovable Cloud pela extensão, com autorização do usuário.
-- Registrada por GeckoAI em 2026-10-21T12:57:02.968Z

ALTER TABLE public.bens ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'NÃO LOCALIZADO';

UPDATE public.bens
SET status = CASE WHEN conferido THEN 'LOCALIZADO' ELSE 'NÃO LOCALIZADO' END
WHERE status IS DISTINCT FROM CASE WHEN conferido THEN 'LOCALIZADO' ELSE 'NÃO LOCALIZADO' END;

CREATE OR REPLACE FUNCTION public.sincronizar_status_bem()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  NEW.status := CASE WHEN NEW.conferido THEN 'LOCALIZADO' ELSE 'NÃO LOCALIZADO' END;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE TRIGGER sincronizar_status_bem
BEFORE INSERT OR UPDATE OF conferido ON public.bens
FOR EACH ROW EXECUTE FUNCTION public.sincronizar_status_bem();
