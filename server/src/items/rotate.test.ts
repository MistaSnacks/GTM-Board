import test from "node:test";
import assert from "node:assert/strict";
import { createFakeItemsDb } from "./fake-db.ts";
import { generateRecurring } from "./recurring.ts";
import { createItemStore } from "./store.ts";
import type { DelegationState, Item, ItemInput } from "./types.ts";

const PROJECTS = { groomlocal: "p-gl", tailor: "p-tl" };
// Monday 2026-11-16, 10:00 Pacific: day 2026-11-16, week 2026-W47.
const MONDAY = "2026-11-16T18:00:00.000Z";
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function setup(start = MONDAY) {
  let t = new Date(start);
  const clock = () => t;
  const db = createFakeItemsDb({ projects: PROJECTS, now: clock });
  const store = createItemStore({ db, now: clock, resolveProject: async (slug) => PROJECTS[slug as keyof typeof PROJECTS] });
  const at = (iso: string) => {
    t = new Date(iso);
  };
  const advance = (ms: number) => {
    t = new Date(t.getTime() + ms);
  };
  const rotate = () => store.rotateRecurring(generateRecurring(t));
  const row = (key: string) => db.rows.find((r) => r.dedupe_key === key) as Item;
  /** A row of an earlier run of the collector. */
  const seed = async (key: string, over: Partial<ItemInput> = {}) => {
    const { id } = await store.addItem({ project: "groomlocal", kind: "seo_task", title: key, source: "rule:recurring", dedupe_key: key, ...over });
    return id;
  };
  const withAgent = async (key: string, state: DelegationState) => {
    await db.update(row(key).id, {
      delegated_to: "hermes-mac",
      delegation_state: state,
      delegated_at: t.toISOString(),
      delegation_note: state === "returned" ? "Vercel is signed out" : null,
    });
  };
  const open = () =>
    db.rows
      .filter((r) => r.status === "open" || r.status === "snoozed")
      .map((r) => r.dedupe_key)
      .sort();
  return { db, store, at, advance, rotate, row, seed, withAgent, open };
}

const CURRENT = [
  "rule:gl-community-answer:2026-W47",
  "rule:gl-other-engines:2026-W47",
  "rule:gl-price-harvest:2026-W47",
  "rule:gl-serp-spotcheck:2026-W47",
  "rule:gl-visitors-daily:2026-11-16",
  "rule:tl-ai-citation:2026-W47",
];

test("a new period opens one row for each template and closes the older open copies as resolved", async () => {
  const { rotate, seed, row, open, at } = setup("2026-11-14T18:00:00.000Z");
  await seed("rule:gl-visitors-daily:2026-11-14");
  await seed("rule:gl-other-engines:2026-W46");
  at(MONDAY);

  const res = await rotate();
  assert.deepEqual(open(), CURRENT);
  assert.deepEqual(res.resolved.sort(), ["rule:gl-other-engines:2026-W46", "rule:gl-visitors-daily:2026-11-14"]);
  assert.equal(res.created.length, 6);
  for (const key of res.resolved) {
    assert.equal(row(key).status, "done", key);
    assert.equal(row(key).closed_reason, "resolved", key);
  }
});

for (const state of ["queued", "running", "returned", "failed"] as const) {
  test(`an older row that is ${state} holds the slot: it stays open and the template gets no new-period row`, async () => {
    const { rotate, seed, withAgent, row, open, at } = setup("2026-11-12T18:00:00.000Z");
    await seed("rule:gl-visitors-daily:2026-11-12");
    await withAgent("rule:gl-visitors-daily:2026-11-12", state);
    await seed("rule:gl-visitors-daily:2026-11-15");
    at(MONDAY);

    const res = await rotate();
    assert.deepEqual(res.held, ["rule:gl-visitors-daily:2026-11-16"]);
    assert.equal(row("rule:gl-visitors-daily:2026-11-16"), undefined);
    assert.equal(row("rule:gl-visitors-daily:2026-11-12").status, "open");
    assert.equal(row("rule:gl-visitors-daily:2026-11-12").delegation_state, state);
    assert.equal(row("rule:gl-visitors-daily:2026-11-15").closed_reason, "resolved");
    assert.deepEqual(open().filter((k) => k.startsWith("rule:gl-visitors-daily:")), ["rule:gl-visitors-daily:2026-11-12"]);
  });
}

test("a held slot closes a current-period copy that an earlier run made, and it opens again when the slot is free", async () => {
  const { store, rotate, seed, withAgent, row, open } = setup();
  await seed("rule:gl-other-engines:2026-W46");
  await withAgent("rule:gl-other-engines:2026-W46", "returned");
  await seed("rule:gl-other-engines:2026-W47");

  const first = await rotate();
  assert.deepEqual(first.held, ["rule:gl-other-engines:2026-W47"]);
  assert.equal(row("rule:gl-other-engines:2026-W47").closed_reason, "resolved");
  assert.deepEqual(open().filter((k) => k.includes("gl-other-engines")), ["rule:gl-other-engines:2026-W46"]);

  await store.updateItem(row("rule:gl-other-engines:2026-W46").id, { status: "done" });
  const second = await rotate();
  assert.deepEqual(second.reopened, ["rule:gl-other-engines:2026-W47"]);
  assert.deepEqual(open().filter((k) => k.includes("gl-other-engines")), ["rule:gl-other-engines:2026-W47"]);
});

test("a current-period row that a person closed stays closed", async () => {
  const { store, rotate, row } = setup();
  await rotate();
  await store.updateItem(row("rule:gl-price-harvest:2026-W47").id, { status: "done" });
  await store.updateItem(row("rule:gl-serp-spotcheck:2026-W47").id, { status: "dismissed" });
  const res = await rotate();
  assert.deepEqual(res.skipped_closed.sort(), ["rule:gl-price-harvest:2026-W47", "rule:gl-serp-spotcheck:2026-W47"]);
  assert.equal(row("rule:gl-price-harvest:2026-W47").status, "done");
  assert.equal(row("rule:gl-serp-spotcheck:2026-W47").status, "dismissed");
});

test("a snoozed older row is never closed by the rule, and one whose snooze has passed is", async () => {
  const { store, rotate, seed, row, at } = setup("2026-11-14T18:00:00.000Z");
  const asleep = await seed("rule:gl-visitors-daily:2026-11-14");
  const woke = await seed("rule:gl-other-engines:2026-W46");
  await store.updateItem(asleep, { status: "snoozed", snoozed_until: "2026-11-20T00:00:00.000Z" });
  await store.updateItem(woke, { status: "snoozed", snoozed_until: "2026-11-15T00:00:00.000Z" });
  at(MONDAY);

  const res = await rotate();
  assert.equal(row("rule:gl-visitors-daily:2026-11-14").status, "snoozed");
  assert.equal(row("rule:gl-visitors-daily:2026-11-16").status, "open", "a snoozed row does not hold the slot");
  assert.deepEqual(res.resolved, ["rule:gl-other-engines:2026-W46"]);
});

test("an older open row that an agent finished and a person reopened is never closed, and does not hold the slot", async () => {
  const { rotate, seed, withAgent, row, at } = setup("2026-11-14T18:00:00.000Z");
  await seed("rule:gl-visitors-daily:2026-11-14");
  await withAgent("rule:gl-visitors-daily:2026-11-14", "done");
  at(MONDAY);

  const res = await rotate();
  assert.equal(row("rule:gl-visitors-daily:2026-11-14").status, "open");
  assert.equal(row("rule:gl-visitors-daily:2026-11-16").status, "open");
  assert.deepEqual(res.held, []);
  assert.deepEqual(res.resolved, []);
});

test("open rows of a retired template close as resolved, unless they hold a slot", async () => {
  const { rotate, seed, withAgent, row } = setup();
  await seed("rule:tl-audit-weekly:2026-W47", { project: "tailor" });
  await seed("rule:gl-data-floor:2026-W47");
  await withAgent("rule:gl-data-floor:2026-W47", "failed");
  await seed("rule:gl-index-sample:2026-W47");
  await withAgent("rule:gl-index-sample:2026-W47", "running");

  const res = await rotate();
  assert.equal(row("rule:tl-audit-weekly:2026-W47").closed_reason, "resolved");
  assert.equal(row("rule:gl-data-floor:2026-W47").status, "open");
  assert.equal(row("rule:gl-index-sample:2026-W47").status, "open");
  assert.ok(res.resolved.includes("rule:tl-audit-weekly:2026-W47"));
});

test("the rule leaves other sources and keys that are not template keys alone", async () => {
  const { rotate, seed, row } = setup();
  await seed("manual:groomlocal:x", { source: "manual" });
  await seed("rule:gl-visitors-daily:2026-11-01", { source: "manual" });
  await seed("rule:odd");
  await rotate();
  assert.equal(row("manual:groomlocal:x").status, "open");
  assert.equal(row("rule:gl-visitors-daily:2026-11-01").status, "open");
  assert.equal(row("rule:odd").status, "open");
});

test("rotateRecurring refuses an item that is not recurring, and two items for one template", async () => {
  const { store, db } = setup();
  const [visitors] = generateRecurring(new Date(MONDAY));
  await assert.rejects(store.rotateRecurring([{ ...visitors, source: "manual" }]), /is not a recurring item/);
  await assert.rejects(store.rotateRecurring([{ ...visitors, dedupe_key: "seo:x" }]), /is not a recurring item/);
  await assert.rejects(store.rotateRecurring([visitors, { ...visitors, dedupe_key: "rule:gl-visitors-daily:2026-11-17" }]), /Two items for template gl-visitors-daily/);
  assert.equal(db.rows.length, 0);
});

test("the board of 2026-11-16 converges to one open row for each template, and a second run changes nothing", async () => {
  const { rotate, seed, withAgent, open, db, at } = setup("2026-11-10T18:00:00.000Z");
  await seed("rule:gl-visitors-daily:2026-11-12");
  await withAgent("rule:gl-visitors-daily:2026-11-12", "returned");
  await seed("rule:gl-community-answer:2026-W46");
  await withAgent("rule:gl-community-answer:2026-W46", "returned");
  await seed("rule:gl-other-engines:2026-W46");
  await seed("rule:gl-visitors-daily:2026-11-15");
  at(MONDAY);
  for (const key of [
    "rule:gl-visitors-daily:2026-11-16",
    "rule:gl-community-answer:2026-W47",
    "rule:gl-other-engines:2026-W47",
    "rule:gl-index-sample:2026-W47",
    "rule:gl-data-floor:2026-W47",
    "rule:gl-serp-spotcheck:2026-W47",
    "rule:gl-price-harvest:2026-W47",
    "rule:tl-audit-weekly:2026-W47",
    "rule:tl-gsc-weekly:2026-W47",
    "rule:tl-ai-citation:2026-W47",
  ]) {
    await seed(key);
  }

  const first = await rotate();
  const expected = [
    "rule:gl-community-answer:2026-W46",
    "rule:gl-other-engines:2026-W47",
    "rule:gl-price-harvest:2026-W47",
    "rule:gl-serp-spotcheck:2026-W47",
    "rule:gl-visitors-daily:2026-11-12",
    "rule:tl-ai-citation:2026-W47",
  ];
  assert.deepEqual(open(), expected);
  assert.deepEqual(first.held.sort(), ["rule:gl-community-answer:2026-W47", "rule:gl-visitors-daily:2026-11-16"]);
  assert.deepEqual(first.resolved.sort(), [
    "rule:gl-community-answer:2026-W47",
    "rule:gl-data-floor:2026-W47",
    "rule:gl-index-sample:2026-W47",
    "rule:gl-other-engines:2026-W46",
    "rule:gl-visitors-daily:2026-11-15",
    "rule:gl-visitors-daily:2026-11-16",
    "rule:tl-audit-weekly:2026-W47",
    "rule:tl-gsc-weekly:2026-W47",
  ]);

  const before = JSON.stringify(db.rows.map((r) => [r.dedupe_key, r.status, r.closed_reason, r.delegation_state]));
  const second = await rotate();
  assert.deepEqual(second.created, []);
  assert.deepEqual(second.resolved, []);
  assert.deepEqual(second.reopened, []);
  assert.deepEqual(open(), expected);
  assert.equal(JSON.stringify(db.rows.map((r) => [r.dedupe_key, r.status, r.closed_reason, r.delegation_state])), before);
});

test("a run that stopped part way converges on the next run", async () => {
  const { db, rotate, seed, open, at } = setup("2026-11-14T18:00:00.000Z");
  await seed("rule:gl-visitors-daily:2026-11-14");
  at(MONDAY);
  const insert = db.insert.bind(db);
  let calls = 0;
  db.insert = async (row) => {
    calls += 1;
    if (calls === 3) throw new Error("network down");
    return insert(row);
  };
  await assert.rejects(rotate(), /network down/);
  db.insert = insert;
  await rotate();
  assert.deepEqual(open(), CURRENT);
});

test("rotation runs again the next day and keeps one daily row", async () => {
  const { rotate, open, advance } = setup();
  await rotate();
  advance(DAY);
  const res = await rotate();
  assert.deepEqual(res.resolved, ["rule:gl-visitors-daily:2026-11-16"]);
  assert.deepEqual(res.created, ["rule:gl-visitors-daily:2026-11-17"]);
  assert.deepEqual(open().filter((k) => k.includes("visitors")), ["rule:gl-visitors-daily:2026-11-17"]);
});
