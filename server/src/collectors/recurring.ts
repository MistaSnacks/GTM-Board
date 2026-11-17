import { generateRecurring, RECURRING_SOURCE } from "../items/recurring.ts";
import type { ItemInput } from "../items/types.ts";
import type { CollectorConfig } from "./config.ts";
import type { CollectDeps } from "./util.ts";

export const source = RECURRING_SOURCE;
/** rotateRecurring keeps one open row for each template and never touches another source. */
export const mode = "rotate" as const;

export async function collect(_config: CollectorConfig, deps: CollectDeps = {}): Promise<ItemInput[]> {
  return generateRecurring(deps.now ?? new Date());
}
