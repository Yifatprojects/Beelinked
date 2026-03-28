-- ═══════════════════════════════════════════════════════════════════
-- BeeLinked — Supabase Schema
-- Run this in the Supabase SQL Editor.
-- ═══════════════════════════════════════════════════════════════════

-- ─── yards ──────────────────────────────────────────────────────────
create table if not exists public.yards (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  lat          double precision not null,
  lng          double precision not null,

  -- 'attention' triggers the red marker; any other value (or null) is normal
  status       text check (status in ('active', 'attention', 'inactive')) default 'active',

  hive_count   integer not null default 0,  -- shown as the number badge on the map icon

  last_seen_at timestamptz,   -- updated every time a marker is clicked
  notes        text,
  location     text,          -- optional human-readable address / area label

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ─── actions ────────────────────────────────────────────────────────
-- Each yard can have many actions. The action_date drives marker colour.
create table if not exists public.actions (
  id          uuid primary key default gen_random_uuid(),
  yard_id     uuid not null references public.yards (id) on delete cascade,
  title       text not null,
  action_date timestamptz,     -- null = undated; future = green; past & unseen = yellow+green
  action_type text,            -- e.g. 'inspection', 'treatment', 'harvest'
  notes       text,
  created_at  timestamptz not null default now()
);

-- ─── Indexes ────────────────────────────────────────────────────────
create index if not exists actions_yard_id_idx     on public.actions (yard_id);
create index if not exists actions_action_date_idx on public.actions (action_date);
create index if not exists yards_status_idx        on public.yards (status) where status = 'attention';

-- ─── Row Level Security ─────────────────────────────────────────────
alter table public.yards   enable row level security;
alter table public.actions enable row level security;

-- Allow anonymous read (field tablets, public dashboards)
create policy "yards: anon read"
  on public.yards for select using (true);

create policy "actions: anon read"
  on public.actions for select using (true);

-- Allow anonymous update of yards (for last_seen_at)
create policy "yards: anon update"
  on public.yards for update using (true) with check (true);

-- Allow insert for admin tooling / seeding
create policy "yards: anon insert"
  on public.yards for insert with check (true);

create policy "actions: anon insert"
  on public.actions for insert with check (true);


-- ═══════════════════════════════════════════════════════════════════
-- Sample data — delete before going to production
-- ═══════════════════════════════════════════════════════════════════

insert into public.yards (name, lat, lng, status, hive_count, notes, location) values
  ('North Field A',   31.5234, 34.8765, 'active',    24, 'Rocky terrain, strong colony', 'Northern area'),
  ('South Meadow',    31.4812, 34.8421, 'attention', 16, 'Varroa mite spotted',          'Southern meadow'),
  ('Citrus Grove',    31.5100, 34.9012, 'active',    8,  'Citrus bloom season',           'East grove'),
  ('Mountain Pass',   31.5500, 34.8200, 'active',    18, 'Good access road',              'Highland route')
on conflict do nothing;

-- Seed actions
do $$
declare
  a uuid; b uuid; c uuid; d uuid;
begin
  select id into a from public.yards where name = 'North Field A'  limit 1;
  select id into b from public.yards where name = 'South Meadow'   limit 1;
  select id into c from public.yards where name = 'Citrus Grove'   limit 1;
  select id into d from public.yards where name = 'Mountain Pass'  limit 1;

  if a is not null then
    -- Future action → green marker
    insert into public.actions (yard_id, title, action_date, action_type, notes) values
      (a, 'Spring inspection', now() + interval '5 days', 'inspection', 'Check brood pattern and queen');
  end if;

  if b is not null then
    -- Past action, yard never seen → yellow+green outline
    insert into public.actions (yard_id, title, action_date, action_type, notes) values
      (b, 'Varroa treatment', now() - interval '2 days', 'treatment', 'Apply oxalic acid');
  end if;

  if c is not null then
    -- Past action already seen → solid yellow (we pretend last_seen_at is recent)
    insert into public.actions (yard_id, title, action_date, action_type) values
      (c, 'Honey harvest', now() - interval '10 days', 'harvest');
    update public.yards set last_seen_at = now() - interval '5 days' where id = c;
  end if;

  -- d (Mountain Pass) has no actions → solid yellow (default)
end;
$$;
