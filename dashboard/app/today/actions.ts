"use server";

import { revalidatePath } from "next/cache";
import { delegateItem, recallItem, updateItem } from "@/lib/items";
import { ACTION_PATCHES, isItemAction } from "@/lib/today";

export type ActionResult = { ok: true } | { ok: false; error: string };

async function settle(change: () => Promise<unknown>): Promise<ActionResult> {
  try {
    await change();
    revalidatePath("/today");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Applies one row button. It returns the error instead of throwing, because Next hides
 * the message of a thrown server action error in production.
 */
export async function itemAction(id: string, action: string): Promise<ActionResult> {
  if (!isItemAction(action)) return { ok: false, error: `Unknown action: ${action}` };
  return settle(() => updateItem(id, ACTION_PATCHES[action](new Date())));
}

/** The server picks the runner from the item's project. The client never names one. */
export async function delegateAction(id: string): Promise<ActionResult> {
  return settle(() => delegateItem(id));
}

export async function recallAction(id: string): Promise<ActionResult> {
  return settle(() => recallItem(id));
}
