"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/sidebar";
import KPIGauges from "@/components/kpi-gauges";
import KanbanBoard from "@/components/kanban-board";
import ChannelCards from "@/components/channel-cards";
import CadenceTracker from "@/components/cadence-tracker";
import { moveCardAction, switchProjectAction } from "./actions";
import type {
  BoardData,
  KPIData,
  CadenceData,
  ChannelMetricsData,
  Column,
} from "@/lib/types";
import Link from "next/link";

const REFRESH_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const FILE_POLL_INTERVAL_MS = 30 * 1000; // 30 seconds

interface DashboardClientProps {
  projects: string[];
  activeProject: string;
  projectName: string;
  board: BoardData;
  kpis: KPIData[];
  cadence: CadenceData;
  channels: Record<string, ChannelMetricsData>;
  sparklines: Record<string, Record<string, number[]>>;
}

const CHANNEL_LINKS: Record<string, string> = {
  reddit: "/socials",
  linkedin: "/socials",
  "search-console": "/seo",
  google_ads: "/google-ads",
  meta_ads: "/meta-ads",
};

export function DashboardClient({
  projects,
  activeProject,
  projectName,
  board,
  kpis,
  cadence,
  channels,
  sparklines,
}: DashboardClientProps) {
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
      // Silently fail — next poll will pick up data
    } finally {
      setIsRefreshing(false);
      refreshInFlight.current = false;
    }
  }, [router]);

  // Refresh connectors on mount + every 15 minutes
  useEffect(() => {
    doRefresh();
    const interval = setInterval(doRefresh, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [doRefresh]);

  // Re-read files every 30 seconds (picks up changes from MCP agent too)
  useEffect(() => {
    const interval = setInterval(() => {
      router.refresh();
    }, FILE_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [router]);

  const handleMoveCard = useCallback(
    (cardId: string, fromColumn: Column, toColumn: Column) => {
      moveCardAction(activeProject, cardId, fromColumn, toColumn);
    },
    [activeProject]
  );

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
      <div className="main-content">
        {/* Page header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "24px",
          }}
        >
          <h1
            style={{
              fontFamily: "var(--font-outfit)",
              fontWeight: 700,
              fontSize: "24px",
              letterSpacing: "-0.02em",
              color: "var(--text-primary)",
              margin: 0,
            }}
          >
            Overview
          </h1>
        </div>

        <KPIGauges kpis={kpis} />

        {/* Cadence tracker inline with KPIs context */}
        <div className="mt-4 flex items-center gap-4 px-2">
          <span
            className="text-xs uppercase tracking-widest"
            style={{
              fontFamily: "var(--font-mono)",
              color: "var(--text-muted)",
            }}
          >
            This week
          </span>
          <CadenceTracker
            linkedinPosts={cadence.linkedin.posts}
            linkedinPostsDone={cadence.linkedin.posts_done}
            linkedinPostsTarget={cadence.linkedin.posts_target}
            linkedinCommentsDone={cadence.linkedin.comments_done}
            linkedinCommentsTarget={cadence.linkedin.comments_target}
            redditCommentsDone={cadence.reddit.comments_done}
            redditCommentsTarget={cadence.reddit.comments_target}
          />
        </div>

        <div style={{ marginTop: "24px" }}>
          <ChannelCards
            channels={channels}
            sparklines={sparklines}
            channelLinks={CHANNEL_LINKS}
          />
        </div>

        {/* Compact board summary — link to full kanban */}
        <div style={{ marginTop: "24px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "12px",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "11px",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "var(--text-muted)",
              }}
            >
              Kanban Board
            </span>
            <Link
              href="/kanban"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "11px",
                color: "var(--mint)",
                textDecoration: "none",
              }}
            >
              VIEW FULL BOARD &rarr;
            </Link>
          </div>
          <KanbanBoard
            board={board}
            project={activeProject}
            onMoveCard={handleMoveCard}
          />
        </div>
      </div>
    </div>
  );
}
