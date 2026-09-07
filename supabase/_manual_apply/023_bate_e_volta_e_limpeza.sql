-- ============================================================
-- Bate e volta na sugestão, e notificação com prazo de validade
--
-- Idempotente. Depende de: 022_notificacao_com_destino.sql
-- ============================================================

-- PROBLEMA 1
-- A conversa entre a gestão e quem enviou a sugestão não deixa rastro. Cada
-- nota nova sobrescreve o campo e o status continua o mesmo, então olhando a
-- lista não dá para saber se aquilo foi respondido uma vez ou se está no
-- quarto vaivém sem sair do lugar — que é justamente o caso que precisa de
-- atenção.
--
-- PROBLEMA 2
-- Notificação lida não serve para mais nada, e a tabela cresce para sempre. A
-- limpeza existia (migração 020) com prazo de 90 dias e só rodava se alguém a
-- chamasse à mão, o que ninguém faz.

-- ------------------------------------------------------------
-- 1. Um status para "voltou para o autor"
-- ------------------------------------------------------------

do $$ begin
  alter type suggestion_status add value if not exists 'reenviada';
exception
  when others then null;
end $$;

alter table public.improvement_suggestions
  add column if not exists idas_e_vindas integer not null default 0;

comment on column public.improvement_suggestions.idas_e_vindas is
  'Quantas vezes a gestão escreveu de volta para o autor. Uma sugestão no quinto vaivém é sinal de assunto que não fecha por escrito — é o número que faz isso aparecer na lista.';

-- ------------------------------------------------------------
-- 2. Escrever a nota conta como um retorno
--
-- O status só é forçado para "reenviada" quando quem respondeu NÃO escolheu um
-- status na mesma edição. Marcar "Concluída" e escrever a justificativa junto é
-- comum, e sobrescrever essa escolha faria a tela desobedecer quem a usou.
-- ------------------------------------------------------------

create or replace function public.conta_retorno_da_sugestao()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if coalesce(new.admin_notes, '') is not distinct from coalesce(old.admin_notes, '') then
    return new;
  end if;

  if coalesce(trim(new.admin_notes), '') = '' then
    return new;
  end if;

  new.idas_e_vindas := coalesce(old.idas_e_vindas, 0) + 1;

  if new.status is not distinct from old.status then
    new.status := 'reenviada';
  end if;

  new.reviewed_by := coalesce(auth.uid(), new.reviewed_by);
  new.reviewed_at := now();

  return new;
end;
$$;

-- Roda antes do gatilho que notifica (nome com "a_" para vir primeiro), para
-- que o aviso ao autor já saia com o status novo.
drop trigger if exists a_sugestao_conta_retorno on public.improvement_suggestions;
create trigger a_sugestao_conta_retorno
  before update on public.improvement_suggestions
  for each row execute function public.conta_retorno_da_sugestao();

revoke all on function public.conta_retorno_da_sugestao() from public, anon, authenticated;

-- ------------------------------------------------------------
-- 3. O aviso ao autor passa a dizer que é um retorno
-- ------------------------------------------------------------

create or replace function public.notifica_sugestao_respondida()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  mudou_status boolean := new.status is distinct from old.status;
  mudou_nota boolean := coalesce(new.admin_notes, '') is distinct from coalesce(old.admin_notes, '');
begin
  if not (mudou_status or mudou_nota) then
    return new;
  end if;

  perform public.notificar(
    array[new.user_id],
    case
      when mudou_nota and new.idas_e_vindas > 1
        then 'Retorno nº ' || new.idas_e_vindas || ' na sua sugestão'
      when mudou_nota then 'A equipe respondeu sua sugestão'
      else 'Sua sugestão foi atualizada'
    end,
    left(new.title, 80) || ' — agora está como "' || new.status::text || '"'
      || case when mudou_nota and coalesce(new.admin_notes, '') <> ''
              then '. Há um retorno da equipe.' else '' end,
    '/dashboard/sugestoes',
    'sugestoes:minhas:read',
    auth.uid()
  );
  return new;
end;
$$;

-- ------------------------------------------------------------
-- 4. Notificação lida some depois de 15 dias
--
-- Passa a ser chamável pela rotina diária que já existe (a mesma que mantém o
-- projeto acordado), que roda com a chave de serviço — sem sessão, portanto
-- sem papel. É por isso que a checagem aceita `auth.uid() is null`: ali quem
-- responde pela chamada é o segredo do cron, não um usuário.
-- ------------------------------------------------------------

create or replace function public.limpar_notificacoes_antigas()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  removidas integer;
begin
  if auth.uid() is not null
     and public.get_user_role()::text is distinct from 'super_admin' then
    raise exception 'Apenas o administrador limpa notificações.';
  end if;

  -- Só as lidas. Uma notificação não lida em 15 dias continua sendo algo que
  -- a pessoa ainda não viu, e apagá-la seria esconder o aviso em vez de
  -- entregá-lo.
  delete from notifications
  where is_read
    and updated_at < now() - interval '15 days';

  get diagnostics removidas = row_count;
  return removidas;
end;
$$;

revoke all on function public.limpar_notificacoes_antigas() from public, anon;
grant execute on function public.limpar_notificacoes_antigas() to authenticated, service_role;

notify pgrst, 'reload schema';

-- ------------------------------------------------------------
-- 5. Conferência
-- ------------------------------------------------------------

-- Sugestões em vaivém:
--   select code, title, status, idas_e_vindas
--   from improvement_suggestions
--   where idas_e_vindas > 0 order by idas_e_vindas desc;

-- Quantas notificações a limpeza removeria hoje:
--   select count(*) from notifications
--   where is_read and updated_at < now() - interval '15 days';
