# Handoff: GTM Board → Team Edition

You are picking up work on **GTM Board**, an internal go-to-market tool at `/Users/admin/gtm-board`. Your job is to help turn it from a single-operator tool into a shared workspace for a **team of 3 builders**, then produce an implementation plan. This document is self-contained — read it fully before acting.

**IMPORTANT — process:** This work is mid-brainstorm under the `superpowers:brainstorming` skill. The design below has been presented but NOT yet written to a spec file or fully approved. Do NOT write code or scaffold anything yet. The next steps are: (1) get the two open decisions answered, (2) write the spec to `docs/superpowers/specs/2026-07-03-team-gtm-board-design.md` and commit it, (3) let the user review the spec, (4) invoke `superpowers:writing-plans` to produce the implementation plan. Invoke `superpowers:brainstorming` yourself at the start to stay in-process.

---

## What GTM Board is

An MCP server + Next.js dashboard for tracking go-to-market execution (content cadence, kanban boards, ad metrics, research loops, AI agent task tracking). Solo-built by the founder of gettailor.ai.

- **MCP server** (`server/src/`, ~6,100 LOC TS): entry `server/src/index.ts` (~1,206 lines) registers **53 MCP tools**. Runs over stdio by default; has an optional StreamableHTTP transport (`server/src/index.ts:1164-1200`). Tools in `server/src/tools/*`, integrations in `server/src/connectors/*`.
- **Dashboard** (`dashboard/`, ~7,350 LOC TS/TSX): Next.js 15 / React 19 / Tailwind 4, App Router, 15 routes. Data layer in `dashboard/lib/data.ts` (~1,087 lines).
- **Storage**: Supabase, all tables `gtm_`-prefixed (`gtm_projects`, `gtm_cards`, `gtm_agent_task_details`, `gtm_metrics`, `gtm_snapshots`, `gtm_cadence_logs`, `gtm_research_runs`, `gtm_subtasks`). Schema at `supabase/migrations/20260402_001_initial_schema.sql` — clean, well-indexed, jsonb metadata, cascade deletes. **This is the strongest artifact in the repo.**
- **Working connectors** (real API calls, genuine value): Metricool, Stripe, Meta Ads (read + write/campaign creation), Google Ads (read + write), Google Search Console, Reddit, Zernio.
- **`ralph.sh`**: a dev-time bash loop that pipes `PROMPT.md` into Claude iteratively — build automation, NOT a runtime component.
- **Legacy**: `projects/` holds pre-Supabase file-based storage (markdown cards). App has migrated to Supabase; this is now dead weight/source-of-truth confusion.
- Two seeded projects: `tailor` (real data) and `groomlocal` (minimal).
- Tech versions all current: MCP SDK ^1.12.1, supabase-js ^2.99+, Next ^15, React ^19, Tailwind ^4, TS ^5.7. Both tsconfigs `strict: true`; dashboard `tsc --noEmit` exits 0.

## The decision: ITERATE, don't rebuild

An end-to-end audit concluded ~60-65% of durable value is in the **schema + connectors + seeded GTM data** (rebuild-proof), ~35-40% in app code (competent but single-tenant and duplicated). The multi-user gap is **additive**, not a reason to start over. The user chose **Option A: iterate in phases**. (Proceeded on recommendation while user was AFK — reconfirm if they push back.)

## Audit findings — the real gaps

1. **No auth, no multi-tenancy.** No Supabase Auth, no login, no middleware. The `gtm-project` cookie picks the active project, NOT identity. No `user_id`/`team_id`/`owner` columns on any table. No RLS anywhere. Anyone with the dashboard URL has full read/write.
2. **Service-role key sprawl.** Both `server/src/lib/supabase.ts:19` and `dashboard/lib/supabase.ts:4` use `GTM_SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS). Dashboard is server-rendered so the key stays server-side, but combined with no login = open DB.
3. **Unauthenticated HTTP MCP endpoint.** `server/src/index.ts:1183` serves `/mcp` with no token check. Dangerous the moment it's exposed beyond localhost.
4. **Duplication across server/dashboard.** No shared package. Types duplicated (`dashboard/lib/types.ts` vs `server/src/connectors/types.ts`). `getProjectId(slug)` reimplemented in both. Schema changes require editing two codebases.
5. **Onboarding friction.** Second person must: clone, `npm install` in both packages, place the service-role secret in 3 spots, hand-edit `~/.claude/.mcp.json` with an absolute path, set `GTM_HOME` (else defaults to founder's `/Users/admin/gtm-board`), collect ~21 connector secrets. No `.env.example`, no setup script, no seeded demo tenant.
6. **Founder-machine assumptions**: `GTM_HOME` default (`server/src/lib/config.ts:15`), Zernio hardcodes `gettailor.ai` UTM injection (`server/src/connectors/zernio.ts:100-102`).
7. **Incomplete features**: GA4 connector is a stub (`server/src/connectors/ga4.ts:36`, returns `{status:"stub"}`); backlinks page is a "coming soon" placeholder (`dashboard/app/backlinks/backlinks-client.tsx:32`). The latest checklist/subtask UI was only typecheck/build-verified via Ralph, never human smoke-tested.
8. **Near-zero tests**: 2 files, ~96 lines, pure-helper unit tests only. No server/integration/connector tests. Bus-factor 1 (single author, no reviews).

## Already done this session

- **Security fix (committed to working tree, not yet git-committed):** `dashboard/.env.local` held live secrets (service-role JWT, Meta token, Google refresh token) and was NOT gitignored — one `git add -A` from leaking. Added `.env.local`, `.env*.local`, `tsconfig.tsbuildinfo` to root `.gitignore`. Verified `git check-ignore` now matches. The file was never committed, so no history rewrite needed. **Key rotation is still on the roadmap** (treat those secrets as compromised-adjacent).

## Research context (informs the design)

- The reference the user called "Corey Schneider" is almost certainly **Cody Schneider** — growth engineer (Swell AI, Drafthorse, Graphed.com). His **GTM Engineering Crash Course** = using Claude Code as the GTM execution engine (mass ad gen, scraping→outreach, enrichment, an "AI data analyst"). Validates GTM Board's architecture as on-trend, not a dead end.
- **Clay patterns worth borrowing** (prioritized): (1) **Playbooks as shareable templates** — share structure + one sample row, not data; (2) **Unlimited seats, usage metered** — one workspace, shared visible usage ledger, no per-seat gating; (3) **Versioned, deploy-once agents**; (4) **Workspace-level shared credentials** so teammates never touch API keys.
- **Corey Haines' `marketingskills`** (open-source Agent Skills repo) can seed a shared context/skills layer.
- Landscape (Copy.ai GTM, Attio, folk): converges on a versioned shared context layer, signal-triggered workflows, MCP-accessible data.

## The team's shape (from the user)

All 3 are **builders**; each uses the board for different reasons. Implication: **no role-gated permissions** — everyone gets the full surface. What matters instead is **per-person views** (my cards, my agent tasks, my usage) layered on shared state. They interact via: (a) authenticated web dashboard, (b) each person's own Claude connected to a shared hosted MCP, and (c) a **Slack or Discord channel** (platform still undecided — see open questions).

## Proposed design (presented, not yet spec'd)

**Repo becomes a real npm-workspaces monorepo.** New package + two new deployables:

- **`packages/core` (new):** shared types + Supabase queries + business logic (checklist progress, card scoping). Extracted from duplicated `server/src` + `dashboard/lib` code; both import it.
- **`server/`:** MCP server, deployed to **Railway or Fly.io** (long-running Node process — wrong shape for Vercel). StreamableHTTP transport behind **per-member bearer tokens**. Stdio mode retained for founder's local use.
- **`dashboard/`:** Next.js on Vercel (finish the stalled deploy), now with login.
- **`bot/` (new, Phase 3):** thin worker translating chat commands/notifications to `packages/core`. Platform-agnostic adapter; Slack + Discord implementations.

**Identity & team model:** Supabase Auth (Google sign-in, magic-link fallback). New `gtm_members` table (user_id, name, role, mcp_token_hash). Add `assignee` + `created_by` to `gtm_cards` and `gtm_agent_task_details`. **RLS on all tables**: workspace members read/write everything (3 builders, no role gates); non-members see nothing. Dashboard switches to **anon key + user session**; service-role key survives ONLY inside the deployed MCP server. Rotate existing keys.

**Hosted MCP:** each member gets a personal token (shown once on a dashboard settings page). Their `.mcp.json` entry = URL + token (no clone, no env, no `GTM_HOME`). Every tool call records the acting member → free audit trail + feeds the usage ledger.

**Per-person + shared views:** Overview + Kanban get "mine vs everyone" filters on assignee; daily brief becomes per-member + a shared team section.

**Clay-inspired layer (Phase 4):** (a) playbook templates (structure + sample); (b) shared context layer (ICP/positioning/brand-voice as MCP resources every session inherits; seed from marketingskills); (c) usage ledger (per-member, per-connector call counts).

**Onboarding flow (kills the "tedious" pain):** invite by email from dashboard → Google sign-in → settings page shows MCP URL + token + copy-paste Claude config → done. Local dev gets `.env.example` + `scripts/setup.sh`.

**Cleanup/hardening in-line:** rotate keys; delete GA4 stub + backlinks placeholder (or finish GA4 only if wanted — recommend delete until asked); decommission legacy `projects/` file storage; add `packages/core` tests; human smoke-test the checklist/subtask UI.

**Phasing (each ships independently):**
- **Phase 1:** monorepo + core extraction + auth + RLS + Vercel deploy live. *Team gets dashboard value here.*
- **Phase 2:** hosted MCP + tokens + onboarding page.
- **Phase 3:** chat bot (Slack or Discord first).
- **Phase 4:** playbooks + context layer + usage ledger.

**Testing:** core gets unit tests as extracted; RLS policies get integration tests (member A sees data, stranger sees nothing); MCP auth gets token-rejection test; each phase ends with a real-browser smoke test.

## Open questions to resolve with the user before writing the spec

1. **Confirm Option A** (iterate in phases) — was chosen while user AFK; reconfirm.
2. **Chat platform first: Slack or Discord?** (User said "both" early, later context suggests picking one to ship first and abstracting the notifier.)
3. **Auth provider**: Google sign-in assumed (team is on Google-style workspace emails) — confirm.
4. **MCP hosting**: Railway vs Fly.io — user preference, or let implementer choose cheapest/simplest?
5. **GA4 + backlinks**: delete or finish? (Recommend delete until someone asks.)

## Your immediate next actions

1. Re-invoke `superpowers:brainstorming` to stay in-process.
2. Read the current code to verify these findings are still accurate (memories/audit are from this session but confirm file:line before asserting).
3. Get the 5 open questions answered (batch them).
4. Write + commit the spec to `docs/superpowers/specs/2026-07-03-team-gtm-board-design.md`, run the spec self-review, then ask the user to review.
5. On approval, invoke `superpowers:writing-plans`.

## Useful facts

- Git: branch `main`, single author "Camren McMath", GitHub `MistaSnacks/GTM-Board` (private).
- Supabase project ref: `qgcrjcpahhmwlrshmtuo` (separate account from the TAILOR product's Supabase).
- Vercel: project "dashboard", team `camrens-projects-24b42280`. First deploy failed on `@hello-pangea/dnd@17` peer dep vs React 19; bumped to v18 locally but deploy not retried.
- Dashboard dev port: 8080.
- User is the solo founder of gettailor.ai (GitHub MistaSnacks), multi-machine dev, email camren@gettailor.ai.
