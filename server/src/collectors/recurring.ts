import { generateRecurring } from "../items/recurring.ts";
import type { ItemInput } from "../items/types.ts";
import type { CollectorConfig } from "./config.ts";
import type { CollectDeps } from "./util.ts";

export const source = "rule:recurring";
/** Recurring items use addItem, so a run never closes another item. */
export const mode = "add" as const;

export async function collect(_config: CollectorConfig, deps: CollectDeps = {}): Promise<ItemInput[]> {
  return generateRecurring(deps.now ?? new Date());
}
