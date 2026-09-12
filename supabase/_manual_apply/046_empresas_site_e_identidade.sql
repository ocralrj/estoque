-- ============================================================
-- Empresas: site, logo e cores
--
-- Idempotente. Depende de: 044_empresas_cadastro_completo.sql
-- ============================================================

-- PROBLEMA
-- Os cartões de empresa eram todos iguais: só o nome distinguia um do outro.
-- Ao cadastrar, o sistema passa a procurar o site da empresa (pelo domínio do
-- e-mail e pelo nome, conferindo se a página cita o nome ou o CNPJ) e a ler
-- dele a logo e as cores, que caracterizam o cartão.
--
-- Guardamos o endereço da logo, e não a imagem: ela continua no site da
-- empresa e acompanha as mudanças dele. Se sair do ar, o cartão volta às
-- iniciais. Por isso só se aceita https — uma imagem http seria bloqueada
-- pelo navegador numa página https.

-- ------------------------------------------------------------
-- 1. Colunas
-- ------------------------------------------------------------

alter table public.empresas
  add column if not exists site text,
  add column if not exists logo_url text,
  add column if not exists cor_primaria text,
  add column if not exists cor_secundaria text;

comment on column public.empresas.site is
  'Domínio do site, sem protocolo nem "www." (ex.: icardcase.com.br).';
comment on column public.empresas.logo_url is
  'Endereço https da logo lida do site. Nulo quando o site não tem uma reconhecível.';
comment on column public.empresas.cor_primaria is
  'Cor principal da identidade visual, #rrggbb em minúsculas, lida do site ou ajustada no cadastro.';
comment on column public.empresas.cor_secundaria is
  'Segunda cor da identidade visual, #rrggbb em minúsculas.';

-- ------------------------------------------------------------
-- 2. Formatos (os mesmos de src/lib/empresas.ts)
-- ------------------------------------------------------------

do $$ begin
  alter table public.empresas
    add constraint empresas_site_formato
    check (site is null or site ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+([a-z]{2,24}|xn--[a-z0-9-]{1,59})$');
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.empresas
    add constraint empresas_logo_https
    check (logo_url is null or (logo_url ~ '^https://' and length(logo_url) <= 1000));
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.empresas
    add constraint empresas_cores_formato
    check (
      (cor_primaria is null or cor_primaria ~ '^#[0-9a-f]{6}$')
      and (cor_secundaria is null or cor_secundaria ~ '^#[0-9a-f]{6}$')
    );
exception when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';

-- ------------------------------------------------------------
-- 3. Conferência
-- ------------------------------------------------------------

--   select razao_social, site, logo_url, cor_primaria, cor_secundaria
--   from empresas order by razao_social;
