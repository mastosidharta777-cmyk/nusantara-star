-- Nusantara Star — Google Calendar Sync V1
-- Apply to the Nusantara Star Supabase project after the existing talent availability schema.
-- Stores only encrypted OAuth refresh credentials + selected calendar metadata.
-- The app reads only calendar list + free/busy; it does not store event titles/descriptions.

create table if not exists public.talent_calendar_connections (
  id uuid primary key default gen_random_uuid(),
  talent_id uuid not null references public.talents(id) on delete cascade,
  provider text not null default 'google' check (provider = 'google'),
  calendar_id text not null,
  calendar_summary text null,
  calendar_timezone text null,
  refresh_token_encrypted text not null,
  scopes text[] not null default '{}',
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz null,
  last_sync_error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (talent_id, provider)
);

create index if not exists idx_talent_calendar_connections_talent
  on public.talent_calendar_connections(talent_id);

alter table public.talent_calendar_connections enable row level security;

-- OAuth refresh tokens must never be reachable from public browser roles.
revoke all on table public.talent_calendar_connections from public;
revoke all on table public.talent_calendar_connections from anon;
revoke all on table public.talent_calendar_connections from authenticated;
grant select, insert, update, delete on table public.talent_calendar_connections to service_role;

comment on table public.talent_calendar_connections is
  'Server-only calendar connection metadata. OAuth refresh tokens are encrypted by the application before storage.';
comment on column public.talent_calendar_connections.refresh_token_encrypted is
  'AES-256-GCM encrypted Google OAuth refresh token. Never expose through browser APIs.';
