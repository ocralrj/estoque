-- ============================================================
-- Excluir um usuário sem apagar o que é da empresa
--
-- Idempotente. Depende de: 037_funcoes.sql
-- ============================================================

-- PROBLEMA
-- Não havia como excluir alguém: só marcar "Inativo". E excluir de verdade
-- esbarra em dezessete chaves estrangeiras que apontam para `profiles(id)` sem
-- cláusula `on delete` — `products.created_by` e `movements.created_by` são
-- `not null`. Apagar a pessoa exigiria apagar os produtos que ela cadastrou,
-- inclusive itens com saldo em estoque, e as movimentações que explicam esse
-- saldo. O catálogo da empresa sumiria junto com a conta de quem o digitou.
--
-- CORREÇÃO
-- Separar o que é da pessoa do que é da empresa.
--
--   - É da pessoa: notificações, sugestões, pedidos, permissões de documento,
--     vínculos de grupo, solicitações de acesso, trilha de auditoria. Some.
--   - É da empresa: produtos, movimentações, documentos, pastas, protocolos,
--     departamentos. Fica, com a autoria transferida para quem executou a
--     exclusão — um responsável vivo, em vez de um ponteiro para o vazio.
--
-- A transferência varre o catálogo do banco em vez de listar tabelas à mão: uma
-- tabela nova criada amanhã, apontando para profiles, entra na regra sozinha.
-- Uma lista escrita à mão envelheceria em silêncio, e o sintoma só apareceria
-- como erro de chave estrangeira no dia da exclusão.

create or replace function public.excluir_dados_do_usuario(
  p_alvo uuid,
  p_herdeiro uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_papel_de_quem_pede text;
  v_papel_alvo         user_role;
  v_transferidos       jsonb := '{}'::jsonb;
  v_apagados           jsonb := '{}'::jsonb;
  v_linhas             bigint;
  r                    record;
begin
  if p_alvo is null or p_herdeiro is null then
    raise exception 'Informe quem será excluído e quem herda a autoria.';
  end if;

  if p_alvo = p_herdeiro then
    raise exception 'Você não pode excluir a própria conta.';
  end if;

  select role into v_papel_alvo from profiles where id = p_alvo;
  if v_papel_alvo is null then
    raise exception 'Usuário não encontrado.';
  end if;

  -- Nunca, sem exceção. Não há papel, nem e-mail, nem chave de serviço que
  -- passe por aqui: um sistema que permite apagar seu próprio administrador
  -- permite ficar sem ninguém que o conserte.
  if v_papel_alvo = 'super_admin' then
    raise exception 'Um Super Admin não pode ser excluído. Rebaixe a função antes, se for mesmo o caso.';
  end if;

  -- auth.uid() nulo é a chave de serviço no servidor, que já passou pela
  -- checagem da aplicação. Com sessão, o papel manda.
  if auth.uid() is not null then
    v_papel_de_quem_pede := public.get_user_role()::text;
    if v_papel_de_quem_pede not in ('super_admin', 'gestor') then
      raise exception 'Acesso não autorizado: apenas a gestão exclui usuários.';
    end if;
  end if;

  -- ----------------------------------------------------------
  -- 1. O que é da pessoa
  --
  -- As tabelas com `on delete cascade` cairiam sozinhas ao apagar o perfil.
  -- Estas não: a auditoria guarda o id com `set null`, e sem apagá-la aqui a
  -- trilha dela sobreviveria à exclusão como uma linha sem dono.
  -- ----------------------------------------------------------

  if to_regclass('public.audit_logs') is not null then
    delete from public.audit_logs where user_id = p_alvo;
    get diagnostics v_linhas = row_count;
    v_apagados := v_apagados || jsonb_build_object('audit_logs', v_linhas);
  end if;

  if to_regclass('public.ged_audit') is not null then
    delete from public.ged_audit where user_id = p_alvo;
    get diagnostics v_linhas = row_count;
    v_apagados := v_apagados || jsonb_build_object('ged_audit', v_linhas);
  end if;

  if to_regclass('public.notifications') is not null then
    delete from public.notifications where user_id = p_alvo or origem_id = p_alvo;
    get diagnostics v_linhas = row_count;
    v_apagados := v_apagados || jsonb_build_object('notifications', v_linhas);
  end if;

  -- ----------------------------------------------------------
  -- 2. O que é da empresa: troca de dono, não de existência
  --
  -- Varre todas as chaves estrangeiras que apontam para profiles(id) e cuja
  -- ação de exclusão é "nenhuma" ou "restringir" — exatamente as que hoje
  -- impedem apagar a conta. As de `cascade` e `set null` já sabem o que fazer.
  -- ----------------------------------------------------------

  for r in
    select cl.relname  as tabela,
           att.attname as coluna
      from pg_constraint c
      join pg_class     cl  on cl.oid = c.conrelid
      join pg_namespace ns  on ns.oid = cl.relnamespace
      join pg_class     ref on ref.oid = c.confrelid
      join unnest(c.conkey) with ordinality as k(attnum, ord) on true
      join pg_attribute att on att.attrelid = c.conrelid and att.attnum = k.attnum
     where c.contype = 'f'
       and ns.nspname = 'public'
       and ref.relname = 'profiles'
       and c.confdeltype in ('a', 'r')   -- no action, restrict
       and array_length(c.conkey, 1) = 1
  loop
    execute format(
      'update public.%I set %I = $1 where %I = $2',
      r.tabela, r.coluna, r.coluna
    ) using p_herdeiro, p_alvo;

    get diagnostics v_linhas = row_count;
    if v_linhas > 0 then
      v_transferidos := v_transferidos || jsonb_build_object(
        r.tabela || '.' || r.coluna,
        coalesce((v_transferidos ->> (r.tabela || '.' || r.coluna))::bigint, 0) + v_linhas
      );
    end if;
  end loop;

  return jsonb_build_object(
    'transferidos', v_transferidos,
    'apagados',     v_apagados
  );
end;
$$;

comment on function public.excluir_dados_do_usuario is
  'Prepara a exclusão de um usuário: apaga o que é dele e transfere para o herdeiro a autoria do que é da empresa. NÃO apaga o perfil — quem faz isso é a exclusão em auth.users, por cascade. Recusa sempre excluir um Super Admin.';

revoke all on function public.excluir_dados_do_usuario(uuid, uuid) from public;
grant execute on function public.excluir_dados_do_usuario(uuid, uuid) to authenticated;

-- ------------------------------------------------------------
-- Ensaio: o que aconteceria, sem alterar nada
--
-- Existe para a tela poder dizer "isto será transferido, isto será apagado"
-- ANTES de perguntar se pode. Uma confirmação que não diz o tamanho do estrago
-- não é uma confirmação, é um clique.
-- ------------------------------------------------------------

create or replace function public.previa_exclusao_do_usuario(p_alvo uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_transferidos jsonb := '{}'::jsonb;
  v_total        bigint;
  r              record;
begin
  for r in
    select cl.relname  as tabela,
           att.attname as coluna
      from pg_constraint c
      join pg_class     cl  on cl.oid = c.conrelid
      join pg_namespace ns  on ns.oid = cl.relnamespace
      join pg_class     ref on ref.oid = c.confrelid
      join unnest(c.conkey) with ordinality as k(attnum, ord) on true
      join pg_attribute att on att.attrelid = c.conrelid and att.attnum = k.attnum
     where c.contype = 'f'
       and ns.nspname = 'public'
       and ref.relname = 'profiles'
       and c.confdeltype in ('a', 'r')
       and array_length(c.conkey, 1) = 1
  loop
    execute format('select count(*) from public.%I where %I = $1', r.tabela, r.coluna)
      into v_total using p_alvo;

    if v_total > 0 then
      v_transferidos := v_transferidos
        || jsonb_build_object(r.tabela || '.' || r.coluna, v_total);
    end if;
  end loop;

  return v_transferidos;
end;
$$;

revoke all on function public.previa_exclusao_do_usuario(uuid) from public;
grant execute on function public.previa_exclusao_do_usuario(uuid) to authenticated;
