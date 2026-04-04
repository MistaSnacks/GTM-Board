import fs from "node:fs";
import path from "node:path";
import { supabase, getProjectId } from "../lib/supabase.ts";
import {
  getProjectDir,
  listProjects as listProjectSlugs,
} from "../lib/config.ts";

export async function createProject(params: {
  name: string;
  url?: string;
  description?: string;
}): Promise<{ name: string; path: string; created_dirs: string[] }> {
  const slug = params.name.toLowerCase();

  // Check if project already exists in Supabase
  const { data: existing } = await supabase
    .from("gtm_projects")
    .select("id")
    .eq("slug", slug)
    .single();

  if (existing) {
    throw new Error(`Project already exists: ${params.name}`);
  }

  // Default config for new projects
  const defaultConfig = {
    connectors: {
      supabase: { enabled: false },
      reddit: { enabled: false, username: "", subreddits: [] },
      google_search_console: { enabled: false, site_url: "" },
      ga4: { enabled: false, property_id: "" },
      meta_ads: { enabled: false },
      google_ads: { enabled: false },
    },
    cadence: {
      linkedin: {
        posts_per_week: 3,
        schedule: {
          monday: "educational",
          wednesday: "narrative",
          friday: "hot-take",
        },
        comments_per_week: { min: 5, target: 10 },
      },
      reddit: {
        posts_per_week: { min: 0, target: 1 },
        comments_per_week: { min: 5, target: 10 },
      },
    },
    targets: {
      month_1: {
        signups: 100,
        free_to_paid_pct: 0.05,
      },
    },
    reference_docs: [],
  };

  // Insert into Supabase
  const { error } = await supabase.from("gtm_projects").insert({
    slug,
    name: params.name.toUpperCase(),
    url: params.url || "https://example.com",
    description: params.description || `GTM project for ${params.name}`,
    config: defaultConfig,
    credentials: {},
  });

  if (error) {
    throw new Error(`Failed to create project: ${error.message}`);
  }

  // Create local .env template file (still needed for connector API credentials)
  const projectDir = getProjectDir(params.name);
  const createdDirs: string[] = [];

  fs.mkdirSync(projectDir, { recursive: true });
  createdDirs.push(projectDir);

  const envPath = path.join(projectDir, ".env");
  if (!fs.existsSync(envPath)) {
    fs.writeFileSync(
      envPath,
      "# Add API keys here\n# SUPABASE_URL=\n# SUPABASE_SERVICE_ROLE_KEY=\n",
      "utf-8"
    );
  }

  return { name: params.name, path: projectDir, created_dirs: createdDirs };
}

export async function listProjectsInfo(): Promise<
  Array<{ name: string; card_count: number }>
> {
  // Get all projects with card counts in a single query
  const { data: projects, error: projError } = await supabase
    .from("gtm_projects")
    .select("slug")
    .order("slug");

  if (projError) {
    throw new Error(`Failed to list projects: ${projError.message}`);
  }

  if (!projects || projects.length === 0) return [];

  const results: Array<{ name: string; card_count: number }> = [];

  for (const project of projects) {
    const { count, error: countError } = await supabase
      .from("gtm_cards")
      .select("id", { count: "exact", head: true })
      .eq(
        "project_id",
        await getProjectId(project.slug).catch(() => "00000000-0000-0000-0000-000000000000")
      );

    results.push({
      name: project.slug,
      card_count: countError ? 0 : (count ?? 0),
    });
  }

  return results;
}

export async function setTargets(params: {
  project: string;
  targets: Record<string, Record<string, number>>;
}): Promise<{ project: string; updated_targets: string[] }> {
  const slug = params.project.toLowerCase();

  // Fetch current config
  const { data, error: fetchError } = await supabase
    .from("gtm_projects")
    .select("config")
    .eq("slug", slug)
    .single();

  if (fetchError || !data) {
    throw new Error(`Project not found: ${params.project}`);
  }

  const config = (data.config as Record<string, unknown>) || {};
  config.targets = params.targets;

  // Update config in Supabase
  const { error: updateError } = await supabase
    .from("gtm_projects")
    .update({ config, updated_at: new Date().toISOString() })
    .eq("slug", slug);

  if (updateError) {
    throw new Error(`Failed to update targets: ${updateError.message}`);
  }

  return {
    project: params.project,
    updated_targets: Object.keys(params.targets),
  };
}
