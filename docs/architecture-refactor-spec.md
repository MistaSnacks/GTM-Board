# GTM Board — Architecture Refactor Spec

**Date:** 2026-03-26
**Status:** Ready to build
**Prerequisite:** Complete before adding project 2 (target: next week)

---

## 1. Env Scoping — Two-Tier Credential Loading

### Problem
`loadProjectConfig()` calls `dotenv.config()` which dumps env vars into `process.env` globally. In a single long-running MCP server process, loading project B's `.env` overwrites project A's credentials. Every connector reads from `process.env` directly.

### Solution
Replace `dotenv.config()` with `dotenv.parse()`. Load env vars into a scoped `Record<string, string>` on `ProjectConfig`. Connectors read from `project.env` instead of `process.env`.

### Two-tier loading order
1. **Shared** — `$GTM_HOME/.env` (account-level creds shared across all projects)
2. **External project** — path from `config.yaml` `project_env` field (e.g., `/Users/admin/TAILOR/.env`)
3. **Local project** — `projects/<name>/.env`

Later tiers override earlier tiers for the same key.

### Credential scope mapping

| Credential | Scope | Lives in |
|------------|-------|----------|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Per-project | `projects/<name>/.env` |
| `ZERNIO_API_KEY`, `ZERNIO_PROFILE_ID`, `ZERNIO_ACCOUNTS` | Per-project | `projects/<name>/.env` |
| `METRICOOL_USER_ID`, `METRICOOL_BLOG_ID`, `METRICOOL_USER_TOKEN` | Shared | `$GTM_HOME/.env` |
| `GOOGLE_SERVICE_ACCOUNT_PATH` | Shared | `$GTM_HOME/.env` |
| `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_USERNAME`, `REDDIT_PASSWORD` | Shared | `$GTM_HOME/.env` |
| `META_ADS_*` (future) | Shared | `$GTM_HOME/.env` |
| `GOOGLE_ADS_*` (future) | Shared | `$GTM_HOME/.env` |

### Changes

**`server/src/connectors/types.ts`** — Add `env` field to `ProjectConfig`:
```typescript
export interface ProjectConfig {
  // ... existing fields ...
  env: Record<string, string>;
}
```

**`server/src/lib/config.ts`** — Replace env loading:
```typescript
import dotenv from "dotenv";
import fs from "node:fs";

// In loadProjectConfig():
const envVars: Record<string, string> = {};

// Tier 1: shared credentials
const sharedEnv = path.join(GTM_HOME, ".env");
if (fs.existsSync(sharedEnv)) {
  Object.assign(envVars, dotenv.parse(fs.readFileSync(sharedEnv)));
}

// Tier 2: external project env (e.g., TAILOR's main .env)
const projectEnv = config.project_env as string | undefined;
if (projectEnv && fs.existsSync(projectEnv)) {
  Object.assign(envVars, dotenv.parse(fs.readFileSync(projectEnv)));
}

// Tier 3: local project env
const localEnv = path.join(projectDir, ".env");
if (fs.existsSync(localEnv)) {
  Object.assign(envVars, dotenv.parse(fs.readFileSync(localEnv)));
}

return {
  // ... existing fields ...
  env: envVars,
};
```

**All connector files** — Replace `process.env.X` with `project.env.X`:
- `connectors/supabase.ts` — `project.env.SUPABASE_URL`, `project.env.SUPABASE_SERVICE_ROLE_KEY`
- `connectors/reddit.ts` — `project.env.REDDIT_CLIENT_ID`, etc.
- `connectors/ga4.ts` — `project.env.GOOGLE_SERVICE_ACCOUNT_PATH`
- `connectors/google-search.ts` — `project.env.GOOGLE_SERVICE_ACCOUNT_PATH`
- `connectors/google-ads.ts` — `project.env.METRICOOL_*`
- `connectors/meta-ads.ts` — `project.env.METRICOOL_*`
- `connectors/metricool.ts` — `project.env.METRICOOL_*`

**`connectors/zernio.ts`** — Special case. Zernio functions don't follow the `Connector` interface. They take custom param objects. Add `env: Record<string, string>` to each Zernio function's params. The MCP tool handlers in `index.ts` pass `loadProjectConfig(params.project).env` through.

### Validation
- `npx tsc --noEmit` passes
- No remaining `process.env` references in connectors (except `GTM_HOME` in config.ts which is server-level, not project-level)
- Test: call `gtm_refresh_channel` for project A, then project B, verify correct credentials used

---

## 2. Default Project

### Problem
Every tool call requires `project: "tailor"`. With one project, this is pure friction.

### Solution
Add `DEFAULT_PROJECT` env var (set in MCP server config or `$GTM_HOME/.env`). Make `project` param optional on all tools — fall back to `DEFAULT_PROJECT` when omitted.

### Changes

**`server/src/lib/config.ts`** — Add helper:
```typescript
export function resolveProject(project?: string): string {
  const resolved = project || process.env.DEFAULT_PROJECT;
  if (!resolved) {
    throw new Error("No project specified and DEFAULT_PROJECT not set");
  }
  return resolved.toLowerCase();
}
```

**`server/src/index.ts`** — For every tool registration:
```typescript
// Before:
project: z.string().describe("Project name"),

// After:
project: z.string().optional().describe("Project name (defaults to DEFAULT_PROJECT)"),

// In handler:
const project = resolveProject(params.project);
```

**MCP server config** — Add to env:
```json
{
  "mcpServers": {
    "gtm-board": {
      "command": "npx",
      "args": ["tsx", "/Users/admin/gtm-board/server/src/index.ts"],
      "env": {
        "GTM_HOME": "/Users/admin/gtm-board",
        "DEFAULT_PROJECT": "tailor"
      }
    }
  }
}
```

### Note
`resolveProject` normalizes to lowercase — prevents `"TAILOR"` vs `"tailor"` directory mismatch.

---

## 3. `gtm_help` Tool

### Purpose
Reduce tool selection confusion by giving Claude (and the user) a grouped decision tree.

### Implementation
Single tool, no params, returns static markdown string.

**`server/src/index.ts`** — Add registration:
```typescript
server.tool(
  "gtm_help",
  "Show grouped tool reference with decision tree for which tool to use",
  {
    _unused: z.string().optional(),
  },
  async () => {
    const help = `# GTM Board — Tool Reference

## Quick Start
- "How's things going?" → gtm_status
- "Full morning report" → gtm_daily_brief

## Board Management
- gtm_add_card — Create a kanban card
- gtm_move_card — Move card between columns
- gtm_update_card — Update card frontmatter
- gtm_list_cards — List/filter cards
- gtm_get_card — Read full card content
- gtm_set_card_description — Set card description/body

## Content Cadence
- gtm_log_post — Log a LinkedIn/Reddit post
- gtm_log_comment — Log daily comment count
- gtm_cadence_status — Check posting schedule adherence
- gtm_cadence_streak — Consecutive weeks on target

## Metrics & Analytics
- gtm_refresh_channel — Pull data from one connector
- gtm_refresh_all — Refresh all connectors
- gtm_get_kpis — Current KPIs vs targets
- gtm_performance_summary — What's working / what's not
- gtm_snapshot — Save metrics snapshot for trend tracking
- gtm_trend_analysis — Compare metrics across snapshots
- gtm_funnel_report — Impressions → clicks → signups → paid

## Alerts & GEO
- gtm_alert_check — Check metrics against thresholds
- gtm_geo_score — Read/update GEO metrics
- gtm_geo_trend — GEO score trends over time

## Daily Operations
- gtm_daily_brief — Full morning brief (refresh → snapshot → trends → alerts → board)

## Publishing (Zernio)
- gtm_zernio_accounts — List connected social accounts
- gtm_zernio_schedule — Schedule a post
- gtm_zernio_list — List queued posts
- gtm_zernio_publish — Publish a scheduled post now

## Research
- gtm_research_run — Full research cycle
- gtm_competitor_check — Check competitor activity
- gtm_find_opportunities — Find engagement opportunities
- gtm_research_history — Past research runs

## Project Management
- gtm_list_projects — List all projects
- gtm_create_project — Create new project
- gtm_set_targets — Update KPI targets`;

    return { content: [{ type: "text" as const, text: help }] };
  }
);
```

---

## 4. Daily Brief — Add Snapshot

### Problem
`dailyBrief` calls `refreshAll()` then `trendAnalysis()`, but trend analysis needs snapshots. If no snapshots exist, trends return empty.

### Solution
Add `snapshot()` call in `dailyBrief` after `refreshAll()` completes. Every daily brief creates a dated snapshot automatically. Trend data builds up passively.

### Change

**`server/src/tools/analytics.ts`** — In `dailyBrief()`, after the `refreshAll()` call:
```typescript
// After refreshAll:
await refreshAll({ project });
snapshot({ project }); // Add this line — creates daily snapshot
// Then proceed with trendAnalysis, alertCheck, etc.
```

---

## 5. Remove UGC and Creative Tools

### What to remove

**Delete files:**
- `server/src/tools/ugc.ts`
- `server/src/tools/creative.ts`

**Remove from `server/src/index.ts`:**
- Import: `import { createUgcBrief, listUgcBriefs, approveContent } from "./tools/ugc.ts";`
- Import: `import { linkCreative } from "./tools/creative.ts";`
- Tool registrations: `gtm_create_ugc_brief`, `gtm_list_ugc_briefs`, `gtm_approve_content`, `gtm_link_creative`

**Remove from `server/src/connectors/types.ts`:**
- `UgcCreator` interface
- `UgcConfig` interface
- From `CardFrontmatter`: `creator`, `creator_handle`, `deliverable_type`, `asset_url`, `approval_status`, `due_date`, `creative_formats`, `creative_status`, `copy`
- From `ProjectConfig`: `ugc?: UgcConfig`

**Remove from `server/src/lib/config.ts`:**
- `UgcConfig` import
- `ugc: config.ugc as UgcConfig | undefined` from return object

**Remove from `server/src/index.ts` enums:**
- Remove `"ugc"` from `type` enum in `gtm_add_card` and `gtm_list_cards`
- Remove `"ugc"` from `channel` enum in `gtm_add_card` and `gtm_list_cards`

### Keep
- `BriefsConfig` — still used by `dailyBrief` for auto-creating alert cards
- `GeoConfig`, `AlertConfig` — actively used

### Expected tool count after removal
37 existing - 4 removed + 1 added (gtm_help) = **34 tools**

---

## 6. Clean Up Stale Metric Files

### Problem
Duplicate metric files with inconsistent naming: `google-ads.md` AND `google_ads.md`, `meta-ads.md` AND `meta_ads.md`. `readLatestMetrics()` reads all `.md` files, causing double-counting.

### Solution
Delete the hyphenated versions. Underscore convention matches connector keys in config.yaml.

### Files to delete
- `projects/tailor/metrics/google-ads.md`
- `projects/tailor/metrics/meta-ads.md`

### Convention going forward
Metric files are named `{connector_key}.md` where connector_key matches the key in `config.yaml` `connectors:` section (e.g., `google_ads`, `meta_ads`, `supabase`).

---

## 7. Monorepo Restructure

### Timeline
Next week, when project 2 is added.

### Target structure
```
gtm-board/
  packages/
    core/                          # Shared tool functions + types
      src/
        tools/
          board.ts
          cadence.ts
          metrics.ts
          alerts.ts
          geo.ts
          analytics.ts
          project.ts
          research.ts
        connectors/
          supabase.ts
          reddit.ts
          google-search.ts
          ga4.ts
          meta-ads.ts
          google-ads.ts
          manual.ts
          metricool.ts
          zernio.ts
          types.ts
        lib/
          config.ts
          markdown.ts
          slugify.ts
      package.json
      tsconfig.json
  apps/
    server/                        # MCP server entry point
      src/
        index.ts                   # Tool registrations only — imports from @gtm-board/core
      package.json
    dashboard/                     # Next.js dashboard
      app/
        api/                       # API routes — imports from @gtm-board/core
        page.tsx
      package.json
  projects/                        # Data directory (unchanged)
    tailor/
    newproject/
  package.json                     # Workspace root
  turbo.json                       # Optional — Turborepo config
```

### Workspace config (root `package.json`):
```json
{
  "private": true,
  "workspaces": ["packages/*", "apps/*"]
}
```

### Migration steps
1. Create `packages/core/` with its own `package.json` (`"name": "@gtm-board/core"`)
2. Move `server/src/tools/`, `server/src/connectors/`, `server/src/lib/` into `packages/core/src/`
3. Update `server/src/index.ts` imports to `@gtm-board/core`
4. Move `dashboard/` to `apps/dashboard/`
5. Move `server/` to `apps/server/`
6. Dashboard API routes import from `@gtm-board/core`
7. Run `npm install` from root to link workspaces
8. Verify: `npx tsc --noEmit` in both apps, MCP server starts, dashboard dev server starts

---

## 8. Dashboard — Live Updates via SSE

### Problem
When Claude modifies files via MCP (creates cards, updates metrics), the dashboard doesn't reflect changes until manual browser refresh.

### Solution
File watcher + Server-Sent Events. An API route watches the `projects/` directory for file changes and pushes events to connected dashboard clients.

### Implementation

**`apps/dashboard/app/api/events/route.ts`:**
```typescript
import fs from "node:fs";
import path from "node:path";

const GTM_HOME = process.env.GTM_HOME || "/Users/admin/gtm-board";
const PROJECTS_DIR = path.join(GTM_HOME, "projects");

export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const watcher = fs.watch(
        PROJECTS_DIR,
        { recursive: true },
        (eventType, filename) => {
          if (!filename || !filename.endsWith(".md")) return;

          const data = JSON.stringify({
            type: eventType,
            file: filename,
            timestamp: Date.now(),
          });

          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        }
      );

      // Cleanup on close
      const interval = setInterval(() => {
        controller.enqueue(encoder.encode(`: keepalive\n\n`));
      }, 30000);

      controller.enqueue(encoder.encode(`: connected\n\n`));

      // Store cleanup refs for when the connection closes
      (controller as any)._cleanup = () => {
        watcher.close();
        clearInterval(interval);
      };
    },
    cancel(controller) {
      (controller as any)?._cleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
```

**Client-side hook (`apps/dashboard/lib/use-live-updates.ts`):**
```typescript
import { useEffect, useCallback, useRef } from "react";

export function useLiveUpdates(onUpdate: (file: string) => void) {
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    const eventSource = new EventSource("/api/events");

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      onUpdateRef.current(data.file);
    };

    return () => eventSource.close();
  }, []);
}
```

**Usage in dashboard pages:**
```typescript
// In a Server Component wrapper or layout:
// Client component subscribes to SSE, triggers router.refresh() or SWR revalidation on file change
useLiveUpdates((file) => {
  // Debounce and refresh relevant data
  router.refresh();
});
```

### Notes
- `fs.watch` with `recursive: true` works on macOS (uses FSEvents). On Linux, may need `chokidar`.
- Only `.md` file changes trigger events — ignores `.env`, `config.yaml` edits (those require server restart anyway).
- 30s keepalive prevents connection timeout.
- Dashboard is local-only so no auth needed on the SSE endpoint.

---

## Build Order

### This week (before project 2)
1. Env scoping refactor (Section 1)
2. Remove UGC + Creative (Section 5)
3. Delete stale metric files (Section 6)
4. Add `DEFAULT_PROJECT` (Section 2)
5. Add `gtm_help` tool (Section 3)
6. Add snapshot to daily brief (Section 4)
7. Validate: `npx tsc --noEmit`, server starts, all tool count = 34

### Next week (with project 2)
8. Monorepo restructure (Section 7)
9. Dashboard SSE (Section 8)
10. Dashboard API routes for writes (import shared tool functions)
11. Create project 2, verify env scoping works across projects

---

## Validation Checklist

- [ ] No `process.env` references in connector files (except `GTM_HOME` in config.ts)
- [ ] `ProjectConfig.env` populated correctly per project
- [ ] `DEFAULT_PROJECT` works — tools called without `project` param resolve correctly
- [ ] `gtm_help` returns grouped tool list
- [ ] `gtm_daily_brief` creates a snapshot file in `metrics/snapshots/`
- [ ] UGC/Creative tools fully removed — no orphan imports, no orphan types
- [ ] No duplicate metric files (only underscore versions)
- [ ] Tool count: 34
- [ ] TypeScript compiles clean
- [ ] MCP server starts without error
