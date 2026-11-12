import fs from "node:fs";
import { z } from "zod";
import { formatZodError } from "../items/types.ts";

const absolutePath = z.string().refine((p) => p.startsWith("/"), "must be an absolute path");

const configSchema = z.object({
  runner: z.string().min(1).describe("gtm_runners.name"),
  label: z.string().min(1).describe("The name a person sees on the board"),
  hermesHome: absolutePath,
  hermesBin: absolutePath,
  projects: z.record(z.string().min(1), z.object({ workdir: absolutePath })),
});

export type DispatchConfig = z.infer<typeof configSchema>;

export function parseConfig(raw: unknown): DispatchConfig {
  const result = configSchema.safeParse(raw);
  if (!result.success) throw new Error(`Invalid dispatch config: ${formatZodError(result.error)}`);
  return result.data;
}

export function loadConfig(file: string): DispatchConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    throw new Error(`Cannot read dispatch config ${file}: ${(err as Error).message}`);
  }
  return parseConfig(raw);
}
