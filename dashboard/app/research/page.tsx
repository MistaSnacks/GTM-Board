import { getProjects, getConfig, getActiveProject } from "@/lib/config";
import { getResearchHistory, getFilteredCards } from "@/lib/data";
import PageShell from "@/components/page-shell";
import ResearchClient from "./research-client";

export const dynamic = "force-dynamic";

export default async function ResearchPage() {
  const projects = await getProjects();
  const activeProject = await getActiveProject();
  const config = await getConfig(activeProject);
  const research = await getResearchHistory(activeProject);
  const researchCards = await getFilteredCards(activeProject, { source: "research" });

  return (
    <PageShell projects={projects} activeProject={activeProject}>
      <ResearchClient research={research} researchCards={researchCards} />
    </PageShell>
  );
}
