import type { SupabaseClient } from "@supabase/supabase-js";
import type { ItemFilter, ItemPatch, ItemsDb, NewItem } from "./store.ts";
import type { Item, Runner } from "./types.ts";

type ItemRow = Omit<Item, "project">;

/** Only `from` is used, so the server and the dashboard can each pass a client from their own supabase-js copy. */
export type ItemsClient = Pick<SupabaseClient, "from">;

// PostgREST puts `in` lists in the URL, so a long key list is read in chunks.
const KEY_CHUNK = 40;

/** ItemsDb over the gtm_items table. The caller owns the client, so the dashboard and the server can both use it. */
export function createSupabaseItemsDb(client: ItemsClient): ItemsDb {
  async function withProjectSlugs(rows: ItemRow[]): Promise<Item[]> {
    if (!rows.some((row) => row.project_id)) return rows.map((row) => ({ ...row, project: null }));
    const { data, error } = await client.from("gtm_projects").select("id, slug");
    if (error) throw new Error(`gtm_projects read failed: ${error.message}`);
    const slugs = new Map((data ?? []).map((p: { id: string; slug: string }) => [p.id, p.slug]));
    return rows.map((row) => ({ ...row, project: row.project_id ? (slugs.get(row.project_id) ?? null) : null }));
  }

  async function selectRows(filter: ItemFilter, keys?: string[]): Promise<ItemRow[]> {
    let query = client.from("gtm_items").select("*");
    if (filter.ids) query = query.in("id", filter.ids);
    if (keys) query = query.in("dedupe_key", keys);
    if (filter.source) query = query.eq("source", filter.source);
    if (filter.project_id) query = query.eq("project_id", filter.project_id);
    if (filter.kind) query = query.eq("kind", filter.kind);
    if (filter.owner) query = query.eq("owner", filter.owner);
    if (filter.statuses) query = query.in("status", filter.statuses);
    if (filter.delegated_to) query = query.eq("delegated_to", filter.delegated_to);
    if (filter.delegation_state) query = query.eq("delegation_state", filter.delegation_state);
    const { data, error } = await query;
    if (error) throw new Error(`gtm_items read failed: ${error.message}`);
    return (data ?? []) as ItemRow[];
  }

  return {
    async select(filter) {
      const { dedupe_keys, ...rest } = filter;
      let rows: ItemRow[] = [];
      if (dedupe_keys) {
        for (let i = 0; i < dedupe_keys.length; i += KEY_CHUNK) {
          rows = rows.concat(await selectRows(rest, dedupe_keys.slice(i, i + KEY_CHUNK)));
        }
      } else {
        rows = await selectRows(rest);
      }
      return withProjectSlugs(rows);
    },

    async insert(row: NewItem) {
      const { data, error } = await client.from("gtm_items").insert(row).select().single();
      if (error) throw new Error(`gtm_items insert failed for ${row.dedupe_key}: ${error.message}`);
      return (await withProjectSlugs([data as ItemRow]))[0];
    },

    async update(id: string, patch: ItemPatch) {
      const { data, error } = await client.from("gtm_items").update(patch).eq("id", id).select().single();
      if (error) throw new Error(`gtm_items update failed for ${id}: ${error.message}`);
      return (await withProjectSlugs([data as ItemRow]))[0];
    },

    async selectRunners() {
      const { data, error } = await client.from("gtm_runners").select("name, label, projects, last_seen_at");
      if (error) throw new Error(`gtm_runners read failed: ${error.message}`);
      return (data ?? []) as Runner[];
    },

    async upsertRunner(runner: Runner) {
      const { error } = await client.from("gtm_runners").upsert(runner, { onConflict: "name" });
      if (error) throw new Error(`gtm_runners write failed for ${runner.name}: ${error.message}`);
    },
  };
}
