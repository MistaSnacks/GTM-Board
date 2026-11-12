import test from "node:test";
import assert from "node:assert/strict";
import { ACTION_PATCHES, agentView, ageLabel, buildSections, countWithAgents, isItemAction, safeHref, sectionOf } from "../lib/today.ts";

const NOW = new Date("2026-11-07T02:30:00.000Z");

function item(over = {}) {
  return {
    id: "id-" + Math.random().toString(36).slice(2),
    project_id: null,
    project: null,
    kind: "task",
    title: "A thing",
    why: null,
    evidence: [],
    link: null,
    source: "test",
    dedupe_key: "test:" + Math.random().toString(36).slice(2),
    priority: 2,
    owner: "camren",
    status: "open",
    snoozed_until: null,
    due_at: null,
    closed_reason: null,
    card_id: null,
    created_at: "2026-11-06T00:00:00.000Z",
    updated_at: "2026-11-06T00:00:00.000Z",
    last_seen_at: "2026-11-06T00:00:00.000Z",
    closed_at: null,
    delegated_to: null,
    delegation_state: null,
    delegation_ref: null,
    delegation_note: null,
    delegated_at: null,
    ...over,
  };
}

test("sections follow the contract: needs you now, agents, SEO, code, follow-ups, later", () => {
  const cases = [
    [{ owner: "camren", priority: 0, kind: "task" }, "now"],
    [{ owner: "camren", priority: 1, kind: "repo_attention" }, "now"],
    [{ owner: "camren", priority: 1, kind: "agent_failed" }, "now"],
    [{ owner: "camren", priority: 2, kind: "agent_failed" }, "agents"],
    [{ owner: "camren", priority: 2, kind: "agent_needs_input" }, "agents"],
    [{ owner: "agent", priority: 1, kind: "agent_failed" }, "agents"],
    [{ owner: "agent", priority: 2, kind: "task", due_at: "2026-11-07T00:00:00.000Z" }, "agents"],
    [{ owner: "agent", priority: 1, kind: "seo_task", due_at: "2026-11-07T00:00:00.000Z" }, "agents"],
    [{ owner: "agent", priority: 2, kind: "task", due_at: "2026-11-08T00:00:00.000Z" }, "later"],
    [{ owner: "agent", priority: 2, kind: "seo_task" }, "seo"],
    [{ owner: "camren", priority: 3, kind: "seo_task" }, "seo"],
    [{ owner: "camren", priority: 2, kind: "repo_attention" }, "code"],
    [{ owner: "camren", priority: 3, kind: "pr_attention" }, "code"],
    [{ owner: "camren", priority: 2, kind: "follow_up" }, "followups"],
    [{ owner: "camren", priority: 2, kind: "task" }, "later"],
    [{ owner: "camren", priority: 3, kind: "metric_alert" }, "later"],
  ];
  for (const [over, expected] of cases) assert.equal(sectionOf(item(over), NOW), expected, JSON.stringify(over));
});

test("a camren item past its due time is not overdue, an agent item is", () => {
  const camren = item({ owner: "camren", priority: 2, kind: "task", due_at: "2026-11-01T00:00:00.000Z" });
  assert.equal(sectionOf(camren, NOW), "later");
});

test("every open item lands in exactly one section, whatever its kind, owner and priority", () => {
  const kinds = ["seo_task", "follow_up", "repo_attention", "pr_attention", "agent_needs_input", "agent_failed", "metric_alert", "task"];
  const items = [];
  for (const kind of kinds) for (const owner of ["camren", "agent"]) for (const priority of [0, 1, 2, 3]) items.push(item({ kind, owner, priority }));
  const sections = buildSections(items, NOW);
  assert.equal(sections.reduce((n, s) => n + s.count, 0), items.length);
  assert.equal(sections.reduce((n, s) => n + s.groups.reduce((m, g) => m + g.items.length, 0), 0), items.length);
  assert.deepEqual(sections.map((s) => s.def.id), ["now", "agents", "seo", "code", "followups", "later"]);
  assert.equal(sections.find((s) => s.def.id === "later")?.def.collapsed, true);
});

test("SEO items are grouped by project, alphabetical, with general last", () => {
  const items = [
    item({ kind: "seo_task", project: "tailor", title: "t1", priority: 2 }),
    item({ kind: "seo_task", project: null, title: "g1", priority: 2 }),
    item({ kind: "seo_task", project: "groomlocal", title: "gl1", priority: 2 }),
    item({ kind: "seo_task", project: "tailor", title: "t2", priority: 3 }),
  ];
  const seo = buildSections(items, NOW).find((s) => s.def.id === "seo");
  assert.deepEqual(seo.groups.map((g) => [g.label, g.items.map((i) => i.title)]), [
    ["groomlocal", ["gl1"]],
    ["tailor", ["t1", "t2"]],
    ["General", ["g1"]],
  ]);
});

test("each row button writes the status the contract names, with snooze times from the clock", () => {
  assert.deepEqual(ACTION_PATCHES.done(NOW), { status: "done" });
  assert.deepEqual(ACTION_PATCHES.dismiss(NOW), { status: "dismissed" });
  assert.deepEqual(ACTION_PATCHES["snooze-1d"](NOW), { status: "snoozed", snoozed_until: "2026-11-08T02:30:00.000Z" });
  assert.deepEqual(ACTION_PATCHES["snooze-1w"](NOW), { status: "snoozed", snoozed_until: "2026-11-14T02:30:00.000Z" });
  assert.equal(isItemAction("done"), true);
  assert.equal(isItemAction("delete"), false);
  assert.equal(isItemAction("toString"), false);
});

test("links: only web, file and board-relative links become an href", () => {
  assert.equal(safeHref("https://github.com/a/b/pull/1"), "https://github.com/a/b/pull/1");
  assert.equal(safeHref("file:///Users/x/review.html"), "file:///Users/x/review.html");
  assert.equal(safeHref("/kanban"), "/kanban");
  assert.equal(safeHref("javascript:alert(1)"), null);
  assert.equal(safeHref("data:text/html,x"), null);
  assert.equal(safeHref(null), null);
});

test("ageLabel gives minutes, hours, then days", () => {
  const ago = (ms) => new Date(NOW.getTime() - ms).toISOString();
  assert.equal(ageLabel(ago(5 * 60_000), NOW), "5m");
  assert.equal(ageLabel(ago(3 * 3_600_000), NOW), "3h");
  assert.equal(ageLabel(ago(47 * 3_600_000), NOW), "47h");
  assert.equal(ageLabel(ago(72 * 3_600_000), NOW), "3d");
  assert.equal(ageLabel(ago(-1000), NOW), "0m");
});

const AT = "2026-11-07T02:00:00.000Z";
const delegated = (state, over = {}) =>
  item({ project: "tailor", delegated_to: "hermes-mac", delegation_state: state, delegated_at: AT, ...over });
const runner = (over = {}) => ({ name: "hermes-mac", label: "Hermes", projects: ["tailor"], last_seen_at: "2026-11-07T02:29:00.000Z", ...over });

test("an item with an agent never lands in Needs you now, whatever its owner and priority", () => {
  for (const state of ["queued", "running", "returned", "failed"]) {
    assert.equal(sectionOf(delegated(state, { owner: "camren", priority: 0 }), NOW), "agents", state);
  }
  assert.equal(sectionOf(delegated("done", { owner: "camren", priority: 0 }), NOW), "now");
  assert.equal(sectionOf(delegated("queued", { kind: "seo_task", priority: 3 }), NOW), "agents");
});

test("the page counts the items that wait on an agent: queued and running", () => {
  const items = ["queued", "running", "returned", "failed", "done"].map((s) => delegated(s)).concat(item());
  assert.equal(countWithAgents(items), 2);
});

test("a row with no delegation: ready sends, offline is disabled with the last check-in, unserved names the project", () => {
  const ready = agentView(item({ project: "tailor" }), [runner()], NOW);
  assert.deepEqual(ready.send, { label: "Send to Hermes", enabled: true, title: "Send this item to Hermes" });
  assert.equal(ready.badge, null);
  assert.equal(ready.canRecall, false);

  const offline = agentView(item({ project: "tailor" }), [runner({ last_seen_at: "2026-11-07T01:00:00.000Z" })], NOW);
  assert.equal(offline.send?.label, "Send to Hermes");
  assert.equal(offline.send?.enabled, false);
  assert.match(offline.send?.title ?? "", /last checked in 1h ago/);
  assert.match(offline.warning ?? "", /Hermes is offline/);

  const unserved = agentView(item({ project: "groomlocal" }), [runner()], NOW);
  assert.equal(unserved.send?.label, "No agent for groomlocal");
  assert.equal(unserved.send?.enabled, false);
  assert.match(unserved.send?.title ?? "", /Install the dispatcher/);

  assert.equal(agentView(item({ project: null }), [runner()], NOW).send, null);
});

test("a row offers no send button when the runners could not be read", () => {
  assert.equal(agentView(item({ project: "tailor" }), null, NOW).send, null);
});

test("queued and running rows show a badge, the time since sent, and Take back, with no send button", () => {
  const queued = agentView(delegated("queued"), [runner()], NOW);
  assert.deepEqual(queued.badge, { text: "QUEUED · HERMES", className: "badge badge-denim" });
  assert.equal(queued.sentAgo, "sent 30m ago");
  assert.equal(queued.send, null);
  assert.equal(queued.canRecall, true);
  assert.equal(queued.warning, null);

  const running = agentView(delegated("running", { delegation_ref: "job1" }), [runner()], NOW);
  assert.equal(running.badge?.text, "HERMES WORKING");
  assert.equal(running.sentAgo, "sent 30m ago");
  assert.equal(running.canRecall, true);
});

test("a queued row says so when its runner is offline", () => {
  const view = agentView(delegated("queued"), [runner({ last_seen_at: "2026-11-07T00:30:00.000Z" })], NOW);
  assert.equal(view.warning, "Hermes is offline. It last checked in 2h ago.");
});

test("returned and failed rows show the note, Send again and Take back", () => {
  for (const [state, text] of [["returned", "RETURNED"], ["failed", "FAILED"]]) {
    const view = agentView(delegated(state, { delegation_note: "Need a login." }), [runner()], NOW);
    assert.equal(view.badge?.text, text);
    assert.equal(view.note, "Hermes: Need a login.");
    assert.deepEqual(view.send, { label: "Send again", enabled: true, title: "Send this item to Hermes" });
    assert.equal(view.canRecall, true);
  }
});

test("a done delegation looks like no delegation", () => {
  const view = agentView(delegated("done", { delegation_note: "Fixed." }), [runner()], NOW);
  assert.equal(view.badge, null);
  assert.equal(view.note, null);
  assert.equal(view.send?.label, "Send to Hermes");
  assert.equal(view.canRecall, false);
});
