-- Nusantara Star — Single Portfolio Link V1
-- Additive migration. Run as a NEW query before deploying the matching application release.

begin;

alter table public.talents
  add column if not exists portfolio_url text null;

alter table public.talent_profile_submissions
  add column if not exists portfolio_url text null;

comment on column public.talents.portfolio_url is
  'Admin-approved primary media or portfolio URL supplied during onboarding.';

comment on column public.talent_profile_submissions.portfolio_url is
  'Optional primary media or portfolio URL supplied by the talent or manager.';

create or replace function public.ns_sync_approved_portfolio_url_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'approved' then
    update public.talents
    set portfolio_url = new.portfolio_url,
        updated_at = now()
    where id = new.talent_id;
  end if;
  return new;
end;
$$;

revoke all on function public.ns_sync_approved_portfolio_url_v1() from public, anon, authenticated;

drop trigger if exists trg_ns_sync_approved_portfolio_url_v1
  on public.talent_profile_submissions;

create trigger trg_ns_sync_approved_portfolio_url_v1
after insert or update of status, portfolio_url
on public.talent_profile_submissions
for each row
execute function public.ns_sync_approved_portfolio_url_v1();

update public.talents t
set portfolio_url = s.portfolio_url,
    updated_at = now()
from public.talent_profile_submissions s
where s.talent_id = t.id
  and s.status = 'approved'
  and s.portfolio_url is distinct from t.portfolio_url;

create or replace function public.ns_portfolio_link_ready_v1()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'talent_profile_submissions'
      and column_name = 'portfolio_url'
  );
$$;

revoke all on function public.ns_portfolio_link_ready_v1() from public, anon, authenticated;
grant execute on function public.ns_portfolio_link_ready_v1() to service_role;

commit;

select public.ns_portfolio_link_ready_v1() as portfolio_link_ready;
