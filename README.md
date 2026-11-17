# GTM Board

MCP server + Next.js dashboard for tracking go-to-market execution across multiple projects. Manages kanban boards, content cadence, channel metrics, research runs, and agent tasks — all backed by Supabase.

## Architecture

```
server/          MCP server (48+ tools) — runs locally via Claude Code
dashboard/       Next.js 15 app — deployed to Vercel
```

- **MCP server**: Provides Claude with structured tools for board management, metrics refresh, cadence logging, research, UGC briefs, and more. Runs as a stdio MCP server or HTTP transport.
- **Dashboard**: Read-only web UI showing kanban boards, metrics charts, cadence tracking, ad performance, and agent tasks. Deployed at Vercel.

Both layers share a Supabase database (`gtm_projects`, `gtm_cards`, `gtm_metrics`, `gtm_snapshots`, `gtm_cadence_logs`, `gtm_research_runs`).

## Setup

### 1. Clone and install

```bash
git clone https://github.com/MistaSnacks/GTM-Board.git
cd GTM-Board
cd server && npm install
cd ../dashboard && npm install
```

### 2. Environment variables

**Supabase** (required for both server and dashboard):

| Variable | Description |
|----------|-------------|
| `GTM_SUPABASE_URL` | Supabase project URL |
| `GTM_SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `DEFAULT_PROJECT` | Default project slug (e.g. `tailor`) |

**Dashboard** (`dashboard/.env.local`):

```env
GTM_SUPABASE_URL=https://your-project.supabase.co
GTM_SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
DEFAULT_PROJECT=tailor
```

**Connector API keys** (optional, set in MCP server env for metrics refresh):

| Variable | Connector |
|----------|-----------|
| `METRICOOL_API_TOKEN` | Metricool (social metrics) |
| `META_ACCESS_TOKEN` | Meta Ads |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | Google Ads |
| `GOOGLE_CLIENT_ID` | Google OAuth |
| `GOOGLE_CLIENT_SECRET` | Google OAuth |
| `GOOGLE_REFRESH_TOKEN` | Google OAuth |
| `STRIPE_SECRET_KEY` | Stripe (revenue) |

### 3. Configure MCP server in Claude Code

Add to `~/.claude/.mcp.json`:

```json
{
  "mcpServers": {
    "gtm-board": {
      "command": "npx",
      "args": ["tsx", "/path/to/GTM-Board/server/src/index.ts"],
      "env": {
        "GTM_HOME": "/path/to/GTM-Board",
        "DEFAULT_PROJECT": "tailor",
        "GTM_SUPABASE_URL": "https://your-project.supabase.co",
        "GTM_SUPABASE_SERVICE_ROLE_KEY": "your-service-role-key"
      }
    }
  }
}
```

Replace `/path/to/GTM-Board` with your actual clone path.

### 4. Run the dashboard locally

```bash
cd dashboard
npm run dev    # starts on port 8080
```

### 5. Deploy dashboard to Vercel

```bash
cd dashboard
vercel --prod
```

Set environment variables in Vercel project settings:
- `GTM_SUPABASE_URL`
- `GTM_SUPABASE_SERVICE_ROLE_KEY`
- `DEFAULT_PROJECT`

## Dashboard pages

| Route | Description |
|-------|-------------|
| `/` | Overview with KPIs, board summary, cadence |
| `/today` | Today items from every producer, across all projects |
| `/kanban` | Marketing kanban board with drag-and-drop |
| `/agent-tasks` | Agent tasks kanban board |
| `/analytics` | Funnel, weekly deltas, channel history |
| `/seo` | SEO metrics and trends |
| `/socials` | Social media metrics |
| `/meta-ads` | Meta Ads performance |
| `/google-ads` | Google Ads performance |
| `/revenue` | Revenue tracking |
| `/backlinks` | Backlink tracking |
| `/content` | Content pipeline |
| `/research` | Research run history |
| `/ugc` | UGC briefs and pipeline |

## Today items

The Today page reads one table, `gtm_items`. The contract is `harness-specs/06-today-items-contract.md`. The store in `server/src/items/store.ts` holds every rule; the MCP tools, the dashboard, the collectors, the dispatcher and the CLI below call it.

### The items CLI

`scripts/gtm-items` is for producers outside this repo, such as the SEO harness. It finds its own directory, so it runs from any directory and from launchd. Do not import `default-store.ts` from another repo; call the CLI.

```bash
scripts/gtm-items add --file items.json [--dry-run]
scripts/gtm-items sync --source seo:tailor --file items.json --complete [--allow-empty] [--dry-run]
scripts/gtm-items update (--key <dedupe_key> | --id <uuid>) --file patch.json [--dry-run]
scripts/gtm-items list [--source <source>] [--status open|snoozed|done|dismissed] [--project <slug>]
```

- `add` and `sync` read a JSON array of `ItemInput`. The whole file is checked before the first write.
- `sync` closes each open item of the source that the file leaves out. It refuses to run without `--complete`, and refuses an empty file without `--allow-empty`.
- `update` takes a patch with `status`, `priority`, `owner`, `due_at`, `snoozed_until`, and, for an open row, `title`, `why`, `link` and `evidence`. Evidence merges by label. A key with no row is not an error: it is listed under `not_found`.
- `--dry-run` reads the board, runs the same store logic in memory and writes nothing.
- stdout is exactly one JSON object: `{ok, command, dry_run, created, updated, skipped_closed, closed, not_found, errors}`, each a list of dedupe keys, and `errors` as `{key, message}`. `list` adds `items`. Logs go to stderr.
- The exit code is 0 when `ok` is true and 1 on any fault. After a partial write, the key lists show what was written.

### Recurring templates

`server/src/items/recurring.ts` holds the templates. The recurring collector (`scripts/collect.ts recurring`) writes the rows of the current day and ISO week through `rotateRecurring`, which keeps one open row for each template:

- An open row of an older period, or of a template that no longer exists, closes as `done` with `closed_reason: resolved`. No person closed it, and nobody chose to drop it.
- An older row whose `delegation_state` is `queued`, `running`, `returned` or `failed` holds the slot. It stays open, and its template gets no new-period row until a person recalls, finishes or dismisses it. A returned or failed row carries a note to read first.
- A row with any delegation state, and a snoozed row, never close by this rule.
- A second run changes nothing, and a run that stopped part way converges on the next run.

The SEO harness computes the CTR, index, data-floor and weekly audit checks and syncs them as `seo:<project>` items, so those templates are gone.

### Tasks that only Camren may do

Only Camren sends, posts, publishes, deploys or submits. A template with `humanOnly: true` (today `gl-community-answer`) never goes to an agent. The row's template comes from its dedupe key, `rule:<template_id>:<period>`.

- `delegateItem` (the dashboard's "Send to Hermes") refuses the row.
- The dispatcher returns a queued row of such a template with a note and starts no Hermes job. This also catches a row queued by a direct write to the table.
- Every prompt that the dispatcher gives Hermes says never to send, post, publish, deploy or submit, and to return a draft for Camren.
