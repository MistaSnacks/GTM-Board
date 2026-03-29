import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { getProjectDir, listProjects as listProjectDirs, loadProjectConfig } from "../lib/config.ts";

const BOARD_COLUMNS = ["backlog", "preparing", "live", "measuring", "done"];
const PROJECT_SUBDIRS = [
  ...BOARD_COLUMNS.map((c) => `board/${c}`),
  "cadence",
  "metrics/snapshots",
  "research",
  "daily-reports",
];

function defaultConfig(name: string, url?: string, description?: string): string {
  const config = {
    name: name.toUpperCase(),
    url: url || `https://example.com`,
    description: description || `GTM project for ${name}`,
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
        schedule: { monday: "educational", wednesday: "narrative", friday: "hot-take" },
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
  return YAML.stringify(config);
}

export function createProject(params: {
  name: string;
  url?: string;
  description?: string;
}): { name: string; path: string; created_dirs: string[] } {
  const projectDir = getProjectDir(params.name);

  if (fs.existsSync(projectDir)) {
    throw new Error(`Project already exists: ${params.name}`);
  }

  const createdDirs: string[] = [];
  for (const sub of PROJECT_SUBDIRS) {
    const dir = path.join(projectDir, sub);
    fs.mkdirSync(dir, { recursive: true });
    createdDirs.push(sub);
  }

  // Write config.yaml
  const configContent = defaultConfig(params.name, params.url, params.description);
  fs.writeFileSync(path.join(projectDir, "config.yaml"), configContent, "utf-8");

  // Write empty .env
  fs.writeFileSync(
    path.join(projectDir, ".env"),
    "# Add API keys here\n# SUPABASE_URL=\n# SUPABASE_SERVICE_ROLE_KEY=\n",
    "utf-8"
  );

  return { name: params.name, path: projectDir, created_dirs: createdDirs };
}

export function listProjectsInfo(): Array<{ name: string; card_count: number }> {
  const projects = listProjectDirs();
  return projects.map((name) => {
    let cardCount = 0;
    try {
      const boardDir = path.join(getProjectDir(name), "board");
      for (const col of BOARD_COLUMNS) {
        const colDir = path.join(boardDir, col);
        if (fs.existsSync(colDir)) {
          cardCount += fs
            .readdirSync(colDir)
            .filter((f) => f.endsWith(".md")).length;
        }
      }
    } catch {
      // ignore errors reading project
    }
    return { name, card_count: cardCount };
  });
}

export function setTargets(params: {
  project: string;
  targets: Record<string, Record<string, number>>;
}): { project: string; updated_targets: string[] } {
  const projectDir = getProjectDir(params.project);
  const configPath = path.join(projectDir, "config.yaml");

  if (!fs.existsSync(configPath)) {
    throw new Error(`Project config not found: ${configPath}`);
  }

  const raw = fs.readFileSync(configPath, "utf-8");
  const config = YAML.parse(raw) as Record<string, unknown>;
  config.targets = params.targets;
  fs.writeFileSync(configPath, YAML.stringify(config), "utf-8");

  return { project: params.project, updated_targets: Object.keys(params.targets) };
}
