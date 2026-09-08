-- Nusantara Star — Supply Foundation minimal
-- Additive/backward-compatible: existing rows remain Talent.
-- This intentionally does not rename/drop public.talents because many V1 FKs depend on it.

alter table public.talents
  add column if not exists supply_type text;

update public.talents
set supply_type = 'talent'
where supply_type is null;

alter table public.talents
  alter column supply_type set default 'talent',
  alter column supply_type set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.talents'::regclass
      and conname = 'talents_supply_type_check'
  ) then
    alter table public.talents
      add constraint talents_supply_type_check
      check (supply_type in ('talent','professional','production_partner'));
  end if;
end $$;

create index if not exists idx_talents_supply_type
  on public.talents(supply_type);

comment on column public.talents.supply_type is
  'Internal supply classification: talent, professional, or production_partner. Existing V1 matching remains talent-only.';
