import { getProjects, getConfig, getActiveProject } from "@/lib/config";
import { getBoard } from "@/lib/data";
import PageShell from "@/components/page-shell";
import KanbanClient from "./kanban-client";

export const dynamic = "force-dynamic";

export default async function KanbanPage() {
  const projects = getProjects();
  const activeProject = await getActiveProject();
  const config = getConfig(activeProject);
  const board = getBoard(activeProject);

  return (
    <PageShell projects={projects} activeProject={activeProject}>
      <KanbanClient board={board} project={activeProject} />
    </PageShell>
  );
}
