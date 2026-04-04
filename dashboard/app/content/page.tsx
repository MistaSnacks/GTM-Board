import { getProjects, getConfig, getActiveProject } from "@/lib/config";
import { getContentPipelineStats, getFilteredCards, getCadence } from "@/lib/data";
import PageShell from "@/components/page-shell";
import ContentClient from "./content-client";

export const dynamic = "force-dynamic";

export default async function ContentPage() {
  const projects = await getProjects();
  const activeProject = await getActiveProject();
  const config = await getConfig(activeProject);
  const stats = await getContentPipelineStats(activeProject);
  const postCards = await getFilteredCards(activeProject, { type: "post" });
  const cadence = await getCadence(activeProject);

  return (
    <PageShell projects={projects} activeProject={activeProject}>
      <ContentClient stats={stats} postCards={postCards} cadence={cadence} />
    </PageShell>
  );
}
