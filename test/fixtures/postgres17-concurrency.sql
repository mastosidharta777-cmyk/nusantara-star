-- Test-only helpers for the isolated PostgreSQL 17 CI service.
-- This file must never be applied to Supabase or another persistent database.

create or replace function public.ns_test_seed_booking_chain_v1(
  p_talent_id uuid,
  p_base_at timestamptz,
  p_start_hours integer,
  p_end_hours integer
) returns table(brief_id uuid, deal_id uuid)
language plpgsql
set search_path = public
as $$
declare
  v_brief_id uuid := gen_random_uuid();
  v_deal_id uuid := gen_random_uuid();
  v_offer_id uuid := gen_random_uuid();
  v_item_id uuid := gen_random_uuid();
  v_proposal_id uuid := gen_random_uuid();
  v_start timestamptz := p_base_at + make_interval(hours => p_start_hours);
  v_end timestamptz := p_base_at + make_interval(hours => p_end_hours);
  v_offer_expiry timestamptz := p_base_at + interval '48 hours';
  v_schedule jsonb := '[{"milestone_type":"full_payment","sequence_no":1,"calculation_type":"fixed_amount","amount":1000000,"due_basis":"booking_date","due_offset_days":0}]'::jsonb;
begin
  if p_start_hours >= p_end_hours or p_end_hours >= 48 then
    raise exception 'Fixture interval must be ordered and precede offer expiry';
  end if;

  insert into public.talents(id,name,category)
  values(p_talent_id,'POSTGRES 17 FIXTURE TALENT','singer')
  on conflict (id) do nothing;

  insert into public.briefs(id,event_date,status,event_type,city,venue)
  values(v_brief_id,v_start::date,'buyer_selected','corporate','Jakarta','PG17 Fixture Hall');
  insert into public.buyer_selections(brief_id,talent_id)
  values(v_brief_id,p_talent_id);
  insert into public.talent_offers(
    id,availability_request_id,brief_id,talent_id,status,availability_status,event_fee,
    quote_valid_until,show_start_local,show_end_local,show_timezone,
    duty_start_at,duty_end_at,duty_location
  ) values (
    v_offer_id,gen_random_uuid(),v_brief_id,p_talent_id,'confirmed','confirmed',800000,
    v_offer_expiry,'18:00','19:00','Asia/Jakarta',
    v_start,v_end,'PG17 Fixture Hall'
  );
  insert into public.proposal_items(
    id,proposal_id,brief_id,talent_id,talent_offer_id,buyer_price,
    availability_status,offer_valid_until,talent_name_snapshot,talent_category_snapshot,
    show_start_local,show_end_local,show_timezone,duty_start_at,duty_end_at,duty_location
  ) values (
    v_item_id,v_proposal_id,v_brief_id,p_talent_id,v_offer_id,1000000,
    'confirmed',v_offer_expiry,'POSTGRES 17 FIXTURE TALENT','singer',
    '18:00','19:00','Asia/Jakarta',v_start,v_end,'PG17 Fixture Hall'
  );
  insert into public.deals(
    id,brief_id,proposal_id,proposal_item_id,talent_offer_id,talent_id,status,
    buyer_price,talent_payable,buyer_payment_schedule,talent_payment_schedule,
    funding_gap_status,cancellation_terms
  ) values (
    v_deal_id,v_brief_id,v_proposal_id,v_item_id,v_offer_id,p_talent_id,'locked',
    1000000,800000,v_schedule,v_schedule,'safe','PG17 fixture cancellation terms'
  );

  return query select v_brief_id,v_deal_id;
end;
$$;
