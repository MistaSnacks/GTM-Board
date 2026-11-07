import type { ItemInput, ItemOwner, Priority } from "./types.ts";

// Templates from harness-specs/06-today-items-contract.md, "Recurring templates".

/** Daily and weekly periods follow the calendar of the person who reads the board. */
export const RECURRING_TIMEZONE = "America/Los_Angeles";

export type RecurringPeriod = "daily" | "weekly";

export interface RecurringTemplate {
  id: string;
  project: string;
  period: RecurringPeriod;
  owner: ItemOwner;
  priority: Priority;
  title: string;
  why: string;
}

export const RECURRING_TEMPLATES: readonly RecurringTemplate[] = [
  {
    id: "gl-visitors-daily",
    project: "groomlocal",
    period: "daily",
    owner: "agent",
    priority: 1,
    title: "Record yesterday's GroomLocal visitors by source",
    why: "Done when yesterday's visitors by source are on the board, with the 7-day sum against 226 (32 a day).",
  },
  {
    id: "gl-ctr-opportunities",
    project: "groomlocal",
    period: "weekly",
    owner: "agent",
    priority: 2,
    title: "Draft CTR rewrite proposals for GroomLocal pages",
    why: "At most 5 rewrites in one draft PR, for pages at positions 5 to 20 with 100 or more impressions and a low CTR.",
  },
  {
    id: "gl-index-sample",
    project: "groomlocal",
    period: "weekly",
    owner: "agent",
    priority: 2,
    title: "Sample GroomLocal index coverage by page type",
    why: "Done when the indexed share by page type is on the board and new crawled-not-indexed pages are listed.",
  },
  {
    id: "gl-data-floor",
    project: "groomlocal",
    period: "weekly",
    owner: "agent",
    priority: 2,
    title: "Count GroomLocal sitemap profiles below the data floor",
    why: "Done when the count is on the board and no new thin URL entered the sitemap this week.",
  },
  {
    id: "gl-serp-spotcheck",
    project: "groomlocal",
    period: "weekly",
    owner: "agent",
    priority: 2,
    title: "Spot-check SERPs and ChatGPT citations for GroomLocal",
    why: "At most 5 DataForSEO calls. Log who ranks and who ChatGPT cites, with GroomLocal's place or absent.",
  },
  {
    id: "gl-other-engines",
    project: "groomlocal",
    period: "weekly",
    owner: "camren",
    priority: 2,
    title: "Read Bing clicks and AI referrals for GroomLocal",
    why: "Done when Bing clicks and the referrals from chatgpt.com and perplexity.ai are on the board.",
  },
  {
    id: "gl-community-answer",
    project: "groomlocal",
    period: "weekly",
    owner: "camren",
    priority: 1,
    title: "Post one helpful answer to a local groomer-price question",
    why: "Done when one answer is posted, and its URL and the community rule check are logged.",
  },
  {
    id: "gl-price-harvest",
    project: "groomlocal",
    period: "weekly",
    owner: "agent",
    priority: 2,
    title: "Save 5 real groomer menus from one new metro",
    why: "Done when at least 5 menus are saved, each with its source URL and date.",
  },
  {
    id: "tl-audit-weekly",
    project: "tailor",
    period: "weekly",
    owner: "agent",
    priority: 2,
    title: "Run the weekly TAILOR SEO audit",
    why: "Done when the report is saved and errors are 0, or each error has its own item.",
  },
  {
    id: "tl-gsc-weekly",
    project: "tailor",
    period: "weekly",
    owner: "agent",
    priority: 2,
    title: "Record TAILOR Search Console clicks and impressions",
    why: "Done when clicks, impressions, indexed pages and new queries are on the board.",
  },
  {
    id: "tl-ai-citation",
    project: "tailor",
    period: "weekly",
    owner: "agent",
    priority: 3,
    title: "Check whether ChatGPT cites a TAILOR page",
    why: "At most 3 DataForSEO calls. Done when the answer for each target question is logged.",
  },
];

export interface CivilDate {
  year: number;
  month: number;
  day: number;
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

/** The calendar date at `now` in `timeZone`. */
export function civilDate(now: Date, timeZone: string = RECURRING_TIMEZONE): CivilDate {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: part("year"), month: part("month"), day: part("day") };
}

export function dayKey({ year, month, day }: CivilDate): string {
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

const DAY_MS = 86_400_000;
const utcDay = ({ year, month, day }: CivilDate) => Date.UTC(year, month - 1, day);

function fromUtcDay(ms: number): CivilDate {
  const d = new Date(ms);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** Monday of the ISO week that holds `date`. */
export function isoWeekMonday(date: CivilDate): CivilDate {
  const weekday = new Date(utcDay(date)).getUTCDay() || 7;
  return fromUtcDay(utcDay(date) - (weekday - 1) * DAY_MS);
}

/** ISO 8601 week key, `YYYY-Www`. The ISO year is the year of the week's Thursday. */
export function isoWeekKey(date: CivilDate): string {
  const thursday = fromUtcDay(utcDay(isoWeekMonday(date)) + 3 * DAY_MS);
  const jan1 = Date.UTC(thursday.year, 0, 1);
  const week = Math.floor((utcDay(thursday) - jan1) / (7 * DAY_MS)) + 1;
  return `${pad(thursday.year, 4)}-W${pad(week)}`;
}

function offsetMs(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const local = Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"), part("second"));
  return local - Math.floor(at.getTime() / 1000) * 1000;
}

/** 23:59:59 on `date` in `timeZone`, as an ISO time. The hour is far from a DST change, so one offset pass is exact. */
export function endOfDay(date: CivilDate, timeZone: string = RECURRING_TIMEZONE): string {
  const wallClockAsUtc = Date.UTC(date.year, date.month - 1, date.day, 23, 59, 59);
  return new Date(wallClockAsUtc - offsetMs(new Date(wallClockAsUtc), timeZone)).toISOString();
}

/**
 * The items for the daily and ISO-week period that holds `now`. An item is due at the end of its
 * period: the Pacific day, or the Sunday of the ISO week. A weekly item exists for the whole week, so
 * a run that starts late still creates it and the item is not overdue before the week ends.
 * addItem keeps one row for each period.
 */
export function generateRecurring(now: Date): ItemInput[] {
  const today = civilDate(now);
  const sunday = fromUtcDay(utcDay(isoWeekMonday(today)) + 6 * DAY_MS);
  const periods: Record<RecurringPeriod, { key: string; due: CivilDate }> = {
    daily: { key: dayKey(today), due: today },
    weekly: { key: isoWeekKey(today), due: sunday },
  };
  return RECURRING_TEMPLATES.map((t) => ({
    project: t.project,
    kind: "seo_task",
    title: t.title,
    why: t.why,
    source: "rule:recurring",
    dedupe_key: `rule:${t.id}:${periods[t.period].key}`,
    priority: t.priority,
    owner: t.owner,
    due_at: endOfDay(periods[t.period].due),
  }));
}
