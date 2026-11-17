import { HUMAN_ONLY_NOTE, isHumanOnly } from "../items/recurring.ts";
import type { Item } from "../items/types.ts";
import type { ItemStore } from "../items/store.ts";
import type { DispatchConfig } from "./config.ts";
import { buildPrompt, jobName, type HermesPort } from "./hermes.ts";

export type DispatchStore = Pick<ItemStore, "heartbeat" | "listDelegated" | "startItem" | "reportItem">;

export interface DispatchLine {
  ok: boolean;
  text: string;
}

export interface DispatchDeps {
  store: DispatchStore;
  hermes: HermesPort;
  /** The Hermes delivery target of a new job. */
  deliver: string;
  /** The shell command of this checkout that reports an item. It goes into the task. */
  reportCommand: string;
  dryRun: boolean;
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));
const label = (item: Item) => `"${item.title}" (${item.id})`;

/**
 * One tick of a runner. Every step reads the current state and does only the difference,
 * so a tick that stops anywhere is safe to run again. One item that fails never stops the others.
 * With `dryRun` it reads, and it writes nothing: no heartbeat, no store change, no Hermes command.
 */
export async function runDispatch(config: DispatchConfig, { store, hermes, deliver, reportCommand, dryRun }: DispatchDeps): Promise<DispatchLine[]> {
  const lines: DispatchLine[] = [];
  const say = (ok: boolean, text: string) => lines.push({ ok, text: dryRun ? `would: ${text}` : text });
  const attempt = async (item: Item, step: () => Promise<void>) => {
    try {
      await step();
    } catch (err) {
      lines.push({ ok: false, text: `${label(item)}: ${message(err)}` });
    }
  };

  /** `broken` marks a fault of the runner itself, which makes the tick exit with an error. */
  async function fail(item: Item, note: string, broken: boolean) {
    if (!dryRun) await store.reportItem(item.id, "failed", note);
    say(!broken, `${label(item)} failed. ${note}`);
  }

  async function take(item: Item) {
    // Every path that queues a row ends here, including a direct write to the table, so this is the
    // check that holds even when delegateItem is skipped or older.
    if (isHumanOnly(item)) {
      if (!dryRun) await store.reportItem(item.id, "returned", HUMAN_ONLY_NOTE);
      say(true, `${label(item)} returned. ${HUMAN_ONLY_NOTE}`);
      return;
    }
    const workdir = item.project ? config.projects[item.project]?.workdir : undefined;
    if (!workdir) {
      await fail(item, `${config.label} has no workdir for project ${item.project ?? "none"}. Run scripts/install-dispatcher.sh on that machine with this project.`, false);
      return;
    }

    const name = jobName(item);
    let job = await hermes.findJobByName(name);
    if (!job) {
      if (dryRun) {
        say(true, `create Hermes job ${name} in ${workdir} for ${label(item)}`);
        return;
      }
      try {
        await hermes.createJob({ name, prompt: buildPrompt(item, reportCommand), workdir, deliver });
      } catch (err) {
        await fail(item, message(err), true);
        return;
      }
      job = await hermes.findJobByName(name);
      if (!job) {
        await fail(item, `Hermes accepted job ${name}, but it is not in jobs.json`, true);
        return;
      }
    }
    if (!dryRun) await store.startItem(item.id, job.id);
    say(true, `${label(item)} is running as Hermes job ${job.id}`);
  }

  async function check(item: Item) {
    if (item.delegation_ref && (await hermes.hasJob(item.delegation_ref))) return;
    const output = item.delegation_ref ? await hermes.latestOutput(item.delegation_ref) : null;
    const note = `The job ended with no report. Output: ${output ?? "none"}`;
    if (!dryRun) await store.reportItem(item.id, "returned", note);
    say(true, `${label(item)} returned. ${note}`);
  }

  if (!dryRun) {
    try {
      await store.heartbeat({ name: config.runner, label: config.label, projects: Object.keys(config.projects) });
    } catch (err) {
      return [{ ok: false, text: `heartbeat failed: ${message(err)}` }];
    }
  }

  for (const [state, handle] of [["queued", take], ["running", check]] as const) {
    let items: Item[];
    try {
      items = await store.listDelegated(config.runner, state);
    } catch (err) {
      lines.push({ ok: false, text: `cannot list ${state} items: ${message(err)}` });
      continue;
    }
    for (const item of items) await attempt(item, () => handle(item));
  }
  return lines;
}
