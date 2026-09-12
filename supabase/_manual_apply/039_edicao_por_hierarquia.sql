-- ============================================================
-- Quem pode alterar o cadastro de quem
--
-- Idempotente. Depende de: 037_funcoes.sql
-- ============================================================

-- REGRA
--   SE quem edita é Administração ou Diretoria  -> pode alterar qualquer um
--   SENÃO SE o alvo é ele mesmo                 -> segue as regras já existentes
--   SENÃO SE mesmo departamento E nível superior -> pode alterar
--   SENÃO                                        -> bloqueia
--
-- "Nível superior" é hierarquia cadastrada, nunca texto: vem de
-- `nivel_do_usuario()`, que lê a função da pessoa (1 a 99, menor = mais alto) e
-- cai no grupo e no papel quando ela ainda não tem função.
--
-- Administração e Diretoria são as funções cujo papel herdado é `super_admin`
-- ou `gestor`. É por herança e não por nome de propósito: uma função nova
-- chamada "Diretoria", criada no nível 20, entra na regra sem que ninguém
-- precise editar este arquivo — e uma renomeada para "Diretoria" no nível 40
-- não ganha poder nenhum por causa do nome.
--
-- Isto vive no banco, e não só nas Server Actions, porque a API do PostgREST é
-- pública: uma regra que só existe na aplicação é uma regra que vale apenas
-- para quem usa a tela.

create or replace function public.pode_editar_cadastro(p_editor uuid, p_alvo uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_papel_editor text;
  v_dep_editor   text;
  v_dep_alvo     text;
begin
  if p_editor is null or p_alvo is null then
    return false;
  end if;

  -- O próprio cadastro continua como sempre foi: o que a pessoa pode mudar em
  -- si mesma já é decidido por profiles_protege_campos_de_acesso.
  if p_editor = p_alvo then
    return true;
  end if;

  select role::text into v_papel_editor from profiles where id = p_editor;
  if v_papel_editor in ('super_admin', 'gestor') then
    return true;
  end if;

  select departamento into v_dep_editor from profiles where id = p_editor;
  select departamento into v_dep_alvo   from profiles where id = p_alvo;

  -- Sem departamento dos dois lados não é "o mesmo departamento": seria
  -- transformar o vazio num departamento onde todo mundo edita todo mundo.
  if v_dep_editor is null or v_dep_alvo is null then
    return false;
  end if;

  if btrim(lower(v_dep_editor)) is distinct from btrim(lower(v_dep_alvo)) then
    return false;
  end if;

  -- Menor = mais alto. Estritamente menor: dois iguais não se editam.
  return public.nivel_do_usuario(p_editor) < public.nivel_do_usuario(p_alvo);
end;
$$;

comment on function public.pode_editar_cadastro is
  'Administração e Diretoria alteram qualquer cadastro; os demais só alteram quem for do mesmo departamento e de nível hierárquico inferior. O próprio cadastro segue as regras já existentes.';

grant execute on function public.pode_editar_cadastro(uuid, uuid) to authenticated;

-- ------------------------------------------------------------
-- A regra, aplicada
--
-- Gatilho e não policy: as policies de `profiles` já decidem outras coisas, e
-- reescrevê-las para caber mais uma condição arriscaria mexer em regra que o
-- enunciado mandou não tocar. Um gatilho acrescenta sem alterar nenhuma.
-- ------------------------------------------------------------

create or replace function public.profiles_exige_hierarquia()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Sem sessão é a chave de serviço no servidor (pré-cadastro, exclusão), que
  -- já passou pela checagem de papel na aplicação.
  if auth.uid() is null then
    return new;
  end if;

  if not public.pode_editar_cadastro(auth.uid(), new.id) then
    raise exception
      'Acesso não autorizado: você só altera o cadastro de quem for do seu departamento e de função inferior à sua.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- Nome com "w" para rodar ANTES de profiles_x_projeta_papel e das demais: não
-- faz sentido projetar papel, checar escalada ou gravar nada de uma alteração
-- que a hierarquia já recusou.
drop trigger if exists profiles_w_exige_hierarquia on profiles;
create trigger profiles_w_exige_hierarquia
  before update on profiles
  for each row execute function public.profiles_exige_hierarquia();
