import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { Evidence, ItemInput } from "../items/types.ts";
import type { CollectorConfig } from "./config.ts";
import { clampText, clampTitle, type CollectDeps } from "./util.ts";

export const source = "collector:harness";
export const mode = "sync" as const;

interface CheckResult {
  name: string;
  status: string;
  detail: string;
}

/** One record `<runsDir>/<site>/<task>/<sha>/result.json`. Only the fields read here. */
export interface HarnessRun {
  site: string;
  task: string;
  sha: string;
  startedAt: string;
  failed: boolean;
  failedChecks: CheckResult[];
  reviewPath: string;
}

/**
 * Parse a web-dev harness result.json. `pass` is the harness verdict. An older record
 * without it counts as failed when a check has status fail.
 */
export function parseResult(raw: string, location: { site: string; task: string; sha: string; dir: string }): HarnessRun {
  const data = JSON.parse(raw) as Record<string, unknown>;
  if (typeof data.startedAt !== "string" || Number.isNaN(Date.parse(data.startedAt)) || !Array.isArray(data.checks)) {
    throw new Error(`${location.dir}/result.json has no startedAt or checks`);
  }
  const checks: CheckResult[] = data.checks.map((c) => {
    const check = c as Record<string, unknown>;
    return { name: String(check.name ?? "unnamed"), status: String(check.status ?? ""), detail: String(check.detail ?? "") };
  });
  const failedChecks = checks.filter((c) => c.status === "fail");
  const failed = typeof data.pass === "boolean" ? !data.pass : failedChecks.length > 0;
  return {
    site: location.site,
    task: location.task,
    sha: location.sha,
    startedAt: data.startedAt,
    failed,
    failedChecks,
    reviewPath: path.join(location.dir, "review.html"),
  };
}

/** Read every run record under `runsDir`. */
export function readRuns(runsDir: string): HarnessRun[] {
  const dirs = (parent: string) =>
    fs.readdirSync(parent, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  const runs: HarnessRun[] = [];
  for (const site of dirs(runsDir)) {
    for (const task of dirs(path.join(runsDir, site))) {
      for (const sha of dirs(path.join(runsDir, site, task))) {
        const dir = path.join(runsDir, site, task, sha);
        const file = path.join(dir, "result.json");
        if (fs.existsSync(file)) runs.push(parseResult(fs.readFileSync(file, "utf8"), { site, task, sha, dir }));
      }
    }
  }
  return runs;
}

/** A failed run that a newer run of the same site and task replaced is no longer pending. */
export function latestRuns(runs: HarnessRun[]): HarnessRun[] {
  const latest = new Map<string, HarnessRun>();
  for (const run of runs) {
    const key = `${run.site}/${run.task}`;
    const held = latest.get(key);
    if (!held || Date.parse(run.startedAt) > Date.parse(held.startedAt)) latest.set(key, run);
  }
  return [...latest.values()];
}

export function itemsForRuns(runs: HarnessRun[], harnessName: string, reviewExists: (file: string) => boolean): ItemInput[] {
  return latestRuns(runs)
    .filter((run) => run.failed)
    .map((run) => {
      const names = run.failedChecks.map((c) => c.name);
      const evidence: Evidence[] = run.failedChecks.map((c) => ({
        label: `Failed check: ${c.name}`,
        value: clampText(c.detail, 200),
        fetched_at: run.startedAt,
      }));
      return {
        project: null,
        source,
        kind: "agent_failed" as const,
        title: clampTitle(`Review failed ${harnessName} run: ${run.site} ${run.task}`),
        why: names.length
          ? `The run at ${run.sha} failed ${names.length === 1 ? "this check" : "these checks"}: ${names.join(", ")}.`
          : `The run at ${run.sha} has pass set to false.`,
        evidence,
        link: reviewExists(run.reviewPath) ? pathToFileURL(run.reviewPath).href : undefined,
        dedupe_key: `harness:${harnessName}:${run.site}:${run.task}:${run.sha}`,
        priority: 2 as const,
      };
    });
}

export async function collect(config: CollectorConfig, _deps: CollectDeps = {}): Promise<ItemInput[]> {
  return itemsForRuns(readRuns(config.harness.runsDir), config.harness.name, fs.existsSync);
}
