# Dashboard Live Data Wiring — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the dashboard to display live connector data by fixing the data layer, adding refresh API routes, and replacing fake sparklines with real snapshot history.

**Architecture:** The dashboard's `lib/data.ts` gets a normalizer that handles both flat and nested metric file formats. Two new Next.js API routes import the server's `refreshChannel`/`refreshAll` directly. The client triggers refresh on mount + 15min interval + manual button. Sparklines read from snapshot history instead of generating fake data.

**Tech Stack:** Next.js 15 (App Router), TypeScript, gray-matter, server connector imports

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `dashboard/lib/data.ts` | Modify | Normalize metrics reader, add channel aliases, fix KPI fields, add sparkline loader |
| `dashboard/lib/types.ts` | Modify | Add `SparklineData` type |
| `dashboard/app/api/refresh/route.ts` | Create | Full refresh endpoint |
| `dashboard/app/api/refresh/[channel]/route.ts` | Create | Single channel refresh endpoint |
| `dashboard/components/header.tsx` | Modify | Add refresh button with loading state |
| `dashboard/components/channel-cards.tsx` | Modify | Remove fake sparkline generator, accept sparkline data via props |
| `dashboard/app/page.tsx` | Modify | Load and pass sparkline data |
| `dashboard/app/dashboard-client.tsx` | Modify | Add refresh-on-mount, 15min interval, pass refresh state to header, pass sparkline data to channel cards |

---

### Task 1: Normalize `getMetrics()` to handle flat and nested formats

**Files:**
- Modify: `dashboard/lib/data.ts:134-154`

The core bug. Connector-written files use flat frontmatter (`total_signups: 99`), but `getMetrics()` reads `data.metrics` (nested). This task fixes the reader.

- [ ] **Step 1: Update `getMetrics()` with normalizer logic**

In `dashboard/lib/data.ts`, replace the `getMetrics` function:

```ts
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
```

- [ ] **Step 2: Verify the normalizer works by running the dev server**

Run: `cd /Users/admin/gtm-board/dashboard && npm run dev`

Open http://localhost:3100 — the Supabase metrics should now show `total_signups: 99` instead of `--`. Google Ads should show `google_ad_campaigns: 2`. Kill the dev server after verifying.

- [ ] **Step 3: Commit**

```bash
cd /Users/admin/gtm-board
git add dashboard/lib/data.ts
git commit -m "fix: normalize getMetrics to handle flat and nested frontmatter formats"
```

---

### Task 2: Add channel alias map for channel cards

**Files:**
- Modify: `dashboard/lib/data.ts` (add alias resolver after `getMetrics`)
- Modify: `dashboard/components/channel-cards.tsx:22-93` (update CARD_CONFIGS keys and metric keys)

Channel cards look for `channels["paid"]` but files are `google_ads.md`. Channel cards look for metric keys like `spend` but files have `google_ad_spend`. This task fixes both the lookup and the metric key mappings.

- [ ] **Step 1: Update CARD_CONFIGS in channel-cards.tsx to match actual file/metric names**

In `dashboard/components/channel-cards.tsx`, replace the `CARD_CONFIGS` array:

```ts
const CARD_CONFIGS: CardConfig[] = [
  {
    key: "reddit",
    name: "Reddit",
    colorVar: "var(--channel-reddit)",
    initial: "R",
    metricKeys: ["karma", "avg_upvotes", "referral_clicks", "posts"],
    metricLabels: {
      karma: "KARMA",
      avg_upvotes: "AVG UPVOTES",
      referral_clicks: "REFERRAL CLICKS",
      posts: "POSTS",
    },
    targets: { karma: 500, avg_upvotes: 10, referral_clicks: 50 },
  },
  {
    key: "linkedin",
    name: "LinkedIn",
    colorVar: "var(--channel-linkedin)",
    initial: "L",
    metricKeys: ["followers", "engagement_rate", "impressions", "posts"],
    metricLabels: {
      followers: "FOLLOWERS",
      engagement_rate: "ENGAGEMENT RATE",
      impressions: "IMPRESSIONS",
      posts: "POSTS",
    },
    targets: { followers: 1000, engagement_rate: 3, impressions: 5000 },
  },
  {
    key: "search-console",
    name: "SEO",
    colorVar: "var(--channel-seo)",
    initial: "S",
    metricKeys: ["organic_clicks", "branded_search_volume", "avg_position", "total_impressions"],
    metricLabels: {
      organic_clicks: "ORGANIC CLICKS",
      branded_search_volume: "BRANDED SEARCH",
      avg_position: "AVG POSITION",
      total_impressions: "IMPRESSIONS",
    },
    targets: { organic_clicks: 500, branded_search_volume: 200, avg_position: 20 },
  },
  {
    key: "google_ads",
    name: "Google Ads",
    colorVar: "var(--channel-google)",
    initial: "G",
    metricKeys: ["google_ad_spend", "google_ad_clicks", "google_ad_conversions", "google_ad_cpa"],
    metricLabels: {
      google_ad_spend: "SPEND",
      google_ad_clicks: "CLICKS",
      google_ad_conversions: "CONVERSIONS",
      google_ad_cpa: "CPA",
    },
    targets: { google_ad_conversions: 50, google_ad_cpa: 10 },
  },
  {
    key: "meta_ads",
    name: "Meta Ads",
    colorVar: "var(--channel-meta)",
    initial: "M",
    metricKeys: ["meta_ad_spend", "meta_ad_impressions", "meta_ad_conversions", "meta_ad_cpa"],
    metricLabels: {
      meta_ad_spend: "SPEND",
      meta_ad_impressions: "IMPRESSIONS",
      meta_ad_conversions: "CONVERSIONS",
      meta_ad_cpa: "CPA",
    },
    targets: { meta_ad_conversions: 20, meta_ad_cpa: 8 },
  },
];
```

Key changes:
- `"seo"` → `"search-console"` (matches filename)
- `"paid"` → `"google_ads"` (matches filename)
- `"meta-ads"` → `"meta_ads"` (matches filename)
- Metric keys now match actual connector field names (`google_ad_spend` not `spend`)

- [ ] **Step 2: Update the `isChannelEmpty` check for the placeholder display**

In `channel-cards.tsx`, update the showPlaceholder line (around line 167) to use new keys:

```ts
const showPlaceholder = (config.key === "google_ads" || config.key === "meta_ads") && isChannelEmpty(channelData);
```

- [ ] **Step 3: Verify channel cards show data**

Run: `cd /Users/admin/gtm-board/dashboard && npm run dev`

Open http://localhost:3100 — Reddit should show karma: 230, LinkedIn should show followers: 180, SEO should show organic_clicks: 312, Google Ads should show google_ad_campaigns: 2. Meta Ads may show "NOT RUNNING" if all values are null. Kill dev server.

- [ ] **Step 4: Commit**

```bash
cd /Users/admin/gtm-board
git add dashboard/components/channel-cards.tsx
git commit -m "fix: update channel card keys to match actual metric file names"
```

---

### Task 3: Fix KPI field name references

**Files:**
- Modify: `dashboard/lib/data.ts:156-212` (`getKPIs` function)

The KPIs read `metrics.channels.supabase?.metrics.signups` but the file has `total_signups`. Also, branded search is looked up from `channels["search-console"]` which is correct after Task 1 normalization.

- [ ] **Step 1: Update `getKPIs()` field references**

In `dashboard/lib/data.ts`, update the `getKPIs` function:

```ts
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
```

Key changes:
- `signups` → `total_signups`
- Branded search tries both `search-console` and `google_search_console` keys (both files exist)

- [ ] **Step 2: Verify KPIs display real data**

Run: `cd /Users/admin/gtm-board/dashboard && npm run dev`

Open http://localhost:3100 — Signups gauge should show 99/100. Branded should show 40/50. Kill dev server.

- [ ] **Step 3: Commit**

```bash
cd /Users/admin/gtm-board
git add dashboard/lib/data.ts
git commit -m "fix: update KPI field names to match connector output"
```

---

### Task 4: Create refresh API routes

**Files:**
- Create: `dashboard/app/api/refresh/route.ts`
- Create: `dashboard/app/api/refresh/[channel]/route.ts`

These routes import the server's refresh logic directly to pull live connector data.

- [ ] **Step 1: Create the full refresh route**

Create `dashboard/app/api/refresh/route.ts`:

```ts
import { NextResponse } from "next/server";
import { refreshAll, snapshot } from "../../../../server/src/tools/metrics.ts";
import { getProjects } from "@/lib/config";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

const GTM_HOME = process.env.GTM_HOME || "/Users/admin/gtm-board";

export async function POST() {
  const projects = getProjects();
  const project = projects[0] || "tailor";

  try {
    const { results, errors } = await refreshAll({ project });

    // Auto-snapshot if none exists for today
    let snapshotCreated = false;
    const today = new Date().toISOString().slice(0, 10);
    const snapshotPath = path.join(GTM_HOME, "projects", project, "metrics", "snapshots", `${today}.md`);
    if (!fs.existsSync(snapshotPath)) {
      snapshot({ project });
      snapshotCreated = true;
    }

    return NextResponse.json({
      ok: true,
      refreshed: results.map((r) => r.channel),
      errors: errors.map((e) => ({ channel: e.channel, error: e.error })),
      snapshotCreated,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Create the single channel refresh route**

Create `dashboard/app/api/refresh/[channel]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { refreshChannel } from "../../../../../server/src/tools/metrics.ts";
import { getProjects } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ channel: string }> }
) {
  const { channel } = await params;
  const projects = getProjects();
  const project = projects[0] || "tailor";

  try {
    const result = await refreshChannel({ project, channel });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 3: Verify the import path resolves**

The server uses `.ts` extension imports and `node:fs`. Next.js may need config adjustment if the import fails. Test by running:

Run: `cd /Users/admin/gtm-board/dashboard && npm run dev`

Then: `curl -X POST http://localhost:3100/api/refresh`

Expected: JSON response with `ok: true` and list of refreshed channels, or errors for connectors missing credentials.

If the import fails due to `.ts` extensions in the server code, add to `next.config.ts`:
```ts
const nextConfig = {
  // ... existing config
  transpilePackages: ['../server'],
};
```

- [ ] **Step 4: Commit**

```bash
cd /Users/admin/gtm-board
git add dashboard/app/api/refresh/route.ts dashboard/app/api/refresh/\\[channel\\]/route.ts
git commit -m "feat: add API routes for connector refresh"
```

---

### Task 5: Add refresh button to header

**Files:**
- Modify: `dashboard/components/header.tsx`

Add a refresh icon button that calls the refresh API and shows a loading spinner.

- [ ] **Step 1: Update header component**

Replace the full content of `dashboard/components/header.tsx`:

```tsx
"use client";

import { useState } from "react";

interface HeaderProps {
  projects: string[];
  activeProject: string;
  lastRefresh?: Date;
  isRefreshing?: boolean;
  onRefresh?: () => void;
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);

  if (diffSeconds < 60) return `${diffSeconds}s ago`;
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export default function Header({ projects, activeProject, lastRefresh, isRefreshing, onRefresh }: HeaderProps) {
  return (
    <header
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingInline: "24px",
        paddingBlock: "16px",
      }}
    >
      {/* Logo */}
      <div
        style={{
          fontFamily: "var(--font-outfit)",
          fontWeight: 700,
          fontSize: "28px",
          letterSpacing: "-0.02em",
          userSelect: "none",
        }}
      >
        <span style={{ color: "#ffffff" }}>GTM</span>
        <span style={{ color: "var(--mint)" }}>BOARD</span>
      </div>

      {/* Project switcher */}
      <select
        defaultValue={activeProject}
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "13px",
          color: "var(--mint)",
          backgroundColor: "var(--bg-card)",
          border: "1px solid var(--mint)",
          borderRadius: "8px",
          padding: "6px 12px",
          boxShadow: "0 0 8px color-mix(in srgb, var(--mint) 25%, transparent)",
          outline: "none",
          cursor: "pointer",
          textTransform: "uppercase",
          appearance: "none",
          WebkitAppearance: "none",
          paddingRight: "28px",
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath d='M3 5l3 3 3-3' stroke='%2300e5a0' fill='none' stroke-width='1.5'/%3E%3C/svg%3E")`,
          backgroundRepeat: "no-repeat",
          backgroundPosition: "right 8px center",
        }}
      >
        {projects.map((project) => (
          <option key={project} value={project}>
            {project.toUpperCase()}
          </option>
        ))}
      </select>

      {/* Status + refresh */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
        }}
      >
        {/* Refresh button */}
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          style={{
            background: "none",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            padding: "6px 10px",
            cursor: isRefreshing ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            color: isRefreshing ? "var(--text-muted)" : "var(--mint)",
            fontFamily: "var(--font-mono)",
            fontSize: "12px",
            transition: "border-color 0.2s, color 0.2s",
          }}
          title="Refresh all connectors"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              animation: isRefreshing ? "spin 1s linear infinite" : "none",
            }}
          >
            <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
            <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
            <path d="M21 21v-5h-5" />
          </svg>
          {isRefreshing ? "REFRESHING" : "REFRESH"}
        </button>

        {/* Status dot + last refresh time */}
        <span
          style={{
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            backgroundColor: "var(--mint)",
            boxShadow: "0 0 6px var(--mint), 0 0 12px color-mix(in srgb, var(--mint) 40%, transparent)",
            animation: "pulse-dot 2s ease-in-out infinite",
          }}
        />
        <span
          style={{
            fontFamily: "var(--font-inter)",
            fontSize: "13px",
            color: "var(--text-muted)",
          }}
        >
          {lastRefresh ? formatRelativeTime(lastRefresh) : "n/a"}
        </span>

        <style>{`
          @keyframes pulse-dot {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.6; transform: scale(1.3); }
          }
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/admin/gtm-board
git add dashboard/components/header.tsx
git commit -m "feat: add refresh button with loading state to header"
```

---

### Task 6: Wire refresh triggers into dashboard client

**Files:**
- Modify: `dashboard/app/dashboard-client.tsx`

Add: refresh on mount, 15-minute interval, manual refresh callback, pass state to header.

- [ ] **Step 1: Update DashboardClient with refresh logic**

Replace the full content of `dashboard/app/dashboard-client.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/header";
import KPIGauges from "@/components/kpi-gauges";
import KanbanBoard from "@/components/kanban-board";
import ChannelCards from "@/components/channel-cards";
import CadenceTracker from "@/components/cadence-tracker";
import { moveCardAction } from "./actions";
import type {
  BoardData,
  KPIData,
  CadenceData,
  ChannelMetricsData,
  Column,
} from "@/lib/types";

const REFRESH_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const FILE_POLL_INTERVAL_MS = 30 * 1000; // 30 seconds

interface DashboardClientProps {
  projects: string[];
  activeProject: string;
  projectName: string;
  board: BoardData;
  kpis: KPIData[];
  cadence: CadenceData;
  channels: Record<string, ChannelMetricsData>;
  sparklines: Record<string, Record<string, number[]>>;
}

export function DashboardClient({
  projects,
  activeProject,
  projectName,
  board,
  kpis,
  cadence,
  channels,
  sparklines,
}: DashboardClientProps) {
  const router = useRouter();
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshInFlight = useRef(false);

  const doRefresh = useCallback(async () => {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    setIsRefreshing(true);
    try {
      await fetch("/api/refresh", { method: "POST" });
      setLastRefresh(new Date());
      router.refresh();
    } catch {
      // Silently fail — next poll will pick up data
    } finally {
      setIsRefreshing(false);
      refreshInFlight.current = false;
    }
  }, [router]);

  // Refresh connectors on mount + every 15 minutes
  useEffect(() => {
    doRefresh();
    const interval = setInterval(doRefresh, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [doRefresh]);

  // Re-read files every 30 seconds (picks up changes from MCP agent too)
  useEffect(() => {
    const interval = setInterval(() => {
      router.refresh();
    }, FILE_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [router]);

  const handleMoveCard = useCallback(
    (cardId: string, fromColumn: Column, toColumn: Column) => {
      moveCardAction(activeProject, cardId, fromColumn, toColumn);
    },
    [activeProject]
  );

  return (
    <div
      className="min-h-screen p-6"
      style={{ maxWidth: 1440, margin: "0 auto" }}
    >
      <Header
        projects={projects}
        activeProject={projectName}
        lastRefresh={lastRefresh}
        isRefreshing={isRefreshing}
        onRefresh={doRefresh}
      />

      <div className="mt-6">
        <KPIGauges kpis={kpis} />
      </div>

      {/* Cadence tracker inline with KPIs context */}
      <div className="mt-4 flex items-center gap-4 px-2">
        <span
          className="text-xs uppercase tracking-widest"
          style={{
            fontFamily: "var(--font-mono)",
            color: "var(--text-muted)",
          }}
        >
          This week
        </span>
        <CadenceTracker
          linkedinPosts={cadence.linkedin.posts}
          linkedinPostsDone={cadence.linkedin.posts_done}
          linkedinPostsTarget={cadence.linkedin.posts_target}
          linkedinCommentsDone={cadence.linkedin.comments_done}
          linkedinCommentsTarget={cadence.linkedin.comments_target}
          redditCommentsDone={cadence.reddit.comments_done}
          redditCommentsTarget={cadence.reddit.comments_target}
        />
      </div>

      <div className="mt-6">
        <KanbanBoard
          board={board}
          project={activeProject}
          onMoveCard={handleMoveCard}
        />
      </div>

      <div className="mt-6">
        <ChannelCards channels={channels} sparklines={sparklines} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/admin/gtm-board
git add dashboard/app/dashboard-client.tsx
git commit -m "feat: add refresh-on-mount and 15min interval to dashboard client"
```

---

### Task 7: Replace fake sparklines with real snapshot data

**Files:**
- Modify: `dashboard/lib/data.ts` (add `getSparklineData`)
- Modify: `dashboard/lib/types.ts` (no new type needed — it's `Record<string, Record<string, number[]>>`)
- Modify: `dashboard/app/page.tsx` (load and pass sparkline data)
- Modify: `dashboard/components/channel-cards.tsx` (remove fake generator, use props)

- [ ] **Step 1: Add `getSparklineData()` to `dashboard/lib/data.ts`**

Add this function at the end of `dashboard/lib/data.ts`:

```ts
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
```

- [ ] **Step 2: Update `dashboard/app/page.tsx` to load and pass sparkline data**

Replace the full content of `dashboard/app/page.tsx`:

```tsx
import { getBoard, getKPIs, getCadence, getMetrics, getSparklineData } from "@/lib/data";
import { getProjects, getConfig } from "@/lib/config";
import { DashboardClient } from "./dashboard-client";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  const projects = getProjects();
  const activeProject = projects[0] || "tailor";
  const config = getConfig(activeProject);
  const board = getBoard(activeProject);
  const kpis = getKPIs(activeProject);
  const cadence = getCadence(activeProject);
  const metrics = getMetrics(activeProject);
  const sparklines = getSparklineData(activeProject);

  return (
    <DashboardClient
      projects={projects}
      activeProject={activeProject}
      projectName={config.name}
      board={board}
      kpis={kpis}
      cadence={cadence}
      channels={metrics.channels}
      sparklines={sparklines}
    />
  );
}
```

- [ ] **Step 3: Update channel-cards.tsx to use real sparkline data**

In `dashboard/components/channel-cards.tsx`:

1. Update the interface to accept sparklines:

```ts
interface ChannelCardsProps {
  channels: Record<string, ChannelMetricsData>;
  sparklines: Record<string, Record<string, number[]>>;
}
```

2. Remove the `seededRandom` and `generateSparklineData` functions entirely.

3. Update the component signature and sparkline data lookup:

```tsx
export default function ChannelCards({ channels, sparklines }: ChannelCardsProps) {
```

4. Replace the `sparklineDataMap` useMemo with:

```ts
  const sparklineDataMap = useMemo(() => {
    const map: Record<string, number[]> = {};
    for (const config of CARD_CONFIGS) {
      const primaryMetric = config.metricKeys[0];
      map[config.key] = sparklines[config.key]?.[primaryMetric] ?? [];
    }
    return map;
  }, [sparklines]);
```

- [ ] **Step 4: Verify sparklines show empty (no snapshots yet) or real data**

Run: `cd /Users/admin/gtm-board/dashboard && npm run dev`

Open http://localhost:3100 — sparklines should be empty (no snapshots yet). After clicking refresh (which creates a snapshot), they'll start building. After multiple days of refreshes, sparklines will show real trends. Kill dev server.

- [ ] **Step 5: Commit**

```bash
cd /Users/admin/gtm-board
git add dashboard/lib/data.ts dashboard/app/page.tsx dashboard/components/channel-cards.tsx
git commit -m "feat: replace fake sparklines with real snapshot history data"
```

---

### Task 8: End-to-end verification

**Files:** None — this is a verification task.

- [ ] **Step 1: Start the dev server**

Run: `cd /Users/admin/gtm-board/dashboard && npm run dev`

- [ ] **Step 2: Verify the dashboard loads at http://localhost:3100**

Check:
- KPI gauges show real numbers (Signups: 99, Branded: 40)
- Channel cards show data from metric files (Reddit karma: 230, LinkedIn followers: 180)
- Google Ads card shows google_ad_campaigns: 2
- Meta Ads card shows "NOT RUNNING" (all values null) or real data if campaigns exist
- No TypeScript errors in terminal

- [ ] **Step 3: Test the refresh button**

Click the refresh button in the header. Check:
- Button shows "REFRESHING" with spinning icon
- After completion, button returns to "REFRESH"
- "Last refreshed" timestamp updates
- Terminal shows connector activity (or errors for disabled connectors)

- [ ] **Step 4: Test the refresh API directly**

Run: `curl -s -X POST http://localhost:3100/api/refresh | python3 -m json.tool`

Expected: JSON with `ok: true`, list of refreshed channels, any errors, and `snapshotCreated: true` (first time).

- [ ] **Step 5: Test single channel refresh**

Run: `curl -s -X POST http://localhost:3100/api/refresh/supabase | python3 -m json.tool`

Expected: JSON with `ok: true` and supabase channel metrics.

- [ ] **Step 6: Verify typecheck passes**

Run: `cd /Users/admin/gtm-board/dashboard && npm run typecheck`

Expected: No errors.

- [ ] **Step 7: Kill dev server**
