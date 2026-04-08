"use server";

import {
  moveCard,
  moveAgentTask,
  addSubtask,
  updateSubtask,
  deleteSubtask,
  reorderSubtasks,
  toggleChecklistItem,
  addReference,
  updateReference,
  deleteReference,
  getSubtasksByCardSlug,
} from "@/lib/data";
import type {
  Column,
  AgentTaskColumn,
  SubtaskData,
  CardReference,
} from "@/lib/types";
import { generateReferenceId } from "@/lib/references";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

export async function moveCardAction(
  project: string,
  cardId: string,
  fromColumn: Column,
  toColumn: Column
): Promise<void> {
  moveCard(project, cardId, fromColumn, toColumn);
  revalidatePath("/", "layout");
}

export async function moveAgentTaskAction(
  project: string,
  taskSlug: string,
  fromColumn: AgentTaskColumn,
  toColumn: AgentTaskColumn
): Promise<void> {
  await moveAgentTask(project, taskSlug, fromColumn, toColumn);
  revalidatePath("/", "layout");
}

export async function switchProjectAction(project: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set("gtm-project", project, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
}

// --- Subtask actions ---

export async function addSubtaskAction(
  project: string,
  cardSlug: string,
  title: string,
  assignee?: string | null
): Promise<SubtaskData | null> {
  const result = await addSubtask(project, cardSlug, title, assignee);
  revalidatePath("/", "layout");
  return result;
}

export async function updateSubtaskAction(
  subtaskId: string,
  patch: Partial<Pick<SubtaskData, "title" | "status" | "assignee">>
): Promise<void> {
  await updateSubtask(subtaskId, patch);
  revalidatePath("/", "layout");
}

export async function deleteSubtaskAction(subtaskId: string): Promise<void> {
  await deleteSubtask(subtaskId);
  revalidatePath("/", "layout");
}

export async function reorderSubtasksAction(
  project: string,
  cardSlug: string,
  orderedIds: string[]
): Promise<void> {
  await reorderSubtasks(project, cardSlug, orderedIds);
  revalidatePath("/", "layout");
}

// --- Checklist action ---

export async function toggleChecklistItemAction(
  project: string,
  cardSlug: string,
  lineIndex: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await toggleChecklistItem(project, cardSlug, lineIndex);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

// --- Reference actions ---

export async function addReferenceAction(
  project: string,
  cardSlug: string,
  title: string,
  url: string
): Promise<CardReference> {
  const ref: CardReference = { id: generateReferenceId(), title, url };
  await addReference(project, cardSlug, ref);
  revalidatePath("/", "layout");
  return ref;
}

export async function updateReferenceAction(
  project: string,
  cardSlug: string,
  refId: string,
  patch: Partial<Pick<CardReference, "title" | "url">>
): Promise<void> {
  await updateReference(project, cardSlug, refId, patch);
  revalidatePath("/", "layout");
}

export async function deleteReferenceAction(
  project: string,
  cardSlug: string,
  refId: string
): Promise<void> {
  await deleteReference(project, cardSlug, refId);
  revalidatePath("/", "layout");
}

export async function getSubtasksAction(
  project: string,
  cardSlug: string
): Promise<SubtaskData[]> {
  return getSubtasksByCardSlug(project, cardSlug);
}
