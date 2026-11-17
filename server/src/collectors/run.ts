import type { ItemStore, RotateResult, SyncResult } from "../items/store.ts";
import type { ItemInput } from "../items/types.ts";
import type { CollectorConfig } from "./config.ts";
import { COLLECTORS, type CollectorModule, type CollectorName } from "./index.ts";

export type WriteStore = Pick<ItemStore, "syncItems" | "rotateRecurring">;

const WRITE: Record<CollectorModule["mode"], (store: WriteStore, source: string, items: ItemInput[]) => Promise<SyncResult | RotateResult>> = {
  sync: (store, source, items) => store.syncItems({ source, items, complete: true }),
  rotate: (store, _source, items) => store.rotateRecurring(items),
};

export interface SourceReport {
  name: CollectorName;
  source: string;
  ok: boolean;
  items: ItemInput[];
  /** Set when the source read and wrote its data. */
  written?: SyncResult | RotateResult;
  error?: string;
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * Run the named collectors one by one. A source that fails to read its data reports an error
 * and never reaches the store, because an empty sync would close its open items. With
 * `store` omitted nothing is written.
 */
export async function runCollectors(
  names: CollectorName[],
  config: CollectorConfig,
  options: { store?: WriteStore; now?: Date } = {},
): Promise<SourceReport[]> {
  const reports: SourceReport[] = [];
  for (const name of names) {
    const collector = COLLECTORS[name];
    const report: SourceReport = { name, source: collector.source, ok: false, items: [] };
    reports.push(report);
    try {
      report.items = await collector.collect(config, { now: options.now });
    } catch (err) {
      report.error = `read failed: ${message(err)}`;
      continue;
    }
    try {
      if (options.store) report.written = await WRITE[collector.mode](options.store, collector.source, report.items);
      report.ok = true;
    } catch (err) {
      report.error = `write failed: ${message(err)}`;
    }
  }
  return reports;
}
