/**
 * Re-mint the shared Google OAuth refresh token (Search Console + Google Ads + GA4).
 *
 * Usage: server/node_modules/.bin/tsx scripts/google-oauth.ts
 * Opens nothing itself: prints a consent URL, waits for Google's loopback callback on
 * 127.0.0.1:8085, exchanges the code, then rewrites GOOGLE_REFRESH_TOKEN in .env and
 * dashboard/.env.local. The token value is never printed.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
if (!fs.existsSync(path.join(ROOT, ".env"))) { console.error("run from ~/gtm-board (no .env in cwd)"); process.exit(1); }
// Root .env is the shared tier; any projects/*/.env that still carries GOOGLE_REFRESH_TOKEN
// would shadow it (highest-priority tier in lib/config.ts), so rewrite those too.
const ENV_FILES = [
  path.join(ROOT, ".env"),
  ...fs.readdirSync(path.join(ROOT, "projects"), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(ROOT, "projects", d.name, ".env"))
    .filter((f) => fs.existsSync(f) && /^GOOGLE_REFRESH_TOKEN=/m.test(fs.readFileSync(f, "utf8"))),
];
const PORT = 8085;
const REDIRECT = `http://127.0.0.1:${PORT}`;
const SCOPES = [
  // Full scope (not .readonly): the board submits sitemaps as well as reading search data.
  "https://www.googleapis.com/auth/webmasters",
  "https://www.googleapis.com/auth/adwords",
  "https://www.googleapis.com/auth/analytics.readonly",
];

function readEnv(file: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

const env = readEnv(ENV_FILES[0]);
const clientId = env.GOOGLE_CLIENT_ID;
const clientSecret = env.GOOGLE_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET missing in .env");
  process.exit(1);
}

const authUrl =
  "https://accounts.google.com/o/oauth2/v2/auth?" +
  new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
  }).toString();

function writeToken(token: string) {
  for (const file of ENV_FILES) {
    if (!fs.existsSync(file)) continue;
    const src = fs.readFileSync(file, "utf8");
    const line = `GOOGLE_REFRESH_TOKEN=${token}`;
    const next = /^GOOGLE_REFRESH_TOKEN=.*$/m.test(src)
      ? src.replace(/^GOOGLE_REFRESH_TOKEN=.*$/m, line)
      : file === ENV_FILES[0] ? src.replace(/\n?$/, `\n${line}\n`) : src;
    fs.writeFileSync(file, next);
    console.log(`wrote GOOGLE_REFRESH_TOKEN -> ${path.relative(ROOT, file)}`);
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", REDIRECT);
  if (url.pathname !== "/") { res.writeHead(404).end(); return; }
  const code = url.searchParams.get("code");
  const err = url.searchParams.get("error");
  if (err || !code) {
    res.writeHead(400, { "Content-Type": "text/plain" }).end(`OAuth error: ${err ?? "no code"}`);
    console.error("callback error:", err ?? "no code");
    return;
  }
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT,
      grant_type: "authorization_code",
    }),
  });
  const data = (await tokenRes.json()) as { refresh_token?: string; scope?: string; error?: string; error_description?: string };
  if (!tokenRes.ok || !data.refresh_token) {
    res.writeHead(500, { "Content-Type": "text/plain" }).end("Token exchange failed; see terminal.");
    console.error("token exchange failed:", tokenRes.status, data.error, data.error_description, "has_refresh:", Boolean(data.refresh_token));
    server.close();
    process.exit(1);
  }
  writeToken(data.refresh_token);
  console.log("granted scopes:", data.scope);
  res.writeHead(200, { "Content-Type": "text/html" }).end("<h2>GTM board: Google reconnected. You can close this tab.</h2>");
  console.log("DONE");
  server.close();
});

server.listen(PORT, "127.0.0.1", () => {
  console.log("listening on", REDIRECT);
  console.log("OPEN THIS URL:\n" + authUrl);
});
