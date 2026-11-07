import { getProjectId, supabase } from "../lib/supabase.ts";
import { createItemStore } from "./store.ts";
import { createSupabaseItemsDb } from "./supabase-db.ts";

/**
 * The item store on the board's Supabase. This module reads the Supabase env at import,
 * so callers load it with a dynamic import, and only when they will write.
 */
export const itemStore = createItemStore({
  db: createSupabaseItemsDb(supabase),
  resolveProject: getProjectId,
});
