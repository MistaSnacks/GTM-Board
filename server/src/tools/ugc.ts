import fs from "node:fs";
import path from "node:path";
import { getProjectDir } from "../lib/config.ts";
import { addCard, updateCard, moveCard, listCards } from "./board.ts";
import { readCard, writeCard } from "../lib/markdown.ts";

export function createUgcBrief(params: {
  project: string;
  title: string;
  creator: string;
  creator_handle?: string;
  deliverable_type: string;
  due_date?: string;
  description?: string;
  tags?: string[];
}): { id: string; path: string } {
  const card = addCard({
    project: params.project,
    title: params.title,
    column: "backlog",
    type: "ugc",
    channel: "ugc",
    details: params.description,
    target_date: params.due_date,
    tags: params.tags,
  });

  updateCard({
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

  return { id: card.id, path: card.path };
}

export function listUgcBriefs(params: {
  project: string;
  approval_status?: string;
  creator?: string;
}): Array<Record<string, unknown>> {
  const allCards = listCards({ project: params.project, type: "ugc" });
  const results: Array<Record<string, unknown>> = [];

  const boardDir = path.join(getProjectDir(params.project), "board");

  for (const card of allCards) {
    const column = card.column as string;
    const cardId = card.id as string;
    const cardPath = path.join(boardDir, column, `${cardId}.md`);

    if (!fs.existsSync(cardPath)) continue;

    const full = readCard(cardPath);
    const data = full.data;

    if (params.approval_status && data.approval_status !== params.approval_status) continue;
    if (params.creator && data.creator !== params.creator) continue;

    results.push({
      id: cardId,
      title: data.title,
      column,
      creator: data.creator,
      creator_handle: data.creator_handle,
      deliverable_type: data.deliverable_type,
      approval_status: data.approval_status,
      asset_url: data.asset_url,
      due_date: data.due_date || data.target_date,
    });
  }

  return results;
}

export function approveContent(params: {
  project: string;
  card_id: string;
  status: "approved" | "rejected";
  asset_url?: string;
  notes?: string;
}): { id: string; approval_status: string; moved_to?: string } {
  const updates: Record<string, unknown> = {
    approval_status: params.status,
  };

  if (params.status === "approved" && params.asset_url) {
    updates.asset_url = params.asset_url;
  }

  updateCard({
    project: params.project,
    card_id: params.card_id,
    updates,
  });

  let movedTo: string | undefined;

  if (params.status === "approved") {
    moveCard({
      project: params.project,
      card_id: params.card_id,
      to_column: "preparing",
    });
    movedTo = "preparing";
  }

  if (params.status === "rejected" && params.notes) {
    const boardDir = path.join(getProjectDir(params.project), "board");
    const columns = ["backlog", "preparing", "live", "measuring", "done"];
    for (const col of columns) {
      const cardPath = path.join(boardDir, col, `${params.card_id}.md`);
      if (fs.existsSync(cardPath)) {
        const card = readCard(cardPath);
        const newContent = card.content + `\n\n## Rejection Notes\n${params.notes}\n`;
        writeCard(cardPath, card.data, newContent);
        break;
      }
    }
  }

  return {
    id: params.card_id,
    approval_status: params.status,
    moved_to: movedTo,
  };
}
