-- Confirma número da transferência somente ao salvar e reutiliza números não utilizados
-- Aplicada no Lovable Cloud pela extensão, com autorização do usuário.
-- Registrada por GeckoAI em 2026-10-16T12:21:06.257Z

CREATE TABLE IF NOT EXISTS public.termos_numeracao_contador (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  ultimo_numero bigint NOT NULL DEFAULT 0 CHECK (ultimo_numero >= 0)
);

ALTER TABLE public.termos_numeracao_contador ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Editores consultam numeracao de termos" ON public.termos_numeracao_contador;
CREATE POLICY "Editores consultam numeracao de termos" ON public.termos_numeracao_contador
  FOR SELECT TO authenticated USING (public.can_edit(auth.uid()));
REVOKE ALL ON public.termos_numeracao_contador FROM anon, authenticated;
GRANT SELECT ON public.termos_numeracao_contador TO authenticated;

INSERT INTO public.termos_numeracao_contador (id, ultimo_numero)
SELECT true, greatest(
  coalesce((SELECT max(numero) FROM public.importacoes), 0),
  coalesce((SELECT max(numero) FROM public.transferencias_bens_itens), 0)
)
ON CONFLICT (id) DO UPDATE
SET ultimo_numero = greatest(public.termos_numeracao_contador.ultimo_numero, EXCLUDED.ultimo_numero);

CREATE OR REPLACE FUNCTION public.consultar_proximo_numero_transferencia()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  proximo bigint;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_edit(auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissão para gerar transferência';
  END IF;
  SELECT ultimo_numero + 1 INTO proximo FROM public.termos_numeracao_contador WHERE id = true;
  IF proximo IS NULL THEN RAISE EXCEPTION 'Numeração indisponível'; END IF;
  RETURN jsonb_build_object('numero', proximo, 'ano', extract(year FROM timezone('America/Sao_Paulo', now()))::integer);
END;
$function$;
REVOKE ALL ON FUNCTION public.consultar_proximo_numero_transferencia() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consultar_proximo_numero_transferencia() TO authenticated;

CREATE OR REPLACE FUNCTION public.reservar_numero_transferencia(_pedido uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF _pedido IS NULL THEN RAISE EXCEPTION 'Pedido inválido'; END IF;
  -- Compatibilidade com telas já abertas: consultar não reserva nem consome números.
  RETURN public.consultar_proximo_numero_transferencia();
END;
$function$;
REVOKE ALL ON FUNCTION public.reservar_numero_transferencia(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reservar_numero_transferencia(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.aplicar_numero_reservado_transferencia()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- O contador é compartilhado com as importações, assim como a numeração anterior.
  -- A atualização só é confirmada junto com o salvamento completo do termo.
  UPDATE public.termos_numeracao_contador
    SET ultimo_numero = ultimo_numero + 1
    WHERE id = true
    RETURNING ultimo_numero INTO NEW.numero;
  IF NOT FOUND THEN RAISE EXCEPTION 'Numeração indisponível'; END IF;
  RETURN NEW;
END;
$function$;
