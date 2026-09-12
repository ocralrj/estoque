-- ============================================================
-- Criação de conta volta a funcionar
--
-- Idempotente. Pode ser reexecutada.
-- ============================================================

-- PROBLEMA
-- Aprovar um pedido de acesso (ou pré-cadastrar alguém em Usuários) falhava
-- com "Não foi possível criar o acesso: {}", para qualquer e-mail.
--
-- O Auth do Supabase insere em auth.users com o papel supabase_auth_admin, cujo
-- search_path é `auth`. O gatilho on_auth_user_created chama handle_new_user(),
-- que faz `insert into profiles`. Sem search_path fixo na função, `profiles`
-- não é encontrada, o insert quebra, o Auth devolve 500 ("Database error
-- creating new user") e a biblioteca, ao montar a mensagem de um 500, mostra
-- apenas `{}`.
--
-- A 016 tinha fixado o search_path. Em produção, em 12/09/2026, as três funções
-- que supabase/schema_estoque.sql define — handle_new_user, update_updated_at e
-- update_product_quantity — estavam com search_path vazio: o schema antigo foi
-- reexecutado e o `create or replace` dele desfez a 016. A versão daquele
-- arquivo ainda promovia a super_admin, direto no código, quem se cadastrasse
-- com dois e-mails fixos — a falha que a 010 tinha fechado.
--
-- CORREÇÃO
-- Recriar handle_new_user como na 010 (todo cadastro nasce requisitante), com
-- search_path fixo e tabela qualificada, e devolver o search_path às outras
-- duas. schema_estoque.sql foi corrigido junto, para não desfazer isto de novo.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    'requisitante'::public.user_role
  );
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

alter function public.update_updated_at() set search_path = public, pg_temp;
alter function public.update_product_quantity() set search_path = public, pg_temp;

-- ------------------------------------------------------------
-- Conferência: as três devem mostrar search_path=public, pg_temp
-- ------------------------------------------------------------
--   select proname, prosecdef, proconfig
--     from pg_proc
--    where pronamespace = 'public'::regnamespace
--      and proname in ('handle_new_user', 'update_updated_at', 'update_product_quantity');
