-- Schema-only fixture captured read-only on 2026-09-28 from Supabase PostgreSQL 17.
-- No production/user rows. PK/unique/check constraints are retained; FKs to
-- unrelated app tables and their triggers are omitted. Full cutover testing remains required.
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema extensions;
create table public.bookings(
id uuid not null default gen_random_uuid(),
brief_id uuid not null,
talent_id uuid not null,
event_date date not null,
venue text,
city text,
buyer_price bigint,
talent_payable bigint,
direct_cost bigint not null default 0,
status text not null default 'pending_security'::text,
created_at timestamp with time zone not null default now(),
updated_at timestamp with time zone not null default now(),
deal_id uuid,
buyer_terms_accepted_at timestamp with time zone,
financial_security_type text,
financial_security_status text not null default 'pending'::text,
financial_security_reference text,
secured_at timestamp with time zone,
pre_show_at timestamp with time zone,
completed_at timestamp with time zone,
buyer_terms_accepted_deal_id uuid,
buyer_terms_acceptance_source text,
buyer_terms_snapshot jsonb,
buyer_terms_accepted_snapshot jsonb,
completion_source text,
completion_notes text,
completion_advance_revision_no integer,
constraint bookings_brief_id_key UNIQUE (brief_id),
constraint bookings_buyer_price_check CHECK (((buyer_price IS NULL) OR (buyer_price >= 0))),
constraint bookings_buyer_terms_acceptance_evidence CHECK ((((buyer_terms_accepted_at IS NULL) AND (buyer_terms_accepted_deal_id IS NULL) AND (buyer_terms_acceptance_source IS NULL) AND (buyer_terms_accepted_snapshot IS NULL)) OR ((buyer_terms_accepted_at IS NOT NULL) AND (buyer_terms_accepted_deal_id IS NOT NULL) AND (buyer_terms_accepted_deal_id = deal_id) AND (buyer_terms_acceptance_source = 'signed_buyer_link'::text) AND (buyer_terms_snapshot IS NOT NULL) AND (buyer_terms_accepted_snapshot = buyer_terms_snapshot)))),
constraint bookings_buyer_terms_accepted_snapshot_object CHECK (((buyer_terms_accepted_snapshot IS NULL) OR (jsonb_typeof(buyer_terms_accepted_snapshot) = 'object'::text))),
constraint bookings_buyer_terms_snapshot_object CHECK (((buyer_terms_snapshot IS NULL) OR (jsonb_typeof(buyer_terms_snapshot) = 'object'::text))),
constraint bookings_completion_source_check CHECK (((completion_source IS NULL) OR (completion_source = ANY (ARRAY['both_parties'::text, 'admin_override'::text])))),
constraint bookings_direct_cost_check CHECK ((direct_cost >= 0)),
constraint bookings_financial_security_status_check CHECK ((financial_security_status = ANY (ARRAY['pending'::text, 'satisfied'::text, 'rejected'::text]))),
constraint bookings_financial_security_type_check CHECK (((financial_security_type IS NULL) OR (financial_security_type = ANY (ARRAY['deposit_received'::text, 'full_payment_received'::text, 'approved_po_credit'::text, 'authorized_exception'::text])))),
constraint bookings_manual_security_requires_reference CHECK (((financial_security_status <> 'satisfied'::text) OR (financial_security_type <> ALL (ARRAY['approved_po_credit'::text, 'authorized_exception'::text])) OR (COALESCE(TRIM(BOTH FROM financial_security_reference), ''::text) <> ''::text))),
constraint bookings_pkey PRIMARY KEY (id),
constraint bookings_post_security_evidence CHECK (((status <> ALL (ARRAY['secured'::text, 'pre_show'::text, 'incident'::text, 'completed'::text])) OR ((deal_id IS NOT NULL) AND (buyer_terms_accepted_at IS NOT NULL) AND (buyer_terms_accepted_deal_id = deal_id) AND (buyer_terms_acceptance_source = 'signed_buyer_link'::text) AND (financial_security_status = 'satisfied'::text) AND (financial_security_type IS NOT NULL) AND (secured_at IS NOT NULL)))),
constraint bookings_status_check CHECK ((status = ANY (ARRAY['pending_security'::text, 'secured'::text, 'pre_show'::text, 'incident'::text, 'completed'::text, 'cancelled'::text]))),
constraint bookings_talent_payable_check CHECK (((talent_payable IS NULL) OR (talent_payable >= 0)))
);

create table public.briefs(
id uuid not null default gen_random_uuid(),
event_type text,
event_date date,
city text,
venue text,
audience_size integer,
talent_category text,
genre_style text[] not null default '{}'::text[],
budget_min bigint,
budget_max bigint,
performance_duration_minutes integer,
event_vibe text[] not null default '{}'::text[],
special_requirements text[] not null default '{}'::text[],
source_text text,
field_evidence jsonb not null default '{}'::jsonb,
status text not null default 'new'::text,
created_at timestamp with time zone not null default now(),
updated_at timestamp with time zone not null default now(),
buyer_name text,
buyer_company text,
buyer_whatsapp text,
buyer_email text,
request_mode text not null default 'discovery'::text,
requested_talent_id uuid,
estimated_show_start_local time without time zone,
estimated_show_end_local time without time zone,
estimated_show_timezone text,
constraint briefs_audience_size_check CHECK (((audience_size IS NULL) OR (audience_size >= 0))),
constraint briefs_budget_max_check CHECK (((budget_max IS NULL) OR (budget_max >= 0))),
constraint briefs_budget_min_check CHECK (((budget_min IS NULL) OR (budget_min >= 0))),
constraint briefs_check CHECK (((budget_min IS NULL) OR (budget_max IS NULL) OR (budget_max >= budget_min))),
constraint briefs_estimated_show_time_complete_v1 CHECK ((((estimated_show_start_local IS NULL) AND (estimated_show_end_local IS NULL) AND (estimated_show_timezone IS NULL)) OR ((estimated_show_start_local IS NOT NULL) AND (estimated_show_end_local IS NOT NULL) AND (estimated_show_start_local <> estimated_show_end_local) AND (estimated_show_timezone = ANY (ARRAY['Asia/Jakarta'::text, 'Asia/Makassar'::text, 'Asia/Jayapura'::text]))))),
constraint briefs_performance_duration_minutes_check CHECK (((performance_duration_minutes IS NULL) OR (performance_duration_minutes > 0))),
constraint briefs_pkey PRIMARY KEY (id),
constraint briefs_request_mode_check CHECK ((request_mode = ANY (ARRAY['discovery'::text, 'direct_talent'::text]))),
constraint briefs_request_mode_target_check CHECK ((((request_mode = 'discovery'::text) AND (requested_talent_id IS NULL)) OR ((request_mode = 'direct_talent'::text) AND (requested_talent_id IS NOT NULL)))),
constraint briefs_status_check CHECK ((status = ANY (ARRAY['new'::text, 'reviewing'::text, 'matching'::text, 'availability_check'::text, 'shortlisted'::text, 'proposal_sent'::text, 'buyer_selected'::text, 'terms_agreed'::text, 'booked'::text, 'closed'::text, 'cancelled'::text])))
);

create table public.buyer_selections(
id uuid not null default gen_random_uuid(),
brief_id uuid not null,
talent_id uuid not null,
status text not null default 'selected'::text,
selected_at timestamp with time zone not null default now(),
updated_at timestamp with time zone not null default now(),
constraint buyer_selections_brief_id_key UNIQUE (brief_id),
constraint buyer_selections_pkey PRIMARY KEY (id),
constraint buyer_selections_status_check CHECK ((status = ANY (ARRAY['selected'::text, 'withdrawn'::text])))
);

create table public.deals(
id uuid not null default gen_random_uuid(),
brief_id uuid not null,
proposal_id uuid not null,
proposal_item_id uuid not null,
talent_offer_id uuid not null,
talent_id uuid not null,
status text not null default 'draft'::text,
buyer_price bigint not null,
talent_payable bigint not null,
direct_costs bigint,
taxes_and_payment_fees bigint,
contribution bigint,
buyer_payment_schedule jsonb not null default '[]'::jsonb,
talent_payment_schedule jsonb not null default '[]'::jsonb,
booking_reference_date date,
invoice_reference_date date,
direct_cost_due_date date,
tax_fee_due_date date,
funding_gap_amount bigint,
funding_gap_status text not null default 'unknown'::text,
talent_terms_status text not null default 'confirmed'::text,
buyer_terms_status text not null default 'recommended'::text,
unresolved_issues text[] not null default '{}'::text[],
cancellation_terms text,
rider_notes text,
special_conditions text,
exception_status text not null default 'none'::text,
exception_reason text,
approved_at timestamp with time zone,
locked_at timestamp with time zone,
created_at timestamp with time zone not null default now(),
updated_at timestamp with time zone not null default now(),
constraint deals_brief_id_key UNIQUE (brief_id),
constraint deals_buyer_price_check CHECK ((buyer_price >= 0)),
constraint deals_buyer_terms_status_check CHECK ((buyer_terms_status = ANY (ARRAY['recommended'::text, 'accepted'::text, 'changed'::text, 'unresolved'::text]))),
constraint deals_direct_costs_check CHECK (((direct_costs IS NULL) OR (direct_costs >= 0))),
constraint deals_exception_status_check CHECK ((exception_status = ANY (ARRAY['none'::text, 'requested'::text, 'approved'::text, 'rejected'::text]))),
constraint deals_funding_gap_amount_check CHECK (((funding_gap_amount IS NULL) OR (funding_gap_amount >= 0))),
constraint deals_funding_gap_status_check CHECK ((funding_gap_status = ANY (ARRAY['safe'::text, 'gap'::text, 'unknown'::text]))),
constraint deals_pkey PRIMARY KEY (id),
constraint deals_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'review_required'::text, 'approved'::text, 'locked'::text]))),
constraint deals_talent_payable_check CHECK ((talent_payable >= 0)),
constraint deals_talent_terms_status_check CHECK ((talent_terms_status = ANY (ARRAY['confirmed'::text, 'changed'::text, 'unresolved'::text]))),
constraint deals_taxes_and_payment_fees_check CHECK (((taxes_and_payment_fees IS NULL) OR (taxes_and_payment_fees >= 0)))
);

create table public.payment_milestones(
id uuid not null default gen_random_uuid(),
booking_id uuid not null,
party text not null,
milestone_type text not null,
sequence_no integer not null default 1,
calculation_type text not null,
percentage numeric(5,2),
amount bigint,
due_basis text not null,
due_offset_days integer not null default 0,
custom_due_date date,
refundable boolean,
cancellation_note text,
status text not null default 'planned'::text,
notes text,
created_at timestamp with time zone not null default now(),
updated_at timestamp with time zone not null default now(),
constraint payment_milestones_amount_check CHECK (((amount IS NULL) OR (amount >= 0))),
constraint payment_milestones_calculation_type_check CHECK ((calculation_type = ANY (ARRAY['percentage'::text, 'fixed_amount'::text, 'remaining_balance'::text]))),
constraint payment_milestones_custom_date_check CHECK ((((due_basis = 'custom_date'::text) AND (custom_due_date IS NOT NULL)) OR ((due_basis <> 'custom_date'::text) AND (custom_due_date IS NULL)))),
constraint payment_milestones_due_basis_check CHECK ((due_basis = ANY (ARRAY['booking_date'::text, 'event_date'::text, 'event_completion'::text, 'invoice_date'::text, 'custom_date'::text]))),
constraint payment_milestones_milestone_type_check CHECK ((milestone_type = ANY (ARRAY['booking_fee'::text, 'deposit'::text, 'balance'::text, 'full_payment'::text, 'other'::text]))),
constraint payment_milestones_party_check CHECK ((party = ANY (ARRAY['buyer'::text, 'talent'::text]))),
constraint payment_milestones_percentage_check CHECK (((percentage IS NULL) OR ((percentage >= (0)::numeric) AND (percentage <= (100)::numeric)))),
constraint payment_milestones_pkey PRIMARY KEY (id),
constraint payment_milestones_sequence_no_check CHECK ((sequence_no > 0)),
constraint payment_milestones_status_check CHECK ((status = ANY (ARRAY['planned'::text, 'due'::text, 'paid'::text, 'waived'::text, 'cancelled'::text]))),
constraint payment_milestones_value_check CHECK ((((calculation_type = 'percentage'::text) AND (percentage IS NOT NULL) AND (amount IS NULL)) OR ((calculation_type = 'fixed_amount'::text) AND (amount IS NOT NULL) AND (percentage IS NULL)) OR ((calculation_type = 'remaining_balance'::text) AND (percentage IS NULL) AND (amount IS NULL))))
);

create table public.payments(
id uuid not null default gen_random_uuid(),
booking_id uuid not null,
payment_type text not null,
amount bigint not null,
provider text,
provider_reference text,
status text not null default 'pending'::text,
paid_at timestamp with time zone,
created_at timestamp with time zone not null default now(),
updated_at timestamp with time zone not null default now(),
idempotency_key text,
evidence_key text,
payment_milestone_id uuid,
currency text not null default 'IDR'::text,
request_reference text,
request_issued_at timestamp with time zone,
request_due_date date,
request_snapshot jsonb,
payment_instructions_snapshot jsonb,
constraint payments_active_buyer_request_metadata_check CHECK (((payment_type <> ALL (ARRAY['buyer_deposit'::text, 'buyer_balance'::text, 'buyer_full_payment'::text])) OR (status <> ALL (ARRAY['pending'::text, 'paid'::text])) OR ((payment_milestone_id IS NOT NULL) AND (amount > 0) AND (request_reference IS NOT NULL) AND (request_issued_at IS NOT NULL) AND (request_due_date IS NOT NULL) AND (request_snapshot IS NOT NULL) AND (payment_instructions_snapshot IS NOT NULL)))),
constraint payments_amount_check CHECK ((amount >= 0)),
constraint payments_currency_code_check CHECK ((currency ~ '^[A-Z]{3}$'::text)),
constraint payments_instruction_snapshot_object_check CHECK (((payment_instructions_snapshot IS NULL) OR (jsonb_typeof(payment_instructions_snapshot) = 'object'::text))),
constraint payments_paid_requires_evidence CHECK (((status <> 'paid'::text) OR ((COALESCE(TRIM(BOTH FROM provider), ''::text) <> ''::text) AND (COALESCE(TRIM(BOTH FROM provider_reference), ''::text) <> ''::text) AND (COALESCE(TRIM(BOTH FROM evidence_key), ''::text) <> ''::text)))),
constraint payments_payment_type_check CHECK ((payment_type = ANY (ARRAY['buyer_deposit'::text, 'buyer_balance'::text, 'buyer_full_payment'::text, 'other'::text]))),
constraint payments_pkey PRIMARY KEY (id),
constraint payments_request_snapshot_object_check CHECK (((request_snapshot IS NULL) OR (jsonb_typeof(request_snapshot) = 'object'::text))),
constraint payments_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'paid'::text, 'failed'::text, 'cancelled'::text, 'refunded'::text])))
);

create table public.cancellation_cases(
id uuid primary key default gen_random_uuid(),
booking_id uuid not null unique,
status text not null default 'approved' check(status in ('approved','settled','void')),
buyer_refund_amount bigint not null default 0,
talent_due_amount bigint not null default 0,
settled_at timestamptz,
created_at timestamptz not null default now(),
updated_at timestamptz not null default now()
);

create table public.buyer_refunds(
id uuid primary key default gen_random_uuid(),
booking_id uuid not null,
cancellation_case_id uuid not null,
amount bigint not null
);

create table public.talent_settlements(
id uuid primary key default gen_random_uuid(),
booking_id uuid not null,
amount bigint not null
);

create table public.talent_settlement_reversals(
id uuid primary key default gen_random_uuid(),
booking_id uuid not null,
cancellation_case_id uuid not null,
amount bigint not null
);

create table public.recovery_cases(
id uuid primary key default gen_random_uuid(),
original_booking_id uuid not null,
status text not null check(status in (
  'matching','confirming','buyer_selection','replacement_selected','reconciling',
  'replacement_secured','closed_no_replacement','void'
))
);

create table public.proposal_items(
id uuid not null default gen_random_uuid(),
proposal_id uuid not null,
brief_id uuid not null,
talent_id uuid not null,
talent_offer_id uuid not null,
buyer_price bigint not null,
currency text not null default 'IDR'::text,
availability_status text not null,
included_costs text,
excluded_costs text,
payment_terms text,
rider_exceptions text,
offer_valid_until timestamp with time zone,
talent_name_snapshot text not null,
talent_category_snapshot text not null,
talent_base_city_snapshot text,
talent_genres_snapshot text[] not null default '{}'::text[],
talent_bio_snapshot text,
talent_profile_image_url_snapshot text,
match_score_snapshot numeric(6,2),
match_tier_snapshot text,
created_at timestamp with time zone not null default now(),
why_fit_snapshot jsonb not null default '{"en": [], "id": []}'::jsonb,
media_snapshot jsonb not null default '[]'::jsonb,
price_breakdown jsonb not null default '{}'::jsonb,
show_start_local time without time zone,
show_end_local time without time zone,
show_timezone text,
constraint proposal_items_buyer_price_check CHECK ((buyer_price >= 0)),
constraint proposal_items_confirmed_requires_expiry CHECK (((availability_status <> 'confirmed'::text) OR (offer_valid_until IS NOT NULL))) NOT VALID,
constraint proposal_items_pkey PRIMARY KEY (id),
constraint proposal_items_price_breakdown_object_check CHECK ((jsonb_typeof(price_breakdown) = 'object'::text)),
constraint proposal_items_proposal_id_talent_id_key UNIQUE (proposal_id, talent_id),
constraint proposal_items_show_window_check CHECK ((((show_start_local IS NULL) AND (show_end_local IS NULL) AND (show_timezone IS NULL)) OR ((show_start_local IS NOT NULL) AND (show_end_local IS NOT NULL) AND (show_start_local <> show_end_local) AND (show_timezone = ANY (ARRAY['Asia/Jakarta'::text, 'Asia/Makassar'::text, 'Asia/Jayapura'::text])))))
);

create table public.talent_offers(
id uuid not null default gen_random_uuid(),
availability_request_id uuid not null,
brief_id uuid not null,
talent_id uuid not null,
status text not null,
availability_status text not null,
event_fee bigint,
currency text not null default 'IDR'::text,
included_costs text,
excluded_costs text,
payment_terms text,
rider_exceptions text,
quote_valid_until timestamp with time zone,
confirmation_source text not null default 'manager_portal'::text,
confirmed_at timestamp with time zone not null default now(),
created_at timestamp with time zone not null default now(),
updated_at timestamp with time zone not null default now(),
show_start_local time without time zone,
show_end_local time without time zone,
show_timezone text,
constraint talent_offer_confirmed_fee_check CHECK (((availability_status <> 'confirmed'::text) OR ((event_fee IS NOT NULL) AND (event_fee > 0)))),
constraint talent_offers_availability_request_id_key UNIQUE (availability_request_id),
constraint talent_offers_availability_status_check CHECK ((availability_status = ANY (ARRAY['confirmed'::text, 'tentative'::text, 'unavailable'::text]))),
constraint talent_offers_confirmed_requires_expiry CHECK (((status <> 'confirmed'::text) OR (quote_valid_until IS NOT NULL))) NOT VALID,
constraint talent_offers_event_fee_check CHECK (((event_fee IS NULL) OR (event_fee >= 0))),
constraint talent_offers_pkey PRIMARY KEY (id),
constraint talent_offers_show_window_check CHECK ((((show_start_local IS NULL) AND (show_end_local IS NULL) AND (show_timezone IS NULL)) OR ((show_start_local IS NOT NULL) AND (show_end_local IS NOT NULL) AND (show_start_local <> show_end_local) AND (show_timezone = ANY (ARRAY['Asia/Jakarta'::text, 'Asia/Makassar'::text, 'Asia/Jayapura'::text]))))),
constraint talent_offers_status_check CHECK ((status = ANY (ARRAY['confirmed'::text, 'changed'::text, 'unavailable'::text, 'expired'::text])))
);

create table public.talents(
id uuid not null default gen_random_uuid(),
name text not null,
category text not null,
gender text,
genres text[] not null default '{}'::text[],
base_city text,
service_cities text[] not null default '{}'::text[],
performance_formats text[] not null default '{}'::text[],
event_types text[] not null default '{}'::text[],
audience_tags text[] not null default '{}'::text[],
budget_min bigint,
budget_max bigint,
reliability_score numeric(5,2),
last_calendar_updated_at timestamp with time zone,
status text not null default 'curated'::text,
public_visible boolean not null default false,
bio text,
profile_image_url text,
created_at timestamp with time zone not null default now(),
updated_at timestamp with time zone not null default now(),
manager_name text,
manager_email text,
manager_whatsapp text,
instagram_url text,
tiktok_url text,
youtube_url text,
show_duration_minutes integer,
base_rider text,
travel_policy text,
accommodation_policy text,
onboarding_status text not null default 'not_started'::text,
onboarding_approved_at timestamp with time zone,
act_type text,
entertainment_tags text[] not null default '{}'::text[],
music_styles text[] not null default '{}'::text[],
vibe_tags text[] not null default '{}'::text[],
capability_tags text[] not null default '{}'::text[],
willing_to_perform_covers boolean,
accepts_song_requests boolean,
sample_repertoire jsonb not null default '[]'::jsonb,
repertoire_genres text[] not null default '{}'::text[],
repertoire_styles text[] not null default '{}'::text[],
repertoire_eras text[] not null default '{}'::text[],
repertoire_ai_status text not null default 'not_applicable'::text,
repertoire_ai_updated_at timestamp with time zone,
portfolio_url text,
booking_limitations text,
supply_type text not null default 'talent'::text,
supply_details jsonb not null default '{}'::jsonb,
supply_service_ids text[] not null default '{}'::text[],
primary_supply_service_id text,
supply_other_service text,
constraint talents_act_type_check CHECK (((act_type IS NULL) OR (act_type = ANY (ARRAY['original_artist'::text, 'cover_entertainment'::text, 'cover_performer'::text, 'mixed'::text])))),
constraint talents_booking_limitations_check CHECK (((booking_limitations IS NULL) OR (char_length(booking_limitations) <= 2000))),
constraint talents_budget_max_check CHECK (((budget_max IS NULL) OR (budget_max >= 0))),
constraint talents_budget_min_check CHECK (((budget_min IS NULL) OR (budget_min >= 0))),
constraint talents_check CHECK (((budget_min IS NULL) OR (budget_max IS NULL) OR (budget_max >= budget_min))),
constraint talents_gender_check CHECK (((gender IS NULL) OR (gender = ANY (ARRAY['female'::text, 'male'::text, 'mixed'::text, 'unknown'::text])))),
constraint talents_onboarding_status_check CHECK ((onboarding_status = ANY (ARRAY['not_started'::text, 'in_progress'::text, 'submitted'::text, 'approved'::text, 'rejected'::text]))),
constraint talents_pkey PRIMARY KEY (id),
constraint talents_repertoire_ai_status_check CHECK ((repertoire_ai_status = ANY (ARRAY['not_applicable'::text, 'pending'::text, 'suggested'::text, 'approved'::text]))),
constraint talents_sample_repertoire_check CHECK (((jsonb_typeof(sample_repertoire) = 'array'::text) AND (jsonb_array_length(sample_repertoire) <= 20))),
constraint talents_show_duration_minutes_check CHECK (((show_duration_minutes IS NULL) OR (show_duration_minutes > 0))),
constraint talents_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'curated'::text, 'verified'::text, 'inactive'::text]))),
constraint talents_supply_details_object_check CHECK ((jsonb_typeof(supply_details) = 'object'::text)),
constraint talents_supply_services_check CHECK (((supply_type = 'talent'::text) OR (((cardinality(supply_service_ids) = 0) AND (primary_supply_service_id IS NULL) AND (supply_other_service IS NULL)) OR ((cardinality(supply_service_ids) > 0) AND (supply_service_ids <@ ARRAY['music_director'::text, 'music_producer_arranger'::text, 'songwriter_topliner'::text, 'session_musician'::text, 'recording_engineer'::text, 'mixing_engineer'::text, 'mastering_engineer'::text, 'foh_monitor_engineer'::text, 'stage_manager'::text, 'production_manager'::text, 'show_director'::text, 'photographer'::text, 'videographer_editor'::text, 'choreographer'::text, 'lighting_designer'::text, 'sound_system'::text, 'lighting'::text, 'stage_rigging'::text, 'led_multimedia'::text, 'backline'::text, 'event_production'::text, 'technical_crew'::text, 'equipment_rental'::text, 'power_genset'::text, 'transport_logistics'::text, 'event_equipment'::text, 'other'::text]) AND (primary_supply_service_id = ANY (supply_service_ids)) AND (((array_position(supply_service_ids, 'other'::text) IS NOT NULL) AND (NULLIF(btrim(supply_other_service), ''::text) IS NOT NULL)) OR ((array_position(supply_service_ids, 'other'::text) IS NULL) AND (supply_other_service IS NULL))))))),
constraint talents_supply_type_check CHECK ((supply_type = ANY (ARRAY['talent'::text, 'professional'::text, 'production_partner'::text])))
);
CREATE OR REPLACE FUNCTION public.ns_accept_buyer_terms_v1(p_booking_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  b public.bookings%rowtype;
  d public.deals%rowtype;
  br public.briefs%rowtype;
  o public.talent_offers%rowtype;
  v_now timestamptz := now();
begin
  select * into b from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'Booking not found'; end if;
  if b.deal_id is null then raise exception 'Booking has no locked deal'; end if;

  select * into d from public.deals where id = b.deal_id for update;
  if not found or d.status <> 'locked' then raise exception 'Deal is not locked'; end if;
  if d.brief_id <> b.brief_id or d.talent_id <> b.talent_id then raise exception 'Booking and locked deal chain do not match'; end if;
  if b.buyer_price is distinct from d.buyer_price
     or b.talent_payable is distinct from d.talent_payable
     or b.direct_cost is distinct from coalesce(d.direct_costs, 0) then
    raise exception 'Booking commercial snapshot does not match the locked deal';
  end if;
  if d.talent_terms_status <> 'confirmed' then raise exception 'Talent terms are unresolved'; end if;
  if d.funding_gap_status <> 'safe' then raise exception 'Funding gap is unresolved'; end if;
  if cardinality(coalesce(d.unresolved_issues, '{}'::text[])) > 0 and d.exception_status <> 'approved' then
    raise exception 'Deal still has unresolved issues without an approved exception';
  end if;

  select * into br from public.briefs where id = b.brief_id for update;
  if not found then raise exception 'Brief not found'; end if;
  if b.event_date is distinct from br.event_date then raise exception 'Booking event date does not match the brief'; end if;

  if b.buyer_terms_snapshot is null or jsonb_typeof(b.buyer_terms_snapshot) <> 'object' then
    raise exception 'Buyer terms snapshot is missing';
  end if;
  if b.buyer_terms_snapshot ->> 'schema_version' <> '1' then raise exception 'Unsupported buyer terms snapshot version'; end if;
  if b.buyer_terms_snapshot ->> 'deal_id' <> d.id::text then raise exception 'Buyer terms snapshot deal does not match'; end if;
  if b.buyer_terms_snapshot ->> 'brief_id' <> b.brief_id::text then raise exception 'Buyer terms snapshot brief does not match'; end if;
  if b.buyer_terms_snapshot #>> '{event,talent_id}' <> b.talent_id::text then raise exception 'Buyer terms snapshot talent does not match'; end if;
  if b.buyer_terms_snapshot #>> '{event,event_date}' <> b.event_date::text then raise exception 'Buyer terms snapshot event date does not match'; end if;
  if jsonb_typeof(b.buyer_terms_snapshot #> '{pricing,buyer_price}') <> 'number'
     or (b.buyer_terms_snapshot #>> '{pricing,buyer_price}')::bigint is distinct from d.buyer_price then
    raise exception 'Buyer terms snapshot price does not match locked deal';
  end if;
  if jsonb_typeof(b.buyer_terms_snapshot #> '{pricing,direct_costs}') <> 'number'
     or (b.buyer_terms_snapshot #>> '{pricing,direct_costs}')::bigint is distinct from coalesce(d.direct_costs, 0) then
    raise exception 'Buyer terms snapshot direct costs do not match locked deal';
  end if;
  if jsonb_typeof(b.buyer_terms_snapshot #> '{pricing,taxes_and_payment_fees}') <> 'number'
     or (b.buyer_terms_snapshot #>> '{pricing,taxes_and_payment_fees}')::bigint is distinct from coalesce(d.taxes_and_payment_fees, 0) then
    raise exception 'Buyer terms snapshot taxes/payment fees do not match locked deal';
  end if;
  if b.buyer_terms_snapshot #> '{payment_schedule}' is distinct from d.buyer_payment_schedule then
    raise exception 'Buyer terms snapshot payment schedule does not match locked deal';
  end if;
  if b.buyer_terms_snapshot #>> '{terms,cancellation_terms}' is distinct from d.cancellation_terms then
    raise exception 'Buyer terms snapshot cancellation terms do not match locked deal';
  end if;
  if b.buyer_terms_snapshot #>> '{terms,rider_notes}' is distinct from d.rider_notes then
    raise exception 'Buyer terms snapshot rider terms do not match locked deal';
  end if;
  if b.buyer_terms_snapshot #>> '{terms,special_conditions}' is distinct from d.special_conditions then
    raise exception 'Buyer terms snapshot special conditions do not match locked deal';
  end if;

  if b.buyer_terms_accepted_at is not null
     and b.buyer_terms_accepted_deal_id = d.id
     and b.buyer_terms_acceptance_source = 'signed_buyer_link'
     and b.buyer_terms_accepted_snapshot = b.buyer_terms_snapshot
     and d.buyer_terms_status = 'accepted' then
    return jsonb_build_object('bookingId', b.id, 'dealId', d.id, 'acceptedAt', b.buyer_terms_accepted_at, 'alreadyAccepted', true);
  end if;

  if b.status <> 'pending_security' then raise exception 'Booking is no longer awaiting buyer terms'; end if;
  if br.status <> 'buyer_selected' then raise exception 'Brief is not at buyer-selected stage'; end if;
  if d.buyer_terms_status <> 'recommended' then raise exception 'Buyer terms are not in an approvable state'; end if;
  if jsonb_typeof(d.buyer_payment_schedule) <> 'array' or jsonb_array_length(d.buyer_payment_schedule) = 0 then raise exception 'Buyer payment schedule is missing'; end if;
  if coalesce(trim(d.cancellation_terms), '') = '' then raise exception 'Buyer cancellation terms are missing'; end if;

  select * into o from public.talent_offers where id = d.talent_offer_id;
  if not found or o.brief_id <> b.brief_id or o.talent_id <> b.talent_id or o.status <> 'confirmed' or o.availability_status <> 'confirmed' then
    raise exception 'Talent offer requires reconfirmation';
  end if;
  if o.quote_valid_until is null or o.quote_valid_until <= v_now then raise exception 'Talent offer has expired or has no validity'; end if;

  update public.bookings
  set buyer_terms_accepted_at = v_now,
      buyer_terms_accepted_deal_id = d.id,
      buyer_terms_acceptance_source = 'signed_buyer_link',
      buyer_terms_accepted_snapshot = buyer_terms_snapshot,
      updated_at = v_now
  where id = b.id and status = 'pending_security';
  if not found then raise exception 'Buyer terms acceptance lost a concurrent update'; end if;

  update public.deals
  set buyer_terms_status = 'accepted', updated_at = v_now
  where id = d.id and status = 'locked' and buyer_terms_status = 'recommended';
  if not found then raise exception 'Deal changed before buyer acceptance'; end if;

  update public.briefs
  set status = 'terms_agreed', updated_at = v_now
  where id = b.brief_id and status = 'buyer_selected';
  if not found then raise exception 'Brief changed before buyer acceptance was finalized'; end if;

  return jsonb_build_object('bookingId', b.id, 'dealId', d.id, 'acceptedAt', v_now, 'alreadyAccepted', false, 'source', 'signed_buyer_link', 'snapshotVersion', 1);
end;
$function$;

CREATE OR REPLACE FUNCTION public.ns_guard_booking_integrity_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  d public.deals%rowtype;
  br public.briefs%rowtype;
  o public.talent_offers%rowtype;
  m public.payment_milestones%rowtype;
  v_paid numeric := 0;
  v_required numeric := 0;
  v_entering_secured boolean := false;
begin
  if tg_op = 'UPDATE' then
    if old.brief_id is distinct from new.brief_id
       or old.deal_id is distinct from new.deal_id
       or old.talent_id is distinct from new.talent_id
       or old.event_date is distinct from new.event_date
       or old.buyer_price is distinct from new.buyer_price
       or old.talent_payable is distinct from new.talent_payable
       or old.direct_cost is distinct from new.direct_cost then
      raise exception 'Booking deal identity and commercial snapshot are immutable';
    end if;

    if old.buyer_terms_accepted_at is not null and (
      old.buyer_terms_accepted_at is distinct from new.buyer_terms_accepted_at
      or old.buyer_terms_accepted_deal_id is distinct from new.buyer_terms_accepted_deal_id
      or old.buyer_terms_acceptance_source is distinct from new.buyer_terms_acceptance_source
    ) then
      raise exception 'Verified buyer acceptance evidence is immutable';
    end if;

    if old.status in ('secured','pre_show','incident','completed') and (
      old.financial_security_type is distinct from new.financial_security_type
      or old.financial_security_status is distinct from new.financial_security_status
      or old.financial_security_reference is distinct from new.financial_security_reference
      or old.secured_at is distinct from new.secured_at
    ) then
      raise exception 'Secured booking financial evidence is immutable';
    end if;
  end if;

  if new.deal_id is not null then
    select * into d from public.deals where id = new.deal_id;
    if not found then raise exception 'Booking deal not found'; end if;
    if d.brief_id <> new.brief_id or d.talent_id <> new.talent_id then raise exception 'Booking and deal chain do not match'; end if;
    if new.buyer_price is distinct from d.buyer_price
       or new.talent_payable is distinct from d.talent_payable
       or new.direct_cost is distinct from coalesce(d.direct_costs, 0) then
      raise exception 'Booking commercial snapshot does not match the deal';
    end if;

    select * into br from public.briefs where id = new.brief_id;
    if not found or new.event_date is distinct from br.event_date then raise exception 'Booking event date does not match the brief'; end if;
  end if;

  if new.status in ('secured','pre_show','incident','completed') then
    if new.deal_id is null then raise exception 'Secured booking lifecycle requires a deal'; end if;
    if d.status <> 'locked' then raise exception 'Secured booking lifecycle requires a locked deal'; end if;
    if new.buyer_terms_accepted_at is null
       or new.buyer_terms_accepted_deal_id <> new.deal_id
       or new.buyer_terms_acceptance_source <> 'signed_buyer_link'
       or d.buyer_terms_status <> 'accepted' then
      raise exception 'Secured booking lifecycle requires verified buyer terms';
    end if;
    if d.talent_terms_status <> 'confirmed' then raise exception 'Secured booking lifecycle requires confirmed talent terms'; end if;
    if d.funding_gap_status <> 'safe' then raise exception 'Secured booking lifecycle requires a safe funding state'; end if;
    if cardinality(coalesce(d.unresolved_issues, '{}'::text[])) > 0 and d.exception_status <> 'approved' then
      raise exception 'Secured booking lifecycle has unresolved deal issues without an approved exception';
    end if;
    if new.financial_security_status <> 'satisfied' or new.financial_security_type is null or new.secured_at is null then
      raise exception 'Secured booking lifecycle requires financial security evidence';
    end if;
  end if;

  if tg_op = 'INSERT' and new.status in ('pre_show','incident','completed') then
    raise exception 'Booking must enter secured state before later lifecycle states';
  end if;
  if tg_op = 'UPDATE' and old.status = 'pending_security' and new.status in ('pre_show','incident','completed') then
    raise exception 'Booking must enter secured state before later lifecycle states';
  end if;

  v_entering_secured := new.status = 'secured' and (tg_op = 'INSERT' or old.status <> 'secured');
  if v_entering_secured then
    if br.status <> 'terms_agreed' then raise exception 'Brief must be terms_agreed before booking is secured'; end if;

    select * into o from public.talent_offers where id = d.talent_offer_id;
    if not found or o.brief_id <> new.brief_id or o.talent_id <> new.talent_id or o.status <> 'confirmed' or o.availability_status <> 'confirmed' then
      raise exception 'Talent offer requires reconfirmation before booking is secured';
    end if;
    if o.quote_valid_until is null or o.quote_valid_until <= now() then raise exception 'Talent offer is expired before booking is secured'; end if;

    select coalesce(sum(amount), 0) into v_paid
    from public.payments
    where booking_id = new.id
      and payment_type in ('buyer_deposit','buyer_balance','buyer_full_payment')
      and status = 'paid'
      and coalesce(trim(provider), '') <> ''
      and coalesce(trim(provider_reference), '') <> ''
      and coalesce(trim(evidence_key), '') <> '';

    if new.financial_security_type in ('approved_po_credit','authorized_exception') then
      if coalesce(trim(new.financial_security_reference), '') = '' then raise exception 'Manual financial security reference is required'; end if;
      if new.financial_security_type = 'authorized_exception' and d.exception_status <> 'approved' then raise exception 'Commercial exception is not approved'; end if;
    elsif new.financial_security_type = 'full_payment_received' then
      if new.buyer_price is null or new.buyer_price <= 0 or v_paid < new.buyer_price then raise exception 'Verified full buyer payment is insufficient'; end if;
    elsif new.financial_security_type = 'deposit_received' then
      select * into m from public.payment_milestones where booking_id = new.id and party = 'buyer' order by sequence_no asc limit 1;
      if not found then raise exception 'Buyer payment milestones are missing'; end if;
      if m.calculation_type = 'percentage' then v_required := round(new.buyer_price * (coalesce(m.percentage, 0) / 100.0));
      elsif m.calculation_type = 'fixed_amount' then v_required := coalesce(m.amount, 0);
      else v_required := new.buyer_price;
      end if;
      if v_required <= 0 or v_paid < v_required then raise exception 'Verified buyer payment is insufficient for booking security'; end if;
    else
      raise exception 'Unsupported financial security type for secured booking';
    end if;
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.ns_guard_financial_security_order_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.ns_guard_payment_milestone_snapshot_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  b public.bookings%rowtype;
  d public.deals%rowtype;
  v_expected jsonb;
  v_actual jsonb;
begin
  select * into b from public.bookings where id = new.booking_id;
  if not found or b.deal_id is null then return new; end if;

  if tg_op = 'UPDATE' then
    if old.booking_id is distinct from new.booking_id
       or old.party is distinct from new.party
       or old.milestone_type is distinct from new.milestone_type
       or old.sequence_no is distinct from new.sequence_no
       or old.calculation_type is distinct from new.calculation_type
       or old.percentage is distinct from new.percentage
       or old.amount is distinct from new.amount
       or old.due_basis is distinct from new.due_basis
       or old.due_offset_days is distinct from new.due_offset_days
       or old.custom_due_date is distinct from new.custom_due_date
       or old.refundable is distinct from new.refundable
       or old.cancellation_note is distinct from new.cancellation_note
       or old.notes is distinct from new.notes then
      raise exception 'Locked-deal payment milestone contract fields are immutable';
    end if;
    return new;
  end if;

  select * into d from public.deals where id = b.deal_id;
  if not found or d.status <> 'locked' then raise exception 'Payment milestone snapshot requires a locked deal'; end if;

  if new.party = 'buyer' then
    v_expected := d.buyer_payment_schedule -> (new.sequence_no - 1);
  else
    v_expected := d.talent_payment_schedule -> (new.sequence_no - 1);
  end if;
  if v_expected is null then raise exception 'Payment milestone is not present in the locked deal schedule'; end if;

  v_actual := jsonb_strip_nulls(jsonb_build_object(
    'milestone_type', new.milestone_type,
    'sequence_no', new.sequence_no,
    'calculation_type', new.calculation_type,
    'percentage', new.percentage,
    'amount', new.amount,
    'due_basis', new.due_basis,
    'due_offset_days', new.due_offset_days,
    'custom_due_date', new.custom_due_date,
    'refundable', new.refundable,
    'cancellation_note', new.cancellation_note,
    'notes', new.notes
  ));

  if jsonb_strip_nulls(v_expected) <> v_actual then
    raise exception 'Payment milestone does not match the locked deal schedule';
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.ns_protect_buyer_terms_snapshot_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if old.buyer_terms_accepted_at is not null then
    if new.buyer_terms_snapshot is distinct from old.buyer_terms_snapshot
       or new.buyer_terms_accepted_snapshot is distinct from old.buyer_terms_accepted_snapshot
       or new.buyer_terms_accepted_at is distinct from old.buyer_terms_accepted_at
       or new.buyer_terms_accepted_deal_id is distinct from old.buyer_terms_accepted_deal_id
       or new.buyer_terms_acceptance_source is distinct from old.buyer_terms_acceptance_source then
      raise exception 'Accepted buyer terms snapshot is immutable';
    end if;
  end if;
  return new;
end;
$function$;

create trigger trg_booking_integrity before insert or update on public.bookings for each row execute function public.ns_guard_booking_integrity_v1();
create trigger trg_payment_milestone_snapshot before insert or update on public.payment_milestones for each row execute function public.ns_guard_payment_milestone_snapshot_v1();
create trigger trg_financial_security_order before insert or update of financial_security_status, financial_security_type, financial_security_reference, buyer_terms_accepted_at, buyer_terms_accepted_deal_id, buyer_terms_acceptance_source on public.bookings for each row execute function public.ns_guard_financial_security_order_v1();
create trigger trg_protect_buyer_terms_snapshot_v1 before update on public.bookings for each row execute function public.ns_protect_buyer_terms_snapshot_v1();
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
