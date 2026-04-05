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
