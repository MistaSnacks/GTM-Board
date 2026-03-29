import { updateCard } from "./board.ts";

export function linkCreative(params: {
  project: string;
  card_id: string;
  artboard_id: string;
  formats?: string[];
  copy?: string;
  creative_status?: "draft" | "approved" | "distributed";
}): { id: string; paper_artboard: string; creative_status: string; formats: string[] } {
  const updates: Record<string, unknown> = {
    paper_artboard: params.artboard_id,
  };

  const formats = params.formats || [];
  if (formats.length > 0) {
    updates.creative_formats = formats;
  }

  const creativeStatus = params.creative_status || "draft";
  updates.creative_status = creativeStatus;

  if (params.copy) {
    updates.copy = params.copy;
  }

  updateCard({
    project: params.project,
    card_id: params.card_id,
    updates,
  });

  return {
    id: params.card_id,
    paper_artboard: params.artboard_id,
    creative_status: creativeStatus,
    formats,
  };
}
