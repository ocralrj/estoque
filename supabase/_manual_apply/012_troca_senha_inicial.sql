-- ============================================================
-- Troca obrigatória da senha inicial
--
-- Idempotente. Depende de: 011_acesso_por_departamento.sql
-- ============================================================

-- Quem é pré-cadastrado por outra pessoa recebe uma senha conhecida
-- (Mudar@123). Enquanto não trocar, ela é conhecida por quem cadastrou e por
-- qualquer um que tenha lido o e-mail — inclusive quem só passou pela caixa de
-- entrada. A marca abaixo obriga a troca antes de usar o sistema.

alter table profiles add column if not exists must_change_password boolean
  not null default false;

comment on column profiles.must_change_password is
  'true enquanto a pessoa não trocar a senha inicial definida por quem a cadastrou. A aplicação barra o acesso ao sistema até a troca.';

-- O próprio usuário precisa poder baixar a marca ao trocar a senha, mas não
-- pode levantá-la de novo nem mexer no próprio papel. A política de update do
-- próprio perfil já existe e cobre isso: `with check (role = get_user_role())`
-- impede a mudança de papel; a marca é liberada porque só a própria pessoa,
-- autenticada, alcança a própria linha.

-- Quem já está cadastrado não é afetado: o padrão é false, então ninguém é
-- barrado por uma senha que escolheu.
