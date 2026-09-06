-- ============================================================
-- Segurança administrativa
--
-- Idempotente. Depende de: 009_departamentos.sql
--
-- ATENÇÃO: a primeira mudança derruba o acesso de todo usuário com
-- active = false. Confira antes quem está inativo:
--   select email, role, active from profiles where active = false;
-- ============================================================

-- ------------------------------------------------------------
-- 1. Usuário desativado perde o acesso de verdade
--
-- PROBLEMA
-- `active` era verificado num único ponto da aplicação (o layout do
-- dashboard). Isso barra a tela, não o banco: quem foi desativado continuava
-- com o token válido e podia chamar a API REST direto, lendo produtos,
-- movimentações, documentos e protocolos — e escrevendo conforme o papel que
-- tinha. O botão "Desativar" dava uma garantia que o dado não sustentava.
--
-- CORREÇÃO
-- get_user_role() passa a devolver NULL para inativo. Como quase toda política
-- do sistema depende dela, o acesso cai por inteiro numa mudança só.
-- ------------------------------------------------------------

create or replace function public.get_user_role()
returns user_role
language sql
security definer
set search_path = public
stable
as $$
  select role from public.profiles
  where id = auth.uid()
    and active = true;
$$;

comment on function public.get_user_role is
  'Papel do usuário autenticado, ou NULL se a conta estiver inativa. Ignora RLS para não recursionar.';

-- Leitura do próprio perfil também exige conta ativa, senão o desativado
-- continuaria enxergando a si mesmo e sustentando uma sessão aparentemente
-- válida na aplicação.
drop policy if exists "Usuário vê seu próprio perfil" on profiles;
create policy "Usuário vê seu próprio perfil"
  on profiles for select
  to authenticated
  using (auth.uid() = id and active = true);

-- ------------------------------------------------------------
-- 2. Fim da promoção automática por e-mail fixo
--
-- PROBLEMA
-- O gatilho promovia a super_admin quem se cadastrasse com dois endereços
-- escritos no código — de um repositório público. Qualquer pessoa sabia
-- exatamente qual conta atacar para obter controle total do sistema.
--
-- CORREÇÃO
-- Todo cadastro nasce requisitante. A promoção é feita por um super admin já
-- existente, pela tela de usuários, e fica registrada na auditoria.
-- ------------------------------------------------------------

create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    'requisitante'::user_role
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- ------------------------------------------------------------
-- 3. Auditoria: políticas sem consulta direta a profiles
-- ------------------------------------------------------------

alter table audit_logs enable row level security;

drop policy if exists audit_logs_super_admin_all on audit_logs;
drop policy if exists audit_logs_gestor_read on audit_logs;
drop policy if exists "Auditoria: leitura pela gestão" on audit_logs;

create policy "Auditoria: leitura pela gestão"
  on audit_logs for select
  to authenticated
  using (public.get_user_role()::text in ('super_admin', 'gestor'));

-- Ninguém escreve à mão: só os gatilhos, que rodam como SECURITY DEFINER.
-- Sem política de INSERT, UPDATE ou DELETE, o registro não pode ser forjado
-- nem apagado por quem quer que seja através da API.

-- ------------------------------------------------------------
-- 4. Cobertura da auditoria
--
-- Os gatilhos de products, movements e profiles são recriados aqui para
-- garantir que existam — a tabela estava vazia, o que sugere que nem todos
-- chegaram a ser criados.
-- ------------------------------------------------------------

create or replace function public.registrar_auditoria(
  p_module text,
  p_action text,
  p_resource_type text,
  p_resource_id text,
  p_details jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into audit_logs (user_id, module, action, resource_type, resource_id, details)
  values (auth.uid(), p_module, p_action, p_resource_type, p_resource_id, p_details);
end;
$$;

-- Perfis: mudança de papel e de status é o que mais importa auditar.
create or replace function audit_profiles_changes()
returns trigger as $$
begin
  if (TG_OP = 'UPDATE') then
    if (new.role is distinct from old.role) then
      perform public.registrar_auditoria(
        'admin', 'alterar_papel', 'profile', new.id::text,
        jsonb_build_object('email', new.email, 'de', old.role, 'para', new.role)
      );
    end if;
    if (new.active is distinct from old.active) then
      perform public.registrar_auditoria(
        'admin', case when new.active then 'ativar' else 'desativar' end,
        'profile', new.id::text,
        jsonb_build_object('email', new.email)
      );
    end if;
  elsif (TG_OP = 'INSERT') then
    perform public.registrar_auditoria(
      'admin', 'criar', 'profile', new.id::text,
      jsonb_build_object('email', new.email, 'papel', new.role)
    );
  end if;
  return coalesce(new, old);
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists profiles_audit_trigger on profiles;
create trigger profiles_audit_trigger
  after insert or update on profiles
  for each row execute function audit_profiles_changes();

-- Grupos e permissões: não tinham rastro nenhum.
create or replace function audit_grupos_changes()
returns trigger as $$
declare
  alvo text := TG_TABLE_NAME;
begin
  if (TG_OP = 'INSERT') then
    perform public.registrar_auditoria('admin', 'criar', alvo, new.id::text, to_jsonb(new));
    return new;
  elsif (TG_OP = 'UPDATE') then
    perform public.registrar_auditoria('admin', 'alterar', alvo, new.id::text, to_jsonb(new));
    return new;
  else
    perform public.registrar_auditoria('admin', 'excluir', alvo, old.id::text, to_jsonb(old));
    return old;
  end if;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists user_groups_audit on user_groups;
create trigger user_groups_audit
  after insert or update or delete on user_groups
  for each row execute function audit_grupos_changes();

drop trigger if exists departamentos_audit on departamentos;
create trigger departamentos_audit
  after insert or update or delete on departamentos
  for each row execute function audit_grupos_changes();

-- Concessão de permissão a grupo é ação sensível: entra na trilha.
create or replace function audit_group_permissions()
returns trigger as $$
begin
  if (TG_OP = 'INSERT') then
    perform public.registrar_auditoria(
      'admin', 'conceder_permissao', 'group_permissions', new.group_id::text,
      jsonb_build_object('permission_id', new.permission_id)
    );
    return new;
  else
    perform public.registrar_auditoria(
      'admin', 'revogar_permissao', 'group_permissions', old.group_id::text,
      jsonb_build_object('permission_id', old.permission_id)
    );
    return old;
  end if;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists group_permissions_audit on group_permissions;
create trigger group_permissions_audit
  after insert or delete on group_permissions
  for each row execute function audit_group_permissions();

drop trigger if exists group_members_audit on group_members;
create trigger group_members_audit
  after insert or delete on group_members
  for each row execute function audit_group_permissions();

-- ------------------------------------------------------------
-- 5. Índices para a tela de consulta
-- ------------------------------------------------------------

create index if not exists audit_logs_created_idx on audit_logs (created_at desc);
create index if not exists audit_logs_user_idx on audit_logs (user_id);
create index if not exists audit_logs_module_idx on audit_logs (module);

-- ------------------------------------------------------------
-- 6. Conferência
-- ------------------------------------------------------------

-- Deve listar os gatilhos criados acima:
--   select tgname, tgrelid::regclass from pg_trigger
--   where tgname like '%audit%' and not tgisinternal;
--
-- Teste rápido: altere o papel de alguém pela tela e rode
--   select * from audit_logs order by created_at desc limit 5;
