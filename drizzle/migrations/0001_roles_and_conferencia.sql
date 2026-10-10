create type public.app_role as enum ('admin','operador','visualizador');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);
grant select on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role public.app_role not null,
  unique (user_id)
);
grant select, insert, update, delete on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;
create or replace function public.can_edit(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role in ('admin','operador'))
$$;
create or replace function public.has_any_role(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id)
$$;

create policy "own or admin read profiles" on public.profiles for select to authenticated
  using (id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "own or admin read roles" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "admin insert roles" on public.user_roles for insert to authenticated
  with check (public.has_role(auth.uid(),'admin'));
create policy "admin update roles" on public.user_roles for update to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create policy "admin delete roles" on public.user_roles for delete to authenticated
  using (public.has_role(auth.uid(),'admin'));

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email) on conflict do nothing;
  insert into public.user_roles (user_id, role)
  values (new.id, case when exists (select 1 from public.user_roles) then 'visualizador'::public.app_role else 'admin'::public.app_role end)
  on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- backfill existing users
insert into public.profiles (id, email) select id, email from auth.users on conflict do nothing;
insert into public.user_roles (user_id, role)
  select id, 'admin'::public.app_role from auth.users on conflict do nothing;

alter table public.salas add column responsavel text;
alter table public.bens add column conferido boolean not null default false;

-- shared data by role
drop policy "users manage own departamentos" on public.departamentos;
drop policy "users manage own salas" on public.salas;
drop policy "users manage own bens" on public.bens;

create policy "role read departamentos" on public.departamentos for select to authenticated using (public.has_any_role(auth.uid()));
create policy "editor write departamentos" on public.departamentos for all to authenticated using (public.can_edit(auth.uid())) with check (public.can_edit(auth.uid()));
create policy "role read salas" on public.salas for select to authenticated using (public.has_any_role(auth.uid()));
create policy "editor write salas" on public.salas for all to authenticated using (public.can_edit(auth.uid())) with check (public.can_edit(auth.uid()));
create policy "role read bens" on public.bens for select to authenticated using (public.has_any_role(auth.uid()));
create policy "editor write bens" on public.bens for all to authenticated using (public.can_edit(auth.uid())) with check (public.can_edit(auth.uid()));

create or replace function public.marcar_conferido(_bem_id uuid, _valor boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_any_role(auth.uid()) then raise exception 'sem permissão'; end if;
  update public.bens set conferido = _valor where id = _bem_id;
end $$;
revoke execute on function public.marcar_conferido(uuid, boolean) from anon, public;
grant execute on function public.marcar_conferido(uuid, boolean) to authenticated;