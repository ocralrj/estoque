-- ============================================================
-- Empresas: cadastro completo, com ou sem CNPJ
--
-- Idempotente. Depende de: 031_empresas_e_certificados.sql,
--                          034_permissao_no_banco.sql
-- ============================================================

-- PROBLEMA
-- A empresa só existia para pendurar certificado: razão social, nome fantasia
-- e CNPJ. Não havia endereço, contato, nem como dizer se ela é cliente ou
-- fornecedora — e o cadastro vai servir de fornecedor nas compras.
--
-- O CNPJ continua opcional. Um fornecedor pode entrar só com nome e telefone,
-- para ser escolhido numa compra, e ganhar o CNPJ depois. Por isso a
-- identidade do registro é o id, e não o CNPJ.
--
-- O CNPJ, quando existe, é único (a restrição vem da 031) e agora também
-- precisa ser válido: formato e dígitos verificadores, conferidos aqui e não
-- só na tela. Desde julho de 2026 ele pode ter letras nas doze primeiras
-- posições.

-- ------------------------------------------------------------
-- 1. Colunas
-- ------------------------------------------------------------

alter table public.empresas
  -- As empresas que já existem vieram dos certificados: são clientes.
  add column if not exists e_cliente boolean not null default true,
  add column if not exists e_fornecedor boolean not null default false,
  add column if not exists cep text,
  add column if not exists logradouro text,
  add column if not exists numero text,
  add column if not exists complemento text,
  add column if not exists bairro text,
  add column if not exists municipio text,
  add column if not exists uf text,
  add column if not exists email text,
  add column if not exists telefone text,
  add column if not exists situacao_cadastral text,
  add column if not exists atividade_principal text,
  add column if not exists observacao text;

comment on column public.empresas.cnpj is
  'Opcional. Guardado sem pontuação, em maiúsculas (aceita o CNPJ alfanumérico). Único quando informado.';

-- ------------------------------------------------------------
-- 2. CNPJ válido
-- ------------------------------------------------------------

create or replace function public.cnpj_valido(p_cnpj text)
returns boolean
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  base text;
  soma integer;
  resto integer;
  dv1 integer;
  dv2 integer;
  i integer;
begin
  if p_cnpj is null or p_cnpj !~ '^[0-9A-Z]{12}[0-9]{2}$' then
    return false;
  end if;
  -- 00000000000000 e parecidos passam no cálculo, mas não existem.
  if p_cnpj ~ '^(.)\1{13}$' then
    return false;
  end if;

  -- Módulo 11 com pesos de 2 a 9 da direita para a esquerda; cada caractere
  -- vale o código ASCII menos 48 (nos algarismos, o próprio número).
  base := substr(p_cnpj, 1, 12);
  soma := 0;
  for i in 1..12 loop
    soma := soma + (ascii(substr(base, i, 1)) - 48) * (((12 - i) % 8) + 2);
  end loop;
  resto := soma % 11;
  dv1 := case when resto < 2 then 0 else 11 - resto end;

  base := base || dv1::text;
  soma := 0;
  for i in 1..13 loop
    soma := soma + (ascii(substr(base, i, 1)) - 48) * (((13 - i) % 8) + 2);
  end loop;
  resto := soma % 11;
  dv2 := case when resto < 2 then 0 else 11 - resto end;

  return substr(p_cnpj, 13, 2) = dv1::text || dv2::text;
end;
$$;

comment on function public.cnpj_valido is
  'Formato e dígitos verificadores do CNPJ, numérico ou alfanumérico. Recebe o valor já sem pontuação e em maiúsculas.';

-- Quem gravou CNPJ com pontuação passa a ter o valor normalizado. Sem isso a
-- restrição de unicidade tratava "12.345..." e "12345..." como diferentes.
update public.empresas
set cnpj = nullif(upper(regexp_replace(cnpj, '[^0-9A-Za-z]', '', 'g')), '')
where cnpj is distinct from nullif(upper(regexp_replace(cnpj, '[^0-9A-Za-z]', '', 'g')), '');

-- NOT VALID: vale para toda gravação daqui em diante sem impedir a migração
-- por um CNPJ antigo digitado errado. A consulta de conferência, no fim do
-- arquivo, lista esses casos para correção.
do $$ begin
  alter table public.empresas
    add constraint empresas_cnpj_valido
    check (cnpj is null or public.cnpj_valido(cnpj)) not valid;
exception when duplicate_object then null;
end $$;

-- ------------------------------------------------------------
-- 3. Classificação e demais regras
-- ------------------------------------------------------------

do $$ begin
  alter table public.empresas
    add constraint empresas_relacionamento
    check (e_cliente or e_fornecedor);
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.empresas
    add constraint empresas_uf_formato
    check (uf is null or uf ~ '^[A-Z]{2}$');
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.empresas
    add constraint empresas_cep_formato
    check (cep is null or cep ~ '^[0-9]{8}$');
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.empresas
    add constraint empresas_email_formato
    check (email is null or email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$');
exception when duplicate_object then null;
end $$;

-- As compras vão listar fornecedores ativos pelo nome.
create index if not exists empresas_fornecedores_idx
  on public.empresas (razao_social)
  where e_fornecedor and ativo;

notify pgrst, 'reload schema';

-- ------------------------------------------------------------
-- 4. Conferência
-- ------------------------------------------------------------

-- Colunas novas respondem:
--   select id, razao_social, cnpj, e_cliente, e_fornecedor, municipio, uf, telefone
--   from empresas order by razao_social;

-- CNPJs antigos que não passam na validação (corrigir pela tela de Empresas):
--   select id, razao_social, cnpj from empresas
--   where cnpj is not null and not public.cnpj_valido(cnpj);
