-- Exibe número reservado no cabeçalho antes de salvar a transferência
-- Aplicada no Lovable Cloud pela extensão, com autorização do usuário.
-- Registrada por GeckoAI em 2026-10-16T11:33:54.356Z

CREATE TABLE IF NOT EXISTS public.transferencias_numeros_reservados (
  pedido uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  numero bigint NOT NULL UNIQUE,
  ano integer NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.transferencias_numeros_reservados ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Usuarios consultam suas reservas" ON public.transferencias_numeros_reservados;
CREATE POLICY "Usuarios consultam suas reservas" ON public.transferencias_numeros_reservados FOR SELECT TO authenticated USING (user_id = auth.uid() AND public.can_edit(auth.uid()));
REVOKE ALL ON public.transferencias_numeros_reservados FROM anon, authenticated;
GRANT SELECT ON public.transferencias_numeros_reservados TO authenticated;

CREATE OR REPLACE FUNCTION public.reservar_numero_transferencia(_pedido uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  reserva public.transferencias_numeros_reservados%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_edit(auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissão para gerar transferência';
  END IF;
  IF _pedido IS NULL THEN RAISE EXCEPTION 'Pedido inválido'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(_pedido::text, 0));
  SELECT * INTO reserva FROM public.transferencias_numeros_reservados WHERE pedido = _pedido;
  IF FOUND THEN
    IF reserva.user_id <> auth.uid() THEN RAISE EXCEPTION 'Pedido inválido'; END IF;
    RETURN jsonb_build_object('numero', reserva.numero, 'ano', reserva.ano);
  END IF;
  IF EXISTS (SELECT 1 FROM public.importacoes WHERE id = _pedido) THEN
    RAISE EXCEPTION 'Este pedido já foi utilizado';
  END IF;
  INSERT INTO public.transferencias_numeros_reservados(pedido, user_id, numero, ano)
  VALUES (_pedido, auth.uid(), nextval(pg_get_serial_sequence('public.importacoes', 'numero')::regclass), extract(year FROM timezone('America/Sao_Paulo', now()))::integer)
  RETURNING * INTO reserva;
  RETURN jsonb_build_object('numero', reserva.numero, 'ano', reserva.ano);
END;
$function$;
REVOKE ALL ON FUNCTION public.reservar_numero_transferencia(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reservar_numero_transferencia(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.aplicar_numero_reservado_transferencia()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  reserva public.transferencias_numeros_reservados%ROWTYPE;
BEGIN
  IF NEW.arquivo LIKE 'Transferência %' THEN
    SELECT * INTO reserva FROM public.transferencias_numeros_reservados WHERE pedido = NEW.id;
    IF FOUND THEN
      IF reserva.user_id IS DISTINCT FROM NEW.user_id OR reserva.user_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'Reserva de transferência inválida';
      END IF;
      NEW.numero := reserva.numero;
      NEW.termo_ano := reserva.ano;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.aplicar_numero_reservado_transferencia() FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE TRIGGER aplicar_numero_reservado_transferencia
BEFORE INSERT ON public.importacoes FOR EACH ROW
EXECUTE FUNCTION public.aplicar_numero_reservado_transferencia();
