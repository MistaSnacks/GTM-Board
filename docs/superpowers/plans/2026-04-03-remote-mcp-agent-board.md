# Remote MCP + Agent Tasks Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable remote agents to call GTM Board MCP tools over HTTP, and add an Agent Tasks Kanban board tab to the dashboard.

**Architecture:** The MCP server already uses Supabase for all data. We add a Streamable HTTP transport alongside stdio so remote agents connect via URL. The dashboard already reads from Supabase — we add an `/agent-tasks` page mirroring the existing `/kanban` pattern. Existing filesystem cards/metrics get seeded into Supabase via a one-time migration script.

**Tech Stack:** MCP SDK (Streamable HTTP transport), Next.js 15, Supabase, @hello-pangea/dnd, Tailwind CSS 4

---

## Status of Existing Migration

These are already done — do NOT redo:
- All MCP server tools read/write Supabase (board.ts, agent-tasks.ts, metrics.ts, cadence.ts, research.ts, analytics.ts, alerts.ts, geo.ts, ugc.ts, creative.ts, project.ts)
- Agent task MCP tools registered in index.ts (gtm_create_agent_task, gtm_update_agent_task, gtm_list_agent_tasks, gtm_get_agent_task)
- Dashboard data.ts reads from Supabase
- Both projects (tailor, groomlocal) seeded in gtm_projects table
- Supabase client configured in both server (`server/src/lib/supabase.ts`) and dashboard (`dashboard/lib/supabase.ts`)

## File Structure

**Server changes:**
- Modify: `server/src/index.ts` — add HTTP transport alongside stdio
- Modify: `server/package.json` — add `express` dependency (for HTTP server)

**Dashboard changes:**
- Create: `dashboard/app/agent-tasks/page.tsx` — server component
- Create: `dashboard/app/agent-tasks/agent-tasks-client.tsx` — client component with kanban
- Create: `dashboard/components/agent-task-card.tsx` — agent task card with priority/agent badges
- Modify: `dashboard/components/sidebar.tsx` — add Agent Tasks nav item
- Modify: `dashboard/lib/data.ts` — add `getAgentBoard()` and `moveAgentTask()` functions
- Modify: `dashboard/lib/types.ts` — add `AgentTaskData` and `AgentBoardData` types
- Modify: `dashboard/app/actions.ts` — add `moveAgentTaskAction()` server action
- Modify: `dashboard/next.config.ts` — remove hardcoded GTM_HOME

**Migration script:**
- Create: `scripts/seed-existing-data.ts` — one-time filesystem → Supabase migration

**Deployment:**
- Create: `dashboard/vercel.json` — if needed for env config

---

### Task 1: Add Streamable HTTP Transport to MCP Server

**Files:**
- Modify: `server/src/index.ts:1159-1169`
- Modify: `server/package.json`

The MCP SDK `@modelcontextprotocol/sdk@^1.12.1` includes `StreamableHTTPServerTransport`. We add a simple HTTP server that wraps the MCP server, listening on a configurable port. Stdio transport remains the default for local Claude Code use; HTTP runs when `--http` flag or `MCP_HTTP_PORT` env var is set.

- [ ] **Step 1: Add express dependency**

```bash
cd /Users/admin/gtm-board/server && npm install express && npm install -D @types/express
```

- [ ] **Step 2: Update server/src/index.ts to support dual transport**

Replace the `main()` function at the bottom of `server/src/index.ts` (lines 1159-1169) with:

```typescript
import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

// ... (keep all existing imports and tool registrations above)

// ── Start server ──

async function main() {
  const httpPort = process.env.MCP_HTTP_PORT || (process.argv.includes("--http") ? "3200" : null);

  if (httpPort) {
    // HTTP transport — remote agents connect here
    const app = express();
    app.use(express.json());

    app.post("/mcp", async (req, res) => {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // stateless
      });
      res.on("close", () => transport.close());
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    });

    // Health check
    app.get("/health", (_req, res) => res.json({ status: "ok" }));

    app.listen(Number(httpPort), () => {
      console.log(`GTM Board MCP server listening on HTTP port ${httpPort}`);
    });
  } else {
    // Stdio transport — local Claude Code
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }
}

main().catch((err) => {
  console.error("Server failed to start:", err);
  process.exit(1);
});
```

**Important:** The `StreamableHTTPServerTransport` import path is `@modelcontextprotocol/sdk/server/streamableHttp.js`. Check the installed SDK version supports this — if not, the import path may be `@modelcontextprotocol/sdk/server/streamablehttp.js` (lowercase). Verify with:
```bash
ls node_modules/@modelcontextprotocol/sdk/dist/server/
```

- [ ] **Step 3: Test stdio still works**

```bash
cd /Users/admin/gtm-board/server && echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"0.1"}}}' | npx tsx src/index.ts 2>/dev/null | head -5
```

Expected: JSON response with server capabilities.

- [ ] **Step 4: Test HTTP transport**

Terminal 1:
```bash
cd /Users/admin/gtm-board/server && MCP_HTTP_PORT=3200 npx tsx src/index.ts
```

Terminal 2:
```bash
curl -s http://localhost:3200/health
```

Expected: `{"status":"ok"}`

- [ ] **Step 5: Commit**

```bash
cd /Users/admin/gtm-board && git add server/src/index.ts server/package.json server/package-lock.json
git commit -m "feat: add HTTP transport for remote MCP agent access"
```

---

### Task 2: Add Agent Board Types and Data Functions

**Files:**
- Modify: `dashboard/lib/types.ts`
- Modify: `dashboard/lib/data.ts`

- [ ] **Step 1: Read current types file**

```bash
cat /Users/admin/gtm-board/dashboard/lib/types.ts
```

Understand existing types before adding new ones.

- [ ] **Step 2: Add agent task types to `dashboard/lib/types.ts`**

Append these types:

```typescript
// --- Agent Tasks ---

export type AgentTaskColumn = "queued" | "in_progress" | "blocked" | "review" | "done";

export interface AgentTaskData {
  id: string;
  card_id: string;
  title: string;
  column: AgentTaskColumn;
  body: string;
  assigned_agent: string | null;
  priority: "critical" | "high" | "medium" | "low";
  depends_on: string[];
  output: Record<string, unknown> | null;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
  retries: number;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface AgentBoardData {
  columns: Record<AgentTaskColumn, AgentTaskData[]>;
}
```

- [ ] **Step 3: Add data functions to `dashboard/lib/data.ts`**

Add these functions:

```typescript
import type { AgentTaskData, AgentTaskColumn, AgentBoardData } from "./types";

const AGENT_COLUMNS: AgentTaskColumn[] = ["queued", "in_progress", "blocked", "review", "done"];

// Map DB column_name values to agent task columns
// The DB stores marketing column names (backlog/preparing/live/measuring/done)
// We map: backlog→queued, preparing→in_progress, live→blocked, measuring→review, done→done
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
  const details = Array.isArray(row.gtm_agent_task_details)
    ? (row.gtm_agent_task_details as Record<string, unknown>[])[0]
    : (row.gtm_agent_task_details as Record<string, unknown> | null);
  const meta = (row.metadata || {}) as Record<string, unknown>;
  const dbCol = (row.column_name as string) || "backlog";

  return {
    id: row.slug as string,
    card_id: row.id as string,
    title: (row.title as string) || "Untitled",
    column: DB_TO_AGENT_COLUMN[dbCol] || "queued",
    body: (row.body as string) || "",
    assigned_agent: (details?.assigned_agent as string) || null,
    priority: (details?.priority as AgentTaskData["priority"]) || "medium",
    depends_on: (details?.depends_on as string[]) || [],
    output: (details?.output as Record<string, unknown>) || null,
    error: (details?.error as string) || null,
    started_at: (details?.started_at as string) || null,
    completed_at: (details?.completed_at as string) || null,
    retries: (details?.retries as number) || 0,
    tags: (meta.tags as string[]) || [],
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
    .select(`
      *,
      gtm_agent_task_details (
        assigned_agent,
        priority,
        depends_on,
        output,
        error,
        started_at,
        completed_at,
        retries
      )
    `)
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
```

- [ ] **Step 4: Verify types compile**

```bash
cd /Users/admin/gtm-board/dashboard && npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors related to agent task types.

- [ ] **Step 5: Commit**

```bash
cd /Users/admin/gtm-board && git add dashboard/lib/types.ts dashboard/lib/data.ts
git commit -m "feat: add agent board data types and Supabase query functions"
```

---

### Task 3: Add Server Action for Agent Task Moves

**Files:**
- Modify: `dashboard/app/actions.ts`

- [ ] **Step 1: Add moveAgentTaskAction to `dashboard/app/actions.ts`**

Add after the existing `moveCardAction`:

```typescript
import { moveAgentTask } from "@/lib/data";
import type { AgentTaskColumn } from "@/lib/types";

export async function moveAgentTaskAction(
  project: string,
  taskSlug: string,
  fromColumn: AgentTaskColumn,
  toColumn: AgentTaskColumn
): Promise<void> {
  await moveAgentTask(project, taskSlug, fromColumn, toColumn);
  revalidatePath("/", "layout");
}
```

- [ ] **Step 2: Verify compilation**

```bash
cd /Users/admin/gtm-board/dashboard && npx tsc --noEmit 2>&1 | head -10
```

- [ ] **Step 3: Commit**

```bash
cd /Users/admin/gtm-board && git add dashboard/app/actions.ts
git commit -m "feat: add server action for agent task column moves"
```

---

### Task 4: Build Agent Task Card Component

**Files:**
- Create: `dashboard/components/agent-task-card.tsx`
- Reference: `dashboard/components/kanban-card.tsx` (copy pattern)

- [ ] **Step 1: Read existing kanban-card.tsx for styling patterns**

```bash
cat /Users/admin/gtm-board/dashboard/components/kanban-card.tsx
```

- [ ] **Step 2: Create `dashboard/components/agent-task-card.tsx`**

Build a card component that shows:
- Title
- Priority badge (color-coded: critical=red, high=orange, medium=blue, low=gray)
- Assigned agent badge (if set)
- Error indicator (if error is set)
- Retry count (if > 0)
- Tags

Follow the exact same CSS variable patterns from kanban-card.tsx (use `var(--bg-card)`, `var(--border)`, `var(--mint)`, `var(--text-secondary)`, etc).

```tsx
"use client";

import type { AgentTaskData } from "@/lib/types";

const PRIORITY_COLORS: Record<string, string> = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#3b82f6",
  low: "#6b7280",
};

interface AgentTaskCardProps {
  task: AgentTaskData;
  onClick?: () => void;
}

export default function AgentTaskCard({ task, onClick }: AgentTaskCardProps) {
  const priorityColor = PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.medium;

  return (
    <div
      onClick={onClick}
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderLeft: `3px solid ${priorityColor}`,
        borderRadius: "8px",
        padding: "10px 12px",
        cursor: "pointer",
        transition: "border-color 0.15s",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-inter)",
          fontSize: "13px",
          color: "var(--text-primary, #e2e8f0)",
          fontWeight: 500,
          marginBottom: "6px",
          lineHeight: 1.3,
        }}
      >
        {task.title}
      </div>

      <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
        {/* Priority */}
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "10px",
            color: priorityColor,
            background: `${priorityColor}15`,
            padding: "2px 6px",
            borderRadius: "4px",
            textTransform: "uppercase",
          }}
        >
          {task.priority}
        </span>

        {/* Assigned agent */}
        {task.assigned_agent && (
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "10px",
              color: "var(--mint)",
              background: "var(--mint-dim, rgba(16,185,129,0.1))",
              padding: "2px 6px",
              borderRadius: "4px",
            }}
          >
            {task.assigned_agent}
          </span>
        )}

        {/* Error indicator */}
        {task.error && (
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "10px",
              color: "#ef4444",
              background: "rgba(239,68,68,0.1)",
              padding: "2px 6px",
              borderRadius: "4px",
            }}
          >
            ERR{task.retries > 0 ? ` x${task.retries}` : ""}
          </span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify compilation**

```bash
cd /Users/admin/gtm-board/dashboard && npx tsc --noEmit 2>&1 | head -10
```

- [ ] **Step 4: Commit**

```bash
cd /Users/admin/gtm-board && git add dashboard/components/agent-task-card.tsx
git commit -m "feat: add agent task card component with priority and agent badges"
```

---

### Task 5: Build Agent Tasks Page

**Files:**
- Create: `dashboard/app/agent-tasks/page.tsx`
- Create: `dashboard/app/agent-tasks/agent-tasks-client.tsx`

- [ ] **Step 1: Create server component `dashboard/app/agent-tasks/page.tsx`**

Follow the exact pattern from `dashboard/app/kanban/page.tsx`:

```tsx
import { getProjects, getConfig, getActiveProject } from "@/lib/config";
import { getAgentBoard } from "@/lib/data";
import PageShell from "@/components/page-shell";
import AgentTasksClient from "./agent-tasks-client";

export const dynamic = "force-dynamic";

export default async function AgentTasksPage() {
  const projects = await getProjects();
  const activeProject = await getActiveProject();
  const board = await getAgentBoard(activeProject);

  return (
    <PageShell projects={projects} activeProject={activeProject}>
      <AgentTasksClient board={board} project={activeProject} />
    </PageShell>
  );
}
```

- [ ] **Step 2: Create client component `dashboard/app/agent-tasks/agent-tasks-client.tsx`**

Mirror the kanban-client.tsx pattern but use agent task columns and the AgentTaskCard component. Use `@hello-pangea/dnd` for drag-and-drop (same library as kanban board).

```tsx
"use client";

import { useState, useCallback } from "react";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";
import PageHeader from "@/components/page-header";
import AgentTaskCard from "@/components/agent-task-card";
import { moveAgentTaskAction } from "@/app/actions";
import type { AgentBoardData, AgentTaskColumn, AgentTaskData } from "@/lib/types";

const COLUMNS: { id: AgentTaskColumn; label: string }[] = [
  { id: "queued", label: "QUEUED" },
  { id: "in_progress", label: "IN PROGRESS" },
  { id: "blocked", label: "BLOCKED" },
  { id: "review", label: "REVIEW" },
  { id: "done", label: "DONE" },
];

interface AgentTasksClientProps {
  board: AgentBoardData;
  project: string;
}

export default function AgentTasksClient({ board: initialBoard, project }: AgentTasksClientProps) {
  const [board, setBoard] = useState(initialBoard);
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");

  const handleDragEnd = useCallback(
    (result: DropResult) => {
      const { source, destination, draggableId } = result;
      if (!destination) return;
      if (source.droppableId === destination.droppableId && source.index === destination.index) return;

      const fromCol = source.droppableId as AgentTaskColumn;
      const toCol = destination.droppableId as AgentTaskColumn;

      // Optimistic update
      setBoard((prev) => {
        const next = { columns: { ...prev.columns } };
        for (const col of COLUMNS) {
          next.columns[col.id] = [...prev.columns[col.id]];
        }

        const [moved] = next.columns[fromCol].splice(source.index, 1);
        if (moved) {
          moved.column = toCol;
          next.columns[toCol].splice(destination.index, 0, moved);
        }
        return next;
      });

      moveAgentTaskAction(project, draggableId, fromCol, toCol);
    },
    [project]
  );

  // Collect unique agents for filter
  const allTasks = Object.values(board.columns).flat();
  const agents = Array.from(new Set(allTasks.map((t) => t.assigned_agent).filter(Boolean))) as string[];

  // Apply filters
  const filterTask = (task: AgentTaskData) => {
    if (agentFilter !== "all" && task.assigned_agent !== agentFilter) return false;
    if (priorityFilter !== "all" && task.priority !== priorityFilter) return false;
    return true;
  };

  const selectStyle: React.CSSProperties = {
    fontFamily: "var(--font-mono)",
    fontSize: "12px",
    color: "var(--mint)",
    backgroundColor: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderRadius: "8px",
    padding: "6px 12px",
    outline: "none",
    cursor: "pointer",
    textTransform: "uppercase",
    appearance: "none",
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <PageHeader title="Agent Tasks" />

      {/* Filters */}
      <div style={{ padding: "0 24px 12px", display: "flex", gap: "8px" }}>
        <select
          value={agentFilter}
          onChange={(e) => setAgentFilter(e.target.value)}
          style={selectStyle}
        >
          <option value="all">All Agents</option>
          {agents.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>

        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          style={selectStyle}
        >
          <option value="all">All Priorities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>

      {/* Board */}
      <div style={{ flex: 1, overflow: "auto", padding: "0 24px 24px" }}>
        <DragDropContext onDragEnd={handleDragEnd}>
          <div style={{ display: "flex", gap: "12px", minHeight: "100%" }}>
            {COLUMNS.map((col) => {
              const tasks = board.columns[col.id].filter(filterTask);
              return (
                <Droppable key={col.id} droppableId={col.id}>
                  {(provided) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      style={{
                        flex: 1,
                        minWidth: "220px",
                        background: "var(--bg-surface, rgba(255,255,255,0.02))",
                        borderRadius: "10px",
                        padding: "12px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                      }}
                    >
                      <div
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: "11px",
                          color: "var(--text-secondary, #94a3b8)",
                          textTransform: "uppercase",
                          letterSpacing: "0.08em",
                          padding: "0 4px 8px",
                          display: "flex",
                          justifyContent: "space-between",
                        }}
                      >
                        <span>{col.label}</span>
                        <span style={{ color: "var(--mint)" }}>{tasks.length}</span>
                      </div>

                      {tasks.map((task, index) => (
                        <Draggable key={task.id} draggableId={task.id} index={index}>
                          {(dragProvided) => (
                            <div
                              ref={dragProvided.innerRef}
                              {...dragProvided.draggableProps}
                              {...dragProvided.dragHandleProps}
                            >
                              <AgentTaskCard task={task} />
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              );
            })}
          </div>
        </DragDropContext>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify page loads**

```bash
cd /Users/admin/gtm-board/dashboard && npx tsc --noEmit 2>&1 | head -10
```

Then start dev server and navigate to `http://localhost:8080/agent-tasks`.

- [ ] **Step 4: Commit**

```bash
cd /Users/admin/gtm-board && git add dashboard/app/agent-tasks/
git commit -m "feat: add agent tasks kanban board page with drag-and-drop"
```

---

### Task 6: Add Agent Tasks to Sidebar Navigation

**Files:**
- Modify: `dashboard/components/sidebar.tsx:17-52`

- [ ] **Step 1: Add Agent Tasks nav item to the OPERATIONS section**

In `sidebar.tsx`, find the `OPERATIONS` section and add the agent tasks entry:

```typescript
  {
    label: "OPERATIONS",
    items: [
      { label: "Kanban Board", href: "/kanban", icon: "columns" },
      { label: "Agent Tasks", href: "/agent-tasks", icon: "bot" },
      { label: "Research", href: "/research", icon: "lightbulb" },
    ],
  },
```

- [ ] **Step 2: Add "bot" icon to SidebarIcon component**

In the `SidebarIcon` `switch` statement, add a case for `"bot"`:

```typescript
    case "bot":
      return (
        <svg {...props}>
          <rect x="3" y="11" width="18" height="10" rx="2" />
          <circle cx="9" cy="16" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="15" cy="16" r="1.5" fill="currentColor" stroke="none" />
          <path d="M12 2v4" />
          <path d="M8 7h8" />
          <circle cx="12" cy="2" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
```

- [ ] **Step 3: Verify in browser**

Start dev server, check sidebar shows "Agent Tasks" under OPERATIONS with the bot icon.

- [ ] **Step 4: Commit**

```bash
cd /Users/admin/gtm-board && git add dashboard/components/sidebar.tsx
git commit -m "feat: add Agent Tasks link to sidebar navigation"
```

---

### Task 7: Seed Existing Filesystem Data into Supabase

**Files:**
- Create: `scripts/seed-existing-data.ts`

This is a one-time script to migrate existing markdown cards and metrics from the filesystem into Supabase. Run it once, then the filesystem data becomes archival.

- [ ] **Step 1: Create seed script**

```typescript
// scripts/seed-existing-data.ts
// One-time migration: filesystem → Supabase
// Usage: cd /Users/admin/gtm-board && npx tsx scripts/seed-existing-data.ts

import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

const GTM_HOME = process.env.GTM_HOME || "/Users/admin/gtm-board";

// Load env
const envPath = path.join(GTM_HOME, ".env");
if (fs.existsSync(envPath)) {
  const parsed = dotenv.parse(fs.readFileSync(envPath));
  for (const [k, v] of Object.entries(parsed)) {
    if (!process.env[k]) process.env[k] = v;
  }
}

const supabaseUrl = process.env.GTM_SUPABASE_URL!;
const supabaseKey = process.env.GTM_SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const COLUMNS = ["backlog", "preparing", "live", "measuring", "done"];

async function getProjectId(slug: string): Promise<string | null> {
  const { data } = await supabase
    .from("gtm_projects")
    .select("id")
    .eq("slug", slug)
    .single();
  return data?.id || null;
}

async function seedCards(projectSlug: string, projectId: string) {
  const boardDir = path.join(GTM_HOME, "projects", projectSlug, "board");
  if (!fs.existsSync(boardDir)) return;

  let inserted = 0;
  let skipped = 0;

  for (const col of COLUMNS) {
    const colDir = path.join(boardDir, col);
    if (!fs.existsSync(colDir)) continue;

    const files = fs.readdirSync(colDir).filter((f) => f.endsWith(".md"));
    for (const file of files) {
      const filePath = path.join(colDir, file);
      const raw = fs.readFileSync(filePath, "utf-8");
      const parsed = matter(raw);
      const fm = parsed.data as Record<string, unknown>;

      const slug = (fm.id as string) || path.basename(file, ".md");

      // Check if already exists
      const { data: existing } = await supabase
        .from("gtm_cards")
        .select("id")
        .eq("project_id", projectId)
        .eq("slug", slug)
        .maybeSingle();

      if (existing) {
        skipped++;
        continue;
      }

      const { id: _id, title, type, channel, column: _col, ...rest } = fm;

      const { error } = await supabase.from("gtm_cards").insert({
        project_id: projectId,
        slug,
        board: "marketing",
        title: (title as string) || slug,
        column_name: col,
        type: (type as string) || null,
        channel: (channel as string) || null,
        metadata: rest,
        body: parsed.content.trim(),
      });

      if (error) {
        console.error(`  FAIL card ${slug}: ${error.message}`);
      } else {
        inserted++;
      }
    }
  }

  console.log(`  Cards: ${inserted} inserted, ${skipped} already existed`);
}

async function seedMetrics(projectSlug: string, projectId: string) {
  const metricsDir = path.join(GTM_HOME, "projects", projectSlug, "metrics");
  if (!fs.existsSync(metricsDir)) return;

  let inserted = 0;

  const files = fs.readdirSync(metricsDir).filter((f) => f.endsWith(".md") && f !== "snapshots");
  for (const file of files) {
    const filePath = path.join(metricsDir, file);
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = matter(raw);
    const fm = parsed.data as Record<string, unknown>;

    const channel = (fm.channel as string) || path.basename(file, ".md");
    const { channel: _ch, updated_at, ...metrics } = fm;

    const { error } = await supabase.from("gtm_metrics").upsert(
      {
        project_id: projectId,
        channel,
        data: metrics,
        fetched_at: (updated_at as string) || new Date().toISOString(),
      },
      { onConflict: "project_id,channel" }
    );

    if (error) {
      console.error(`  FAIL metric ${channel}: ${error.message}`);
    } else {
      inserted++;
    }
  }

  console.log(`  Metrics: ${inserted} upserted`);
}

async function seedSnapshots(projectSlug: string, projectId: string) {
  const snapshotsDir = path.join(GTM_HOME, "projects", projectSlug, "metrics", "snapshots");
  if (!fs.existsSync(snapshotsDir)) return;

  let inserted = 0;

  const files = fs.readdirSync(snapshotsDir).filter((f) => f.endsWith(".md"));
  for (const file of files) {
    const filePath = path.join(snapshotsDir, file);
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = matter(raw);
    const fm = parsed.data as Record<string, unknown>;

    const date = (fm.date as string) || path.basename(file, ".md");

    const { error } = await supabase.from("gtm_snapshots").upsert(
      {
        project_id: projectId,
        snapshot_date: date,
        data: fm,
      },
      { onConflict: "project_id,snapshot_date" }
    );

    if (error) {
      console.error(`  FAIL snapshot ${date}: ${error.message}`);
    } else {
      inserted++;
    }
  }

  console.log(`  Snapshots: ${inserted} upserted`);
}

async function main() {
  const projects = fs.readdirSync(path.join(GTM_HOME, "projects")).filter((d) =>
    fs.statSync(path.join(GTM_HOME, "projects", d)).isDirectory()
  );

  for (const projectSlug of projects) {
    console.log(`\nSeeding project: ${projectSlug}`);
    const projectId = await getProjectId(projectSlug);
    if (!projectId) {
      console.log(`  Skipping — not found in gtm_projects table`);
      continue;
    }

    await seedCards(projectSlug, projectId);
    await seedMetrics(projectSlug, projectId);
    await seedSnapshots(projectSlug, projectId);
  }

  console.log("\nDone.");
}

main().catch(console.error);
```

- [ ] **Step 2: Run seed script**

```bash
cd /Users/admin/gtm-board && npx tsx scripts/seed-existing-data.ts
```

Expected output like:
```
Seeding project: tailor
  Cards: 15 inserted, 0 already existed
  Metrics: 10 upserted
  Snapshots: 4 upserted

Seeding project: groomlocal
  Cards: 3 inserted, 0 already existed
  ...
```

- [ ] **Step 3: Verify data in Supabase**

```bash
curl -s -H "apikey: $GTM_SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $GTM_SUPABASE_SERVICE_ROLE_KEY" \
  "$GTM_SUPABASE_URL/rest/v1/gtm_cards?select=slug,column_name,board&limit=5" | python3 -m json.tool
```

- [ ] **Step 4: Commit**

```bash
cd /Users/admin/gtm-board && git add scripts/seed-existing-data.ts
git commit -m "feat: add one-time filesystem to Supabase seed script"
```

---

### Task 8: Fix Dashboard next.config.ts for Deployment

**Files:**
- Modify: `dashboard/next.config.ts`

- [ ] **Step 1: Remove hardcoded GTM_HOME**

The dashboard no longer reads from the filesystem — it uses Supabase. The `GTM_HOME` env var is only needed by the MCP server for loading `.env` files. Remove it from next.config.ts:

```typescript
import type { NextConfig } from "next";
const nextConfig: NextConfig = {};
export default nextConfig;
```

- [ ] **Step 2: Verify dashboard still builds**

```bash
cd /Users/admin/gtm-board/dashboard && npm run build 2>&1 | tail -20
```

Expected: Build succeeds. The dashboard only needs `GTM_SUPABASE_URL` and `GTM_SUPABASE_SERVICE_ROLE_KEY` in environment.

- [ ] **Step 3: Commit**

```bash
cd /Users/admin/gtm-board && git add dashboard/next.config.ts
git commit -m "fix: remove hardcoded GTM_HOME from dashboard config"
```

---

### Task 9: Deploy Dashboard to Vercel

**Files:**
- No file changes — Vercel CLI commands

- [ ] **Step 1: Initialize Vercel project**

```bash
cd /Users/admin/gtm-board/dashboard && vercel link
```

Follow prompts to link to a new Vercel project.

- [ ] **Step 2: Set environment variables**

```bash
vercel env add GTM_SUPABASE_URL
vercel env add GTM_SUPABASE_SERVICE_ROLE_KEY
```

Paste the values from `/Users/admin/gtm-board/.env`.

- [ ] **Step 3: Deploy preview**

```bash
cd /Users/admin/gtm-board/dashboard && vercel
```

- [ ] **Step 4: Verify preview deployment**

Open the preview URL. Check:
- Overview page loads with metrics
- Kanban board shows existing cards
- Agent Tasks page shows empty board (no agent tasks yet)
- Sidebar navigation works

- [ ] **Step 5: Deploy to production**

```bash
cd /Users/admin/gtm-board/dashboard && vercel --prod
```

---

### Task 10: Verify End-to-End Remote Agent Flow

- [ ] **Step 1: Start MCP HTTP server locally**

```bash
cd /Users/admin/gtm-board/server && MCP_HTTP_PORT=3200 npx tsx src/index.ts
```

- [ ] **Step 2: Create an agent task via HTTP**

```bash
curl -X POST http://localhost:3200/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "gtm_create_agent_task",
      "arguments": {
        "project": "tailor",
        "title": "Test agent task from remote",
        "assigned_agent": "test-agent",
        "priority": "high",
        "details": "This task was created via HTTP transport to verify remote access works."
      }
    }
  }'
```

Expected: JSON response with `{ id: "test-agent-task-from-remote-XXXX", card_id: "..." }`

- [ ] **Step 3: Verify task appears in dashboard**

Refresh the dashboard Agent Tasks page. The task should appear in the "QUEUED" column with "high" priority and "test-agent" badge.

- [ ] **Step 4: Move task via HTTP**

```bash
curl -X POST http://localhost:3200/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "gtm_update_agent_task",
      "arguments": {
        "project": "tailor",
        "task_id": "test-agent-task-from-remote-XXXX",
        "status": "started"
      }
    }
  }'
```

Expected: Task moves to "IN PROGRESS" column in dashboard.

- [ ] **Step 5: Verify dashboard updates in real-time**

Refresh the Agent Tasks page. Card should now be in "IN PROGRESS".

- [ ] **Step 6: Clean up test task**

Delete the test card from Supabase or move to done.
