import fs from "node:fs";
import type { Evidence, ItemInput } from "../items/types.ts";
import type { CollectorConfig, RepoConfig } from "./config.ts";
import { realExec, stdoutOf, type Exec } from "./exec.ts";
import { ageText, clampTitle, DAY_MS, plural, type CollectDeps } from "./util.ts";

export const source = "collector:git";
export const mode = "sync" as const;

const DIRTY_P1_ABOVE = 50;

export interface PorcelainSummary {
  total: number;
  untracked: number;
  changed: number;
}

export function parsePorcelain(text: string): PorcelainSummary {
  const lines = text.split("\n").filter((l) => l.trim() !== "");
  const untracked = lines.filter((l) => l.startsWith("??")).length;
  return { total: lines.length, untracked, changed: lines.length - untracked };
}

export interface BranchRef {
  name: string;
  /** `%(upstream:track)`: empty, `[ahead 2]`, `[behind 1]`, `[ahead 1, behind 3]` or `[gone]`. */
  track: string;
  tipUnix: number;
}

const BRANCH_FORMAT = "%(refname:lstrip=2)%09%(upstream:track)%09%(committerdate:unix)";

export function parseBranches(text: string): BranchRef[] {
  return text
    .split("\n")
    .filter((l) => l !== "")
    .map((line) => {
      const [name, track = "", unix = "0"] = line.split("\t");
      return { name, track, tipUnix: Number(unix) };
    });
}

/** A branch whose upstream was deleted was pushed once, so its commits are not a push risk. */
export function isCandidateForUnpushed(branch: BranchRef, nowMs: number, maxAgeDays: number): boolean {
  if (branch.track.includes("gone")) return false;
  return nowMs - branch.tipUnix * 1000 <= maxAgeDays * DAY_MS;
}

export interface RepoFacts {
  repo: RepoConfig;
  status: PorcelainSummary;
  unpushed: { branch: string; commits: number; tipUnix: number }[];
}

function repoLink(repo: RepoConfig): string | undefined {
  return repo.github ? `https://github.com/${repo.github}` : undefined;
}

export function itemsForRepo({ repo, status, unpushed }: RepoFacts, now: Date): ItemInput[] {
  const seen = now.toISOString();
  const common = { project: repo.project, source, kind: "repo_attention" as const, link: repoLink(repo), reopen: true };
  const items: ItemInput[] = [];

  if (status.total > 0) {
    const evidence: Evidence[] = [{ label: "Changed files", value: status.total, fetched_at: seen }];
    items.push({
      ...common,
      title: clampTitle(`Commit or stash ${plural(status.total, "uncommitted file")} in ${repo.slug}`),
      why: `git status lists ${plural(status.total, "changed file")} (${status.changed} changed, ${status.untracked} untracked).`,
      evidence,
      dedupe_key: `git:${repo.slug}:dirty`,
      priority: status.total > DIRTY_P1_ABOVE ? 1 : 2,
    });
  }

  for (const { branch, commits, tipUnix } of unpushed) {
    items.push({
      ...common,
      title: clampTitle(`Push ${plural(commits, "commit")} on ${branch} in ${repo.slug}`),
      why: `${plural(commits, "commit")} on ${branch} ${commits === 1 ? "is" : "are"} not pushed. The newest commit is ${ageText(tipUnix * 1000, now.getTime())} old.`,
      evidence: [{ label: "Commits not on any remote", value: commits, fetched_at: seen }],
      dedupe_key: `git:${repo.slug}:unpushed:${branch}`,
      priority: 2,
    });
  }
  return items;
}

async function readRepo(repo: RepoConfig, config: CollectorConfig, exec: Exec, now: Date): Promise<RepoFacts> {
  if (!fs.existsSync(repo.path)) throw new Error(`Repo ${repo.slug}: path does not exist: ${repo.path}`);
  const run = async (args: string[], what: string) =>
    stdoutOf(await exec("git", ["--no-optional-locks", ...args], { cwd: repo.path }), `${repo.slug}: ${what}`);

  const status = parsePorcelain(await run(["status", "--porcelain"], "git status"));
  const branches = parseBranches(await run(["for-each-ref", "refs/heads", `--format=${BRANCH_FORMAT}`], "git for-each-ref"));

  const unpushed: RepoFacts["unpushed"] = [];
  const hasRemote = (await run(["for-each-ref", "--count=1", "refs/remotes"], "git for-each-ref refs/remotes")).trim() !== "";
  for (const branch of hasRemote ? branches : []) {
    if (!isCandidateForUnpushed(branch, now.getTime(), config.unpushedMaxAgeDays)) continue;
    // Counts commits that no remote branch holds. A branch with an open PR has its head on the
    // remote, so this also covers "no upstream and no open PR" without a network call.
    const count = await run(["rev-list", "--count", `refs/heads/${branch.name}`, "--not", "--remotes"], `rev-list ${branch.name}`);
    const commits = Number(count.trim());
    if (commits > 0) unpushed.push({ branch: branch.name, commits, tipUnix: branch.tipUnix });
  }
  return { repo, status, unpushed };
}

export async function collect(
  config: CollectorConfig,
  deps: CollectDeps & { exec?: Exec } = {},
): Promise<ItemInput[]> {
  const now = deps.now ?? new Date();
  const exec = deps.exec ?? realExec;
  const facts = await Promise.all(config.repos.map((repo) => readRepo(repo, config, exec, now)));
  return facts.flatMap((f) => itemsForRepo(f, now));
}
