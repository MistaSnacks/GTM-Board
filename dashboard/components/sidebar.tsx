"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  label: string;
  href: string;
  icon: string;
}

interface NavSection {
  label?: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { label: "Today", href: "/today", icon: "today" },
      { label: "Overview", href: "/", icon: "grid" },
    ],
  },
  {
    label: "CHANNELS",
    items: [
      { label: "SEO", href: "/seo", icon: "search" },
      { label: "Google Ads", href: "/google-ads", icon: "google" },
      { label: "Meta Ads", href: "/meta-ads", icon: "meta" },
      { label: "Socials", href: "/socials", icon: "people" },
      { label: "Backlinks", href: "/backlinks", icon: "link" },
    ],
  },
  {
    label: "CONTENT",
    items: [
      { label: "Content Queue", href: "/content", icon: "calendar" },
      { label: "UGC Pipeline", href: "/ugc", icon: "video" },
    ],
  },
  {
    label: "BUSINESS",
    items: [
      { label: "MRR / ARR", href: "/revenue", icon: "dollar" },
      { label: "Analytics", href: "/analytics", icon: "chart" },
    ],
  },
  {
    label: "OPERATIONS",
    items: [
      { label: "Kanban Board", href: "/kanban", icon: "columns" },
      { label: "Agent Tasks", href: "/agent-tasks", icon: "bot" },
      { label: "Research", href: "/research", icon: "lightbulb" },
    ],
  },
];

function SidebarIcon({ name }: { name: string }) {
  const props = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (name) {
    case "grid":
      return (
        <svg {...props}>
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      );
    case "today":
      return (
        <svg {...props}>
          <rect x="4" y="3" width="16" height="18" rx="2" />
          <path d="M8 9l1.5 1.5L12 8" />
          <path d="M14 9.5h3" />
          <path d="M8 15l1.5 1.5L12 14" />
          <path d="M14 15.5h3" />
        </svg>
      );
    case "search":
      return (
        <svg {...props}>
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
      );
    case "google":
      return (
        <svg {...props}>
          <path d="M12 11h8.5c.3 1.5.3 3 0 4.5H12V11z" />
          <path d="M20.5 11A8.5 8.5 0 1 0 12 20.5" />
        </svg>
      );
    case "meta":
      return (
        <svg {...props}>
          <path d="M6 12c0-4 1.5-8 3.5-8S13 8 13 12s3 8 5 8 3.5-4 3.5-8" />
          <path d="M2.5 12c0 4 1.5 8 3.5 8s3.5-4 3.5-8" />
        </svg>
      );
    case "people":
      return (
        <svg {...props}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "link":
      return (
        <svg {...props}>
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...props}>
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4" />
          <path d="M8 2v4" />
          <path d="M3 10h18" />
        </svg>
      );
    case "video":
      return (
        <svg {...props}>
          <path d="M15 10l4.553-2.276A1 1 0 0 1 21 8.618v6.764a1 1 0 0 1-1.447.894L15 14" />
          <rect x="3" y="6" width="12" height="12" rx="2" />
        </svg>
      );
    case "dollar":
      return (
        <svg {...props}>
          <path d="M12 2v20" />
          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
      );
    case "chart":
      return (
        <svg {...props}>
          <path d="M3 3v18h18" />
          <path d="M7 16l4-8 4 4 4-8" />
        </svg>
      );
    case "columns":
      return (
        <svg {...props}>
          <rect x="3" y="3" width="5" height="18" rx="1" />
          <rect x="10" y="3" width="5" height="18" rx="1" />
          <rect x="17" y="3" width="5" height="12" rx="1" />
        </svg>
      );
    case "bot":
      return (
        <svg {...props}>
          <rect x="3" y="11" width="18" height="10" rx="2" />
          <circle cx="9" cy="16" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="15" cy="16" r="1.5" fill="currentColor" stroke="none" />
          <path d="M12 2v4" />
          <path d="M8 7h8" />
          <circle cx="12" cy="2" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case "lightbulb":
      return (
        <svg {...props}>
          <path d="M9 18h6" />
          <path d="M10 22h4" />
          <path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z" />
        </svg>
      );
    default:
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="4" />
        </svg>
      );
  }
}

interface SidebarProps {
  projects: string[];
  activeProject: string; // raw slug, e.g. "tailor"
  lastRefresh?: Date | null;
  isRefreshing?: boolean;
  onRefresh?: () => void;
  onProjectChange?: (project: string) => void;
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  if (diffSeconds < 60) return `${diffSeconds}s ago`;
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export default function Sidebar({
  projects,
  activeProject,
  lastRefresh,
  isRefreshing,
  onRefresh,
  onProjectChange,
}: SidebarProps) {
  const pathname = usePathname();

  return (
    <nav className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="wordmark">
          <span>GTM</span>
          <span className="wordmark-accent">board</span>
        </div>
      </div>

      {/* Nav sections */}
      <div className="sidebar-nav" style={{ flex: 1, overflowY: "auto", paddingBottom: "12px" }}>
        {NAV_SECTIONS.map((section, sIdx) => (
          <div key={sIdx}>
            {section.label && (
              <div className="sidebar-section-label">{section.label}</div>
            )}
            {section.items.map((item) => {
              const isActive =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`sidebar-item${isActive ? " active" : ""}`}
                  style={{ textDecoration: "none" }}
                >
                  <SidebarIcon name={item.icon} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </div>

      {/* Footer: project switcher + refresh */}
      <div
        className="sidebar-footer"
        style={{
          padding: "14px 16px 16px",
          display: "flex",
          flexDirection: "column",
          gap: "10px",
        }}
      >
        {/* Project switcher */}
        <select
          value={activeProject}
          onChange={(e) => onProjectChange?.(e.target.value)}
          className="pill pill-denim"
          style={{ width: "100%", "--pill-h": "36px" }}
        >
          {projects.map((project) => (
            <option key={project} value={project}>
              {project.toUpperCase()}
            </option>
          ))}
        </select>

        {/* Refresh row */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="pill pill-tan"
            style={{ flex: 1, "--pill-h": "30px", fontSize: "11px", letterSpacing: "0.04em" }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                animation: isRefreshing ? "spin 1s linear infinite" : "none",
              }}
            >
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
              <path d="M21 21v-5h-5" />
            </svg>
            {isRefreshing ? "..." : "REFRESH"}
          </button>
          <span
            style={{
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              backgroundColor: "var(--mint)",
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "11px",
              color: "var(--text-muted)",
              whiteSpace: "nowrap",
            }}
          >
            {lastRefresh ? formatRelativeTime(lastRefresh) : "n/a"}
          </span>
        </div>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </nav>
  );
}
