ALTER TABLE public.bens ADD COLUMN IF NOT EXISTS observacao text;
ALTER TABLE public.departamentos ALTER COLUMN local SET DEFAULT '';
ALTER TABLE public.departamentos ALTER COLUMN cpd SET DEFAULT '';
CREATE OR REPLACE FUNCTION public.salvar_observacao(_bem_id uuid, _obs text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
begin
  if not exists (select 1 from public.bens b where b.id = _bem_id and public.pode_ver_sala(auth.uid(), b.sala_id)) then
    raise exception 'sem permissão';
  end if;
  update public.bens set observacao = left(_obs, 2000) where id = _bem_id;
end $$;
REVOKE EXECUTE ON FUNCTION public.salvar_observacao(uuid, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.salvar_observacao(uuid, text) TO authenticated;