import { HUMAN_ONLY_NOTE, isHumanOnly, RECURRING_SOURCE, recurringTemplateId } from "./recurring.ts";
import { sendTarget } from "./runners.ts";
import {
  parseItemInput,
  parseUpdatePatch,
  type DelegationState,
  type Evidence,
  type Item,
  type ItemInput,
  type ItemKind,
  type ItemOwner,
  type ItemStatus,
  type Priority,
  type Runner,
  type UpdatePatch,
} from "./types.ts";

export type { UpdatePatch } from "./types.ts";

export interface ItemFilter {
  ids?: string[];
  dedupe_keys?: string[];
  source?: string;
  project_id?: string;
  kind?: ItemKind;
  owner?: ItemOwner;
  statuses?: ItemStatus[];
  delegated_to?: string;
  delegation_state?: DelegationState;
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
    | "delegated_to"
    | "delegation_state"
    | "delegation_ref"
    | "delegation_note"
    | "delegated_at"
  >
>;

/** All storage access. The Supabase adapter and the test fake implement this. */
export interface ItemsDb {
  select(filter: ItemFilter): Promise<Item[]>;
  insert(row: NewItem): Promise<Item>;
  update(id: string, patch: ItemPatch): Promise<Item>;
  selectRunners(): Promise<Runner[]>;
  upsertRunner(runner: Runner): Promise<void>;
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

type DelegationEnd = DelegationState | "none";

/** The allowed delegation moves. Every delegation change in this file goes through `planDelegation`. */
export const DELEGATION_TRANSITIONS: Record<DelegationEnd, readonly DelegationEnd[]> = {
  none: ["queued"],
  // queued to returned: the dispatcher gives back a row that no agent may take (see isHumanOnly).
  queued: ["running", "returned", "failed", "none"],
  running: ["done", "returned", "failed", "none"],
  returned: ["queued", "none"],
  failed: ["queued", "none"],
  done: ["queued", "none"],
};

/** What each target state needs to enter it. */
interface DelegationEntry {
  none: Record<string, never>;
  queued: { runner: string; now: string };
  running: { ref: string };
  done: { note: string };
  returned: { note: string };
  failed: { note: string };
}

const CLEARED: ItemPatch = {
  delegated_to: null,
  delegation_state: null,
  delegation_ref: null,
  delegation_note: null,
  delegated_at: null,
};

const ENTER_DELEGATION: { [To in DelegationEnd]: (entry: DelegationEntry[To]) => ItemPatch } = {
  none: () => CLEARED,
  queued: ({ runner, now }) => ({
    delegated_to: runner,
    delegation_state: "queued",
    delegation_ref: null,
    delegation_note: null,
    delegated_at: now,
  }),
  running: ({ ref }) => ({ delegation_state: "running", delegation_ref: ref }),
  done: ({ note }) => ({ delegation_state: "done", delegation_note: note }),
  returned: ({ note }) => ({ delegation_state: "returned", delegation_note: note }),
  failed: ({ note }) => ({ delegation_state: "failed", delegation_note: note }),
};

function planDelegation<To extends DelegationEnd>(item: Item, to: To, entry: DelegationEntry[To]): ItemPatch {
  const from = item.delegation_state ?? "none";
  if (!DELEGATION_TRANSITIONS[from].includes(to)) {
    throw new Error(`Cannot move the delegation of item ${item.id} from ${from} to ${to}`);
  }
  return ENTER_DELEGATION[to](entry);
}

export const NOTE_MAX = 500;

export const REPORT_OUTCOMES = ["done", "returned", "failed"] as const;
export type ReportOutcome = (typeof REPORT_OUTCOMES)[number];

function cleanNote(note: string): string {
  const trimmed = note.trim();
  if (trimmed === "") throw new Error("A report needs a note");
  return trimmed.length <= NOTE_MAX ? trimmed : `${trimmed.slice(0, NOTE_MAX - 1).trimEnd()}…`;
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

export type UpsertOutcome = "created" | "updated" | "reopened" | "skipped_closed";

/** The dedupe keys of each outcome. */
export interface SyncResult extends Record<UpsertOutcome | "resolved", string[]> {
  source: string;
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * The keys of each outcome of rotateRecurring. `held` lists the new-period keys that were not written,
 * because an older row of the same template is with an agent or came back from one.
 */
export interface RotateResult extends Record<UpsertOutcome | "held" | "resolved", string[]> {
  source: string;
}

/** A write that stopped part way. `written` holds the keys that reached the table before the fault at `key`. */
export class PartialWriteError<Written> extends Error {
  constructor(
    readonly key: string,
    cause: unknown,
    readonly written: Written,
  ) {
    super(`${key}: ${message(cause)}`);
  }
}

async function step<Written>(key: string, written: Written, write: () => Promise<unknown>): Promise<void> {
  try {
    await write();
  } catch (err) {
    throw new PartialWriteError(key, err, written);
  }
}

/**
 * A recurring row in these delegation states holds its template's slot: it is with an agent, or it came
 * back with a note that a person must read. A new copy would only fail the same way.
 */
const HOLDS_SLOT: ReadonlySet<DelegationState> = new Set(["queued", "running", "returned", "failed"]);
const holdsSlot = (row: Item) => row.delegation_state !== null && HOLDS_SLOT.has(row.delegation_state);

export interface ListQuery {
  project?: string;
  source?: string;
  kind?: ItemKind;
  status?: ItemStatus;
  owner?: ItemOwner;
  limit?: number;
}

/** Find one row by its id or by its dedupe key. */
export type ItemRef = { id: string } | { dedupe_key: string };

export interface RunnerHeartbeat {
  name: string;
  label: string;
  projects: string[];
}

/** A stored entry gives way to a patch entry with the same label. The others stay, in their order. */
export function mergeEvidence(stored: Evidence[], patch: Evidence[]): Evidence[] {
  const labels = new Set(patch.map((e) => e.label));
  return [...stored.filter((e) => !labels.has(e.label)), ...patch];
}

/** A producer closes a row it no longer reports: done, with closed_reason resolved, so it is not mistaken for a person's done. */
function resolve(row: Item, now: Date): ItemPatch {
  return { ...planMove(row, "done", now), closed_reason: "resolved" };
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
  ): Promise<{ result: AddResult; outcome: UpsertOutcome }> {
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

  async function getItem(id: string): Promise<Item> {
    const [item] = await db.select({ ids: [id] });
    if (!item) throw new Error(`Item not found: ${id}`);
    return item;
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

      const summary: SyncResult = { source: request.source, created: [], updated: [], reopened: [], skipped_closed: [], resolved: [] };
      for (const input of byKey.values()) {
        await step(input.dedupe_key, summary, async () => {
          const { outcome } = await upsert(input, existing.get(input.dedupe_key), projectIds, now);
          summary[outcome].push(input.dedupe_key);
        });
      }

      const open = await db.select({ source: request.source, statuses: ["open", "snoozed"] });
      for (const row of open.filter((r) => !byKey.has(r.dedupe_key))) {
        await step(row.dedupe_key, summary, () => db.update(row.id, resolve(row, now)));
        summary.resolved.push(row.dedupe_key);
      }
      return summary;
    },

    /**
     * Writes this period's recurring items and keeps one open row for each template. An open row of
     * another period, or of a template that is gone, closes as resolved: no person closed it, so it is
     * not "done", and nobody chose to drop it, so it is not "dismissed". A row that holds its slot
     * (see HOLDS_SLOT) stays, and its template gets no new-period row while it is open. A row with any
     * delegation state, and a snoozed row, never close by this rule. A current-period row that this
     * rule closed opens again once its slot is free.
     * Every step reads the table, so a second run, or a run after a crash, converges.
     */
    async rotateRecurring(raw: ItemInput[]): Promise<RotateResult> {
      const current = new Map<string, ItemInput>();
      raw.forEach((entry, idx) => {
        const input = parseItemInput(entry, `items[${idx}].`);
        const template = recurringTemplateId(input.dedupe_key);
        if (input.source !== RECURRING_SOURCE || template === null) throw new Error(`${input.dedupe_key} is not a recurring item`);
        if (current.has(template)) throw new Error(`Two items for template ${template}`);
        current.set(template, input);
      });
      const inputs = [...current.values()];
      const projectIds = await resolveProjectIds(inputs);
      const now = clock();
      const existing = await findExisting(inputs.map((i) => i.dedupe_key));
      const slots = new Map<string, Item[]>();
      for (const row of await db.select({ source: RECURRING_SOURCE, statuses: ["open", "snoozed"] })) {
        const template = recurringTemplateId(row.dedupe_key);
        if (template !== null) slots.set(template, [...(slots.get(template) ?? []), row]);
      }

      const summary: RotateResult = { source: RECURRING_SOURCE, created: [], updated: [], reopened: [], skipped_closed: [], held: [], resolved: [] };
      const held = new Set<string>();
      for (const [template, input] of current) {
        const key = input.dedupe_key;
        if ((slots.get(template) ?? []).some((row) => row.dedupe_key !== key && holdsSlot(row))) {
          held.add(template);
          summary.held.push(key);
          continue;
        }
        const prior = existing.get(key);
        await step(key, summary, async () => {
          const { outcome } = await upsert({ ...input, reopen: prior?.closed_reason === "resolved" }, prior, projectIds, now);
          summary[outcome].push(key);
        });
      }

      for (const [template, rows] of slots) {
        for (const row of rows) {
          const isCurrent = row.dedupe_key === current.get(template)?.dedupe_key && !held.has(template);
          if (isCurrent || row.delegation_state !== null || effectiveStatus(row, now) === "snoozed") continue;
          await step(row.dedupe_key, summary, () => db.update(row.id, resolve(row, now)));
          summary.resolved.push(row.dedupe_key);
        }
      }
      return summary;
    },

    async listItems(query: ListQuery = {}): Promise<Item[]> {
      const status = query.status ?? "open";
      const project_id = query.project ? await resolveProject(query.project) : undefined;
      const rows = await db.select({
        project_id,
        source: query.source,
        kind: query.kind,
        owner: query.owner,
        statuses: STORED_STATUSES[status],
      });
      const now = clock();
      const listed = rows.filter((row) => effectiveStatus(row, now) === status).sort(compareItems);
      return query.limit ? listed.slice(0, query.limit) : listed;
    },

    async findItem(ref: ItemRef): Promise<Item | null> {
      const [item] = await db.select("id" in ref ? { ids: [ref.id] } : { dedupe_keys: [ref.dedupe_key] });
      return item ?? null;
    },

    /**
     * Status, snooze, priority, owner and due_at change on any row the moves allow. Title, why, link
     * and evidence change only on a row that is open or snoozed, or that this patch reopens.
     */
    async updateItem(id: string, raw: UpdatePatch): Promise<Item> {
      const patch = parseUpdatePatch(raw);
      const item = await getItem(id);
      const now = clock();

      const content = (["title", "why", "link", "evidence"] as const).filter((field) => patch[field] !== undefined);
      if (content.length && CLOSED.has(item.status) && patch.status !== "open") {
        throw new Error(`Item ${id} is ${item.status}. Reopen it with status open before you change its ${content.join(", ")}.`);
      }

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
      if (patch.title !== undefined) change.title = patch.title;
      if (patch.why !== undefined) change.why = patch.why;
      if (patch.link !== undefined) change.link = patch.link;
      if (patch.evidence !== undefined) change.evidence = mergeEvidence(item.evidence, patch.evidence);
      if (Object.keys(change).length === 0) throw new Error("updateItem needs at least one field to change");

      return db.update(id, change);
    },

    listRunners(): Promise<Runner[]> {
      return db.selectRunners();
    },

    async heartbeat({ name, label, projects }: RunnerHeartbeat): Promise<void> {
      await db.upsertRunner({ name, label, projects, last_seen_at: clock().toISOString() });
    },

    async delegateItem(id: string): Promise<Item> {
      const item = await getItem(id);
      const now = clock();
      if (effectiveStatus(item, now) !== "open") throw new Error(`Only an open item can go to an agent. This item is ${item.status}.`);
      if (isHumanOnly(item)) throw new Error(HUMAN_ONLY_NOTE);
      const target = sendTarget(item.project, await db.selectRunners(), now);
      switch (target.kind) {
        case "none":
          throw new Error("A general item has no project, so no agent serves it");
        case "unserved":
          throw new Error(`No agent serves project ${target.project}. Install the dispatcher on the machine that serves it.`);
        case "offline":
          throw new Error(`${target.runner.label} is offline. It last checked in at ${target.runner.last_seen_at}.`);
        case "ready":
          return db.update(id, planDelegation(item, "queued", { runner: target.runner.name, now: now.toISOString() }));
      }
    },

    async recallItem(id: string): Promise<Item> {
      const item = await getItem(id);
      if (item.delegation_state === null) throw new Error(`Item ${id} is not with an agent`);
      return db.update(id, planDelegation(item, "none", {}));
    },

    async listDelegated(runner: string, state: DelegationState): Promise<Item[]> {
      const rows = await db.select({ delegated_to: runner, delegation_state: state, statuses: ["open", "snoozed"] });
      const now = clock();
      return rows.filter((row) => effectiveStatus(row, now) === "open").sort(compareItems);
    },

    async startItem(id: string, ref: string): Promise<Item> {
      const item = await getItem(id);
      return db.update(id, planDelegation(item, "running", { ref }));
    },

    async reportItem(id: string, outcome: ReportOutcome, note: string): Promise<Item> {
      const item = await getItem(id);
      const now = clock();
      if (CLOSED.has(item.status)) throw new Error(`Item ${id} is ${item.status}, so it takes no report`);
      const delegation = planDelegation(item, outcome, { note: cleanNote(note) });
      const close = outcome === "done" ? planMove(item, "done", now) : {};
      return db.update(id, { ...delegation, ...close });
    },
  };
}
