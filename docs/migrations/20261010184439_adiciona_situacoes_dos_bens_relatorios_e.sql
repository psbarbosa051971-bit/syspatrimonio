-- Adiciona situações dos bens, relatórios e alertas para administradores
-- Aplicada no Lovable Cloud pela extensão, com autorização do usuário.
-- Registrada por GeckoAI em 2026-10-10T21:44:39.631Z

CREATE TABLE IF NOT EXISTS public.solicitacoes_bens (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 bem_id uuid UNIQUE REFERENCES public.bens(id) ON DELETE SET NULL,
 sala_id uuid REFERENCES public.salas(id) ON DELETE SET NULL,
 user_id uuid NOT NULL DEFAULT auth.uid(),
 tipo text NOT NULL CHECK (tipo IN ('transferencia', 'inservivel')),
 destino text,
 observacao text NOT NULL DEFAULT '',
 codigo_red text NOT NULL,
 descricao text NOT NULL,
 valor numeric(12,2) NOT NULL DEFAULT 0,
 local_origem text NOT NULL,
 ativa boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT transferencia_exige_destino CHECK (tipo <> 'transferencia' OR length(btrim(coalesce(destino, ''))) BETWEEN 1 AND 300)
);
CREATE TABLE IF NOT EXISTS public.solicitacoes_bens_leituras (
 solicitacao_id uuid NOT NULL REFERENCES public.solicitacoes_bens(id) ON DELETE CASCADE,
 admin_id uuid NOT NULL DEFAULT auth.uid(),
 versao_lida timestamptz NOT NULL,
 PRIMARY KEY (solicitacao_id, admin_id)
);
CREATE INDEX IF NOT EXISTS solicitacoes_bens_ativas_idx ON public.solicitacoes_bens (ativa, updated_at DESC);
CREATE INDEX IF NOT EXISTS solicitacoes_bens_sala_idx ON public.solicitacoes_bens (sala_id);
ALTER TABLE public.solicitacoes_bens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.solicitacoes_bens_leituras ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "consulta solicitacoes autorizadas" ON public.solicitacoes_bens;
CREATE POLICY "consulta solicitacoes autorizadas" ON public.solicitacoes_bens FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR (sala_id IS NOT NULL AND public.pode_ver_sala(auth.uid(), sala_id)));
DROP POLICY IF EXISTS "admin consulta proprias leituras" ON public.solicitacoes_bens_leituras;
CREATE POLICY "admin consulta proprias leituras" ON public.solicitacoes_bens_leituras FOR SELECT TO authenticated USING (admin_id = auth.uid() AND public.has_role(auth.uid(), 'admin'::public.app_role));
DROP POLICY IF EXISTS "admin registra propria leitura" ON public.solicitacoes_bens_leituras;
CREATE POLICY "admin registra propria leitura" ON public.solicitacoes_bens_leituras FOR INSERT TO authenticated WITH CHECK (admin_id = auth.uid() AND public.has_role(auth.uid(), 'admin'::public.app_role));
DROP POLICY IF EXISTS "admin atualiza propria leitura" ON public.solicitacoes_bens_leituras;
CREATE POLICY "admin atualiza propria leitura" ON public.solicitacoes_bens_leituras FOR UPDATE TO authenticated USING (admin_id = auth.uid() AND public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (admin_id = auth.uid() AND public.has_role(auth.uid(), 'admin'::public.app_role));
GRANT SELECT ON public.solicitacoes_bens TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.solicitacoes_bens_leituras TO authenticated;
CREATE OR REPLACE FUNCTION public.salvar_observacao_solicitacao(_bem_id uuid, _obs text, _tipo text, _destino text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE _bem public.bens%ROWTYPE; _origem text;
BEGIN
 SELECT * INTO _bem FROM public.bens WHERE id = _bem_id FOR UPDATE;
 IF NOT FOUND OR auth.uid() IS NULL OR NOT public.pode_ver_sala(auth.uid(), _bem.sala_id) THEN
  RAISE EXCEPTION 'Você não tem permissão para editar este bem.';
 END IF;
 IF _tipo IS NOT NULL AND _tipo NOT IN ('transferencia', 'inservivel') THEN
  RAISE EXCEPTION 'Opção inválida.';
 END IF;
 IF length(coalesce(_obs, '')) > 2000 THEN RAISE EXCEPTION 'Use até 2000 caracteres na observação.'; END IF;
 IF _tipo = 'transferencia' AND (length(btrim(coalesce(_destino, ''))) < 1 OR length(btrim(_destino)) > 300) THEN
  RAISE EXCEPTION 'Informe o local de destino com até 300 caracteres.';
 END IF;
 UPDATE public.bens SET observacao = coalesce(_obs, '') WHERE id = _bem_id;
 IF _tipo IS NULL THEN
  UPDATE public.solicitacoes_bens SET ativa = false, updated_at = clock_timestamp() WHERE bem_id = _bem_id AND ativa;
  RETURN;
 END IF;
 SELECT nome INTO _origem FROM public.salas WHERE id = _bem.sala_id;
 INSERT INTO public.solicitacoes_bens (bem_id, sala_id, user_id, tipo, destino, observacao, codigo_red, descricao, valor, local_origem)
 VALUES (_bem.id, _bem.sala_id, auth.uid(), _tipo, CASE WHEN _tipo = 'transferencia' THEN btrim(_destino) ELSE NULL END, coalesce(_obs, ''), _bem.codigo_red, _bem.descricao, _bem.valor, coalesce(_origem, 'Local removido'))
 ON CONFLICT (bem_id) DO UPDATE SET sala_id = EXCLUDED.sala_id, user_id = EXCLUDED.user_id, tipo = EXCLUDED.tipo, destino = EXCLUDED.destino, observacao = EXCLUDED.observacao, codigo_red = EXCLUDED.codigo_red, descricao = EXCLUDED.descricao, valor = EXCLUDED.valor, local_origem = EXCLUDED.local_origem, ativa = true, updated_at = clock_timestamp()
 WHERE (solicitacoes_bens.tipo, solicitacoes_bens.destino, solicitacoes_bens.observacao, solicitacoes_bens.codigo_red, solicitacoes_bens.descricao, solicitacoes_bens.valor, solicitacoes_bens.local_origem, solicitacoes_bens.ativa)
 IS DISTINCT FROM (EXCLUDED.tipo, EXCLUDED.destino, EXCLUDED.observacao, EXCLUDED.codigo_red, EXCLUDED.descricao, EXCLUDED.valor, EXCLUDED.local_origem, true);
END;
$function$;
REVOKE ALL ON FUNCTION public.salvar_observacao_solicitacao(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.salvar_observacao_solicitacao(uuid, text, text, text) TO authenticated;
