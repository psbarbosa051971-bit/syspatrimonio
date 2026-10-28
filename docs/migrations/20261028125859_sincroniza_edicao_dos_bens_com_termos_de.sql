-- Sincroniza edição dos bens com termos de responsabilidade da sala
-- Aplicada no Lovable Cloud pela extensão, com autorização do usuário.
-- Registrada por GeckoAI em 2026-10-28T15:58:59.725Z

CREATE OR REPLACE FUNCTION public.sincronizar_dados_bem_nos_termos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.sala_id IS NULL THEN RETURN NEW; END IF;

  -- Mantém os termos de outras salas como histórico e não inclui ou remove bens.
  -- Executa também ao salvar sem alterações para corrigir uma cópia desatualizada.
  UPDATE public.importacoes AS i
  SET termo_snapshot = jsonb_set(
    i.termo_snapshot,
    '{bens}',
    (
      SELECT jsonb_agg(
        CASE
          WHEN public.chave_codigo_red_importacao(item.bem->>'codigo_red') = public.chave_codigo_red_importacao(NEW.codigo_red)
          THEN item.bem || jsonb_build_object(
            'descricao', NEW.descricao,
            'valor', NEW.valor,
            'incorporacao', NEW.incorporacao,
            'tipo', NEW.tipo
          )
          ELSE item.bem
        END ORDER BY item.ordem
      )
      FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(i.termo_snapshot->'bens') = 'array'
          THEN i.termo_snapshot->'bens' ELSE '[]'::jsonb END
      ) WITH ORDINALITY AS item(bem, ordem)
    ),
    false
  )
  WHERE i.sala_id = NEW.sala_id
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(i.termo_snapshot->'bens') = 'array'
          THEN i.termo_snapshot->'bens' ELSE '[]'::jsonb END
      ) AS item(bem)
      WHERE public.chave_codigo_red_importacao(item.bem->>'codigo_red') = public.chave_codigo_red_importacao(NEW.codigo_red)
    );
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.sincronizar_dados_bem_nos_termos() FROM PUBLIC;

CREATE OR REPLACE TRIGGER sincronizar_dados_bem_nos_termos
AFTER UPDATE OF descricao, valor, incorporacao, tipo ON public.bens
FOR EACH ROW
EXECUTE FUNCTION public.sincronizar_dados_bem_nos_termos();
