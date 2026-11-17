import test from "node:test";
import assert from "node:assert/strict";
import { createFakeItemsDb } from "./fake-db.ts";
import { createItemStore } from "./store.ts";
import type { ItemInput, ItemStatus } from "./types.ts";

const PROJECTS = { tailor: "p-tailor", groomlocal: "p-gl" };

function setup(start = "2026-11-06T12:00:00.000Z") {
  let t = new Date(start);
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
  return { db, store, advance, now: () => t };
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function input(over: Partial<ItemInput> = {}): ItemInput {
  return { kind: "task", title: "Do the thing", source: "test", dedupe_key: "test:a", ...over };
}

const rowFor = (db: ReturnType<typeof setup>["db"], key: string) => {
  const row = db.rows.find((r) => r.dedupe_key === key);
  assert.ok(row, `row ${key} exists`);
  return row;
};

test("addItem creates an open row with the contract defaults", async () => {
  const { store, db } = setup();
  const res = await store.addItem(input());
  assert.equal(res.created, true);
  const row = rowFor(db, "test:a");
  assert.equal(row.id, res.id);
  assert.equal(row.status, "open");
  assert.equal(row.priority, 2);
  assert.equal(row.owner, "camren");
  assert.deepEqual(row.evidence, []);
  assert.equal(row.project_id, null);
});

test("addItem resolves a project slug, and fails on an unknown slug", async () => {
  const { store, db } = setup();
  await store.addItem(input({ project: "tailor" }));
  assert.equal(rowFor(db, "test:a").project_id, "p-tailor");
  await assert.rejects(store.addItem(input({ dedupe_key: "test:b", project: "nope" })), /Project not found: nope/);
  assert.equal(db.rows.length, 1);
});

test("addItem on an open row rewrites the producer fields and keeps the status", async () => {
  const { store, db, advance } = setup();
  const { id } = await store.addItem(input({ why: "old", priority: 3, owner: "agent" }));
  await store.updateItem(id, { status: "snoozed", snoozed_until: "2026-11-09T00:00:00.000Z" });
  advance(HOUR);
  const evidence = [{ label: "Count", value: 5, fetched_at: "2026-11-06T13:00:00.000Z" }];
  const res = await store.addItem(
    input({ title: "New title", why: "new", evidence, link: "https://example.com/x", priority: 1, owner: "camren", due_at: "2026-11-07T08:00:00.000Z" }),
  );
  assert.deepEqual(res, { id, created: false });
  const row = rowFor(db, "test:a");
  assert.equal(row.title, "New title");
  assert.equal(row.why, "new");
  assert.deepEqual(row.evidence, evidence);
  assert.equal(row.link, "https://example.com/x");
  assert.equal(row.priority, 1);
  assert.equal(row.owner, "camren");
  assert.equal(row.due_at, "2026-11-07T08:00:00.000Z");
  assert.equal(row.last_seen_at, "2026-11-06T13:00:00.000Z");
  assert.equal(row.status, "snoozed");
  assert.equal(row.snoozed_until, "2026-11-09T00:00:00.000Z");
});

for (const closing of ["done", "dismissed"] as const) {
  test(`addItem on a ${closing} row changes nothing and reports closed`, async () => {
    const { store, db, advance } = setup();
    const { id } = await store.addItem(input({ why: "first" }));
    await store.updateItem(id, { status: closing });
    const before = { ...rowFor(db, "test:a") };
    advance(DAY);
    const res = await store.addItem(input({ title: "Changed", why: "second", priority: 0 }));
    assert.deepEqual(res, { id, created: false, closed: true });
    assert.deepEqual(rowFor(db, "test:a"), before);
  });
}

test("addItem rejects a title over 90 characters and a link with a script scheme", async () => {
  const { store, db } = setup();
  await assert.rejects(store.addItem(input({ title: "x".repeat(91) })), /title/);
  await assert.rejects(store.addItem(input({ link: "javascript:alert(1)" })), /link/);
  assert.equal(db.rows.length, 0);
});

test("syncItems resolves open and snoozed rows of its source that are missing, and nothing else", async () => {
  const { store, db } = setup();
  const keep = await store.addItem(input({ dedupe_key: "s:keep", source: "s" }));
  const gone = await store.addItem(input({ dedupe_key: "s:gone", source: "s" }));
  const asleep = await store.addItem(input({ dedupe_key: "s:asleep", source: "s" }));
  const doneRow = await store.addItem(input({ dedupe_key: "s:done", source: "s" }));
  const dismissed = await store.addItem(input({ dedupe_key: "s:dismissed", source: "s" }));
  await store.addItem(input({ dedupe_key: "o:other", source: "other" }));
  await store.updateItem(asleep.id, { status: "snoozed", snoozed_until: "2026-11-10T00:00:00.000Z" });
  await store.updateItem(doneRow.id, { status: "done" });
  await store.updateItem(dismissed.id, { status: "dismissed" });
  const doneBefore = { ...rowFor(db, "s:done") };
  const dismissedBefore = { ...rowFor(db, "s:dismissed") };

  const res = await store.syncItems({ source: "s", complete: true, items: [input({ dedupe_key: "s:keep", source: "s" }), input({ dedupe_key: "s:new", source: "s" })] });

  assert.deepEqual(res, { source: "s", created: 1, updated: 1, reopened: 0, skipped_closed: 0, resolved: 2 });
  assert.equal(rowFor(db, "s:keep").status, "open");
  assert.equal(rowFor(db, "s:new").status, "open");
  for (const key of ["s:gone", "s:asleep"]) {
    const row = rowFor(db, key);
    assert.equal(row.status, "done", key);
    assert.equal(row.closed_reason, "resolved", key);
    assert.equal(row.closed_at, "2026-11-06T12:00:00.000Z", key);
  }
  assert.equal(rowFor(db, "o:other").status, "open");
  assert.deepEqual(rowFor(db, "s:done"), doneBefore);
  assert.deepEqual(rowFor(db, "s:dismissed"), dismissedBefore);
  assert.equal(keep.id, rowFor(db, "s:keep").id);
  assert.equal(gone.id, rowFor(db, "s:gone").id);
});

test("syncItems refuses to run without complete: true and writes nothing", async () => {
  const { store, db } = setup();
  await store.addItem(input({ dedupe_key: "s:a", source: "s" }));
  const call = (complete: unknown) =>
    store.syncItems({ source: "s", items: [], complete } as unknown as Parameters<typeof store.syncItems>[0]);
  await assert.rejects(call(false), /complete: true/);
  await assert.rejects(call(undefined), /complete: true/);
  assert.equal(rowFor(db, "s:a").status, "open");
});

test("syncItems fails before any write when an item has another source or is invalid", async () => {
  const { store, db } = setup();
  await store.addItem(input({ dedupe_key: "s:a", source: "s" }));
  await assert.rejects(
    store.syncItems({ source: "s", complete: true, items: [input({ dedupe_key: "s:b", source: "s" }), input({ dedupe_key: "x:c", source: "x" })] }),
    /Wrong source on: x:c/,
  );
  await assert.rejects(
    store.syncItems({ source: "s", complete: true, items: [input({ dedupe_key: "s:b", source: "s" }), input({ dedupe_key: "s:c", source: "s", title: "" })] }),
    /items\[1\]\.title/,
  );
  await assert.rejects(
    store.syncItems({ source: "s", complete: true, items: [input({ dedupe_key: "s:b", source: "s", project: "nope" })] }),
    /Project not found/,
  );
  assert.equal(db.rows.length, 1);
  assert.equal(rowFor(db, "s:a").status, "open");
});

test("syncItems is idempotent", async () => {
  const { store, db } = setup();
  const items = [input({ dedupe_key: "s:a", source: "s" }), input({ dedupe_key: "s:b", source: "s" })];
  await store.syncItems({ source: "s", complete: true, items });
  const second = await store.syncItems({ source: "s", complete: true, items });
  assert.deepEqual(second, { source: "s", created: 0, updated: 2, reopened: 0, skipped_closed: 0, resolved: 0 });
  assert.equal(db.rows.length, 2);
});

test("a resolved row stays closed on a plain upsert and comes back with reopen", async () => {
  const { store, db } = setup();
  const item = input({ dedupe_key: "s:a", source: "s", title: "Dirty tree" });
  await store.syncItems({ source: "s", complete: true, items: [item] });
  await store.syncItems({ source: "s", complete: true, items: [] });
  assert.equal(rowFor(db, "s:a").closed_reason, "resolved");

  const plain = await store.syncItems({ source: "s", complete: true, items: [item] });
  assert.deepEqual(plain, { source: "s", created: 0, updated: 0, reopened: 0, skipped_closed: 1, resolved: 0 });
  assert.equal(rowFor(db, "s:a").status, "done");

  const back = await store.syncItems({ source: "s", complete: true, items: [{ ...item, reopen: true }] });
  assert.equal(back.reopened, 1);
  const row = rowFor(db, "s:a");
  assert.equal(row.status, "open");
  assert.equal(row.closed_reason, null);
  assert.equal(row.closed_at, null);
});

test("reopen brings back a row a person marked done, and never one that was dismissed", async () => {
  const { store, db } = setup();
  const a = await store.addItem(input({ dedupe_key: "s:a", source: "s" }));
  const b = await store.addItem(input({ dedupe_key: "s:b", source: "s" }));
  await store.updateItem(a.id, { status: "done" });
  await store.updateItem(b.id, { status: "dismissed" });
  const res = await store.syncItems({
    source: "s",
    complete: true,
    items: [input({ dedupe_key: "s:a", source: "s", reopen: true }), input({ dedupe_key: "s:b", source: "s", reopen: true })],
  });
  assert.equal(res.reopened, 1);
  assert.equal(res.skipped_closed, 1);
  assert.equal(rowFor(db, "s:a").status, "open");
  assert.equal(rowFor(db, "s:b").status, "dismissed");
});

// The contract's table of allowed moves, restated here on purpose.
const ALLOWED: Record<ItemStatus, ItemStatus[]> = {
  open: ["snoozed", "done", "dismissed"],
  snoozed: ["open", "done", "dismissed"],
  done: ["open"],
  dismissed: ["open"],
};

async function itemInStatus(status: ItemStatus) {
  const ctx = setup();
  const { id } = await ctx.store.addItem(input());
  const snoozeUntil = new Date(ctx.now().getTime() + 7 * DAY).toISOString();
  if (status === "snoozed") await ctx.store.updateItem(id, { status, snoozed_until: snoozeUntil });
  else if (status !== "open") await ctx.store.updateItem(id, { status });
  return { ...ctx, id };
}

for (const from of Object.keys(ALLOWED) as ItemStatus[]) {
  for (const to of ["open", "snoozed", "done", "dismissed"] as const) {
    const allowed = ALLOWED[from].includes(to);
    test(`updateItem ${from} to ${to} is ${allowed ? "allowed" : "refused"}`, async () => {
      const { store, id, db, now } = await itemInStatus(from);
      const patch = to === "snoozed" ? { status: to, snoozed_until: new Date(now().getTime() + DAY).toISOString() } : { status: to };
      if (!allowed) {
        await assert.rejects(store.updateItem(id, patch), /Cannot move item/);
        assert.equal(rowFor(db, "test:a").status, from);
        return;
      }
      const row = await store.updateItem(id, patch);
      assert.equal(row.status, to);
      if (to === "done" || to === "dismissed") {
        assert.equal(row.closed_reason, to);
        assert.equal(row.closed_at, now().toISOString());
      } else {
        assert.equal(row.closed_reason, null);
        assert.equal(row.closed_at, null);
      }
      assert.equal(row.snoozed_until, to === "snoozed" ? patch.snoozed_until : null);
    });
  }
}

test("snooze needs a future snoozed_until, and only a snooze may carry one", async () => {
  const { store, id, now } = await itemInStatus("open");
  await assert.rejects(store.updateItem(id, { status: "snoozed" }), /snoozed_until/);
  await assert.rejects(store.updateItem(id, { status: "snoozed", snoozed_until: new Date(now().getTime() - HOUR).toISOString() }), /future/);
  await assert.rejects(store.updateItem(id, { status: "done", snoozed_until: new Date(now().getTime() + HOUR).toISOString() }), /only when the status is snoozed/);
  await assert.rejects(store.updateItem(id, { snoozed_until: new Date(now().getTime() + HOUR).toISOString() }), /needs status snoozed/);
});

test("a snoozed row can move its wake time without a status change", async () => {
  const { store, id, now } = await itemInStatus("snoozed");
  const later = new Date(now().getTime() + 30 * DAY).toISOString();
  const row = await store.updateItem(id, { snoozed_until: later });
  assert.equal(row.status, "snoozed");
  assert.equal(row.snoozed_until, later);
});

test("a snoozed row with a past wake time counts as open and can be snoozed again", async () => {
  const { store, id, advance, now } = await itemInStatus("snoozed");
  assert.deepEqual(await store.listItems(), []);
  assert.equal((await store.listItems({ status: "snoozed" })).length, 1);

  advance(8 * DAY);
  assert.equal((await store.listItems()).length, 1);
  assert.deepEqual(await store.listItems({ status: "snoozed" }), []);

  const row = await store.updateItem(id, { status: "snoozed", snoozed_until: new Date(now().getTime() + DAY).toISOString() });
  assert.equal(row.status, "snoozed");
  assert.deepEqual(await store.listItems(), []);
});

test("updateItem changes priority, owner and due_at, and reports bad calls", async () => {
  const { store, id } = await itemInStatus("open");
  const row = await store.updateItem(id, { priority: 0, owner: "agent", due_at: "2026-11-08T00:00:00.000Z" });
  assert.equal(row.priority, 0);
  assert.equal(row.owner, "agent");
  assert.equal(row.due_at, "2026-11-08T00:00:00.000Z");
  assert.equal((await store.updateItem(id, { due_at: null })).due_at, null);
  await assert.rejects(store.updateItem(id, {}), /at least one field/);
  await assert.rejects(store.updateItem("missing", { priority: 1 }), /Item not found/);
});

test("listItems orders by priority, then due_at with nulls last, then created_at", async () => {
  const { store, advance } = setup();
  const add = async (key: string, over: Partial<ItemInput>) => {
    await store.addItem(input({ dedupe_key: key, title: key, ...over }));
    advance(1000);
  };
  await add("p2-null-first", { priority: 2 });
  await add("p2-late", { priority: 2, due_at: "2026-11-09T00:00:00.000Z" });
  await add("p0", { priority: 0 });
  await add("p2-early", { priority: 2, due_at: "2026-11-07T00:00:00.000Z" });
  await add("p2-null-second", { priority: 2 });
  await add("p1", { priority: 1 });
  const titles = (await store.listItems()).map((i) => i.title);
  assert.deepEqual(titles, ["p0", "p1", "p2-early", "p2-late", "p2-null-first", "p2-null-second"]);
});

test("listItems filters by project, kind, owner and status, and applies the limit", async () => {
  const { store } = setup();
  await store.addItem(input({ dedupe_key: "a", project: "tailor", kind: "seo_task", owner: "agent" }));
  await store.addItem(input({ dedupe_key: "b", project: "groomlocal", kind: "seo_task" }));
  await store.addItem(input({ dedupe_key: "c", project: null, kind: "follow_up" }));
  const done = await store.addItem(input({ dedupe_key: "d", project: "tailor", kind: "task" }));
  await store.updateItem(done.id, { status: "done" });

  const keys = async (q: Parameters<typeof store.listItems>[0]) => (await store.listItems(q)).map((i) => i.dedupe_key).sort();
  assert.deepEqual(await keys({}), ["a", "b", "c"]);
  assert.deepEqual(await keys({ project: "tailor" }), ["a"]);
  assert.deepEqual(await keys({ kind: "seo_task" }), ["a", "b"]);
  assert.deepEqual(await keys({ owner: "agent" }), ["a"]);
  assert.deepEqual(await keys({ status: "done" }), ["d"]);
  assert.equal((await store.listItems({ limit: 2 })).length, 2);
  assert.equal((await store.listItems({ project: "tailor" }))[0].project, "tailor");
  await assert.rejects(store.listItems({ project: "nope" }), /Project not found/);
});

test("updateItem changes title, why and link of an open row and keeps the fields it was not sent", async () => {
  const { store, id } = await itemInStatus("open");
  await store.updateItem(id, { priority: 1, why: "Old why", link: "https://example.com/old" });
  const row = await store.updateItem(id, { title: "New title", why: "New why" });
  assert.equal(row.title, "New title");
  assert.equal(row.why, "New why");
  assert.equal(row.link, "https://example.com/old");
  assert.equal(row.priority, 1);
  assert.equal((await store.updateItem(id, { link: "/today" })).link, "/today");
});

test("updateItem merges evidence by label: a label replaces its entry, a new label is added", async () => {
  const { store, db } = setup();
  const at = "2026-11-06T12:00:00.000Z";
  const { id } = await store.addItem(
    input({ evidence: [{ label: "report", url: "/r1", fetched_at: at }, { label: "gsc", value: 5, fetched_at: at }] }),
  );
  await store.updateItem(id, { evidence: [{ label: "report", url: "/r2", fetched_at: at }, { label: "retry", value: "ok", fetched_at: at }] });
  assert.deepEqual(rowFor(db, "test:a").evidence, [
    { label: "gsc", value: 5, fetched_at: at },
    { label: "report", url: "/r2", fetched_at: at },
    { label: "retry", value: "ok", fetched_at: at },
  ]);
});

test("updateItem changes the content of a snoozed row, and of a closed row only when it reopens it", async () => {
  const snoozed = await itemInStatus("snoozed");
  assert.equal((await snoozed.store.updateItem(snoozed.id, { why: "Still waiting" })).status, "snoozed");

  for (const status of ["done", "dismissed"] as const) {
    const { store, id, db } = await itemInStatus(status);
    await assert.rejects(store.updateItem(id, { why: "late" }), new RegExp(`is ${status}. Reopen it`));
    assert.equal(rowFor(db, "test:a").why, null);
    const row = await store.updateItem(id, { status: "open", why: "Back again" });
    assert.equal(row.status, "open");
    assert.equal(row.why, "Back again");
  }
});

test("updateItem closes a row and records the final content in one call", async () => {
  const { store, id } = await itemInStatus("open");
  const row = await store.updateItem(id, { status: "done", why: "Shipped in the draft PR" });
  assert.equal(row.status, "done");
  assert.equal(row.why, "Shipped in the draft PR");
});

test("updateItem refuses an invalid or unknown patch field and changes nothing", async () => {
  const { store, id, db } = await itemInStatus("open");
  const before = { ...rowFor(db, "test:a") };
  await assert.rejects(store.updateItem(id, { title: "x".repeat(91) }), /Invalid patch: title/);
  await assert.rejects(store.updateItem(id, { link: "javascript:alert(1)" }), /Invalid patch: link/);
  await assert.rejects(store.updateItem(id, { evidence: [{ label: "x" }] } as never), /Invalid patch: evidence\.0\.fetched_at/);
  await assert.rejects(store.updateItem(id, { source: "other" } as never), /Invalid patch: .*source/);
  assert.deepEqual(rowFor(db, "test:a"), before);
});

test("findItem finds a row by id or dedupe key, and returns null when none exists", async () => {
  const { store } = setup();
  const { id } = await store.addItem(input());
  assert.equal((await store.findItem({ id }))?.dedupe_key, "test:a");
  assert.equal((await store.findItem({ dedupe_key: "test:a" }))?.id, id);
  assert.equal(await store.findItem({ dedupe_key: "test:none" }), null);
});

test("listItems filters by source", async () => {
  const { store } = setup();
  await store.addItem(input({ dedupe_key: "a", source: "seo:tailor" }));
  await store.addItem(input({ dedupe_key: "b", source: "manual" }));
  assert.deepEqual((await store.listItems({ source: "seo:tailor" })).map((i) => i.dedupe_key), ["a"]);
});
