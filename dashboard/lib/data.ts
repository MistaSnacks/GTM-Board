import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { getProjectsDir, getConfig } from "./config";
import type {
  BoardData,
  CardData,
  CadenceData,
  CadenceDay,
  MetricsData,
  ChannelMetricsData,
  Column,
  KPIData,
  StatusLevel,
  SnapshotSeries,
  ResearchEntry,
  CardFilters,
  FunnelData,
  WeeklyDelta,
  Alert,
  CadenceWithStreak,
  UGCBrief,
  UGCPipelineStats,
  ContentPipelineStats,
} from "./types";

const COLUMNS: Column[] = ["backlog", "preparing", "live", "measuring", "done"];

export function getBoard(project: string): BoardData {
  const boardDir = path.join(getProjectsDir(), project, "board");
  const columns: BoardData["columns"] = {
    backlog: [],
    preparing: [],
    live: [],
    measuring: [],
    done: [],
  };

  for (const col of COLUMNS) {
    const colDir = path.join(boardDir, col);
    if (!fs.existsSync(colDir)) continue;
    const files = fs.readdirSync(colDir).filter((f) => f.endsWith(".md"));
    for (const file of files) {
      const raw = fs.readFileSync(path.join(colDir, file), "utf-8");
      const { data, content } = matter(raw);
      columns[col].push({
        id: data.id || path.basename(file, ".md"),
        title: data.title || "Untitled",
        type: data.type || "post",
        channel: data.channel || "other",
        column: col,
        created: data.created instanceof Date ? data.created.toISOString().slice(0, 10) : String(data.created || ""),
        target_date: data.target_date instanceof Date ? data.target_date.toISOString().slice(0, 10) : data.target_date ? String(data.target_date) : undefined,
        description: data.description || undefined,
        tags: data.tags,
        source: data.source,
        metrics: data.metrics,
        paper_artboard: data.paper_artboard,
        body: content,
        creator: data.creator,
        creator_handle: data.creator_handle,
        deliverable_type: data.deliverable_type,
        approval_status: data.approval_status,
        due_date: data.due_date instanceof Date ? data.due_date.toISOString().slice(0, 10) : data.due_date ? String(data.due_date) : undefined,
        asset_url: data.asset_url,
      });
    }
    columns[col].sort(
      (a, b) => new Date(b.created).getTime() - new Date(a.created).getTime()
    );
  }

  return { columns };
}

export function getCadence(project: string): CadenceData {
  const config = getConfig(project);
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const cadenceDir = path.join(
    getProjectsDir(),
    project,
    "cadence",
    `${year}-${month}`
  );

  const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const today = now.getDay();

  // Build LinkedIn post schedule for the week
  const schedule = config.cadence.linkedin.schedule;
  const scheduleDays = Object.keys(schedule);
  const posts: CadenceDay[] = scheduleDays.map((day) => {
    const dayIndex = dayNames.indexOf(day);
    return {
      day: day.charAt(0).toUpperCase(),
      type: schedule[day],
      done: dayIndex < today, // simple heuristic: past days are done
    };
  });

  // Try to read actual cadence files
  let linkedinComments = 0;
  let redditComments = 0;
  let linkedinPostsDone = 0;
  let redditPostsDone = 0;

  if (fs.existsSync(cadenceDir)) {
    const linkedinFile = path.join(cadenceDir, "linkedin.md");
    if (fs.existsSync(linkedinFile)) {
      const { data } = matter(fs.readFileSync(linkedinFile, "utf-8"));
      linkedinPostsDone = data.posts_done ?? 0;
      linkedinComments = data.comments_done ?? 0;
      // Update post done status from actual data
      if (data.posts_completed && Array.isArray(data.posts_completed)) {
        for (const completed of data.posts_completed) {
          const post = posts.find(
            (p) => p.day === String(completed).charAt(0).toUpperCase()
          );
          if (post) post.done = true;
        }
      }
    }
    const redditFile = path.join(cadenceDir, "reddit.md");
    if (fs.existsSync(redditFile)) {
      const { data } = matter(fs.readFileSync(redditFile, "utf-8"));
      redditPostsDone = data.posts_done ?? 0;
      redditComments = data.comments_done ?? 0;
    }
  }

  return {
    linkedin: {
      posts,
      posts_done: linkedinPostsDone || posts.filter((p) => p.done).length,
      posts_target: config.cadence.linkedin.posts_per_week,
      comments_done: linkedinComments,
      comments_target: config.cadence.linkedin.comments_per_week.target,
    },
    reddit: {
      posts_done: redditPostsDone,
      posts_target: config.cadence.reddit.posts_per_week.target,
      comments_done: redditComments,
      comments_target: config.cadence.reddit.comments_per_week.target,
    },
  };
}

const RESERVED_KEYS = new Set(["channel", "updated_at"]);

function extractMetrics(data: Record<string, unknown>): Record<string, number | null> {
  // Nested format: { channel, updated_at, metrics: { ... } }
  if (data.metrics && typeof data.metrics === "object" && !Array.isArray(data.metrics)) {
    const nested = data.metrics as Record<string, unknown>;
    const result: Record<string, number | null> = {};
    for (const [key, value] of Object.entries(nested)) {
      if (typeof value === "number" || value === null) {
        result[key] = value as number | null;
      }
    }
    return result;
  }
  // Flat format: { channel, updated_at, total_signups: 99, ... }
  const result: Record<string, number | null> = {};
  for (const [key, value] of Object.entries(data)) {
    if (RESERVED_KEYS.has(key)) continue;
    if (typeof value === "number" || value === null) {
      result[key] = value as number | null;
    }
  }
  return result;
}

export function getMetrics(project: string): MetricsData {
  const metricsDir = path.join(getProjectsDir(), project, "metrics");
  const channels: Record<string, ChannelMetricsData> = {};

  if (!fs.existsSync(metricsDir)) return { channels };

  const files = fs.readdirSync(metricsDir).filter((f) => f.endsWith(".md"));
  for (const file of files) {
    const name = path.basename(file, ".md");
    if (name === "kpi-targets") continue;
    const raw = fs.readFileSync(path.join(metricsDir, file), "utf-8");
    const { data } = matter(raw);
    channels[name] = {
      channel: data.channel || name,
      updated_at: data.updated_at || "",
      metrics: extractMetrics(data as Record<string, unknown>),
    };
  }

  return { channels };
}

export function getKPIs(project: string): KPIData[] {
  const config = getConfig(project);
  const metrics = getMetrics(project);
  const cadence = getCadence(project);
  const targets = config.targets.month_1 || {};

  const kpis: KPIData[] = [];

  // Signups — field is "total_signups" in supabase connector output
  const signups = metrics.channels.supabase?.metrics.total_signups ?? 0;
  const signupTarget = targets.signups || 100;
  kpis.push({
    label: "Signups",
    value: signups,
    target: signupTarget,
    status: getStatus(signups, signupTarget),
  });

  // Free → Paid %
  const convRate = (metrics.channels.supabase?.metrics.free_to_paid_pct ?? 0) * 100;
  const convTarget = (targets.free_to_paid_pct || 0.05) * 100;
  kpis.push({
    label: "Free→Paid",
    value: convRate,
    target: convTarget,
    unit: "%",
    status: getStatus(convRate, convTarget),
  });

  // Cadence score
  const totalDone =
    cadence.linkedin.posts_done + cadence.reddit.comments_done;
  const totalTarget =
    cadence.linkedin.posts_target + cadence.reddit.comments_target;
  const cadenceScore =
    totalTarget > 0 ? Math.round((totalDone / totalTarget) * 100) : 0;
  kpis.push({
    label: "Cadence",
    value: cadenceScore,
    target: 100,
    unit: "%",
    status: cadenceScore >= 80 ? "active" : cadenceScore >= 50 ? "pending" : "critical",
  });

  // Branded search — file is "search-console.md" or "google_search_console.md"
  const branded =
    metrics.channels["search-console"]?.metrics.branded_search_volume
    ?? metrics.channels["google_search_console"]?.metrics.branded_search_volume
    ?? 0;
  const brandedTarget = targets.branded_search_volume || 50;
  kpis.push({
    label: "Branded",
    value: branded,
    target: brandedTarget,
    status: branded === 0 ? "pending" : getStatus(branded, brandedTarget),
  });

  return kpis;
}

function getStatus(value: number, target: number): StatusLevel {
  const ratio = target > 0 ? value / target : 0;
  if (ratio >= 0.9) return "active";
  if (ratio >= 0.5) return "pending";
  return "critical";
}

export function moveCard(
  project: string,
  cardId: string,
  fromColumn: Column,
  toColumn: Column
): void {
  const boardDir = path.join(getProjectsDir(), project, "board");
  const fromPath = path.join(boardDir, fromColumn, `${cardId}.md`);
  const toDir = path.join(boardDir, toColumn);
  const toPath = path.join(toDir, `${cardId}.md`);

  if (!fs.existsSync(fromPath)) return;
  if (!fs.existsSync(toDir)) fs.mkdirSync(toDir, { recursive: true });

  // Read, update frontmatter, write to new location
  const raw = fs.readFileSync(fromPath, "utf-8");
  const { data, content } = matter(raw);
  data.column = toColumn;
  const updated = matter.stringify(content, data);
  fs.writeFileSync(toPath, updated);
  fs.unlinkSync(fromPath);
}

export function getSparklineData(project: string): Record<string, Record<string, number[]>> {
  const snapshotsDir = path.join(getProjectsDir(), project, "metrics", "snapshots");
  const result: Record<string, Record<string, number[]>> = {};

  if (!fs.existsSync(snapshotsDir)) return result;

  const files = fs.readdirSync(snapshotsDir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .slice(-8); // last 8 snapshots

  if (files.length < 2) return result;

  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(snapshotsDir, file), "utf-8");
      const { data } = matter(raw);
      const metricsMap = (data.metrics || {}) as Record<string, Record<string, number | null>>;

      for (const [channel, metrics] of Object.entries(metricsMap)) {
        if (!result[channel]) result[channel] = {};
        for (const [key, value] of Object.entries(metrics)) {
          if (typeof value !== "number") continue;
          if (!result[channel][key]) result[channel][key] = [];
          result[channel][key].push(value);
        }
      }
    } catch {
      // skip corrupt snapshot
    }
  }

  return result;
}

// --- New data loaders for multi-page dashboard ---

export function getChannelHistory(project: string, channel: string, limit = 14): SnapshotSeries {
  const snapshotsDir = path.join(getProjectsDir(), project, "metrics", "snapshots");
  const result: SnapshotSeries = { channel, dates: [], metrics: {} };

  if (!fs.existsSync(snapshotsDir)) return result;

  const files = fs.readdirSync(snapshotsDir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .slice(-limit);

  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(snapshotsDir, file), "utf-8");
      const { data } = matter(raw);
      const date = path.basename(file, ".md");
      const metricsMap = (data.metrics || {}) as Record<string, Record<string, number | null>>;
      const channelMetrics = metricsMap[channel];
      if (!channelMetrics) continue;

      result.dates.push(date);
      for (const [key, value] of Object.entries(channelMetrics)) {
        if (typeof value !== "number") continue;
        if (!result.metrics[key]) result.metrics[key] = [];
        result.metrics[key].push(value);
      }
    } catch {
      // skip corrupt snapshot
    }
  }

  return result;
}

export function getResearchHistory(project: string): ResearchEntry[] {
  const researchDir = path.join(getProjectsDir(), project, "research");
  if (!fs.existsSync(researchDir)) return [];

  const files = fs.readdirSync(researchDir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .reverse();

  return files.map((file) => {
    const raw = fs.readFileSync(path.join(researchDir, file), "utf-8");
    const { data, content } = matter(raw);
    const findingsCount = (content.match(/^[-*]\s/gm) || []).length;
    return {
      date: path.basename(file, ".md"),
      filename: file,
      content,
      findingsCount,
      cardsCreated: data.cards_created ?? 0,
    };
  });
}

export function getFilteredCards(project: string, filters: CardFilters): CardData[] {
  const board = getBoard(project);
  const allCards: CardData[] = [];

  for (const col of COLUMNS) {
    if (filters.excludeColumn && col === filters.excludeColumn) continue;
    allCards.push(...board.columns[col]);
  }

  return allCards.filter((card) => {
    if (filters.channel) {
      const channels = Array.isArray(filters.channel) ? filters.channel : [filters.channel];
      if (!channels.includes(card.channel)) return false;
    }
    if (filters.type) {
      const types = Array.isArray(filters.type) ? filters.type : [filters.type];
      if (!types.includes(card.type)) return false;
    }
    if (filters.source && card.source !== filters.source) return false;
    if (filters.tags && filters.tags.length > 0) {
      if (!card.tags || !filters.tags.some((t) => card.tags!.includes(t))) return false;
    }
    return true;
  });
}

export function getAllCards(project: string): CardData[] {
  const board = getBoard(project);
  const allCards: CardData[] = [];
  for (const col of COLUMNS) {
    allCards.push(...board.columns[col]);
  }
  return allCards;
}

export function getFunnelData(project: string): FunnelData {
  const metrics = getMetrics(project);
  const googleAds = metrics.channels.google_ads?.metrics || {};
  const metaAds = metrics.channels.meta_ads?.metrics || {};
  const supabase = metrics.channels.supabase?.metrics || {};

  const impressions = (googleAds.google_ad_impressions ?? 0) + (metaAds.meta_ad_impressions ?? 0);
  const clicks = (googleAds.google_ad_clicks ?? 0) + (metaAds.meta_ad_clicks ?? 0);
  const signups = supabase.total_signups ?? 0;
  const trialing = supabase.trialing_subscriptions ?? 0;
  const paid = supabase.active_subscriptions ?? 0;

  const stages = [
    { name: "Impressions", value: impressions, conversionRate: 100 },
    { name: "Clicks", value: clicks, conversionRate: impressions > 0 ? (clicks / impressions) * 100 : 0 },
    { name: "Signups", value: signups, conversionRate: clicks > 0 ? (signups / clicks) * 100 : 0 },
    { name: "Trial", value: trialing, conversionRate: signups > 0 ? (trialing / signups) * 100 : 0 },
    { name: "Paid", value: paid, conversionRate: trialing > 0 ? (paid / trialing) * 100 : 0 },
  ];

  return { stages };
}

export function getWeeklyDeltas(project: string): WeeklyDelta[] {
  const snapshotsDir = path.join(getProjectsDir(), project, "metrics", "snapshots");
  if (!fs.existsSync(snapshotsDir)) return [];

  const files = fs.readdirSync(snapshotsDir)
    .filter((f) => f.endsWith(".md"))
    .sort();

  if (files.length < 2) return [];

  const readSnapshot = (file: string) => {
    const raw = fs.readFileSync(path.join(snapshotsDir, file), "utf-8");
    const { data } = matter(raw);
    return (data.metrics || {}) as Record<string, Record<string, number | null>>;
  };

  const current = readSnapshot(files[files.length - 1]);
  const previous = readSnapshot(files[files.length - 2]);

  const deltas: WeeklyDelta[] = [];
  const channelDisplayNames: Record<string, string> = {
    linkedin: "LinkedIn",
    reddit: "Reddit",
    "search-console": "SEO",
    google_ads: "Google Ads",
    meta_ads: "Meta Ads",
    stripe: "Stripe",
    supabase: "Supabase",
  };

  const primaryMetrics: Record<string, string> = {
    linkedin: "impressions",
    reddit: "karma",
    "search-console": "organic_clicks",
    google_ads: "google_ad_conversions",
    meta_ads: "meta_ad_conversions",
    stripe: "mrr",
    supabase: "total_signups",
  };

  for (const [ch, metricKey] of Object.entries(primaryMetrics)) {
    const curr = current[ch]?.[metricKey];
    const prev = previous[ch]?.[metricKey];
    if (typeof curr !== "number") continue;
    const prevVal = typeof prev === "number" ? prev : 0;
    const delta = curr - prevVal;
    const deltaPercent = prevVal > 0 ? (delta / prevVal) * 100 : 0;

    deltas.push({
      channel: channelDisplayNames[ch] ?? ch,
      metric: metricKey.replace(/_/g, " "),
      current: curr,
      previous: prevVal,
      delta,
      deltaPercent,
    });
  }

  return deltas;
}

export function getAlerts(project: string): Alert[] {
  const config = getConfig(project);
  const alertConfig = config.alerts;
  if (!alertConfig) return [];

  const metrics = getMetrics(project);
  const alerts: Alert[] = [];

  // Simple threshold-based alerts: metric_name: threshold
  for (const [key, threshold] of Object.entries(alertConfig)) {
    // Try to find this metric across all channels
    for (const [channelName, channelData] of Object.entries(metrics.channels)) {
      const value = channelData.metrics[key];
      if (typeof value !== "number") continue;
      // CPA metrics: alert if above threshold
      if (key.includes("cpa") && value > threshold) {
        alerts.push({ channel: channelName, metric: key, value, threshold, direction: "above", severity: "warning" });
      }
      // Other metrics: alert if below threshold
      else if (!key.includes("cpa") && value < threshold) {
        alerts.push({ channel: channelName, metric: key, value, threshold, direction: "below", severity: "warning" });
      }
    }
  }

  return alerts;
}

export function getCadenceWithStreak(project: string): CadenceWithStreak {
  const cadence = getCadence(project);
  const cadenceBase = path.join(getProjectsDir(), project, "cadence");
  let streak = 0;

  if (fs.existsSync(cadenceBase)) {
    const dirs = fs.readdirSync(cadenceBase, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort()
      .reverse();

    // Simple streak: count consecutive months with cadence data
    for (const dir of dirs) {
      const liFile = path.join(cadenceBase, dir, "linkedin.md");
      if (fs.existsSync(liFile)) {
        streak++;
      } else {
        break;
      }
    }
  }

  return {
    cadence,
    streak,
    weeklyHistory: [],
  };
}

export function getUGCBriefs(project: string): UGCBrief[] {
  const allCards = getAllCards(project);
  return allCards
    .filter((c) => c.type === "ugc" || c.channel === "ugc")
    .map((c) => ({
      id: c.id,
      title: c.title,
      creator: c.creator || c.creator_handle || "Unknown",
      type: (c.deliverable_type as UGCBrief["type"]) || "custom",
      approvalStatus: c.approval_status || "draft",
      channel: c.channel === "ugc" ? undefined : c.channel,
      dueDate: c.due_date || c.target_date,
      paperArtboard: c.paper_artboard ?? undefined,
      assetUrl: c.asset_url ?? undefined,
      column: c.column,
    }));
}

export function getUGCPipelineStats(project: string): UGCPipelineStats {
  const briefs = getUGCBriefs(project);
  const stats: UGCPipelineStats = {
    draft: 0,
    submitted: 0,
    approved: 0,
    rejected: 0,
    total: briefs.length,
    byType: {},
    byCreator: {},
  };

  for (const brief of briefs) {
    stats[brief.approvalStatus]++;
    stats.byType[brief.type] = (stats.byType[brief.type] || 0) + 1;
    if (!stats.byCreator[brief.creator]) {
      stats.byCreator[brief.creator] = { total: 0, approved: 0 };
    }
    stats.byCreator[brief.creator].total++;
    if (brief.approvalStatus === "approved") {
      stats.byCreator[brief.creator].approved++;
    }
  }

  return stats;
}

export function getContentPipelineStats(project: string): ContentPipelineStats {
  const board = getBoard(project);
  const allPosts: CardData[] = [];
  for (const col of COLUMNS) {
    allPosts.push(...board.columns[col].filter((c) => c.type === "post"));
  }

  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  return {
    scheduled: board.columns.backlog.filter((c) => c.type === "post").length,
    preparing: board.columns.preparing.filter((c) => c.type === "post").length,
    liveThisWeek: board.columns.live.filter((c) => c.type === "post" && new Date(c.created) >= weekStart).length,
    doneThisMonth: board.columns.done.filter((c) => c.type === "post" && new Date(c.created) >= monthStart).length,
  };
}

// Helper to build chart data from snapshot series
export function buildChartData(
  series: SnapshotSeries,
  metricKeys: string[]
): Record<string, unknown>[] {
  return series.dates.map((date, i) => {
    const point: Record<string, unknown> = { date: date.slice(5) }; // MM-DD format
    for (const key of metricKeys) {
      point[key] = series.metrics[key]?.[i] ?? 0;
    }
    return point;
  });
}
