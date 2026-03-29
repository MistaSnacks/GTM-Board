import { getProjects, getConfig, getActiveProject } from "@/lib/config";
import { getResearchHistory, getFilteredCards } from "@/lib/data";
import PageShell from "@/components/page-shell";
import ResearchClient from "./research-client";

export const dynamic = "force-dynamic";

export default async function ResearchPage() {
  const projects = getProjects();
  const activeProject = await getActiveProject();
  const config = getConfig(activeProject);
  const research = getResearchHistory(activeProject);
  const researchCards = getFilteredCards(activeProject, { source: "research" });

  return (
    <PageShell projects={projects} activeProject={activeProject}>
      <ResearchClient research={research} researchCards={researchCards} />
    </PageShell>
  );
}
