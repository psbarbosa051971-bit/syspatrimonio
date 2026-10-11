-- Cria termos de responsabilidade numerados por importação HTML e adiciona impressão
-- Aplicada no Lovable Cloud pela extensão, com autorização do usuário.
-- Registrada por GeckoAI em 2026-10-11T01:22:02.968Z

ALTER TABLE public.importacoes ADD COLUMN IF NOT EXISTS termo_snapshot jsonb;
ALTER TABLE public.importacoes ADD COLUMN IF NOT EXISTS termo_ano integer;

CREATE OR REPLACE FUNCTION public.importar_bens_html(_sala_id uuid, _arquivo text, _bens jsonb, _cabecalho jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  resultado jsonb;
  lote public.importacoes%ROWTYPE;
  local_atual public.salas%ROWTYPE;
  departamento_atual public.departamentos%ROWTYPE;
  nome_responsavel text;
  cpf_responsavel text;
  itens jsonb;
  ano integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_edit(auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissão para importar';
  END IF;
  IF jsonb_typeof(_cabecalho) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Cabeçalho do termo inválido';
  END IF;
  SELECT * INTO local_atual FROM public.salas WHERE id = _sala_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Local não encontrado'; END IF;
  SELECT * INTO departamento_atual FROM public.departamentos WHERE id = local_atual.departamento_id;
  SELECT p.nome, p.cpf INTO nome_responsavel, cpf_responsavel
    FROM public.user_salas us JOIN public.profiles p ON p.id = us.user_id
    WHERE us.sala_id = _sala_id ORDER BY p.created_at, p.id LIMIT 1;
  IF jsonb_typeof(_bens) IS DISTINCT FROM 'array' OR jsonb_array_length(_bens) = 0 THEN
    RAISE EXCEPTION 'Nenhum bem encontrado no HTML';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(_bens) b
    WHERE jsonb_typeof(b) IS DISTINCT FROM 'object'
      OR NULLIF(trim(b->>'codigo_red'), '') IS NULL
      OR NULLIF(trim(b->>'descricao'), '') IS NULL
      OR jsonb_typeof(b->'valor') IS DISTINCT FROM 'number') THEN
    RAISE EXCEPTION 'O HTML contém dados de bens inválidos';
  END IF;
  SELECT jsonb_agg(jsonb_build_object('codigo_red', b.codigo_red, 'descricao', b.descricao,
      'valor', b.valor, 'incorporacao', b.incorporacao, 'tipo', b.tipo) ORDER BY b.codigo_red)
    INTO itens FROM (
      SELECT DISTINCT ON (x.codigo_red) x.* FROM jsonb_to_recordset(_bens)
        AS x(codigo_red text, descricao text, valor numeric, incorporacao text, tipo text)
      ORDER BY x.codigo_red
    ) b;
  resultado := public.importar_bens_pdf(_sala_id, _arquivo, itens);
  SELECT * INTO STRICT lote FROM public.importacoes WHERE numero = (resultado->>'numero')::bigint;
  ano := extract(year FROM lote.created_at AT TIME ZONE 'America/Sao_Paulo')::integer;
  UPDATE public.importacoes SET termo_ano = ano,
    termo_snapshot = jsonb_build_object(
      'local', local_atual.nome,
      'endereco', COALESCE(NULLIF(_cabecalho->>'endereco', ''), local_atual.endereco, ''),
      'historico', COALESCE(_cabecalho->>'historico', ''),
      'data_origem', COALESCE(_cabecalho->>'data', ''),
      'departamento', COALESCE(departamento_atual.departamento, ''),
      'diretor', COALESCE(departamento_atual.diretor, ''),
      'almoxarifado', COALESCE(departamento_atual.almoxarifado, ''),
      'endereco_departamento', COALESCE(departamento_atual.endereco, ''),
      'responsavel', COALESCE(NULLIF(nome_responsavel, ''), local_atual.responsavel, ''),
      'cpf', COALESCE(cpf_responsavel, ''),
      'bens', itens)
    WHERE id = lote.id;
  RETURN resultado || jsonb_build_object('importacao_id', lote.id, 'termo_numero', lote.numero::text || '/' || ano::text);
END;
$function$;
REVOKE ALL ON FUNCTION public.importar_bens_html(uuid, text, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.importar_bens_html(uuid, text, jsonb, jsonb) TO authenticated;
