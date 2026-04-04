"use server";

import { moveCard, moveAgentTask } from "@/lib/data";
import type { Column, AgentTaskColumn } from "@/lib/types";
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
