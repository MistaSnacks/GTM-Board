import { getProjects, getConfig, getActiveProject } from "@/lib/config";
import { getBoard } from "@/lib/data";
import PageShell from "@/components/page-shell";
import KanbanClient from "./kanban-client";

export const dynamic = "force-dynamic";

export default async function KanbanPage() {
  const projects = await getProjects();
  const activeProject = await getActiveProject();
  const config = await getConfig(activeProject);
  const board = await getBoard(activeProject);

  return (
    <PageShell projects={projects} activeProject={activeProject}>
      <KanbanClient board={board} project={activeProject} />
    </PageShell>
  );
}
