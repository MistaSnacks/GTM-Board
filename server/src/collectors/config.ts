import fs from "node:fs";
import { z } from "zod";
import { formatZodError } from "../items/types.ts";

const repoSchema = z.object({
  slug: z.string().min(1),
  path: z.string().min(1),
  github: z.string().regex(/^[\w.-]+\/[\w.-]+$/, "github must be owner/repo").nullable(),
  project: z.string().min(1).nullable(),
});

const configSchema = z.object({
  owner: z.string().min(1),
  repos: z.array(repoSchema),
  unpushedMaxAgeDays: z.number().positive(),
  prStaleAfterDays: z.number().positive(),
  hermes: z.object({ jobsPath: z.string().min(1), missedAfterHours: z.number().positive() }),
  harness: z.object({ name: z.string().min(1), runsDir: z.string().min(1) }),
});

export type RepoConfig = z.infer<typeof repoSchema>;
export type CollectorConfig = z.infer<typeof configSchema>;

export function parseConfig(raw: unknown): CollectorConfig {
  const result = configSchema.safeParse(raw);
  if (!result.success) throw new Error(`Invalid collector config: ${formatZodError(result.error)}`);
  return result.data;
}

export function loadConfig(file: string): CollectorConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    throw new Error(`Cannot read collector config ${file}: ${(err as Error).message}`);
  }
  return parseConfig(raw);
}
