create table public.user_salas (
  user_id uuid not null references auth.users(id) on delete cascade,
  sala_id uuid not null references public.salas(id) on delete cascade,
  primary key (user_id, sala_id)
);
grant select, insert, delete on public.user_salas to authenticated;
grant all on public.user_salas to service_role;
alter table public.user_salas enable row level security;
create policy "own or admin read user_salas" on public.user_salas for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "admin write user_salas" on public.user_salas for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create or replace function public.pode_ver_sala(_user_id uuid, _sala_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.can_edit(_user_id)
    or exists (select 1 from public.user_salas where user_id = _user_id and sala_id = _sala_id)
$$;

drop policy "role read salas" on public.salas;
drop policy "role read bens" on public.bens;
drop policy "role read departamentos" on public.departamentos;
create policy "role read departamentos" on public.departamentos for select to authenticated using (public.can_edit(auth.uid()));
create policy "role read salas" on public.salas for select to authenticated using (public.pode_ver_sala(auth.uid(), id));
create policy "role read bens" on public.bens for select to authenticated using (sala_id is not null and public.pode_ver_sala(auth.uid(), sala_id));

create or replace function public.marcar_conferido(_bem_id uuid, _valor boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.bens b where b.id = _bem_id and public.pode_ver_sala(auth.uid(), b.sala_id)) then
    raise exception 'sem permissão';
  end if;
  update public.bens set conferido = _valor where id = _bem_id;
end $$;