import { z } from "zod";

// Contract: harness-specs/06-today-items-contract.md (v1). Add optional fields only.

export const ITEM_KINDS = [
  "seo_task",
  "follow_up",
  "repo_attention",
  "pr_attention",
  "agent_needs_input",
  "agent_failed",
  "metric_alert",
  "task",
] as const;
export const ITEM_STATUSES = ["open", "snoozed", "done", "dismissed"] as const;
export const ITEM_OWNERS = ["camren", "agent"] as const;
export const CLOSED_REASONS = ["done", "dismissed", "resolved"] as const;

export const DELEGATION_STATES = ["queued", "running", "done", "returned", "failed"] as const;

export type ItemKind = (typeof ITEM_KINDS)[number];
export type ItemStatus = (typeof ITEM_STATUSES)[number];
export type ItemOwner = (typeof ITEM_OWNERS)[number];
export type ClosedReason = (typeof CLOSED_REASONS)[number];
export type DelegationState = (typeof DELEGATION_STATES)[number];
export type Priority = 0 | 1 | 2 | 3;

export const TITLE_MAX = 90;

export interface Evidence {
  label: string;
  value?: string | number;
  url?: string;
  fetched_at: string;
}

export interface ItemInput {
  project?: string | null;
  kind: ItemKind;
  title: string;
  why?: string;
  evidence?: Evidence[];
  link?: string;
  source: string;
  dedupe_key: string;
  priority?: Priority;
  owner?: ItemOwner;
  due_at?: string;
  /**
   * Optional extension to the contract. When true, an upsert reopens a row that an
   * earlier sync closed as resolved, or that a person marked done. A dismissed row
   * stays closed. Condition collectors set it, because the same condition can come
   * back under the same dedupe key. Default false: the contract rule applies.
   */
  reopen?: boolean;
}

/** One row of gtm_items. `project` is the slug that belongs to `project_id`. */
export interface Item {
  id: string;
  project_id: string | null;
  project: string | null;
  kind: ItemKind;
  title: string;
  why: string | null;
  evidence: Evidence[];
  link: string | null;
  source: string;
  dedupe_key: string;
  priority: Priority;
  owner: ItemOwner;
  status: ItemStatus;
  snoozed_until: string | null;
  due_at: string | null;
  closed_reason: ClosedReason | null;
  card_id: string | null;
  created_at: string;
  updated_at: string;
  last_seen_at: string;
  closed_at: string | null;
  delegated_to: string | null;
  delegation_state: DelegationState | null;
  delegation_ref: string | null;
  delegation_note: string | null;
  delegated_at: string | null;
}

/** One agent install on one machine. One row of gtm_runners. */
export interface Runner {
  name: string;
  label: string;
  projects: string[];
  last_seen_at: string;
}

const isoTime = z.string().datetime({ offset: true });

export const prioritySchema = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);

// A stored link becomes an href. Only web, file and board-relative links may pass.
const link = z.string().regex(/^(https?:\/\/|file:\/\/|\/)\S*$/, "link must be an http(s) URL, a file URL or a path that starts with /");

export const evidenceSchema: z.ZodType<Evidence> = z.object({
  label: z.string().min(1),
  value: z.union([z.string(), z.number()]).optional(),
  url: z.string().optional(),
  fetched_at: isoTime,
});

const itemInputObject = z.object({
  project: z.string().min(1).nullable().optional().describe("gtm_projects slug, or null for a general item"),
  kind: z.enum(ITEM_KINDS),
  title: z.string().min(1).max(TITLE_MAX).describe(`Imperative, at most ${TITLE_MAX} characters`),
  why: z.string().optional().describe("One sentence: the evidence in words"),
  evidence: z.array(evidenceSchema).optional(),
  link: link.optional().describe("Where to act: PR, review.html, card, page"),
  source: z.string().min(1),
  dedupe_key: z.string().min(1),
  priority: prioritySchema.optional().describe("0 now, 1 today, 2 this week, 3 later. Default 2"),
  owner: z.enum(ITEM_OWNERS).optional().describe("camren: a person must act. agent: an agent must act. Default camren"),
  due_at: isoTime.optional(),
  reopen: z.boolean().optional().describe("Reopen a row that was closed as resolved or done. A dismissed row stays closed"),
});

export const itemInputShape = itemInputObject.shape;
export const itemInputSchema: z.ZodType<ItemInput> = itemInputObject;

export function formatZodError(error: z.ZodError, prefix = ""): string {
  return error.issues
    .map((issue) => `${prefix}${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
}

export function parseItemInput(raw: unknown, prefix = ""): ItemInput {
  const result = itemInputSchema.safeParse(raw);
  if (!result.success) throw new Error(`Invalid item: ${formatZodError(result.error, prefix)}`);
  return result.data;
}
