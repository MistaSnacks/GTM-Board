import {
  parseItemInput,
  type Item,
  type ItemInput,
  type ItemKind,
  type ItemOwner,
  type ItemStatus,
  type Priority,
} from "./types.ts";

export interface ItemFilter {
  ids?: string[];
  dedupe_keys?: string[];
  source?: string;
  project_id?: string;
  kind?: ItemKind;
  owner?: ItemOwner;
  statuses?: ItemStatus[];
}

export type NewItem = Pick<
  Item,
  | "project_id"
  | "kind"
  | "title"
  | "why"
  | "evidence"
  | "link"
  | "source"
  | "dedupe_key"
  | "priority"
  | "owner"
  | "due_at"
  | "last_seen_at"
>;

export type ItemPatch = Partial<
  Pick<
    Item,
    | "title"
    | "why"
    | "evidence"
    | "link"
    | "priority"
    | "owner"
    | "due_at"
    | "last_seen_at"
    | "status"
    | "snoozed_until"
    | "closed_reason"
    | "closed_at"
  >
>;

/** All storage access. The Supabase adapter and the test fake implement this. */
export interface ItemsDb {
  select(filter: ItemFilter): Promise<Item[]>;
  insert(row: NewItem): Promise<Item>;
  update(id: string, patch: ItemPatch): Promise<Item>;
}

/** The allowed status moves. Every status change in this file goes through `planMove`. */
export const TRANSITIONS: Record<ItemStatus, readonly ItemStatus[]> = {
  open: ["snoozed", "done", "dismissed"],
  snoozed: ["open", "done", "dismissed"],
  done: ["open"],
  dismissed: ["open"],
};

interface EntryContext {
  now: string;
  snoozed_until: string | null;
}

const ENTER: Record<ItemStatus, (ctx: EntryContext) => ItemPatch> = {
  open: () => ({ status: "open", snoozed_until: null, closed_reason: null, closed_at: null }),
  snoozed: ({ snoozed_until }) => ({ status: "snoozed", snoozed_until, closed_reason: null, closed_at: null }),
  done: ({ now }) => ({ status: "done", snoozed_until: null, closed_reason: "done", closed_at: now }),
  dismissed: ({ now }) => ({ status: "dismissed", snoozed_until: null, closed_reason: "dismissed", closed_at: now }),
};

/** A snoozed row whose snooze time has passed counts as open. */
export function effectiveStatus(item: Item, now: Date): ItemStatus {
  const expired =
    item.status === "snoozed" && item.snoozed_until !== null && Date.parse(item.snoozed_until) <= now.getTime();
  return expired ? "open" : item.status;
}

function assertSnoozeTime(snoozedUntil: string | null | undefined, now: Date): string {
  const until = snoozedUntil ? Date.parse(snoozedUntil) : NaN;
  if (Number.isNaN(until) || until <= now.getTime()) {
    throw new Error("snoozed_until must be an ISO time in the future");
  }
  return snoozedUntil as string;
}

function planMove(item: Item, to: ItemStatus, now: Date, snoozedUntil?: string | null): ItemPatch {
  const allowed = new Set([...TRANSITIONS[item.status], ...TRANSITIONS[effectiveStatus(item, now)]]);
  if (!allowed.has(to)) throw new Error(`Cannot move item ${item.id} from ${item.status} to ${to}`);
  if (to === "snoozed") assertSnoozeTime(snoozedUntil, now);
  else if (snoozedUntil != null) throw new Error("snoozed_until applies only when the status is snoozed");
  return ENTER[to]({ now: now.toISOString(), snoozed_until: snoozedUntil ?? null });
}

const CLOSED: ReadonlySet<ItemStatus> = new Set(["done", "dismissed"]);

const STORED_STATUSES: Record<ItemStatus, ItemStatus[]> = {
  open: ["open", "snoozed"],
  snoozed: ["snoozed"],
  done: ["done"],
  dismissed: ["dismissed"],
};

function compareDueAt(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return Date.parse(a) - Date.parse(b);
}

/** Priority, then due_at (nulls last), then created_at. */
export function compareItems(a: Item, b: Item): number {
  return (
    a.priority - b.priority ||
    compareDueAt(a.due_at, b.due_at) ||
    Date.parse(a.created_at) - Date.parse(b.created_at)
  );
}

export interface AddResult {
  id: string;
  created: boolean;
  /** The row was done or dismissed, so nothing changed. */
  closed?: true;
  /** The row was closed and `reopen` brought it back. */
  reopened?: true;
}

export interface SyncInput {
  source: string;
  items: ItemInput[];
  complete: true;
}

export interface SyncResult {
  source: string;
  created: number;
  updated: number;
  reopened: number;
  skipped_closed: number;
  resolved: number;
}

export interface ListQuery {
  project?: string;
  kind?: ItemKind;
  status?: ItemStatus;
  owner?: ItemOwner;
  limit?: number;
}

export interface UpdatePatch {
  status?: ItemStatus;
  snoozed_until?: string | null;
  priority?: Priority;
  owner?: ItemOwner;
  due_at?: string | null;
}

export interface ItemStoreDeps {
  db: ItemsDb;
  /** Slug to gtm_projects id. Throws for an unknown slug. */
  resolveProject: (slug: string) => Promise<string>;
  now?: () => Date;
}

export type ItemStore = ReturnType<typeof createItemStore>;

type ProducerFields = Pick<NewItem, "title" | "why" | "evidence" | "link" | "priority" | "owner" | "due_at">;

/** The producer owns these fields. Every upsert of an open row rewrites them. */
function producerFields(input: ItemInput): ProducerFields {
  return {
    title: input.title,
    why: input.why ?? null,
    evidence: input.evidence ?? [],
    link: input.link ?? null,
    priority: input.priority ?? 2,
    owner: input.owner ?? "camren",
    due_at: input.due_at ?? null,
  };
}

export function createItemStore({ db, resolveProject, now: clock = () => new Date() }: ItemStoreDeps) {
  async function resolveProjectIds(inputs: ItemInput[]): Promise<Map<string, string>> {
    const slugs = [...new Set(inputs.flatMap((i) => (i.project ? [i.project] : [])))];
    const ids = await Promise.all(slugs.map((slug) => resolveProject(slug)));
    return new Map(slugs.map((slug, idx) => [slug, ids[idx]]));
  }

  async function upsert(
    input: ItemInput,
    existing: Item | undefined,
    projectIds: Map<string, string>,
    now: Date,
  ): Promise<{ result: AddResult; outcome: "created" | "updated" | "reopened" | "skipped_closed" }> {
    const seen = now.toISOString();
    if (!existing) {
      const row = await db.insert({
        ...producerFields(input),
        project_id: input.project ? (projectIds.get(input.project) ?? null) : null,
        kind: input.kind,
        source: input.source,
        dedupe_key: input.dedupe_key,
        last_seen_at: seen,
      });
      return { result: { id: row.id, created: true }, outcome: "created" };
    }
    if (!CLOSED.has(existing.status)) {
      const row = await db.update(existing.id, { ...producerFields(input), last_seen_at: seen });
      return { result: { id: row.id, created: false }, outcome: "updated" };
    }
    if (input.reopen && existing.closed_reason !== "dismissed") {
      const row = await db.update(existing.id, {
        ...producerFields(input),
        ...planMove(existing, "open", now),
        last_seen_at: seen,
      });
      return { result: { id: row.id, created: false, reopened: true }, outcome: "reopened" };
    }
    return { result: { id: existing.id, created: false, closed: true }, outcome: "skipped_closed" };
  }

  async function findExisting(keys: string[]): Promise<Map<string, Item>> {
    const rows = keys.length ? await db.select({ dedupe_keys: keys }) : [];
    return new Map(rows.map((row) => [row.dedupe_key, row]));
  }

  return {
    async addItem(raw: ItemInput): Promise<AddResult> {
      const input = parseItemInput(raw);
      const projectIds = await resolveProjectIds([input]);
      const existing = (await findExisting([input.dedupe_key])).get(input.dedupe_key);
      return (await upsert(input, existing, projectIds, clock())).result;
    },

    async syncItems(request: SyncInput): Promise<SyncResult> {
      if (request.complete !== true) {
        throw new Error("syncItems needs complete: true. A producer that failed to read its data must not call it.");
      }
      const inputs = request.items.map((raw, idx) => parseItemInput(raw, `items[${idx}].`));
      const foreign = inputs.filter((i) => i.source !== request.source).map((i) => i.dedupe_key);
      if (foreign.length) {
        throw new Error(`Every item must carry source "${request.source}". Wrong source on: ${foreign.join(", ")}`);
      }
      const byKey = new Map(inputs.map((i) => [i.dedupe_key, i]));
      const projectIds = await resolveProjectIds([...byKey.values()]);
      const now = clock();
      const existing = await findExisting([...byKey.keys()]);

      const summary: SyncResult = { source: request.source, created: 0, updated: 0, reopened: 0, skipped_closed: 0, resolved: 0 };
      for (const input of byKey.values()) {
        const { outcome } = await upsert(input, existing.get(input.dedupe_key), projectIds, now);
        summary[outcome] += 1;
      }

      const open = await db.select({ source: request.source, statuses: ["open", "snoozed"] });
      for (const row of open.filter((r) => !byKey.has(r.dedupe_key))) {
        await db.update(row.id, { ...planMove(row, "done", now), closed_reason: "resolved" });
        summary.resolved += 1;
      }
      return summary;
    },

    async listItems(query: ListQuery = {}): Promise<Item[]> {
      const status = query.status ?? "open";
      const project_id = query.project ? await resolveProject(query.project) : undefined;
      const rows = await db.select({
        project_id,
        kind: query.kind,
        owner: query.owner,
        statuses: STORED_STATUSES[status],
      });
      const now = clock();
      const listed = rows.filter((row) => effectiveStatus(row, now) === status).sort(compareItems);
      return query.limit ? listed.slice(0, query.limit) : listed;
    },

    async updateItem(id: string, patch: UpdatePatch): Promise<Item> {
      const [item] = await db.select({ ids: [id] });
      if (!item) throw new Error(`Item not found: ${id}`);
      const now = clock();

      let change: ItemPatch = {};
      if (patch.status !== undefined) {
        change = planMove(item, patch.status, now, patch.snoozed_until);
      } else if (patch.snoozed_until !== undefined) {
        if (item.status !== "snoozed") throw new Error("snoozed_until needs status snoozed");
        change = { snoozed_until: assertSnoozeTime(patch.snoozed_until, now) };
      }
      if (patch.priority !== undefined) change.priority = patch.priority;
      if (patch.owner !== undefined) change.owner = patch.owner;
      if (patch.due_at !== undefined) change.due_at = patch.due_at;
      if (Object.keys(change).length === 0) throw new Error("updateItem needs at least one field to change");

      return db.update(id, change);
    },
  };
}
