-- ============================================================
-- GED: data de descarte calculada no cadastro do documento
--
-- Idempotente. Depende de: 007_ged_auditoria_restrita.sql
-- ============================================================

-- PROBLEMA
-- As regras existiam, mas nada as ligava ao documento:
--   1. `prazo` era texto ("5 anos") — não dá para somar a uma data;
--   2. o cruzamento seria por (setor, tipo), e `tipo` é texto livre nos dois
--      lados: "NF-e" no documento nunca casaria com "Notas fiscais" na regra.
--
-- CORREÇÃO
-- Prazo vira número de meses, o documento aponta para a regra escolhida, e um
-- trigger calcula a data de descarte. Guarda permanente resulta em data nula.

-- ------------------------------------------------------------
-- 1. Prazo em meses, ao lado do texto legível
-- ------------------------------------------------------------

alter table ged_retention_rules add column if not exists prazo_meses integer;

comment on column ged_retention_rules.prazo_meses is
  'Prazo de guarda em meses. NULL = guarda permanente, documento nunca é descartado.';

-- Preenche as regras que já existem a partir do texto ("5 anos" -> 60).
update ged_retention_rules
set prazo_meses = case
      when destino ilike '%permanente%' then null
      when prazo ~* '(\d+)\s*ano'  then (regexp_match(prazo, '(\d+)'))[1]::int * 12
      when prazo ~* '(\d+)\s*mes'  then (regexp_match(prazo, '(\d+)'))[1]::int
      else null
    end
where prazo_meses is null;

-- ------------------------------------------------------------
-- 2. Vínculo do documento com a regra e a data resultante
-- ------------------------------------------------------------

alter table ged_documents add column if not exists retention_rule_id uuid
  references ged_retention_rules(id) on delete set null;

alter table ged_documents add column if not exists data_descarte date;

comment on column ged_documents.data_descarte is
  'Quando o prazo de guarda vence, calculado pelo trigger. NULL = guarda permanente ou sem regra definida.';

create index if not exists ged_documents_descarte_idx
  on ged_documents (data_descarte) where data_descarte is not null;

-- ------------------------------------------------------------
-- 3. Cálculo automático
--
-- Roda no insert e sempre que a regra ou a data-base mudarem. Fica no banco,
-- e não na aplicação, para valer também em carga direta pelo SQL Editor.
-- ------------------------------------------------------------

create or replace function ged_calcular_descarte()
returns trigger as $$
declare
  meses integer;
  base  date;
begin
  if new.retention_rule_id is null then
    new.data_descarte := null;
    return new;
  end if;

  select prazo_meses into meses
  from ged_retention_rules
  where id = new.retention_rule_id;

  -- Guarda permanente: sem data de descarte, por definição.
  if meses is null then
    new.data_descarte := null;
    return new;
  end if;

  -- A contagem parte da data do documento; sem ela, da data de cadastro.
  base := coalesce(new.data_documento, current_date);
  new.data_descarte := base + (meses || ' months')::interval;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists ged_documents_descarte on ged_documents;
create trigger ged_documents_descarte
  before insert or update of retention_rule_id, data_documento on ged_documents
  for each row execute function ged_calcular_descarte();

-- Recalcula o que já está cadastrado.
update ged_documents set retention_rule_id = retention_rule_id
where retention_rule_id is not null;

-- ------------------------------------------------------------
-- 4. Regras adicionais comuns
--
-- Só parametrização legal; nenhum conteúdo de cliente.
-- ------------------------------------------------------------

insert into ged_retention_rules (setor, tipo, prazo, destino, base_legal, prazo_meses)
values
  ('Fiscal', 'Comprovantes de recolhimento', '5 anos', 'Eliminação', 'CTN art. 174', 60),
  ('DP', 'Cartão de ponto', '5 anos', 'Eliminação', 'CLT art. 74', 60),
  ('DP', 'Guias de FGTS', '30 anos', 'Guarda permanente', 'Lei 8.036/90 art. 23', null),
  ('Contábil', 'Balancetes', '10 anos', 'Eliminação', 'Código Civil art. 1.194', 120),
  ('Jurídico', 'Contratos', '10 anos', 'Guarda permanente', 'Código Civil art. 205', null),
  ('Administrativo', 'Correspondência geral', '2 anos', 'Eliminação', 'Prazo interno', 24)
on conflict (setor, tipo) do nothing;
