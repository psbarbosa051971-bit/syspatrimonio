-- Elimina códigos RED duplicados e garante cadastro único entre salas
-- Aplicada no Lovable Cloud pela extensão, com autorização do usuário.
-- Registrada por GeckoAI em 2026-10-13T17:28:57.221Z

WITH classificados AS (
  SELECT b.id, row_number() OVER (
    PARTITION BY public.chave_codigo_red_importacao(b.codigo_red)
    ORDER BY coalesce(i.created_at, b.created_at) DESC, b.created_at DESC, b.id DESC
  ) AS posicao
  FROM public.bens b
  LEFT JOIN public.importacoes i ON i.id = b.importacao_id
)
DELETE FROM public.bens b USING classificados c
WHERE b.id = c.id AND c.posicao > 1;

CREATE UNIQUE INDEX IF NOT EXISTS bens_codigo_red_unico_global_idx
  ON public.bens (public.chave_codigo_red_importacao(codigo_red));
