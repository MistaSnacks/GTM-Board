# Configurable Cards: Checklists, Subtasks & References — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every kanban card on both the marketing board and agent tasks board configurable: interactive markdown checklists, structured subtasks (new DB table), and a reference docs list — all editable from a shared detail modal.

**Architecture:** A new `gtm_subtasks` table stores subtasks 1:N to `gtm_cards`. References live as a JSON array on `gtm_cards.metadata.references`. Inline checklists are toggled by parsing the existing `body` markdown column and rewriting individual lines by index. The existing `card-detail-modal.tsx` becomes the shared modal for both boards and gains three new sections: interactive checklist, subtask list, references list. Each card on the board grows a small `✓ done/total` progress badge.

**Tech Stack:** Next.js 15 (App Router) + React 19, TypeScript, Supabase (Postgres + JS client), `@hello-pangea/dnd` for drag-and-drop, `framer-motion` for the modal, Node's built-in `node --test` for unit testing pure helpers (no test framework dep needed).

---

## Conventions & Project Notes

- **Working dir for all commands:** `/Users/admin/gtm-board/dashboard` unless otherwise stated.
- **Type-checking:** `npm run typecheck` is the primary automated gate. Run after every code change before committing.
- **No existing test framework.** Pure-function helpers get `node --test` tests in `dashboard/test/*.test.mjs` (Node's built-in test runner — zero new deps). UI components are verified via `typecheck` + manual smoke at the end.
- **Imports:** Use `@/lib/*` and `@/components/*` aliases (already configured).
- **Server actions:** Marked with `"use server"` at the top of `app/actions.ts`. They `await` data-layer functions and call `revalidatePath("/", "layout")`.
- **Project slug for smoke tests:** `tailor` (the existing default project).
- **Commits:** Conventional commits (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`). Each task ends in one commit.

---

## File Structure

**New files:**
- `supabase/migrations/20260406_001_add_subtasks.sql` — new `gtm_subtasks` table + trigger
- `dashboard/lib/checklist.ts` — pure helpers: `parseChecklist`, `toggleChecklistLine`
- `dashboard/lib/references.ts` — pure helpers: `validateReferenceUrl`, `generateReferenceId`
- `dashboard/components/subtask-list.tsx` — subtask CRUD UI (uses `@hello-pangea/dnd` for reorder)
- `dashboard/components/reference-list.tsx` — reference docs CRUD UI
- `dashboard/test/checklist.test.mjs` — `node --test` tests for `parseChecklist` and `toggleChecklistLine`
- `dashboard/test/references.test.mjs` — `node --test` tests for URL validation

**Modified files:**
- `dashboard/lib/types.ts` — add `SubtaskData`, `SubtaskStatus`, `CardProgress`, `CardReference`; extend `CardData` and `AgentTaskData` with optional `progress` and `references`
- `dashboard/lib/data.ts` — add subtask CRUD, checklist toggle, reference CRUD, populate `progress`/`references` on `getBoard`/`getAgentBoard`
- `dashboard/app/actions.ts` — add server actions wrapping the new data functions
- `dashboard/components/card-detail-modal.tsx` — interactive checklist, agent task metadata, subtask + reference sections, clickable markdown links
- `dashboard/components/kanban-card.tsx` — progress badge
- `dashboard/components/agent-task-card.tsx` — progress badge
- `dashboard/app/agent-tasks/agent-tasks-client.tsx` — wire `onClick` → shared `CardDetailModal`

---

## Task 1: Database migration for subtasks

**Files:**
- Create: `supabase/migrations/20260406_001_add_subtasks.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260406_001_add_subtasks.sql`:

```sql
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
```

- [ ] **Step 2: Apply the migration to Supabase**

Run from repo root:

```bash
cd /Users/admin/gtm-board && supabase db push
```

Expected: migration applied successfully. If `supabase` CLI is not configured, fall back to running the SQL directly via the Supabase SQL Editor and confirm with the user.

- [ ] **Step 3: Verify the table exists**

```bash
cd /Users/admin/gtm-board && supabase db diff --schema public 2>&1 | head -20
```

Expected: no diff, or only the expected new table. Alternatively run `select count(*) from gtm_subtasks;` via the SQL editor and confirm it returns `0`.

- [ ] **Step 4: Commit**

```bash
cd /Users/admin/gtm-board && git add supabase/migrations/20260406_001_add_subtasks.sql && git commit -m "feat(db): add gtm_subtasks table for per-card subtask records"
```

---

## Task 2: Type definitions

**Files:**
- Modify: `dashboard/lib/types.ts`

- [ ] **Step 1: Add new types and extend existing card types**

Open `dashboard/lib/types.ts`. At the end of the file (after the `AgentBoardData` interface), append:

```ts
// --- Subtasks, Progress, References ---

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
  subtasks: { done: number; total: number };
}

export interface CardReference {
  id: string;     // client-generated uuid
  title: string;
  url: string;    // http(s), mailto, or repo-relative path beginning with "/"
}
```

Then extend `CardData` (lines 6–27): add these two fields just before the closing `}`:

```ts
  progress?: CardProgress;
  references?: CardReference[];
```

And extend `AgentTaskData` (lines 188–205): add the same two fields just before its closing `}`:

```ts
  progress?: CardProgress;
  references?: CardReference[];
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/admin/gtm-board/dashboard && npm run typecheck
```

Expected: PASS (zero errors). If errors mention missing references in other files, ignore for now — we'll fix as we touch them.

- [ ] **Step 3: Commit**

```bash
cd /Users/admin/gtm-board && git add dashboard/lib/types.ts && git commit -m "feat(types): add SubtaskData, CardProgress, CardReference"
```

---

## Task 3: Pure checklist helper + tests

**Files:**
- Create: `dashboard/lib/checklist.ts`
- Create: `dashboard/test/checklist.test.mjs`

- [ ] **Step 1: Write the failing tests first**

Create `dashboard/test/checklist.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { parseChecklist, toggleChecklistLine } from "../lib/checklist.ts";

test("parseChecklist returns empty for body without checklists", () => {
  assert.deepEqual(parseChecklist(""), []);
  assert.deepEqual(parseChecklist("just some prose\nmore prose"), []);
});

test("parseChecklist parses unchecked items", () => {
  const items = parseChecklist("- [ ] one\n- [ ] two");
  assert.equal(items.length, 2);
  assert.deepEqual(items[0], { lineIndex: 0, checked: false, text: "one" });
  assert.deepEqual(items[1], { lineIndex: 1, checked: false, text: "two" });
});

test("parseChecklist parses checked items (lower and upper x)", () => {
  const items = parseChecklist("- [x] done\n- [X] also done");
  assert.equal(items.length, 2);
  assert.equal(items[0].checked, true);
  assert.equal(items[1].checked, true);
});

test("parseChecklist preserves line indices through mixed content", () => {
  const body = "## Header\n\n- [ ] first\nplain line\n- [x] second";
  const items = parseChecklist(body);
  assert.equal(items.length, 2);
  assert.equal(items[0].lineIndex, 2);
  assert.equal(items[1].lineIndex, 4);
});

test("toggleChecklistLine flips an unchecked item to checked", () => {
  const body = "- [ ] task";
  assert.equal(toggleChecklistLine(body, 0), "- [x] task");
});

test("toggleChecklistLine flips a checked item to unchecked", () => {
  const body = "- [x] task";
  assert.equal(toggleChecklistLine(body, 0), "- [ ] task");
});

test("toggleChecklistLine leaves other lines untouched", () => {
  const body = "## Header\n- [ ] one\n- [ ] two";
  assert.equal(toggleChecklistLine(body, 1), "## Header\n- [x] one\n- [ ] two");
});

test("toggleChecklistLine throws on out-of-range index", () => {
  assert.throws(() => toggleChecklistLine("- [ ] one", 5), /out of range/);
});

test("toggleChecklistLine throws when target line is not a checklist", () => {
  assert.throws(() => toggleChecklistLine("plain text", 0), /not a checklist/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Node's built-in runner with TS loader. From the dashboard dir:

```bash
cd /Users/admin/gtm-board/dashboard && node --test --experimental-strip-types test/checklist.test.mjs 2>&1 | tail -20
```

Expected: FAIL — module `../lib/checklist.ts` does not exist.

(Note: Node 22+ supports `--experimental-strip-types` to import `.ts` files directly. The repo's `@types/node` is `^22.0.0`, so Node 22 is the assumed runtime.)

- [ ] **Step 3: Implement `dashboard/lib/checklist.ts`**

Create `dashboard/lib/checklist.ts`:

```ts
export interface ChecklistItem {
  lineIndex: number;
  checked: boolean;
  text: string;
}

const CHECKLIST_RE = /^\s*-\s\[( |x|X)\]\s(.*)$/;

export function parseChecklist(body: string): ChecklistItem[] {
  if (!body) return [];
  const lines = body.split("\n");
  const items: ChecklistItem[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(CHECKLIST_RE);
    if (m) {
      items.push({
        lineIndex: i,
        checked: m[1] !== " ",
        text: m[2],
      });
    }
  }
  return items;
}

export function toggleChecklistLine(body: string, lineIndex: number): string {
  const lines = body.split("\n");
  if (lineIndex < 0 || lineIndex >= lines.length) {
    throw new Error(`Line index ${lineIndex} out of range`);
  }
  const m = lines[lineIndex].match(CHECKLIST_RE);
  if (!m) {
    throw new Error(`Line ${lineIndex} is not a checklist item`);
  }
  const wasChecked = m[1] !== " ";
  const newBox = wasChecked ? "[ ]" : "[x]";
  lines[lineIndex] = lines[lineIndex].replace(/\[( |x|X)\]/, newBox);
  return lines.join("\n");
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/admin/gtm-board/dashboard && node --test --experimental-strip-types test/checklist.test.mjs 2>&1 | tail -20
```

Expected: all tests pass (`# pass 9`, `# fail 0`).

- [ ] **Step 5: Typecheck**

```bash
cd /Users/admin/gtm-board/dashboard && npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/admin/gtm-board && git add dashboard/lib/checklist.ts dashboard/test/checklist.test.mjs && git commit -m "feat(checklist): add parseChecklist and toggleChecklistLine helpers"
```

---

## Task 4: Pure references helper + tests

**Files:**
- Create: `dashboard/lib/references.ts`
- Create: `dashboard/test/references.test.mjs`

- [ ] **Step 1: Write the failing tests**

Create `dashboard/test/references.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { validateReferenceUrl, generateReferenceId } from "../lib/references.ts";

test("validateReferenceUrl accepts http and https URLs", () => {
  assert.equal(validateReferenceUrl("https://example.com"), true);
  assert.equal(validateReferenceUrl("http://example.com/path"), true);
});

test("validateReferenceUrl accepts mailto", () => {
  assert.equal(validateReferenceUrl("mailto:foo@bar.com"), true);
});

test("validateReferenceUrl accepts repo-relative paths", () => {
  assert.equal(validateReferenceUrl("/docs/playbook.md"), true);
  assert.equal(validateReferenceUrl("/README.md"), true);
});

test("validateReferenceUrl rejects javascript: URLs", () => {
  assert.equal(validateReferenceUrl("javascript:alert(1)"), false);
});

test("validateReferenceUrl rejects empty string", () => {
  assert.equal(validateReferenceUrl(""), false);
  assert.equal(validateReferenceUrl("   "), false);
});

test("validateReferenceUrl rejects bare strings without scheme or leading slash", () => {
  assert.equal(validateReferenceUrl("example.com"), false);
  assert.equal(validateReferenceUrl("docs/foo.md"), false);
});

test("generateReferenceId returns a non-empty string", () => {
  const id = generateReferenceId();
  assert.equal(typeof id, "string");
  assert.ok(id.length > 0);
});

test("generateReferenceId returns unique values", () => {
  const a = generateReferenceId();
  const b = generateReferenceId();
  assert.notEqual(a, b);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/admin/gtm-board/dashboard && node --test --experimental-strip-types test/references.test.mjs 2>&1 | tail -20
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `dashboard/lib/references.ts`**

Create `dashboard/lib/references.ts`:

```ts
export function validateReferenceUrl(url: string): boolean {
  if (!url || !url.trim()) return false;
  const trimmed = url.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return true;
  if (trimmed.startsWith("mailto:")) return true;
  if (trimmed.startsWith("/")) return true;
  return false;
}

export function generateReferenceId(): string {
  // crypto.randomUUID is available in Node 19+ and all modern browsers
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback (shouldn't be hit in target environments)
  return `ref-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/admin/gtm-board/dashboard && node --test --experimental-strip-types test/references.test.mjs 2>&1 | tail -20
```

Expected: all 8 tests pass.

- [ ] **Step 5: Typecheck**

```bash
cd /Users/admin/gtm-board/dashboard && npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/admin/gtm-board && git add dashboard/lib/references.ts dashboard/test/references.test.mjs && git commit -m "feat(references): add URL validation and id generation helpers"
```

---

## Task 5: Data layer — subtask CRUD

**Files:**
- Modify: `dashboard/lib/data.ts`

- [ ] **Step 1: Add subtask functions to `data.ts`**

Open `dashboard/lib/data.ts`. Add `SubtaskData` and `SubtaskStatus` to the type imports at the top:

```ts
import type {
  // ... existing imports unchanged ...
  AgentBoardData,
  SubtaskData,
  SubtaskStatus,
} from "./types";
```

Then append a new section to the bottom of the file:

```ts
// --- Subtasks ---

function rowToSubtask(row: Record<string, unknown>): SubtaskData {
  return {
    id: row.id as string,
    card_id: row.card_id as string,
    title: (row.title as string) ?? "",
    status: (row.status as SubtaskStatus) ?? "pending",
    assignee: (row.assignee as string | null) ?? null,
    sort_order: (row.sort_order as number) ?? 0,
    created_at: (row.created_at as string) ?? "",
    updated_at: (row.updated_at as string) ?? "",
  };
}

// Resolve a project slug + card slug to the card's UUID. Used by mutations
// where the client only knows the human-readable slug.
async function getCardUuid(project: string, cardSlug: string): Promise<string | null> {
  const projectId = await getProjectId(project);
  if (!projectId) return null;
  const { data } = await supabase
    .from("gtm_cards")
    .select("id")
    .eq("project_id", projectId)
    .eq("slug", cardSlug)
    .single();
  return data ? (data.id as string) : null;
}

export async function getSubtasks(cardUuid: string): Promise<SubtaskData[]> {
  const { data, error } = await supabase
    .from("gtm_subtasks")
    .select("*")
    .eq("card_id", cardUuid)
    .order("sort_order", { ascending: true });
  if (error || !data) return [];
  return data.map(rowToSubtask);
}

export async function getSubtasksByCardSlug(
  project: string,
  cardSlug: string
): Promise<SubtaskData[]> {
  const cardUuid = await getCardUuid(project, cardSlug);
  if (!cardUuid) return [];
  return getSubtasks(cardUuid);
}

export async function addSubtask(
  project: string,
  cardSlug: string,
  title: string,
  assignee?: string | null
): Promise<SubtaskData | null> {
  const cardUuid = await getCardUuid(project, cardSlug);
  if (!cardUuid) return null;

  // Append at the end: sort_order = current max + 1.
  const { data: existing } = await supabase
    .from("gtm_subtasks")
    .select("sort_order")
    .eq("card_id", cardUuid)
    .order("sort_order", { ascending: false })
    .limit(1);
  const nextOrder = existing && existing.length > 0 ? (existing[0].sort_order as number) + 1 : 0;

  const { data, error } = await supabase
    .from("gtm_subtasks")
    .insert({
      card_id: cardUuid,
      title,
      assignee: assignee ?? null,
      sort_order: nextOrder,
    })
    .select()
    .single();

  if (error || !data) return null;
  return rowToSubtask(data);
}

export async function updateSubtask(
  subtaskId: string,
  patch: Partial<Pick<SubtaskData, "title" | "status" | "assignee">>
): Promise<void> {
  const update: Record<string, unknown> = {};
  if (patch.title !== undefined) update.title = patch.title;
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.assignee !== undefined) update.assignee = patch.assignee;
  if (Object.keys(update).length === 0) return;
  await supabase.from("gtm_subtasks").update(update).eq("id", subtaskId);
}

export async function deleteSubtask(subtaskId: string): Promise<void> {
  await supabase.from("gtm_subtasks").delete().eq("id", subtaskId);
}

export async function reorderSubtasks(
  project: string,
  cardSlug: string,
  orderedIds: string[]
): Promise<void> {
  const cardUuid = await getCardUuid(project, cardSlug);
  if (!cardUuid) return;
  // Update each subtask's sort_order in sequence. Small N (<50 typical), so OK.
  for (let i = 0; i < orderedIds.length; i++) {
    await supabase
      .from("gtm_subtasks")
      .update({ sort_order: i })
      .eq("id", orderedIds[i])
      .eq("card_id", cardUuid);
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/admin/gtm-board/dashboard && npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
cd /Users/admin/gtm-board && git add dashboard/lib/data.ts && git commit -m "feat(data): add subtask CRUD functions"
```

---

## Task 6: Data layer — checklist toggle

**Files:**
- Modify: `dashboard/lib/data.ts`

- [ ] **Step 1: Add the import and function**

In `dashboard/lib/data.ts`, add this import near the top (right after the `getConfig` import):

```ts
import { toggleChecklistLine } from "./checklist";
```

Then append to the bottom of the file:

```ts
// --- Checklist toggle ---

export async function toggleChecklistItem(
  project: string,
  cardSlug: string,
  lineIndex: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  const projectId = await getProjectId(project);
  if (!projectId) return { ok: false, error: "Project not found" };

  const { data: row, error: fetchErr } = await supabase
    .from("gtm_cards")
    .select("id, body")
    .eq("project_id", projectId)
    .eq("slug", cardSlug)
    .single();

  if (fetchErr || !row) return { ok: false, error: "Card not found" };

  let newBody: string;
  try {
    newBody = toggleChecklistLine((row.body as string) || "", lineIndex);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const { error: updateErr } = await supabase
    .from("gtm_cards")
    .update({ body: newBody, updated_at: new Date().toISOString() })
    .eq("id", row.id as string);

  if (updateErr) return { ok: false, error: updateErr.message };
  return { ok: true };
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/admin/gtm-board/dashboard && npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
cd /Users/admin/gtm-board && git add dashboard/lib/data.ts && git commit -m "feat(data): add toggleChecklistItem for interactive markdown checklists"
```

---

## Task 7: Data layer — references CRUD

**Files:**
- Modify: `dashboard/lib/data.ts`

- [ ] **Step 1: Add the type import and helper**

In `dashboard/lib/data.ts` type imports, add `CardReference`:

```ts
import type {
  // ... existing ...
  SubtaskData,
  SubtaskStatus,
  CardReference,
} from "./types";
```

Then append to the bottom of the file:

```ts
// --- References (stored under metadata.references) ---

async function loadCardMetadata(
  project: string,
  cardSlug: string
): Promise<{ id: string; metadata: Record<string, unknown> } | null> {
  const projectId = await getProjectId(project);
  if (!projectId) return null;
  const { data } = await supabase
    .from("gtm_cards")
    .select("id, metadata")
    .eq("project_id", projectId)
    .eq("slug", cardSlug)
    .single();
  if (!data) return null;
  return {
    id: data.id as string,
    metadata: (data.metadata || {}) as Record<string, unknown>,
  };
}

async function saveCardReferences(cardId: string, refs: CardReference[], baseMeta: Record<string, unknown>): Promise<void> {
  const newMeta = { ...baseMeta, references: refs };
  await supabase
    .from("gtm_cards")
    .update({ metadata: newMeta, updated_at: new Date().toISOString() })
    .eq("id", cardId);
}

function readReferences(meta: Record<string, unknown>): CardReference[] {
  const raw = meta.references;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (r): r is CardReference =>
      typeof r === "object" &&
      r !== null &&
      typeof (r as CardReference).id === "string" &&
      typeof (r as CardReference).title === "string" &&
      typeof (r as CardReference).url === "string"
  );
}

export async function addReference(
  project: string,
  cardSlug: string,
  ref: CardReference
): Promise<void> {
  const card = await loadCardMetadata(project, cardSlug);
  if (!card) return;
  const refs = readReferences(card.metadata);
  refs.push(ref);
  await saveCardReferences(card.id, refs, card.metadata);
}

export async function updateReference(
  project: string,
  cardSlug: string,
  refId: string,
  patch: Partial<Pick<CardReference, "title" | "url">>
): Promise<void> {
  const card = await loadCardMetadata(project, cardSlug);
  if (!card) return;
  const refs = readReferences(card.metadata).map((r) =>
    r.id === refId ? { ...r, ...patch } : r
  );
  await saveCardReferences(card.id, refs, card.metadata);
}

export async function deleteReference(
  project: string,
  cardSlug: string,
  refId: string
): Promise<void> {
  const card = await loadCardMetadata(project, cardSlug);
  if (!card) return;
  const refs = readReferences(card.metadata).filter((r) => r.id !== refId);
  await saveCardReferences(card.id, refs, card.metadata);
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/admin/gtm-board/dashboard && npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
cd /Users/admin/gtm-board && git add dashboard/lib/data.ts && git commit -m "feat(data): add reference CRUD on card metadata"
```

---

## Task 8: Data layer — populate progress + references on board loads

**Files:**
- Modify: `dashboard/lib/data.ts`

- [ ] **Step 1: Add helpers and update `rowToCard` / `rowToAgentTask`**

In `dashboard/lib/data.ts`, add these imports near the top (next to the existing `toggleChecklistLine` import):

```ts
import { parseChecklist } from "./checklist";
```

Then add this helper function near `rowToCard`:

```ts
function computeChecklistProgress(body: string): { done: number; total: number } {
  const items = parseChecklist(body || "");
  const done = items.filter((i) => i.checked).length;
  return { done, total: items.length };
}
```

Update `rowToCard` (currently lines 45–68) to read references and pass through (do **not** populate `progress` here — we'll do it after subtasks are loaded). Replace the body of `rowToCard` with:

```ts
function rowToCard(row: Record<string, unknown>): CardData {
  const meta = (row.metadata || {}) as Record<string, unknown>;
  return {
    id: row.slug as string,
    title: (row.title as string) || "Untitled",
    type: (row.type as CardData["type"]) || "post",
    channel: (row.channel as CardData["channel"]) || "other",
    column: (row.column_name as Column) || "backlog",
    created: meta.created ? String(meta.created) : "",
    target_date: meta.target_date ? String(meta.target_date) : undefined,
    description: meta.description ? String(meta.description) : undefined,
    tags: meta.tags as string[] | undefined,
    source: meta.source as CardData["source"],
    metrics: meta.metrics as Record<string, number | null> | undefined,
    paper_artboard: meta.paper_artboard as string | null | undefined,
    body: (row.body as string) || "",
    creator: meta.creator ? String(meta.creator) : undefined,
    creator_handle: meta.creator_handle ? String(meta.creator_handle) : undefined,
    deliverable_type: meta.deliverable_type ? String(meta.deliverable_type) : undefined,
    approval_status: meta.approval_status as CardData["approval_status"],
    due_date: meta.due_date ? String(meta.due_date) : undefined,
    asset_url: meta.asset_url as string | null | undefined,
    references: readReferences(meta),
  };
}
```

(Note: `readReferences` was defined in Task 7. It's hoisted because it's a `function`, but to be safe place it above `rowToCard` if your editor flags it.)

Similarly, update `rowToAgentTask` to add `references` from `meta`. After the existing `tags: ...` line in `rowToAgentTask`, add (still inside the returned object):

```ts
    references: readReferences(meta),
```

- [ ] **Step 2: Update `getBoard` to populate `progress` for every card**

Replace the `getBoard` function body (currently lines 72–101) with this version that batches subtask counts in one query:

```ts
export async function getBoard(project: string): Promise<BoardData> {
  const projectId = await getProjectId(project);
  const columns: BoardData["columns"] = {
    backlog: [],
    preparing: [],
    live: [],
    measuring: [],
    done: [],
  };

  if (!projectId) return { columns };

  const { data, error } = await supabase
    .from("gtm_cards")
    .select("*")
    .eq("project_id", projectId)
    .eq("board", "marketing")
    .order("created_at", { ascending: false });

  if (error || !data) return { columns };

  // Batch-load subtask counts for every card on this board
  const cardIds = data.map((r) => r.id as string);
  const subtaskTotals = await loadSubtaskTotals(cardIds);

  for (const row of data) {
    const card = rowToCard(row);
    const cardUuid = row.id as string;
    card.progress = {
      checklist: computeChecklistProgress(card.body),
      subtasks: subtaskTotals.get(cardUuid) ?? { done: 0, total: 0 },
    };
    const col = (row.column_name as Column) || "backlog";
    if (COLUMNS.includes(col)) {
      columns[col].push(card);
    }
  }

  return { columns };
}
```

Add this helper above `getBoard`:

```ts
async function loadSubtaskTotals(
  cardIds: string[]
): Promise<Map<string, { done: number; total: number }>> {
  const totals = new Map<string, { done: number; total: number }>();
  if (cardIds.length === 0) return totals;
  const { data } = await supabase
    .from("gtm_subtasks")
    .select("card_id, status")
    .in("card_id", cardIds);
  if (!data) return totals;
  for (const row of data) {
    const id = row.card_id as string;
    const cur = totals.get(id) ?? { done: 0, total: 0 };
    cur.total += 1;
    if (row.status === "done") cur.done += 1;
    totals.set(id, cur);
  }
  return totals;
}
```

- [ ] **Step 3: Update `getAgentBoard` similarly**

Replace the `getAgentBoard` function body (currently lines 762–791) with:

```ts
export async function getAgentBoard(project: string): Promise<AgentBoardData> {
  const projectId = await getProjectId(project);
  const columns: AgentBoardData["columns"] = {
    queued: [],
    in_progress: [],
    blocked: [],
    review: [],
    done: [],
  };

  if (!projectId) return { columns };

  const { data, error } = await supabase
    .from("gtm_cards")
    .select("*, gtm_agent_task_details(*)")
    .eq("project_id", projectId)
    .eq("board", "agent-tasks")
    .order("created_at", { ascending: false });

  if (error || !data) return { columns };

  const cardIds = data.map((r) => r.id as string);
  const subtaskTotals = await loadSubtaskTotals(cardIds);

  for (const row of data) {
    const task = rowToAgentTask(row);
    task.progress = {
      checklist: computeChecklistProgress(task.body),
      subtasks: subtaskTotals.get(row.id as string) ?? { done: 0, total: 0 },
    };
    if (AGENT_COLUMNS.includes(task.column)) {
      columns[task.column].push(task);
    }
  }

  return { columns };
}
```

- [ ] **Step 4: Typecheck**

```bash
cd /Users/admin/gtm-board/dashboard && npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/admin/gtm-board && git add dashboard/lib/data.ts && git commit -m "feat(data): populate progress and references on board loads"
```

---

## Task 9: Server actions

**Files:**
- Modify: `dashboard/app/actions.ts`

- [ ] **Step 1: Add the new actions**

Replace the entire contents of `dashboard/app/actions.ts` with:

```ts
"use server";

import {
  moveCard,
  moveAgentTask,
  addSubtask,
  updateSubtask,
  deleteSubtask,
  reorderSubtasks,
  toggleChecklistItem,
  addReference,
  updateReference,
  deleteReference,
} from "@/lib/data";
import type {
  Column,
  AgentTaskColumn,
  SubtaskData,
  CardReference,
} from "@/lib/types";
import { generateReferenceId } from "@/lib/references";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

export async function moveCardAction(
  project: string,
  cardId: string,
  fromColumn: Column,
  toColumn: Column
): Promise<void> {
  moveCard(project, cardId, fromColumn, toColumn);
  revalidatePath("/", "layout");
}

export async function moveAgentTaskAction(
  project: string,
  taskSlug: string,
  fromColumn: AgentTaskColumn,
  toColumn: AgentTaskColumn
): Promise<void> {
  await moveAgentTask(project, taskSlug, fromColumn, toColumn);
  revalidatePath("/", "layout");
}

export async function switchProjectAction(project: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set("gtm-project", project, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
}

// --- Subtask actions ---

export async function addSubtaskAction(
  project: string,
  cardSlug: string,
  title: string,
  assignee?: string | null
): Promise<SubtaskData | null> {
  const result = await addSubtask(project, cardSlug, title, assignee);
  revalidatePath("/", "layout");
  return result;
}

export async function updateSubtaskAction(
  subtaskId: string,
  patch: Partial<Pick<SubtaskData, "title" | "status" | "assignee">>
): Promise<void> {
  await updateSubtask(subtaskId, patch);
  revalidatePath("/", "layout");
}

export async function deleteSubtaskAction(subtaskId: string): Promise<void> {
  await deleteSubtask(subtaskId);
  revalidatePath("/", "layout");
}

export async function reorderSubtasksAction(
  project: string,
  cardSlug: string,
  orderedIds: string[]
): Promise<void> {
  await reorderSubtasks(project, cardSlug, orderedIds);
  revalidatePath("/", "layout");
}

// --- Checklist action ---

export async function toggleChecklistItemAction(
  project: string,
  cardSlug: string,
  lineIndex: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await toggleChecklistItem(project, cardSlug, lineIndex);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

// --- Reference actions ---

export async function addReferenceAction(
  project: string,
  cardSlug: string,
  title: string,
  url: string
): Promise<CardReference> {
  const ref: CardReference = { id: generateReferenceId(), title, url };
  await addReference(project, cardSlug, ref);
  revalidatePath("/", "layout");
  return ref;
}

export async function updateReferenceAction(
  project: string,
  cardSlug: string,
  refId: string,
  patch: Partial<Pick<CardReference, "title" | "url">>
): Promise<void> {
  await updateReference(project, cardSlug, refId, patch);
  revalidatePath("/", "layout");
}

export async function deleteReferenceAction(
  project: string,
  cardSlug: string,
  refId: string
): Promise<void> {
  await deleteReference(project, cardSlug, refId);
  revalidatePath("/", "layout");
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/admin/gtm-board/dashboard && npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
cd /Users/admin/gtm-board && git add dashboard/app/actions.ts && git commit -m "feat(actions): add server actions for subtasks, checklist toggle, references"
```

---

## Task 10: Subtask list component

**Files:**
- Create: `dashboard/components/subtask-list.tsx`

- [ ] **Step 1: Create the component**

Create `dashboard/components/subtask-list.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
  type DroppableProvided,
  type DraggableProvided,
} from "@hello-pangea/dnd";
import {
  addSubtaskAction,
  updateSubtaskAction,
  deleteSubtaskAction,
  reorderSubtasksAction,
} from "@/app/actions";
import type { SubtaskData, SubtaskStatus } from "@/lib/types";

interface SubtaskListProps {
  project: string;
  cardSlug: string;
  initialSubtasks: SubtaskData[];
}

const STATUS_OPTIONS: { value: SubtaskStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In progress" },
  { value: "done", label: "Done" },
];

export default function SubtaskList({ project, cardSlug, initialSubtasks }: SubtaskListProps) {
  const [subtasks, setSubtasks] = useState<SubtaskData[]>(initialSubtasks);
  const [newTitle, setNewTitle] = useState("");
  const [, startTransition] = useTransition();

  const handleAdd = async () => {
    const title = newTitle.trim();
    if (!title) return;
    setNewTitle("");
    const created = await addSubtaskAction(project, cardSlug, title);
    if (created) setSubtasks((prev) => [...prev, created]);
  };

  const handleUpdate = (id: string, patch: Partial<Pick<SubtaskData, "title" | "status" | "assignee">>) => {
    setSubtasks((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    startTransition(() => {
      updateSubtaskAction(id, patch);
    });
  };

  const handleDelete = (id: string) => {
    setSubtasks((prev) => prev.filter((s) => s.id !== id));
    startTransition(() => {
      deleteSubtaskAction(id);
    });
  };

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const reordered = Array.from(subtasks);
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);
    setSubtasks(reordered);
    startTransition(() => {
      reorderSubtasksAction(project, cardSlug, reordered.map((s) => s.id));
    });
  };

  const labelStyle: React.CSSProperties = {
    fontFamily: "var(--font-mono)",
    fontSize: "11px",
    color: "var(--text-muted)",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    marginBottom: "8px",
  };

  return (
    <div style={{ marginTop: "16px" }}>
      <div style={labelStyle}>Subtasks</div>

      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="subtasks">
          {(dropProvided: DroppableProvided) => (
            <div ref={dropProvided.innerRef} {...dropProvided.droppableProps}>
              {subtasks.map((subtask, index) => (
                <Draggable draggableId={subtask.id} index={index} key={subtask.id}>
                  {(dragProvided: DraggableProvided) => (
                    <div
                      ref={dragProvided.innerRef}
                      {...dragProvided.draggableProps}
                      style={{
                        ...dragProvided.draggableProps.style,
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        padding: "6px 8px",
                        marginBottom: "4px",
                        background: "var(--bg-card-raised)",
                        borderRadius: "6px",
                      }}
                    >
                      <span
                        {...dragProvided.dragHandleProps}
                        style={{
                          cursor: "grab",
                          color: "var(--text-muted)",
                          fontSize: "12px",
                          userSelect: "none",
                        }}
                        aria-label="Drag to reorder"
                      >
                        ⋮⋮
                      </span>
                      <select
                        value={subtask.status}
                        onChange={(e) => handleUpdate(subtask.id, { status: e.target.value as SubtaskStatus })}
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: "11px",
                          background: "var(--bg-card)",
                          color: "var(--text-primary)",
                          border: "1px solid var(--border)",
                          borderRadius: "4px",
                          padding: "2px 4px",
                        }}
                      >
                        {STATUS_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={subtask.title}
                        onChange={(e) => setSubtasks((prev) => prev.map((s) => (s.id === subtask.id ? { ...s, title: e.target.value } : s)))}
                        onBlur={(e) => handleUpdate(subtask.id, { title: e.target.value })}
                        style={{
                          flex: 1,
                          background: "transparent",
                          border: "none",
                          outline: "none",
                          color: "var(--text-primary)",
                          fontFamily: "var(--font-inter)",
                          fontSize: "13px",
                          textDecoration: subtask.status === "done" ? "line-through" : "none",
                          opacity: subtask.status === "done" ? 0.6 : 1,
                        }}
                      />
                      <input
                        type="text"
                        value={subtask.assignee ?? ""}
                        placeholder="assignee"
                        onChange={(e) => setSubtasks((prev) => prev.map((s) => (s.id === subtask.id ? { ...s, assignee: e.target.value } : s)))}
                        onBlur={(e) => handleUpdate(subtask.id, { assignee: e.target.value || null })}
                        style={{
                          width: "90px",
                          background: "transparent",
                          border: "none",
                          outline: "none",
                          color: "var(--text-muted)",
                          fontFamily: "var(--font-mono)",
                          fontSize: "11px",
                        }}
                      />
                      <button
                        onClick={() => handleDelete(subtask.id)}
                        style={{
                          background: "none",
                          border: "none",
                          color: "var(--text-muted)",
                          cursor: "pointer",
                          fontSize: "14px",
                        }}
                        aria-label="Delete subtask"
                      >
                        ×
                      </button>
                    </div>
                  )}
                </Draggable>
              ))}
              {dropProvided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      {/* Add new subtask */}
      <div style={{ display: "flex", gap: "8px", marginTop: "6px" }}>
        <input
          type="text"
          value={newTitle}
          placeholder="Add a subtask..."
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
          style={{
            flex: 1,
            padding: "6px 8px",
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: "6px",
            color: "var(--text-primary)",
            fontFamily: "var(--font-inter)",
            fontSize: "13px",
          }}
        />
        <button
          onClick={handleAdd}
          style={{
            padding: "6px 12px",
            background: "var(--mint)",
            color: "var(--bg-card)",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
            fontFamily: "var(--font-mono)",
            fontSize: "11px",
            fontWeight: 600,
          }}
        >
          ADD
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/admin/gtm-board/dashboard && npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
cd /Users/admin/gtm-board && git add dashboard/components/subtask-list.tsx && git commit -m "feat(ui): add SubtaskList component with drag-reorder and inline editing"
```

---

## Task 11: Reference list component

**Files:**
- Create: `dashboard/components/reference-list.tsx`

- [ ] **Step 1: Create the component**

Create `dashboard/components/reference-list.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import {
  addReferenceAction,
  updateReferenceAction,
  deleteReferenceAction,
} from "@/app/actions";
import { validateReferenceUrl } from "@/lib/references";
import type { CardReference } from "@/lib/types";

interface ReferenceListProps {
  project: string;
  cardSlug: string;
  initialReferences: CardReference[];
}

export default function ReferenceList({ project, cardSlug, initialReferences }: ReferenceListProps) {
  const [refs, setRefs] = useState<CardReference[]>(initialReferences);
  const [newTitle, setNewTitle] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const handleAdd = async () => {
    setError(null);
    const title = newTitle.trim();
    const url = newUrl.trim();
    if (!title || !url) {
      setError("Title and URL are required");
      return;
    }
    if (!validateReferenceUrl(url)) {
      setError("URL must start with http(s)://, mailto:, or /");
      return;
    }
    const created = await addReferenceAction(project, cardSlug, title, url);
    setRefs((prev) => [...prev, created]);
    setNewTitle("");
    setNewUrl("");
  };

  const handleUpdate = (id: string, patch: Partial<Pick<CardReference, "title" | "url">>) => {
    setRefs((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    startTransition(() => {
      updateReferenceAction(project, cardSlug, id, patch);
    });
  };

  const handleDelete = (id: string) => {
    setRefs((prev) => prev.filter((r) => r.id !== id));
    startTransition(() => {
      deleteReferenceAction(project, cardSlug, id);
    });
  };

  const labelStyle: React.CSSProperties = {
    fontFamily: "var(--font-mono)",
    fontSize: "11px",
    color: "var(--text-muted)",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    marginBottom: "8px",
  };

  return (
    <div style={{ marginTop: "16px" }}>
      <div style={labelStyle}>Reference Docs</div>

      {refs.map((ref) => (
        <div
          key={ref.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "6px 8px",
            marginBottom: "4px",
            background: "var(--bg-card-raised)",
            borderRadius: "6px",
          }}
        >
          <input
            type="text"
            value={ref.title}
            onChange={(e) => setRefs((prev) => prev.map((r) => (r.id === ref.id ? { ...r, title: e.target.value } : r)))}
            onBlur={(e) => handleUpdate(ref.id, { title: e.target.value })}
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "var(--text-primary)",
              fontFamily: "var(--font-inter)",
              fontSize: "13px",
            }}
          />
          <a
            href={ref.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "10px",
              color: "var(--mint)",
              textDecoration: "underline",
              maxWidth: "180px",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
            title={ref.url}
          >
            {ref.url}
          </a>
          <button
            onClick={() => {
              const next = prompt("Update URL", ref.url);
              if (next && validateReferenceUrl(next)) {
                handleUpdate(ref.id, { url: next });
              } else if (next) {
                alert("Invalid URL");
              }
            }}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: "12px",
            }}
            aria-label="Edit URL"
          >
            ✎
          </button>
          <button
            onClick={() => handleDelete(ref.id)}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: "14px",
            }}
            aria-label="Delete reference"
          >
            ×
          </button>
        </div>
      ))}

      {/* Add new reference */}
      <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "6px" }}>
        <div style={{ display: "flex", gap: "8px" }}>
          <input
            type="text"
            value={newTitle}
            placeholder="Title (e.g., Brand voice doc)"
            onChange={(e) => setNewTitle(e.target.value)}
            style={{
              flex: 1,
              padding: "6px 8px",
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: "6px",
              color: "var(--text-primary)",
              fontFamily: "var(--font-inter)",
              fontSize: "13px",
            }}
          />
          <input
            type="text"
            value={newUrl}
            placeholder="https://… or /docs/file.md"
            onChange={(e) => setNewUrl(e.target.value)}
            style={{
              flex: 2,
              padding: "6px 8px",
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: "6px",
              color: "var(--text-primary)",
              fontFamily: "var(--font-mono)",
              fontSize: "11px",
            }}
          />
          <button
            onClick={handleAdd}
            style={{
              padding: "6px 12px",
              background: "var(--mint)",
              color: "var(--bg-card)",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontFamily: "var(--font-mono)",
              fontSize: "11px",
              fontWeight: 600,
            }}
          >
            ADD
          </button>
        </div>
        {error && (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "#ef4444" }}>
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/admin/gtm-board/dashboard && npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
cd /Users/admin/gtm-board && git add dashboard/components/reference-list.tsx && git commit -m "feat(ui): add ReferenceList component with URL validation"
```

---

## Task 12: Update card detail modal

**Files:**
- Modify: `dashboard/components/card-detail-modal.tsx`

- [ ] **Step 1: Add new imports**

At the top of `dashboard/components/card-detail-modal.tsx`, replace the existing imports with:

```tsx
"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { CardData, Channel, AgentTaskData, SubtaskData } from "@/lib/types";
import { toggleChecklistItemAction } from "@/app/actions";
import SubtaskList from "./subtask-list";
import ReferenceList from "./reference-list";
```

- [ ] **Step 2: Update the props interface**

Replace the existing `CardDetailModalProps` interface with:

```tsx
interface CardDetailModalProps {
  card: CardData | null;
  agentTask?: AgentTaskData | null;
  project: string;
  initialSubtasks?: SubtaskData[];
  onClose: () => void;
}
```

- [ ] **Step 3: Replace `renderMarkdownLine` with a version that supports interactive checkboxes and links**

Replace the entire `renderMarkdownLine` function with:

```tsx
// Render a single line of markdown. For checklist lines, the box is an
// interactive button that calls onToggle(lineIndex). Plain markdown links
// [text](url) within other lines are converted to anchor tags.
function renderInline(text: string): React.ReactNode {
  // Match [label](url) — non-greedy
  const re = /\[([^\]]+)\]\(([^)]+)\)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIndex) parts.push(text.slice(lastIndex, m.index));
    const url = m[2];
    const safe = /^(https?:|mailto:|\/)/.test(url);
    parts.push(
      safe ? (
        <a
          key={`lnk-${key++}`}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "var(--mint)", textDecoration: "underline" }}
        >
          {m[1]}
        </a>
      ) : (
        <span key={`lnk-${key++}`}>{m[1]}</span>
      )
    );
    lastIndex = re.lastIndex;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.length > 0 ? parts : text;
}

function renderMarkdownLine(
  line: string,
  index: number,
  onToggle: (lineIndex: number) => void
) {
  if (line.startsWith("## ")) {
    return (
      <h3
        key={index}
        style={{
          fontFamily: "var(--font-outfit)",
          fontSize: "15px",
          fontWeight: 600,
          color: "var(--text-primary)",
          marginTop: index > 0 ? "16px" : "0",
          marginBottom: "8px",
        }}
      >
        {renderInline(line.slice(3))}
      </h3>
    );
  }
  const checklistMatch = line.match(/^(\s*-\s)\[( |x|X)\]\s(.*)$/);
  if (checklistMatch) {
    const checked = checklistMatch[2] !== " ";
    const text = checklistMatch[3];
    return (
      <div key={index} style={{ display: "flex", alignItems: "flex-start", gap: "8px", marginBottom: "4px" }}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggle(index);
          }}
          aria-label={checked ? "Mark incomplete" : "Mark complete"}
          style={{
            width: "16px",
            height: "16px",
            border: "1.5px solid var(--text-muted)",
            borderRadius: "3px",
            background: checked ? "var(--mint)" : "transparent",
            color: "var(--bg-card)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "11px",
            lineHeight: 1,
            flexShrink: 0,
            marginTop: "2px",
            padding: 0,
          }}
        >
          {checked ? "✓" : ""}
        </button>
        <span
          style={{
            fontFamily: "var(--font-inter)",
            fontSize: "13px",
            color: checked ? "var(--text-muted)" : "var(--text-primary)",
            textDecoration: checked ? "line-through" : "none",
          }}
        >
          {renderInline(text)}
        </span>
      </div>
    );
  }
  if (line.startsWith("- ")) {
    return (
      <div key={index} style={{ display: "flex", alignItems: "flex-start", gap: "8px", marginBottom: "4px" }}>
        <span style={{ color: "var(--text-muted)", flexShrink: 0, lineHeight: "20px" }}>&bull;</span>
        <span style={{ fontFamily: "var(--font-inter)", fontSize: "13px", color: "var(--text-primary)", lineHeight: "20px" }}>
          {renderInline(line.slice(2))}
        </span>
      </div>
    );
  }
  if (line.trim() === "") {
    return <div key={index} style={{ height: "8px" }} />;
  }
  return (
    <p
      key={index}
      style={{
        fontFamily: "var(--font-inter)",
        fontSize: "13px",
        color: "var(--text-primary)",
        lineHeight: "20px",
        marginBottom: "4px",
      }}
    >
      {renderInline(line)}
    </p>
  );
}
```

- [ ] **Step 4: Update the component body**

Replace the function `CardDetailModal` (everything from `export default function CardDetailModal` through the closing brace at the end of the file) with:

```tsx
export default function CardDetailModal({
  card,
  agentTask,
  project,
  initialSubtasks,
  onClose,
}: CardDetailModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [body, setBody] = useState<string>(card?.body ?? "");
  const [, startTransition] = useTransition();

  useEffect(() => {
    setBody(card?.body ?? "");
  }, [card]);

  useEffect(() => {
    if (!card) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [card, onClose]);

  const handleToggleChecklist = (lineIndex: number) => {
    if (!card) return;
    // Optimistic flip
    const lines = body.split("\n");
    const m = lines[lineIndex]?.match(/^(\s*-\s)\[( |x|X)\]\s(.*)$/);
    if (!m) return;
    const wasChecked = m[2] !== " ";
    lines[lineIndex] = lines[lineIndex].replace(/\[( |x|X)\]/, wasChecked ? "[ ]" : "[x]");
    const next = lines.join("\n");
    setBody(next);
    startTransition(async () => {
      const result = await toggleChecklistItemAction(project, card.id, lineIndex);
      if (!result.ok) {
        // Revert on error
        setBody(body);
        console.error("Failed to toggle checklist:", result.error);
      }
    });
  };

  return (
    <AnimatePresence>
      {card && (
        <motion.div
          ref={overlayRef}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={(e) => {
            if (e.target === overlayRef.current) onClose();
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0, 0, 0, 0.6)",
            backdropFilter: "blur(4px)",
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="card"
            style={{
              width: "100%",
              maxWidth: "560px",
              maxHeight: "85vh",
              overflow: "auto",
              padding: "24px",
              borderLeft: `4px solid ${channelColorMap[card.channel]}`,
            }}
          >
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
              <h2
                style={{
                  fontFamily: "var(--font-outfit)",
                  fontSize: "18px",
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  lineHeight: 1.3,
                }}
              >
                {card.title}
              </h2>
              <button
                onClick={onClose}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  fontSize: "18px",
                  lineHeight: 1,
                  padding: "4px",
                  flexShrink: 0,
                }}
                aria-label="Close"
              >
                &#10005;
              </button>
            </div>

            {/* Tags row */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "12px" }}>
              <span
                style={{
                  textTransform: "uppercase",
                  fontSize: "10px",
                  fontFamily: "var(--font-mono)",
                  letterSpacing: "0.05em",
                  background: `color-mix(in srgb, ${channelColorMap[card.channel]} 15%, transparent)`,
                  color: channelColorMap[card.channel],
                  padding: "2px 8px",
                  borderRadius: "4px",
                  fontWeight: 600,
                }}
              >
                {card.channel}
              </span>
              <span
                style={{
                  textTransform: "uppercase",
                  fontSize: "10px",
                  fontFamily: "var(--font-mono)",
                  letterSpacing: "0.05em",
                  background: "var(--bg-card-raised)",
                  padding: "2px 8px",
                  borderRadius: "4px",
                  color: "var(--text-muted)",
                }}
              >
                {card.type}
              </span>
              <span
                style={{
                  textTransform: "uppercase",
                  fontSize: "10px",
                  fontFamily: "var(--font-mono)",
                  letterSpacing: "0.05em",
                  background: "var(--bg-card-raised)",
                  padding: "2px 8px",
                  borderRadius: "4px",
                  color: "var(--text-muted)",
                }}
              >
                {card.column}
              </span>
              {card.tags?.map((tag) => (
                <span
                  key={tag}
                  style={{
                    fontSize: "10px",
                    fontFamily: "var(--font-mono)",
                    letterSpacing: "0.05em",
                    background: "var(--bg-card-raised)",
                    padding: "2px 8px",
                    borderRadius: "4px",
                    color: "var(--text-muted)",
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>

            {/* Agent task metadata (only when present) */}
            {agentTask && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", marginTop: "12px", fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-muted)" }}>
                <span>Priority: <strong style={{ color: "var(--text-primary)" }}>{agentTask.priority}</strong></span>
                {agentTask.assigned_agent && <span>Agent: <strong style={{ color: "var(--text-primary)" }}>{agentTask.assigned_agent}</strong></span>}
                {agentTask.error && <span style={{ color: "#ef4444" }}>Error: {agentTask.error} (retries {agentTask.retries})</span>}
              </div>
            )}

            {/* Dates */}
            <div style={{ display: "flex", gap: "16px", marginTop: "12px" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-muted)" }}>
                Created {card.created}
              </div>
              {card.target_date && (
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--amber)" }}>
                  Target {card.target_date}
                </div>
              )}
            </div>

            {/* Description */}
            {card.description && (
              <div
                style={{
                  marginTop: "16px",
                  padding: "12px",
                  background: "var(--bg-card-raised)",
                  borderRadius: "8px",
                  fontFamily: "var(--font-inter)",
                  fontSize: "13px",
                  color: "var(--text-primary)",
                  lineHeight: "20px",
                }}
              >
                {card.description}
              </div>
            )}

            {/* Metrics */}
            {card.metrics && Object.keys(card.metrics).length > 0 && (
              <div style={{ marginTop: "16px" }}>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "11px",
                    color: "var(--text-muted)",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    marginBottom: "8px",
                  }}
                >
                  Metrics
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {Object.entries(card.metrics)
                    .filter((entry): entry is [string, number] => entry[1] !== null)
                    .map(([key, val]) => (
                      <div
                        key={key}
                        style={{
                          background: "var(--bg-card-raised)",
                          borderRadius: "6px",
                          padding: "6px 10px",
                          display: "flex",
                          flexDirection: "column",
                          gap: "2px",
                        }}
                      >
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase" }}>
                          {key}
                        </span>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "14px", fontWeight: 500, color: "var(--mint)" }}>
                          {formatMetricValue(val)}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Body content */}
            {body && body.trim() !== "" && (
              <div
                style={{
                  marginTop: "16px",
                  paddingTop: "16px",
                  borderTop: "1px solid var(--border)",
                }}
              >
                {body.split("\n").map((line, i) => renderMarkdownLine(line, i, handleToggleChecklist))}
              </div>
            )}

            {/* Subtasks */}
            <SubtaskList
              project={project}
              cardSlug={card.id}
              initialSubtasks={initialSubtasks ?? []}
            />

            {/* References */}
            <ReferenceList
              project={project}
              cardSlug={card.id}
              initialReferences={card.references ?? []}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 5: Typecheck**

```bash
cd /Users/admin/gtm-board/dashboard && npm run typecheck
```

Expected: PASS. If you see "Property 'project' is missing in type" errors elsewhere — that's expected; the next task fixes those callers.

- [ ] **Step 6: Commit**

```bash
cd /Users/admin/gtm-board && git add dashboard/components/card-detail-modal.tsx && git commit -m "feat(ui): redesign card detail modal with interactive checklists, subtasks, references"
```

---

## Task 13: Wire kanban (marketing) client to pass `project` prop

**Files:**
- Modify: `dashboard/app/kanban/kanban-client.tsx`

- [ ] **Step 1: Inspect the file to find the modal usage**

```bash
cd /Users/admin/gtm-board/dashboard && grep -n "CardDetailModal" app/kanban/kanban-client.tsx
```

Expected: one or two matches (an import line and a JSX usage).

- [ ] **Step 2: Update the JSX usage**

In `dashboard/app/kanban/kanban-client.tsx`, find the `<CardDetailModal ... />` element. Add a `project={project}` prop. (The component already receives `project` as a prop, so no other changes needed.) Example resulting line:

```tsx
<CardDetailModal card={selectedCard} project={project} onClose={() => setSelectedCard(null)} />
```

If the component uses `onClick` handlers but doesn't already destructure `project`, also confirm the props interface receives it. (It already does — see `KanbanClientProps`.)

- [ ] **Step 3: Typecheck**

```bash
cd /Users/admin/gtm-board/dashboard && npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd /Users/admin/gtm-board && git add dashboard/app/kanban/kanban-client.tsx && git commit -m "fix(kanban): pass project prop to updated CardDetailModal"
```

---

## Task 14: Wire agent tasks client to use the shared modal

**Files:**
- Modify: `dashboard/app/agent-tasks/agent-tasks-client.tsx`

- [ ] **Step 1: Add modal state and click handler**

In `dashboard/app/agent-tasks/agent-tasks-client.tsx`:

1. Add these imports at the top (alongside the existing imports):

```tsx
import CardDetailModal from "@/components/card-detail-modal";
import type { CardData } from "@/lib/types";
```

2. Inside the `AgentTasksClient` component (after the existing `useState`/`useEffect` block, before `handleDragEnd`), add:

```tsx
const [selectedTask, setSelectedTask] = useState<AgentTaskData | null>(null);

// Convert an AgentTaskData to a minimal CardData shape so it can render
// in the shared modal. The agent-task-specific metadata is passed via the
// `agentTask` prop.
const selectedAsCard: CardData | null = selectedTask
  ? {
      id: selectedTask.id,
      title: selectedTask.title,
      type: "initiative",
      channel: "other",
      column: "backlog",
      created: selectedTask.created_at,
      description: undefined,
      tags: selectedTask.tags,
      body: selectedTask.body,
      references: selectedTask.references,
      progress: selectedTask.progress,
    }
  : null;
```

3. In the JSX where `<AgentTaskCard task={task} />` is rendered (currently around line 190), add an `onClick` prop:

```tsx
<AgentTaskCard task={task} onClick={() => setSelectedTask(task)} />
```

4. At the very end of the returned JSX (after the closing `</DragDropContext>` and before the closing `</div>` of the outer wrapper), add:

```tsx
<CardDetailModal
  card={selectedAsCard}
  agentTask={selectedTask}
  project={project}
  onClose={() => setSelectedTask(null)}
/>
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/admin/gtm-board/dashboard && npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
cd /Users/admin/gtm-board && git add dashboard/app/agent-tasks/agent-tasks-client.tsx && git commit -m "feat(agent-tasks): open shared CardDetailModal on task click"
```

---

## Task 15: Add progress badge to kanban card

**Files:**
- Modify: `dashboard/components/kanban-card.tsx`

- [ ] **Step 1: Add badge rendering**

In `dashboard/components/kanban-card.tsx`, find the existing "Meta row" `<div>` (currently around line 119). After the existing `{card.target_date && (...)}` block but before the `{hasDetails && (...)}` block, add:

```tsx
{card.progress && (card.progress.checklist.total + card.progress.subtasks.total) > 0 && (
  <span
    style={{
      fontFamily: "var(--font-mono)",
      fontSize: "10px",
      color: "var(--mint)",
      background: "color-mix(in srgb, var(--mint) 12%, transparent)",
      padding: "1px 6px",
      borderRadius: "4px",
    }}
    title="Checklist + subtasks"
  >
    ✓ {card.progress.checklist.done + card.progress.subtasks.done}/
    {card.progress.checklist.total + card.progress.subtasks.total}
  </span>
)}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/admin/gtm-board/dashboard && npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
cd /Users/admin/gtm-board && git add dashboard/components/kanban-card.tsx && git commit -m "feat(kanban-card): show checklist + subtask progress badge"
```

---

## Task 16: Add progress badge to agent task card

**Files:**
- Modify: `dashboard/components/agent-task-card.tsx`

- [ ] **Step 1: Add badge rendering**

In `dashboard/components/agent-task-card.tsx`, in the "Badges row" `<div>` (currently around line 47), after the error indicator block (the `{task.error && (...)}` block, around line 91–105), add:

```tsx
{task.progress && (task.progress.checklist.total + task.progress.subtasks.total) > 0 && (
  <span
    style={{
      fontSize: "10px",
      fontFamily: "var(--font-mono)",
      letterSpacing: "0.05em",
      background: "color-mix(in srgb, var(--mint) 12%, transparent)",
      color: "var(--mint)",
      padding: "1px 6px",
      borderRadius: "4px",
    }}
    title="Checklist + subtasks"
  >
    ✓ {task.progress.checklist.done + task.progress.subtasks.done}/
    {task.progress.checklist.total + task.progress.subtasks.total}
  </span>
)}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/admin/gtm-board/dashboard && npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
cd /Users/admin/gtm-board && git add dashboard/components/agent-task-card.tsx && git commit -m "feat(agent-task-card): show checklist + subtask progress badge"
```

---

## Task 17: Initial subtasks for the modal — fetch on demand

**Files:**
- Modify: `dashboard/components/card-detail-modal.tsx`

The modal currently expects `initialSubtasks` to be passed in. Since we don't want to load every card's subtasks on every board render, the modal should fetch them lazily when it opens. But the modal is a client component and can't call data-layer functions directly — it needs a server action.

- [ ] **Step 1: Add a `getSubtasksAction` server action**

Open `dashboard/app/actions.ts`. Add to the imports from `@/lib/data`:

```ts
  getSubtasksByCardSlug,
```

Then add at the bottom of the file (before any other helpers):

```ts
export async function getSubtasksAction(
  project: string,
  cardSlug: string
): Promise<SubtaskData[]> {
  return getSubtasksByCardSlug(project, cardSlug);
}
```

- [ ] **Step 2: Use it from the modal**

In `dashboard/components/card-detail-modal.tsx`, add this import:

```tsx
import { getSubtasksAction } from "@/app/actions";
```

Then inside `CardDetailModal`, add this state alongside the existing `body` state:

```tsx
const [subtasks, setSubtasks] = useState<SubtaskData[]>(initialSubtasks ?? []);
```

Add this effect right after the existing `setBody` effect:

```tsx
useEffect(() => {
  if (!card) return;
  // Lazy-load subtasks when the modal opens for a new card.
  let cancelled = false;
  getSubtasksAction(project, card.id).then((data) => {
    if (!cancelled) setSubtasks(data);
  });
  return () => {
    cancelled = true;
  };
}, [card, project]);
```

Replace the `<SubtaskList ... initialSubtasks={initialSubtasks ?? []} />` JSX with:

```tsx
<SubtaskList
  project={project}
  cardSlug={card.id}
  initialSubtasks={subtasks}
  key={`subtasks-${card.id}-${subtasks.length}`}
/>
```

The `key` forces `SubtaskList` to remount when subtasks finish loading, so its internal state syncs with fetched data.

- [ ] **Step 3: Typecheck**

```bash
cd /Users/admin/gtm-board/dashboard && npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd /Users/admin/gtm-board && git add dashboard/app/actions.ts dashboard/components/card-detail-modal.tsx && git commit -m "feat(modal): lazy-load subtasks on open via server action"
```

---

## Task 18: Build verification

**Files:** none

- [ ] **Step 1: Run the production build**

```bash
cd /Users/admin/gtm-board/dashboard && npm run build 2>&1 | tail -40
```

Expected: build succeeds. If TS errors appear, fix them in place and re-run.

- [ ] **Step 2: Run all helper tests once more**

```bash
cd /Users/admin/gtm-board/dashboard && node --test --experimental-strip-types test/checklist.test.mjs test/references.test.mjs 2>&1 | tail -10
```

Expected: all tests pass.

---

## Task 19: Manual smoke test

**Files:** none — exploratory verification

- [ ] **Step 1: Start the dev server**

```bash
cd /Users/admin/gtm-board/dashboard && npm run dev
```

Expected: server starts at http://localhost:8080. Leave it running in another terminal.

- [ ] **Step 2: Smoke the marketing kanban**

Open http://localhost:8080/kanban. Verify:
- Existing cards still render
- Click into a card → modal opens with title, tags, dates, description, metrics, body (existing behavior)
- New "Subtasks" section appears at the bottom of the modal — empty
- New "Reference Docs" section appears below subtasks — empty
- Type a subtask title in the input, click ADD → row appears
- Change the new subtask's status to "Done" → text gets a strikethrough
- Add another subtask, drag it to reorder → order persists after closing/reopening the modal
- Add a reference with title "Brand voice" and url "https://example.com" → row appears with clickable link
- Try adding an invalid url like "javascript:foo" → error message appears, nothing added
- Close modal, reopen the same card → all data is still there
- The card on the board now shows a `✓ x/y` badge reflecting the totals

- [ ] **Step 3: Smoke the agent tasks board**

Open http://localhost:8080/agent-tasks. Verify:
- Existing tasks still render
- Click a task card → the new shared modal opens
- Agent metadata (priority, agent, error if present) shows in the header strip
- Subtasks and references work the same as on the marketing board
- The progress badge appears on the task card after adding items

- [ ] **Step 4: Smoke checklist toggling**

Find or create a card whose body contains:

```
- [ ] thing one
- [x] thing done
- [ ] thing two
```

Open the card. Click the empty checkbox next to "thing one" → it fills in with a checkmark and the text gains a strikethrough. Reload the page → the toggle persisted. The badge total updated.

- [ ] **Step 5: Smoke markdown links in body**

Find or create a card whose body contains:

```
See the [brand doc](https://example.com) for tone.
```

Open the card. The link is clickable, blue/mint, and opens in a new tab.

- [ ] **Step 6: Stop the dev server**

`Ctrl+C` in the terminal running `npm run dev`.

---

## Task 20: Final verification & summary commit

- [ ] **Step 1: Run typecheck + build + tests one last time**

```bash
cd /Users/admin/gtm-board/dashboard && npm run typecheck && npm run build 2>&1 | tail -5 && node --test --experimental-strip-types test/*.test.mjs 2>&1 | tail -5
```

Expected: typecheck PASS, build succeeds, all tests pass.

- [ ] **Step 2: Confirm git is clean**

```bash
cd /Users/admin/gtm-board && git status
```

Expected: `nothing to commit, working tree clean` (every task already committed). If there are stragglers, address them before finishing.

- [ ] **Step 3: Show the commit log for the feature**

```bash
cd /Users/admin/gtm-board && git log --oneline -25
```

Expected: a clean series of `feat:` / `feat(scope):` commits covering all 19 prior tasks.
