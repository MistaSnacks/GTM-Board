-- GTM Board: send a Today item to an agent runner (optional extension to the items contract, v1).
-- A runner is one agent install on one machine, for example the Hermes on a Mac. Its dispatcher
-- writes its row on each tick, so the board knows which runner serves a project and that it is up.

create table gtm_runners (
  name text primary key,                    -- 'hermes-mac'
  label text not null,                      -- the name a person sees: 'Hermes'
  projects text[] not null default '{}',    -- gtm_projects slugs this runner serves
  last_seen_at timestamptz not null default now()
);

-- Both apps use the service role, which bypasses RLS. With no policy, the anon key reads nothing.
alter table gtm_runners enable row level security;

-- queued:   a person sent the item, and the runner did not take it yet
-- running:  the runner gave the item to its agent, and delegation_ref holds the handle
-- done:     the agent reported the task complete, and the item is closed
-- returned: the agent gave the item back, and delegation_note says what a person must do
-- failed:   the agent or the runner could not do it, and delegation_note says why
alter table gtm_items
  add column delegated_to text,             -- gtm_runners.name
  add column delegation_state text check (delegation_state in ('queued','running','done','returned','failed')),
  add column delegation_ref text,           -- the runner's handle, for example a Hermes cron job id
  add column delegation_note text,
  add column delegated_at timestamptz,
  add constraint gtm_items_delegation_pair check ((delegated_to is null) = (delegation_state is null));

create index gtm_items_delegation_idx on gtm_items (delegated_to, delegation_state) where delegated_to is not null;
