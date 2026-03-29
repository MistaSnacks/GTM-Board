import fs from "fs";
import path from "path";
import YAML from "yaml";
import { cookies } from "next/headers";
import type { ProjectConfig } from "./types";

const GTM_HOME = process.env.GTM_HOME || "/Users/admin/gtm-board";

export function getProjectsDir(): string {
  return path.join(GTM_HOME, "projects");
}

export function getProjects(): string[] {
  const projectsDir = getProjectsDir();
  if (!fs.existsSync(projectsDir)) return [];
  return fs
    .readdirSync(projectsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

export async function getActiveProject(): Promise<string> {
  const projects = getProjects();
  const cookieStore = await cookies();
  const saved = cookieStore.get("gtm-project")?.value;
  if (saved && projects.includes(saved)) return saved;
  const fallback = process.env.DEFAULT_PROJECT;
  if (fallback && projects.includes(fallback)) return fallback;
  return projects[0] || "tailor";
}

export function getConfig(project: string): ProjectConfig {
  const configPath = path.join(getProjectsDir(), project, "config.yaml");
  if (!fs.existsSync(configPath)) {
    return {
      name: project.toUpperCase(),
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
  }
  const raw = fs.readFileSync(configPath, "utf-8");
  return YAML.parse(raw) as ProjectConfig;
}
