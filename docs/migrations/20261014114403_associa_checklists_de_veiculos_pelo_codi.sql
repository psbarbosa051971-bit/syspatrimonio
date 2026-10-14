-- Associa checklists de veículos pelo código RED sem exigir HTML
-- Aplicada no Lovable Cloud pela extensão, com autorização do usuário.
-- Registrada por GeckoAI em 2026-10-14T14:44:03.956Z

CREATE OR REPLACE FUNCTION public.associar_checklist_veiculo_por_red(_checklist_id uuid, _codigo_red text, _sala_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
 checklist public.checklists_veiculos%ROWTYPE;
 bem public.bens%ROWTYPE;
 codigo text;
 modelo text;
 descricao_veiculo text;
 valor_texto text;
 valor_veiculo numeric;
 termo jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Entre novamente para associar o checklist.'; END IF;
 SELECT * INTO checklist FROM public.checklists_veiculos WHERE id = _checklist_id FOR UPDATE;
 IF NOT FOUND OR NOT (checklist.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role)) THEN
  RAISE EXCEPTION 'Checklist não disponível para esta conta.';
 END IF;
 IF checklist.bem_id IS NOT NULL THEN RAISE EXCEPTION 'Este checklist já foi associado a um patrimônio.'; END IF;
 codigo := public.chave_codigo_red_importacao(_codigo_red);
 IF codigo IS NULL OR codigo !~ '^[0-9]{1,50}$' THEN RAISE EXCEPTION 'Informe um código RED numérico válido.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('codigo-red:' || codigo, 0));
 SELECT * INTO bem FROM public.bens WHERE public.chave_codigo_red_importacao(codigo_red) = codigo;
 IF FOUND THEN
  IF bem.sala_id IS NULL OR NOT public.pode_ver_sala(auth.uid(), bem.sala_id) THEN
   RAISE EXCEPTION 'Este código RED já está cadastrado, mas não está disponível em um Local Físico acessível à sua conta. Solicite a conferência ao administrador.';
  END IF;
 ELSE
  IF NOT public.can_edit(auth.uid()) THEN RAISE EXCEPTION 'O código RED ainda não está cadastrado. Peça a um administrador ou operador para cadastrá-lo.'; END IF;
  IF _sala_id IS NULL OR NOT public.pode_ver_sala(auth.uid(), _sala_id) THEN RAISE EXCEPTION 'Escolha um Local Físico disponível para cadastrar o veículo.'; END IF;
  PERFORM 1 FROM public.salas WHERE id = _sala_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Local Físico não encontrado.'; END IF;
  modelo := btrim(coalesce(checklist.dados->>'modelo_veiculo', ''));
  IF modelo = '' THEN RAISE EXCEPTION 'Preencha o modelo do veículo no checklist antes de cadastrar o código RED.'; END IF;
  valor_texto := btrim(coalesce(checklist.dados->>'valor', ''));
  IF valor_texto = '' THEN valor_veiculo := 0;
  ELSE
   IF valor_texto !~ '^[0-9]+([.][0-9]{1,2})?$' OR length(valor_texto) > 13 THEN RAISE EXCEPTION 'Confira o campo Valor do checklist.'; END IF;
   valor_veiculo := valor_texto::numeric;
   IF valor_veiculo >= 10000000000 THEN RAISE EXCEPTION 'O valor do veículo excede o limite permitido.'; END IF;
  END IF;
  descricao_veiculo := concat_ws(E'\n', 'VEÍCULO/MODELO: ' || modelo,
   CASE WHEN btrim(coalesce(checklist.dados->>'ano_modelo','')) <> '' THEN 'ANO/MOD: ' || (checklist.dados->>'ano_modelo') END,
   CASE WHEN btrim(coalesce(checklist.dados->>'chassi','')) <> '' THEN 'CHASSI: ' || (checklist.dados->>'chassi') END,
   CASE WHEN btrim(coalesce(checklist.dados->>'motor','')) <> '' THEN 'MOTOR Nº: ' || (checklist.dados->>'motor') END,
   CASE WHEN btrim(coalesce(checklist.dados->>'renavam','')) <> '' THEN 'RENAVAM: ' || (checklist.dados->>'renavam') END,
   CASE WHEN btrim(coalesce(checklist.dados->>'placa','')) <> '' THEN 'PLACA: ' || (checklist.dados->>'placa') END,
   CASE WHEN btrim(coalesce(checklist.dados->>'km','')) <> '' THEN 'KM: ' || (checklist.dados->>'km') END);
  INSERT INTO public.bens(user_id, sala_id, codigo_red, descricao, valor, tipo)
   VALUES(auth.uid(), _sala_id, codigo, descricao_veiculo, valor_veiculo, 'VEÍCULO') RETURNING * INTO bem;
 END IF;
 termo := public.associar_checklist_veiculo(_checklist_id, bem.id);
 RETURN jsonb_build_object('bem', to_jsonb(bem), 'termo', termo);
END;
$function$;
REVOKE ALL ON FUNCTION public.associar_checklist_veiculo_por_red(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.associar_checklist_veiculo_por_red(uuid, text, uuid) TO authenticated;
