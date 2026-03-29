import { getProjects, getConfig, getActiveProject } from "@/lib/config";
import { getContentPipelineStats, getFilteredCards, getCadence } from "@/lib/data";
import PageShell from "@/components/page-shell";
import ContentClient from "./content-client";

export const dynamic = "force-dynamic";

export default async function ContentPage() {
  const projects = getProjects();
  const activeProject = await getActiveProject();
  const config = getConfig(activeProject);
  const stats = getContentPipelineStats(activeProject);
  const postCards = getFilteredCards(activeProject, { type: "post" });
  const cadence = getCadence(activeProject);

  return (
    <PageShell projects={projects} activeProject={activeProject}>
      <ContentClient stats={stats} postCards={postCards} cadence={cadence} />
    </PageShell>
  );
}
