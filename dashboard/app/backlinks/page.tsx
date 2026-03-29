import { getProjects, getConfig, getActiveProject } from "@/lib/config";
import { getFilteredCards } from "@/lib/data";
import PageShell from "@/components/page-shell";
import BacklinksClient from "./backlinks-client";

export const dynamic = "force-dynamic";

export default async function BacklinksPage() {
  const projects = getProjects();
  const activeProject = await getActiveProject();
  const config = getConfig(activeProject);
  const outreachCards = getFilteredCards(activeProject, { type: "outreach" });
  const backlinkCards = getFilteredCards(activeProject, { tags: ["backlink"] });
  const allCards = [...outreachCards, ...backlinkCards.filter((c) => !outreachCards.some((o) => o.id === c.id))];

  return (
    <PageShell projects={projects} activeProject={activeProject}>
      <BacklinksClient cards={allCards} />
    </PageShell>
  );
}
