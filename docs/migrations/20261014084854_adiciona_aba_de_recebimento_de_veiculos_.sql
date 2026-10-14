-- Adiciona aba de recebimento de veículos com termos numerados e impressão A4
-- Aplicada no Lovable Cloud pela extensão, com autorização do usuário.
-- Registrada por GeckoAI em 2026-10-14T11:48:54.680Z

CREATE TABLE IF NOT EXISTS public.recebimentos_veiculos_contadores (
  ano integer PRIMARY KEY,
  ultimo_numero bigint NOT NULL DEFAULT 0
);
ALTER TABLE public.recebimentos_veiculos ADD COLUMN IF NOT EXISTS numero bigint;
ALTER TABLE public.recebimentos_veiculos ADD COLUMN IF NOT EXISTS ano integer;
ALTER TABLE public.recebimentos_veiculos ADD COLUMN IF NOT EXISTS criado_em timestamptz NOT NULL DEFAULT now();
WITH numerados AS (
  SELECT bem_id, extract(year FROM atualizado_em AT TIME ZONE 'America/Sao_Paulo')::integer AS ano_base,
    row_number() OVER (PARTITION BY extract(year FROM atualizado_em AT TIME ZONE 'America/Sao_Paulo') ORDER BY atualizado_em, bem_id) AS sequencia
  FROM public.recebimentos_veiculos WHERE numero IS NULL
)
UPDATE public.recebimentos_veiculos r SET numero = n.sequencia + coalesce((SELECT max(e.numero) FROM public.recebimentos_veiculos e WHERE e.ano = n.ano_base), 0), ano = n.ano_base, criado_em = r.atualizado_em
FROM numerados n WHERE r.bem_id = n.bem_id AND r.numero IS NULL;
INSERT INTO public.recebimentos_veiculos_contadores (ano, ultimo_numero)
SELECT ano, max(numero) FROM public.recebimentos_veiculos WHERE ano IS NOT NULL GROUP BY ano
ON CONFLICT (ano) DO UPDATE SET ultimo_numero = greatest(recebimentos_veiculos_contadores.ultimo_numero, EXCLUDED.ultimo_numero);
CREATE UNIQUE INDEX IF NOT EXISTS recebimentos_veiculos_numero_ano_uidx ON public.recebimentos_veiculos (ano, numero);
ALTER TABLE public.recebimentos_veiculos_contadores ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.numerar_recebimento_veiculo()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
  INSERT INTO public.recebimentos_veiculos_contadores (ano, ultimo_numero) VALUES (NEW.ano, 1)
  ON CONFLICT (ano) DO UPDATE SET ultimo_numero = recebimentos_veiculos_contadores.ultimo_numero + 1
  RETURNING ultimo_numero INTO NEW.numero;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.numerar_recebimento_veiculo() FROM PUBLIC;
CREATE OR REPLACE TRIGGER numerar_recebimento_veiculo_trigger
BEFORE INSERT OR UPDATE ON public.recebimentos_veiculos
FOR EACH ROW EXECUTE FUNCTION public.numerar_recebimento_veiculo();
ALTER TABLE public.recebimentos_veiculos ALTER COLUMN numero SET NOT NULL;
ALTER TABLE public.recebimentos_veiculos ALTER COLUMN ano SET NOT NULL;

ALTER TABLE public.recebimentos_veiculos_contadores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "consulta sequencia de recebimentos" ON public.recebimentos_veiculos_contadores;
CREATE POLICY "consulta sequencia de recebimentos" ON public.recebimentos_veiculos_contadores FOR SELECT TO authenticated USING (true);
