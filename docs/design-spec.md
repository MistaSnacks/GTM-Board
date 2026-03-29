# GTM Board MCP Server — Design Spec

> A local MCP server that gives Claude structured tools for managing GTM kanban boards, tracking content cadence, pulling metrics from external APIs, and running autonomous research loops across multiple projects.

**Date:** 2026-03-14
**Status:** Approved
**First project:** TAILOR (gettailor.ai)

---

## 1. Problem

Strategy is over-documented but under-tracked. Marketing docs exist (GTM plan, authority-building playbook, LinkedIn/Reddit cadence, ad creatives, backlink targets) but there's no system to:

- See at a glance what's being worked on and what stage it's in
- Track whether the weekly LinkedIn/Reddit posting cadence is being followed
- Measure which channels/ads/posts are performing vs targets
- Auto-surface opportunities (Reddit threads to engage, competitor moves)
- Generate ad creatives from research insights

The tool must be local-only (never deployed), multi-project, and Claude-native.

---

## 2. Architecture: MCP Server + Markdown + Obsidian

### Decision

Approach C from brainstorming: an MCP server with structured tools, storing data as markdown files with YAML frontmatter. Obsidian is an optional visual layer that reads the same files.

### Why this approach

- "Accessed from the Claude environment" — MCP servers are native to Claude
- "Plug-and-play APIs" — each connector is an MCP tool handler
- "Local only" — MCP servers run locally by default
- "Multi-project" — project parameter on every tool call
- "Obsidian" — markdown files are Obsidian-compatible without any adaptation

### Directory structure

```
~/.gtm-board/
  server/                          # MCP server (TypeScript)
    src/
      index.ts                     # Server entry, tool registry
      tools/
        board.ts                   # Kanban CRUD
        cadence.ts                 # Content schedule tracking
        metrics.ts                 # KPI aggregation + performance analysis
        project.ts                 # Multi-project management
        research.ts                # Auto-research loop
        creative.ts                # Paper MCP integration for ad design
      connectors/
        supabase.ts                # User signups, revenue, engagement
        reddit.ts                  # Post/comment metrics
        google-search.ts           # Search Console: organic, branded search
        ga4.ts                     # GA4: traffic by source, UTM attribution
        meta-ads.ts                # (stub) Meta Marketing API
        google-ads.ts              # (stub) Google Ads API
        manual.ts                  # Manual entry for LinkedIn, backlinks
      lib/
        markdown.ts                # Read/write .md with YAML frontmatter
        config.ts                  # Project config loading
        exa.ts                     # Exa search wrapper for research
    package.json
    tsconfig.json
  projects/
    tailor/
      .env                         # API keys for TAILOR
      config.yaml                  # KPI targets, cadence schedule, connectors
      program.md                   # Auto-research loop instructions
      board/
        backlog/
        preparing/
        live/
        measuring/
        done/
      cadence/
        2026-03/
          linkedin.md
          reddit.md
      metrics/
        snapshots/                 # Weekly metric snapshots
        supabase.md
        reddit.md
        search-console.md
        ga4.md
        linkedin.md                # Manual entry
        backlinks.md               # Manual entry
        kpi-targets.md
      research/                    # Auto-research output
        # YYYY-MM-DD.md per run
```

### MCP registration

Added to project `.mcp.json` or `~/.claude/.mcp.json`. Note: uses absolute path (tilde is not expanded by `npx`):

```json
{
  "mcpServers": {
    "gtm-board": {
      "command": "npx",
      "args": ["tsx", "/Users/admin/.gtm-board/server/src/index.ts"],
      "env": { "GTM_HOME": "/Users/admin/.gtm-board" }
    }
  }
}
```

### Bootstrap script

A `setup.ts` script handles initial setup before the MCP server is running:

```bash
npx tsx /Users/admin/.gtm-board/server/src/setup.ts tailor
```

This creates the project directory, scaffolds config, and prompts for API keys. Solves the chicken-and-egg problem of needing a project before the MCP server is useful.

### API credentials

Stored per-project in `projects/<name>/.env`. The MCP server loads the correct `.env` when a project is specified. Claude never sees API keys — it calls structured tools that return results.

For TAILOR specifically, Supabase credentials can be read from the existing TAILOR project `.env` (configured via `config.yaml` pointer).

---

## 3. MCP Tools

### 3.1 Board Management

| Tool | Parameters | Description |
|------|-----------|-------------|
| `gtm_add_card` | `project, title, column, type, channel, details?, target_date?, tags?` | Create a kanban card (.md file). Types: `ad`, `post`, `outreach`, `seo`, `initiative`. Channels: `meta`, `google`, `reddit`, `linkedin`, `seo`, `email`, `other` |
| `gtm_move_card` | `project, card_id, to_column` | Move card between columns: `backlog → preparing → live → measuring → done` |
| `gtm_update_card` | `project, card_id, updates` | Update card frontmatter (metrics, notes, status, checklist items) |
| `gtm_list_cards` | `project, column?, type?, channel?` | List cards with optional filtering |
| `gtm_get_card` | `project, card_id` | Read full card content and frontmatter |

### 3.2 Content Cadence

| Tool | Parameters | Description |
|------|-----------|-------------|
| `gtm_log_post` | `project, platform, type, title, url?, metrics?` | Log a LinkedIn/Reddit post. `type` matches cadence schedule (educational, narrative, hot-take for LinkedIn). Auto-checks against weekly schedule |
| `gtm_log_comment` | `project, platform, count, subreddit?, notes?` | Log Reddit/LinkedIn comments for the day |
| `gtm_cadence_status` | `project, week?` | Returns schedule adherence: "LinkedIn: 2/3 posts (missing Friday), Reddit: 7/10 comments" |
| `gtm_cadence_streak` | `project` | Consecutive weeks hitting all targets |

### 3.3 Metrics & KPIs

| Tool | Parameters | Description |
|------|-----------|-------------|
| `gtm_status` | `project` | Single-call overview: board summary + cadence status + KPI snapshot. Most-used tool — avoids Claude needing 3 sequential calls for "how's TAILOR doing?" |
| `gtm_refresh_channel` | `project, channel` | Pull latest data from a specific connector |
| `gtm_refresh_all` | `project` | Refresh all enabled connectors |
| `gtm_get_kpis` | `project, period?` | Current KPIs vs targets. Returns green/red status per metric |
| `gtm_performance_summary` | `project` | "What's working, what's not" — returns structured object (see return format below) |
| `gtm_snapshot` | `project` | Save weekly metrics snapshot to `metrics/snapshots/` |

#### `gtm_performance_summary` return format

```typescript
{
  working: Array<{ channel: string; metric: string; value: number; target: number; trend: 'up' | 'down' | 'flat' }>;
  not_working: Array<{ channel: string; metric: string; value: number; target: number; trend: 'up' | 'down' | 'flat'; suggestion: string }>;
  opportunities: Array<{ source: string; description: string; url?: string }>;
  overall_score: number; // 0-100, percentage of KPIs meeting targets
}
```

### 3.4 Project Management

| Tool | Parameters | Description |
|------|-----------|-------------|
| `gtm_list_projects` | — | Show all configured projects with summary stats |
| `gtm_create_project` | `name, url?, description?` | Scaffold new project folder with default config |
| `gtm_set_targets` | `project, targets` | Update KPI targets |

### 3.5 Auto-Research Loop

| Tool | Parameters | Description |
|------|-----------|-------------|
| `gtm_research_run` | `project` | Execute one full research cycle: refresh metrics → search market → analyze → recommend → create cards. Returns structured findings. |
| `gtm_competitor_check` | `project, competitors?` | Exa search for competitor activity |
| `gtm_find_opportunities` | `project` | Search Reddit/LinkedIn for engagement opportunities |
| `gtm_research_history` | `project, limit?` | Past research runs and findings |

**Note on scheduling:** MCP servers are request/response — they cannot schedule recurring work. To run the research loop on a schedule, use the `/loop` skill: `/loop 7d gtm_research_run tailor`. The `program.md` file is a prompt template that Claude follows when invoked, not something the MCP server executes independently.

### 3.6 Creative Generation (Paper Integration)

| Tool | Parameters | Description |
|------|-----------|-------------|
| `gtm_generate_creative` | `project, card_id, concept, format?` | Returns creative brief and references brand standards. Claude then orchestrates with Paper MCP tools to design the ad. Writes artboard reference back to card. Card status set to "needs-review". |

**Note on cross-MCP orchestration:** The gtm-board server does not call Paper MCP directly. Claude orchestrates: it calls `gtm_generate_creative` to get the brief, then calls Paper tools (`create_artboard`, `write_html`, etc.) to produce the design, then calls `gtm_update_card` to link the artboard. This is a Claude-orchestrated multi-tool workflow.

---

## 4. Connectors

### Connector interface

Each connector implements:

```typescript
interface ProjectConfig {
  name: string;
  dataDir: string;        // e.g., /Users/admin/.gtm-board/projects/tailor
  envPath: string;        // path to project .env
  connectors: Record<string, ConnectorConfig>;
  targets: Record<string, Record<string, number>>;
}

interface ConnectorConfig {
  enabled: boolean;
  [key: string]: unknown; // connector-specific settings (username, site_url, etc.)
}

interface ChannelMetrics {
  channel: string;        // e.g., "reddit", "supabase"
  updated_at: string;     // ISO timestamp
  metrics: Record<string, number | null>; // metric_name → value
  raw?: unknown;          // connector-specific raw data for debugging
}

interface Connector {
  name: string;
  enabled: boolean;
  refresh(project: ProjectConfig): Promise<ChannelMetrics>;
  // Reads credentials from project .env
  // Writes results to metrics/<name>.md
  // Returns structured data for KPI aggregation
}
```

### v1 connectors (build now)

| Connector | API | What it pulls | Auth |
|-----------|-----|--------------|------|
| `supabase` | Supabase JS client | Signups, paid users, MRR, free→paid %, resumes/day, ATS scores | `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` |
| `reddit` | Reddit OAuth API — script-type grant (100 req/min) | Post upvotes, comment karma, referral traffic by UTM | `REDDIT_CLIENT_ID` + `REDDIT_CLIENT_SECRET` + `REDDIT_USERNAME` + `REDDIT_PASSWORD` |
| `google-search-console` | Search Console API | Branded search volume, organic clicks, top queries, avg position | Google OAuth service account |
| `ga4` | GA4 Data API | Traffic by source/medium, UTM attribution, landing pages | Google OAuth service account |
| `manual` | N/A (MCP tool input) | LinkedIn post metrics, backlink acquisition status | None |

### Stub connectors (interface only, TODO implementation)

| Connector | When to build |
|-----------|--------------|
| `meta-ads` | When Meta ad campaigns are running |
| `google-ads` | When Google ad campaigns are running |

---

## 5. Project Config (`config.yaml`)

```yaml
name: TAILOR
url: https://gettailor.ai
description: AI resume tailoring tool

# Pointer to existing project .env for shared credentials
project_env: /Users/admin/TAILOR/.env

connectors:
  supabase:
    enabled: true
  reddit:
    enabled: true
    username: "your-reddit-username"
    subreddits: [resumes, jobs, careerguidance, cscareerquestions, recruitinghell, SideProject]
  google_search_console:
    enabled: true
    site_url: "https://gettailor.ai"
  ga4:
    enabled: true
    property_id: "YOUR_GA4_PROPERTY_ID"
  meta_ads:
    enabled: false
  google_ads:
    enabled: false

cadence:
  linkedin:
    posts_per_week: 3
    schedule:
      monday: educational
      wednesday: narrative
      friday: hot-take
    comments_per_week: { min: 5, target: 10 }
  reddit:
    posts_per_week: { min: 0, target: 1 }
    comments_per_week: { min: 5, target: 10 }
    no_links_until: "2026-04-07"

targets:
  month_1:
    linkedin_followers: 500
    linkedin_impressions_per_post: 1000
    linkedin_engagement_rate: 0.03
    reddit_karma: 500
    reddit_referral_traffic: 0
    signups: 100
    free_to_paid_pct: 0.05
    meta_cpa: 8
    google_cpa: 10
    branded_search_volume: null  # baseline TBD
  month_3:
    linkedin_followers: 2000
    linkedin_impressions_per_post: 5000
    linkedin_engagement_rate: 0.05
    reddit_karma: 2000
    reddit_referral_traffic: 200
    signups: 500
    free_to_paid_pct: 0.08
    meta_cpa: 5
    google_cpa: 6

research:
  competitors: [teal, rezi, kickresume, jobscan, resumeworded]
  exa_search_queries:
    - "AI resume builder marketing strategy 2026"
    - "reddit resume tools discussion"
    - "linkedin job search content strategy"

creative:
  brand_doc: /Users/admin/TAILOR/docs/launch-ad-creatives-2026-03.md
  formats: ["1080x1080", "1080x1350", "1080x1920", "1200x628"]
  accent_color: "#22c55e"

reference_docs:
  - /Users/admin/TAILOR/docs/authority-building-playbook.md
  - /Users/admin/TAILOR/docs/gtm-marketing-plan.md
  - /Users/admin/TAILOR/docs/linkedin-reddit-cadence.md
  - /Users/admin/TAILOR/docs/reddit-launch-posts-2026-03-10.md
  - /Users/admin/TAILOR/docs/backlink-outreach-targets.md
  - /Users/admin/TAILOR/docs/marketing-deep-dive-2026-03-10.md
```

---

## 6. Card Format

Every kanban card is a `.md` file with YAML frontmatter:

```markdown
---
id: reddit-sideproject-launch
title: "r/SideProject launch post"
type: post
channel: reddit
column: preparing
created: 2026-03-14
target_date: 2026-04-07
tags: [launch, reddit, organic]
source: research  # or manual
metrics:
  upvotes: null
  comments: null
  referral_clicks: null
paper_artboard: null  # set by gtm_generate_creative
---

## Notes
First product showcase post. Wait until karma > 500.
Use format from authority-building-playbook.md Phase 3.

## Checklist
- [ ] 500+ karma earned
- [ ] 3 weeks of pure value comments
- [ ] Draft post reviewed
- [ ] UTM link ready
```

Card IDs are generated from the title (slugified) with a 4-character timestamp suffix to prevent collisions (e.g., `reddit-sideproject-launch-a1b2`). Files are named `{id}.md` in the column folder. Moving a card = moving the file between column directories.

---

## 7. Auto-Research Loop (`program.md`)

Adapted from Karpathy's autoresearch pattern. The `program.md` defines what the research agent does:

```markdown
# GTM Auto-Research Program — TAILOR

## Objective
Continuously improve marketing ROI by analyzing performance data,
researching market opportunities, and generating actionable recommendations.

## The Loop
1. Refresh all metrics via connectors
2. Compare current KPIs vs targets from config.yaml
3. Research the market:
   - Exa search for latest Reddit/LinkedIn growth tactics in the resume/job space
   - Check competitor activity (Teal, Rezi, Kickresume posts and positioning)
   - Find Reddit threads where TAILOR should be engaging
   - Check if any backlink outreach targets published new listicles
4. Analyze changes since last snapshot:
   - Which channel improved? Which declined?
   - Which post type / ad creative is winning?
   - Are we on track for monthly targets?
5. Write findings to research/YYYY-MM-DD.md:
   - What's working (with data)
   - What's not (with data)
   - Opportunities found (specific URLs/threads)
   - Recommendations (specific actions)
6. Create board cards for actionable recommendations
7. If recommendation is an ad creative: generate it via Paper MCP
8. Snapshot metrics for historical tracking
9. Never pause. Never ask. Keep iterating.

## Research Constraints
- Use Exa for web search (already available as MCP tool)
- Reference docs listed in config.yaml for brand/strategy alignment
- All recommendations must tie back to a KPI target
- Ad creatives must follow brand standards in launch-ad-creatives doc
- Cards auto-created with source: research and status: needs-review
```

### Semi-autonomous vs fully autonomous

The loop is **semi-autonomous**:
- Auto: refresh metrics, research market, analyze, recommend, create cards, design creatives
- Manual (you): publish posts, launch ads, update LinkedIn metrics, approve creatives

The `gtm_find_opportunities` tool can run continuously and surface "engage here now" alerts — closest to fully autonomous.

---

## 8. Backlink vs Brand Mention Tracking

Reddit and LinkedIn links are `nofollow` — no direct SEO value. The board tracks two separate categories:

| Category | Examples | What we track | SEO value |
|----------|---------|--------------|-----------|
| **Dofollow backlinks** | Zapier listicle, WIRED article, Product Hunt, G2, Medium articles | Acquired yes/no, DA of source, anchor text | Direct |
| **Brand mentions** | Reddit posts/comments, LinkedIn posts | Upvotes, engagement, referral traffic via UTM | Indirect (Reddit posts rank in Google — "SEO piggybacking") |

The backlink outreach targets from `docs/backlink-outreach-targets.md` are pre-loaded as board cards on first project setup. Each has a status field: `not-contacted → pitched → accepted → live → verified`.

---

## 9. Design System — Skeuomorphic Mission Control

The dashboard uses a skeuomorphic "mission control" aesthetic inspired by the reference images, mapped to TAILOR's brand palette. Dark mode only.

### Color Palette

| Token | Hex | HSL | Role |
|-------|-----|-----|------|
| `--bg-deep` | `#0A0A0F` | 240 10% 3.9% | Page background |
| `--bg-card` | `#12121A` | 240 10% 5.9% | Card surfaces |
| `--bg-card-raised` | `#1A1A25` | 240 10% 8% | Raised card elements, hover states |
| `--mint` | `#10B981` | 160 84% 39% | Primary accent, positive states, gauges, glows |
| `--turquoise` | `#14B8A6` | 175 80% 40% | Secondary accent, alternate highlights |
| `--amber` | `#F59E0B` | 45 93% 47% | Warnings, manual-entry indicators, "needs attention" |
| `--red` | `#EF4444` | 0 84% 60% | Critical alerts, KPIs below target |
| `--silver` | `#C0D0E0` | 210 20% 80% | Metallic labels, secondary text |
| `--text-primary` | `#FAFAFA` | 0 0% 98% | Primary text |
| `--text-muted` | `#64748B` | 215 16% 47% | Muted labels, timestamps |
| `--border` | `rgba(255,255,255,0.08)` | — | Card borders, dividers |
| `--glow-mint` | `rgba(16,185,129,0.15)` | — | Ambient glow behind positive metrics |
| `--glow-red` | `rgba(239,68,68,0.12)` | — | Ambient glow behind critical metrics |

### Typography

| Element | Font | Weight | Size | Tracking |
|---------|------|--------|------|----------|
| Dashboard title | Outfit | 700 | 28px | -0.02em |
| Card title | Outfit | 600 | 16px | -0.01em |
| KPI value (large) | Outfit | 700 | 36px | -0.03em |
| KPI label | Inter | 500 | 11px | 0.08em (uppercase) |
| Body text | Inter | 400 | 14px | normal |
| Mono values | JetBrains Mono / monospace | 500 | 13px | normal |

### Card Style (Skeuomorphic)

```css
.card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow:
    0 1px 0 rgba(255,255,255,0.03) inset,   /* top highlight bevel */
    0 -1px 0 rgba(0,0,0,0.3) inset,          /* bottom shadow bevel */
    0 4px 24px rgba(0,0,0,0.4);              /* drop shadow */
  backdrop-filter: blur(8px);
}
```

- Inner bevel gives physical depth (skeuomorphic)
- Subtle glass blur on hover
- Mint green glow on positive-state cards
- Cards have a thin top-edge highlight simulating reflected light

### Gauge / Metric Widgets

- **Circular gauges** for KPIs (CPA, ROAS, conversion rate) — arc fills with mint green, red zone past target
- **Animated progress bars** for cadence completion (3/3 LinkedIn posts this week)
- **Sparkline graphs** with mint gradient fill, no axes — inline with KPI cards
- **Bar charts** with skeuomorphic beveled bars, soft glow on hover
- **Status badges**: `ACTIVE` (mint glow), `CRITICAL` (red glow), `PENDING` (amber), `STABLE` (silver)

### Kanban Column Style

- Column headers use uppercase mono labels with status dot (green = active items, gray = empty)
- Cards within columns have subtle left-border accent color by channel:
  - Reddit: `#FF4500` (Reddit orange)
  - LinkedIn: `#0A66C2` (LinkedIn blue)
  - Meta: `#1877F2` (Meta blue)
  - Google: `#4285F4` (Google blue)
  - SEO: mint green
- Drag state: card lifts with stronger shadow + mint outline glow

### Animation

- Gauge arcs animate on load (0 → current value, 800ms ease-out)
- Sparklines draw left-to-right on mount
- KPI values count up on load
- Cards fade in staggered (50ms between cards)
- Status badge pulse animation for CRITICAL items
- Smooth column transitions when cards move

### Grid Layout

Dashboard uses a responsive CSS grid:
- **Top row**: 4-column KPI gauge cards (signups, MRR, conversion, cadence score)
- **Middle**: Kanban board (5 columns, scrollable)
- **Bottom row**: Channel performance cards (Reddit, LinkedIn, Ads, SEO) with sparklines
- **Sidebar** (collapsible): Research findings, opportunities, recent activity log

---

## 10. Tech Stack

| Component | Technology |
|-----------|-----------|
| MCP server | TypeScript, `@modelcontextprotocol/sdk` |
| Markdown I/O | `gray-matter` (YAML frontmatter parsing), `fs` |
| Config | `yaml` package for config.yaml |
| Reddit API | `snoowrap` or raw OAuth fetch |
| Google APIs | `googleapis` (Search Console + GA4) |
| Supabase | `@supabase/supabase-js` |
| Web search | Exa MCP (already available in environment) |
| Ad design | Paper MCP (already available in environment) |
| Package manager | npm |

---

## 10. What This Does NOT Do

- Does not deploy anywhere — runs only on localhost via MCP
- Does not post to Reddit/LinkedIn on your behalf
- Does not launch or modify ad campaigns
- Does not store sensitive data beyond API keys in local `.env` files
- Does not replace the existing admin analytics dashboard (that's production; this is local ops)

---

## 11. TAILOR First-Project Setup

On first run, `gtm_create_project("tailor")` should:

1. Scaffold the directory structure
2. Generate `config.yaml` with targets from `docs/gtm-marketing-plan.md` (Part 7)
3. Import backlink outreach targets from `docs/backlink-outreach-targets.md` as board cards
4. Create initial cadence config from `docs/authority-building-playbook.md` (weekly schedule)
5. Reference all marketing docs in `config.yaml`
6. Prompt for API keys (Reddit, Google) or accept them later

---

## 12. Obsidian Compatibility

The Obsidian Kanban plugin uses a single `.md` file with list-based columns, NOT subdirectories. Our directory-per-column design is incompatible with that specific plugin.

**Decision:** Keep directory-per-column as the primary storage (it's simpler for the MCP server and file-based operations). Add a `gtm_export_obsidian(project)` tool that generates a single Kanban-plugin-compatible `.md` file from the current board state. This runs on-demand — not a live sync.

Obsidian still works fine for browsing individual card files, research output, and metrics — just not with the Kanban plugin natively.

---

## 13. Build Phases

### Phase 1 — Core (build first)
- MCP server scaffold + tool registry
- `gtm_create_project`, `gtm_list_projects`
- Board CRUD: `gtm_add_card`, `gtm_move_card`, `gtm_update_card`, `gtm_list_cards`, `gtm_get_card`
- `gtm_status` (single-call overview)
- Markdown read/write library
- Config loading
- Bootstrap script (`setup.ts`)

### Phase 2 — Cadence + Metrics
- `gtm_log_post`, `gtm_log_comment`, `gtm_cadence_status`, `gtm_cadence_streak`
- Supabase connector
- Manual entry connector (LinkedIn, backlinks)
- `gtm_refresh_channel`, `gtm_refresh_all`, `gtm_get_kpis`, `gtm_snapshot`
- `gtm_performance_summary`

### Phase 3 — Research + Connectors
- Reddit connector
- Google Search Console connector
- GA4 connector
- `gtm_research_run`, `gtm_competitor_check`, `gtm_find_opportunities`, `gtm_research_history`

### Phase 4 — Creative + Polish
- `gtm_generate_creative` (Paper integration brief)
- `gtm_export_obsidian`
- `gtm_set_targets`
- Meta Ads / Google Ads stubs

---

## 14. Open Questions

1. **Google OAuth flow** — Search Console and GA4 require OAuth service accounts. The setup flow for this needs documentation during Phase 3.
2. **Metric history storage** — Weekly snapshots as markdown files work for now. If trend queries become slow, consider migrating to SQLite for time-series data.
