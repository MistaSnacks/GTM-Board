"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/sidebar";
import { switchProjectAction } from "@/app/actions";

interface PageShellProps {
  projects: string[];
  activeProject: string;
  children: React.ReactNode;
}

const REFRESH_INTERVAL_MS = 15 * 60 * 1000;
const FILE_POLL_INTERVAL_MS = 30 * 1000;

export default function PageShell({ projects, activeProject, children }: PageShellProps) {
  const router = useRouter();
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshInFlight = useRef(false);

  const doRefresh = useCallback(async () => {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    setIsRefreshing(true);
    try {
      await fetch("/api/refresh", { method: "POST" });
      setLastRefresh(new Date());
      router.refresh();
    } catch {
      // silent
    } finally {
      setIsRefreshing(false);
      refreshInFlight.current = false;
    }
  }, [router]);

  useEffect(() => {
    doRefresh();
    const interval = setInterval(doRefresh, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [doRefresh]);

  useEffect(() => {
    const interval = setInterval(() => router.refresh(), FILE_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [router]);

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar
        projects={projects}
        activeProject={activeProject}
        lastRefresh={lastRefresh}
        isRefreshing={isRefreshing}
        onRefresh={doRefresh}
        onProjectChange={async (project) => {
          await switchProjectAction(project);
          router.refresh();
        }}
      />
      <div className="main-content">{children}</div>
    </div>
  );
}
