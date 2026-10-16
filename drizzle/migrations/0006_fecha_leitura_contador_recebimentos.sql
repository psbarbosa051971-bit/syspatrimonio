DROP POLICY IF EXISTS "consulta sequencia de recebimentos" ON public.recebimentos_veiculos_contadores;
REVOKE ALL ON public.recebimentos_veiculos_contadores FROM anon, authenticated;
GRANT ALL ON public.recebimentos_veiculos_contadores TO service_role;