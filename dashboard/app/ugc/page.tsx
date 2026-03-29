import { getProjects, getConfig, getActiveProject } from "@/lib/config";
import { getUGCBriefs, getUGCPipelineStats, getFilteredCards } from "@/lib/data";
import PageShell from "@/components/page-shell";
import UGCClient from "./ugc-client";

export const dynamic = "force-dynamic";

export default async function UGCPage() {
  const projects = getProjects();
  const activeProject = await getActiveProject();
  const config = getConfig(activeProject);
  const briefs = getUGCBriefs(activeProject);
  const stats = getUGCPipelineStats(activeProject);
  const ugcCards = getFilteredCards(activeProject, { type: "ugc" });

  return (
    <PageShell projects={projects} activeProject={activeProject}>
      <UGCClient briefs={briefs} stats={stats} ugcCards={ugcCards} />
    </PageShell>
  );
}
