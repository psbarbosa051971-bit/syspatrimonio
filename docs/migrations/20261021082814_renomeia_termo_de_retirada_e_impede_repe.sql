-- Renomeia termo de retirada e impede repetição de números entre novos termos
-- Aplicada no Lovable Cloud pela extensão, com autorização do usuário.
-- Registrada por GeckoAI em 2026-10-21T11:28:14.663Z

CREATE TABLE IF NOT EXISTS public.retiradas_veiculos (
  bem_id uuid PRIMARY KEY REFERENCES public.recebimentos_veiculos(bem_id),
  numero bigint NOT NULL UNIQUE CHECK (numero > 0),
  ano integer NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  criado_por uuid NOT NULL REFERENCES auth.users(id)
);
ALTER TABLE public.retiradas_veiculos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "consulta retirada do local" ON public.retiradas_veiculos;
CREATE POLICY "consulta retirada do local" ON public.retiradas_veiculos FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.bens b WHERE b.id = retiradas_veiculos.bem_id AND b.sala_id IS NOT NULL AND public.pode_ver_sala(auth.uid(), b.sala_id)));
REVOKE INSERT, UPDATE, DELETE ON public.retiradas_veiculos FROM anon, authenticated;
GRANT SELECT ON public.retiradas_veiculos TO authenticated;

INSERT INTO public.termos_numeracao_contador (id, ultimo_numero)
SELECT true, greatest(
  coalesce((SELECT max(numero) FROM public.importacoes), 0),
  coalesce((SELECT max(numero) FROM public.recebimentos_veiculos), 0),
  coalesce((SELECT max(numero) FROM public.retiradas_veiculos), 0),
  coalesce((SELECT max(numero) FROM public.transferencias_numeros_reservados), 0)
)
ON CONFLICT (id) DO UPDATE SET ultimo_numero = greatest(termos_numeracao_contador.ultimo_numero, EXCLUDED.ultimo_numero);

CREATE OR REPLACE FUNCTION public.numerar_recebimento_veiculo()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE existente public.recebimentos_veiculos%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.numero := OLD.numero;
    NEW.ano := OLD.ano;
    NEW.criado_em := OLD.criado_em;
    RETURN NEW;
  END IF;
  SELECT * INTO existente FROM public.recebimentos_veiculos WHERE bem_id = NEW.bem_id;
  IF FOUND THEN
    NEW.numero := existente.numero;
    NEW.ano := existente.ano;
    NEW.criado_em := existente.criado_em;
    RETURN NEW;
  END IF;
  NEW.ano := extract(year FROM now() AT TIME ZONE 'America/Sao_Paulo')::integer;
  NEW.criado_em := now();
  UPDATE public.termos_numeracao_contador SET ultimo_numero = ultimo_numero + 1
    WHERE id = true RETURNING ultimo_numero INTO NEW.numero;
  IF NOT FOUND THEN RAISE EXCEPTION 'Numeração indisponível'; END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.emitir_retirada_veiculo(_bem_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE documento public.retiradas_veiculos%ROWTYPE; proximo bigint;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.bens b WHERE b.id = _bem_id AND b.sala_id IS NOT NULL
      AND public.pode_ver_sala(auth.uid(), b.sala_id)
  ) THEN RAISE EXCEPTION 'Você não tem permissão para emitir a retirada deste veículo.'; END IF;
  PERFORM 1 FROM public.recebimentos_veiculos WHERE bem_id = _bem_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Salve o recebimento do veículo antes de emitir a retirada.'; END IF;
  SELECT * INTO documento FROM public.retiradas_veiculos WHERE bem_id = _bem_id;
  IF FOUND THEN RETURN to_jsonb(documento); END IF;
  UPDATE public.termos_numeracao_contador SET ultimo_numero = ultimo_numero + 1
    WHERE id = true RETURNING ultimo_numero INTO proximo;
  IF NOT FOUND THEN RAISE EXCEPTION 'Numeração indisponível'; END IF;
  INSERT INTO public.retiradas_veiculos (bem_id, numero, ano, criado_por)
  VALUES (_bem_id, proximo, extract(year FROM now() AT TIME ZONE 'America/Sao_Paulo')::integer, auth.uid())
  RETURNING * INTO documento;
  RETURN to_jsonb(documento);
END;
$function$;
REVOKE ALL ON FUNCTION public.emitir_retirada_veiculo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.emitir_retirada_veiculo(uuid) TO authenticated;
