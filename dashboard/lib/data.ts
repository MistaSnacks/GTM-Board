import { supabase } from "./supabase";
import { getConfig } from "./config";
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
  AgentTaskColumn,
  AgentTaskData,
  AgentBoardData,
} from "./types";

const COLUMNS: Column[] = ["backlog", "preparing", "live", "measuring", "done"];

// --- Helper: resolve project slug to project_id ---

async function getProjectId(project: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("gtm_projects")
    .select("id")
    .eq("slug", project)
    .single();

  if (error || !data) return null;
  return data.id;
}

// --- Helper: map a gtm_cards row to CardData ---

function rowToCard(row: Record<string, unknown>): CardData {
  const meta = (row.metadata || {}) as Record<string, unknown>;
  return {
    id: row.slug as string,
    title: (row.title as string) || "Untitled",
    type: (row.type as CardData["type"]) || "post",
    channel: (row.channel as CardData["channel"]) || "other",
    column: (row.column_name as Column) || "backlog",
    created: meta.created ? String(meta.created) : "",
    target_date: meta.target_date ? String(meta.target_date) : undefined,
    description: meta.description ? String(meta.description) : undefined,
    tags: meta.tags as string[] | undefined,
    source: meta.source as CardData["source"],
    metrics: meta.metrics as Record<string, number | null> | undefined,
    paper_artboard: meta.paper_artboard as string | null | undefined,
    body: (row.body as string) || "",
    creator: meta.creator ? String(meta.creator) : undefined,
    creator_handle: meta.creator_handle ? String(meta.creator_handle) : undefined,
    deliverable_type: meta.deliverable_type ? String(meta.deliverable_type) : undefined,
    approval_status: meta.approval_status as CardData["approval_status"],
    due_date: meta.due_date ? String(meta.due_date) : undefined,
    asset_url: meta.asset_url as string | null | undefined,
  };
}

// --- Board ---

export async function getBoard(project: string): Promise<BoardData> {
  const projectId = await getProjectId(project);
  const columns: BoardData["columns"] = {
    backlog: [],
    preparing: [],
    live: [],
    measuring: [],
    done: [],
  };

  if (!projectId) return { columns };

  const { data, error } = await supabase
    .from("gtm_cards")
    .select("*")
    .eq("project_id", projectId)
    .eq("board", "marketing")
    .order("created_at", { ascending: false });

  if (error || !data) return { columns };

  for (const row of data) {
    const col = (row.column_name as Column) || "backlog";
    if (COLUMNS.includes(col)) {
      columns[col].push(rowToCard(row));
    }
  }

  return { columns };
}

// --- Cadence ---

export async function getCadence(project: string): Promise<CadenceData> {
  const [config, projectId] = await Promise.all([
    getConfig(project),
    getProjectId(project),
  ]);

  const now = new Date();
  const today = now.getDay();

  // Build LinkedIn post schedule for the week
  const schedule = config.cadence.linkedin.schedule;
  const scheduleDays = Object.keys(schedule);
  const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

  const posts: CadenceDay[] = scheduleDays.map((day) => {
    const dayIndex = dayNames.indexOf(day);
    return {
      day: day.charAt(0).toUpperCase(),
      type: schedule[day],
      done: dayIndex < today,
    };
  });

  let linkedinComments = 0;
  let redditComments = 0;
  let linkedinPostsDone = 0;
  let redditPostsDone = 0;

  if (projectId) {
    // Get current week start (Sunday)
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    const weekStartStr = weekStart.toISOString().slice(0, 10);

    const { data: logs } = await supabase
      .from("gtm_cadence_logs")
      .select("platform, log_type, count, details")
      .eq("project_id", projectId)
      .eq("week_start", weekStartStr);

    if (logs) {
      for (const log of logs) {
        if (log.platform === "linkedin") {
          if (log.log_type === "posts") {
            linkedinPostsDone = log.count ?? 0;
            // Update post done status from details
            const details = log.details as Record<string, unknown> | null;
            if (details?.posts_completed && Array.isArray(details.posts_completed)) {
              for (const completed of details.posts_completed) {
                const post = posts.find(
                  (p) => p.day === String(completed).charAt(0).toUpperCase()
                );
                if (post) post.done = true;
              }
            }
          }
          if (log.log_type === "comments") linkedinComments = log.count ?? 0;
        }
        if (log.platform === "reddit") {
          if (log.log_type === "posts") redditPostsDone = log.count ?? 0;
          if (log.log_type === "comments") redditComments = log.count ?? 0;
        }
      }
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

// --- Metrics ---

export async function getMetrics(project: string): Promise<MetricsData> {
  const projectId = await getProjectId(project);
  const channels: Record<string, ChannelMetricsData> = {};

  if (!projectId) return { channels };

  const { data, error } = await supabase
    .from("gtm_metrics")
    .select("channel, data, fetched_at")
    .eq("project_id", projectId);

  if (error || !data) return { channels };

  for (const row of data) {
    const metricsData = (row.data || {}) as Record<string, number | null>;
    channels[row.channel] = {
      channel: row.channel,
      updated_at: row.fetched_at || "",
      metrics: metricsData,
    };
  }

  return { channels };
}

// --- KPIs ---

function getStatus(value: number, target: number): StatusLevel {
  const ratio = target > 0 ? value / target : 0;
  if (ratio >= 0.9) return "active";
  if (ratio >= 0.5) return "pending";
  return "critical";
}

export async function getKPIs(project: string): Promise<KPIData[]> {
  const [config, metrics, cadence] = await Promise.all([
    getConfig(project),
    getMetrics(project),
    getCadence(project),
  ]);

  const targets = config.targets.month_1 || {};
  const kpis: KPIData[] = [];

  // Signups
  const signups = metrics.channels.supabase?.metrics.total_signups ?? 0;
  const signupTarget = targets.signups || 100;
  kpis.push({
    label: "Signups",
    value: signups,
    target: signupTarget,
    status: getStatus(signups, signupTarget),
  });

  // Free -> Paid %
  const convRate = (metrics.channels.supabase?.metrics.free_to_paid_pct ?? 0) * 100;
  const convTarget = (targets.free_to_paid_pct || 0.05) * 100;
  kpis.push({
    label: "Free\u2192Paid",
    value: convRate,
    target: convTarget,
    unit: "%",
    status: getStatus(convRate, convTarget),
  });

  // Cadence score
  const totalDone = cadence.linkedin.posts_done + cadence.reddit.comments_done;
  const totalTarget = cadence.linkedin.posts_target + cadence.reddit.comments_target;
  const cadenceScore = totalTarget > 0 ? Math.round((totalDone / totalTarget) * 100) : 0;
  kpis.push({
    label: "Cadence",
    value: cadenceScore,
    target: 100,
    unit: "%",
    status: cadenceScore >= 80 ? "active" : cadenceScore >= 50 ? "pending" : "critical",
  });

  // Branded search
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

// --- Move Card ---

export async function moveCard(
  project: string,
  cardId: string,
  _fromColumn: Column,
  toColumn: Column
): Promise<void> {
  const projectId = await getProjectId(project);
  if (!projectId) return;

  await supabase
    .from("gtm_cards")
    .update({ column_name: toColumn, updated_at: new Date().toISOString() })
    .eq("project_id", projectId)
    .eq("slug", cardId);
}

// --- Sparkline Data ---

export async function getSparklineData(project: string): Promise<Record<string, Record<string, number[]>>> {
  const projectId = await getProjectId(project);
  const result: Record<string, Record<string, number[]>> = {};

  if (!projectId) return result;

  const { data, error } = await supabase
    .from("gtm_snapshots")
    .select("data")
    .eq("project_id", projectId)
    .order("snapshot_date", { ascending: true })
    .limit(8);

  if (error || !data || data.length < 2) return result;

  for (const row of data) {
    const metricsMap = (row.data?.metrics || row.data || {}) as Record<string, Record<string, number | null>>;

    for (const [channel, metrics] of Object.entries(metricsMap)) {
      if (typeof metrics !== "object" || metrics === null) continue;
      if (!result[channel]) result[channel] = {};
      for (const [key, value] of Object.entries(metrics)) {
        if (typeof value !== "number") continue;
        if (!result[channel][key]) result[channel][key] = [];
        result[channel][key].push(value);
      }
    }
  }

  return result;
}

// --- Channel History ---

export async function getChannelHistory(project: string, channel: string, limit = 14): Promise<SnapshotSeries> {
  const projectId = await getProjectId(project);
  const result: SnapshotSeries = { channel, dates: [], metrics: {} };

  if (!projectId) return result;

  const { data, error } = await supabase
    .from("gtm_snapshots")
    .select("snapshot_date, data")
    .eq("project_id", projectId)
    .order("snapshot_date", { ascending: true })
    .limit(limit);

  if (error || !data) return result;

  for (const row of data) {
    const metricsMap = (row.data?.metrics || row.data || {}) as Record<string, Record<string, number | null>>;
    const channelMetrics = metricsMap[channel];
    if (!channelMetrics) continue;

    result.dates.push(row.snapshot_date);
    for (const [key, value] of Object.entries(channelMetrics)) {
      if (typeof value !== "number") continue;
      if (!result.metrics[key]) result.metrics[key] = [];
      result.metrics[key].push(value);
    }
  }

  return result;
}

// --- Research History ---

export async function getResearchHistory(project: string): Promise<ResearchEntry[]> {
  const projectId = await getProjectId(project);
  if (!projectId) return [];

  const { data, error } = await supabase
    .from("gtm_research_runs")
    .select("run_type, findings, cards_created, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  return data.map((row) => {
    const findings = row.findings as Record<string, unknown> | unknown[] | null;
    const findingsCount = Array.isArray(findings) ? findings.length : 0;
    const cardsCreated = Array.isArray(row.cards_created) ? row.cards_created.length : 0;
    const content = Array.isArray(findings)
      ? findings.map((f: unknown) => (typeof f === "string" ? `- ${f}` : `- ${JSON.stringify(f)}`)).join("\n")
      : JSON.stringify(findings || {});

    return {
      date: row.created_at ? row.created_at.slice(0, 10) : "",
      filename: `${row.run_type || "research"}-${row.created_at?.slice(0, 10) || "unknown"}`,
      content,
      findingsCount,
      cardsCreated,
    };
  });
}

// --- Filtered Cards ---

export async function getFilteredCards(project: string, filters: CardFilters): Promise<CardData[]> {
  const projectId = await getProjectId(project);
  if (!projectId) return [];

  let query = supabase
    .from("gtm_cards")
    .select("*")
    .eq("project_id", projectId);

  if (filters.excludeColumn) {
    query = query.neq("column_name", filters.excludeColumn);
  }

  if (filters.channel) {
    const channels = Array.isArray(filters.channel) ? filters.channel : [filters.channel];
    query = query.in("channel", channels);
  }

  if (filters.type) {
    const types = Array.isArray(filters.type) ? filters.type : [filters.type];
    query = query.in("type", types);
  }

  const { data, error } = await query;
  if (error || !data) return [];

  let cards = data.map(rowToCard);

  // Apply filters that require metadata inspection (not possible in SQL)
  if (filters.source) {
    cards = cards.filter((c) => c.source === filters.source);
  }
  if (filters.tags && filters.tags.length > 0) {
    cards = cards.filter(
      (c) => c.tags && filters.tags!.some((t) => c.tags!.includes(t))
    );
  }

  return cards;
}

// --- All Cards ---

export async function getAllCards(project: string): Promise<CardData[]> {
  const projectId = await getProjectId(project);
  if (!projectId) return [];

  const { data, error } = await supabase
    .from("gtm_cards")
    .select("*")
    .eq("project_id", projectId);

  if (error || !data) return [];
  return data.map(rowToCard);
}

// --- Funnel Data ---

export async function getFunnelData(project: string): Promise<FunnelData> {
  const metrics = await getMetrics(project);
  const googleAds = metrics.channels.google_ads?.metrics || {};
  const metaAds = metrics.channels.meta_ads?.metrics || {};
  const sb = metrics.channels.supabase?.metrics || {};

  const impressions = (googleAds.google_ad_impressions ?? 0) + (metaAds.meta_ad_impressions ?? 0);
  const clicks = (googleAds.google_ad_clicks ?? 0) + (metaAds.meta_ad_clicks ?? 0);
  const signups = sb.total_signups ?? 0;
  const trialing = sb.trialing_subscriptions ?? 0;
  const paid = sb.active_subscriptions ?? 0;

  const stages = [
    { name: "Impressions", value: impressions, conversionRate: 100 },
    { name: "Clicks", value: clicks, conversionRate: impressions > 0 ? (clicks / impressions) * 100 : 0 },
    { name: "Signups", value: signups, conversionRate: clicks > 0 ? (signups / clicks) * 100 : 0 },
    { name: "Trial", value: trialing, conversionRate: signups > 0 ? (trialing / signups) * 100 : 0 },
    { name: "Paid", value: paid, conversionRate: trialing > 0 ? (paid / trialing) * 100 : 0 },
  ];

  return { stages };
}

// --- Weekly Deltas ---

export async function getWeeklyDeltas(project: string): Promise<WeeklyDelta[]> {
  const projectId = await getProjectId(project);
  if (!projectId) return [];

  const { data, error } = await supabase
    .from("gtm_snapshots")
    .select("data")
    .eq("project_id", projectId)
    .order("snapshot_date", { ascending: false })
    .limit(2);

  if (error || !data || data.length < 2) return [];

  const current = (data[0].data?.metrics || data[0].data || {}) as Record<string, Record<string, number | null>>;
  const previous = (data[1].data?.metrics || data[1].data || {}) as Record<string, Record<string, number | null>>;

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

  const deltas: WeeklyDelta[] = [];

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

// --- Alerts ---

export async function getAlerts(project: string): Promise<Alert[]> {
  const [config, metrics] = await Promise.all([
    getConfig(project),
    getMetrics(project),
  ]);

  const alertConfig = config.alerts;
  if (!alertConfig) return [];

  const alerts: Alert[] = [];

  for (const [key, threshold] of Object.entries(alertConfig)) {
    for (const [channelName, channelData] of Object.entries(metrics.channels)) {
      const value = channelData.metrics[key];
      if (typeof value !== "number") continue;
      if (key.includes("cpa") && value > threshold) {
        alerts.push({ channel: channelName, metric: key, value, threshold, direction: "above", severity: "warning" });
      } else if (!key.includes("cpa") && value < threshold) {
        alerts.push({ channel: channelName, metric: key, value, threshold, direction: "below", severity: "warning" });
      }
    }
  }

  return alerts;
}

// --- Cadence With Streak ---

export async function getCadenceWithStreak(project: string): Promise<CadenceWithStreak> {
  const [cadence, projectId] = await Promise.all([
    getCadence(project),
    getProjectId(project),
  ]);

  let streak = 0;

  if (projectId) {
    // Count consecutive weeks with cadence logs, most recent first
    const { data } = await supabase
      .from("gtm_cadence_logs")
      .select("week_start")
      .eq("project_id", projectId)
      .eq("platform", "linkedin")
      .eq("log_type", "posts")
      .order("week_start", { ascending: false });

    if (data && data.length > 0) {
      // Count consecutive months by checking distinct month values
      const months = new Set(data.map((r) => (r.week_start as string).slice(0, 7)));
      const sortedMonths = Array.from(months).sort().reverse();

      for (let i = 0; i < sortedMonths.length; i++) {
        if (i === 0) {
          streak++;
          continue;
        }
        // Check if consecutive month
        const [prevY, prevM] = sortedMonths[i - 1].split("-").map(Number);
        const [curY, curM] = sortedMonths[i].split("-").map(Number);
        const expectedMonth = prevM === 1 ? 12 : prevM - 1;
        const expectedYear = prevM === 1 ? prevY - 1 : prevY;
        if (curY === expectedYear && curM === expectedMonth) {
          streak++;
        } else {
          break;
        }
      }
    }
  }

  return {
    cadence,
    streak,
    weeklyHistory: [],
  };
}

// --- UGC Briefs ---

export async function getUGCBriefs(project: string): Promise<UGCBrief[]> {
  const projectId = await getProjectId(project);
  if (!projectId) return [];

  const { data, error } = await supabase
    .from("gtm_cards")
    .select("*")
    .eq("project_id", projectId)
    .or("type.eq.ugc,channel.eq.ugc");

  if (error || !data) return [];

  return data.map((row) => {
    const card = rowToCard(row);
    return {
      id: card.id,
      title: card.title,
      creator: card.creator || card.creator_handle || "Unknown",
      type: (card.deliverable_type as UGCBrief["type"]) || "custom",
      approvalStatus: card.approval_status || "draft",
      channel: card.channel === "ugc" ? undefined : card.channel,
      dueDate: card.due_date || card.target_date,
      paperArtboard: card.paper_artboard ?? undefined,
      assetUrl: card.asset_url ?? undefined,
      column: card.column,
    };
  });
}

// --- UGC Pipeline Stats ---

export async function getUGCPipelineStats(project: string): Promise<UGCPipelineStats> {
  const briefs = await getUGCBriefs(project);
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

// --- Content Pipeline Stats ---

export async function getContentPipelineStats(project: string): Promise<ContentPipelineStats> {
  const board = await getBoard(project);

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

// --- Chart Data (pure function, no change needed) ---

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

// --- Agent Board ---

const AGENT_COLUMNS: AgentTaskColumn[] = ["queued", "in_progress", "blocked", "review", "done"];

// DB uses marketing column names; map to/from agent column names
const DB_TO_AGENT_COLUMN: Record<string, AgentTaskColumn> = {
  backlog: "queued",
  preparing: "in_progress",
  live: "blocked",
  measuring: "review",
  done: "done",
};

const AGENT_TO_DB_COLUMN: Record<AgentTaskColumn, string> = {
  queued: "backlog",
  in_progress: "preparing",
  blocked: "live",
  review: "measuring",
  done: "done",
};

function rowToAgentTask(row: Record<string, unknown>): AgentTaskData {
  const meta = (row.metadata || {}) as Record<string, unknown>;
  const details = (row.gtm_agent_task_details as Record<string, unknown> | null) ?? {};
  const dbColumn = (row.column_name as string) || "backlog";

  return {
    id: row.slug as string,
    card_id: row.id as string,
    title: (row.title as string) || "Untitled",
    column: DB_TO_AGENT_COLUMN[dbColumn] || "queued",
    body: (row.body as string) || "",
    assigned_agent: (details.assigned_agent as string) ?? null,
    priority: (details.priority as AgentTaskData["priority"]) || "medium",
    depends_on: (details.depends_on as string[]) ?? [],
    output: (details.output as Record<string, unknown>) ?? null,
    error: (details.error as string) ?? null,
    started_at: (details.started_at as string) ?? null,
    completed_at: (details.completed_at as string) ?? null,
    retries: (details.retries as number) ?? 0,
    tags: (meta.tags as string[]) ?? [],
    created_at: (row.created_at as string) || "",
    updated_at: (row.updated_at as string) || "",
  };
}

export async function getAgentBoard(project: string): Promise<AgentBoardData> {
  const projectId = await getProjectId(project);
  const columns: AgentBoardData["columns"] = {
    queued: [],
    in_progress: [],
    blocked: [],
    review: [],
    done: [],
  };

  if (!projectId) return { columns };

  const { data, error } = await supabase
    .from("gtm_cards")
    .select("*, gtm_agent_task_details(*)")
    .eq("project_id", projectId)
    .eq("board", "agent-tasks")
    .order("created_at", { ascending: false });

  if (error || !data) return { columns };

  for (const row of data) {
    const task = rowToAgentTask(row);
    if (AGENT_COLUMNS.includes(task.column)) {
      columns[task.column].push(task);
    }
  }

  return { columns };
}

export async function moveAgentTask(
  project: string,
  taskSlug: string,
  _fromColumn: AgentTaskColumn,
  toColumn: AgentTaskColumn
): Promise<void> {
  const projectId = await getProjectId(project);
  if (!projectId) return;

  const dbColumn = AGENT_TO_DB_COLUMN[toColumn];

  await supabase
    .from("gtm_cards")
    .update({ column_name: dbColumn, updated_at: new Date().toISOString() })
    .eq("project_id", projectId)
    .eq("slug", taskSlug);
}
