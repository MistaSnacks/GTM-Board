import { supabase, getProjectId } from "../lib/supabase.ts";
import { loadProjectConfig } from "../lib/config.ts";

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

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function logPost(params: {
  project: string;
  platform: string;
  type: string;
  title: string;
  url?: string;
  metrics?: Record<string, number>;
}): Promise<{ logged: boolean; entry: Record<string, unknown> }> {
  const projectId = await getProjectId(params.project);
  const now = new Date();
  const weekStart = toDateStr(getWeekBounds(now).start);

  const entry = stripUndefined({
    date: toDateStr(now),
    kind: "post",
    type: params.type,
    title: params.title,
    url: params.url,
    metrics: params.metrics,
  });

  // Fetch existing row to append entry
  const { data: existing } = await supabase
    .from("gtm_cadence_logs")
    .select("count, details")
    .eq("project_id", projectId)
    .eq("platform", params.platform)
    .eq("log_type", "post")
    .eq("week_start", weekStart)
    .single();

  const currentCount = existing?.count ?? 0;
  const currentEntries = (existing?.details as { entries?: unknown[] })?.entries ?? [];
  const updatedEntries = [...currentEntries, entry];

  const { error } = await supabase
    .from("gtm_cadence_logs")
    .upsert(
      {
        project_id: projectId,
        platform: params.platform,
        log_type: "post",
        week_start: weekStart,
        count: currentCount + 1,
        details: { entries: updatedEntries },
      },
      { onConflict: "project_id,platform,log_type,week_start" }
    );

  if (error) throw new Error(`Failed to log post: ${error.message}`);

  return { logged: true, entry };
}

export async function logComment(params: {
  project: string;
  platform: string;
  count: number;
  subreddit?: string;
  notes?: string;
}): Promise<{ logged: boolean; entry: Record<string, unknown> }> {
  const projectId = await getProjectId(params.project);
  const now = new Date();
  const weekStart = toDateStr(getWeekBounds(now).start);

  const entry = stripUndefined({
    date: toDateStr(now),
    kind: "comment",
    type: "comment",
    count: params.count,
    subreddit: params.subreddit,
    notes: params.notes,
  });

  // Fetch existing row to append entry
  const { data: existing } = await supabase
    .from("gtm_cadence_logs")
    .select("count, details")
    .eq("project_id", projectId)
    .eq("platform", params.platform)
    .eq("log_type", "comment")
    .eq("week_start", weekStart)
    .single();

  const currentCount = existing?.count ?? 0;
  const currentEntries = (existing?.details as { entries?: unknown[] })?.entries ?? [];
  const updatedEntries = [...currentEntries, entry];

  const { error } = await supabase
    .from("gtm_cadence_logs")
    .upsert(
      {
        project_id: projectId,
        platform: params.platform,
        log_type: "comment",
        week_start: weekStart,
        count: currentCount + params.count,
        details: { entries: updatedEntries },
      },
      { onConflict: "project_id,platform,log_type,week_start" }
    );

  if (error) throw new Error(`Failed to log comment: ${error.message}`);

  return { logged: true, entry };
}

export async function cadenceStatus(params: {
  project: string;
  week?: string;
}): Promise<Record<string, unknown>> {
  const projectId = await getProjectId(params.project);
  const config = await loadProjectConfig(params.project);
  const weekDate = params.week ? new Date(params.week) : new Date();
  const { start } = getWeekBounds(weekDate);
  const weekStart = toDateStr(start);

  // Query all cadence logs for this project + week
  const { data: rows, error } = await supabase
    .from("gtm_cadence_logs")
    .select("platform, log_type, count, details")
    .eq("project_id", projectId)
    .eq("week_start", weekStart);

  if (error) throw new Error(`Failed to query cadence: ${error.message}`);

  const lookup = (platform: string, logType: string) => {
    const row = (rows || []).find(
      (r: Record<string, unknown>) => r.platform === platform && r.log_type === logType
    );
    return {
      count: (row?.count as number) ?? 0,
      entries: ((row?.details as { entries?: CadenceEntry[] })?.entries ?? []) as CadenceEntry[],
    };
  };

  const result: Record<string, unknown> = {};

  // LinkedIn
  const liPosts = lookup("linkedin", "post");
  const liComments = lookup("linkedin", "comment");

  const schedule: Record<string, string> = {};
  if (config.cadence.linkedin?.schedule) {
    const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    for (const [day, postType] of Object.entries(config.cadence.linkedin.schedule)) {
      const dayIndex = dayNames.indexOf(day.toLowerCase());
      if (dayIndex === -1) continue;
      const targetDate = new Date(start);
      targetDate.setDate(start.getDate() + ((dayIndex - 1 + 7) % 7));
      const done = liPosts.entries.some(
        (p) => p.type === postType && p.date === toDateStr(targetDate)
      );
      schedule[day] = `${postType} (${done ? "done" : "pending"})`;
    }
  }

  result.linkedin = {
    posts: {
      done: liPosts.count,
      target: config.cadence.linkedin?.posts_per_week || 0,
      schedule,
    },
    comments: {
      done: liComments.count,
      min: config.cadence.linkedin?.comments_per_week?.min || 0,
      target: config.cadence.linkedin?.comments_per_week?.target || 0,
    },
  };

  // Reddit
  const redditPosts = lookup("reddit", "post");
  const redditComments = lookup("reddit", "comment");

  result.reddit = {
    posts: {
      done: redditPosts.count,
      min: config.cadence.reddit?.posts_per_week?.min || 0,
      target: config.cadence.reddit?.posts_per_week?.target || 0,
    },
    comments: {
      done: redditComments.count,
      min: config.cadence.reddit?.comments_per_week?.min || 0,
      target: config.cadence.reddit?.comments_per_week?.target || 0,
    },
  };

  result.week_start = weekStart;

  return result;
}

export async function cadenceStreak(params: { project: string }): Promise<{ streak: number }> {
  const config = await loadProjectConfig(params.project);
  let streak = 0;
  const now = new Date();
  const checkDate = new Date(now);
  // Start from last complete week
  checkDate.setDate(checkDate.getDate() - 7);

  for (let i = 0; i < 52; i++) {
    const status = await cadenceStatus({
      project: params.project,
      week: toDateStr(checkDate),
    });

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
