import { supabase, getProjectId } from "../lib/supabase.ts";
import { generateCardId } from "../lib/slugify.ts";

export async function createAgentTask(params: {
  project: string;
  title: string;
  assigned_agent?: string;
  priority?: "critical" | "high" | "medium" | "low";
  column?: "backlog" | "preparing" | "live" | "measuring" | "done";
  depends_on?: string[];
  details?: string;
  tags?: string[];
}): Promise<{ id: string; card_id: string }> {
  const projectId = await getProjectId(params.project);
  const slug = generateCardId(params.title);
  const column = params.column || "backlog";

  // Insert the card
  const { data: card, error: cardError } = await supabase
    .from("gtm_cards")
    .insert({
      project_id: projectId,
      slug,
      board: "agent-tasks",
      title: params.title,
      column_name: column,
      type: "task",
      channel: null,
      metadata: {
        created: new Date().toISOString().slice(0, 10),
        tags: params.tags || [],
        source: "agent",
      },
      body: params.details || "",
    })
    .select("id")
    .single();

  if (cardError || !card) {
    throw new Error(`Failed to create agent task: ${cardError?.message}`);
  }

  // Resolve depends_on slugs to UUIDs if provided
  let dependsOnIds: string[] = [];
  if (params.depends_on && params.depends_on.length > 0) {
    const { data: deps } = await supabase
      .from("gtm_cards")
      .select("id")
      .eq("project_id", projectId)
      .in("slug", params.depends_on);
    dependsOnIds = (deps || []).map((d) => d.id);
  }

  // Insert the extension details
  const { error: detailError } = await supabase
    .from("gtm_agent_task_details")
    .insert({
      card_id: card.id,
      assigned_agent: params.assigned_agent || null,
      priority: params.priority || "medium",
      depends_on: dependsOnIds.length > 0 ? dependsOnIds : null,
    });

  if (detailError) {
    throw new Error(`Failed to create task details: ${detailError.message}`);
  }

  return { id: slug, card_id: card.id };
}

export async function updateAgentTask(params: {
  project: string;
  task_id: string;
  column?: "backlog" | "preparing" | "live" | "measuring" | "done";
  assigned_agent?: string;
  priority?: "critical" | "high" | "medium" | "low";
  status?: "started" | "completed" | "failed";
  output?: Record<string, unknown>;
  error?: string;
  title?: string;
  body?: string;
}): Promise<{ id: string; updated_fields: string[] }> {
  const projectId = await getProjectId(params.project);

  // Find the card
  const { data: card, error: findError } = await supabase
    .from("gtm_cards")
    .select("id, column_name")
    .eq("project_id", projectId)
    .eq("slug", params.task_id)
    .eq("board", "agent-tasks")
    .single();

  if (findError || !card) {
    throw new Error(`Agent task not found: ${params.task_id}`);
  }

  const updatedFields: string[] = [];

  // Update card-level fields
  const cardUpdates: Record<string, unknown> = {};
  if (params.column) {
    cardUpdates.column_name = params.column;
    updatedFields.push("column");
  }
  if (params.title) {
    cardUpdates.title = params.title;
    updatedFields.push("title");
  }
  if (params.body !== undefined) {
    cardUpdates.body = params.body;
    updatedFields.push("body");
  }

  if (Object.keys(cardUpdates).length > 0) {
    const { error } = await supabase
      .from("gtm_cards")
      .update(cardUpdates)
      .eq("id", card.id);
    if (error) throw new Error(`Failed to update task card: ${error.message}`);
  }

  // Update detail-level fields
  const detailUpdates: Record<string, unknown> = {};
  if (params.assigned_agent !== undefined) {
    detailUpdates.assigned_agent = params.assigned_agent;
    updatedFields.push("assigned_agent");
  }
  if (params.priority) {
    detailUpdates.priority = params.priority;
    updatedFields.push("priority");
  }
  if (params.output !== undefined) {
    detailUpdates.output = params.output;
    updatedFields.push("output");
  }
  if (params.error !== undefined) {
    detailUpdates.error = params.error;
    updatedFields.push("error");
  }
  if (params.status === "started") {
    detailUpdates.started_at = new Date().toISOString();
    updatedFields.push("started_at");
    // Also move to "live" column if not specified
    if (!params.column) {
      await supabase
        .from("gtm_cards")
        .update({ column_name: "live" })
        .eq("id", card.id);
      updatedFields.push("column");
    }
  }
  if (params.status === "completed") {
    detailUpdates.completed_at = new Date().toISOString();
    updatedFields.push("completed_at");
    if (!params.column) {
      await supabase
        .from("gtm_cards")
        .update({ column_name: "done" })
        .eq("id", card.id);
      updatedFields.push("column");
    }
  }
  if (params.status === "failed") {
    updatedFields.push("retries");
    // Increment retries
    const { data: details } = await supabase
      .from("gtm_agent_task_details")
      .select("retries")
      .eq("card_id", card.id)
      .single();
    detailUpdates.retries = (details?.retries || 0) + 1;
  }

  if (Object.keys(detailUpdates).length > 0) {
    const { error } = await supabase
      .from("gtm_agent_task_details")
      .update(detailUpdates)
      .eq("card_id", card.id);
    if (error) throw new Error(`Failed to update task details: ${error.message}`);
  }

  return { id: params.task_id, updated_fields: updatedFields };
}

export async function listAgentTasks(params: {
  project: string;
  assigned_agent?: string;
  priority?: "critical" | "high" | "medium" | "low";
  column?: "backlog" | "preparing" | "live" | "measuring" | "done";
}): Promise<Array<Record<string, unknown>>> {
  const projectId = await getProjectId(params.project);

  let query = supabase
    .from("gtm_cards")
    .select(`
      id,
      slug,
      title,
      column_name,
      metadata,
      body,
      created_at,
      updated_at,
      gtm_agent_task_details (
        assigned_agent,
        priority,
        depends_on,
        output,
        error,
        started_at,
        completed_at,
        retries
      )
    `)
    .eq("project_id", projectId)
    .eq("board", "agent-tasks");

  if (params.column) {
    query = query.eq("column_name", params.column);
  }

  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to list agent tasks: ${error.message}`);
  }

  const results = (data || []).map((row) => {
    const details = Array.isArray(row.gtm_agent_task_details)
      ? row.gtm_agent_task_details[0]
      : row.gtm_agent_task_details;
    return {
      id: row.slug,
      card_id: row.id,
      title: row.title,
      column: row.column_name,
      assigned_agent: details?.assigned_agent || null,
      priority: details?.priority || "medium",
      depends_on: details?.depends_on || [],
      output: details?.output || null,
      error: details?.error || null,
      started_at: details?.started_at || null,
      completed_at: details?.completed_at || null,
      retries: details?.retries || 0,
      tags: (row.metadata as Record<string, unknown>)?.tags || [],
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  });

  // Filter in JS for detail-level fields
  return results.filter((r) => {
    if (params.assigned_agent && r.assigned_agent !== params.assigned_agent) return false;
    if (params.priority && r.priority !== params.priority) return false;
    return true;
  });
}

export async function getAgentTask(params: {
  project: string;
  task_id: string;
}): Promise<Record<string, unknown>> {
  const projectId = await getProjectId(params.project);

  const { data, error } = await supabase
    .from("gtm_cards")
    .select(`
      id,
      slug,
      title,
      column_name,
      metadata,
      body,
      created_at,
      updated_at,
      gtm_agent_task_details (
        assigned_agent,
        priority,
        depends_on,
        output,
        error,
        started_at,
        completed_at,
        retries
      )
    `)
    .eq("project_id", projectId)
    .eq("slug", params.task_id)
    .eq("board", "agent-tasks")
    .single();

  if (error || !data) {
    throw new Error(`Agent task not found: ${params.task_id}`);
  }

  const details = Array.isArray(data.gtm_agent_task_details)
    ? data.gtm_agent_task_details[0]
    : data.gtm_agent_task_details;

  return {
    id: data.slug,
    card_id: data.id,
    title: data.title,
    column: data.column_name,
    body: data.body,
    metadata: data.metadata,
    assigned_agent: details?.assigned_agent || null,
    priority: details?.priority || "medium",
    depends_on: details?.depends_on || [],
    output: details?.output || null,
    error: details?.error || null,
    started_at: details?.started_at || null,
    completed_at: details?.completed_at || null,
    retries: details?.retries || 0,
    created_at: data.created_at,
    updated_at: data.updated_at,
  };
}
