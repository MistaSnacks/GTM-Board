import type { Item, ItemStatus, Priority } from "../../server/src/items/types.ts";

export type SectionId = "now" | "agents" | "seo" | "code" | "followups" | "later";

export interface SectionDef {
  id: SectionId;
  title: string;
  hint: string;
  collapsed?: boolean;
  groupByProject?: boolean;
  matches: (item: Item, now: Date) => boolean;
}

export function isOverdueAgentItem(item: Item, now: Date): boolean {
  return item.owner === "agent" && item.due_at !== null && Date.parse(item.due_at) < now.getTime();
}

/**
 * The one table from kind and owner to section. The first match wins, and the last row
 * matches everything, so every open item lands in exactly one section.
 */
export const SECTIONS: readonly SectionDef[] = [
  {
    id: "now",
    title: "Needs you now",
    hint: "You own it, and it is priority 0 or 1",
    matches: (i) => i.owner === "camren" && i.priority <= 1,
  },
  {
    id: "agents",
    title: "Agents",
    hint: "Waiting for input, failed, or overdue",
    matches: (i, now) => i.kind === "agent_needs_input" || i.kind === "agent_failed" || isOverdueAgentItem(i, now),
  },
  { id: "seo", title: "SEO", hint: "Daily and weekly SEO tasks", groupByProject: true, matches: (i) => i.kind === "seo_task" },
  { id: "code", title: "Code", hint: "Repos and pull requests", matches: (i) => i.kind === "repo_attention" || i.kind === "pr_attention" },
  { id: "followups", title: "Follow-ups", hint: "Things to chase", matches: (i) => i.kind === "follow_up" },
  { id: "later", title: "Later", hint: "Everything else", collapsed: true, matches: () => true },
];

export function sectionOf(item: Item, now: Date): SectionId {
  return (SECTIONS.find((s) => s.matches(item, now)) as SectionDef).id;
}

export interface SectionGroup {
  label: string | null;
  items: Item[];
}

export interface SectionView {
  def: SectionDef;
  count: number;
  groups: SectionGroup[];
}

const GENERAL = "General";

/** Items arrive sorted. Each section keeps that order. A grouped section splits by project, General last. */
export function buildSections(items: Item[], now: Date): SectionView[] {
  const bySection = new Map<SectionId, Item[]>(SECTIONS.map((s) => [s.id, []]));
  for (const item of items) bySection.get(sectionOf(item, now))?.push(item);

  return SECTIONS.map((def) => {
    const own = bySection.get(def.id) ?? [];
    if (!def.groupByProject) return { def, count: own.length, groups: own.length ? [{ label: null, items: own }] : [] };
    const projects = new Map<string, Item[]>();
    for (const item of own) projects.set(item.project ?? GENERAL, [...(projects.get(item.project ?? GENERAL) ?? []), item]);
    const labels = [...projects.keys()].sort((a, b) => (a === GENERAL ? 1 : b === GENERAL ? -1 : a.localeCompare(b)));
    return { def, count: own.length, groups: labels.map((label) => ({ label, items: projects.get(label) ?? [] })) };
  });
}

export type ItemAction = "done" | "snooze-1d" | "snooze-1w" | "dismiss";

export interface ActionPatch {
  status: ItemStatus;
  snoozed_until?: string;
}

const DAY_MS = 86_400_000;

/** What each row button writes. Snooze times come from the server clock. */
export const ACTION_PATCHES: Record<ItemAction, (now: Date) => ActionPatch> = {
  done: () => ({ status: "done" }),
  dismiss: () => ({ status: "dismissed" }),
  "snooze-1d": (now) => ({ status: "snoozed", snoozed_until: new Date(now.getTime() + DAY_MS).toISOString() }),
  "snooze-1w": (now) => ({ status: "snoozed", snoozed_until: new Date(now.getTime() + 7 * DAY_MS).toISOString() }),
};

export function isItemAction(value: string): value is ItemAction {
  return Object.hasOwn(ACTION_PATCHES, value);
}

export const PRIORITY_LABEL: Record<Priority, string> = { 0: "NOW", 1: "TODAY", 2: "WEEK", 3: "LATER" };

export function ageLabel(fromIso: string, now: Date): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - Date.parse(fromIso)) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return hours < 48 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
}

/** Only web, file and board-relative links become an href. */
export function safeHref(link: string | null): string | null {
  return link && /^(https?:\/\/|file:\/\/|\/)/.test(link) ? link : null;
}
