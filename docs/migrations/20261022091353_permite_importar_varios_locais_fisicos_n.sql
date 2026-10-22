-- Permite importar vários locais físicos no mesmo HTML sem misturar patrimônios
-- Aplicada no Lovable Cloud pela extensão, com autorização do usuário.
-- Registrada por GeckoAI em 2026-10-22T12:13:53.118Z

CREATE OR REPLACE FUNCTION public.importar_bens_html_multiplos_locais(_departamento_id uuid, _arquivo text, _locais jsonb, _gerar_termo boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  grupo jsonb;
  sala public.salas%ROWTYPE;
  destino uuid;
  chave text;
  nome text;
  codigo_local text;
  resultado jsonb;
  resultados jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_edit(auth.uid()) THEN RAISE EXCEPTION 'Sem permissão para importar'; END IF;
  IF _gerar_termo IS NULL OR jsonb_typeof(_locais) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Dados da importação inválidos'; END IF;
  IF jsonb_array_length(_locais) < 2 THEN RAISE EXCEPTION 'Informe os locais físicos do HTML'; END IF;
  PERFORM id FROM public.departamentos WHERE id = _departamento_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Departamento não encontrado'; END IF;
  FOR grupo IN SELECT value FROM jsonb_array_elements(_locais) LOOP
    IF jsonb_typeof(grupo->'bens') IS DISTINCT FROM 'array'
      OR jsonb_typeof(grupo->'existentes') IS DISTINCT FROM 'array'
      OR jsonb_typeof(grupo->'cabecalho') IS DISTINCT FROM 'object'
      OR nullif(btrim(grupo->'cabecalho'->>'local'), '') IS NULL THEN
      RAISE EXCEPTION 'Um local físico não foi identificado corretamente';
    END IF;
    IF jsonb_array_length(grupo->'bens') = 0 THEN RAISE EXCEPTION 'Um local físico está sem bens'; END IF;
  END LOOP;
  IF EXISTS (
    SELECT public.chave_codigo_red_importacao(b->>'codigo_red')
    FROM jsonb_array_elements(_locais) g CROSS JOIN LATERAL jsonb_array_elements(g->'bens') b
    GROUP BY public.chave_codigo_red_importacao(b->>'codigo_red') HAVING count(*) > 1
  ) THEN RAISE EXCEPTION 'Há patrimônios repetidos entre os locais do HTML. Nada foi importado.'; END IF;
  IF EXISTS (
    SELECT coalesce(substring(g->'cabecalho'->>'local' FROM '^\d+'), lower(btrim(g->'cabecalho'->>'local')))
    FROM jsonb_array_elements(_locais) g GROUP BY 1 HAVING count(*) > 1
  ) THEN RAISE EXCEPTION 'Há locais físicos repetidos no pedido de importação'; END IF;
  FOR chave IN
    SELECT DISTINCT public.chave_codigo_red_importacao(b->>'codigo_red')
    FROM jsonb_array_elements(_locais) g CROSS JOIN LATERAL jsonb_array_elements(g->'bens') b ORDER BY 1
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('codigo-red:' || chave, 0));
  END LOOP;
  PERFORM s.id FROM public.salas s WHERE s.departamento_id = _departamento_id OR s.id IN (
    SELECT b.sala_id FROM public.bens b WHERE public.chave_codigo_red_importacao(b.codigo_red) IN (
      SELECT public.chave_codigo_red_importacao(x->>'codigo_red')
      FROM jsonb_array_elements(_locais) g CROSS JOIN LATERAL jsonb_array_elements(g->'bens') x
    )
  ) ORDER BY s.id FOR UPDATE;
  FOR grupo IN SELECT value FROM jsonb_array_elements(_locais) LOOP
    nome := btrim(grupo->'cabecalho'->>'local');
    codigo_local := substring(nome FROM '^\d+');
    destino := nullif(grupo->>'sala_id', '')::uuid;
    IF destino IS NULL THEN
      IF EXISTS (SELECT 1 FROM public.salas s WHERE s.departamento_id = _departamento_id AND (
        (codigo_local IS NOT NULL AND substring(s.nome FROM '^\d+') = codigo_local)
        OR lower(btrim(s.nome)) = lower(nome)
      )) THEN RAISE EXCEPTION 'O cadastro dos locais mudou. Atualize a página e importe novamente; nada foi importado.'; END IF;
      INSERT INTO public.salas(user_id, departamento_id, nome, endereco, data_termo)
        VALUES (auth.uid(), _departamento_id, nome, nullif(grupo->'cabecalho'->>'endereco', ''), nullif(grupo->'cabecalho'->>'data', ''))
        RETURNING * INTO sala;
      destino := sala.id;
    ELSE
      SELECT * INTO sala FROM public.salas WHERE id = destino AND departamento_id = _departamento_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'Local físico não pertence ao departamento selecionado'; END IF;
      UPDATE public.salas SET nome = nome,
        endereco = coalesce(nullif(sala.endereco, ''), nullif(grupo->'cabecalho'->>'endereco', '')),
        data_termo = coalesce(nullif(grupo->'cabecalho'->>'data', ''), sala.data_termo)
        WHERE id = destino RETURNING * INTO sala;
    END IF;
    resultado := public.importar_bens_html_com_opcao(destino, _arquivo, grupo->'bens', grupo->'cabecalho', grupo->'existentes', _gerar_termo);
    resultados := resultados || jsonb_build_array(resultado || jsonb_build_object('sala', to_jsonb(sala), 'quantidade', jsonb_array_length(grupo->'bens')));
  END LOOP;
  RETURN resultados;
END;
$function$;
REVOKE ALL ON FUNCTION public.importar_bens_html_multiplos_locais(uuid, text, jsonb, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.importar_bens_html_multiplos_locais(uuid, text, jsonb, boolean) TO authenticated;

DO $ajuste$
DECLARE definicao text;
BEGIN
  SELECT pg_get_functiondef('public.importar_bens_html_multiplos_locais(uuid,text,jsonb,boolean)'::regprocedure) INTO definicao;
  definicao := replace(definicao, 'nome text;', 'nome_destino text;');
  definicao := replace(definicao, 'nome := btrim', 'nome_destino := btrim');
  definicao := replace(definicao, 'substring(nome FROM', 'substring(nome_destino FROM');
  definicao := replace(definicao, 'lower(nome)', 'lower(nome_destino)');
  definicao := replace(definicao, '_departamento_id, nome, nullif', '_departamento_id, nome_destino, nullif');
  definicao := replace(definicao, 'SET nome = nome,', 'SET nome = nome_destino,');
  EXECUTE definicao;
END;
$ajuste$;
