-- ============================================================
-- Exclusão da conta de MARIA TEREZA
--
-- NÃO é idempotente e NÃO é migração de estrutura: é uma operação de dados,
-- executada uma vez. Depende de: 038_excluir_usuario.sql
-- ============================================================

-- Este arquivo existe porque a exclusão pedida é de uma pessoa específica, e
-- uma exclusão irreversível não deve depender de alguém digitar o UUID certo
-- na hora. Ele acha a pessoa pelo nome, confere que achou exatamente uma, e
-- para com erro em vez de adivinhar.
--
-- COMO USAR
--   0. Aplique antes, nesta ordem: 037_funcoes.sql, 038_excluir_usuario.sql,
--      039_edicao_por_hierarquia.sql. O passo 1 confere isso e para com uma
--      mensagem clara se faltar algum.
--   1. Rode o passo 1 sozinho, leia o que ele imprime e confirme que é a
--      pessoa certa e que os números fazem sentido.
--   2. Só então rode o passo 2.
--   3. O passo 3 é fora do SQL: apagar a conta em auth.users. O caminho
--      recomendado é o botão de excluir na tela de Usuários, que faz os três
--      passos de uma vez. Se preferir fazer aqui, a última seção explica.

-- ------------------------------------------------------------
-- PASSO 1 — Quem é, e o que muda de dono (não altera nada)
-- ------------------------------------------------------------

do $$
declare
  v_id    uuid;
  v_nome  text;
  v_email text;
  v_papel text;
  v_qtd   int;
  v_previa jsonb;
begin
  -- A dependência, conferida antes de qualquer outra coisa. Sem isto o erro
  -- que aparece é "function does not exist", que não diz o que fazer.
  if to_regprocedure('public.excluir_dados_do_usuario(uuid,uuid)') is null then
    raise exception
      'Falta aplicar supabase/_manual_apply/038_excluir_usuario.sql antes deste arquivo.';
  end if;

  select count(*) into v_qtd
    from profiles
   where full_name ilike '%maria%tereza%';

  if v_qtd = 0 then
    raise exception 'Nenhum perfil com nome parecido com "Maria Tereza". Confira a grafia.';
  end if;

  if v_qtd > 1 then
    raise exception
      'Há % perfis com nome parecido com "Maria Tereza". Exclua pela tela de Usuários, que identifica cada um pelo e-mail.', v_qtd;
  end if;

  select id, full_name, email, role::text
    into v_id, v_nome, v_email, v_papel
    from profiles
   where full_name ilike '%maria%tereza%';

  if v_papel = 'super_admin' then
    raise exception 'Esta conta é Super Admin e não pode ser excluída. Rebaixe a função antes.';
  end if;

  -- A prévia é um conforto, não um requisito: se ela não existir, o resto do
  -- passo 1 ainda identifica a pessoa, que é o que importa confirmar.
  if to_regprocedure('public.previa_exclusao_do_usuario(uuid)') is not null then
    v_previa := public.previa_exclusao_do_usuario(v_id);
  end if;

  raise notice '--------------------------------------------------';
  raise notice 'Pessoa encontrada: % <%>', v_nome, v_email;
  raise notice 'ID.............: %', v_id;
  raise notice 'Função.........: %', v_papel;
  raise notice '';
  raise notice 'MUDA DE DONO (nada é apagado): %',
    coalesce(v_previa::text, 'prévia indisponível — aplique a 038');
  raise notice '';
  raise notice 'SERÁ APAGADO: notificações, sugestões e suas mensagens, pedidos,';
  raise notice 'permissões de documento, vínculos de grupo, solicitações de acesso';
  raise notice 'e a trilha de auditoria desta pessoa.';
  raise notice '--------------------------------------------------';
end $$;

-- ------------------------------------------------------------
-- PASSO 2 — Executar
--
-- A autoria do que é da empresa vai para o super admin principal. Rodando pelo
-- SQL Editor não há sessão, então a RPC recebe o herdeiro explicitamente — é
-- por isso que ele é procurado por e-mail aqui.
-- ------------------------------------------------------------

do $$
declare
  v_alvo     uuid;
  v_herdeiro uuid;
  v_resultado jsonb;
begin
  if to_regprocedure('public.excluir_dados_do_usuario(uuid,uuid)') is null then
    raise exception
      'Falta aplicar supabase/_manual_apply/038_excluir_usuario.sql antes deste arquivo.';
  end if;

  select id into v_alvo
    from profiles
   where full_name ilike '%maria%tereza%';

  select id into v_herdeiro
    from profiles
   where lower(email) = 'jadirconsult@gmail.com';

  if v_alvo is null then
    raise exception 'Perfil não encontrado — o passo 2 já rodou, ou o nome mudou.';
  end if;

  if v_herdeiro is null then
    raise exception
      'Super admin principal (jadirconsult@gmail.com) não encontrado. Sem herdeiro, a transferência de autoria não tem para onde ir.';
  end if;

  v_resultado := public.excluir_dados_do_usuario(v_alvo, v_herdeiro);

  raise notice 'Transferido e limpo: %', v_resultado::text;
  raise notice 'Falta apagar a conta de acesso — veja o passo 3.';
end $$;

-- ------------------------------------------------------------
-- PASSO 3 — A conta de acesso
--
-- O perfil ainda existe neste ponto: ele cai por cascade quando a conta some
-- de auth.users. Duas formas, nesta ordem de preferência:
--
--   a) Pelo sistema: Usuários -> ícone de excluir na linha dela. Com os dados
--      já limpos, ele apenas remove a conta. É o caminho seguro.
--
--   b) Pelo painel do Supabase: Authentication -> Users -> procurar pelo
--      e-mail -> Delete user.
--
-- Apagar direto de `auth.users` por SQL não é recomendado: a tabela é do
-- serviço de autenticação, e mexer nela à mão pode deixar sessões e identidades
-- órfãs que o painel não mostra.
-- ------------------------------------------------------------
