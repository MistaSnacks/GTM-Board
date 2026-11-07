"use server";

import { revalidatePath } from "next/cache";
import { updateItem } from "@/lib/items";
import { ACTION_PATCHES, isItemAction } from "@/lib/today";

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Applies one row button. It returns the error instead of throwing, because Next hides
 * the message of a thrown server action error in production.
 */
export async function itemAction(id: string, action: string): Promise<ActionResult> {
  if (!isItemAction(action)) return { ok: false, error: `Unknown action: ${action}` };
  try {
    await updateItem(id, ACTION_PATCHES[action](new Date()));
    revalidatePath("/today");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
