"use server";

import { moveCard } from "@/lib/data";
import type { Column } from "@/lib/types";
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

export async function switchProjectAction(project: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set("gtm-project", project, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
}
