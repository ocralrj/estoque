-- ============================================================
-- Somente o super admin principal altera o papel de outro super admin
--
-- Idempotente. Depende de: 034_permissao_no_banco.sql
-- ============================================================

drop policy if exists "Super admin atualiza qualquer perfil" on profiles;
create policy "Super admin atualiza qualquer perfil"
  on profiles for update
  to authenticated
  using (
    public.get_user_role()::text = 'super_admin'
    and (
      lower(coalesce(auth.jwt() ->> 'email', '')) = 'jadirconsult@gmail.com'
      or role::text <> 'super_admin'
    )
  )
  with check (
    public.get_user_role()::text = 'super_admin'
  );

create or replace function public.profiles_protege_super_admin_principal()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null
     and old.role::text = 'super_admin'
     and new.role is distinct from old.role
     and lower(coalesce(auth.jwt() ->> 'email', '')) <> 'jadirconsult@gmail.com' then
    raise exception 'Somente o super admin principal pode alterar outro super admin.';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_z_protege_super_admin on profiles;
create trigger profiles_z_protege_super_admin
  before update on profiles
  for each row execute function public.profiles_protege_super_admin_principal();