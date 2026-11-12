import test from "node:test";
import assert from "node:assert/strict";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createFakeItemsDb } from "./fake-db.ts";
import { registerItemTools } from "./register.ts";
import { createItemStore } from "./store.ts";
import { delegationOf } from "./delegation.ts";

async function connect() {
  const db = createFakeItemsDb({ projects: { tailor: "p-tailor" } });
  const store = createItemStore({
    db,
    resolveProject: async (slug) => {
      if (slug !== "tailor") throw new Error(`Project not found: ${slug}`);
      return "p-tailor";
    },
  });
  const server = new McpServer({ name: "test", version: "0" });
  registerItemTools(server, store);
  const [serverEnd, clientEnd] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0" });
  await Promise.all([server.connect(serverEnd), client.connect(clientEnd)]);
  const call = async (name: string, args: Record<string, unknown>) => {
    const res = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: { text: string }[] };
    return { isError: res.isError === true, text: res.content[0].text };
  };
  return { call, client, db, store };
}

const item = { kind: "seo_task", title: "Check the thing", source: "test", dedupe_key: "test:1", project: "tailor" };

test("the five item tools are listed", async () => {
  const { client } = await connect();
  const names = (await client.listTools()).tools.map((t) => t.name).sort();
  assert.deepEqual(names, ["gtm_add_item", "gtm_list_items", "gtm_report_item", "gtm_sync_items", "gtm_update_item"]);
});

test("add, list, update and sync work through the MCP boundary and return JSON", async () => {
  const { call, db } = await connect();
  const added = await call("gtm_add_item", item);
  assert.equal(added.isError, false);
  const { id, created } = JSON.parse(added.text);
  assert.equal(created, true);

  const listed = JSON.parse((await call("gtm_list_items", { project: "tailor" })).text);
  assert.deepEqual(listed.map((i: { id: string }) => i.id), [id]);

  const updated = JSON.parse((await call("gtm_update_item", { id, status: "done" })).text);
  assert.equal(updated.status, "done");

  const synced = JSON.parse((await call("gtm_sync_items", { source: "test", complete: true, items: [{ ...item, dedupe_key: "test:2" }] })).text);
  assert.equal(synced.created, 1);
  assert.equal(db.rows.length, 2);
});

test("the boundary rejects bad input before any write", async () => {
  const { call, db } = await connect();
  assert.equal((await call("gtm_add_item", { ...item, title: "x".repeat(91) })).isError, true);
  assert.equal((await call("gtm_add_item", { ...item, kind: "nope" })).isError, true);
  assert.equal((await call("gtm_add_item", { ...item, priority: 4 })).isError, true);
  assert.equal((await call("gtm_add_item", { ...item, evidence: [{ label: "x", fetched_at: "yesterday" }] })).isError, true);
  assert.equal((await call("gtm_sync_items", { source: "test", complete: false, items: [] })).isError, true);
  assert.equal((await call("gtm_update_item", { id: "not-a-uuid", status: "done" })).isError, true);
  assert.equal(db.rows.length, 0);
});

test("a store error reaches the caller as a tool error", async () => {
  const { call } = await connect();
  const res = await call("gtm_add_item", { ...item, project: "nope" });
  assert.equal(res.isError, true);
  assert.match(res.text, /Project not found: nope/);
});

test("gtm_report_item closes the item on done and keeps it open on returned", async () => {
  const { call, db, store } = await connect();
  await store.heartbeat({ name: "hermes-mac", label: "Hermes", projects: ["tailor"] });
  const send = async (dedupe_key: string) => {
    const { id } = JSON.parse((await call("gtm_add_item", { ...item, dedupe_key })).text);
    await store.delegateItem(id);
    await store.startItem(id, "job");
    return id;
  };
  const finished = await send("test:done");
  const handedBack = await send("test:back");

  const done = JSON.parse((await call("gtm_report_item", { id: finished, outcome: "done", note: "Fixed it." })).text);
  assert.equal(done.status, "done");
  assert.equal(done.delegation_state, "done");

  const back = JSON.parse((await call("gtm_report_item", { id: handedBack, outcome: "returned", note: "Need a login." })).text);
  assert.equal(back.status, "open");
  assert.deepEqual(delegationOf(db.rows.find((r) => r.id === handedBack)!)?.note, "Need a login.");
});

test("gtm_report_item rejects an unknown outcome, an empty note and a report with no delegation", async () => {
  const { call } = await connect();
  const { id } = JSON.parse((await call("gtm_add_item", item)).text);
  assert.equal((await call("gtm_report_item", { id, outcome: "finished", note: "x" })).isError, true);
  assert.equal((await call("gtm_report_item", { id, outcome: "done", note: " " })).isError, true);
  const none = await call("gtm_report_item", { id, outcome: "done", note: "x" });
  assert.equal(none.isError, true);
  assert.match(none.text, /from none to done/);
});
