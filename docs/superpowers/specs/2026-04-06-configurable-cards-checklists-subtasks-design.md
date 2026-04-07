# Configurable Cards: Interactive Checklists & Structured Subtasks

**Date:** 2026-04-06
**Status:** Draft — pending review
**Scope:** GTM Board dashboard (marketing board + agent tasks board)

## Goal

Make cards on both the marketing kanban board and the agent tasks board configurable in the same way: users (and agents) can break a card down into actionable items, check them off as they complete, and attach reference docs. Three complementary mechanisms:

1. **Inline checklist** — interactive `- [ ]` items rendered from the card's existing markdown body, toggleable in the detail modal.
2. **Structured subtasks** — a lightweight, queryable list of subtask records attached to a card, with title, status, and assignee.
3. **Reference docs** — a structured list of links (title + URL/path) attached to each card, so agents can programmatically pull in playbooks, briefs, or any markdown reference. Plus markdown links inside the card body are rendered as real clickable anchors.

Both boards (marketing, agent-tasks) get all three. The card detail modal becomes the single place to manage them.

## Non-goals

- Subtasks do not appear as their own cards on the board.
- Subtasks do not have priorities, due dates, or notes in v1 (intentionally minimal).
- No real-time multi-user sync; mutations revalidate via the existing server-action pattern.
- No bulk import/export of subtasks in v1.
- Reference docs are not fetched and rendered inline — clicking a reference opens the URL in a new tab. (Inline markdown rendering of linked files is deferred to a later iteration.)

## Architecture

### Database

New table `gtm_subtasks` added via Supabase migration. The table is shared between both boards because cards from both boards live in `gtm_cards`.

```sql
create table public.gtm_subtasks (
  id            uuid primary key default gen_random_uuid(),
  card_id       uuid not null references public.gtm_cards(id) on delete cascade,
  title         text not null,
  status        text not null default 'pending'
                check (status in ('pending', 'in_progress', 'done')),
  assignee      text,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index gtm_subtasks_card_id_idx on public.gtm_subtasks(card_id);
create index gtm_subtasks_card_sort_idx on public.gtm_subtasks(card_id, sort_order);
```

A trigger updates `updated_at` on row update (matching the existing pattern used elsewhere in the schema).

No schema changes to `gtm_cards` or `gtm_agent_task_details`. Inline checklist state lives inside the existing `body` markdown column — toggling a checkbox rewrites the markdown line in place. Reference docs are stored as a JSON array under a new `references` key in the existing `gtm_cards.metadata` jsonb column — no migration needed for that part. Each entry has the shape `{ id: string, title: string, url: string }` where `id` is a stable client-generated uuid so individual entries can be edited or deleted.

### Types (`dashboard/lib/types.ts`)

```ts
export type SubtaskStatus = "pending" | "in_progress" | "done";

export interface SubtaskData {
  id: string;
  card_id: string;
  title: string;
  status: SubtaskStatus;
  assignee: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface CardProgress {
  checklist: { done: number; total: number };
  subtasks:  { done: number; total: number };
}

export interface CardReference {
  id: string;     // client-generated uuid, stable across edits
  title: string;
  url: string;    // http(s) url, mailto, or repo-relative path
}
```

`CardData` and `AgentTaskData` both gain:
- an optional `progress?: CardProgress` field, populated by the data layer when loading boards so cards can render the badge without an extra round trip.
- an optional `references?: CardReference[]` field, read from `metadata.references`.

### Data layer (`dashboard/lib/data.ts`)

New functions:

| Function | Purpose |
|---|---|
| `getSubtasks(cardId)` | Fetch all subtasks for a card, ordered by `sort_order`. |
| `addSubtask(cardId, title, assignee?)` | Insert a new subtask at the end. |
| `updateSubtask(id, patch)` | Patch title, status, or assignee. |
| `deleteSubtask(id)` | Remove a subtask. |
| `reorderSubtasks(cardId, orderedIds[])` | Persist a new ordering after drag-reorder. |
| `toggleChecklistItem(cardId, lineIndex)` | Load card body, flip the `- [ ]`/`- [x]` on the given line, write back. |
| `getCardProgress(cardId)` | Compute checklist + subtask totals. Used during board load. |
| `addReference(cardId, ref)` | Append a reference to `metadata.references`. |
| `updateReference(cardId, refId, patch)` | Update title/url of a reference by id. |
| `deleteReference(cardId, refId)` | Remove a reference by id. |

`getBoard()` and `getAgentBoard()` are extended to populate `progress` for every card in a single batched query (count subtasks per card, parse checklist from each body) so the board view stays fast.

A small pure helper `parseChecklist(body: string)` lives in `dashboard/lib/checklist.ts` and is used both during board load (counting) and inside the modal (rendering). It returns `{ lineIndex, checked, text }[]` so the modal can render and toggle by line index.

### Server actions (`dashboard/app/actions.ts`)

New actions, each calling the corresponding data function and `revalidatePath("/", "layout")`:

- `addSubtaskAction`
- `updateSubtaskAction`
- `deleteSubtaskAction`
- `reorderSubtasksAction`
- `toggleChecklistItemAction`
- `addReferenceAction`
- `updateReferenceAction`
- `deleteReferenceAction`

### Components

**`components/kanban-card.tsx`** and **`components/agent-task-card.tsx`**
- Add a compact progress badge in the card footer when `progress` is non-zero.
- Format: `✓ 3/7` where the numerator is `checklist.done + subtasks.done` and the denominator is `checklist.total + subtasks.total`. If both totals are zero, the badge is hidden.

**`components/card-detail-modal.tsx`** (currently used by the marketing board only)
- Becomes the shared detail modal for both boards. The agent tasks client wires it up the same way the marketing client does.
- Accepts an optional `agentTask?: AgentTaskData` prop so the modal can render agent-specific metadata (assigned agent, priority, error, retries) when present.
- Single scrollable panel, sections in this order:
  1. Existing header (title, badges, dates, description, metrics)
  2. **Body** — markdown rendering, with checklist lines rendered as real `<input type="checkbox">` controls. Clicking calls `toggleChecklistItemAction` with the line index. Plain markdown links `[text](url)` in the body are rendered as real anchor tags (`target="_blank" rel="noopener noreferrer"` for external URLs).
  3. **Subtasks** — list of subtasks with: status select (pending/in_progress/done), title (inline editable), assignee (inline editable), drag handle for reordering, delete button. An "Add subtask" row at the bottom.
  4. **Reference docs** — list of references rendered as clickable rows (title links to URL, opens in new tab). Inline editable title/url, delete button, and an "Add reference" row at the bottom. URLs are validated as either an http(s) URL, mailto, or a repo-relative path beginning with `/`.
- Optimistic UI: subtask mutations and checklist toggles update local state immediately, then call the server action; on error, revert.

**`components/subtask-list.tsx`** (new)
- Self-contained component that owns the subtask list UI and optimistic state.
- Receives `cardId` and initial `subtasks` as props.
- Uses `@hello-pangea/dnd` (already in the project) for reordering.

**`components/reference-list.tsx`** (new)
- Self-contained component for the reference docs section with optimistic state.
- Receives `cardId` and initial `references` as props.
- Add / edit / delete only — no reordering in v1.

### Agent tasks board wiring (`app/agent-tasks/agent-tasks-client.tsx`)

The agent tasks client gains a card-click handler that opens the shared detail modal, mirroring the marketing kanban client. Currently agent task cards have no detail view — this adds one.

## Data flow

**Loading a board:**
1. Server component calls `getBoard()` / `getAgentBoard()`.
2. Data layer fetches cards, then issues one `gtm_subtasks` query grouped by `card_id` to get counts, and parses each card body for checklist counts.
3. Each `CardData` / `AgentTaskData` is returned with `progress` populated.
4. Cards render with the progress badge.

**Opening a card:**
1. User clicks a card → modal opens with the card data already in memory.
2. Modal calls `getSubtasks(cardId)` (or the parent passes them in via a server component) to load the full subtask list.
3. Body is parsed by `parseChecklist` for rendering interactive checkboxes.

**Toggling a checklist item:**
1. Modal optimistically flips the checkbox.
2. Calls `toggleChecklistItemAction(cardId, lineIndex)`.
3. Action loads body, rewrites the line, persists, revalidates.
4. Board badge updates on next render.

**Adding/editing a subtask:**
1. User interacts with subtask row → optimistic update.
2. Corresponding action is called → DB update → revalidate.

## Error handling

- All server actions return `{ ok: true } | { ok: false, error: string }`.
- The modal shows a small inline error toast on failure and reverts the optimistic update.
- `toggleChecklistItem` is idempotent at the line-index level: if the body has changed since load (line shifted), the action returns an error and the modal refetches the card body. The user is told to retry.
- `gen_random_uuid()` is assumed available (the existing schema already uses it).

## Testing

- **Unit:** `parseChecklist` — empty body, no checklists, mixed lines, indented checklists, malformed brackets.
- **Unit:** `toggleChecklistItem` — flips correct line, leaves others alone, no-ops on out-of-range index.
- **Unit:** reference URL validation — accepts http(s), mailto, repo-relative paths; rejects javascript: and other schemes.
- **Integration (data layer):** subtask CRUD round trip against a Supabase test instance; reorder persistence; cascade delete when parent card is deleted. Reference CRUD round trip via metadata patches.
- **Component:** `subtask-list` renders, adds, reorders, deletes optimistically; error path reverts.
- **Component:** `reference-list` renders, adds, edits, deletes optimistically; invalid URL is rejected with inline error.
- **Component:** `card-detail-modal` opens for both card types and renders agent task metadata when present. Markdown links in the body are clickable.
- **Manual smoke:** open a card on each board, add 3 subtasks, reorder, mark one done, toggle a markdown checklist item, add a reference doc, click it to open, close the modal, confirm the card badge reflects the new totals.

## Migration & rollout

1. Run the new SQL migration against the Supabase project.
2. Deploy the dashboard. Existing cards have zero subtasks and zero checklist items, so badges simply do not render — no visible regression.
3. No data backfill required.

## Files touched

**New:**
- `supabase/migrations/20260406_001_add_subtasks.sql`
- `dashboard/lib/checklist.ts`
- `dashboard/components/subtask-list.tsx`
- `dashboard/components/reference-list.tsx`

**Modified:**
- `dashboard/lib/types.ts` — add `SubtaskData`, `CardProgress`, `CardReference`, optional `progress` and `references` on card types
- `dashboard/lib/data.ts` — add subtask functions, checklist toggle, reference functions, progress + references population in `getBoard`/`getAgentBoard`
- `dashboard/app/actions.ts` — new server actions for subtasks, checklist, references
- `dashboard/components/kanban-card.tsx` — progress badge
- `dashboard/components/agent-task-card.tsx` — progress badge
- `dashboard/components/card-detail-modal.tsx` — interactive checklist, subtask section, references section, clickable markdown links, agent task metadata
- `dashboard/app/agent-tasks/agent-tasks-client.tsx` — wire up card click → detail modal
