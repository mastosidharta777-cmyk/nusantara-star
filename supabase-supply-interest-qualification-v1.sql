-- Nusantara Star — qualified public supply interest V1
-- Keep the initial form lightweight, but give admin enough evidence to curate before issuing onboarding access.

alter table public.supply_interest_submissions
  add column if not exists applicant_name text null,
  add column if not exists portfolio_url text null;

alter table public.supply_interest_submissions
  drop constraint if exists supply_interest_applicant_name_check,
  add constraint supply_interest_applicant_name_check
    check (applicant_name is null or char_length(applicant_name) between 2 and 120),
  drop constraint if exists supply_interest_portfolio_url_check,
  add constraint supply_interest_portfolio_url_check
    check (portfolio_url is null or (char_length(portfolio_url) <= 1000 and portfolio_url ~* '^https?://'));

create or replace function public.ns_submit_supply_interest_v2(
  p_applicant_name text,
  p_email text,
  p_portfolio_url text,
  p_supply_type text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  clean_name text := trim(coalesce(p_applicant_name, ''));
  clean_email text := lower(trim(coalesce(p_email, '')));
  clean_portfolio text := trim(coalesce(p_portfolio_url, ''));
  result_row public.supply_interest_submissions%rowtype;
begin
  if char_length(clean_name) not between 2 and 120 then raise exception 'Nama pendaftar tidak valid'; end if;
  if char_length(clean_email) > 254 or clean_email !~ '^[^[:space:]]+@[^[:space:]]+\.[^[:space:]]+$' then raise exception 'Email pendaftar tidak valid'; end if;
  if char_length(clean_portfolio) > 1000 or clean_portfolio !~* '^https?://' then raise exception 'Link portofolio tidak valid'; end if;
  if p_supply_type not in ('talent', 'professional', 'production_partner') then raise exception 'Jenis supply tidak valid'; end if;

  insert into public.supply_interest_submissions (applicant_name, email, portfolio_url, supply_type, source)
  values (clean_name, clean_email, clean_portfolio, p_supply_type, 'coming_soon')
  on conflict (email, supply_type) do update
  set applicant_name = case when public.supply_interest_submissions.status in ('new', 'archived') then excluded.applicant_name else public.supply_interest_submissions.applicant_name end,
      portfolio_url = case when public.supply_interest_submissions.status in ('new', 'archived') then excluded.portfolio_url else public.supply_interest_submissions.portfolio_url end,
      status = case when public.supply_interest_submissions.status = 'archived' then 'new' else public.supply_interest_submissions.status end,
      created_at = case when public.supply_interest_submissions.status = 'archived' then now() else public.supply_interest_submissions.created_at end
  returning * into result_row;

  return jsonb_build_object('ok', true, 'id', result_row.id, 'status', result_row.status);
end;
$$;

revoke all on function public.ns_submit_supply_interest_v2(text, text, text, text) from public, anon, authenticated;
grant execute on function public.ns_submit_supply_interest_v2(text, text, text, text) to service_role;

comment on function public.ns_submit_supply_interest_v2(text, text, text, text) is 'Stores qualified public supply interest through the service-role server route and safely revives archived submissions.';
