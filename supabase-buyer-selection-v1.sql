-- Nusantara Star: Buyer Selection V1

create table if not exists public.buyer_selections (
  id uuid primary key default gen_random_uuid(),
  brief_id uuid not null references public.briefs(id) on delete cascade,
  talent_id uuid not null references public.talents(id) on delete cascade,
  status text not null default 'selected'
    check (status in ('selected', 'withdrawn')),
  selected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brief_id)
);

create index if not exists idx_buyer_selections_talent_id
  on public.buyer_selections(talent_id);

alter table public.buyer_selections enable row level security;

alter table public.briefs
  drop constraint if exists briefs_status_check;

alter table public.briefs
  add constraint briefs_status_check
  check (status in (
    'new',
    'reviewing',
    'matching',
    'availability_check',
    'shortlisted',
    'proposal_sent',
    'buyer_selected',
    'booked',
    'closed',
    'cancelled'
  ));
