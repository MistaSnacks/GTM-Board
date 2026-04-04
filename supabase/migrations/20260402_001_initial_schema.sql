-- GTM Board — Supabase Schema
-- Replaces file-based storage with relational tables
-- Supports: multi-project, marketing board, agent tasks board, metrics, snapshots

-- ============================================================
-- 1. PROJECTS
-- ============================================================
create table gtm_projects (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,            -- e.g. "tailor", "groomlocal"
  name        text not null,                   -- display name
  url         text,                            -- project website
  description text,
  config      jsonb not null default '{}',     -- connectors, cadence, targets, research, creative, reference_docs, geo, alerts, ugc, briefs
  credentials jsonb not null default '{}',     -- encrypted at rest by Supabase; holds API keys per project
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ============================================================
-- 2. CARDS (marketing board + agent tasks board)
-- ============================================================
create table gtm_cards (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references gtm_projects(id) on delete cascade,
  slug        text not null,                   -- human-readable ID (e.g. "linkedin-mon-educational-a1b2")
  board       text not null default 'marketing' check (board in ('marketing', 'agent-tasks')),
  title       text not null,
  column_name text not null,                   -- "backlog", "preparing", "live", etc.
  type        text,                            -- "ad", "post", "outreach", "seo", "initiative", "ugc", "task"
  channel     text,                            -- "meta", "google", "reddit", "linkedin", etc.
  metadata    jsonb not null default '{}',     -- metrics, tags, target_date, paper_artboard, source, notes, etc.
  body        text not null default '',        -- markdown content
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  unique (project_id, slug)
);

create index idx_cards_project_board on gtm_cards(project_id, board);
create index idx_cards_project_column on gtm_cards(project_id, board, column_name);

-- ============================================================
-- 3. AGENT TASKS (extended fields for autonomous agent work)
-- ============================================================
-- Uses gtm_cards with board='agent-tasks', plus this extension table
create table gtm_agent_task_details (
  card_id         uuid primary key references gtm_cards(id) on delete cascade,
  assigned_agent  text,                        -- which agent owns this task
  priority        text default 'medium' check (priority in ('critical', 'high', 'medium', 'low')),
  depends_on      uuid[],                      -- array of card IDs this task depends on
  output          jsonb,                       -- structured output/result from the agent
  error           text,                        -- error message if task failed
  started_at      timestamptz,
  completed_at    timestamptz,
  retries         int not null default 0
);

-- ============================================================
-- 4. METRICS (channel-level, latest state)
-- ============================================================
create table gtm_metrics (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references gtm_projects(id) on delete cascade,
  channel     text not null,                   -- "google_ads", "meta_ads", "stripe", etc.
  data        jsonb not null default '{}',     -- key-value metric pairs
  fetched_at  timestamptz not null default now(),

  unique (project_id, channel)
);

-- ============================================================
-- 5. SNAPSHOTS (daily point-in-time captures)
-- ============================================================
create table gtm_snapshots (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references gtm_projects(id) on delete cascade,
  snapshot_date  date not null,
  data           jsonb not null default '{}',  -- { channel: { metric: value } }
  created_at     timestamptz not null default now(),

  unique (project_id, snapshot_date)
);

-- ============================================================
-- 6. CADENCE LOGS (post & comment tracking)
-- ============================================================
create table gtm_cadence_logs (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references gtm_projects(id) on delete cascade,
  platform    text not null,                   -- "linkedin", "reddit"
  log_type    text not null check (log_type in ('post', 'comment')),
  week_start  date not null,                   -- Monday of the week
  count       int not null default 0,
  details     jsonb not null default '{}',     -- { entries: [{url, title, date}] }
  created_at  timestamptz not null default now(),

  unique (project_id, platform, log_type, week_start)
);

-- ============================================================
-- 7. RESEARCH RUNS
-- ============================================================
create table gtm_research_runs (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references gtm_projects(id) on delete cascade,
  run_type    text not null,                   -- "full", "competitor", "opportunity"
  findings    jsonb not null default '{}',
  cards_created uuid[],                        -- card IDs generated from this run
  created_at  timestamptz not null default now()
);

-- ============================================================
-- 8. AUTO-UPDATE timestamps
-- ============================================================
create or replace function gtm_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_projects_updated_at
  before update on gtm_projects
  for each row execute function gtm_set_updated_at();

create trigger trg_cards_updated_at
  before update on gtm_cards
  for each row execute function gtm_set_updated_at();

-- ============================================================
-- 9. VIEWS (convenience)
-- ============================================================

-- Marketing board view
create view gtm_marketing_board as
select
  c.id,
  c.slug,
  c.title,
  c.column_name,
  c.type,
  c.channel,
  c.metadata,
  c.body,
  c.created_at,
  c.updated_at,
  p.slug as project_slug,
  p.name as project_name
from gtm_cards c
join gtm_projects p on p.id = c.project_id
where c.board = 'marketing';

-- Agent tasks board view
create view gtm_agent_board as
select
  c.id,
  c.slug,
  c.title,
  c.column_name,
  c.type,
  c.metadata,
  c.body,
  c.created_at,
  c.updated_at,
  d.assigned_agent,
  d.priority,
  d.depends_on,
  d.output,
  d.error,
  d.started_at,
  d.completed_at,
  d.retries,
  p.slug as project_slug,
  p.name as project_name
from gtm_cards c
join gtm_projects p on p.id = c.project_id
left join gtm_agent_task_details d on d.card_id = c.id
where c.board = 'agent-tasks';

-- Latest metrics per channel
create view gtm_latest_metrics as
select
  m.id,
  m.channel,
  m.data,
  m.fetched_at,
  p.slug as project_slug
from gtm_metrics m
join gtm_projects p on p.id = m.project_id;
