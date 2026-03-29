import fs from "node:fs";
import path from "node:path";
import { getProjectDir } from "../lib/config.ts";
import { readCard, writeCard, listCardsInDir, moveCardFile } from "../lib/markdown.ts";
import { generateCardId } from "../lib/slugify.ts";
import type { CardFrontmatter } from "../connectors/types.ts";

const COLUMNS = ["backlog", "preparing", "live", "measuring", "done"] as const;
type Column = (typeof COLUMNS)[number];

function boardDir(project: string): string {
  return path.join(getProjectDir(project), "board");
}

function findCardById(
  project: string,
  cardId: string
): { data: Record<string, unknown>; content: string; path: string; column: string } | null {
  for (const col of COLUMNS) {
    const dir = path.join(boardDir(project), col);
    if (!fs.existsSync(dir)) continue;
    const filePath = path.join(dir, `${cardId}.md`);
    if (fs.existsSync(filePath)) {
      const card = readCard(filePath);
      return { ...card, path: filePath, column: col };
    }
  }
  return null;
}

export function addCard(params: {
  project: string;
  title: string;
  column: Column;
  type: CardFrontmatter["type"];
  channel: CardFrontmatter["channel"];
  details?: string;
  target_date?: string;
  tags?: string[];
}): { id: string; path: string } {
  const id = generateCardId(params.title);
  const dir = path.join(boardDir(params.project), params.column);

  const frontmatter: Record<string, unknown> = {
    id,
    title: params.title,
    type: params.type,
    channel: params.channel,
    column: params.column,
    created: new Date().toISOString().slice(0, 10),
  };

  if (params.target_date) frontmatter.target_date = params.target_date;
  if (params.tags && params.tags.length > 0) frontmatter.tags = params.tags;
  frontmatter.source = "manual";
  frontmatter.metrics = {};
  frontmatter.paper_artboard = null;

  const content = params.details ? `\n${params.details}\n` : "\n";
  const filePath = path.join(dir, `${id}.md`);

  writeCard(filePath, frontmatter, content);
  return { id, path: filePath };
}

export function moveCard(params: {
  project: string;
  card_id: string;
  to_column: Column;
}): { id: string; from_column: string; to_column: string; path: string } {
  const card = findCardById(params.project, params.card_id);
  if (!card) {
    throw new Error(`Card not found: ${params.card_id}`);
  }

  const toDir = path.join(boardDir(params.project), params.to_column);
  const newPath = moveCardFile(card.path, toDir);

  // Update column in frontmatter
  const updated = readCard(newPath);
  updated.data.column = params.to_column;
  writeCard(newPath, updated.data, updated.content);

  return {
    id: params.card_id,
    from_column: card.column,
    to_column: params.to_column,
    path: newPath,
  };
}

export function updateCard(params: {
  project: string;
  card_id: string;
  updates: Record<string, unknown>;
}): { id: string; updated_fields: string[] } {
  const card = findCardById(params.project, params.card_id);
  if (!card) {
    throw new Error(`Card not found: ${params.card_id}`);
  }

  const updatedFields: string[] = [];
  for (const [key, value] of Object.entries(params.updates)) {
    if (key === "id") continue; // never change ID
    card.data[key] = value;
    updatedFields.push(key);
  }

  writeCard(card.path, card.data, card.content);
  return { id: params.card_id, updated_fields: updatedFields };
}

export function listCards(params: {
  project: string;
  column?: Column;
  type?: CardFrontmatter["type"];
  channel?: CardFrontmatter["channel"];
}): Array<Record<string, unknown>> {
  const columns = params.column ? [params.column] : [...COLUMNS];
  const results: Array<Record<string, unknown>> = [];

  for (const col of columns) {
    const dir = path.join(boardDir(params.project), col);
    const cards = listCardsInDir(dir);
    for (const card of cards) {
      if (params.type && card.data.type !== params.type) continue;
      if (params.channel && card.data.channel !== params.channel) continue;
      results.push({
        id: card.data.id,
        title: card.data.title,
        type: card.data.type,
        channel: card.data.channel,
        column: col,
        created: card.data.created,
        target_date: card.data.target_date || null,
        tags: card.data.tags || [],
        metrics: card.data.metrics || {},
      });
    }
  }

  return results;
}

export function getCard(params: {
  project: string;
  card_id: string;
}): { frontmatter: Record<string, unknown>; body: string } {
  const card = findCardById(params.project, params.card_id);
  if (!card) {
    throw new Error(`Card not found: ${params.card_id}`);
  }
  return { frontmatter: card.data, body: card.content };
}

export function setCardDescription(params: {
  project: string;
  card_id: string;
  description: string;
  body?: string;
}): { id: string; updated_fields: string[] } {
  const card = findCardById(params.project, params.card_id);
  if (!card) {
    throw new Error(`Card not found: ${params.card_id}`);
  }

  const updatedFields: string[] = ["description"];
  card.data.description = params.description;

  const body = params.body !== undefined ? params.body : card.content;
  if (params.body !== undefined) updatedFields.push("body");

  writeCard(card.path, card.data, body);
  return { id: params.card_id, updated_fields: updatedFields };
}
