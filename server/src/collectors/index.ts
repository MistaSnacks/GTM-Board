import type { ItemInput } from "../items/types.ts";
import type { CollectorConfig } from "./config.ts";
import * as git from "./git.ts";
import * as github from "./github.ts";
import * as harness from "./harness.ts";
import * as hermes from "./hermes.ts";
import * as recurring from "./recurring.ts";
import type { CollectDeps } from "./util.ts";

export interface CollectorModule {
  /** The `source` of every item the module returns. */
  source: string;
  /** `sync` replaces the open items of the source. `rotate` keeps one open row for each recurring template. */
  mode: "sync" | "rotate";
  collect(config: CollectorConfig, deps?: CollectDeps): Promise<ItemInput[]>;
}

export const COLLECTORS = { git, github, hermes, harness, recurring } satisfies Record<string, CollectorModule>;

export type CollectorName = keyof typeof COLLECTORS;
export const COLLECTOR_NAMES = Object.keys(COLLECTORS) as CollectorName[];
