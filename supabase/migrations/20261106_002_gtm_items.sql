-- GTM Board: Today items (contract: harness-specs/06-today-items-contract.md, v1)
-- One row for each thing that needs attention. Producers write through the
-- gtm_add_item and gtm_sync_items tools. The /today page reads this table.

create table gtm_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references gtm_projects(id) on delete set null, -- null = general
  kind text not null check (kind in (
    'seo_task','follow_up','repo_attention','pr_attention',
    'agent_needs_input','agent_failed','metric_alert','task')),
  title text not null,                    -- imperative, at most 90 characters
  why text,                               -- one sentence: the evidence in words
  evidence jsonb not null default '[]',   -- Evidence[]
  link text,                              -- where to act: PR, review.html, card, page
  source text not null,                   -- see "Sources"
  dedupe_key text not null unique,        -- see "Dedupe keys"
  priority smallint not null default 2 check (priority between 0 and 3),
  owner text not null default 'camren' check (owner in ('camren','agent')),
  status text not null default 'open' check (status in ('open','snoozed','done','dismissed')),
  snoozed_until timestamptz,
  due_at timestamptz,
  closed_reason text check (closed_reason in ('done','dismissed','resolved')),
  card_id uuid references gtm_cards(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  closed_at timestamptz
);

create index gtm_items_open_idx on gtm_items (status, priority, due_at);
create index gtm_items_source_idx on gtm_items (source, status);
create index gtm_items_project_idx on gtm_items (project_id, status);

create trigger trg_items_updated_at
  before update on gtm_items
  for each row execute function gtm_set_updated_at();

-- Both apps use the service role, which bypasses RLS. With no policy, the anon key reads nothing.
alter table gtm_items enable row level security;
