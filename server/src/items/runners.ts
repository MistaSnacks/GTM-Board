import type { Runner } from "./types.ts";

export const RUNNER_STALE_MS = 5 * 60_000;

export function isAlive(runner: Runner, now: Date): boolean {
  return now.getTime() - Date.parse(runner.last_seen_at) < RUNNER_STALE_MS;
}

/** How a row can be sent. The UI switches on kind and never re-derives it. */
export type SendTarget =
  | { kind: "none" }
  | { kind: "unserved"; project: string }
  | { kind: "offline"; runner: Runner }
  | { kind: "ready"; runner: Runner };

/** Routing is data: a runner serves the projects it lists. With two runners for one project, a live one wins, then the lower name. */
export function sendTarget(project: string | null, runners: Runner[], now: Date): SendTarget {
  if (project === null) return { kind: "none" };
  const serving = runners
    .filter((runner) => runner.projects.includes(project))
    .sort((a, b) => Number(isAlive(b, now)) - Number(isAlive(a, now)) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const [best] = serving;
  if (!best) return { kind: "unserved", project };
  return { kind: isAlive(best, now) ? "ready" : "offline", runner: best };
}
