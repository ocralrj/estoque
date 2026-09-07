-- ============================================================
-- Empresas e certificados digitais
--
-- Idempotente. Depende de: 030_remove_view_publica.sql
-- ============================================================

-- PROBLEMA
-- O catálogo de permissões oferece seis permissões de certificados desde o
-- início, e a tela nunca existiu: conceder esse acesso a um grupo não revelava
-- nada. Havia uma tabela `ged_certificates` usada apenas para uma contagem no
-- painel do GED — sem arquivo, sem dono, sem controle de quem vê.
--
-- Faltava também a peça que dá sentido ao resto: a empresa. Um escritório
-- contábil guarda certificado de dezenas de clientes, e quem cuida da empresa A
-- não tem por que alcançar o certificado da empresa B.
--
-- DECISÃO SOBRE A SENHA
-- O arquivo .pfx é guardado; a senha, não. A senha do certificado é a chave
-- privada na prática: guardá-la aqui transformaria o sistema num cofre onde uma
-- invasão permitiria assinar documentos como a empresa, com validade jurídica.
-- Ela é digitada no envio, usada no navegador para ler os dados do certificado,
-- e descartada — não chega ao servidor.

-- ------------------------------------------------------------
-- 1. Empresas
-- ------------------------------------------------------------

create table if not exists public.empresas (
  id uuid primary key default gen_random_uuid(),
  razao_social text not null,
  nome_fantasia text,
  cnpj text unique,
  ativo boolean not null default true,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists empresas_ativo_idx on public.empresas (ativo, razao_social);

alter table public.empresas enable row level security;

drop policy if exists "Empresas: leitura autenticada" on public.empresas;
create policy "Empresas: leitura autenticada"
  on public.empresas for select
  to authenticated
  using (true);

drop policy if exists "Empresas: gestão administra" on public.empresas;
create policy "Empresas: gestão administra"
  on public.empresas for all
  to authenticated
  using (public.get_user_role()::text in ('super_admin', 'gestor'))
  with check (public.get_user_role()::text in ('super_admin', 'gestor'));

-- ------------------------------------------------------------
-- 2. Quem cuida de cada empresa
--
-- É esta lista que decide quem alcança o certificado. Sem ela, "quem tem
-- acesso à empresa do certificado" não teria como ser respondido.
-- ------------------------------------------------------------

create table if not exists public.empresa_acessos (
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  concedido_por uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (empresa_id, user_id)
);

create index if not exists empresa_acessos_user_idx on public.empresa_acessos (user_id);

alter table public.empresa_acessos enable row level security;

drop policy if exists "Acesso à empresa: leitura" on public.empresa_acessos;
create policy "Acesso à empresa: leitura"
  on public.empresa_acessos for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.get_user_role()::text in ('super_admin', 'gestor')
  );

drop policy if exists "Acesso à empresa: gestão concede" on public.empresa_acessos;
create policy "Acesso à empresa: gestão concede"
  on public.empresa_acessos for all
  to authenticated
  using (public.get_user_role()::text in ('super_admin', 'gestor'))
  with check (public.get_user_role()::text in ('super_admin', 'gestor'));

-- ------------------------------------------------------------
-- 3. Os certificados
-- ------------------------------------------------------------

create table if not exists public.certificados (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,

  -- Lidos do próprio arquivo no envio, e não digitados: o que vale é o que
  -- está dentro do certificado, não o que alguém lembrou de escrever.
  titular text not null,
  documento text,
  emissor text,
  numero_serie text,
  validade_inicio date,
  validade_fim date not null,

  tipo text not null default 'A1' check (tipo in ('A1', 'A3')),
  observacao text,

  -- O binário. A senha NÃO é guardada — ver a decisão no topo do arquivo.
  storage_path text,
  nome_arquivo text,
  tamanho_bytes integer,

  enviado_por uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists certificados_empresa_idx on public.certificados (empresa_id);
create index if not exists certificados_validade_idx on public.certificados (validade_fim);

comment on table public.certificados is
  'Certificados digitais das empresas. O arquivo fica em bucket privado; a senha nunca é guardada — ela é a chave privada na prática.';

alter table public.certificados enable row level security;

-- ------------------------------------------------------------
-- 4. Quem alcança um certificado
-- ------------------------------------------------------------

create or replace function public.pode_ver_certificados_da_empresa(p_empresa uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select
    public.get_user_role()::text in ('super_admin', 'gestor')
    or exists (
      select 1 from empresa_acessos a
      where a.empresa_id = p_empresa and a.user_id = auth.uid()
    );
$$;

drop policy if exists "Certificados: leitura por quem cuida da empresa" on public.certificados;
create policy "Certificados: leitura por quem cuida da empresa"
  on public.certificados for select
  to authenticated
  using (public.pode_ver_certificados_da_empresa(empresa_id));

drop policy if exists "Certificados: gestão mantém" on public.certificados;
create policy "Certificados: gestão mantém"
  on public.certificados for all
  to authenticated
  using (public.get_user_role()::text in ('super_admin', 'gestor'))
  with check (public.get_user_role()::text in ('super_admin', 'gestor'));

-- ------------------------------------------------------------
-- 5. Todo download fica registrado
--
-- Um certificado digital assina em nome da empresa. Saber quem o levou, e
-- quando, não é burocracia: é a única forma de responder por ele depois.
-- ------------------------------------------------------------

create table if not exists public.certificado_downloads (
  id uuid primary key default gen_random_uuid(),
  certificado_id uuid not null references public.certificados(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists certificado_downloads_idx
  on public.certificado_downloads (certificado_id, created_at desc);

alter table public.certificado_downloads enable row level security;

drop policy if exists "Downloads: leitura pela gestão" on public.certificado_downloads;
create policy "Downloads: leitura pela gestão"
  on public.certificado_downloads for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.get_user_role()::text in ('super_admin', 'gestor')
  );

-- O registro é gravado pela função de download, que confere o acesso antes.
create or replace function public.registrar_download_certificado(p_certificado uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  emp uuid;
begin
  select empresa_id into emp from certificados where id = p_certificado;
  if emp is null then
    raise exception 'Certificado não encontrado.';
  end if;

  if not public.pode_ver_certificados_da_empresa(emp) then
    raise exception 'Você não tem acesso aos certificados desta empresa.';
  end if;

  insert into certificado_downloads (certificado_id, user_id)
  values (p_certificado, auth.uid());

  return true;
end;
$$;

revoke all on function public.registrar_download_certificado(uuid) from public, anon;
grant execute on function public.registrar_download_certificado(uuid) to authenticated;

-- ------------------------------------------------------------
-- 6. O bucket, privado
--
-- Ao contrário do de avatares, este NÃO é público: um certificado digital não
-- pode ser servido por URL adivinhável. O acesso é sempre por URL assinada,
-- gerada depois da checagem de quem está pedindo.
-- ------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit)
values ('certificados', 'certificados', false, 5242880)   -- 5 MB
on conflict (id) do update set public = false, file_size_limit = 5242880;

-- O objeto é gravado como "<empresa_id>/<uuid>.pfx": o prefixo é o que liga o
-- arquivo à empresa dentro da política, sem consulta extra.
drop policy if exists "Certificados: leitura de quem cuida da empresa" on storage.objects;
create policy "Certificados: leitura de quem cuida da empresa"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'certificados'
    and public.pode_ver_certificados_da_empresa(
      nullif(split_part(name, '/', 1), '')::uuid
    )
  );

drop policy if exists "Certificados: envio pela gestão" on storage.objects;
create policy "Certificados: envio pela gestão"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'certificados'
    and public.get_user_role()::text in ('super_admin', 'gestor')
  );

drop policy if exists "Certificados: remoção pela gestão" on storage.objects;
create policy "Certificados: remoção pela gestão"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'certificados'
    and public.get_user_role()::text in ('super_admin', 'gestor')
  );

-- ------------------------------------------------------------
-- 7. Aviso de vencimento
--
-- Um certificado vencido para a empresa: nota não sai, obrigação não é
-- entregue. Trinta dias é o prazo com que dá para renovar sem correria.
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
    -- Quem cuida da empresa, mais a gestão. Sem aviso repetido no mesmo dia.
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
        or p.role::text in ('super_admin', 'gestor')
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

-- ------------------------------------------------------------
-- 8. Trazer o que existia
-- ------------------------------------------------------------

do $$ begin
  -- ged_certificates guardava cliente/certificado/validade, sem arquivo nem
  -- dono. O que dá para aproveitar é o controle de validade.
  insert into public.empresas (razao_social)
  select distinct g.cliente from ged_certificates g
  where not exists (select 1 from empresas e where e.razao_social = g.cliente)
    and coalesce(trim(g.cliente), '') <> '';

  insert into public.certificados (empresa_id, titular, validade_fim, observacao)
  select e.id, g.certificado, g.validade,
         coalesce(g.observacao, '') || ' (importado do controle anterior)'
  from ged_certificates g
  join empresas e on e.razao_social = g.cliente
  where not exists (
    select 1 from certificados c
    where c.empresa_id = e.id and c.titular = g.certificado
  );
exception
  when undefined_table then
    raise notice 'ged_certificates não existe; nada a importar.';
end $$;

drop trigger if exists empresas_updated_at on public.empresas;
create trigger empresas_updated_at before update on public.empresas
  for each row execute function public.update_updated_at();

drop trigger if exists certificados_updated_at on public.certificados;
create trigger certificados_updated_at before update on public.certificados
  for each row execute function public.update_updated_at();

notify pgrst, 'reload schema';

-- ------------------------------------------------------------
-- 9. Conferência
-- ------------------------------------------------------------

-- Certificados por empresa, com dias até vencer:
--   select e.razao_social, c.titular, c.validade_fim,
--          c.validade_fim - current_date as dias
--   from certificados c join empresas e on e.id = c.empresa_id
--   order by c.validade_fim;

-- Quem cuida de cada empresa:
--   select e.razao_social, p.email
--   from empresa_acessos a
--   join empresas e on e.id = a.empresa_id
--   join profiles p on p.id = a.user_id
--   order by e.razao_social;
