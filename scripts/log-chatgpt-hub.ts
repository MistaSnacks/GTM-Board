// Log one ChatGPT Business Hub reading for TAILOR to the GTM board.
//
//   npx tsx scripts/log-chatgpt-hub.ts <reading.json> [--dry-run]
//
// The Hermes job "tailor-chatgpt-hub" reads the Hub page in Chrome and writes
// <reading.json>. Business Hub has no API or export, and its window rolls, so
// this log is the only history. It also counts TAILOR's own ChatGPT signups
// for the same days, so clicks can be read against signups.
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { supabase as gtm, getProjectId } from "../server/src/lib/supabase.ts";

type Topic = { topic: string; mentions: number; share_pct: number };
type HubWindow = {
  mentions: number;
  mentions_increase: number | null;
  mentions_change_pct: number | null;
  clicks: number;
  topics: Topic[];
  daily?: Array<{ date: string; mentions: number }>;
};
type HubReading = {
  data_through: string;
  windows: { "7d": HubWindow; "28d"?: HubWindow };
  agent_insights?: Record<string, number | string>;
};

const PROJECT = "tailor";
const TAILOR_ENV = "/Users/admin/tailor-ops/.env.local";
const HISTORY = "/Users/admin/gtm-board/projects/tailor/metrics/chatgpt-business-hub.md";
const DAY = 86_400_000;

function fail(message: string): never {
  console.error(`log-chatgpt-hub: ${message}`);
  process.exit(1);
}

const count = (value: unknown, where: string): number => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) fail(`${where} must be a number of 0 or more, got ${JSON.stringify(value)}`);
  return value;
};
const optionalNumber = (value: unknown, where: string): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) fail(`${where} must be a number or null, got ${JSON.stringify(value)}`);
  return value;
};

function parseWindow(raw: any, where: string): HubWindow {
  if (!raw || typeof raw !== "object") fail(`${where} is missing`);
  const topics: Topic[] = Array.isArray(raw.topics) ? raw.topics.map((t: any, i: number) => {
    if (typeof t?.topic !== "string" || !t.topic.trim()) fail(`${where}.topics[${i}].topic must be text`);
    return { topic: t.topic.trim(), mentions: count(t.mentions, `${where}.topics[${i}].mentions`), share_pct: count(t.share_pct, `${where}.topics[${i}].share_pct`) };
  }) : fail(`${where}.topics must be a list (empty if the page shows none)`);
  const shares = topics.reduce((sum, t) => sum + t.share_pct, 0);
  if (topics.length && Math.abs(shares - 100) > 2) fail(`${where}.topics shares add to ${shares.toFixed(1)}%, not about 100%: a row was misread or missed`);
  const daily = Array.isArray(raw.daily) ? raw.daily.map((d: any, i: number) => ({ date: String(d?.date ?? ""), mentions: count(d?.mentions, `${where}.daily[${i}].mentions`) })) : undefined;
  return {
    mentions: count(raw.mentions, `${where}.mentions`),
    mentions_increase: optionalNumber(raw.mentions_increase, `${where}.mentions_increase`),
    mentions_change_pct: optionalNumber(raw.mentions_change_pct, `${where}.mentions_change_pct`),
    clicks: count(raw.clicks, `${where}.clicks`),
    topics,
    daily,
  };
}

function parseReading(file: string): HubReading {
  let raw: any;
  try { raw = JSON.parse(fs.readFileSync(file, "utf8")); } catch (error) { fail(`cannot read ${file}: ${(error as Error).message}`); }
  const through = String(raw?.data_through ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(through) || Number.isNaN(Date.parse(`${through}T00:00:00Z`))) fail(`data_through must be YYYY-MM-DD, got ${JSON.stringify(raw?.data_through)}`);
  if (Date.parse(`${through}T00:00:00Z`) > Date.now()) fail(`data_through ${through} is in the future`);
  return {
    data_through: through,
    windows: { "7d": parseWindow(raw?.windows?.["7d"], "windows.7d"), ...(raw?.windows?.["28d"] ? { "28d": parseWindow(raw.windows["28d"], "windows.28d") } : {}) },
    agent_insights: raw?.agent_insights && typeof raw.agent_insights === "object" ? raw.agent_insights : undefined,
  };
}

// Same rule as the 2026-11-13 manual count: a ChatGPT link (utm or referrer) or a self-reported ChatGPT source.
async function countSignups(through: string, days: number) {
  const env = dotenv.parse(fs.readFileSync(TAILOR_ENV));
  const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const end = new Date(Date.parse(`${through}T00:00:00Z`) + DAY).toISOString();
  const start = new Date(Date.parse(end) - days * DAY).toISOString();
  const window = () => db.from("signup_attribution").select("id", { count: "exact", head: true }).gte("created_at", start).lt("created_at", end);
  const [chatgpt, all] = await Promise.all([
    window().or("utm_source.ilike.%chatgpt%,referrer_url.ilike.%chatgpt.com%,referrer_url.ilike.%chat.openai%,self_reported_source.ilike.%chatgpt%"),
    window(),
  ]);
  if (chatgpt.error || all.error) fail(`signup count failed: ${(chatgpt.error ?? all.error)!.message}`);
  return { chatgpt: chatgpt.count ?? 0, all: all.count ?? 0 };
}

const slug = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "").slice(0, 60);
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 10000) / 100 : 0);

function windowMetrics(name: string, w: HubWindow, signups: { chatgpt: number; all: number }) {
  const metrics: Record<string, number> = {
    [`chatgpt_hub_mentions_${name}`]: w.mentions,
    [`chatgpt_hub_clicks_${name}`]: w.clicks,
    [`chatgpt_hub_click_rate_pct_${name}`]: pct(w.clicks, w.mentions),
    [`chatgpt_signups_${name}`]: signups.chatgpt,
    [`chatgpt_signups_share_pct_${name}`]: pct(signups.chatgpt, signups.all),
  };
  if (w.mentions_increase !== null) metrics[`chatgpt_hub_mentions_prev_${name}`] = w.mentions - w.mentions_increase;
  if (w.mentions_change_pct !== null) metrics[`chatgpt_hub_mentions_change_pct_${name}`] = w.mentions_change_pct;
  for (const t of w.topics) metrics[`chatgpt_topic_${name}_${slug(t.topic)}`] = t.mentions;
  return metrics;
}

function historyRow(r: HubReading, s7: { chatgpt: number; all: number }, s28: { chatgpt: number; all: number } | null) {
  const w7 = r.windows["7d"], w28 = r.windows["28d"];
  const top = w7.topics.slice().sort((a, b) => b.mentions - a.mentions)[0];
  return `| ${r.data_through} | ${w7.mentions} | ${w7.mentions_change_pct ?? ""} | ${w7.clicks} | ${pct(w7.clicks, w7.mentions)}% | ${s7.chatgpt} of ${s7.all} | ${w28 ? w28.mentions : ""} | ${w28 ? w28.clicks : ""} | ${w28 && s28 ? `${s28.chatgpt} of ${s28.all}` : ""} | ${top ? `${top.topic} (${top.mentions})` : ""} |`;
}

function writeHistory(row: string, through: string) {
  const header = [
    "# ChatGPT Business Hub (TAILOR)",
    "",
    "One row per reading, written by `scripts/log-chatgpt-hub.ts`. Hub windows end on the \"data through\" day (UTC). Signups are TAILOR `signup_attribution` rows for the same days with a ChatGPT link or a self-reported ChatGPT source.",
    "",
    "| Data through | Mentions 7D | Change 7D % | Clicks 7D | Click rate 7D | ChatGPT signups 7D | Mentions 28D | Clicks 28D | ChatGPT signups 28D | Top topic 7D |",
    "|---|---|---|---|---|---|---|---|---|---|",
  ].join("\n");
  const existing = fs.existsSync(HISTORY) ? fs.readFileSync(HISTORY, "utf8").trimEnd() : header;
  const lines = existing.split("\n").filter((line) => !line.startsWith(`| ${through} |`));
  fs.mkdirSync(path.dirname(HISTORY), { recursive: true });
  fs.writeFileSync(HISTORY, `${[...lines, row].join("\n")}\n`);
}

async function main() {
  const file = process.argv[2];
  if (!file) fail("usage: npx tsx scripts/log-chatgpt-hub.ts <reading.json> [--dry-run]");
  const dryRun = process.argv.includes("--dry-run");
  const reading = parseReading(file);
  const s7 = await countSignups(reading.data_through, 7);
  const s28 = reading.windows["28d"] ? await countSignups(reading.data_through, 28) : null;

  const metrics: Record<string, number> = {
    chatgpt_hub_data_through_yyyymmdd: Number(reading.data_through.replaceAll("-", "")),
    ...windowMetrics("7d", reading.windows["7d"], s7),
    ...(reading.windows["28d"] && s28 ? windowMetrics("28d", reading.windows["28d"], s28) : {}),
  };
  for (const [key, value] of Object.entries(reading.agent_insights ?? {})) {
    if (typeof value === "number" && Number.isFinite(value)) metrics[`chatgpt_agent_${slug(key)}`] = value;
  }
  const row = historyRow(reading, s7, s28);

  if (dryRun) {
    console.log(JSON.stringify({ metrics, row }, null, 1));
    return;
  }

  // Replace every chatgpt_* key, so a topic that left the top five does not linger with an old count.
  const projectId = await getProjectId(PROJECT);
  const { data: current, error: readError } = await gtm.from("gtm_metrics").select("data").eq("project_id", projectId).eq("channel", "geo").maybeSingle();
  if (readError) fail(`reading the geo channel failed: ${readError.message}`);
  const kept = Object.fromEntries(Object.entries((current?.data as Record<string, unknown>) ?? {}).filter(([key]) => !key.startsWith("chatgpt_")));
  const { error: writeError } = await gtm.from("gtm_metrics").upsert(
    { project_id: projectId, channel: "geo", data: { ...kept, ...metrics }, fetched_at: new Date().toISOString() },
    { onConflict: "project_id,channel" },
  );
  if (writeError) fail(`writing the geo channel failed: ${writeError.message}`);
  writeHistory(row, reading.data_through);

  const w7 = reading.windows["7d"];
  console.log([
    `ChatGPT Business Hub, 7 days through ${reading.data_through} (UTC):`,
    `- Mentions: ${w7.mentions}${w7.mentions_change_pct !== null ? ` (${w7.mentions_change_pct >= 0 ? "+" : ""}${w7.mentions_change_pct}%)` : ""}`,
    `- Website clicks: ${w7.clicks} (${pct(w7.clicks, w7.mentions)}% of mentions)`,
    `- TAILOR signups from ChatGPT: ${s7.chatgpt} of ${s7.all} signups`,
    ...(reading.windows["28d"] && s28 ? [`- 28 days: ${reading.windows["28d"].mentions} mentions, ${reading.windows["28d"].clicks} clicks, ${s28.chatgpt} of ${s28.all} signups from ChatGPT`] : []),
    `Logged to the GTM board geo channel and ${HISTORY}.`,
  ].join("\n"));
}

main().catch((error) => fail((error as Error).message));
