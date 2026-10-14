-- Adiciona checklist prévio de veículos com leitura de NF-e e associação ao código RED
-- Aplicada no Lovable Cloud pela extensão, com autorização do usuário.
-- Registrada por GeckoAI em 2026-10-14T12:46:14.458Z

CREATE TABLE IF NOT EXISTS public.checklists_veiculos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  dados jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(dados) = 'object'),
  bem_id uuid UNIQUE REFERENCES public.bens(id),
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS checklists_veiculos_usuario_idx ON public.checklists_veiculos(user_id, criado_em DESC);
ALTER TABLE public.checklists_veiculos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "consulta checklists proprios ou do local" ON public.checklists_veiculos;
CREATE POLICY "consulta checklists proprios ou do local" ON public.checklists_veiculos FOR SELECT TO authenticated USING (
 user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role) OR EXISTS (SELECT 1 FROM public.bens b WHERE b.id = bem_id AND b.sala_id IS NOT NULL AND public.pode_ver_sala(auth.uid(), b.sala_id))
);
DROP POLICY IF EXISTS "cria checklist sem patrimonio" ON public.checklists_veiculos;
CREATE POLICY "cria checklist sem patrimonio" ON public.checklists_veiculos FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND bem_id IS NULL);
DROP POLICY IF EXISTS "edita checklist pendente" ON public.checklists_veiculos;
CREATE POLICY "edita checklist pendente" ON public.checklists_veiculos FOR UPDATE TO authenticated USING (
 bem_id IS NULL AND (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
) WITH CHECK (bem_id IS NULL AND (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role)));
GRANT SELECT, INSERT, UPDATE ON public.checklists_veiculos TO authenticated;
CREATE OR REPLACE FUNCTION public.associar_checklist_veiculo(_checklist_id uuid, _bem_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE checklist public.checklists_veiculos%ROWTYPE; bem public.bens%ROWTYPE; termo public.recebimentos_veiculos%ROWTYPE; nome_local text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Entre novamente para associar o checklist.'; END IF;
 SELECT * INTO checklist FROM public.checklists_veiculos WHERE id = _checklist_id FOR UPDATE;
 IF NOT FOUND OR NOT (checklist.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role)) THEN
   RAISE EXCEPTION 'Checklist não disponível para esta conta.';
 END IF;
 IF checklist.bem_id IS NOT NULL THEN RAISE EXCEPTION 'Este checklist já foi associado a um patrimônio.'; END IF;
 SELECT * INTO bem FROM public.bens WHERE id = _bem_id FOR SHARE;
 IF NOT FOUND OR bem.sala_id IS NULL THEN RAISE EXCEPTION 'Veículo sem Local Físico disponível.'; END IF;
 IF NOT public.pode_ver_sala(auth.uid(), bem.sala_id) THEN RAISE EXCEPTION 'Você não tem acesso ao Local Físico deste veículo.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_bem_id::text, 815));
 IF EXISTS (SELECT 1 FROM public.recebimentos_veiculos WHERE bem_id = _bem_id) THEN
   RAISE EXCEPTION 'Este veículo já possui um termo. Escolha outro patrimônio para não sobrescrever o recebimento existente.';
 END IF;
 SELECT nome INTO nome_local FROM public.salas WHERE id = bem.sala_id;
 INSERT INTO public.recebimentos_veiculos(bem_id, dados, atualizado_por, atualizado_em)
 VALUES (_bem_id, jsonb_build_object('orgao', 'PREFEITURA MUNICIPAL DE ITAJUBÁ', 'cidade', 'Itajubá') || checklist.dados || jsonb_build_object('local_fisico', nome_local, 'data_termo', to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD')), auth.uid(), now())
 RETURNING * INTO termo;
 UPDATE public.checklists_veiculos SET bem_id = _bem_id, atualizado_em = now() WHERE id = _checklist_id;
 RETURN to_jsonb(termo);
END;
$function$;
REVOKE ALL ON FUNCTION public.associar_checklist_veiculo(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.associar_checklist_veiculo(uuid, uuid) TO authenticated;
