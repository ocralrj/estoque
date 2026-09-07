-- ============================================================
-- O banco passa a enxergar as permissões de grupo
--
-- Idempotente. Depende de: 033_ferias_bloqueiam_acesso.sql
-- ============================================================

-- PROBLEMA
-- O sistema tem dois níveis de autorização que não se falavam.
--
-- A aplicação pergunta por permissão de grupo — "esta pessoa pode
-- certificados:certificates:manage?" — e é assim que o menu esconde telas e as
-- Server Actions recusam ações. Já as políticas RLS perguntam por PAPEL:
-- super_admin, gestor, almoxarife. Duas gramáticas para a mesma pergunta.
--
-- O efeito prático aparece nos certificados: montar um grupo "Certificados"
-- com todas as opções marcadas dá acesso à TELA, e a tela vem vazia — porque a
-- política que decide quais certificados aparecem olha o papel, e não a
-- permissão. Quem monta o grupo espera que ele funcione; ele não funciona.
--
-- CORREÇÃO
-- Uma função que responde a pergunta da aplicação dentro do banco. Com ela, uma
-- política RLS pode exigir permissão em vez de papel, e as duas camadas passam
-- a concordar sobre quem pode o quê.

-- ------------------------------------------------------------
-- 1. A pergunta, respondida no banco
-- ------------------------------------------------------------

create or replace function public.tem_permissao(
  p_modulo text,
  p_recurso text,
  p_acao text
) returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select
    -- O administrador não depende do catálogo estar completo: uma permissão
    -- criada hoje e ainda não concedida a ninguém não pode trancá-lo fora da
    -- tela que a concede.
    public.get_user_role()::text = 'super_admin'
    or exists (
      select 1
      from profiles perfil
      join group_permissions gp on gp.group_id = perfil.group_id
      join permissions p on p.id = gp.permission_id
      where perfil.id = auth.uid()
        and perfil.active = true
        and p.module = p_modulo
        and p.resource = p_recurso
        and p.action = p_acao
    );
$$;

comment on function public.tem_permissao is
  'Responde, dentro do banco, a mesma pergunta que a aplicação faz: esta pessoa tem tal permissão de grupo? Existe para as políticas RLS poderem exigir permissão em vez de papel — sem isso as duas camadas discordam sobre quem pode o quê.';

-- Precisa ser executável por quem consulta: as políticas RLS são avaliadas com
-- o papel de quem faz a consulta, e sem EXECUTE elas falhariam.
grant execute on function public.tem_permissao(text, text, text) to authenticated;
revoke all on function public.tem_permissao(text, text, text) from anon;

-- ------------------------------------------------------------
-- 2. Uma permissão para quem responde por TODOS os certificados
--
-- O acesso por empresa (empresa_acessos) continua sendo a regra fina: quem
-- cuida da empresa A vê a empresa A. Esta permissão é a exceção deliberada —
-- o grupo que responde pelo assunto inteiro.
-- ------------------------------------------------------------

insert into permissions (module, resource, action, description) values
  ('certificados', 'certificates', 'manage',
   'Ver e administrar os certificados de TODAS as empresas')
on conflict (module, resource, action) do nothing;

-- ------------------------------------------------------------
-- 3. A visibilidade passa a olhar a permissão
-- ------------------------------------------------------------

create or replace function public.pode_ver_certificados_da_empresa(p_empresa uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select
    public.get_user_role()::text = 'super_admin'
    -- O grupo que responde pelos certificados vê todos.
    or public.tem_permissao('certificados', 'certificates', 'manage')
    -- E quem cuida de uma empresa vê a dela.
    or exists (
      select 1 from empresa_acessos a
      where a.empresa_id = p_empresa and a.user_id = auth.uid()
    );
$$;

comment on function public.pode_ver_certificados_da_empresa is
  'Quem alcança os certificados de uma empresa: o administrador, quem tem a permissão de administrar todos, e quem cuida daquela empresa. O papel "gestor" deixou de bastar por si só — gerir o sistema não é o mesmo que responder pelos certificados dos clientes.';

-- ------------------------------------------------------------
-- 4. Escrever também segue a permissão
--
-- Antes, guardar ou apagar certificado exigia papel de gestor. Agora exige a
-- permissão correspondente — que é o que o grupo "Certificados" concede.
-- ------------------------------------------------------------

drop policy if exists "Certificados: gestão mantém" on public.certificados;
create policy "Certificados: quem administra mantém"
  on public.certificados for all
  to authenticated
  using (
    public.tem_permissao('certificados', 'certificates', 'manage')
    or public.get_user_role()::text = 'super_admin'
  )
  with check (
    public.tem_permissao('certificados', 'certificates', 'manage')
    or public.get_user_role()::text = 'super_admin'
  );

drop policy if exists "Empresas: gestão administra" on public.empresas;
create policy "Empresas: quem administra certificados mantém"
  on public.empresas for all
  to authenticated
  using (
    public.tem_permissao('certificados', 'certificates', 'manage')
    or public.get_user_role()::text = 'super_admin'
  )
  with check (
    public.tem_permissao('certificados', 'certificates', 'manage')
    or public.get_user_role()::text = 'super_admin'
  );

drop policy if exists "Acesso à empresa: gestão concede" on public.empresa_acessos;
create policy "Acesso à empresa: quem administra concede"
  on public.empresa_acessos for all
  to authenticated
  using (
    public.tem_permissao('certificados', 'certificates', 'manage')
    or public.get_user_role()::text = 'super_admin'
  )
  with check (
    public.tem_permissao('certificados', 'certificates', 'manage')
    or public.get_user_role()::text = 'super_admin'
  );

-- O envio e a remoção do arquivo acompanham a mesma regra.
drop policy if exists "Certificados: envio pela gestão" on storage.objects;
create policy "Certificados: envio por quem administra"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'certificados'
    and (
      public.tem_permissao('certificados', 'certificates', 'manage')
      or public.get_user_role()::text = 'super_admin'
    )
  );

drop policy if exists "Certificados: remoção pela gestão" on storage.objects;
create policy "Certificados: remoção por quem administra"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'certificados'
    and (
      public.tem_permissao('certificados', 'certificates', 'manage')
      or public.get_user_role()::text = 'super_admin'
    )
  );

-- ------------------------------------------------------------
-- 5. Quem já administrava não perde o acesso nesta troca
--
-- A regra passou de "papel gestor" para "permissão de administrar". Sem esta
-- concessão, quem administrava certificados hoje sairia da tela amanhã — e
-- descobriria isso ao precisar de um certificado.
-- ------------------------------------------------------------

insert into group_permissions (group_id, permission_id)
select g.id, p.id
from user_groups g
cross join permissions p
where p.module = 'certificados' and p.resource = 'certificates'
  and g.nivel <= 20   -- Administradores e Gestores
on conflict do nothing;

notify pgrst, 'reload schema';

-- ------------------------------------------------------------
-- 6. Conferência
-- ------------------------------------------------------------

-- Quais grupos administram todos os certificados:
--   select g.name, g.nivel from user_groups g
--   join group_permissions gp on gp.group_id = g.id
--   join permissions p on p.id = gp.permission_id
--   where p.module = 'certificados' and p.action = 'manage';

-- Teste a função com a sua sessão (deve devolver true para o super admin):
--   select public.tem_permissao('certificados', 'certificates', 'manage');
