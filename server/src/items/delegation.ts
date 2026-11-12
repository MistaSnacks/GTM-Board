import type { DelegationState, Item } from "./types.ts";

// This module has no zod import, so the dashboard's client bundle can use it.

/** The delegation of one item. Callers use this and never read the five columns one by one. */
export interface Delegation {
  runner: string;
  state: DelegationState;
  ref: string | null;
  note: string | null;
  at: string;
}

/** The migration holds the columns in pairs: a runner and a state are both set or both null. `at` is set with them. */
export function delegationOf(item: Item): Delegation | null {
  if (item.delegated_to === null || item.delegation_state === null) return null;
  return {
    runner: item.delegated_to,
    state: item.delegation_state,
    ref: item.delegation_ref,
    note: item.delegation_note,
    at: item.delegated_at ?? item.updated_at,
  };
}
