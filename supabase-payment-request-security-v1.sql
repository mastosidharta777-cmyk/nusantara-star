-- Nusantara Star — Payment Request & Booking Security V1
-- Applied to production before this file was committed.

begin;

alter table public.payments
  add column if not exists payment_milestone_id uuid null references public.payment_milestones(id) on delete restrict,
  add column if not exists currency text not null default 'IDR',
  add column if not exists request_reference text null,
  add column if not exists request_issued_at timestamptz null,
  add column if not exists request_due_date date null,
  add column if not exists request_snapshot jsonb null,
  add column if not exists payment_instructions_snapshot jsonb null;

alter table public.payments drop constraint if exists payments_currency_code_check;
alter table public.payments add constraint payments_currency_code_check
  check (currency ~ '^[A-Z]{3}$');

alter table public.payments drop constraint if exists payments_request_snapshot_object_check;
alter table public.payments add constraint payments_request_snapshot_object_check
  check (request_snapshot is null or jsonb_typeof(request_snapshot) = 'object');

alter table public.payments drop constraint if exists payments_instruction_snapshot_object_check;
alter table public.payments add constraint payments_instruction_snapshot_object_check
  check (payment_instructions_snapshot is null or jsonb_typeof(payment_instructions_snapshot) = 'object');

alter table public.payments drop constraint if exists payments_active_buyer_request_metadata_check;
alter table public.payments add constraint payments_active_buyer_request_metadata_check
  check (
    payment_type not in ('buyer_deposit','buyer_balance','buyer_full_payment')
    or status not in ('pending','paid')
    or (
      payment_milestone_id is not null
      and amount > 0
      and request_reference is not null
      and request_issued_at is not null
      and request_due_date is not null
      and request_snapshot is not null
      and payment_instructions_snapshot is not null
    )
  );

create unique index if not exists idx_payments_request_reference
  on public.payments(request_reference)
  where request_reference is not null;

create unique index if not exists idx_payments_active_buyer_milestone
  on public.payments(payment_milestone_id)
  where payment_milestone_id is not null
    and payment_type in ('buyer_deposit','buyer_balance','buyer_full_payment')
    and status in ('pending','paid');

create or replace function public.ns_protect_payment_request_snapshot_v1()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.request_issued_at is not null then
    if new.payment_milestone_id is distinct from old.payment_milestone_id
       or new.currency is distinct from old.currency
       or new.amount is distinct from old.amount
       or new.request_reference is distinct from old.request_reference
       or new.request_issued_at is distinct from old.request_issued_at
       or new.request_due_date is distinct from old.request_due_date
       or new.request_snapshot is distinct from old.request_snapshot
       or new.payment_instructions_snapshot is distinct from old.payment_instructions_snapshot then
      raise exception 'Issued payment request snapshot is immutable';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_payment_request_snapshot_v1 on public.payments;
create trigger trg_protect_payment_request_snapshot_v1
before update on public.payments
for each row execute function public.ns_protect_payment_request_snapshot_v1();

create or replace function public.ns_create_buyer_payment_request_v1(
  p_booking_id uuid,
  p_payment_instructions jsonb
)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings%rowtype;
  d public.deals%rowtype;
  o public.talent_offers%rowtype;
  m public.payment_milestones%rowtype;
  existing public.payments%rowtype;
  result_row public.payments%rowtype;
  v_used bigint := 0;
  v_resolved bigint := 0;
  v_payment_type text;
  v_due_date date;
  v_now timestamptz := now();
  v_payment_id uuid := gen_random_uuid();
  v_reference text;
  v_snapshot jsonb;
  v_method text;
  v_provider_name text;
  v_destination text;
begin
  select * into b from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'Booking not found'; end if;
  if b.status not in ('pending_security','secured','pre_show') then raise exception 'Booking is not active for buyer payment requests'; end if;
  if b.deal_id is null then raise exception 'Booking has no locked deal'; end if;
  if b.buyer_terms_accepted_at is null
     or b.buyer_terms_accepted_deal_id <> b.deal_id
     or b.buyer_terms_acceptance_source <> 'signed_buyer_link'
     or b.buyer_terms_snapshot is null
     or b.buyer_terms_accepted_snapshot is distinct from b.buyer_terms_snapshot then
    raise exception 'Exact buyer terms snapshot must be accepted before payment requests are issued';
  end if;

  select * into d from public.deals where id = b.deal_id;
  if not found or d.status <> 'locked' or d.buyer_terms_status <> 'accepted' then raise exception 'Locked buyer deal is not ready for payment'; end if;
  if d.brief_id <> b.brief_id or d.talent_id <> b.talent_id then raise exception 'Booking and deal chain do not match'; end if;
  if b.buyer_price is distinct from d.buyer_price then raise exception 'Booking buyer price does not match locked deal'; end if;

  if b.status = 'pending_security' then
    select * into o from public.talent_offers where id = d.talent_offer_id;
    if not found or o.brief_id <> b.brief_id or o.talent_id <> b.talent_id
       or o.status <> 'confirmed' or o.availability_status <> 'confirmed'
       or o.quote_valid_until is null or o.quote_valid_until <= v_now then
      raise exception 'Talent offer requires reconfirmation before initial payment request';
    end if;
  end if;

  if p_payment_instructions is null or jsonb_typeof(p_payment_instructions) <> 'object' then
    raise exception 'Payment instructions are required';
  end if;
  v_method := trim(coalesce(p_payment_instructions ->> 'method',''));
  v_provider_name := trim(coalesce(p_payment_instructions ->> 'provider_name',''));
  v_destination := trim(coalesce(p_payment_instructions ->> 'destination',''));
  if v_method not in ('bank_transfer','payment_link','other') then raise exception 'Unsupported payment method'; end if;
  if v_provider_name = '' then raise exception 'Payment provider/bank name is required'; end if;
  if v_destination = '' then raise exception 'Payment destination is required'; end if;

  for m in
    select * from public.payment_milestones
    where booking_id = b.id and party = 'buyer'
    order by sequence_no
  loop
    if m.calculation_type = 'percentage' then
      v_resolved := round(b.buyer_price * (coalesce(m.percentage,0) / 100.0));
    elsif m.calculation_type = 'fixed_amount' then
      v_resolved := coalesce(m.amount,0);
    else
      v_resolved := greatest(0, b.buyer_price - v_used);
    end if;

    if m.status not in ('paid','waived','cancelled') then
      select * into existing
      from public.payments
      where payment_milestone_id = m.id
        and payment_type in ('buyer_deposit','buyer_balance','buyer_full_payment')
        and status in ('pending','paid')
      order by created_at desc
      limit 1;
      if found then return existing; end if;
      exit;
    end if;

    v_used := v_used + v_resolved;
  end loop;

  if m.id is null then raise exception 'No buyer payment milestone remains'; end if;
  if v_resolved <= 0 then raise exception 'Resolved buyer milestone amount is invalid'; end if;

  if m.milestone_type = 'full_payment' then v_payment_type := 'buyer_full_payment';
  elsif m.milestone_type in ('deposit','booking_fee') then v_payment_type := 'buyer_deposit';
  else v_payment_type := 'buyer_balance';
  end if;

  if m.due_basis = 'custom_date' then
    v_due_date := m.custom_due_date;
  elsif m.due_basis = 'event_date' or m.due_basis = 'event_completion' then
    v_due_date := b.event_date + m.due_offset_days;
  elsif m.due_basis = 'invoice_date' then
    if m.due_offset_days < 0 then raise exception 'Invoice-date payment milestone cannot be due before it is issued'; end if;
    v_due_date := current_date + m.due_offset_days;
  elsif m.due_basis = 'booking_date' then
    if m.due_offset_days < 0 then raise exception 'Booking-date payment milestone cannot be issued after its contractual due date'; end if;
    v_due_date := b.created_at::date + m.due_offset_days;
  else
    raise exception 'Unsupported payment due basis';
  end if;
  if v_due_date is null then raise exception 'Payment due date could not be resolved'; end if;

  v_reference := 'NS-PR-' || to_char(v_now at time zone 'Asia/Jakarta','YYMMDD') || '-' || upper(substr(replace(v_payment_id::text,'-',''),1,8));

  v_snapshot := jsonb_build_object(
    'schema_version', 1,
    'request_reference', v_reference,
    'booking_id', b.id,
    'deal_id', b.deal_id,
    'payment_milestone_id', m.id,
    'payment_type', v_payment_type,
    'currency', 'IDR',
    'amount', v_resolved,
    'issued_at', v_now,
    'due_date', v_due_date,
    'milestone', jsonb_build_object(
      'sequence_no', m.sequence_no,
      'milestone_type', m.milestone_type,
      'calculation_type', m.calculation_type,
      'percentage', m.percentage,
      'fixed_amount', m.amount,
      'due_basis', m.due_basis,
      'due_offset_days', m.due_offset_days,
      'custom_due_date', m.custom_due_date,
      'refundable', m.refundable,
      'cancellation_note', m.cancellation_note,
      'notes', m.notes
    ),
    'event', b.buyer_terms_snapshot -> 'event',
    'accepted_terms_snapshot', b.buyer_terms_snapshot
  );

  insert into public.payments (
    id, booking_id, payment_milestone_id, payment_type, amount, currency,
    status, idempotency_key, request_reference, request_issued_at,
    request_due_date, request_snapshot, payment_instructions_snapshot
  ) values (
    v_payment_id, b.id, m.id, v_payment_type, v_resolved, 'IDR',
    'pending', 'buyer-payment-request:' || b.id::text || ':' || m.id::text || ':' || v_payment_id::text,
    v_reference, v_now, v_due_date, v_snapshot, p_payment_instructions
  ) returning * into result_row;

  update public.payment_milestones
  set status = 'due', updated_at = v_now
  where id = m.id and status = 'planned';

  return result_row;
end;
$$;

create or replace function public.ns_record_buyer_payment_v1(
  p_booking_id uuid,
  p_payment_id uuid,
  p_provider text,
  p_provider_reference text,
  p_paid_at timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings%rowtype;
  p public.payments%rowtype;
  m public.payment_milestones%rowtype;
  v_provider text := trim(coalesce(p_provider, ''));
  v_reference text := trim(coalesce(p_provider_reference, ''));
  v_evidence_key text;
  v_paid_at timestamptz := coalesce(p_paid_at, now());
begin
  if v_provider = '' or v_reference = '' then raise exception 'Payment provider and transaction reference are required'; end if;
  if v_paid_at > now() + interval '10 minutes' then raise exception 'Payment timestamp cannot be in the future'; end if;
  v_evidence_key := lower(v_provider) || ':' || lower(v_reference);

  select * into b from public.bookings where id = p_booking_id;
  if not found then raise exception 'Booking not found'; end if;
  if b.status not in ('pending_security','secured','pre_show') then raise exception 'Booking is not active for buyer payments'; end if;

  select * into p from public.payments where id = p_payment_id for update;
  if not found or p.booking_id <> p_booking_id then raise exception 'Payment does not belong to booking'; end if;
  if p.payment_type not in ('buyer_deposit','buyer_balance','buyer_full_payment') then raise exception 'Payment is not a buyer payment request'; end if;
  if p.payment_milestone_id is null or p.request_snapshot is null or p.request_issued_at is null or p.request_reference is null then
    raise exception 'Buyer payment request snapshot is incomplete';
  end if;

  select * into m from public.payment_milestones where id = p.payment_milestone_id for update;
  if not found or m.booking_id <> p_booking_id or m.party <> 'buyer' then raise exception 'Buyer payment milestone does not match payment request'; end if;

  if p.status = 'paid' then
    if p.evidence_key = v_evidence_key
       and lower(coalesce(p.provider,'')) = lower(v_provider)
       and lower(coalesce(p.provider_reference,'')) = lower(v_reference) then
      if m.status <> 'paid' then update public.payment_milestones set status='paid',updated_at=now() where id=m.id; end if;
      return jsonb_build_object('paymentId', p.id, 'status', 'paid', 'alreadyPaid', true, 'evidenceKey', v_evidence_key, 'milestoneId', m.id);
    end if;
    raise exception 'Paid payment already has different evidence';
  end if;

  if p.status <> 'pending' then raise exception 'Payment request is not pending'; end if;

  update public.payments
  set provider = v_provider,
      provider_reference = v_reference,
      evidence_key = v_evidence_key,
      status = 'paid',
      paid_at = v_paid_at,
      updated_at = now()
  where id = p.id and status = 'pending';
  if not found then raise exception 'Payment changed before evidence was recorded'; end if;

  update public.payment_milestones
  set status = 'paid', updated_at = now()
  where id = m.id and status in ('planned','due');
  if not found and m.status <> 'paid' then raise exception 'Payment milestone changed before payment was recorded'; end if;

  return jsonb_build_object(
    'paymentId', p.id,
    'status', 'paid',
    'alreadyPaid', false,
    'evidenceKey', v_evidence_key,
    'paidAt', v_paid_at,
    'milestoneId', m.id,
    'requestReference', p.request_reference
  );
end;
$$;

revoke all on function public.ns_create_buyer_payment_request_v1(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.ns_create_buyer_payment_request_v1(uuid,jsonb) to service_role;
revoke all on function public.ns_record_buyer_payment_v1(uuid,uuid,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.ns_record_buyer_payment_v1(uuid,uuid,text,text,timestamptz) to service_role;
revoke all on function public.ns_protect_payment_request_snapshot_v1() from public, anon, authenticated;
grant execute on function public.ns_protect_payment_request_snapshot_v1() to service_role;

comment on column public.payments.request_reference is 'Human-readable Nusantara Star payment request reference.';
comment on column public.payments.request_snapshot is 'Immutable buyer-facing payment request snapshot bound to the accepted terms snapshot and milestone.';
comment on column public.payments.payment_instructions_snapshot is 'Immutable payment destination/instructions displayed to the buyer for this request.';
comment on function public.ns_create_buyer_payment_request_v1(uuid,jsonb) is 'Atomically issues the next buyer payment request from the locked payment schedule.';
comment on function public.ns_record_buyer_payment_v1(uuid,uuid,text,text,timestamptz) is 'Records evidenced buyer money and atomically marks the linked buyer milestone paid.';

commit;
