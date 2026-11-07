import test from "node:test";
import assert from "node:assert/strict";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createFakeItemsDb } from "./fake-db.ts";
import { registerItemTools } from "./register.ts";
import { createItemStore } from "./store.ts";

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
  return { call, client, db };
}

const item = { kind: "seo_task", title: "Check the thing", source: "test", dedupe_key: "test:1", project: "tailor" };

test("the four item tools are listed", async () => {
  const { client } = await connect();
  const names = (await client.listTools()).tools.map((t) => t.name).sort();
  assert.deepEqual(names, ["gtm_add_item", "gtm_list_items", "gtm_sync_items", "gtm_update_item"]);
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
