-- 049 — Aviso de certificado inclui a gestão
--
-- Regra: certificado vencendo em 30 dias ou menos avisa quem cuida da empresa
-- (empresa_acessos), a gestão (gestor) e o super admin. A 048 avisava só quem
-- cuida + super admin, e o gestor da área ficava sem saber.
--
-- Idempotente: pode ser reexecutado. Aplicar no SQL Editor depois da 048.

create or replace function public.avisar_certificados_a_vencer()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  avisados integer := 0;
  c record;
begin
  if auth.uid() is not null
     and public.get_user_role()::text is distinct from 'super_admin' then
    raise exception 'Apenas o administrador dispara os avisos.';
  end if;

  for c in
    select ce.id, ce.titular, ce.validade_fim, ce.empresa_id, e.razao_social
    from certificados ce
    join empresas e on e.id = ce.empresa_id
    where ce.validade_fim between current_date and current_date + 30
  loop
    -- Quem cuida da empresa, a gestão e o super admin. Sem aviso repetido no mesmo dia.
    insert into notifications (user_id, title, message, link, permissao)
    select distinct p.id,
           'Certificado vence em ' || (c.validade_fim - current_date) || ' dia(s)',
           c.razao_social || ' — ' || c.titular,
           '/dashboard/certificados',
           'certificados:certificates:read'
    from profiles p
    where p.active
      and (
        p.id in (select user_id from empresa_acessos where empresa_id = c.empresa_id)
        or p.role::text in ('super_admin', 'gestor')
      )
      and not exists (
        select 1 from notifications n
        where n.user_id = p.id
          and n.message = c.razao_social || ' — ' || c.titular
          and n.created_at > current_date
      );

    avisados := avisados + 1;
  end loop;

  return avisados;
end;
$$;

revoke all on function public.avisar_certificados_a_vencer() from public, anon;
grant execute on function public.avisar_certificados_a_vencer() to authenticated, service_role;

notify pgrst, 'reload schema';
