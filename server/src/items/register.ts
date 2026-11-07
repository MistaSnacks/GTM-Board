import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ItemStore } from "./store.ts";
import {
  ITEM_KINDS,
  ITEM_OWNERS,
  ITEM_STATUSES,
  itemInputSchema,
  itemInputShape,
  prioritySchema,
} from "./types.ts";

let defaultStore: Promise<ItemStore> | undefined;

// Loaded on the first call, so registering the tools needs no Supabase env.
function loadDefaultStore(): Promise<ItemStore> {
  defaultStore ??= import("./default-store.ts").then((m) => m.itemStore);
  return defaultStore;
}

const asText = (result: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
});

const isoTime = z.string().datetime({ offset: true });

/** The four item tools. They are pure board writes, so both MCP modes keep them. */
export function registerItemTools(server: McpServer, store?: ItemStore): void {
  const getStore = () => (store ? Promise.resolve(store) : loadDefaultStore());

  server.tool(
    "gtm_add_item",
    "Add one item to the Today page, or refresh it when the dedupe_key exists. A done or dismissed item stays closed. Returns { id, created }.",
    itemInputShape,
    async (args) => asText(await (await getStore()).addItem(args)),
  );

  server.tool(
    "gtm_sync_items",
    "Replace the open items of one source. Upsert every item, then close the open or snoozed items of that source that are not in the list. Send complete: true only when you read all your data. Never call it after a failed read, because an empty list closes everything.",
    {
      source: z.string().min(1),
      items: z.array(itemInputSchema),
      complete: z.literal(true),
    },
    async (args) => asText(await (await getStore()).syncItems(args)),
  );

  server.tool(
    "gtm_list_items",
    "List Today items. The default status is open. A snoozed item whose snooze time has passed counts as open. Order: priority, due_at, created_at.",
    {
      project: z.string().optional().describe("gtm_projects slug"),
      kind: z.enum(ITEM_KINDS).optional(),
      status: z.enum(ITEM_STATUSES).optional(),
      owner: z.enum(ITEM_OWNERS).optional(),
      limit: z.number().int().positive().optional(),
    },
    async (args) => asText(await (await getStore()).listItems(args)),
  );

  server.tool(
    "gtm_update_item",
    "Change the status, priority, owner, due_at or snooze time of one item. Allowed moves: open to snoozed, done or dismissed; snoozed to open, done or dismissed; done or dismissed to open. A snooze needs snoozed_until.",
    {
      id: z.string().uuid(),
      status: z.enum(ITEM_STATUSES).optional(),
      snoozed_until: isoTime.nullable().optional(),
      priority: prioritySchema.optional(),
      owner: z.enum(ITEM_OWNERS).optional(),
      due_at: isoTime.nullable().optional(),
    },
    async ({ id, ...patch }) => asText(await (await getStore()).updateItem(id, patch)),
  );
}
