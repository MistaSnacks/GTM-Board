# Dashboard Live Data Wiring

## Problem

The dashboard reads all metrics from `.md` files in `projects/{project}/metrics/`, but:

1. **Structure mismatch** — Connector-written files (supabase, meta_ads, google_ads, metricool) use flat frontmatter keys. Dashboard `getMetrics()` expects a nested `metrics:` key. Result: connector data reads as empty `{}`.
2. **Key name mismatch** — Channel cards look up `channels["paid"]` and `channels["meta-ads"]`, but files are `google_ads.md` and `meta_ads.md`.
3. **KPI field name mismatch** — Dashboard reads `metrics.signups`, file has `total_signups`.
4. **No refresh trigger** — Nobody calls `refreshChannel()`/`refreshAll()` unless an agent does it via MCP. The dashboard has no way to trigger a data pull.
5. **Sparklines are fake** — `generateSparklineData()` synthesizes a trend from the current value using seeded random. No historical data.

## Approach

Normalize in the data layer, fix key mappings, add API routes for refresh, replace fake sparklines with real snapshot history.

## Design

### 1. Data Layer Normalization (`dashboard/lib/data.ts`)

**`getMetrics()` normalizer:**

The current code does `metrics: data.metrics || {}`. Replace with logic that:
- If `data.metrics` exists (nested format), use it
- Otherwise, collect all frontmatter keys except `channel` and `updated_at` as metrics

This handles both connector-written (flat) and manually-written (nested) files.

**Channel alias map:**

```ts
const CHANNEL_ALIASES: Record<string, string[]> = {
  "paid":     ["google_ads", "google-ads"],
  "meta-ads": ["meta_ads"],
  "seo":      ["search-console", "google_search_console", "google-search-console"],
};
```

When looking up `channels["paid"]`, also check `channels["google_ads"]`, etc.

**KPI field name fix in `getKPIs()`:**
- `signups` -> `total_signups`
- Other fields (`free_to_paid_pct`, `branded_search_volume`) already match

### 2. API Routes

**`POST /api/refresh` (new file: `dashboard/app/api/refresh/route.ts`)**

- Imports `refreshAll` and `snapshot` from `../../server/src/tools/metrics.ts`
- Calls `refreshAll({ project })` for the active project
- If successful and no snapshot exists for today, calls `snapshot({ project })`
- Returns `{ results, errors, snapshotCreated }` as JSON

**`POST /api/refresh/[channel]` (new file: `dashboard/app/api/refresh/[channel]/route.ts`)**

- Imports `refreshChannel` from `../../server/src/tools/metrics.ts`
- Calls `refreshChannel({ project, channel })` for a single connector
- Returns the channel metrics or error as JSON

Both routes default to the first project (same as `page.tsx` does today).

### 3. Refresh Triggers

**Manual refresh button:**
- Added to `dashboard/components/header.tsx`
- Refresh icon button next to the project name
- Shows loading spinner while refresh is in progress
- Calls `POST /api/refresh`, then `router.refresh()` to re-read updated files

**Background interval:**
- On dashboard mount, fire `POST /api/refresh` immediately
- Set a 15-minute interval for subsequent refreshes
- The existing 30-second `router.refresh()` re-reads files between connector refreshes

**Last refreshed timestamp:**
- Displayed in the header as "Last refreshed: Xm ago"
- Derived from the most recent `updated_at` across all metrics files

### 4. Sparkline History

**New `getSparklineData()` function in `dashboard/lib/data.ts`:**
- Reads `metrics/snapshots/*.md`, sorted by date, takes last 8
- For a given channel + metric key, extracts the value from each snapshot
- Returns `number[]` for the Sparkline component

**Fallback:** If fewer than 2 snapshots exist, returns empty array (no sparkline rendered). No more fake data.

**Auto-snapshot:** `/api/refresh` calls `snapshot()` after successful `refreshAll()`, only if no snapshot exists for today. Builds history automatically.

**`dashboard/components/channel-cards.tsx`:**
- Remove `generateSparklineData()` and `seededRandom()`
- Accept sparkline data as a prop from the page, keyed by channel

### 5. Connector Status

Current connector state per memory + config:

| Connector | Status | Notes |
|-----------|--------|-------|
| supabase | Enabled | Signups, conversion data |
| metricool | Enabled | LinkedIn, Instagram, TikTok, Facebook, Twitter reads |
| google_ads | Enabled | Campaign data (2 campaigns, currently $0 spend) |
| meta_ads | Enabled | Returns nulls currently (may need campaign setup) |
| reddit | Disabled | Reads go through Zernio, not direct Reddit API |
| google_search_console | Disabled | Needs credentials |
| ga4 | Disabled | Needs credentials |
| manual | Enabled | Fallback for hand-entered data |

The refresh routes respect the `enabled` flag in `config.yaml`. Disabled connectors are skipped silently. The dashboard shows whatever data is available — null values display as "--".

## Files Changed

| File | Type | Change |
|------|------|--------|
| `dashboard/lib/data.ts` | Edit | Normalize getMetrics() for flat+nested, add alias map, fix KPI fields, add getSparklineData() |
| `dashboard/app/api/refresh/route.ts` | New | refreshAll + auto-snapshot endpoint |
| `dashboard/app/api/refresh/[channel]/route.ts` | New | Single channel refresh endpoint |
| `dashboard/components/header.tsx` | Edit | Add refresh button, loading state, last-refreshed timestamp |
| `dashboard/app/dashboard-client.tsx` | Edit | Initial refresh on mount, 15min interval, pass refresh/sparkline state |
| `dashboard/components/channel-cards.tsx` | Edit | Remove fake sparkline generator, accept real data via props |
| `dashboard/app/page.tsx` | Edit | Load and pass sparkline data |

## Out of Scope

- Server/MCP tools — untouched
- Connector implementations — untouched
- Kanban board — already works (file-based is correct for this)
- Cadence tracker — file-based, already accurate
- Fixing disabled connectors (Reddit via Zernio, GSC, GA4) — config/credentials issue
- Visual design changes
- Adding new metrics or widgets
