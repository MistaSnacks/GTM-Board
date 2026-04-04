/**
 * One-time migration script: seed existing filesystem markdown cards,
 * metrics, and snapshots into Supabase.
 *
 * Usage:
 *   cd /Users/admin/gtm-board && npx tsx scripts/seed-existing-data.ts
 */

import { config } from "dotenv";
import { resolve, basename, dirname } from "path";
import { readdirSync, readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import matter from "gray-matter";
import { createClient } from "@supabase/supabase-js";

// ── Load env ────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env") });

const SUPABASE_URL = process.env.GTM_SUPABASE_URL;
const SUPABASE_KEY = process.env.GTM_SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing GTM_SUPABASE_URL or GTM_SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const PROJECTS_DIR = resolve(__dirname, "../projects");
const COLUMNS = ["backlog", "preparing", "live", "measuring", "done"] as const;

// ── Helpers ─────────────────────────────────────────────────────────

function mdFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => resolve(dir, f));
}

// ── Seed cards ──────────────────────────────────────────────────────

async function seedCards(projectId: string, slug: string) {
  let inserted = 0;
  let skipped = 0;

  for (const col of COLUMNS) {
    const dir = resolve(PROJECTS_DIR, slug, "board", col);
    for (const file of mdFiles(dir)) {
      const raw = readFileSync(file, "utf-8");
      const { data: fm, content } = matter(raw);

      const cardSlug = fm.id || basename(file, ".md");

      // Check for existing card
      const { data: existing } = await supabase
        .from("gtm_cards")
        .select("id")
        .eq("project_id", projectId)
        .eq("slug", cardSlug)
        .limit(1);

      if (existing && existing.length > 0) {
        skipped++;
        continue;
      }

      // Build metadata from all frontmatter fields except the ones that
      // map to dedicated columns
      const { id: _id, title, type, channel, column: _col, ...rest } = fm;
      const metadata: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rest)) {
        if (v !== undefined && v !== null) metadata[k] = v;
      }

      const { error } = await supabase.from("gtm_cards").insert({
        project_id: projectId,
        slug: cardSlug,
        board: "marketing",
        title: title || cardSlug,
        column_name: col, // directory name is the source of truth
        type: type || null,
        channel: channel || null,
        metadata,
        body: content.trim() || null,
      });

      if (error) {
        console.error(`  Card insert error (${cardSlug}):`, error.message);
      } else {
        inserted++;
      }
    }
  }

  console.log(`  Cards: ${inserted} inserted, ${skipped} skipped (duplicate)`);
}

// ── Seed metrics ────────────────────────────────────────────────────

async function seedMetrics(projectId: string, slug: string) {
  const dir = resolve(PROJECTS_DIR, slug, "metrics");
  let upserted = 0;

  for (const file of mdFiles(dir)) {
    const raw = readFileSync(file, "utf-8");
    const { data: fm } = matter(raw);
    const channel = fm.channel || basename(file, ".md");

    // Extract updated_at, everything else is data
    const { channel: _ch, updated_at, ...dataFields } = fm;
    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(dataFields)) {
      if (v !== undefined && v !== null) data[k] = v;
    }

    // Check if already exists
    const { data: existing } = await supabase
      .from("gtm_metrics")
      .select("id")
      .eq("project_id", projectId)
      .eq("channel", channel)
      .limit(1);

    if (existing && existing.length > 0) {
      // Update existing
      const { error } = await supabase
        .from("gtm_metrics")
        .update({ data, fetched_at: updated_at || new Date().toISOString() })
        .eq("project_id", projectId)
        .eq("channel", channel);

      if (error) {
        console.error(`  Metric update error (${channel}):`, error.message);
      } else {
        upserted++;
      }
    } else {
      const { error } = await supabase.from("gtm_metrics").insert({
        project_id: projectId,
        channel,
        data,
        fetched_at: updated_at || new Date().toISOString(),
      });

      if (error) {
        console.error(`  Metric insert error (${channel}):`, error.message);
      } else {
        upserted++;
      }
    }
  }

  console.log(`  Metrics: ${upserted} upserted`);
}

// ── Seed snapshots ──────────────────────────────────────────────────

async function seedSnapshots(projectId: string, slug: string) {
  const dir = resolve(PROJECTS_DIR, slug, "metrics", "snapshots");
  let upserted = 0;

  for (const file of mdFiles(dir)) {
    const raw = readFileSync(file, "utf-8");
    const { data: fm } = matter(raw);
    const snapshotDate = fm.date || basename(file, ".md");

    // Everything except date and project goes into data
    const { date: _d, project: _p, ...rest } = fm;
    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rest)) {
      if (v !== undefined && v !== null) data[k] = v;
    }

    // Check if already exists
    const { data: existing } = await supabase
      .from("gtm_snapshots")
      .select("id")
      .eq("project_id", projectId)
      .eq("snapshot_date", snapshotDate)
      .limit(1);

    if (existing && existing.length > 0) {
      const { error } = await supabase
        .from("gtm_snapshots")
        .update({ data })
        .eq("project_id", projectId)
        .eq("snapshot_date", snapshotDate);

      if (error) {
        console.error(`  Snapshot update error (${snapshotDate}):`, error.message);
      } else {
        upserted++;
      }
    } else {
      const { error } = await supabase.from("gtm_snapshots").insert({
        project_id: projectId,
        snapshot_date: snapshotDate,
        data,
      });

      if (error) {
        console.error(`  Snapshot insert error (${snapshotDate}):`, error.message);
      } else {
        upserted++;
      }
    }
  }

  console.log(`  Snapshots: ${upserted} upserted`);
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  const projectDirs = readdirSync(PROJECTS_DIR).filter((d) =>
    existsSync(resolve(PROJECTS_DIR, d, "board"))
  );

  console.log(`Found ${projectDirs.length} project(s): ${projectDirs.join(", ")}\n`);

  for (const slug of projectDirs) {
    console.log(`Seeding project: ${slug}`);

    // Look up project_id
    const { data: projects, error } = await supabase
      .from("gtm_projects")
      .select("id")
      .eq("slug", slug)
      .limit(1);

    if (error || !projects || projects.length === 0) {
      console.error(`  Project "${slug}" not found in gtm_projects, skipping.`);
      continue;
    }

    const projectId = projects[0].id;
    await seedCards(projectId, slug);
    await seedMetrics(projectId, slug);
    await seedSnapshots(projectId, slug);
    console.log();
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
