-- Adiciona transferência entre salas com seleção de bens e termo de responsabilidade
-- Aplicada no Lovable Cloud pela extensão, com autorização do usuário.
-- Registrada por GeckoAI em 2026-10-11T15:49:55.409Z

CREATE OR REPLACE FUNCTION public.transferir_bens(_destino uuid, _itens jsonb, _pedido uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  destino public.salas%ROWTYPE;
  dept public.departamentos%ROWTYPE;
  lote public.importacoes%ROWTYPE;
  quantidade integer;
  nome_responsavel text;
  cpf_responsavel text;
  snapshot_itens jsonb;
  origens text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_edit(auth.uid()) THEN RAISE EXCEPTION 'Sem permissão para transferir bens'; END IF;
  IF _pedido IS NULL OR _destino IS NULL THEN RAISE EXCEPTION 'Informe o local de destino'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(_pedido::text, 0));
  SELECT * INTO lote FROM public.importacoes WHERE id = _pedido;
  IF FOUND THEN
    IF lote.user_id <> auth.uid() OR lote.sala_id <> _destino OR lote.arquivo NOT LIKE 'Transferência %' THEN RAISE EXCEPTION 'Pedido inválido'; END IF;
    RETURN to_jsonb(lote);
  END IF;
  IF jsonb_typeof(_itens) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Selecione os bens para transferir'; END IF;
  quantidade := jsonb_array_length(_itens);
  IF quantidade < 1 OR quantidade > 500 THEN RAISE EXCEPTION 'Selecione de 1 a 500 bens por transferência'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(_itens) x WHERE jsonb_typeof(x) IS DISTINCT FROM 'object' OR x->>'id' IS NULL OR NOT (x ? 'sala_id')) THEN RAISE EXCEPTION 'Lista de bens inválida'; END IF;
  IF (SELECT count(DISTINCT x.id) FROM jsonb_to_recordset(_itens) AS x(id uuid, sala_id uuid)) <> quantidade THEN RAISE EXCEPTION 'Existem bens repetidos na seleção'; END IF;
  PERFORM s.id FROM public.salas s WHERE s.id = _destino OR s.id IN (SELECT x.sala_id FROM jsonb_to_recordset(_itens) AS x(id uuid, sala_id uuid)) ORDER BY s.id FOR UPDATE;
  SELECT * INTO destino FROM public.salas WHERE id = _destino;
  IF NOT FOUND THEN RAISE EXCEPTION 'Local de destino não encontrado'; END IF;
  PERFORM b.id FROM public.bens b JOIN jsonb_to_recordset(_itens) AS x(id uuid, sala_id uuid) ON x.id=b.id ORDER BY b.id FOR UPDATE OF b;
  IF (SELECT count(*) FROM public.bens b JOIN jsonb_to_recordset(_itens) AS x(id uuid, sala_id uuid) ON x.id=b.id AND b.sala_id IS NOT DISTINCT FROM x.sala_id WHERE b.sala_id IS DISTINCT FROM _destino) <> quantidade THEN
    RAISE EXCEPTION 'Um bem foi removido, mudou de sala ou já está no destino. Filtre novamente antes de salvar';
  END IF;
  IF EXISTS (SELECT 1 FROM public.bens b JOIN jsonb_to_recordset(_itens) AS x(id uuid, sala_id uuid) ON x.id=b.id GROUP BY b.codigo_red HAVING count(*) > 1) THEN RAISE EXCEPTION 'Há códigos RED repetidos na seleção. Confira os locais de origem'; END IF;
  IF EXISTS (SELECT 1 FROM public.bens d JOIN public.bens b ON b.codigo_red=d.codigo_red JOIN jsonb_to_recordset(_itens) AS x(id uuid, sala_id uuid) ON x.id=b.id WHERE d.sala_id=_destino) THEN RAISE EXCEPTION 'O destino já contém um dos códigos RED selecionados'; END IF;
  SELECT * INTO dept FROM public.departamentos WHERE id=destino.departamento_id;
  SELECT p.nome,p.cpf INTO nome_responsavel,cpf_responsavel FROM public.user_salas us JOIN public.profiles p ON p.id=us.user_id WHERE us.sala_id=_destino AND p.nome IS NOT NULL ORDER BY p.created_at DESC,p.id LIMIT 1;
  SELECT jsonb_agg(jsonb_build_object('codigo_red',b.codigo_red,'descricao',b.descricao,'valor',b.valor,'incorporacao',b.incorporacao,'tipo',b.tipo) ORDER BY b.codigo_red), string_agg(DISTINCT coalesce(s.nome,'Sem sala'),', ' ORDER BY coalesce(s.nome,'Sem sala')) INTO snapshot_itens,origens FROM public.bens b JOIN jsonb_to_recordset(_itens) AS x(id uuid, sala_id uuid) ON x.id=b.id LEFT JOIN public.salas s ON s.id=b.sala_id;
  INSERT INTO public.importacoes(id,sala_id,user_id,arquivo,termo_ano,termo_snapshot) VALUES (_pedido,_destino,auth.uid(),'Transferência de bens',extract(year from timezone('America/Sao_Paulo',now()))::integer,
    jsonb_build_object('local',destino.nome,'endereco',coalesce(destino.endereco,''),'historico','Transferência de '||quantidade||' bem(ns). Origem: '||origens||'. Destino: '||destino.nome||'.','data_origem',to_char(timezone('America/Sao_Paulo',now()),'DD/MM/YYYY'),'departamento',coalesce(dept.departamento,''),'diretor',coalesce(dept.diretor,''),'almoxarifado',coalesce(dept.almoxarifado,''),'endereco_departamento',coalesce(dept.endereco,''),'responsavel',coalesce(nome_responsavel,destino.responsavel,''),'cpf',coalesce(cpf_responsavel,''),'bens',snapshot_itens)) RETURNING * INTO lote;
  UPDATE public.bens b SET sala_id=_destino,importacao_id=lote.id,conferido=false,conferencia_finalizada=false FROM jsonb_to_recordset(_itens) AS x(id uuid, sala_id uuid) WHERE b.id=x.id;
  UPDATE public.solicitacoes_bens s SET ativa=false,updated_at=now() WHERE s.ativa AND s.bem_id IN (SELECT x.id FROM jsonb_to_recordset(_itens) AS x(id uuid, sala_id uuid));
  RETURN to_jsonb(lote);
END;
$function$;
REVOKE ALL ON FUNCTION public.transferir_bens(uuid,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.transferir_bens(uuid,jsonb,uuid) TO authenticated;
