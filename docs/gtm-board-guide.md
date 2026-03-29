# GTM Board -- Comprehensive Guide

---

## 1. Overview

GTM Board is a local MCP (Model Context Protocol) server that gives Claude structured tools for managing go-to-market operations. It tracks kanban boards, content cadence, KPIs from external APIs, competitor research, and ad creative workflows -- all stored as markdown files with YAML frontmatter.

### Architecture

```
Claude (via MCP) --> GTM Board Server (TypeScript) --> Markdown files + External APIs
                                                   --> Optional: Obsidian reads the same files
                                                   --> Optional: Dashboard (skeuomorphic mission control UI)
```

The server runs locally, never deployed. Claude calls structured tools; the server reads/writes markdown files and pulls data from connectors (Supabase, Google Search Console, Metricool, Zernio, etc.). Claude never sees API keys directly -- it calls tools that return results.

### Who it's for

Solo founders and small teams managing marketing across multiple products. If you have a GTM plan, a content cadence, ad campaigns, and KPI targets spread across docs and dashboards, GTM Board consolidates tracking into one Claude-native system.

---

## 2. Quick Start

### Prerequisites

- **Node.js** (v18+) and **npm**
- **Claude** with MCP support (Claude Desktop, Claude Code, or similar)
- **TypeScript** execution via `npx tsx`

### Register the MCP server

Add the following to your `.mcp.json` (project-level) or `~/.claude/.mcp.json` (global):

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

**Important:** Use absolute paths. Tilde (`~`) is not expanded by `npx`. The `DEFAULT_PROJECT` env var is optional but recommended -- it lets you omit the `project` parameter on every tool call.

### First commands to try

1. **`gtm_help`** -- Shows the full tool reference grouped by category with a decision tree. Call this first if you are unsure which tool to use.
2. **`gtm_status`** -- Single-call overview: board summary + cadence status + KPI snapshot. The most-used tool.
3. **`gtm_daily_brief`** -- Full morning report: refreshes all connectors, saves a snapshot, analyzes trends, checks alerts, and summarizes the board.

---

## 3. Adding a New Project

### Step 1: Scaffold the project

**Option A -- Bootstrap script** (before the MCP server is running):

```bash
npx tsx /Users/admin/gtm-board/setup.ts myproject --url https://myproject.com
```

This creates the full directory structure, a default `config.yaml`, and a placeholder `.env`.

**Option B -- MCP tool** (once the server is running):

```
gtm_create_project(name: "myproject", url: "https://myproject.com", description: "My SaaS product")
```

### Step 2: Configure `config.yaml`

Edit `projects/myproject/config.yaml` with all relevant sections:

```yaml
name: MYPROJECT
url: https://myproject.com
description: My SaaS product

# Optional: pointer to an existing project .env for shared credentials
project_env: /Users/admin/MYPROJECT/.env

connectors:
  supabase:
    enabled: true
  reddit:
    enabled: false
    username: "my-reddit-username"
    subreddits: [startups, SideProject, SaaS]
  google_search_console:
    enabled: true
    site_url: "sc-domain:myproject.com"
  ga4:
    enabled: false
    property_id: ""
  meta_ads:
    enabled: false
  google_ads:
    enabled: false
  metricool:
    enabled: true
    platforms: [linkedin, instagram, tiktok, facebook]
  zernio:
    enabled: true
    platforms: [linkedin, twitter, instagram]

cadence:
  linkedin:
    posts_per_week: 3
    schedule:
      monday: educational
      wednesday: narrative
      friday: hot-take
    comments_per_week:
      min: 5
      target: 10
  reddit:
    posts_per_week:
      min: 0
      target: 1
    comments_per_week:
      min: 5
      target: 10
    no_links_until: "2026-05-01"

targets:
  month_1:
    signups: 100
    free_to_paid_pct: 0.05
    linkedin_followers: 500
    meta_cpa: 8
  month_3:
    signups: 500
    free_to_paid_pct: 0.08
    linkedin_followers: 2000
    meta_cpa: 5

research:
  competitors: [competitor1, competitor2, competitor3]
  exa_search_queries:
    - "my niche marketing strategy 2026"
    - "reddit my-niche discussion"

creative:
  brand_doc: /path/to/brand-guidelines.md
  formats: ["1080x1080", "1080x1350", "1080x1920", "1200x628"]
  accent_color: "#10B981"

reference_docs:
  - /path/to/gtm-plan.md
  - /path/to/content-strategy.md
```

### Step 3: Create `.env` with project-specific credentials

Edit `projects/myproject/.env`:

```bash
# Project-specific credentials
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Zernio (project-specific API key)
ZERNIO_API_KEY=sk_xxxxx
ZERNIO_PROFILE_ID=prof_xxxxx
```

### Step 4: Understand the two-tier env system

The config loader in `/Users/admin/gtm-board/server/src/lib/config.ts` merges environment variables from three sources, with later tiers overriding earlier ones:

| Tier | File | Purpose | Example vars |
|------|------|---------|-------------|
| **1 (shared)** | `/Users/admin/gtm-board/.env` | Account-level credentials shared across ALL projects | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `METRICOOL_USER_ID`, `METRICOOL_BLOG_ID`, `METRICOOL_USER_TOKEN`, `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET` |
| **2 (external project)** | Path set by `project_env` in config.yaml | Credentials from an existing project repo | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (e.g., from your main app's `.env`) |
| **3 (local project)** | `projects/<name>/.env` | Project-specific overrides (highest priority) | `ZERNIO_API_KEY`, `ZERNIO_PROFILE_ID`, `REDDIT_USERNAME`, `REDDIT_PASSWORD` |

**Why two tiers?** Google OAuth tokens, Metricool API keys, and Reddit app credentials are account-level -- they work across all projects. Supabase credentials and Zernio keys are project-specific. The two-tier system avoids duplicating shared credentials in every project.

### Step 5: Set DEFAULT_PROJECT

Set `DEFAULT_PROJECT` in the MCP registration env to avoid passing `project` on every tool call:

```json
"env": {
  "GTM_HOME": "/Users/admin/gtm-board",
  "DEFAULT_PROJECT": "myproject"
}
```

If `DEFAULT_PROJECT` is not set and you omit the `project` parameter, tools will throw: `"No project specified and DEFAULT_PROJECT not set"`.

---

## 4. Tool Reference

GTM Board registers 38 tools. Every tool that operates on a project accepts an optional `project` parameter that defaults to `DEFAULT_PROJECT`.

### Board Management (6 tools)

| Tool | Description |
|------|-------------|
| `gtm_add_card` | Create a kanban card with type, channel, column, tags, and target date |
| `gtm_move_card` | Move a card between columns: backlog, preparing, live, measuring, done |
| `gtm_update_card` | Update card frontmatter fields (metrics, tags, status, etc.) |
| `gtm_list_cards` | List/filter cards by column, type, or channel |
| `gtm_get_card` | Read full card content including frontmatter and markdown body |
| `gtm_set_card_description` | Write or update a card's short description and full body content |

### Content Cadence (4 tools)

| Tool | Description |
|------|-------------|
| `gtm_log_post` | Log a LinkedIn/Reddit post to track schedule adherence |
| `gtm_log_comment` | Log daily comment count for cadence tracking |
| `gtm_cadence_status` | Check posting schedule (e.g., "2/3 LinkedIn posts this week") |
| `gtm_cadence_streak` | Count consecutive weeks meeting all cadence minimums |

### Metrics & KPIs (6 tools)

| Tool | Description |
|------|-------------|
| `gtm_status` | Single-call overview: board summary + cadence + KPI snapshot |
| `gtm_refresh_channel` | Pull latest data from one specific connector |
| `gtm_refresh_all` | Refresh all enabled connectors (can take a minute) |
| `gtm_get_kpis` | Current KPIs vs targets with green/red status per metric |
| `gtm_performance_summary` | What's working / what's not across all channels |
| `gtm_snapshot` | Save current metrics as a weekly snapshot for historical tracking |

### Analytics (4 tools)

| Tool | Description |
|------|-------------|
| `gtm_trend_analysis` | Compare metrics across snapshots with delta and percent change |
| `gtm_funnel_report` | Impressions to clicks to signups to paid with conversion rates |
| `gtm_geo_score` | Read or update GEO (Generative Engine Optimization) metrics |
| `gtm_geo_trend` | Analyze GEO score trends across snapshots |

### Daily Operations (2 tools)

| Tool | Description |
|------|-------------|
| `gtm_daily_brief` | Full morning brief: refresh, snapshot, trends, alerts, board summary |
| `gtm_alert_check` | Check metrics against configured alert thresholds |

### UGC & Creative (4 tools)

| Tool | Description |
|------|-------------|
| `gtm_create_ugc_brief` | Create a UGC brief card for a creator (testimonial, tutorial, etc.) |
| `gtm_list_ugc_briefs` | List UGC briefs filtered by approval status or creator |
| `gtm_approve_content` | Approve or reject UGC content with optional feedback notes |
| `gtm_link_creative` | Link a Paper artboard and creative assets to a board card |

### Publishing / Zernio (4 tools)

| Tool | Description |
|------|-------------|
| `gtm_zernio_accounts` | List connected social accounts and their IDs |
| `gtm_zernio_schedule` | Schedule a post for future publishing across platforms |
| `gtm_zernio_list` | List queued/scheduled posts awaiting review or publish |
| `gtm_zernio_publish` | Publish a scheduled post immediately |

### Research (4 tools)

| Tool | Description |
|------|-------------|
| `gtm_research_run` | Full research cycle: refresh, analyze, recommend, create cards |
| `gtm_competitor_check` | Get structured brief for competitor activity research |
| `gtm_find_opportunities` | Search for Reddit/LinkedIn engagement opportunities |
| `gtm_research_history` | View past research runs and findings |

### Project Management (3 tools)

| Tool | Description |
|------|-------------|
| `gtm_list_projects` | List all GTM projects with summary stats |
| `gtm_create_project` | Create a new project with directory structure and default config |
| `gtm_set_targets` | Update KPI targets by period (month_1, month_3, etc.) |

### Help (1 tool)

| Tool | Description |
|------|-------------|
| `gtm_help` | Show grouped tool reference with decision tree |

### Ads (future)

Direct ad campaign management (create/edit/pause) via the Meta Marketing API and Google Ads API is planned but not yet implemented. Currently, ad analytics are pulled read-only through the Metricool connector.

---

## 5. Connectors

### Connector summary

| Connector | What it pulls | Required env vars | Required config | Read/Write |
|-----------|--------------|-------------------|-----------------|------------|
| **supabase** | Signups, paid users, MRR, free-to-paid %, engagement | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | `connectors.supabase.enabled: true` | Read-only |
| **reddit** | Post upvotes, comment karma, referral traffic by UTM | `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_USERNAME`, `REDDIT_PASSWORD` | `connectors.reddit.enabled: true`, `username`, `subreddits` | Read-only |
| **google_search_console** | Branded search volume, organic clicks, top queries, avg position | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` | `connectors.google_search_console.enabled: true`, `site_url` | Read-only |
| **ga4** | Traffic by source/medium, UTM attribution, landing pages | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` | `connectors.ga4.enabled: true`, `property_id` | Read-only |
| **meta_ads** | Facebook/Instagram ad spend, impressions, clicks, CPA, ROAS | `METRICOOL_USER_ID`, `METRICOOL_BLOG_ID`, `METRICOOL_USER_TOKEN` | `connectors.meta_ads.enabled: true` | Read-only (via Metricool) |
| **google_ads** | Google Ads campaign spend, impressions, clicks, CPA, conversions | `METRICOOL_USER_ID`, `METRICOOL_BLOG_ID`, `METRICOOL_USER_TOKEN` | `connectors.google_ads.enabled: true` | Read-only (via Metricool) |
| **metricool** | Social media analytics across all connected platforms (LinkedIn, Instagram, TikTok, Facebook) | `METRICOOL_USER_ID`, `METRICOOL_BLOG_ID`, `METRICOOL_USER_TOKEN` | `connectors.metricool.enabled: true`, `platforms` list | Read-only |
| **zernio** | Schedule, list, and publish social media posts | `ZERNIO_API_KEY`, optionally `ZERNIO_PROFILE_ID`, `ZERNIO_ACCOUNTS` | `connectors.zernio.enabled: true`, `platforms` list | **Read-write** |
| **manual** | LinkedIn post metrics, backlink status (entered via MCP tools) | None | Always available | Read-write |

### Notes on connectors

- **Metricool** requires the Advanced plan ($22/mo) or Custom plan for API access.
- **Meta Ads and Google Ads** pull data through Metricool, not directly from platform APIs. This is read-only analytics. Direct campaign management is planned for a future release.
- **Google Search Console and GA4** share the same OAuth credentials (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`). Set these once in the shared root `.env`.
- **Zernio** is the only connector that writes data (schedules and publishes posts). All others are read-only.
- **Manual** connector reads existing metric files from disk. Use `gtm_log_post` and `gtm_log_comment` to write LinkedIn/backlink data.

### Enabling/disabling in config.yaml

Set `enabled: true` or `enabled: false` under each connector in `config.yaml`:

```yaml
connectors:
  supabase:
    enabled: true
  reddit:
    enabled: false   # flip to true once Reddit API keys are added
```

When `enabled: false`, `gtm_refresh_all` skips that connector entirely.

---

## 6. Data Model

### Directory structure

```
/Users/admin/gtm-board/
  .env                              # Tier 1: shared credentials
  setup.ts                          # Bootstrap script
  server/
    src/
      index.ts                      # MCP server entry, 38 tool registrations
      tools/
        board.ts                    # Kanban CRUD
        cadence.ts                  # Content schedule tracking
        metrics.ts                  # KPI aggregation + performance analysis
        project.ts                  # Multi-project management
        research.ts                 # Auto-research loop
        creative.ts                 # Paper MCP integration
        analytics.ts                # Trend analysis, funnel, daily brief
        alerts.ts                   # Alert threshold checks
        geo.ts                      # GEO scoring
        ugc.ts                      # UGC brief management
      connectors/
        supabase.ts
        reddit.ts
        google-search.ts
        ga4.ts
        meta-ads.ts
        google-ads.ts
        metricool.ts
        zernio.ts
        manual.ts
        types.ts                    # All interfaces
      lib/
        config.ts                   # Project config loading, two-tier env
        markdown.ts                 # Read/write .md with YAML frontmatter
  projects/
    tailor/
      .env                          # Tier 3: project-specific credentials
      config.yaml                   # Full project configuration
      board/
        backlog/                    # Kanban column directories
        preparing/
        live/
        measuring/
        done/
      cadence/
        2026-03/                    # Monthly cadence logs
          linkedin.md
          reddit.md
      metrics/
        snapshots/                  # Weekly metric snapshots
        supabase.md                 # Per-connector metric files
        reddit.md
        search-console.md
        ga4.md
        linkedin.md
        backlinks.md
      research/                     # Auto-research output
        2026-03-20.md               # One file per research run
      daily-reports/                # Daily brief outputs
```

### Card format

Every kanban card is a `.md` file with YAML frontmatter stored in its column directory (e.g., `board/preparing/my-card-a1b2.md`):

```markdown
---
id: reddit-sideproject-launch-a1b2
title: "r/SideProject launch post"
type: post
channel: reddit
column: preparing
created: 2026-03-14
target_date: 2026-04-07
tags: [launch, reddit, organic]
source: research
metrics:
  upvotes: null
  comments: null
  referral_clicks: null
paper_artboard: null
---

## Notes
First product showcase post. Wait until karma > 500.

## Checklist
- [ ] 500+ karma earned
- [ ] Draft post reviewed
- [ ] UTM link ready
```

**Card IDs** are generated from the title (slugified) with a 4-character timestamp suffix to prevent collisions. Files are named `{id}.md`. Moving a card means moving the file between column directories.

**Card types:** `ad`, `post`, `outreach`, `seo`, `initiative`, `ugc`

**Card channels:** `meta`, `google`, `reddit`, `linkedin`, `seo`, `email`, `ugc`, `other`

**Kanban columns:** `backlog` --> `preparing` --> `live` --> `measuring` --> `done`

### Metrics file format

Each connector writes a flat key-value YAML file to `metrics/<connector>.md`:

```markdown
---
channel: supabase
updated_at: "2026-03-25T14:30:00Z"
metrics:
  total_signups: 142
  paid_users: 8
  mrr: 72
  free_to_paid_pct: 0.056
  resumes_today: 23
---
```

### Snapshot format

Snapshots saved by `gtm_snapshot` go to `metrics/snapshots/YYYY-MM-DD.md` with metrics nested by channel:

```markdown
---
date: "2026-03-25"
channels:
  supabase:
    total_signups: 142
    paid_users: 8
    mrr: 72
  reddit:
    post_karma: 340
    comment_karma: 890
  search_console:
    branded_clicks: 45
    avg_position: 12.3
---
```

### config.yaml full schema reference

```yaml
# Required
name: string              # Project display name
url: string               # Project URL

# Optional metadata
description: string       # Short description

# External env pointer (Tier 2)
project_env: string       # Absolute path to an existing .env file

# Connectors
connectors:
  supabase:
    enabled: boolean
  reddit:
    enabled: boolean
    username: string
    subreddits: string[]
  google_search_console:
    enabled: boolean
    site_url: string       # e.g., "sc-domain:example.com"
  ga4:
    enabled: boolean
    property_id: string    # GA4 property ID
  meta_ads:
    enabled: boolean
  google_ads:
    enabled: boolean
  metricool:
    enabled: boolean
    platforms: string[]    # e.g., [linkedin, instagram, tiktok, facebook]
  zernio:
    enabled: boolean
    platforms: string[]    # e.g., [linkedin, twitter, instagram, tiktok, reddit]

# Content cadence targets
cadence:
  linkedin:
    posts_per_week: number
    schedule:              # Day-of-week to post-type mapping
      monday: string
      wednesday: string
      friday: string
    comments_per_week:
      min: number
      target: number
  reddit:
    posts_per_week:
      min: number
      target: number
    comments_per_week:
      min: number
      target: number
    no_links_until: string  # YYYY-MM-DD -- karma-building period

# KPI targets by time period
targets:
  month_1:
    <metric_name>: number
  month_3:
    <metric_name>: number

# Research configuration
research:
  competitors: string[]
  exa_search_queries: string[]

# Creative / ad design
creative:
  brand_doc: string        # Absolute path to brand guidelines
  formats: string[]        # e.g., ["1080x1080", "1080x1350"]
  accent_color: string     # Hex color

# GEO tracking
geo:
  target_domain: string
  track_platforms: string[]

# Alert thresholds
alerts:
  <metric_name>: number    # Threshold below which an alert fires

# UGC configuration
ugc:
  creators:
    - name: string
      handle: string
      platforms: string[]
  default_deliverable_types: string[]

# Brief auto-creation
briefs:
  auto_create_cards: boolean
  retention_days: number

# External doc references (for research and creative alignment)
reference_docs: string[]   # Absolute paths to strategy/marketing docs
```

---

## 7. Daily Workflow

### Morning routine

1. **Run `gtm_daily_brief`** -- This single call refreshes all connectors, saves a metrics snapshot, analyzes trends vs prior snapshots, checks alert thresholds, and returns a full board summary. This is the recommended way to start each day.

2. **Review the brief** -- The daily brief surfaces:
   - Metrics that changed significantly since last snapshot
   - KPIs that are on track (green) or behind (red)
   - Alerts for metrics below threshold
   - Board items needing attention
   - Cadence adherence for the current week

### Throughout the day

3. **Schedule posts via Zernio** -- Use `gtm_zernio_schedule` to queue posts for LinkedIn, Twitter, Instagram, etc. Review queued posts with `gtm_zernio_list`. Publish immediately with `gtm_zernio_publish` or let them go out at the scheduled time.

4. **Log posts and comments for cadence tracking** -- After publishing a LinkedIn or Reddit post, log it with `gtm_log_post`. After engaging in Reddit/LinkedIn comments, log the count with `gtm_log_comment`. Check adherence with `gtm_cadence_status`.

5. **Check KPIs vs targets** -- Run `gtm_get_kpis` to see current metrics against your defined targets. Use `gtm_performance_summary` for a structured breakdown of what's working and what's not.

### Weekly

6. **Save a snapshot** -- If you are not running `gtm_daily_brief` (which auto-snapshots), manually run `gtm_snapshot` at least weekly to build historical trend data.

7. **Run research** -- Use `gtm_research_run` for a full research cycle, or `gtm_find_opportunities` to surface Reddit threads and LinkedIn discussions worth engaging with.

8. **Check cadence streak** -- Run `gtm_cadence_streak` to see how many consecutive weeks you have hit all cadence minimums.

---

## 8. Multi-Project Setup

### One server, all projects

A single MCP server instance serves all projects under `projects/`. Each tool call specifies which project to operate on via the `project` parameter. If omitted, it falls back to `DEFAULT_PROJECT`.

```
projects/
  tailor/        # Project 1
  otherapp/      # Project 2
  thirdthing/    # Project 3
```

### Env scoping

Credentials are scoped to avoid duplication:

**Shared credentials** (root `.env` at `/Users/admin/gtm-board/.env`):
```bash
# Google OAuth -- used by Search Console and GA4 across all projects
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx
GOOGLE_REFRESH_TOKEN=xxx

# Metricool -- one account tracks all brands
METRICOOL_USER_ID=12345
METRICOOL_BLOG_ID=67890
METRICOOL_USER_TOKEN=xxx

# Reddit app -- one app, multiple projects
REDDIT_CLIENT_ID=xxx
REDDIT_CLIENT_SECRET=xxx
```

**Per-project credentials** (e.g., `projects/tailor/.env`):
```bash
# Supabase -- each project has its own database
SUPABASE_URL=https://tailor-xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Zernio -- each project may have its own social accounts
ZERNIO_API_KEY=sk_tailor_xxx
ZERNIO_PROFILE_ID=prof_tailor

# Reddit user -- project-specific posting account
REDDIT_USERNAME=tailor_official
REDDIT_PASSWORD=xxx
```

### How connectors differentiate between projects

Connectors use project-specific config values to pull the right data:

- **Google Search Console** uses `connectors.google_search_console.site_url` (e.g., `sc-domain:gettailor.ai` vs `sc-domain:otherapp.com`)
- **GA4** uses `connectors.ga4.property_id` (each project has a different GA4 property)
- **Supabase** uses per-project `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from the project `.env`
- **Reddit** uses `connectors.reddit.username` and `connectors.reddit.subreddits` from config.yaml
- **Metricool** uses the same API credentials but filters by `connectors.metricool.platforms`

### DEFAULT_PROJECT for convenience

Set `DEFAULT_PROJECT` in the MCP server env to skip the `project` parameter:

```json
"env": {
  "GTM_HOME": "/Users/admin/gtm-board",
  "DEFAULT_PROJECT": "tailor"
}
```

Then `gtm_status()` is equivalent to `gtm_status(project: "tailor")`. You can always override by passing `project` explicitly: `gtm_status(project: "otherapp")`.

---

## 9. Obsidian Integration

### Files are Obsidian-compatible

All data is stored as standard markdown files with YAML frontmatter. Point Obsidian at `/Users/admin/gtm-board/projects/` as a vault (or add it as a nested vault) and you get:

- Card files browsable with full frontmatter visible
- Research reports readable as notes
- Metric snapshots viewable as structured data
- Cadence logs browsable by month

### Kanban plugin caveat

The Obsidian Kanban plugin expects a single `.md` file with list-based columns. GTM Board uses a directory-per-column structure (`board/backlog/`, `board/preparing/`, etc.), which is incompatible with the Kanban plugin.

**Workaround:** GTM Board's design prioritizes file-based operations and MCP tool access. For a visual kanban view, use the optional dashboard UI rather than the Obsidian Kanban plugin. Individual card files still work fine in Obsidian for reading, editing, and linking.

### How to set up

1. Open Obsidian
2. Create a new vault or open an existing one
3. Add `/Users/admin/gtm-board/projects/` as the vault root (or symlink it into an existing vault)
4. All project folders, cards, metrics, and research files appear as navigable notes

---

## 10. Troubleshooting

### Missing env vars

**Symptom:** Connector returns an error like `"SUPABASE_URL not found"` or `"Missing GOOGLE_CLIENT_ID"`.

**Fix:** Check that the required env vars are set in the correct tier:
- Shared credentials go in `/Users/admin/gtm-board/.env`
- Project-specific credentials go in `projects/<name>/.env`
- If using `project_env` in config.yaml, verify the path exists and contains the expected vars

### config.yaml syntax errors

**Symptom:** `"Project config not found"` or YAML parse errors.

**Fix:** Validate YAML syntax. Common issues:
- Missing quotes around strings with special characters
- Incorrect indentation (YAML requires spaces, not tabs)
- Missing colons after keys

### Connector errors

**Symptom:** `gtm_refresh_all` fails on one connector.

**Fix:** Test individual connectors with `gtm_refresh_channel`:

```
gtm_refresh_channel(channel: "supabase")
gtm_refresh_channel(channel: "metricool")
gtm_refresh_channel(channel: "google_search_console")
```

This isolates which connector is failing and returns a specific error message.

### No project specified

**Symptom:** `"No project specified and DEFAULT_PROJECT not set"`

**Fix:** Either pass `project` explicitly on every tool call, or set `DEFAULT_PROJECT` in the MCP server env configuration.

### TypeScript compilation check

To verify the server compiles without errors:

```bash
cd /Users/admin/gtm-board/server && npx tsc --noEmit
```

### Server fails to start

**Symptom:** MCP server shows as disconnected in Claude.

**Fix:**
1. Verify the path in `.mcp.json` is correct and absolute
2. Run the server manually to see errors: `npx tsx /Users/admin/gtm-board/server/src/index.ts`
3. Check that `npm install` has been run in the `server/` directory
4. Ensure Node.js v18+ is installed

### Metricool API access

**Symptom:** Metricool connector returns 401 or 403.

**Fix:** Metricool API access requires the Advanced plan ($22/mo) or Custom plan. The free/basic plans do not include API access. Verify your `METRICOOL_USER_TOKEN` is correct (found in Account Settings, API tab).

### Zernio account IDs

**Symptom:** `gtm_zernio_schedule` fails with missing account IDs.

**Fix:** Run `gtm_zernio_accounts` first to discover your profile and per-platform account IDs. Then either:
- Pass `account_ids` as a JSON map: `{"twitter":"acc_abc","linkedin":"acc_def"}`
- Or set `ZERNIO_ACCOUNTS` in your project `.env` with the same JSON format
