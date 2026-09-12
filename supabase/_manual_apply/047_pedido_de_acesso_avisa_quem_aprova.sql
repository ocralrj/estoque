-- ============================================================
-- Pedido de acesso avisa sempre quem pode aprovar
--
-- Idempotente. Pode ser reexecutada. Depende de: 028, 034.
-- ============================================================

-- PROBLEMA
-- Em 12/09/2026 o pedido de Manoel Joaquim (DP) entrou na fila, mas o super
-- admin não recebeu aviso nenhum: nem sino, nem linha no painel.
--
-- O gatilho da 028 escolhia UM destino:
--   - departamento com gestor definido → só aquele gestor;
--   - sem gestor → todos com papel super_admin ou gestor.
-- Isso deixa o pedido sem ninguém avisado, ou avisado a quem não vai agir, em
-- três situações:
--   1. O departamento tem gestor: o super admin — que também decide pedidos e
--      é quem está olhando a fila — fica de fora.
--   2. O gestor definido está inativo: `p.active = true` descarta o único
--      destino e o `coalesce` não cobre, porque o array não era nulo. Ninguém
--      é avisado.
--   3. Quem aprova ganhou a permissão pelo grupo (admin:users:create) sem ter
--      papel super_admin/gestor: a tela de Acessos abre, mas o aviso não chega.
--
-- CORREÇÃO
-- O aviso vai para a UNIÃO de:
--   - o gestor do departamento, se ativo;
--   - todo super admin ativo;
--   - todo usuário ativo cujo grupo tem admin:users:create (a mesma permissão
--     que a tela de Acessos e a própria notificação exigem).
-- Se ainda assim ninguém sobrar, cai na gestão inteira (ids_da_gestao).
--
-- E os pedidos que já estão pendentes recebem o aviso que faltou, sem duplicar
-- para quem já tinha.

create or replace function public.destinos_do_pedido_de_acesso(p_departamento text)
returns uuid[]
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  with candidatos as (
    select d.gestor_id as id
      from departamentos d
     where d.nome = p_departamento
       and d.gestor_id is not null
    union
    select p.id
      from profiles p
     where p.role::text = 'super_admin'
    union
    select perfil.id
      from profiles perfil
      join group_permissions gp on gp.group_id = perfil.group_id
      join permissions perm on perm.id = gp.permission_id
     where perm.module = 'admin'
       and perm.resource = 'users'
       and perm.action = 'create'
  ),
  ativos as (
    select c.id
      from candidatos c
      join profiles p on p.id = c.id
     where p.active = true
  )
  select case
    when exists (select 1 from ativos) then (select array_agg(id) from ativos)
    else public.ids_da_gestao()
  end;
$$;

comment on function public.destinos_do_pedido_de_acesso is
  'Quem é avisado de um pedido de acesso: o gestor do departamento, todo super admin e quem tem admin:users:create, desde que ativos. Sem ninguém, a gestão inteira. Um pedido nunca fica sem aviso.';

revoke all on function public.destinos_do_pedido_de_acesso(text) from public, anon, authenticated;

create or replace function public.notifica_pedido_de_acesso()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into notifications (user_id, title, message, link, permissao, origem_id)
  select p.id,
         'Pedido de acesso ao sistema',
         new.nome || ' (' || new.email || ') pediu acesso pelo departamento '
           || new.departamento || '.',
         '/dashboard/admin/acessos',
         'admin:users:create',
         null
  from profiles p
  where p.id = any(public.destinos_do_pedido_de_acesso(new.departamento))
    and p.active = true;

  return new;
end;
$$;

drop trigger if exists pedido_de_acesso_notifica on public.access_requests;
create trigger pedido_de_acesso_notifica
  after insert on public.access_requests
  for each row execute function public.notifica_pedido_de_acesso();

revoke all on function public.notifica_pedido_de_acesso() from public, anon, authenticated;

-- ------------------------------------------------------------
-- Aviso que faltou para os pedidos já pendentes
--
-- A notificação não guarda o id do pedido; a mensagem é única por pedido
-- (nome, e-mail e departamento), então é ela que evita duplicar.
-- ------------------------------------------------------------

insert into notifications (user_id, title, message, link, permissao, origem_id)
select p.id,
       'Pedido de acesso ao sistema',
       r.nome || ' (' || r.email || ') pediu acesso pelo departamento '
         || r.departamento || '.',
       '/dashboard/admin/acessos',
       'admin:users:create',
       null
from public.access_requests r
join profiles p
  on p.id = any(public.destinos_do_pedido_de_acesso(r.departamento))
 and p.active = true
where r.status = 'pendente'
  and not exists (
    select 1 from notifications n
     where n.user_id = p.id
       and n.title = 'Pedido de acesso ao sistema'
       and n.message = r.nome || ' (' || r.email || ') pediu acesso pelo departamento '
                         || r.departamento || '.'
  );

-- ------------------------------------------------------------
-- Conferência
-- ------------------------------------------------------------

-- Por que o aviso do Manoel não chegou (rodar ANTES desta migração, se quiser
-- ver a causa; depois dela o gestor e o papel continuam iguais):
--   select d.nome, d.gestor_id, g.full_name as gestor, g.active as gestor_ativo
--     from departamentos d left join profiles g on g.id = d.gestor_id
--    where d.nome = 'DP';
--   select full_name, email, role, active from profiles
--    where email = 'jadirconsult@gmail.com';

-- Quem recebe um pedido do DP agora:
--   select full_name, email, role from profiles
--    where id = any(public.destinos_do_pedido_de_acesso('DP'));

-- Aviso do pedido pendente, por destinatário:
--   select p.full_name, n.is_read, n.created_at
--     from notifications n join profiles p on p.id = n.user_id
--    where n.title = 'Pedido de acesso ao sistema'
--      and n.message like 'Manoel Joaquim%';
