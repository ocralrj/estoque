-- ============================================================
-- Notificações e decisões por alçada: só quem responde avisa e decide
--
-- Idempotente. Pode ser reexecutada. Depende de: 047, 028, 041, 031.
-- ============================================================

-- PROBLEMA
-- O aviso de pedido de acesso e a autorização de decidi-lo seguiam critérios
-- largos demais:
--
-- 1. Destino do aviso (047): gestor do departamento + TODO super admin + TODO
--    usuário cujo grupo tenha admin:users:create. Como o grupo "Gestores"
--    recebe todas as permissões (014), QUALQUER gestor de QUALQUER setor
--    recebia todo pedido — a gestora de Secretaria via pedido do DP, e vice-
--    versa. Era o "aviso vai para todo mundo".
--
-- 2. Decisão (028): a política de update aceitava qualquer papel 'gestor',
--    sem olhar o departamento. Uma gestora de outro setor podia aprovar o
--    pedido do DP.
--
-- 3. Mudança de papel não gerava aviso nenhum. Quem alterava o papel de
--    alguém fazia isso sem deixar ninguém (além da auditoria) sabendo.
--
-- 4. O vencimento de certificado ia para todo gestor de todo setor, mesmo os
--    que não cuidam daquela empresa.
--
-- CORREÇÃO
-- A regra passa a ser: quem responde pelo departamento.
--
-- - O aviso de pedido vai para a UNIÃO de: o gestor do departamento (ativo) e
--   todo super admin (ativo). Gestores de outros setores não recebem.
-- - A decisão (aprovar/recusar) pode ser do super admin OU do gestor do
--   departamento daquele pedido — o gestor aprova a própria equipe.
-- - Mudar o papel de alguém avisa todo super admin ativo.
-- - Certificado vencendo avisa só quem cuida da empresa e o super admin.

-- ------------------------------------------------------------
-- 1. Quem o pedido de acesso avisa: gestor do departamento + super admin
--
-- Substitui a definição da 047, que somava todos os donos de admin:users:create
-- (na prática, todos os gestores). Mesma assinatura, mesmo uso pelo gatilho.
-- ------------------------------------------------------------

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
  'Quem é avisado de um pedido de acesso: apenas o gestor do departamento pedido e todo super admin, desde que ativos. Sem ninguém, a gestão inteira. Um pedido nunca fica sem aviso — e gestores de outros setores não são avisados.';

revoke all on function public.destinos_do_pedido_de_acesso(text) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 2. Quem decide o pedido: super admin ou o gestor do departamento
--
-- A decisão deixa de aceitar "qualquer papel gestor" e passa a exigir o vínculo
-- com o departamento do pedido (departamentos.gestor_id). O super admin decide
-- tudo; o gestor decide a própria equipe.
-- ------------------------------------------------------------

create or replace function public.pode_decidir_pedido_de_acesso(p_departamento text)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select
    public.get_user_role()::text = 'super_admin'
    or exists (
      select 1
      from departamentos d
      where d.nome = p_departamento
        and d.gestor_id = auth.uid()
    );
$$;

comment on function public.pode_decidir_pedido_de_acesso is
  'Quem pode aprovar ou recusar um pedido de acesso: todo super admin, ou o gestor cadastrado como gestor_id daquele departamento. O gestor decide a própria equipe, não a dos outros setores.';

grant execute on function public.pode_decidir_pedido_de_acesso(text) to authenticated;
revoke all on function public.pode_decidir_pedido_de_acesso(text) from anon;

drop policy if exists "Pedido de acesso: leitura pela gestão" on public.access_requests;
create policy "Pedido de acesso: leitura por quem decide"
  on public.access_requests for select
  to authenticated
  using (public.pode_decidir_pedido_de_acesso(departamento));

drop policy if exists "Pedido de acesso: decisão pela gestão" on public.access_requests;
create policy "Pedido de acesso: decisão por quem decide"
  on public.access_requests for update
  to authenticated
  using (public.pode_decidir_pedido_de_acesso(departamento))
  with check (public.pode_decidir_pedido_de_acesso(departamento));

-- A exclusão do recusado continua como na 041: só super admin, só recusado.
grant delete on public.access_requests to authenticated;

-- ------------------------------------------------------------
-- 3. Mudança de papel avisa a administração
--
-- Toda troca de papel (promoção, rebaixamento) é decisão administrativa: quem
-- sabe que mudou precisa ser conferível. O aviso vai para todo super admin
-- ativo, informando quem era, quem passou a ser e quem decidiu.
-- ------------------------------------------------------------

create or replace function public.notifica_mudanca_de_papel()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  decidiu text;
begin
  if new.role is not distinct from old.role then
    return new;
  end if;

  select coalesce(nullif(trim(full_name), ''), email)
    into decidiu
  from profiles where id = auth.uid();

  insert into notifications (user_id, title, message, link, permissao, origem_id)
  select p.id,
         'Papel alterado',
         coalesce(nullif(trim(new.full_name), ''), coalesce(new.email, 'Usuário'))
           || ' passou de ' || old.role::text || ' para ' || new.role::text
           || case when decidiu is not null then ' (por ' || decidiu || ')' else '' end || '.',
         '/dashboard/admin/usuarios',
         'admin:users:read',
         auth.uid()
  from profiles p
  where p.active
    and p.role::text = 'super_admin'
    -- Quem decidiu já sabe o que fez: não se autoavisa.
    and p.id is distinct from auth.uid();

  return new;
end;
$$;

drop trigger if exists profiles_papel_notifica on public.profiles;
create trigger profiles_papel_notifica
  after update of role on public.profiles
  for each row execute function public.notifica_mudanca_de_papel();

revoke all on function public.notifica_mudanca_de_papel() from public, anon, authenticated;

-- ------------------------------------------------------------
-- 4. Certificado vencendo: quem cuida da empresa, não a gestão inteira
--
-- Antes (031) o aviso de vencimento ia para donos de acesso da empresa + todo
-- super_admin + todo gestor — todo gestor de todo setor tomava conhecimento de
-- um certificado que não é da área dele. Agora vai para quem cuida da empresa
-- (empresa_acessos) e para o super admin, que responde por tudo.
-- ------------------------------------------------------------

create or replace function public.avisar_certificados_a_vencer()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  avisados integer := 0;
  c record;
begin
  if auth.uid() is not null
     and public.get_user_role()::text is distinct from 'super_admin' then
    raise exception 'Apenas o administrador dispara os avisos.';
  end if;

  for c in
    select ce.id, ce.titular, ce.validade_fim, ce.empresa_id, e.razao_social
    from certificados ce
    join empresas e on e.id = ce.empresa_id
    where ce.validade_fim between current_date and current_date + 30
  loop
    -- Quem cuida da empresa, mais o super admin. Sem aviso repetido no mesmo dia.
    insert into notifications (user_id, title, message, link, permissao)
    select distinct p.id,
           'Certificado vence em ' || (c.validade_fim - current_date) || ' dia(s)',
           c.razao_social || ' — ' || c.titular,
           '/dashboard/certificados',
           'certificados:certificates:read'
    from profiles p
    where p.active
      and (
        p.id in (select user_id from empresa_acessos where empresa_id = c.empresa_id)
        or p.role::text = 'super_admin'
      )
      and not exists (
        select 1 from notifications n
        where n.user_id = p.id
          and n.message = c.razao_social || ' — ' || c.titular
          and n.created_at > current_date
      );

    avisados := avisados + 1;
  end loop;

  return avisados;
end;
$$;

revoke all on function public.avisar_certificados_a_vencer() from public, anon;
grant execute on function public.avisar_certificados_a_vencer() to authenticated, service_role;

notify pgrst, 'reload schema';

-- ------------------------------------------------------------
-- 5. Conferência
-- ------------------------------------------------------------

-- Quem decide pedidos do DP (deve conter o gestor do DP e o super admin):
--   select full_name, email, role from profiles
--    where id = any(public.destinos_do_pedido_de_acesso('DP'));

-- O gestor do DP pode decidir pedido do DP (true); o do Contábil, não:
--   select public.pode_decidir_pedido_de_acesso('DP');

-- Gestores sem gestor_id (não decidem nenhum pedido; só o super admin decide):
--   select d.nome, g.email, g.role
--     from departamentos d left join profiles g on g.id = d.gestor_id
--     order by d.nome;