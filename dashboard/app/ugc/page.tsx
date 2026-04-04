import { getProjects, getConfig, getActiveProject } from "@/lib/config";
import { getUGCBriefs, getUGCPipelineStats, getFilteredCards } from "@/lib/data";
import PageShell from "@/components/page-shell";
import UGCClient from "./ugc-client";

export const dynamic = "force-dynamic";

export default async function UGCPage() {
  const projects = await getProjects();
  const activeProject = await getActiveProject();
  const config = await getConfig(activeProject);
  const briefs = await getUGCBriefs(activeProject);
  const stats = await getUGCPipelineStats(activeProject);
  const ugcCards = await getFilteredCards(activeProject, { type: "ugc" });

  return (
    <PageShell projects={projects} activeProject={activeProject}>
      <UGCClient briefs={briefs} stats={stats} ugcCards={ugcCards} />
    </PageShell>
  );
}
