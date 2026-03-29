import fs from "node:fs";
import path from "node:path";
import { getProjectDir, loadProjectConfig } from "../lib/config.ts";
import matter from "gray-matter";

function cadenceDir(project: string): string {
  return path.join(getProjectDir(project), "cadence");
}

function getMonthDir(project: string, date: Date): string {
  const yearMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  return path.join(cadenceDir(project), yearMonth);
}

function getCadenceFilePath(project: string, platform: string, date: Date): string {
  const dir = getMonthDir(project, date);
  return path.join(dir, `${platform}.md`);
}

function readOrCreateCadenceFile(
  filePath: string
): { data: Record<string, unknown>; content: string } {
  if (fs.existsSync(filePath)) {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = matter(raw);
    return { data: parsed.data as Record<string, unknown>, content: parsed.content };
  }
  return { data: { entries: [] }, content: "" };
}

function writeCadenceFile(
  filePath: string,
  data: Record<string, unknown>,
  content: string
): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const output = matter.stringify(content, data);
  fs.writeFileSync(filePath, output, "utf-8");
}

interface CadenceEntry {
  date: string;
  type: string;
  title?: string;
  url?: string;
  metrics?: Record<string, number>;
  count?: number;
  subreddit?: string;
  notes?: string;
  kind: "post" | "comment";
}

function stripUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

export function logPost(params: {
  project: string;
  platform: string;
  type: string;
  title: string;
  url?: string;
  metrics?: Record<string, number>;
}): { logged: boolean; entry: Record<string, unknown> } {
  const now = new Date();
  const filePath = getCadenceFilePath(params.project, params.platform, now);
  const file = readOrCreateCadenceFile(filePath);

  const entries = (file.data.entries as Record<string, unknown>[]) || [];
  const entry = stripUndefined({
    date: now.toISOString().slice(0, 10),
    kind: "post",
    type: params.type,
    title: params.title,
    url: params.url,
    metrics: params.metrics,
  });
  entries.push(entry);
  file.data.entries = entries;

  writeCadenceFile(filePath, file.data, file.content);
  return { logged: true, entry };
}

export function logComment(params: {
  project: string;
  platform: string;
  count: number;
  subreddit?: string;
  notes?: string;
}): { logged: boolean; entry: Record<string, unknown> } {
  const now = new Date();
  const filePath = getCadenceFilePath(params.project, params.platform, now);
  const file = readOrCreateCadenceFile(filePath);

  const entries = (file.data.entries as Record<string, unknown>[]) || [];
  const entry = stripUndefined({
    date: now.toISOString().slice(0, 10),
    kind: "comment",
    type: "comment",
    count: params.count,
    subreddit: params.subreddit,
    notes: params.notes,
  });
  entries.push(entry);
  file.data.entries = entries;

  writeCadenceFile(filePath, file.data, file.content);
  return { logged: true, entry };
}

function getWeekBounds(date: Date): { start: Date; end: Date } {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday start
  const start = new Date(d);
  start.setDate(d.getDate() + diff);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function getEntriesForWeek(
  project: string,
  platform: string,
  weekDate: Date
): CadenceEntry[] {
  const { start, end } = getWeekBounds(weekDate);
  const results: CadenceEntry[] = [];

  // Check the month(s) that overlap with the week
  const months = new Set<string>();
  const d = new Date(start);
  while (d <= end) {
    months.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    d.setDate(d.getDate() + 1);
  }

  for (const month of months) {
    const filePath = path.join(cadenceDir(project), month, `${platform}.md`);
    if (!fs.existsSync(filePath)) continue;
    const file = readOrCreateCadenceFile(filePath);
    const entries = (file.data.entries as CadenceEntry[]) || [];
    for (const entry of entries) {
      const entryDate = new Date(entry.date);
      if (entryDate >= start && entryDate <= end) {
        results.push(entry);
      }
    }
  }
  return results;
}

export function cadenceStatus(params: {
  project: string;
  week?: string;
}): Record<string, unknown> {
  const config = loadProjectConfig(params.project);
  const weekDate = params.week ? new Date(params.week) : new Date();
  const { start } = getWeekBounds(weekDate);

  const result: Record<string, unknown> = {};

  // LinkedIn
  const liEntries = getEntriesForWeek(params.project, "linkedin", weekDate);
  const liPosts = liEntries.filter((e) => e.kind === "post");
  const liComments = liEntries.filter((e) => e.kind === "comment");
  const totalLiComments = liComments.reduce((sum, e) => sum + (e.count || 0), 0);

  const schedule: Record<string, string> = {};
  if (config.cadence.linkedin?.schedule) {
    const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    for (const [day, postType] of Object.entries(config.cadence.linkedin.schedule)) {
      const dayIndex = dayNames.indexOf(day.toLowerCase());
      if (dayIndex === -1) continue;
      const targetDate = new Date(start);
      targetDate.setDate(start.getDate() + ((dayIndex - 1 + 7) % 7));
      const done = liPosts.some(
        (p) => p.type === postType && p.date === targetDate.toISOString().slice(0, 10)
      );
      schedule[day] = `${postType} (${done ? "done" : "pending"})`;
    }
  }

  result.linkedin = {
    posts: {
      done: liPosts.length,
      target: config.cadence.linkedin?.posts_per_week || 0,
      schedule,
    },
    comments: {
      done: totalLiComments,
      min: config.cadence.linkedin?.comments_per_week?.min || 0,
      target: config.cadence.linkedin?.comments_per_week?.target || 0,
    },
  };

  // Reddit
  const redditEntries = getEntriesForWeek(params.project, "reddit", weekDate);
  const redditPosts = redditEntries.filter((e) => e.kind === "post");
  const redditComments = redditEntries.filter((e) => e.kind === "comment");
  const totalRedditComments = redditComments.reduce((sum, e) => sum + (e.count || 0), 0);

  result.reddit = {
    posts: {
      done: redditPosts.length,
      min: config.cadence.reddit?.posts_per_week?.min || 0,
      target: config.cadence.reddit?.posts_per_week?.target || 0,
    },
    comments: {
      done: totalRedditComments,
      min: config.cadence.reddit?.comments_per_week?.min || 0,
      target: config.cadence.reddit?.comments_per_week?.target || 0,
    },
  };

  result.week_start = start.toISOString().slice(0, 10);

  return result;
}

export function cadenceStreak(params: { project: string }): { streak: number } {
  const config = loadProjectConfig(params.project);
  let streak = 0;
  const now = new Date();
  const checkDate = new Date(now);
  // Go back week by week
  checkDate.setDate(checkDate.getDate() - 7); // start from last complete week

  for (let i = 0; i < 52; i++) {
    const status = cadenceStatus({ project: params.project, week: checkDate.toISOString().slice(0, 10) });

    const li = status.linkedin as Record<string, Record<string, number>> | undefined;
    const rd = status.reddit as Record<string, Record<string, number>> | undefined;

    let metMinimums = true;
    if (li) {
      if ((li.posts?.done || 0) < (config.cadence.linkedin?.posts_per_week || 0)) metMinimums = false;
      if ((li.comments?.done || 0) < (li.comments?.min || 0)) metMinimums = false;
    }
    if (rd) {
      if ((rd.posts?.done || 0) < (rd.posts?.min || 0)) metMinimums = false;
      if ((rd.comments?.done || 0) < (rd.comments?.min || 0)) metMinimums = false;
    }

    if (metMinimums) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 7);
    } else {
      break;
    }
  }

  return { streak };
}
