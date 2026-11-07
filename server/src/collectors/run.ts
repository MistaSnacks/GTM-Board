import type { AddResult, ItemStore, SyncResult } from "../items/store.ts";
import type { ItemInput } from "../items/types.ts";
import type { CollectorConfig } from "./config.ts";
import { COLLECTORS, type CollectorName } from "./index.ts";

export type WriteStore = Pick<ItemStore, "addItem" | "syncItems">;

export interface SourceReport {
  name: CollectorName;
  source: string;
  ok: boolean;
  items: ItemInput[];
  /** Set when the source read and wrote its data. */
  written?: SyncResult | { added: AddResult[] };
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
      const { store } = options;
      if (store && collector.mode === "sync") {
        report.written = await store.syncItems({ source: collector.source, items: report.items, complete: true });
      } else if (store) {
        const added: AddResult[] = [];
        for (const item of report.items) added.push(await store.addItem(item));
        report.written = { added };
      }
      report.ok = true;
    } catch (err) {
      report.error = `write failed: ${message(err)}`;
    }
  }
  return reports;
}
