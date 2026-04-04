import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { createServer } from "node:http";

import { loadProjectConfig, resolveProject } from "./lib/config.ts";
import { addCard, moveCard, updateCard, listCards, getCard, setCardDescription } from "./tools/board.ts";
import { createProject, listProjectsInfo, setTargets } from "./tools/project.ts";
import {
  status,
  refreshChannel,
  refreshAll,
  getKpis,
  performanceSummary,
  snapshot,
} from "./tools/metrics.ts";
import { logPost, logComment, cadenceStatus, cadenceStreak } from "./tools/cadence.ts";
import {
  researchRun,
  competitorCheck,
  findOpportunities,
  researchHistory,
} from "./tools/research.ts";
import { alertCheck } from "./tools/alerts.ts";
import { geoScore, geoTrend } from "./tools/geo.ts";
import { trendAnalysis, funnelReport, dailyBrief } from "./tools/analytics.ts";
import { createUgcBrief, listUgcBriefs, approveContent } from "./tools/ugc.ts";
import { linkCreative } from "./tools/creative.ts";
import { createAgentTask, updateAgentTask, listAgentTasks, getAgentTask } from "./tools/agent-tasks.ts";
import { schedulePost, listScheduled, publishNow, deletePost, listAccounts, listProfiles } from "./connectors/zernio.ts";
import {
  createMetaCampaign,
  createMetaAdSet,
  createMetaAd,
  updateMetaCampaign,
  listMetaCampaigns,
} from "./connectors/meta-ads-write.ts";
import {
  createGoogleCampaign,
  createGoogleAdGroup,
  createGoogleAd,
  updateGoogleCampaign,
  listGoogleCampaigns,
} from "./connectors/google-ads-write.ts";

const server = new McpServer({
  name: "gtm-board",
  version: "0.1.0",
});

// ── Board tools ──

server.tool(
  "gtm_add_card",
  "Add a new card to the GTM kanban board",
  {
    project: z.string().optional().describe("Project name (defaults to DEFAULT_PROJECT)"),
    title: z.string().describe("Card title"),
    column: z.enum(["backlog", "preparing", "live", "measuring", "done"]),
    type: z.enum(["ad", "post", "outreach", "seo", "initiative", "ugc"]),
    channel: z.enum(["meta", "google", "reddit", "linkedin", "seo", "email", "ugc", "other"]),
    details: z.string().optional().describe("Card body content (markdown)"),
    target_date: z.string().optional().describe("Target date YYYY-MM-DD"),
    tags: z.array(z.string()).optional().describe("Tags for filtering"),
  },
  async (params) => {
    const project = resolveProject(params.project);
    const result = await addCard({ ...params, project });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "gtm_move_card",
  "Move a card between kanban columns",
  {
    project: z.string().optional().describe("Project name (defaults to DEFAULT_PROJECT)"),
    card_id: z.string().describe("Card ID"),
    to_column: z.enum(["backlog", "preparing", "live", "measuring", "done"]),
  },
  async (params) => {
    const project = resolveProject(params.project);
    const result = await moveCard({ ...params, project });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "gtm_update_card",
  "Update card frontmatter (metrics, notes, tags, etc.)",
  {
    project: z.string().optional().describe("Project name (defaults to DEFAULT_PROJECT)"),
    card_id: z.string().describe("Card ID"),
    updates: z.string().describe("JSON-encoded object of fields to update in frontmatter"),
  },
  async (params) => {
    const project = resolveProject(params.project);
    const parsed = JSON.parse(params.updates) as Record<string, unknown>;
    const result = await updateCard({ project, card_id: params.card_id, updates: parsed });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "gtm_list_cards",
  "List kanban cards with optional filtering by column, type, or channel",
  {
    project: z.string().optional().describe("Project name (defaults to DEFAULT_PROJECT)"),
    column: z.enum(["backlog", "preparing", "live", "measuring", "done"]).optional(),
    type: z.enum(["ad", "post", "outreach", "seo", "initiative", "ugc"]).optional(),
    channel: z.enum(["meta", "google", "reddit", "linkedin", "seo", "email", "ugc", "other"]).optional(),
  },
  async (params) => {
    const project = resolveProject(params.project);
    const result = await listCards({ ...params, project });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "gtm_get_card",
  "Get full card content including frontmatter and markdown body",
  {
    project: z.string().optional().describe("Project name (defaults to DEFAULT_PROJECT)"),
    card_id: z.string().describe("Card ID"),
  },
  async (params) => {
    const project = resolveProject(params.project);
    const result = await getCard({ ...params, project });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "gtm_set_card_description",
  "Write or update a card's description (short summary shown on board) and optionally its full body content",
  {
    project: z.string().optional().describe("Project name (defaults to DEFAULT_PROJECT)"),
    card_id: z.string().describe("Card ID"),
    description: z.string().describe("Short description shown on the card (1-2 sentences)"),
    body: z.string().optional().describe("Full markdown body content (notes, checklist, details). If omitted, existing body is preserved."),
  },
  async (params) => {
    const project = resolveProject(params.project);
    const result = await setCardDescription({ ...params, project });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  }
);

// ── Project tools ──

server.tool(
  "gtm_list_projects",
  "List all GTM projects with summary stats",
  {
    _unused: z.string().optional().describe("No parameters needed"),
  },
  async () => {
    const result = await listProjectsInfo();
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "gtm_create_project",
  "Create a new GTM project with directory structure and default config",
  {
    name: z.string().describe("Project name (lowercase, no spaces)"),
    url: z.string().optional().describe("Project URL"),
    description: z.string().optional().describe("Project description"),
  },
  async (params) => {
    const result = await createProject(params);
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "gtm_set_targets",
  "Update KPI targets in project config",
  {
    project: z.string().optional().describe("Project name (defaults to DEFAULT_PROJECT)"),
    targets: z.string().describe("JSON-encoded targets object by period"),
  },
  async (params) => {
    const project = resolveProject(params.project);
    const parsed = JSON.parse(params.targets) as Record<string, Record<string, number>>;
    const result = await setTargets({ project, targets: parsed });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  }
);

// ── Metrics tools ──

server.tool(
  "gtm_status",
  "Single-call overview: board summary + cadence status + KPI snapshot",
  {
    project: z.string().optional().describe("Project name (defaults to DEFAULT_PROJECT)"),
  },
  async (params) => {
    const project = resolveProject(params.project);
    const result = await status({ project });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "gtm_refresh_channel",
  "Pull latest data from a specific connector",
  {
    project: z.string().optional().describe("Project name (defaults to DEFAULT_PROJECT)"),
    channel: z.string().describe("Channel/connector name"),
  },
  async (params) => {
    const project = resolveProject(params.project);
    const result = await refreshChannel({ project, channel: params.channel });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "gtm_refresh_all",
  "Refresh all enabled connectors for a project",
  {
    project: z.string().optional().describe("Project name (defaults to DEFAULT_PROJECT)"),
  },
  async (params) => {
    const project = resolveProject(params.project);
    const result = await refreshAll({ project });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "gtm_get_kpis",
  "Get current KPIs vs targets with status indicators",
  {
    project: z.string().optional().describe("Project name (defaults to DEFAULT_PROJECT)"),
    period: z.string().optional().describe("Target period (e.g. month_1, month_3)"),
  },
  async (params) => {
    const project = resolveProject(params.project);
    const result = await getKpis({ project, period: params.period });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "gtm_performance_summary",
  "Analyze what's working and what's not across all channels",
  {
    project: z.string().optional().describe("Project name (defaults to DEFAULT_PROJECT)"),
  },
  async (params) => {
    const project = resolveProject(params.project);
    const result = await performanceSummary({ project });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "gtm_snapshot",
  "Save weekly metrics snapshot for historical tracking",
  {
    project: z.string().optional().describe("Project name (defaults to DEFAULT_PROJECT)"),
  },
  async (params) => {
    const project = resolveProject(params.project);
    const result = await snapshot({ project });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  }
);

// ── Cadence tools ──

server.tool(
  "gtm_log_post",
  "Log a LinkedIn/Reddit post to track cadence",
  {
    project: z.string().optional().describe("Project name (defaults to DEFAULT_PROJECT)"),
    platform: z.string().describe("Platform (linkedin, reddit)"),
    type: z.string().describe("Post type (educational, narrative, hot-take, etc.)"),
    title: z.string().describe("Post title or description"),
    url: z.string().optional().describe("Post URL"),
    metrics: z.string().optional().describe("JSON-encoded initial metrics object"),
  },
  async (params) => {
    const project = resolveProject(params.project);
    const metrics = params.metrics ? JSON.parse(params.metrics) as Record<string, number> : undefined;
    const result = await logPost({ ...params, project, metrics });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "gtm_log_comment",
  "Log daily comment count for cadence tracking",
  {
    project: z.string().optional().describe("Project name (defaults to DEFAULT_PROJECT)"),
    platform: z.string().describe("Platform (linkedin, reddit)"),
    count: z.number().describe("Number of comments made"),
    subreddit: z.string().optional().describe("Subreddit name (for Reddit)"),
    notes: z.string().optional().describe("Notes about the comments"),
  },
  async (params) => {
    const project = resolveProject(params.project);
    const result = await logComment({ ...params, project });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "gtm_cadence_status",
  "Check content schedule adherence for current or specified week",
  {
    project: z.string().optional().describe("Project name (defaults to DEFAULT_PROJECT)"),
    week: z.string().optional().describe("Date within target week (YYYY-MM-DD)"),
  },
  async (params) => {
    const project = resolveProject(params.project);
    const result = await cadenceStatus({ ...params, project });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "gtm_cadence_streak",
  "Count consecutive weeks meeting all cadence minimums",
  {
    project: z.string().optional().describe("Project name (defaults to DEFAULT_PROJECT)"),
  },
  async (params) => {
    const project = resolveProject(params.project);
    const result = await cadenceStreak({ project });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  }
);

// ── Research tools ──

server.tool(
  "gtm_research_run",
  "Execute one full research cycle: refresh → analyze → recommend → create cards",
  {
    project: z.string().optional().describe("Project name (defaults to DEFAULT_PROJECT)"),
  },
  async (params) => {
    const project = resolveProject(params.project);
    const result = await researchRun({ project });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "gtm_competitor_check",
  "Get structured brief for competitor activity research",
  {
    project: z.string().optional().describe("Project name (defaults to DEFAULT_PROJECT)"),
    competitors: z.array(z.string()).optional().describe("Competitor names to check"),
  },
  async (params) => {
    const project = resolveProject(params.project);
    const result = await competitorCheck({ ...params, project });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "gtm_find_opportunities",
  "Search for engagement opportunities on Reddit/LinkedIn",
  {
    project: z.string().optional().describe("Project name (defaults to DEFAULT_PROJECT)"),
  },
  async (params) => {
    const project = resolveProject(params.project);
    const result = await findOpportunities({ project });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "gtm_research_history",
  "View past research runs and findings",
  {
    project: z.string().optional().describe("Project name (defaults to DEFAULT_PROJECT)"),
    limit: z.number().optional().describe("Max results to return (default 10)"),
  },
  async (params) => {
    const project = resolveProject(params.project);
    const result = await researchHistory({ project, limit: params.limit });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  }
);

// ── Alert tools ──

server.tool(
  "gtm_alert_check",
  "Check metrics against configured alert thresholds",
  {
    project: z.string().optional().describe("Project name (defaults to DEFAULT_PROJECT)"),
  },
  async (params) => {
    const project = resolveProject(params.project);
    const result = await alertCheck({ project });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  }
);

// ── GEO tools ──

server.tool(
  "gtm_geo_score",
  "Read or update GEO (Generative Engine Optimization) metrics",
  {
    project: z.string().optional().describe("Project name (defaults to DEFAULT_PROJECT)"),
    metrics: z.string().optional().describe("JSON-encoded flat key-value metrics object"),
  },
  async (params) => {
    const project = resolveProject(params.project);
    const parsed = params.metrics ? JSON.parse(params.metrics) as Record<string, number> : undefined;
    const result = await geoScore({ project, metrics: parsed });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "gtm_geo_trend",
  "Analyze GEO score trends across snapshots",
  {
    project: z.string().optional().describe("Project name (defaults to DEFAULT_PROJECT)"),
    periods: z.number().optional().describe("Number of periods to compare (default 4)"),
  },
  async (params) => {
    const project = resolveProject(params.project);
    const result = await geoTrend({ project, periods: params.periods });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  }
);

// ── Analytics tools ──

server.tool(
  "gtm_trend_analysis",
  "Analyze metric trends across snapshots with delta and pct change",
  {
    project: z.string().optional().describe("Project name (defaults to DEFAULT_PROJECT)"),
    periods: z.number().optional().describe("Number of periods to compare (default 4)"),
  },
  async (params) => {
    const project = resolveProject(params.project);
    const result = await trendAnalysis({ project, periods: params.periods });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "gtm_funnel_report",
  "Generate funnel report from impressions to paid with conversion rates",
  {
    project: z.string().optional().describe("Project name (defaults to DEFAULT_PROJECT)"),
  },
  async (params) => {
    const project = resolveProject(params.project);
    const result = await funnelReport({ project });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  }
);

// ── Daily brief ──

server.tool(
  "gtm_daily_brief",
  "Generate comprehensive daily brief: refresh metrics, check alerts, analyze trends, summarize board",
  {
    project: z.string().optional().describe("Project name (defaults to DEFAULT_PROJECT)"),
  },
  async (params) => {
    const project = resolveProject(params.project);
    const result = await dailyBrief({ project });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  }
);

// ── UGC tools ──

server.tool(
  "gtm_create_ugc_brief",
  "Create a UGC brief card for a creator",
  {
    project: z.string().optional().describe("Project name (defaults to DEFAULT_PROJECT)"),
    title: z.string().describe("Brief title"),
    creator: z.string().describe("Creator name"),
    creator_handle: z.string().optional().describe("Creator social handle"),
    deliverable_type: z.enum(["testimonial", "tutorial", "unboxing", "reaction", "custom"]).describe("Type of deliverable"),
    due_date: z.string().optional().describe("Due date YYYY-MM-DD"),
    description: z.string().optional().describe("Brief description (markdown)"),
    tags: z.array(z.string()).optional().describe("Tags for filtering"),
  },
  async (params) => {
    const project = resolveProject(params.project);
    const result = await createUgcBrief({ ...params, project });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "gtm_list_ugc_briefs",
  "List UGC brief cards with optional filtering",
  {
    project: z.string().optional().describe("Project name (defaults to DEFAULT_PROJECT)"),
    approval_status: z.enum(["draft", "submitted", "approved", "rejected"]).optional().describe("Filter by approval status"),
    creator: z.string().optional().describe("Filter by creator name"),
  },
  async (params) => {
    const project = resolveProject(params.project);
    const result = await listUgcBriefs({ project, approval_status: params.approval_status, creator: params.creator });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "gtm_approve_content",
  "Approve or reject UGC content",
  {
    project: z.string().optional().describe("Project name (defaults to DEFAULT_PROJECT)"),
    card_id: z.string().describe("Card ID"),
    status: z.enum(["approved", "rejected"]).describe("Approval decision"),
    asset_url: z.string().optional().describe("URL to the delivered asset"),
    notes: z.string().optional().describe("Feedback or rejection notes"),
  },
  async (params) => {
    const project = resolveProject(params.project);
    const result = await approveContent({ project, card_id: params.card_id, status: params.status, asset_url: params.asset_url, notes: params.notes });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  }
);

// ── Creative tools ──

server.tool(
  "gtm_link_creative",
  "Link a Paper artboard and creative assets to a card",
  {
    project: z.string().optional().describe("Project name (defaults to DEFAULT_PROJECT)"),
    card_id: z.string().describe("Card ID"),
    artboard_id: z.string().describe("Paper artboard ID"),
    formats: z.array(z.string()).optional().describe("Creative formats (e.g., story, feed, banner)"),
    copy: z.string().optional().describe("Ad/post copy text"),
    creative_status: z.enum(["draft", "approved", "distributed"]).optional().describe("Creative status"),
  },
  async (params) => {
    const project = resolveProject(params.project);
    const result = await linkCreative({ project, card_id: params.card_id, artboard_id: params.artboard_id, formats: params.formats, copy: params.copy, creative_status: params.creative_status });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  }
);

// ── Agent Tasks tools ──

server.tool(
  "gtm_create_agent_task",
  "Create a task on the agent-tasks board with priority, assignment, and dependencies",
  {
    project: z.string().optional().describe("Project name (defaults to DEFAULT_PROJECT)"),
    title: z.string().describe("Task title"),
    assigned_agent: z.string().optional().describe("Agent name to assign (e.g. 'research-agent', 'content-agent')"),
    priority: z.enum(["critical", "high", "medium", "low"]).optional().describe("Task priority (default medium)"),
    column: z.enum(["backlog", "preparing", "live", "measuring", "done"]).optional().describe("Initial column (default backlog)"),
    depends_on: z.array(z.string()).optional().describe("Array of task slugs this depends on"),
    details: z.string().optional().describe("Task body content (markdown)"),
    tags: z.array(z.string()).optional().describe("Tags for filtering"),
  },
  async (params) => {
    const project = resolveProject(params.project);
    const result = await createAgentTask({ ...params, project });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "gtm_update_agent_task",
  "Update an agent task — change status, assign agent, record output/errors, or move columns",
  {
    project: z.string().optional().describe("Project name (defaults to DEFAULT_PROJECT)"),
    task_id: z.string().describe("Task slug ID"),
    column: z.enum(["backlog", "preparing", "live", "measuring", "done"]).optional().describe("Move to column"),
    assigned_agent: z.string().optional().describe("Reassign to agent"),
    priority: z.enum(["critical", "high", "medium", "low"]).optional().describe("Change priority"),
    status: z.enum(["started", "completed", "failed"]).optional().describe("Lifecycle status — started sets started_at and moves to live, completed sets completed_at and moves to done, failed increments retries"),
    output: z.string().optional().describe("JSON-encoded structured output from the agent"),
    error: z.string().optional().describe("Error message if task failed"),
    title: z.string().optional().describe("Update task title"),
    body: z.string().optional().describe("Update task body content"),
  },
  async (params) => {
    const project = resolveProject(params.project);
    const output = params.output ? JSON.parse(params.output) as Record<string, unknown> : undefined;
    const result = await updateAgentTask({ ...params, project, output });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "gtm_list_agent_tasks",
  "List agent tasks with optional filtering by agent, priority, or column",
  {
    project: z.string().optional().describe("Project name (defaults to DEFAULT_PROJECT)"),
    assigned_agent: z.string().optional().describe("Filter by assigned agent"),
    priority: z.enum(["critical", "high", "medium", "low"]).optional().describe("Filter by priority"),
    column: z.enum(["backlog", "preparing", "live", "measuring", "done"]).optional().describe("Filter by column"),
  },
  async (params) => {
    const project = resolveProject(params.project);
    const result = await listAgentTasks({ ...params, project });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "gtm_get_agent_task",
  "Get full details of an agent task including output, errors, and dependencies",
  {
    project: z.string().optional().describe("Project name (defaults to DEFAULT_PROJECT)"),
    task_id: z.string().describe("Task slug ID"),
  },
  async (params) => {
    const project = resolveProject(params.project);
    const result = await getAgentTask({ ...params, project });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  }
);

// ── Zernio posting tools ──

server.tool(
  "gtm_zernio_accounts",
  "List Zernio profiles and connected social accounts — use this to discover account IDs for scheduling",
  {
    project: z.string().optional().describe("Project name (defaults to DEFAULT_PROJECT)"),
  },
  async (params) => {
    try {
      const project = resolveProject(params.project);
      const config = await loadProjectConfig(project);
      const [profiles, accounts] = await Promise.all([
        listProfiles({ project, env: config.env }),
        listAccounts({ project, env: config.env }),
      ]);
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ profiles, accounts }, null, 2),
        }],
      };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ error: String(err) }) }] };
    }
  }
);

server.tool(
  "gtm_zernio_schedule",
  "Schedule a social media post via Zernio for later review and publishing. Requires per-platform account IDs (use gtm_zernio_accounts to discover them, or set ZERNIO_ACCOUNTS in .env).",
  {
    project: z.string().optional().describe("Project name (defaults to DEFAULT_PROJECT)"),
    content: z.string().describe("Post content/copy"),
    platforms: z.array(z.string()).describe("Platforms to post to (e.g. ['linkedin', 'twitter', 'instagram'])"),
    scheduled_for: z.string().describe("ISO datetime to schedule for (e.g. 2026-03-26T14:00:00)"),
    timezone: z.string().optional().describe("Timezone (e.g. America/Chicago). Defaults to UTC."),
    account_ids: z.string().optional().describe('JSON map of platform→accountId, e.g. {"twitter":"acc_abc","linkedin":"acc_def"}. Falls back to ZERNIO_ACCOUNTS env var.'),
    media_urls: z.array(z.string()).optional().describe("URLs of images/videos to attach"),
  },
  async (params) => {
    try {
      const project = resolveProject(params.project);
      const config = await loadProjectConfig(project);
      const accountIds = params.account_ids
        ? JSON.parse(params.account_ids) as Record<string, string>
        : undefined;
      const result = await schedulePost({
        project,
        env: config.env,
        content: params.content,
        platforms: params.platforms,
        scheduledFor: params.scheduled_for,
        timezone: params.timezone,
        accountIds,
        mediaUrls: params.media_urls,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ error: String(err) }) }] };
    }
  }
);

server.tool(
  "gtm_zernio_list",
  "List scheduled posts queued in Zernio awaiting review/publish",
  {
    project: z.string().optional().describe("Project name (defaults to DEFAULT_PROJECT)"),
    limit: z.number().optional().describe("Max posts to return (default all)"),
  },
  async (params) => {
    try {
      const project = resolveProject(params.project);
      const config = await loadProjectConfig(project);
      const result = await listScheduled({
        project,
        env: config.env,
        limit: params.limit,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ error: String(err) }) }] };
    }
  }
);

server.tool(
  "gtm_zernio_publish",
  "Publish a scheduled Zernio post immediately",
  {
    project: z.string().optional().describe("Project name (defaults to DEFAULT_PROJECT)"),
    post_id: z.string().describe("Zernio post _id (from gtm_zernio_schedule or gtm_zernio_list)"),
  },
  async (params) => {
    try {
      const project = resolveProject(params.project);
      const config = await loadProjectConfig(project);
      const result = await publishNow({
        project,
        env: config.env,
        postId: params.post_id,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ error: String(err) }) }] };
    }
  }
);

server.tool(
  "gtm_zernio_delete",
  "Delete a scheduled Zernio post",
  {
    project: z.string().optional().describe("Project name (defaults to DEFAULT_PROJECT)"),
    post_id: z.string().describe("Zernio post _id to delete"),
  },
  async (params) => {
    try {
      const project = resolveProject(params.project);
      const config = await loadProjectConfig(project);
      const result = await deletePost({
        project,
        env: config.env,
        postId: params.post_id,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ error: String(err) }) }] };
    }
  }
);

// ── Meta Ads (write) tools ──

server.tool(
  "gtm_meta_create_campaign",
  "Create a Meta (Facebook/Instagram) ad campaign — defaults to PAUSED for safety",
  {
    project: z.string().optional().describe("Project name (defaults to DEFAULT_PROJECT)"),
    name: z.string().describe("Campaign name"),
    objective: z.enum(["OUTCOME_AWARENESS", "OUTCOME_TRAFFIC", "OUTCOME_ENGAGEMENT", "OUTCOME_LEADS", "OUTCOME_APP_PROMOTION", "OUTCOME_SALES"]).describe("Campaign objective"),
    daily_budget: z.number().optional().describe("Daily budget in dollars (converted to cents for API)"),
    status: z.enum(["PAUSED", "ACTIVE"]).optional().describe("Campaign status (default PAUSED)"),
  },
  async (params) => {
    try {
      const project = resolveProject(params.project);
      const config = await loadProjectConfig(project);
      const result = await createMetaCampaign({
        env: config.env,
        name: params.name,
        objective: params.objective,
        daily_budget: params.daily_budget ? Math.round(params.daily_budget * 100) : undefined,
        status: params.status,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ error: String(err) }) }] };
    }
  }
);

server.tool(
  "gtm_meta_create_adset",
  "Create a Meta ad set with targeting and budget within a campaign",
  {
    project: z.string().optional().describe("Project name (defaults to DEFAULT_PROJECT)"),
    campaign_id: z.string().describe("Parent campaign ID"),
    name: z.string().describe("Ad set name"),
    daily_budget: z.number().optional().describe("Daily budget in dollars"),
    targeting: z.string().describe('JSON-encoded targeting object, e.g. {"geo_locations":{"countries":["US"]}}'),
    optimization_goal: z.string().optional().describe("Optimization goal (default LINK_CLICKS)"),
    status: z.enum(["PAUSED", "ACTIVE"]).optional().describe("Ad set status (default PAUSED)"),
  },
  async (params) => {
    try {
      const project = resolveProject(params.project);
      const config = await loadProjectConfig(project);
      const targeting = JSON.parse(params.targeting) as Record<string, unknown>;
      const result = await createMetaAdSet({
        env: config.env,
        campaign_id: params.campaign_id,
        name: params.name,
        daily_budget: params.daily_budget ? Math.round(params.daily_budget * 100) : undefined,
        targeting,
        optimization_goal: params.optimization_goal,
        status: params.status,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ error: String(err) }) }] };
    }
  }
);

server.tool(
  "gtm_meta_create_ad",
  "Create a Meta ad with creative (title, body, link, optional image)",
  {
    project: z.string().optional().describe("Project name (defaults to DEFAULT_PROJECT)"),
    adset_id: z.string().describe("Parent ad set ID"),
    name: z.string().describe("Ad name"),
    title: z.string().describe("Ad headline/title"),
    body: z.string().describe("Ad body text"),
    link_url: z.string().describe("Landing page URL"),
    image_url: z.string().optional().describe("Image URL to upload for the ad"),
    call_to_action: z.string().optional().describe("CTA type (e.g. LEARN_MORE, SIGN_UP, SHOP_NOW)"),
    status: z.enum(["PAUSED", "ACTIVE"]).optional().describe("Ad status (default PAUSED)"),
  },
  async (params) => {
    try {
      const project = resolveProject(params.project);
      const config = await loadProjectConfig(project);
      const result = await createMetaAd({
        env: config.env,
        adset_id: params.adset_id,
        name: params.name,
        creative: {
          title: params.title,
          body: params.body,
          link_url: params.link_url,
          image_url: params.image_url,
          call_to_action: params.call_to_action,
        },
        status: params.status,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ error: String(err) }) }] };
    }
  }
);

server.tool(
  "gtm_meta_update_campaign",
  "Update a Meta campaign — pause, enable, rename, or change budget",
  {
    project: z.string().optional().describe("Project name (defaults to DEFAULT_PROJECT)"),
    campaign_id: z.string().describe("Campaign ID to update"),
    status: z.enum(["ACTIVE", "PAUSED"]).optional().describe("New campaign status"),
    name: z.string().optional().describe("New campaign name"),
    daily_budget: z.number().optional().describe("New daily budget in dollars"),
  },
  async (params) => {
    try {
      const project = resolveProject(params.project);
      const config = await loadProjectConfig(project);
      const updates: Record<string, unknown> = {};
      if (params.status) updates.status = params.status;
      if (params.name) updates.name = params.name;
      if (params.daily_budget !== undefined) updates.daily_budget = Math.round(params.daily_budget * 100);
      const result = await updateMetaCampaign({
        env: config.env,
        campaign_id: params.campaign_id,
        updates,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ error: String(err) }) }] };
    }
  }
);

server.tool(
  "gtm_meta_list_campaigns",
  "List Meta ad campaigns with status and budgets",
  {
    project: z.string().optional().describe("Project name (defaults to DEFAULT_PROJECT)"),
    status: z.string().optional().describe("Filter by status (ACTIVE, PAUSED, etc.)"),
    limit: z.number().optional().describe("Max campaigns to return"),
  },
  async (params) => {
    try {
      const project = resolveProject(params.project);
      const config = await loadProjectConfig(project);
      const result = await listMetaCampaigns({
        env: config.env,
        status: params.status,
        limit: params.limit,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ error: String(err) }) }] };
    }
  }
);

// ── Google Ads (write) tools ──

server.tool(
  "gtm_google_create_campaign",
  "Create a Google Ads campaign — defaults to PAUSED for safety",
  {
    project: z.string().optional().describe("Project name (defaults to DEFAULT_PROJECT)"),
    name: z.string().describe("Campaign name"),
    type: z.enum(["SEARCH", "DISPLAY", "SHOPPING", "VIDEO", "PERFORMANCE_MAX"]).describe("Campaign type"),
    daily_budget: z.number().describe("Daily budget in dollars (converted to micros for API)"),
    status: z.enum(["PAUSED", "ENABLED"]).optional().describe("Campaign status (default PAUSED)"),
  },
  async (params) => {
    try {
      const project = resolveProject(params.project);
      const config = await loadProjectConfig(project);
      const result = await createGoogleCampaign({
        env: config.env,
        name: params.name,
        type: params.type,
        budget_amount_micros: Math.round(params.daily_budget * 1_000_000),
        status: params.status,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ error: String(err) }) }] };
    }
  }
);

server.tool(
  "gtm_google_create_adgroup",
  "Create a Google Ads ad group within a campaign",
  {
    project: z.string().optional().describe("Project name (defaults to DEFAULT_PROJECT)"),
    campaign_id: z.string().describe("Parent campaign ID"),
    name: z.string().describe("Ad group name"),
    cpc_bid: z.number().optional().describe("Max CPC bid in dollars (default $1.00)"),
  },
  async (params) => {
    try {
      const project = resolveProject(params.project);
      const config = await loadProjectConfig(project);
      const result = await createGoogleAdGroup({
        env: config.env,
        campaign_id: params.campaign_id,
        name: params.name,
        cpc_bid_micros: params.cpc_bid ? Math.round(params.cpc_bid * 1_000_000) : undefined,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ error: String(err) }) }] };
    }
  }
);

server.tool(
  "gtm_google_create_ad",
  "Create a Google responsive search ad with headlines and descriptions",
  {
    project: z.string().optional().describe("Project name (defaults to DEFAULT_PROJECT)"),
    ad_group_id: z.string().describe("Parent ad group ID"),
    headlines: z.string().describe('JSON array of headlines (3-15, each max 30 chars), e.g. ["Get Tailor","AI Styling","Try Free"]'),
    descriptions: z.string().describe('JSON array of descriptions (2-4, each max 90 chars)'),
    final_urls: z.string().describe('JSON array of landing page URLs, e.g. ["https://gettailor.ai"]'),
    path1: z.string().optional().describe("Display URL path 1 (max 15 chars)"),
    path2: z.string().optional().describe("Display URL path 2 (max 15 chars)"),
  },
  async (params) => {
    try {
      const project = resolveProject(params.project);
      const config = await loadProjectConfig(project);
      const headlines = JSON.parse(params.headlines) as string[];
      const descriptions = JSON.parse(params.descriptions) as string[];
      const final_urls = JSON.parse(params.final_urls) as string[];
      const result = await createGoogleAd({
        env: config.env,
        ad_group_id: params.ad_group_id,
        headlines,
        descriptions,
        final_urls,
        path1: params.path1,
        path2: params.path2,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ error: String(err) }) }] };
    }
  }
);

server.tool(
  "gtm_google_update_campaign",
  "Update a Google Ads campaign — pause, enable, or rename",
  {
    project: z.string().optional().describe("Project name (defaults to DEFAULT_PROJECT)"),
    campaign_resource_name: z.string().describe("Campaign resource name (e.g. customers/1234/campaigns/5678)"),
    status: z.enum(["ENABLED", "PAUSED", "REMOVED"]).optional().describe("New campaign status"),
    name: z.string().optional().describe("New campaign name"),
  },
  async (params) => {
    try {
      const project = resolveProject(params.project);
      const config = await loadProjectConfig(project);
      const updates: Record<string, unknown> = {};
      if (params.status) updates.status = params.status;
      if (params.name) updates.name = params.name;
      const result = await updateGoogleCampaign({
        env: config.env,
        campaign_resource_name: params.campaign_resource_name,
        updates,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ error: String(err) }) }] };
    }
  }
);

server.tool(
  "gtm_google_list_campaigns",
  "List Google Ads campaigns with status and budgets",
  {
    project: z.string().optional().describe("Project name (defaults to DEFAULT_PROJECT)"),
    status: z.string().optional().describe("Filter by status (ENABLED, PAUSED, REMOVED)"),
    limit: z.number().optional().describe("Max campaigns to return (default 50)"),
  },
  async (params) => {
    try {
      const project = resolveProject(params.project);
      const config = await loadProjectConfig(project);
      const result = await listGoogleCampaigns({
        env: config.env,
        status: params.status,
        limit: params.limit,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ error: String(err) }) }] };
    }
  }
);

// ── Help ──

server.tool(
  "gtm_help",
  "Show grouped tool reference with decision tree — call this first if unsure which tool to use",
  {
    _unused: z.string().optional().describe("No parameters needed"),
  },
  async () => {
    const help = `# GTM Board — Tool Reference

## Quick Start
- "How's things going?" → gtm_status
- "Full morning report" → gtm_daily_brief
- "Not sure which tool?" → You're already here!

## Board Management
- gtm_add_card — Create a kanban card
- gtm_move_card — Move card between columns (backlog → preparing → live → measuring → done)
- gtm_update_card — Update card frontmatter (metrics, tags, status)
- gtm_list_cards — List/filter cards by column, type, or channel
- gtm_get_card — Read full card content and frontmatter
- gtm_set_card_description — Set card description and body content

## Agent Tasks
- gtm_create_agent_task — Create a task on the agent-tasks board with priority and assignment
- gtm_update_agent_task — Update status (started/completed/failed), assign agent, record output/errors
- gtm_list_agent_tasks — List/filter agent tasks by agent, priority, or column
- gtm_get_agent_task — Get full task details including output and dependencies

## Content Cadence
- gtm_log_post — Log a LinkedIn/Reddit post to track schedule adherence
- gtm_log_comment — Log daily comment count
- gtm_cadence_status — Check posting schedule (e.g., "2/3 LinkedIn posts this week")
- gtm_cadence_streak — Consecutive weeks hitting all cadence targets

## Metrics & KPIs
- gtm_refresh_channel — Pull latest data from one connector
- gtm_refresh_all — Refresh ALL enabled connectors (can take a minute)
- gtm_get_kpis — Current KPIs vs targets with green/red status
- gtm_performance_summary — What's working / what's not across all channels
- gtm_snapshot — Save current metrics for historical trend tracking

## Analytics
- gtm_trend_analysis — Compare metrics across snapshots (requires 2+ snapshots)
- gtm_funnel_report — Impressions → clicks → signups → paid with conversion rates
- gtm_geo_score — Read or update GEO (AI search visibility) metrics
- gtm_geo_trend — GEO score trends over time

## Daily Operations
- gtm_daily_brief — FULL morning brief: refresh → snapshot → trends → alerts → board summary
- gtm_alert_check — Check metrics against configured alert thresholds

## Publishing (Zernio)
- gtm_zernio_accounts — List connected social accounts and IDs
- gtm_zernio_schedule — Schedule a post for future publishing
- gtm_zernio_list — List queued/scheduled posts
- gtm_zernio_publish — Publish a scheduled post immediately

## UGC & Creative
- gtm_create_ugc_brief — Create a UGC brief card for a creator
- gtm_list_ugc_briefs — List UGC briefs filtered by status or creator
- gtm_approve_content — Approve or reject UGC content
- gtm_link_creative — Link a Paper artboard and creative assets to a card

## Ads — Meta (Facebook/Instagram)
- gtm_meta_create_campaign — Create a Meta ad campaign (defaults to PAUSED)
- gtm_meta_create_adset — Create an ad set with targeting and budget
- gtm_meta_create_ad — Create an ad with creative (title, body, link, image)
- gtm_meta_update_campaign — Pause, enable, or update a campaign
- gtm_meta_list_campaigns — List campaigns with status and budgets

## Ads — Google
- gtm_google_create_campaign — Create a Google Ads campaign (defaults to PAUSED)
- gtm_google_create_adgroup — Create an ad group within a campaign
- gtm_google_create_ad — Create a responsive search ad (headlines + descriptions)
- gtm_google_update_campaign — Pause, enable, or update a campaign
- gtm_google_list_campaigns — List campaigns with status and budgets

## Research
- gtm_research_run — Full research cycle: refresh → analyze → recommend → create cards
- gtm_competitor_check — Brief for competitor activity research
- gtm_find_opportunities — Find Reddit/LinkedIn engagement opportunities
- gtm_research_history — View past research runs

## Project Management
- gtm_list_projects — List all GTM projects with stats
- gtm_create_project — Create a new project with directory structure
- gtm_set_targets — Update KPI targets by period`;

    return { content: [{ type: "text" as const, text: help }] };
  }
);

// ── Start server ──

async function main() {
  const httpPort = process.env.MCP_HTTP_PORT ?? (process.argv.includes("--http") ? "3100" : undefined);

  if (httpPort) {
    const port = Number(httpPort);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
    });

    await server.connect(transport);

    const httpServer = createServer((req, res) => {
      const url = new URL(req.url ?? "/", `http://localhost:${port}`);

      if (url.pathname === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));
        return;
      }

      if (url.pathname === "/mcp") {
        transport.handleRequest(req, res);
        return;
      }

      res.writeHead(404);
      res.end("Not found");
    });

    httpServer.listen(port, () => {
      console.error(`MCP HTTP server listening on port ${port}`);
      console.error(`  POST http://localhost:${port}/mcp`);
      console.error(`  GET  http://localhost:${port}/health`);
    });
  } else {
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }
}

main().catch((err) => {
  console.error("Server failed to start:", err);
  process.exit(1);
});
