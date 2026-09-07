-- ============================================================
-- Bucket das fotos de perfil
--
-- Idempotente. Depende de: 014_grupos_hierarquia_permissoes.sql
-- ============================================================

-- PROBLEMA
-- A tela de perfil envia a foto para o bucket "avatars" desde sempre, mas esse
-- bucket nunca foi criado por migração nenhuma e não tem uma única política de
-- Storage. O bucket "ged" tem as suas, escritas na migração 005; o de avatares
-- ficou de fora. Resultado: a imagem é tratada, reduzida e enviada — e a
-- gravação é recusada, com a tela dizendo apenas "não foi possível enviar".
--
-- CORREÇÃO
-- Criar o bucket e escrever as políticas que faltam.

-- ------------------------------------------------------------
-- 1. O bucket
--
-- Público, ao contrário do bucket do GED. As fotos aparecem no menu do topo, na
-- lista de usuários e nos círculos de equipe, várias por tela: servi-las por
-- URL assinada exigiria uma ida ao servidor por foto a cada carregamento, para
-- proteger algo que a própria pessoa escolheu exibir aos colegas.
--
-- O limite é pequeno de propósito. A tela entrega um quadrado de 256 pixels,
-- que fica na casa das dezenas de kB; 512 kB recusa o que não passou por esse
-- tratamento, sem espremer o que passou.
-- ------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  524288,
  array['image/webp', 'image/jpeg', 'image/png', 'image/gif']
)
on conflict (id) do update
  set public = true,
      file_size_limit = 524288,
      allowed_mime_types = excluded.allowed_mime_types;

-- ------------------------------------------------------------
-- 2. Políticas
--
-- O arquivo é gravado como "<id-do-usuario>-<carimbo>.<ext>", então o dono é
-- identificável pelo próprio nome do objeto. É isso que sustenta as regras
-- abaixo sem precisar de tabela auxiliar.
-- ------------------------------------------------------------

-- Leitura: o bucket é público, mas a política ainda é necessária para quem
-- passa pela API autenticada em vez da URL pública.
drop policy if exists "Avatares: leitura" on storage.objects;
create policy "Avatares: leitura"
  on storage.objects for select
  using (bucket_id = 'avatars');

-- Envio: cada pessoa grava a própria foto. Sem o prefixo do id no nome,
-- qualquer autenticado poderia sobrescrever a foto de qualquer outro.
drop policy if exists "Avatares: cada um envia a sua" on storage.objects;
create policy "Avatares: cada um envia a sua"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and name like auth.uid()::text || '-%'
  );

-- Atualização: necessária para o upsert. Só INSERT permite criar; substituir um
-- arquivo de mesmo nome exige também UPDATE, e sem ela a troca da foto falharia
-- em silêncio na segunda vez.
drop policy if exists "Avatares: cada um substitui a sua" on storage.objects;
create policy "Avatares: cada um substitui a sua"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and name like auth.uid()::text || '-%'
  )
  with check (
    bucket_id = 'avatars'
    and name like auth.uid()::text || '-%'
  );

-- Remoção: a própria pessoa, ou a gestão fazendo limpeza.
drop policy if exists "Avatares: remoção" on storage.objects;
create policy "Avatares: remoção"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (
      name like auth.uid()::text || '-%'
      or public.get_user_role()::text in ('super_admin', 'gestor')
    )
  );

-- ------------------------------------------------------------
-- 3. Conferência
-- ------------------------------------------------------------

-- O bucket existe e está público?
--   select id, public, file_size_limit from storage.buckets where id = 'avatars';

-- As quatro políticas existem?
--   select policyname, cmd from pg_policies
--   where tablename = 'objects' and policyname like 'Avatares%';
