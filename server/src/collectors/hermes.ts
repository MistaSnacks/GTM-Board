import fs from "node:fs";
import type { Evidence, ItemInput } from "../items/types.ts";
import type { CollectorConfig } from "./config.ts";
import { clampText, clampTitle, HOUR_MS, redact, type CollectDeps } from "./util.ts";

export const source = "collector:hermes";
export const mode = "sync" as const;

/** The only fields read from a Hermes cron job. The prompt and the delivery target stay in jobs.json. */
export interface HermesJob {
  name: string;
  enabled: boolean;
  last_status: string | null;
  last_error: string | null;
  last_delivery_error: string | null;
  last_run_at: string | null;
  next_run_at: string | null;
}

const text = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

/** Parse the contents of `~/.hermes/cron/jobs.json`. */
export function parseJobs(raw: string): HermesJob[] {
  const data = JSON.parse(raw) as { jobs?: unknown };
  if (!data || !Array.isArray(data.jobs)) throw new Error("jobs.json has no jobs array");
  return data.jobs.map((entry, idx) => {
    const job = entry as Record<string, unknown>;
    if (typeof job?.name !== "string" || typeof job.enabled !== "boolean") {
      throw new Error(`jobs.json entry ${idx} has no name or enabled flag`);
    }
    return {
      name: job.name,
      enabled: job.enabled,
      last_status: text(job.last_status),
      last_error: text(job.last_error),
      last_delivery_error: text(job.last_delivery_error),
      last_run_at: text(job.last_run_at),
      next_run_at: text(job.next_run_at),
    };
  });
}

export function itemsForJobs(jobs: HermesJob[], now: Date, missedAfterHours: number): ItemInput[] {
  const seen = now.toISOString();
  const items: ItemInput[] = [];

  for (const job of jobs.filter((j) => j.enabled)) {
    // A job that never ran has no status yet, so only the missed rule applies to it.
    const failed = (job.last_status !== null && job.last_status !== "ok") || job.last_error !== null || job.last_delivery_error !== null;
    const lateMs = job.next_run_at ? now.getTime() - Date.parse(job.next_run_at) : 0;
    const missed = lateMs > missedAfterHours * HOUR_MS;
    if (!failed && !missed) continue;

    const reasons: string[] = [];
    if (job.last_status !== null && job.last_status !== "ok") reasons.push(`last_status is ${job.last_status}`);
    if (job.last_error) reasons.push(`last_error: ${clampText(redact(job.last_error), 140)}`);
    if (job.last_delivery_error) reasons.push(`last_delivery_error: ${clampText(redact(job.last_delivery_error), 140)}`);
    if (missed) reasons.push(`next_run_at is ${Math.floor(lateMs / HOUR_MS)} hours in the past`);

    const evidence: Evidence[] = [
      { label: "last_status", value: job.last_status ?? "never run", fetched_at: seen },
      { label: "last_run_at", value: job.last_run_at ?? "never", fetched_at: seen },
      { label: "next_run_at", value: job.next_run_at ?? "none", fetched_at: seen },
    ];
    items.push({
      project: null,
      source,
      kind: "agent_failed",
      title: clampTitle(`${failed ? "Fix failed" : "Check missed"} Hermes job ${job.name}`),
      why: `${reasons.join(". ")}.`,
      evidence,
      dedupe_key: `hermes:cron:${job.name}:${job.last_run_at ?? "never"}`,
      priority: 1,
      reopen: true,
    });
  }
  return items;
}

export async function collect(config: CollectorConfig, deps: CollectDeps = {}): Promise<ItemInput[]> {
  const raw = fs.readFileSync(config.hermes.jobsPath, "utf8");
  return itemsForJobs(parseJobs(raw), deps.now ?? new Date(), config.hermes.missedAfterHours);
}
