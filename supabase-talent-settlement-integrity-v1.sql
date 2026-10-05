begin;

alter table public.talent_settlements
  add column if not exists payment_milestone_id uuid null references public.payment_milestones(id) on delete restrict;

create unique index if not exists uq_talent_settlement_paid_milestone
  on public.talent_settlements(payment_milestone_id)
  where status='paid' and payment_milestone_id is not null;

create or replace function public.ns_record_talent_milestone_settlement_v1(
  p_booking_id uuid,
  p_payment_milestone_id uuid,
  p_provider text,
  p_provider_reference text,
  p_idempotency_key text,
  p_paid_at timestamptz default now(),
  p_notes text default null
)
returns public.talent_settlements
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings%rowtype;
  m public.payment_milestones%rowtype;
  existing public.talent_settlements%rowtype;
  result_row public.talent_settlements%rowtype;
  v_amount bigint;
  v_prior bigint := 0;
begin
  if coalesce(trim(p_provider_reference),'')='' then raise exception 'Settlement evidence/reference is required'; end if;
  if coalesce(trim(p_idempotency_key),'')='' then raise exception 'Idempotency key is required'; end if;

  select * into existing from public.talent_settlements where idempotency_key=trim(p_idempotency_key);
  if found then
    if existing.booking_id<>p_booking_id or existing.payment_milestone_id is distinct from p_payment_milestone_id then
      raise exception 'Idempotency key already used for a different settlement';
    end if;
    return existing;
  end if;

  select * into b from public.bookings where id=p_booking_id for update;
  if not found then raise exception 'Booking not found'; end if;
  if b.status not in ('secured','pre_show','completed') then raise exception 'Booking is not eligible for talent settlement'; end if;
  if b.talent_payable is null or b.talent_payable<=0 then raise exception 'Talent payable is invalid'; end if;

  select * into m from public.payment_milestones
  where id=p_payment_milestone_id and booking_id=b.id and party='talent'
  for update;
  if not found then raise exception 'Exact talent payment milestone is required'; end if;
  if m.status in ('paid','waived','cancelled') then raise exception 'Talent payment milestone is already resolved'; end if;

  select coalesce(sum(case
    when calculation_type='percentage' then round(b.talent_payable*(coalesce(percentage,0)/100.0))
    when calculation_type='fixed_amount' then coalesce(amount,0)
    else 0 end),0)::bigint
  into v_prior
  from public.payment_milestones
  where booking_id=b.id and party='talent' and sequence_no<m.sequence_no
    and status not in ('waived','cancelled');

  if m.calculation_type='percentage' then
    v_amount:=round(b.talent_payable*(coalesce(m.percentage,0)/100.0));
  elsif m.calculation_type='fixed_amount' then
    v_amount:=coalesce(m.amount,0);
  else
    v_amount:=greatest(0,b.talent_payable-v_prior);
  end if;
  if v_amount<=0 then raise exception 'Talent milestone amount is invalid'; end if;

  if m.due_basis='event_completion' and b.status<>'completed' then
    raise exception 'Talent milestone is not due until event completion';
  end if;
  if m.due_basis='event_date' and current_date < b.event_date + m.due_offset_days then
    raise exception 'Talent milestone is not due yet';
  end if;
  if m.due_basis='custom_date' and current_date < m.custom_due_date then
    raise exception 'Talent milestone is not due yet';
  end if;

  insert into public.talent_settlements(
    booking_id,payment_milestone_id,amount,currency,provider,provider_reference,idempotency_key,status,paid_at,notes
  ) values (
    b.id,m.id,v_amount,'IDR',nullif(trim(p_provider),''),trim(p_provider_reference),trim(p_idempotency_key),'paid',p_paid_at,p_notes
  ) returning * into result_row;

  update public.payment_milestones set status='paid',updated_at=now()
  where id=m.id and status in ('planned','due');
  if not found then raise exception 'Talent milestone settlement lost a concurrent update'; end if;

  return result_row;
end;
$$;

revoke all on function public.ns_record_talent_milestone_settlement_v1(uuid,uuid,text,text,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.ns_record_talent_milestone_settlement_v1(uuid,uuid,text,text,text,timestamptz,text) to service_role;

comment on function public.ns_record_talent_milestone_settlement_v1(uuid,uuid,text,text,text,timestamptz,text)
is 'Records actual talent payout against the exact locked talent milestone; amount is backend-derived and due-basis guarded.';

commit;
