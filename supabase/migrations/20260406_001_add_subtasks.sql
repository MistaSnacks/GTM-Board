-- GTM Board — Subtasks
-- Per-card structured subtask records (used by both marketing and agent-tasks boards)

create table gtm_subtasks (
  id          uuid primary key default gen_random_uuid(),
  card_id     uuid not null references gtm_cards(id) on delete cascade,
  title       text not null,
  status      text not null default 'pending'
              check (status in ('pending', 'in_progress', 'done')),
  assignee    text,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index idx_subtasks_card_id on gtm_subtasks(card_id);
create index idx_subtasks_card_sort on gtm_subtasks(card_id, sort_order);

create trigger trg_subtasks_updated_at
  before update on gtm_subtasks
  for each row execute function gtm_set_updated_at();
