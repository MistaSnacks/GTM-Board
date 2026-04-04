/**
 * Seed script: migrate file-based GTM Board data into Supabase.
 * Run with: npx tsx supabase/seed.ts
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import YAML from "yaml";
import dotenv from "dotenv";

const GTM_HOME = process.env.GTM_HOME || "/Users/admin/gtm-board";

// Load env
const envPath = path.join(GTM_HOME, ".env");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const supabaseUrl = process.env.GTM_SUPABASE_URL || process.env.SUPABASE_URL!;
const supabaseKey = process.env.GTM_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const COLUMNS = ["backlog", "preparing", "live", "measuring", "done"] as const;

async function seedProjects(): Promise<Record<string, string>> {
  const projectsDir = path.join(GTM_HOME, "projects");
  const slugToId: Record<string, string> = {};

  if (!fs.existsSync(projectsDir)) {
    console.log("No projects directory found");
    return slugToId;
  }

  const dirs = fs.readdirSync(projectsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  for (const slug of dirs) {
    const configPath = path.join(projectsDir, slug, "config.yaml");
    let config: Record<string, unknown> = {};
    let name = slug.toUpperCase();
    let url: string | null = null;
    let description: string | null = null;

    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, "utf-8");
      const parsed = YAML.parse(raw) as Record<string, unknown>;
      name = (parsed.name as string) || name;
      url = (parsed.url as string) || null;
      description = (parsed.description as string) || null;

      // Store everything except name/url/description in config JSONB
      const { name: _n, url: _u, description: _d, project_env: _pe, ...rest } = parsed;
      config = rest;
    }

    const { data, error } = await supabase
      .from("gtm_projects")
      .upsert(
        { slug, name, url, description, config, credentials: {} },
        { onConflict: "slug" }
      )
      .select("id")
      .single();

    if (error) {
      console.error(`Error seeding project ${slug}:`, error.message);
      continue;
    }

    slugToId[slug] = data.id;
    console.log(`  Project: ${slug} → ${data.id}`);
  }

  return slugToId;
}

async function seedCards(slugToId: Record<string, string>): Promise<void> {
  for (const [slug, projectId] of Object.entries(slugToId)) {
    const boardDir = path.join(GTM_HOME, "projects", slug, "board");
    if (!fs.existsSync(boardDir)) continue;

    let count = 0;
    for (const col of COLUMNS) {
      const colDir = path.join(boardDir, col);
      if (!fs.existsSync(colDir)) continue;

      const files = fs.readdirSync(colDir).filter(f => f.endsWith(".md"));
      for (const file of files) {
        try {
          const raw = fs.readFileSync(path.join(colDir, file), "utf-8");
          const { data, content } = matter(raw);

          const cardSlug = (data.id as string) || path.basename(file, ".md");
          const title = (data.title as string) || "Untitled";
          const type = (data.type as string) || "post";
          const channel = (data.channel as string) || "other";

          // Everything else goes into metadata JSONB
          const {
            id: _id, title: _t, type: _ty, channel: _ch, column: _col,
            ...metadata
          } = data;

          const { error } = await supabase
            .from("gtm_cards")
            .upsert(
              {
                project_id: projectId,
                slug: cardSlug,
                board: "marketing",
                title,
                column_name: col,
                type,
                channel,
                metadata,
                body: content.trim(),
              },
              { onConflict: "project_id,slug" }
            );

          if (error) {
            console.error(`  Error seeding card ${cardSlug}:`, error.message);
          } else {
            count++;
          }
        } catch (err) {
          console.error(`  Error reading ${file}:`, err);
        }
      }
    }
    console.log(`  Cards for ${slug}: ${count}`);
  }
}

async function seedMetrics(slugToId: Record<string, string>): Promise<void> {
  for (const [slug, projectId] of Object.entries(slugToId)) {
    const metricsDir = path.join(GTM_HOME, "projects", slug, "metrics");
    if (!fs.existsSync(metricsDir)) continue;

    const files = fs.readdirSync(metricsDir).filter(f => f.endsWith(".md"));
    let count = 0;

    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(metricsDir, file), "utf-8");
        const { data } = matter(raw);

        const channel = (data.channel as string) || path.basename(file, ".md");
        const updatedAt = (data.updated_at as string) || new Date().toISOString();

        // Extract metric values (everything except channel and updated_at)
        const metrics: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(data)) {
          if (key === "channel" || key === "updated_at") continue;
          metrics[key] = value;
        }

        const { error } = await supabase
          .from("gtm_metrics")
          .upsert(
            {
              project_id: projectId,
              channel,
              data: metrics,
              fetched_at: updatedAt,
            },
            { onConflict: "project_id,channel" }
          );

        if (error) {
          console.error(`  Error seeding metric ${channel}:`, error.message);
        } else {
          count++;
        }
      } catch (err) {
        console.error(`  Error reading ${file}:`, err);
      }
    }
    console.log(`  Metrics for ${slug}: ${count}`);
  }
}

async function seedSnapshots(slugToId: Record<string, string>): Promise<void> {
  for (const [slug, projectId] of Object.entries(slugToId)) {
    const snapshotsDir = path.join(GTM_HOME, "projects", slug, "metrics", "snapshots");
    if (!fs.existsSync(snapshotsDir)) continue;

    const files = fs.readdirSync(snapshotsDir).filter(f => f.endsWith(".md")).sort();
    let count = 0;

    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(snapshotsDir, file), "utf-8");
        const { data } = matter(raw);

        const date = (data.date as string) || path.basename(file, ".md");
        const metricsData = (data.metrics as Record<string, unknown>) || {};

        const { error } = await supabase
          .from("gtm_snapshots")
          .upsert(
            {
              project_id: projectId,
              snapshot_date: date,
              data: metricsData,
            },
            { onConflict: "project_id,snapshot_date" }
          );

        if (error) {
          console.error(`  Error seeding snapshot ${date}:`, error.message);
        } else {
          count++;
        }
      } catch (err) {
        console.error(`  Error reading ${file}:`, err);
      }
    }
    console.log(`  Snapshots for ${slug}: ${count}`);
  }
}

async function seedCadence(slugToId: Record<string, string>): Promise<void> {
  for (const [slug, projectId] of Object.entries(slugToId)) {
    const cadenceBase = path.join(GTM_HOME, "projects", slug, "cadence");
    if (!fs.existsSync(cadenceBase)) continue;

    let count = 0;
    const monthDirs = fs.readdirSync(cadenceBase, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    for (const monthDir of monthDirs) {
      const monthPath = path.join(cadenceBase, monthDir);
      const files = fs.readdirSync(monthPath).filter(f => f.endsWith(".md"));

      // Parse month dir into week_start (use first Monday of the month)
      const [year, month] = monthDir.split("-").map(Number);
      const firstDay = new Date(year, month - 1, 1);
      const dayOfWeek = firstDay.getDay();
      const mondayOffset = dayOfWeek === 0 ? 1 : dayOfWeek === 1 ? 0 : 8 - dayOfWeek;
      const weekStart = new Date(year, month - 1, 1 + mondayOffset);
      const weekStartStr = weekStart.toISOString().slice(0, 10);

      for (const file of files) {
        try {
          const raw = fs.readFileSync(path.join(monthPath, file), "utf-8");
          const { data } = matter(raw);
          const platform = path.basename(file, ".md");
          const entries = (data.entries as Array<Record<string, unknown>>) || [];

          // Count posts and comments
          const posts = entries.filter(e => e.kind === "post");
          const comments = entries.filter(e => e.kind === "comment");
          const totalComments = comments.reduce((sum, e) => sum + ((e.count as number) || 0), 0);

          // Seed posts
          if (posts.length > 0) {
            const { error } = await supabase
              .from("gtm_cadence_logs")
              .upsert(
                {
                  project_id: projectId,
                  platform,
                  log_type: "post",
                  week_start: weekStartStr,
                  count: posts.length,
                  details: { entries: posts },
                },
                { onConflict: "project_id,platform,log_type,week_start" }
              );
            if (error) console.error(`  Error seeding cadence post:`, error.message);
            else count++;
          }

          // Seed comments
          if (totalComments > 0) {
            const { error } = await supabase
              .from("gtm_cadence_logs")
              .upsert(
                {
                  project_id: projectId,
                  platform,
                  log_type: "comment",
                  week_start: weekStartStr,
                  count: totalComments,
                  details: { entries: comments },
                },
                { onConflict: "project_id,platform,log_type,week_start" }
              );
            if (error) console.error(`  Error seeding cadence comment:`, error.message);
            else count++;
          }
        } catch (err) {
          console.error(`  Error reading ${file}:`, err);
        }
      }
    }
    console.log(`  Cadence logs for ${slug}: ${count}`);
  }
}

async function seedResearch(slugToId: Record<string, string>): Promise<void> {
  for (const [slug, projectId] of Object.entries(slugToId)) {
    const researchDir = path.join(GTM_HOME, "projects", slug, "research");
    if (!fs.existsSync(researchDir)) continue;

    const files = fs.readdirSync(researchDir).filter(f => f.endsWith(".md")).sort();
    let count = 0;

    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(researchDir, file), "utf-8");
        const { data, content } = matter(raw);

        const { error } = await supabase
          .from("gtm_research_runs")
          .insert({
            project_id: projectId,
            run_type: "full",
            findings: {
              ...data,
              content: content.slice(0, 5000),
            },
            cards_created: [],
          });

        if (error) {
          console.error(`  Error seeding research ${file}:`, error.message);
        } else {
          count++;
        }
      } catch (err) {
        console.error(`  Error reading ${file}:`, err);
      }
    }
    console.log(`  Research runs for ${slug}: ${count}`);
  }
}

async function main() {
  console.log("=== Seeding GTM Board Supabase ===\n");

  console.log("1. Seeding projects...");
  const slugToId = await seedProjects();
  if (Object.keys(slugToId).length === 0) {
    console.log("No projects to seed. Exiting.");
    return;
  }

  console.log("\n2. Seeding cards...");
  await seedCards(slugToId);

  console.log("\n3. Seeding metrics...");
  await seedMetrics(slugToId);

  console.log("\n4. Seeding snapshots...");
  await seedSnapshots(slugToId);

  console.log("\n5. Seeding cadence logs...");
  await seedCadence(slugToId);

  console.log("\n6. Seeding research runs...");
  await seedResearch(slugToId);

  console.log("\n=== Seed complete! ===");
}

main().catch(console.error);
