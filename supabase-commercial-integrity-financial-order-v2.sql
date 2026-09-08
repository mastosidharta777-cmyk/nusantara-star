-- Nusantara Star — Commercial Integrity Financial Order V2
-- Supplements the core hardening migration with DB guards that keep financial security after verified Buyer Terms.

create or replace function public.ns_guard_financial_security_order_v1()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  d public.deals%rowtype;
begin
  if new.financial_security_status = 'satisfied' then
    if new.deal_id is null then raise exception 'Satisfied financial security requires a locked deal'; end if;
    select * into d from public.deals where id = new.deal_id;
    if not found or d.status <> 'locked' then raise exception 'Satisfied financial security requires a locked deal'; end if;
    if new.buyer_terms_accepted_at is null
       or new.buyer_terms_accepted_deal_id <> new.deal_id
       or new.buyer_terms_acceptance_source <> 'signed_buyer_link'
       or d.buyer_terms_status <> 'accepted' then
      raise exception 'Buyer terms must be verified before financial security is satisfied';
    end if;
    if new.financial_security_type in ('approved_po_credit','authorized_exception')
       and coalesce(trim(new.financial_security_reference), '') = '' then
      raise exception 'Manual financial security reference is required';
    end if;
    if new.financial_security_type = 'authorized_exception' and d.exception_status <> 'approved' then
      raise exception 'Commercial exception is not approved';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_financial_security_order on public.bookings;
create trigger trg_financial_security_order
before insert or update of financial_security_status,financial_security_type,financial_security_reference,buyer_terms_accepted_at,buyer_terms_accepted_deal_id,buyer_terms_acceptance_source on public.bookings
for each row execute function public.ns_guard_financial_security_order_v1();

create or replace function public.ns_guard_buyer_payment_order_v1()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  b public.bookings%rowtype;
  d public.deals%rowtype;
begin
  if new.status = 'paid' and new.payment_type in ('buyer_deposit','buyer_balance','buyer_full_payment') then
    select * into b from public.bookings where id = new.booking_id;
    if not found or b.deal_id is null then raise exception 'Paid buyer payment requires a deal-backed booking'; end if;
    select * into d from public.deals where id = b.deal_id;
    if not found or d.status <> 'locked' or d.brief_id <> b.brief_id or d.talent_id <> b.talent_id then
      raise exception 'Paid buyer payment requires a matching locked deal';
    end if;
    if b.buyer_terms_accepted_at is null
       or b.buyer_terms_accepted_deal_id <> b.deal_id
       or b.buyer_terms_acceptance_source <> 'signed_buyer_link'
       or d.buyer_terms_status <> 'accepted' then
      raise exception 'Buyer terms must be verified before buyer payment is marked paid';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_buyer_payment_order on public.payments;
create trigger trg_buyer_payment_order
before insert or update of status,payment_type,booking_id on public.payments
for each row execute function public.ns_guard_buyer_payment_order_v1();

comment on function public.ns_guard_financial_security_order_v1() is 'Database invariant: financial security cannot be satisfied before verified Buyer Terms acceptance.';
comment on function public.ns_guard_buyer_payment_order_v1() is 'Database invariant: buyer payment cannot be marked paid before verified Buyer Terms acceptance.';
