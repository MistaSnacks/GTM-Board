import type { HermesJobRef, HermesPort, NewHermesJob } from "./hermes.ts";

export interface FakeHermes extends HermesPort {
  jobs: { id: string; name: string }[];
  created: NewHermesJob[];
  outputs: Record<string, string>;
  /** The job ends: Hermes removes it from jobs.json. */
  finish(id: string): void;
}

/** A Hermes that keeps its jobs in memory. `createJob` adds the job to the list, as Hermes does. */
export function createFakeHermes(options: { createFails?: string; dropsJobs?: boolean } = {}): FakeHermes {
  const jobs: { id: string; name: string }[] = [];
  const created: NewHermesJob[] = [];
  const outputs: Record<string, string> = {};
  return {
    jobs,
    created,
    outputs,
    finish(id) {
      const at = jobs.findIndex((j) => j.id === id);
      if (at !== -1) jobs.splice(at, 1);
    },
    async findJobByName(name): Promise<HermesJobRef | null> {
      const job = jobs.find((j) => j.name === name);
      return job ? { id: job.id } : null;
    },
    async hasJob(id) {
      return jobs.some((j) => j.id === id);
    },
    async createJob(job) {
      if (options.createFails) throw new Error(options.createFails);
      created.push(job);
      if (!options.dropsJobs) jobs.push({ id: `job${created.length}`, name: job.name });
    },
    async latestOutput(jobId) {
      return outputs[jobId] ?? null;
    },
  };
}
