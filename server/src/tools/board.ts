import { supabase, getProjectId } from "../lib/supabase.ts";
import { generateCardId } from "../lib/slugify.ts";
import { resolveProject } from "../lib/config.ts";
import type { CardFrontmatter } from "../connectors/types.ts";

const COLUMNS = ["backlog", "preparing", "live", "measuring", "done"] as const;
type Column = (typeof COLUMNS)[number];

/** Top-level card columns that live on the row itself (not in metadata). */
const DIRECT_COLUMNS = new Set(["title", "type", "channel", "column_name", "body", "board"]);

export async function addCard(params: {
  project: string;
  title: string;
  column: Column;
  type: CardFrontmatter["type"];
  channel: CardFrontmatter["channel"];
  details?: string;
  target_date?: string;
  tags?: string[];
  board?: string;
}): Promise<{ id: string; path: string }> {
  const slug = generateCardId(params.title);
  const projectSlug = resolveProject(params.project);
  const projectId = await getProjectId(projectSlug);

  const metadata: Record<string, unknown> = {
    created: new Date().toISOString().slice(0, 10),
    source: "manual",
    metrics: {},
    paper_artboard: null,
  };
  if (params.target_date) metadata.target_date = params.target_date;
  if (params.tags && params.tags.length > 0) metadata.tags = params.tags;

  const { error } = await supabase.from("gtm_cards").insert({
    project_id: projectId,
    slug,
    board: params.board ?? "marketing",
    title: params.title,
    column_name: params.column,
    type: params.type ?? null,
    channel: params.channel ?? null,
    metadata,
    body: params.details ?? "",
  });

  if (error) throw new Error(`Failed to add card: ${error.message}`);
  return { id: slug, path: "supabase" };
}

export async function moveCard(params: {
  project: string;
  card_id: string;
  to_column: Column;
}): Promise<{ id: string; from_column: string; to_column: string; path: string }> {
  const projectSlug = resolveProject(params.project);
  const projectId = await getProjectId(projectSlug);

  // Fetch current column
  const { data: card, error: fetchErr } = await supabase
    .from("gtm_cards")
    .select("column_name")
    .eq("project_id", projectId)
    .eq("slug", params.card_id)
    .single();

  if (fetchErr || !card) throw new Error(`Card not found: ${params.card_id}`);

  const fromColumn = card.column_name;

  const { error: updateErr } = await supabase
    .from("gtm_cards")
    .update({ column_name: params.to_column, updated_at: new Date().toISOString() })
    .eq("project_id", projectId)
    .eq("slug", params.card_id);

  if (updateErr) throw new Error(`Failed to move card: ${updateErr.message}`);

  return {
    id: params.card_id,
    from_column: fromColumn,
    to_column: params.to_column,
    path: "supabase",
  };
}

export async function updateCard(params: {
  project: string;
  card_id: string;
  updates: Record<string, unknown>;
}): Promise<{ id: string; updated_fields: string[] }> {
  const projectSlug = resolveProject(params.project);
  const projectId = await getProjectId(projectSlug);

  // Fetch existing card so we can merge metadata
  const { data: card, error: fetchErr } = await supabase
    .from("gtm_cards")
    .select("metadata")
    .eq("project_id", projectId)
    .eq("slug", params.card_id)
    .single();

  if (fetchErr || !card) throw new Error(`Card not found: ${params.card_id}`);

  const directUpdates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  const metadataMerge: Record<string, unknown> = {};
  const updatedFields: string[] = [];

  for (const [key, value] of Object.entries(params.updates)) {
    if (key === "id" || key === "slug") continue; // never change identity

    // Map "column" param to "column_name" DB column
    const dbKey = key === "column" ? "column_name" : key;

    if (DIRECT_COLUMNS.has(dbKey)) {
      directUpdates[dbKey] = value;
    } else {
      metadataMerge[key] = value;
    }
    updatedFields.push(key);
  }

  if (Object.keys(metadataMerge).length > 0) {
    directUpdates.metadata = { ...(card.metadata as Record<string, unknown>), ...metadataMerge };
  }

  const { error: updateErr } = await supabase
    .from("gtm_cards")
    .update(directUpdates)
    .eq("project_id", projectId)
    .eq("slug", params.card_id);

  if (updateErr) throw new Error(`Failed to update card: ${updateErr.message}`);

  return { id: params.card_id, updated_fields: updatedFields };
}

export async function listCards(params: {
  project: string;
  column?: Column;
  type?: CardFrontmatter["type"];
  channel?: CardFrontmatter["channel"];
  board?: string;
}): Promise<Array<Record<string, unknown>>> {
  const projectSlug = resolveProject(params.project);
  const projectId = await getProjectId(projectSlug);

  let query = supabase
    .from("gtm_cards")
    .select("slug, title, type, channel, column_name, metadata")
    .eq("project_id", projectId);

  if (params.board) query = query.eq("board", params.board);
  if (params.column) query = query.eq("column_name", params.column);
  if (params.type) query = query.eq("type", params.type);
  if (params.channel) query = query.eq("channel", params.channel);

  query = query.order("created_at", { ascending: true });

  const { data, error } = await query;
  if (error) throw new Error(`Failed to list cards: ${error.message}`);

  return (data ?? []).map((row) => {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    return {
      id: row.slug,
      title: row.title,
      type: row.type,
      channel: row.channel,
      column: row.column_name,
      created: meta.created ?? null,
      target_date: meta.target_date ?? null,
      tags: meta.tags ?? [],
      metrics: meta.metrics ?? {},
    };
  });
}

export async function getCard(params: {
  project: string;
  card_id: string;
}): Promise<{ frontmatter: Record<string, unknown>; body: string }> {
  const projectSlug = resolveProject(params.project);
  const projectId = await getProjectId(projectSlug);

  const { data: row, error } = await supabase
    .from("gtm_cards")
    .select("*")
    .eq("project_id", projectId)
    .eq("slug", params.card_id)
    .single();

  if (error || !row) throw new Error(`Card not found: ${params.card_id}`);

  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  const frontmatter: Record<string, unknown> = {
    id: row.slug,
    title: row.title,
    type: row.type,
    channel: row.channel,
    column: row.column_name,
    board: row.board,
    ...meta,
  };

  return { frontmatter, body: row.body ?? "" };
}

export async function setCardDescription(params: {
  project: string;
  card_id: string;
  description: string;
  body?: string;
}): Promise<{ id: string; updated_fields: string[] }> {
  const projectSlug = resolveProject(params.project);
  const projectId = await getProjectId(projectSlug);

  // Fetch existing metadata to merge description into it
  const { data: card, error: fetchErr } = await supabase
    .from("gtm_cards")
    .select("metadata")
    .eq("project_id", projectId)
    .eq("slug", params.card_id)
    .single();

  if (fetchErr || !card) throw new Error(`Card not found: ${params.card_id}`);

  const updatedFields: string[] = ["description"];
  const updatedMetadata = {
    ...(card.metadata as Record<string, unknown>),
    description: params.description,
  };

  const updatePayload: Record<string, unknown> = {
    metadata: updatedMetadata,
    updated_at: new Date().toISOString(),
  };

  if (params.body !== undefined) {
    updatePayload.body = params.body;
    updatedFields.push("body");
  }

  const { error: updateErr } = await supabase
    .from("gtm_cards")
    .update(updatePayload)
    .eq("project_id", projectId)
    .eq("slug", params.card_id);

  if (updateErr) throw new Error(`Failed to set description: ${updateErr.message}`);

  return { id: params.card_id, updated_fields: updatedFields };
}
