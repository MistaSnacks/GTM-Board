import { supabase, getProjectId } from "../lib/supabase.ts";
import { addCard, updateCard, moveCard } from "./board.ts";

export async function createUgcBrief(params: {
  project: string;
  title: string;
  creator: string;
  creator_handle?: string;
  deliverable_type: string;
  due_date?: string;
  description?: string;
  tags?: string[];
}): Promise<{ id: string; path: string }> {
  const card = await addCard({
    project: params.project,
    title: params.title,
    column: "backlog",
    type: "ugc",
    channel: "ugc",
    details: params.description,
    target_date: params.due_date,
    tags: params.tags,
  });

  await updateCard({
    project: params.project,
    card_id: card.id,
    updates: {
      creator: params.creator,
      creator_handle: params.creator_handle || "",
      deliverable_type: params.deliverable_type,
      asset_url: null,
      approval_status: "draft",
    },
  });

  return { id: card.id, path: "supabase" };
}

export async function listUgcBriefs(params: {
  project: string;
  approval_status?: string;
  creator?: string;
}): Promise<Array<Record<string, unknown>>> {
  const projectId = await getProjectId(params.project);

  const { data: rows, error } = await supabase
    .from("gtm_cards")
    .select("*")
    .eq("project_id", projectId)
    .or("type.eq.ugc,channel.eq.ugc");

  if (error) throw new Error(`Failed to list UGC briefs: ${error.message}`);

  const results: Array<Record<string, unknown>> = [];

  for (const row of rows ?? []) {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;

    // Filter by approval_status if provided
    if (params.approval_status && meta.approval_status !== params.approval_status) continue;

    // Filter by creator if provided
    if (params.creator && meta.creator !== params.creator) continue;

    results.push({
      id: row.slug,
      title: row.title,
      column: row.column_name,
      creator: meta.creator ?? null,
      creator_handle: meta.creator_handle ?? null,
      deliverable_type: meta.deliverable_type ?? null,
      approval_status: meta.approval_status ?? null,
      asset_url: meta.asset_url ?? null,
      due_date: meta.due_date || meta.target_date || null,
    });
  }

  return results;
}

export async function approveContent(params: {
  project: string;
  card_id: string;
  status: "approved" | "rejected";
  asset_url?: string;
  notes?: string;
}): Promise<{ id: string; approval_status: string; moved_to?: string }> {
  const updates: Record<string, unknown> = {
    approval_status: params.status,
  };

  if (params.status === "approved" && params.asset_url) {
    updates.asset_url = params.asset_url;
  }

  await updateCard({
    project: params.project,
    card_id: params.card_id,
    updates,
  });

  let movedTo: string | undefined;

  if (params.status === "approved") {
    await moveCard({
      project: params.project,
      card_id: params.card_id,
      to_column: "preparing",
    });
    movedTo = "preparing";
  }

  if (params.status === "rejected" && params.notes) {
    const projectId = await getProjectId(params.project);

    // Fetch the card's current body
    const { data: card, error: fetchErr } = await supabase
      .from("gtm_cards")
      .select("body")
      .eq("project_id", projectId)
      .eq("slug", params.card_id)
      .single();

    if (fetchErr || !card) throw new Error(`Card not found: ${params.card_id}`);

    const existingBody = card.body ?? "";
    const newBody = existingBody + `\n\n## Rejection Notes\n${params.notes}\n`;

    const { error: updateErr } = await supabase
      .from("gtm_cards")
      .update({ body: newBody, updated_at: new Date().toISOString() })
      .eq("project_id", projectId)
      .eq("slug", params.card_id);

    if (updateErr) throw new Error(`Failed to append rejection notes: ${updateErr.message}`);
  }

  return {
    id: params.card_id,
    approval_status: params.status,
    moved_to: movedTo,
  };
}
