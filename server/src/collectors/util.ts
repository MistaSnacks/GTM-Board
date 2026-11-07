import { TITLE_MAX } from "../items/types.ts";

export function clampTitle(title: string): string {
  const one = title.replace(/\s+/g, " ").trim();
  return one.length <= TITLE_MAX ? one : `${one.slice(0, TITLE_MAX - 1).trimEnd()}…`;
}

export function clampText(text: string, max: number): string {
  const one = text.replace(/\s+/g, " ").trim();
  return one.length <= max ? one : `${one.slice(0, max - 1).trimEnd()}…`;
}

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export const DAY_MS = 86_400_000;
export const HOUR_MS = 3_600_000;

export function ageText(fromMs: number, nowMs: number): string {
  const hours = Math.floor((nowMs - fromMs) / HOUR_MS);
  return hours < 48 ? plural(Math.max(hours, 0), "hour") : plural(Math.floor(hours / 24), "day");
}

/** Hide long token-like strings before text from an outside system goes into an item. */
export function redact(text: string): string {
  return text.replace(/Bearer\s+\S+/gi, "Bearer [redacted]").replace(/[A-Za-z0-9_\-+/=]{32,}/g, "[redacted]");
}

export interface CollectDeps {
  now?: Date;
}
