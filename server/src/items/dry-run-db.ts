import { createFakeItemsDb } from "./fake-db.ts";
import type { ItemFilter, ItemsDb } from "./store.ts";

/**
 * Reads go to `real`. Each write lands on an in-memory copy of the rows it touches, so a store over
 * this db runs its whole logic, later reads see the earlier dry writes, and the real table never changes.
 */
export function createDryRunDb(real: ItemsDb): ItemsDb {
  const copy = createFakeItemsDb();
  const loaded = new Set<string>();

  async function load(filter: ItemFilter): Promise<void> {
    // A dry write can change these fields, so the real read leaves them out and the copy applies them.
    const { statuses: _s, owner: _o, delegated_to: _d, delegation_state: _ds, ...fixed } = filter;
    for (const row of await real.select(fixed)) {
      if (loaded.has(row.id)) continue;
      loaded.add(row.id);
      copy.rows.push(row);
    }
  }

  return {
    async select(filter) {
      await load(filter);
      return copy.select(filter);
    },
    async insert(row) {
      await load({ dedupe_keys: [row.dedupe_key] });
      return copy.insert(row);
    },
    async update(id, patch) {
      await load({ ids: [id] });
      return copy.update(id, patch);
    },
    selectRunners: () => real.selectRunners(),
    async upsertRunner() {},
  };
}
