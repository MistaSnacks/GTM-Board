import { createItemStore } from "../../server/src/items/store.ts";
import { createSupabaseItemsDb, type ItemsClient } from "../../server/src/items/supabase-db.ts";
import type { Item } from "../../server/src/items/types.ts";
import { getProjectId } from "./data";
import { supabase } from "./supabase";

// The server and the dashboard install their own copy of supabase-js. Their types differ, and the runtime API is the same.
const itemStore = createItemStore({
  db: createSupabaseItemsDb(supabase as unknown as ItemsClient),
  resolveProject: async (slug) => {
    const id = await getProjectId(slug);
    if (!id) throw new Error(`Project not found: ${slug}`);
    return id;
  },
});

/** Open Today items for every project. A snoozed item whose snooze time passed counts as open. */
export function listOpenItems(): Promise<Item[]> {
  return itemStore.listItems();
}

export const updateItem = itemStore.updateItem;
