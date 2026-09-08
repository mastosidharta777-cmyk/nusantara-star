-- Nusantara Star — Replacement Recovery Guards V1
-- Run after supabase-replacement-recovery-foundation-v1.sql.
-- A talent that cancelled the original booking must never re-enter that recovery chain.

create or replace function public.ns_guard_recovery_original_talent_v1()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  original_talent uuid;
begin
  select original_talent_id into original_talent
  from public.recovery_cases
  where recovery_brief_id = new.brief_id
    and status <> 'void'
  limit 1;

  if original_talent is not null and new.talent_id = original_talent then
    raise exception 'Original cancelled talent cannot be used as a replacement candidate';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_recovery_guard_match_results on public.match_results;
create trigger trg_recovery_guard_match_results
before insert or update of brief_id,talent_id on public.match_results
for each row execute function public.ns_guard_recovery_original_talent_v1();

drop trigger if exists trg_recovery_guard_availability_requests on public.availability_requests;
create trigger trg_recovery_guard_availability_requests
before insert or update of brief_id,talent_id on public.availability_requests
for each row execute function public.ns_guard_recovery_original_talent_v1();

drop trigger if exists trg_recovery_guard_talent_offers on public.talent_offers;
create trigger trg_recovery_guard_talent_offers
before insert or update of brief_id,talent_id on public.talent_offers
for each row execute function public.ns_guard_recovery_original_talent_v1();

drop trigger if exists trg_recovery_guard_proposal_items on public.proposal_items;
create trigger trg_recovery_guard_proposal_items
before insert or update of brief_id,talent_id on public.proposal_items
for each row execute function public.ns_guard_recovery_original_talent_v1();

drop trigger if exists trg_recovery_guard_buyer_selections on public.buyer_selections;
create trigger trg_recovery_guard_buyer_selections
before insert or update of brief_id,talent_id on public.buyer_selections
for each row execute function public.ns_guard_recovery_original_talent_v1();

drop trigger if exists trg_recovery_guard_deals on public.deals;
create trigger trg_recovery_guard_deals
before insert or update of brief_id,talent_id on public.deals
for each row execute function public.ns_guard_recovery_original_talent_v1();

drop trigger if exists trg_recovery_guard_bookings on public.bookings;
create trigger trg_recovery_guard_bookings
before insert or update of brief_id,talent_id on public.bookings
for each row execute function public.ns_guard_recovery_original_talent_v1();

comment on function public.ns_guard_recovery_original_talent_v1() is 'Database invariant: the original cancelled talent cannot be matched, confirmed, proposed, selected, dealt, or booked as its own replacement.';
