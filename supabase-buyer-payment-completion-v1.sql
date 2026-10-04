begin;

create or replace function public.ns_buyer_payment_completion_v1(p_booking_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  b public.bookings%rowtype;
  m public.payment_milestones%rowtype;
  v_required bigint := 0;
  v_resolved bigint := 0;
  v_paid bigint := 0;
  v_used bigint := 0;
  v_total_milestones integer := 0;
  v_settled_milestones integer := 0;
  v_open_milestones integer := 0;
begin
  select * into b from public.bookings where id=p_booking_id;
  if not found then raise exception 'Booking not found'; end if;

  for m in
    select * from public.payment_milestones
    where booking_id=b.id and party='buyer'
    order by sequence_no
  loop
    v_total_milestones := v_total_milestones + 1;
    if m.calculation_type='percentage' then
      v_resolved := round(b.buyer_price * (coalesce(m.percentage,0) / 100.0));
    elsif m.calculation_type='fixed_amount' then
      v_resolved := coalesce(m.amount,0);
    else
      v_resolved := greatest(0,b.buyer_price-v_used);
    end if;
    v_used := v_used + v_resolved;

    if m.status in ('waived','cancelled') then
      v_settled_milestones := v_settled_milestones + 1;
    elsif exists (
      select 1 from public.payments p
      where p.payment_milestone_id=m.id
        and p.booking_id=b.id
        and p.payment_type in ('buyer_deposit','buyer_balance','buyer_full_payment')
        and p.status='paid'
        and p.amount=v_resolved
        and nullif(trim(p.provider),'') is not null
        and nullif(trim(p.provider_reference),'') is not null
        and nullif(trim(p.evidence_key),'') is not null
        and (
          (p.receipt_timing='on_time' and p.reconciliation_status is null)
          or (p.receipt_timing='late' and p.reconciliation_status='accepted')
        )
    ) then
      v_settled_milestones := v_settled_milestones + 1;
      v_paid := v_paid + v_resolved;
    else
      v_open_milestones := v_open_milestones + 1;
    end if;
  end loop;

  v_required := b.buyer_price;

  return jsonb_build_object(
    'bookingId',b.id,
    'currency','IDR',
    'buyerPrice',v_required,
    'verifiedPaidTotal',v_paid,
    'totalMilestones',v_total_milestones,
    'settledMilestones',v_settled_milestones,
    'openMilestones',v_open_milestones,
    'obligationsSettled',v_total_milestones > 0 and v_open_milestones = 0,
    'fullyPaid',
      v_total_milestones > 0
      and v_open_milestones = 0
      and v_paid >= v_required
      and not exists (
        select 1 from public.payment_milestones x
        where x.booking_id=b.id and x.party='buyer' and x.status in ('waived','cancelled')
      ),
    'source','derived_from_locked_buyer_milestones_and_verified_payments'
  );
end;
$$;

revoke all on function public.ns_buyer_payment_completion_v1(uuid) from public, anon, authenticated;
grant execute on function public.ns_buyer_payment_completion_v1(uuid) to service_role;

comment on function public.ns_buyer_payment_completion_v1(uuid) is
  'Authoritative derived buyer-payment completion from locked buyer milestones and verified payment evidence; late transfers count only after accepted reconciliation.';

commit;
