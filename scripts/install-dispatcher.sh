#!/bin/bash
# Installs the Today dispatcher on a machine that runs a Hermes.
#
#   scripts/install-dispatcher.sh <runner-name> <project>=<workdir> [<project>=<workdir> ...]
#
# It writes dispatch.local.json (the config of this machine, not tracked), renders the launchd
# job from the template with the paths of this checkout, and loads the job. The board then
# offers "Send to <label>" on the items of those projects. Run it again to change the projects.
# LABEL sets the name a person sees on the board (default: Hermes).
set -euo pipefail

usage="Usage: scripts/install-dispatcher.sh <runner-name> <project>=<workdir> [<project>=<workdir> ...]"
[ $# -ge 2 ] || { echo "$usage" >&2; exit 2; }

repo="$(cd "$(dirname "$0")/.." && pwd)"
runner="$1"
shift

hermes_bin="$(command -v hermes)" || { echo "hermes is not on PATH" >&2; exit 1; }
node_bin="$(command -v node)" || { echo "node is not on PATH" >&2; exit 1; }
tsx="$repo/server/node_modules/.bin/tsx"
[ -x "$tsx" ] || { echo "Run npm install in $repo/server first" >&2; exit 1; }

job="com.gtmboard.dispatch"
plist="$HOME/Library/LaunchAgents/$job.plist"
mkdir -p "$(dirname "$plist")" "$HOME/Library/Logs"

REPO="$repo" RUNNER="$runner" LABEL="${LABEL:-Hermes}" HERMES_BIN="$hermes_bin" \
HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}" PLIST="$plist" \
JOB_PATH="$(dirname "$hermes_bin"):$(dirname "$node_bin"):/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin" \
"$node_bin" - "$@" <<'EOF'
const fs = require("node:fs");
const { REPO, RUNNER, LABEL, HERMES_BIN, HERMES_HOME, PLIST, JOB_PATH, HOME } = process.env;

const projects = {};
for (const pair of process.argv.slice(2)) {
  const at = pair.indexOf("=");
  const workdir = pair.slice(at + 1);
  if (at < 1 || !workdir.startsWith("/")) {
    console.error(`Not <project>=<absolute workdir>: ${pair}`);
    process.exit(2);
  }
  if (!fs.statSync(workdir, { throwIfNoEntry: false })?.isDirectory()) {
    console.error(`No such folder: ${workdir}`);
    process.exit(1);
  }
  projects[pair.slice(0, at)] = { workdir };
}

const config = { runner: RUNNER, label: LABEL, hermesHome: HERMES_HOME, hermesBin: HERMES_BIN, projects };
fs.writeFileSync(`${REPO}/dispatch.local.json`, `${JSON.stringify(config, null, 2)}\n`);

const xml = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const values = { REPO, HOME, PATH: JOB_PATH };
const template = fs.readFileSync(`${REPO}/scripts/launchd/com.gtmboard.dispatch.plist.template`, "utf8");
fs.writeFileSync(PLIST, template.replace(/\{\{(\w+)\}\}/g, (_, key) => xml(values[key])));
EOF

# A dry run reads the config and the board. It stops the install before the job loads if either is wrong.
GTM_HOME="$repo" "$tsx" "$repo/scripts/dispatch.ts" --dry-run

launchctl bootout "gui/$(id -u)/$job" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$plist"

echo "Loaded $job for runner $runner. Log: $HOME/Library/Logs/gtm-board-dispatch.log"
if ! grep -q '^GTM_HERMES_DELIVER=' "$repo/.env" 2>/dev/null; then
  echo "Hermes keeps its output local. To get it in chat, set GTM_HERMES_DELIVER in $repo/.env (for example telegram:<chat id>)."
fi
