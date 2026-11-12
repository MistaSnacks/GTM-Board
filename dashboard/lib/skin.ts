export type Skin = "d3a" | "flat";

const PROJECT_SKIN: Record<string, Skin> = { tailor: "d3a" };

export function skinFor(project: string): Skin {
  return PROJECT_SKIN[project] ?? "flat";
}
