import { getProjects, getActiveProject } from "@/lib/config";
import { getAgentBoard } from "@/lib/data";
import PageShell from "@/components/page-shell";
import AgentTasksClient from "./agent-tasks-client";

export const dynamic = "force-dynamic";

export default async function AgentTasksPage() {
  const projects = await getProjects();
  const activeProject = await getActiveProject();
  const board = await getAgentBoard(activeProject);

  return (
    <PageShell projects={projects} activeProject={activeProject}>
      <AgentTasksClient board={board} project={activeProject} />
    </PageShell>
  );
}
