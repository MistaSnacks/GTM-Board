import test from "node:test";
import assert from "node:assert/strict";
import { createFakeItemsDb } from "./fake-db.ts";
import { sendTarget, RUNNER_STALE_MS } from "./runners.ts";
import { createItemStore } from "./store.ts";
import { delegationOf } from "./delegation.ts";
import type { ItemInput, Runner } from "./types.ts";

const PROJECTS = { tailor: "p-tailor", groomlocal: "p-gl" };
const START = "2026-11-12T12:00:00.000Z";

function setup() {
  let t = new Date(START);
  const clock = () => t;
  const db = createFakeItemsDb({ projects: PROJECTS, now: clock });
  const store = createItemStore({
    db,
    now: clock,
    resolveProject: async (slug) => {
      const id = (PROJECTS as Record<string, string>)[slug];
      if (!id) throw new Error(`Project not found: ${slug}`);
      return id;
    },
  });
  const advance = (ms: number) => {
    t = new Date(t.getTime() + ms);
  };
  const serveTailor = () => store.heartbeat({ name: "hermes-mac", label: "Hermes", projects: ["tailor"] });
  return { db, store, advance, serveTailor };
}

const input = (over: Partial<ItemInput> = {}): ItemInput => ({
  kind: "task",
  title: "Fix the thing",
  source: "test",
  dedupe_key: "test:a",
  project: "tailor",
  ...over,
});

const MINUTE = 60_000;

async function sent() {
  const ctx = setup();
  await ctx.serveTailor();
  const { id } = await ctx.store.addItem(input());
  await ctx.store.delegateItem(id);
  return { ...ctx, id };
}

const stateOf = (db: ReturnType<typeof setup>["db"], id: string) => delegationOf(db.rows.find((r) => r.id === id)!);

test("send queues the item for the runner that serves its project", async () => {
  const { store, serveTailor } = setup();
  await serveTailor();
  const { id } = await store.addItem(input());
  const item = await store.delegateItem(id);
  assert.deepEqual(delegationOf(item), { runner: "hermes-mac", state: "queued", ref: null, note: null, at: START });
  assert.equal(item.status, "open");
  assert.deepEqual((await store.listDelegated("hermes-mac", "queued")).map((i) => i.id), [id]);
});

test("a collector upsert of the same key keeps the delegation and rewrites the producer fields", async () => {
  const { store, db, id } = await sent();
  await store.startItem(id, "job1");
  await store.addItem(input({ title: "Fix the thing, new title", priority: 0 }));
  const row = db.rows.find((r) => r.id === id)!;
  assert.equal(row.title, "Fix the thing, new title");
  assert.deepEqual(delegationOf(row), { runner: "hermes-mac", state: "running", ref: "job1", note: null, at: START });

  await store.syncItems({ source: "test", complete: true, items: [input({ title: "Third title" })] });
  assert.equal(stateOf(db, id)?.state, "running");
});

test("start stores the ref, and report done closes the item with the note", async () => {
  const { store, db, id } = await sent();
  await store.startItem(id, "job1");
  assert.equal(stateOf(db, id)?.ref, "job1");
  await store.reportItem(id, "done", "  Fixed it.  ");
  const row = db.rows.find((r) => r.id === id)!;
  assert.equal(row.status, "done");
  assert.equal(row.closed_reason, "done");
  assert.deepEqual(delegationOf(row), { runner: "hermes-mac", state: "done", ref: "job1", note: "Fixed it.", at: START });
});

test("report returned and failed keep the item open with the note", async () => {
  for (const outcome of ["returned", "failed"] as const) {
    const { store, db, id } = await sent();
    await store.startItem(id, "job1");
    await store.reportItem(id, outcome, "Need a decision.");
    const row = db.rows.find((r) => r.id === id)!;
    assert.equal(row.status, "open");
    assert.equal(delegationOf(row)?.state, outcome);
    assert.equal(delegationOf(row)?.note, "Need a decision.");
  }
});

test("a report note is required and is cut at 500 characters", async () => {
  const { store, db, id } = await sent();
  await store.startItem(id, "job1");
  await assert.rejects(store.reportItem(id, "done", "   "), /needs a note/);
  assert.equal(stateOf(db, id)?.state, "running");
  await store.reportItem(id, "returned", "x".repeat(900));
  assert.equal(stateOf(db, id)?.note?.length, 500);
});

test("recall clears the delegation, and a returned item can go out again", async () => {
  const { store, db, id, advance } = await sent();
  await store.recallItem(id);
  assert.equal(stateOf(db, id), null);
  assert.equal(db.rows[0].delegated_to, null);
  assert.equal(db.rows[0].delegated_at, null);

  await store.delegateItem(id);
  await store.startItem(id, "job1");
  await store.reportItem(id, "returned", "Need a decision.");
  advance(MINUTE);
  await store.delegateItem(id);
  assert.deepEqual(stateOf(db, id), { runner: "hermes-mac", state: "queued", ref: null, note: null, at: "2026-11-12T12:01:00.000Z" });
});

test("each illegal delegation move throws and changes nothing", async () => {
  const { store, db, id } = await sent();
  await assert.rejects(store.delegateItem(id), /Cannot move the delegation .* from queued to queued/);
  await assert.rejects(store.reportItem(id, "done", "n"), /from queued to done/);
  await store.startItem(id, "job1");
  await assert.rejects(store.startItem(id, "job2"), /from running to running/);
  await assert.rejects(store.delegateItem(id), /from running to queued/);
  await store.reportItem(id, "failed", "n");
  await assert.rejects(store.reportItem(id, "done", "n"), /from failed to done/);
  await assert.rejects(store.startItem(id, "job3"), /from failed to running/);
  assert.deepEqual(stateOf(db, id), { runner: "hermes-mac", state: "failed", ref: "job1", note: "n", at: START });

  const { id: free } = await store.addItem(input({ dedupe_key: "test:free" }));
  await assert.rejects(store.startItem(free, "job"), /from none to running/);
  await assert.rejects(store.reportItem(free, "done", "n"), /from none to done/);
  await assert.rejects(store.recallItem(free), /not with an agent/);
});

test("a report on a closed item throws", async () => {
  for (const closing of ["done", "dismissed"] as const) {
    const { store, db, id } = await sent();
    await store.startItem(id, "job1");
    await store.updateItem(id, { status: closing });
    await assert.rejects(store.reportItem(id, "returned", "n"), new RegExp(`is ${closing}`));
    assert.equal(stateOf(db, id)?.state, "running");
  }
});

test("send rejects a general item, an unserved project and an offline runner", async () => {
  const { store, db, advance, serveTailor } = setup();
  await serveTailor();
  const general = await store.addItem(input({ dedupe_key: "test:g", project: null }));
  const unserved = await store.addItem(input({ dedupe_key: "test:u", project: "groomlocal" }));
  const served = await store.addItem(input({ dedupe_key: "test:s" }));
  await assert.rejects(store.delegateItem(general.id), /general item/);
  await assert.rejects(store.delegateItem(unserved.id), /No agent serves project groomlocal/);
  advance(RUNNER_STALE_MS + MINUTE);
  await assert.rejects(store.delegateItem(served.id), /Hermes is offline/);
  assert.ok(db.rows.every((r) => delegationOf(r) === null));
});

test("send rejects an item that is not open", async () => {
  const { store, serveTailor } = setup();
  await serveTailor();
  const { id } = await store.addItem(input());
  await store.updateItem(id, { status: "done" });
  await assert.rejects(store.delegateItem(id), /Only an open item/);
});

test("listDelegated leaves out closed and snoozed items, and keeps the board order", async () => {
  const { store, serveTailor } = setup();
  await serveTailor();
  const low = await store.addItem(input({ dedupe_key: "test:low", priority: 3 }));
  const high = await store.addItem(input({ dedupe_key: "test:high", priority: 0 }));
  const closed = await store.addItem(input({ dedupe_key: "test:closed" }));
  const asleep = await store.addItem(input({ dedupe_key: "test:asleep" }));
  for (const { id } of [low, high, closed, asleep]) await store.delegateItem(id);
  await store.updateItem(closed.id, { status: "dismissed" });
  await store.updateItem(asleep.id, { status: "snoozed", snoozed_until: "2026-11-13T00:00:00.000Z" });
  assert.deepEqual((await store.listDelegated("hermes-mac", "queued")).map((i) => i.id), [high.id, low.id]);
  assert.deepEqual(await store.listDelegated("other-runner", "queued"), []);
  assert.deepEqual(await store.listDelegated("hermes-mac", "running"), []);
});

test("heartbeat registers a runner and refreshes its time", async () => {
  const { store, advance } = setup();
  await store.heartbeat({ name: "hermes-mac", label: "Hermes", projects: ["tailor"] });
  advance(MINUTE);
  await store.heartbeat({ name: "hermes-mac", label: "Hermes", projects: ["tailor", "groomlocal"] });
  assert.deepEqual(await store.listRunners(), [
    { name: "hermes-mac", label: "Hermes", projects: ["tailor", "groomlocal"], last_seen_at: "2026-11-12T12:01:00.000Z" },
  ]);
});

const NOW = new Date(START);
const runner = (name: string, projects: string[], ageMs: number): Runner => ({
  name,
  label: name,
  projects,
  last_seen_at: new Date(NOW.getTime() - ageMs).toISOString(),
});

test("sendTarget: a general item has no target, and an unlisted project is unserved", () => {
  assert.deepEqual(sendTarget(null, [runner("a", ["tailor"], 0)], NOW), { kind: "none" });
  assert.deepEqual(sendTarget("groomlocal", [runner("a", ["tailor"], 0)], NOW), { kind: "unserved", project: "groomlocal" });
  assert.deepEqual(sendTarget("tailor", [], NOW), { kind: "unserved", project: "tailor" });
});

test("sendTarget: a fresh heartbeat is ready, and a stale one is offline", () => {
  const fresh = runner("a", ["tailor"], RUNNER_STALE_MS - 1);
  const stale = runner("a", ["tailor"], RUNNER_STALE_MS);
  assert.deepEqual(sendTarget("tailor", [fresh], NOW), { kind: "ready", runner: fresh });
  assert.deepEqual(sendTarget("tailor", [stale], NOW), { kind: "offline", runner: stale });
});

test("sendTarget: with two runners a live one wins, then the lower name", () => {
  const liveB = runner("b", ["tailor"], 0);
  const liveC = runner("c", ["tailor"], 0);
  const deadA = runner("a", ["tailor"], 2 * RUNNER_STALE_MS);
  assert.deepEqual(sendTarget("tailor", [liveC, deadA, liveB], NOW), { kind: "ready", runner: liveB });
  assert.deepEqual(sendTarget("tailor", [deadA, runner("z", ["tailor"], 3 * RUNNER_STALE_MS)], NOW), { kind: "offline", runner: deadA });
});

test("a queued item can come back as returned, as the dispatcher returns a task no agent may take", async () => {
  const { store, db, id } = await sent();
  await store.reportItem(id, "returned", "Only Camren may do this.");
  assert.deepEqual(stateOf(db, id), { runner: "hermes-mac", state: "returned", ref: null, note: "Only Camren may do this.", at: START });
  assert.equal(db.rows[0].status, "open");
});

test("send refuses a row of a humanOnly template, of any period, and writes nothing", async () => {
  const { store, db } = setup();
  await store.heartbeat({ name: "hermes-mac", label: "Hermes", projects: ["groomlocal"] });
  for (const key of ["rule:gl-community-answer:2026-W46", "rule:gl-community-answer:2026-W47"]) {
    const { id } = await store.addItem(input({ project: "groomlocal", source: "rule:recurring", dedupe_key: key }));
    await assert.rejects(store.delegateItem(id), /Only Camren may do this task/);
    assert.equal(stateOf(db, id), null, key);
  }
  const { id: agentTask } = await store.addItem(input({ project: "groomlocal", source: "rule:recurring", dedupe_key: "rule:gl-visitors-daily:2026-11-12" }));
  assert.equal(delegationOf(await store.delegateItem(agentTask))?.state, "queued");
});
