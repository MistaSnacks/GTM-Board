import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { supabase } from "./supabase.ts";
import type {
  ProjectConfig,
  CadenceConfig,
  ConnectorConfig,
  GeoConfig,
  AlertConfig,
  UgcConfig,
  BriefsConfig,
} from "../connectors/types.ts";

const GTM_HOME = process.env.GTM_HOME || "/Users/admin/gtm-board";

export function getGtmHome(): string {
  return GTM_HOME;
}

/**
 * Legacy helper — only used for resolving .env file paths for connector credentials.
 * Not used for data storage (that's in Supabase now).
 */
export function getProjectDir(projectName: string): string {
  return path.join(GTM_HOME, "projects", projectName);
}

export async function loadProjectConfig(
  projectName: string
): Promise<ProjectConfig> {
  const { data, error } = await supabase
    .from("gtm_projects")
    .select("*")
    .eq("slug", projectName)
    .single();

  if (error || !data) {
    throw new Error(`Project not found in Supabase: ${projectName}`);
  }

  const config = (data.config as Record<string, unknown>) || {};
  const projectDir = getProjectDir(projectName);

  // Build scoped env vars (no process.env mutation)
  const envVars: Record<string, string> = {};

  // Tier 1: shared credentials (account-level — Google Ads, Meta, Metricool, Reddit)
  const sharedEnv = path.join(GTM_HOME, ".env");
  if (fs.existsSync(sharedEnv)) {
    Object.assign(envVars, dotenv.parse(fs.readFileSync(sharedEnv)));
  }

  // Tier 2: external project env (e.g., TAILOR's main .env)
  const projectEnv = config.project_env as string | undefined;
  if (projectEnv && fs.existsSync(projectEnv)) {
    Object.assign(envVars, dotenv.parse(fs.readFileSync(projectEnv)));
  }

  // Tier 3: local project env (projects/<name>/.env — highest priority)
  const localEnv = path.join(projectDir, ".env");
  if (fs.existsSync(localEnv)) {
    Object.assign(envVars, dotenv.parse(fs.readFileSync(localEnv)));
  }

  return {
    name: data.name || projectName,
    dataDir: projectDir,
    envPath: projectEnv || localEnv,
    connectors:
      (config.connectors as Record<string, ConnectorConfig>) || {},
    targets:
      (config.targets as Record<string, Record<string, number>>) || {},
    cadence: (config.cadence as CadenceConfig) || {
      linkedin: {
        posts_per_week: 0,
        schedule: {},
        comments_per_week: { min: 0, target: 0 },
      },
      reddit: {
        posts_per_week: { min: 0, target: 0 },
        comments_per_week: { min: 0, target: 0 },
      },
    },
    reference_docs: config.reference_docs as string[] | undefined,
    geo: config.geo as GeoConfig | undefined,
    alerts: config.alerts as AlertConfig | undefined,
    ugc: config.ugc as UgcConfig | undefined,
    briefs: config.briefs as BriefsConfig | undefined,
    env: envVars,
  };
}

export function resolveProject(project?: string): string {
  const resolved = project || process.env.DEFAULT_PROJECT;
  if (!resolved) {
    throw new Error("No project specified and DEFAULT_PROJECT not set");
  }
  return resolved.toLowerCase();
}

export async function listProjects(): Promise<string[]> {
  const { data, error } = await supabase
    .from("gtm_projects")
    .select("slug")
    .order("slug");

  if (error) {
    throw new Error(`Failed to list projects: ${error.message}`);
  }

  return (data || []).map((row: { slug: string }) => row.slug);
}
