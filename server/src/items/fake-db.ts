import { randomUUID } from "node:crypto";
import type { ItemFilter, ItemPatch, ItemsDb, NewItem } from "./store.ts";
import type { Item } from "./types.ts";

export interface FakeItemsDb extends ItemsDb {
  rows: Item[];
}

/**
 * In-memory ItemsDb for tests. It keeps the dedupe_key unique rule of the real table,
 * and it fills the slug of `project` from `projects` (slug to id).
 */
export function createFakeItemsDb(
  options: { projects?: Record<string, string>; now?: () => Date } = {},
): FakeItemsDb {
  const projects = options.projects ?? {};
  const clock = options.now ?? (() => new Date());
  const slugOf = (id: string | null) => Object.entries(projects).find(([, v]) => v === id)?.[0] ?? null;
  const rows: Item[] = [];

  const matches = (row: Item, f: ItemFilter): boolean =>
    (!f.ids || f.ids.includes(row.id)) &&
    (!f.dedupe_keys || f.dedupe_keys.includes(row.dedupe_key)) &&
    (!f.source || row.source === f.source) &&
    (!f.project_id || row.project_id === f.project_id) &&
    (!f.kind || row.kind === f.kind) &&
    (!f.owner || row.owner === f.owner) &&
    (!f.statuses || f.statuses.includes(row.status));

  return {
    rows,
    async select(filter) {
      return rows.filter((row) => matches(row, filter)).map((row) => ({ ...row }));
    },
    async insert(row: NewItem) {
      if (rows.some((r) => r.dedupe_key === row.dedupe_key)) {
        throw new Error(`duplicate key value violates unique constraint "gtm_items_dedupe_key_key": ${row.dedupe_key}`);
      }
      const at = clock().toISOString();
      const item: Item = {
        ...row,
        id: randomUUID(),
        project: slugOf(row.project_id),
        status: "open",
        snoozed_until: null,
        closed_reason: null,
        card_id: null,
        created_at: at,
        updated_at: at,
        closed_at: null,
      };
      rows.push(item);
      return { ...item };
    },
    async update(id: string, patch: ItemPatch) {
      const row = rows.find((r) => r.id === id);
      if (!row) throw new Error(`no row with id ${id}`);
      Object.assign(row, patch, { updated_at: clock().toISOString() });
      return { ...row };
    },
  };
}
