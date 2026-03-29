import fs from "node:fs";
import path from "node:path";

const GTM_HOME = process.env.GTM_HOME || "/Users/admin/gtm-board";

const BOARD_COLUMNS = ["backlog", "preparing", "live", "measuring", "done"];
const PROJECT_SUBDIRS = [
  ...BOARD_COLUMNS.map((c: string) => `board/${c}`),
  "cadence",
  "metrics/snapshots",
  "research",
];

function defaultConfigYaml(name: string, url: string): string {
  return `name: ${name.toUpperCase()}
url: ${url}
description: GTM project for ${name}

connectors:
  supabase:
    enabled: false
  reddit:
    enabled: false
    username: ""
    subreddits: []
  google_search_console:
    enabled: false
    site_url: ""
  ga4:
    enabled: false
    property_id: ""
  meta_ads:
    enabled: false
  google_ads:
    enabled: false

cadence:
  linkedin:
    posts_per_week: 3
    schedule:
      monday: educational
      wednesday: narrative
      friday: hot-take
    comments_per_week:
      min: 5
      target: 10
  reddit:
    posts_per_week:
      min: 0
      target: 1
    comments_per_week:
      min: 5
      target: 10

targets:
  month_1:
    signups: 100
    free_to_paid_pct: 0.05

reference_docs: []
`;
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("Usage: npx tsx setup.ts <project-name> [--url <url>]");
    process.exit(1);
  }

  const projectName = args[0];
  let url = "https://example.com";

  const urlIndex = args.indexOf("--url");
  if (urlIndex !== -1 && args[urlIndex + 1]) {
    url = args[urlIndex + 1];
  }

  const projectDir = path.join(GTM_HOME, "projects", projectName);

  if (fs.existsSync(projectDir)) {
    console.error(`Project already exists: ${projectDir}`);
    process.exit(1);
  }

  console.log(`Creating project: ${projectName}`);
  console.log(`Directory: ${projectDir}`);

  for (const sub of PROJECT_SUBDIRS) {
    const dir = path.join(projectDir, sub);
    fs.mkdirSync(dir, { recursive: true });
    console.log(`  Created: ${sub}/`);
  }

  fs.writeFileSync(path.join(projectDir, "config.yaml"), defaultConfigYaml(projectName, url), "utf-8");
  console.log("  Created: config.yaml");

  fs.writeFileSync(
    path.join(projectDir, ".env"),
    "# Add API keys here\n# SUPABASE_URL=\n# SUPABASE_SERVICE_ROLE_KEY=\n# REDDIT_CLIENT_ID=\n# REDDIT_CLIENT_SECRET=\n",
    "utf-8"
  );
  console.log("  Created: .env");

  console.log("\nNext steps:");
  console.log(`  1. Add API keys to ${path.join(projectDir, ".env")}`);
  console.log(`  2. Edit ${path.join(projectDir, "config.yaml")} to configure connectors`);
  console.log(`  3. Register the MCP server in your Claude config:`);
  console.log(`     {`);
  console.log(`       "mcpServers": {`);
  console.log(`         "gtm-board": {`);
  console.log(`           "command": "npx",`);
  console.log(`           "args": ["tsx", "${path.join(GTM_HOME, "server/src/index.ts")}"],`);
  console.log(`           "env": { "GTM_HOME": "${GTM_HOME}" }`);
  console.log(`         }`);
  console.log(`       }`);
  console.log(`     }`);
}

main();
