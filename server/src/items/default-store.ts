import { getProjectId, supabase } from "../lib/supabase.ts";
import { createDryRunDb } from "./dry-run-db.ts";
import { createItemStore, type ItemStore } from "./store.ts";
import { createSupabaseItemsDb } from "./supabase-db.ts";

const db = createSupabaseItemsDb(supabase);

/**
 * The item store on the board's Supabase. This module reads the Supabase env at import,
 * so callers load it with a dynamic import, and only when they will write.
 */
export const itemStore = createItemStore({ db, resolveProject: getProjectId });

/** A store that reads the board and keeps its writes in memory. Each call starts from the board. */
export function dryRunItemStore(): ItemStore {
  return createItemStore({ db: createDryRunDb(db), resolveProject: getProjectId });
}
