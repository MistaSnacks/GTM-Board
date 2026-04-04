import { cookies } from "next/headers";
import { supabase } from "./supabase";
import type { ProjectConfig } from "./types";

export async function getProjects(): Promise<string[]> {
  const { data, error } = await supabase
    .from("gtm_projects")
    .select("slug");

  if (error || !data) return [];
  return data.map((row) => row.slug);
}

export async function getActiveProject(): Promise<string> {
  const projects = await getProjects();
  const cookieStore = await cookies();
  const saved = cookieStore.get("gtm-project")?.value;
  if (saved && projects.includes(saved)) return saved;
  const fallback = process.env.DEFAULT_PROJECT;
  if (fallback && projects.includes(fallback)) return fallback;
  return projects[0] || "tailor";
}

const DEFAULT_CONFIG: ProjectConfig = {
  name: "UNKNOWN",
  connectors: {},
  cadence: {
    linkedin: {
      posts_per_week: 3,
      schedule: { monday: "educational", wednesday: "narrative", friday: "hot-take" },
      comments_per_week: { min: 5, target: 10 },
    },
    reddit: {
      posts_per_week: { min: 0, target: 1 },
      comments_per_week: { min: 5, target: 10 },
    },
  },
  targets: {},
};

export async function getConfig(project: string): Promise<ProjectConfig> {
  const { data, error } = await supabase
    .from("gtm_projects")
    .select("name, url, description, config")
    .eq("slug", project)
    .single();

  if (error || !data) {
    return { ...DEFAULT_CONFIG, name: project.toUpperCase() };
  }

  const config = (data.config || {}) as Record<string, unknown>;

  return {
    name: data.name || project.toUpperCase(),
    url: data.url || undefined,
    description: data.description || undefined,
    connectors: (config.connectors as ProjectConfig["connectors"]) || {},
    cadence: (config.cadence as ProjectConfig["cadence"]) || DEFAULT_CONFIG.cadence,
    targets: (config.targets as ProjectConfig["targets"]) || {},
    reference_docs: (config.reference_docs as string[]) || undefined,
    alerts: (config.alerts as Record<string, number>) || undefined,
  };
}
