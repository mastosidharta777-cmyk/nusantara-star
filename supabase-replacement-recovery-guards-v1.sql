-- Nusantara Star — Replacement Recovery Guards V1
-- Run after supabase-replacement-recovery-foundation-v1.sql.
-- Recovery reuses the normal booking chain, but adds deterministic guards around replacement eligibility and sequencing.

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

create or replace function public.ns_sync_recovery_availability_state_v1()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.recovery_cases
  set status = 'confirming', updated_at = now()
  where recovery_brief_id = new.brief_id
    and status = 'matching';
  return new;
end;
$$;

drop trigger if exists trg_recovery_sync_availability on public.availability_requests;
create trigger trg_recovery_sync_availability
after insert or update on public.availability_requests
for each row execute function public.ns_sync_recovery_availability_state_v1();

create or replace function public.ns_sync_recovery_proposal_state_v1()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status in ('sent','viewed','selected') then
    update public.recovery_cases
    set status = 'buyer_selection', updated_at = now()
    where recovery_brief_id = new.brief_id
      and status in ('matching','confirming');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_recovery_sync_proposal on public.proposals;
create trigger trg_recovery_sync_proposal
after insert or update on public.proposals
for each row execute function public.ns_sync_recovery_proposal_state_v1();

create or replace function public.ns_sync_recovery_selection_state_v1()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'selected' then
    update public.recovery_cases
    set selected_replacement_talent_id = new.talent_id,
        status = 'replacement_selected',
        updated_at = now()
    where recovery_brief_id = new.brief_id
      and status not in ('replacement_secured','closed_no_replacement','void');
  elsif new.status = 'withdrawn' then
    update public.recovery_cases
    set selected_replacement_talent_id = null,
        status = 'buyer_selection',
        financial_reconciliation_status = 'pending',
        financial_reconciliation_notes = null,
        updated_at = now()
    where recovery_brief_id = new.brief_id
      and selected_replacement_talent_id = new.talent_id
      and status not in ('replacement_secured','closed_no_replacement','void');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_recovery_sync_selection on public.buyer_selections;
create trigger trg_recovery_sync_selection
after insert or update on public.buyer_selections
for each row execute function public.ns_sync_recovery_selection_state_v1();

create or replace function public.ns_mark_recovery_reconciliation_v1(
  p_case_id uuid,
  p_status text,
  p_notes text
)
returns public.recovery_cases
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.recovery_cases%rowtype;
  selection public.buyer_selections%rowtype;
  result_row public.recovery_cases%rowtype;
begin
  if p_status not in ('ready','not_required') then
    raise exception 'Invalid recovery reconciliation status';
  end if;
  if coalesce(trim(p_notes), '') = '' then
    raise exception 'Recovery reconciliation notes are required';
  end if;

  select * into c from public.recovery_cases where id = p_case_id for update;
  if not found then raise exception 'Recovery case not found'; end if;
  if c.status in ('replacement_secured','closed_no_replacement','void') then
    raise exception 'Recovery case is already closed for reconciliation changes';
  end if;

  select * into selection
  from public.buyer_selections
  where brief_id = c.recovery_brief_id and status = 'selected'
  limit 1;
  if not found then raise exception 'Buyer must select a replacement before reconciliation'; end if;

  if not exists (
    select 1 from public.deals
    where brief_id = c.recovery_brief_id
      and talent_id = selection.talent_id
      and status = 'locked'
  ) then
    raise exception 'Replacement deal must be locked before reconciliation is marked ready';
  end if;

  update public.recovery_cases
  set selected_replacement_talent_id = selection.talent_id,
      status = 'reconciling',
      financial_reconciliation_status = p_status,
      financial_reconciliation_notes = trim(p_notes),
      updated_at = now()
  where id = c.id
  returning * into result_row;

  return result_row;
end;
$$;

create or replace function public.ns_close_recovery_no_replacement_v1(
  p_case_id uuid,
  p_notes text
)
returns public.recovery_cases
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.recovery_cases%rowtype;
  result_row public.recovery_cases%rowtype;
begin
  if coalesce(trim(p_notes), '') = '' then raise exception 'Closure notes are required'; end if;
  select * into c from public.recovery_cases where id = p_case_id for update;
  if not found then raise exception 'Recovery case not found'; end if;
  if c.status in ('replacement_secured','closed_no_replacement','void') then raise exception 'Recovery case is already closed'; end if;
  if c.replacement_booking_id is not null and exists (
    select 1 from public.bookings where id = c.replacement_booking_id and status = 'secured'
  ) then raise exception 'A secured replacement booking already exists'; end if;

  update public.recovery_cases
  set status = 'closed_no_replacement',
      financial_reconciliation_status = 'not_required',
      financial_reconciliation_notes = trim(p_notes),
      closed_at = now(),
      updated_at = now()
  where id = c.id
  returning * into result_row;
  return result_row;
end;
$$;

create or replace function public.ns_guard_recovery_booking_sequence_v1()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  c public.recovery_cases%rowtype;
begin
  if new.status = 'secured' then
    select * into c
    from public.recovery_cases
    where recovery_brief_id = new.brief_id and status <> 'void'
    limit 1;
    if found and c.financial_reconciliation_status not in ('ready','completed','not_required') then
      raise exception 'Recovery financial reconciliation must be ready before replacement booking is secured';
    end if;
  end if;

  if new.status = 'cancelled' then
    select * into c
    from public.recovery_cases
    where original_booking_id = new.id and status <> 'void'
    limit 1;
    if found and c.status not in ('replacement_secured','closed_no_replacement') then
      raise exception 'Original booking cannot be finalized as cancelled while replacement recovery is still active';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_recovery_booking_sequence on public.bookings;
create trigger trg_recovery_booking_sequence
before insert or update on public.bookings
for each row execute function public.ns_guard_recovery_booking_sequence_v1();

create or replace function public.ns_sync_recovery_booking_state_v1()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.recovery_cases
  set replacement_booking_id = new.id,
      selected_replacement_talent_id = new.talent_id,
      status = case when new.status = 'secured' then 'replacement_secured' else status end,
      replacement_secured_at = case when new.status = 'secured' then coalesce(replacement_secured_at, now()) else replacement_secured_at end,
      updated_at = now()
  where recovery_brief_id = new.brief_id
    and status not in ('closed_no_replacement','void');
  return new;
end;
$$;

drop trigger if exists trg_recovery_sync_booking on public.bookings;
create trigger trg_recovery_sync_booking
after insert or update on public.bookings
for each row execute function public.ns_sync_recovery_booking_state_v1();

revoke all on function public.ns_mark_recovery_reconciliation_v1(uuid,text,text) from public, anon, authenticated;
revoke all on function public.ns_close_recovery_no_replacement_v1(uuid,text) from public, anon, authenticated;
grant execute on function public.ns_mark_recovery_reconciliation_v1(uuid,text,text) to service_role;
grant execute on function public.ns_close_recovery_no_replacement_v1(uuid,text) to service_role;

comment on function public.ns_guard_recovery_original_talent_v1() is 'Database invariant: the original cancelled talent cannot be matched, confirmed, proposed, selected, dealt, or booked as its own replacement.';
comment on function public.ns_mark_recovery_reconciliation_v1(uuid,text,text) is 'Human-approved recovery reconciliation gate. Requires a selected replacement and locked replacement deal.';
comment on function public.ns_guard_recovery_booking_sequence_v1() is 'Blocks securing a replacement before reconciliation readiness and blocks final cancellation of the original booking while recovery is active.';
