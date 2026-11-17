import test from "node:test";
import assert from "node:assert/strict";
import { createFakeItemsDb } from "./fake-db.ts";
import { generateRecurring, isHumanOnly, RECURRING_TEMPLATES } from "./recurring.ts";
import { createItemStore } from "./store.ts";
import { parseItemInput } from "./types.ts";

const keysAt = (iso: string) => generateRecurring(new Date(iso)).map((i) => i.dedupe_key);
const dailyKey = (iso: string) => keysAt(iso).find((k) => k.startsWith("rule:gl-visitors-daily:"));
const weeklyKey = (iso: string) => keysAt(iso).find((k) => k.startsWith("rule:gl-serp-spotcheck:"));

test("the set has one daily and five weekly items that follow the contract table", () => {
  const items = generateRecurring(new Date("2026-11-06T20:00:00Z"));
  assert.equal(items.length, 6);
  assert.equal(new Set(items.map((i) => i.dedupe_key)).size, 6);
  const row = (id: string) => {
    const item = items.find((i) => i.dedupe_key.startsWith(`rule:${id}:`));
    assert.ok(item, id);
    return `${item.project} ${item.owner} p${item.priority}`;
  };
  assert.equal(row("gl-visitors-daily"), "groomlocal agent p1");
  assert.equal(row("gl-serp-spotcheck"), "groomlocal agent p2");
  assert.equal(row("gl-other-engines"), "groomlocal camren p2");
  assert.equal(row("gl-community-answer"), "groomlocal camren p1");
  assert.equal(row("gl-price-harvest"), "groomlocal agent p2");
  assert.equal(row("tl-ai-citation"), "tailor agent p3");
  for (const retired of ["gl-ctr-opportunities", "gl-index-sample", "gl-data-floor", "tl-audit-weekly", "tl-gsc-weekly"]) {
    assert.equal(items.some((i) => i.dedupe_key.startsWith(`rule:${retired}:`)), false, `${retired} is retired`);
  }
  for (const item of items) {
    assert.equal(item.source, "rule:recurring");
    assert.equal(item.kind, "seo_task");
    parseItemInput(item);
  }
});

test("the daily key is the Pacific date, not the UTC date", () => {
  assert.equal(dailyKey("2026-11-06T20:00:00Z"), "rule:gl-visitors-daily:2026-11-06");
  assert.equal(dailyKey("2026-11-07T04:00:00Z"), "rule:gl-visitors-daily:2026-11-06");
  assert.equal(dailyKey("2026-11-07T08:00:00Z"), "rule:gl-visitors-daily:2026-11-07");
});

test("the weekly key is the ISO week, and it turns over on Monday at midnight Pacific", () => {
  assert.equal(weeklyKey("2026-11-06T20:00:00Z"), "rule:gl-serp-spotcheck:2026-W45");
  assert.equal(weeklyKey("2026-11-09T07:59:00Z"), "rule:gl-serp-spotcheck:2026-W45");
  assert.equal(weeklyKey("2026-11-09T08:00:00Z"), "rule:gl-serp-spotcheck:2026-W46");
});

test("ISO week keys hold across a year boundary", () => {
  const cases: [string, string][] = [
    ["2026-12-31T20:00:00Z", "2026-W53"],
    ["2027-01-01T20:00:00Z", "2026-W53"],
    ["2027-01-03T20:00:00Z", "2026-W53"],
    ["2027-01-04T20:00:00Z", "2027-W01"],
    ["2024-12-30T20:00:00Z", "2025-W01"],
    ["2025-12-28T20:00:00Z", "2025-W52"],
    ["2025-12-29T20:00:00Z", "2026-W01"],
    ["2021-01-03T20:00:00Z", "2020-W53"],
    ["2020-12-31T20:00:00Z", "2020-W53"],
  ];
  for (const [at, week] of cases) assert.equal(weeklyKey(at), `rule:gl-serp-spotcheck:${week}`, at);
});

test("the year boundary moves the daily key with the Pacific calendar", () => {
  assert.equal(dailyKey("2027-01-01T07:59:00Z"), "rule:gl-visitors-daily:2026-12-31");
  assert.equal(dailyKey("2027-01-01T08:00:00Z"), "rule:gl-visitors-daily:2027-01-01");
});

test("a daily item is due at the end of its Pacific day, and a weekly item at the end of that ISO week", () => {
  const items = generateRecurring(new Date("2026-11-06T20:00:00Z"));
  const due = (id: string) => items.find((i) => i.dedupe_key.startsWith(`rule:${id}:`))?.due_at;
  assert.equal(due("gl-visitors-daily"), "2026-11-07T07:59:59.000Z");
  assert.equal(due("gl-serp-spotcheck"), "2026-11-09T07:59:59.000Z");

  const summer = generateRecurring(new Date("2026-07-15T20:00:00Z"));
  assert.equal(summer.find((i) => i.dedupe_key.startsWith("rule:gl-visitors-daily:"))?.due_at, "2026-07-16T06:59:59.000Z");
});

test("adding the same period twice keeps one row, and a dismissed item is not recreated that week", async () => {
  const db = createFakeItemsDb({ projects: { groomlocal: "p-gl", tailor: "p-tl" } });
  const store = createItemStore({ db, resolveProject: async (s) => (s === "groomlocal" ? "p-gl" : "p-tl") });
  const monday = new Date("2026-11-09T18:00:00Z");

  const first = await Promise.all(generateRecurring(monday).map((i) => store.addItem(i)));
  assert.equal(first.filter((r) => r.created).length, 6);
  const again = await Promise.all(generateRecurring(monday).map((i) => store.addItem(i)));
  assert.equal(again.filter((r) => r.created).length, 0);
  assert.equal(db.rows.length, 6);

  const audit = db.rows.find((r) => r.dedupe_key === "rule:gl-serp-spotcheck:2026-W46");
  assert.ok(audit);
  await store.updateItem(audit.id, { status: "dismissed" });
  const wednesday = new Date("2026-11-11T18:00:00Z");
  const later = await Promise.all(generateRecurring(wednesday).map((i) => store.addItem(i)));
  assert.equal(later.filter((r) => r.created).length, 1, "only the new daily item");
  assert.equal(later.filter((r) => r.closed).length, 1, "the dismissed weekly item");
  assert.equal(db.rows.find((r) => r.dedupe_key === "rule:gl-visitors-daily:2026-11-11")?.status, "open");

  const nextWeek = await Promise.all(generateRecurring(new Date("2026-11-16T18:00:00Z")).map((i) => store.addItem(i)));
  assert.equal(nextWeek.filter((r) => r.created).length, 6);
});

test("only the templates that post or send are humanOnly, and Camren owns each of them", () => {
  assert.deepEqual(RECURRING_TEMPLATES.filter((t) => t.humanOnly).map((t) => t.id), ["gl-community-answer"]);
  for (const t of RECURRING_TEMPLATES.filter((t) => t.humanOnly)) assert.equal(t.owner, "camren", t.id);
});

test("isHumanOnly reads the template from the dedupe key", () => {
  assert.equal(isHumanOnly({ dedupe_key: "rule:gl-community-answer:2026-W47" }), true);
  assert.equal(isHumanOnly({ dedupe_key: "rule:gl-community-answer:2025-W01" }), true);
  assert.equal(isHumanOnly({ dedupe_key: "rule:gl-visitors-daily:2026-11-16" }), false);
  assert.equal(isHumanOnly({ dedupe_key: "rule:gl-data-floor:2026-W47" }), false, "a retired template");
  assert.equal(isHumanOnly({ dedupe_key: "seo:groomlocal:gl-community-answer:x" }), false);
  assert.equal(isHumanOnly({ dedupe_key: "rule:gl-community-answer" }), false);
});
