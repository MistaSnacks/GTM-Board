"use client";

interface HeaderProps {
  projects: string[];
  activeProject: string;
  lastRefresh?: Date;
  isRefreshing?: boolean;
  onRefresh?: () => void;
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

export default function Header({ projects, activeProject, lastRefresh, isRefreshing, onRefresh }: HeaderProps) {
  return (
    <header
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingInline: "24px",
        paddingBlock: "16px",
      }}
    >
      {/* Logo */}
      <div
        style={{
          fontFamily: "var(--font-outfit)",
          fontWeight: 700,
          fontSize: "28px",
          letterSpacing: "-0.02em",
          userSelect: "none",
        }}
      >
        <span style={{ color: "#ffffff" }}>GTM</span>
        <span style={{ color: "var(--mint)" }}>BOARD</span>
      </div>

      {/* Project switcher */}
      <select
        defaultValue={activeProject}
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "13px",
          color: "var(--mint)",
          backgroundColor: "var(--bg-card)",
          border: "1px solid var(--mint)",
          borderRadius: "8px",
          padding: "6px 12px",
          boxShadow: "0 0 8px color-mix(in srgb, var(--mint) 25%, transparent)",
          outline: "none",
          cursor: "pointer",
          textTransform: "uppercase",
          appearance: "none",
          WebkitAppearance: "none",
          paddingRight: "28px",
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath d='M3 5l3 3 3-3' stroke='%2300e5a0' fill='none' stroke-width='1.5'/%3E%3C/svg%3E")`,
          backgroundRepeat: "no-repeat",
          backgroundPosition: "right 8px center",
        }}
      >
        {projects.map((project) => (
          <option key={project} value={project}>
            {project.toUpperCase()}
          </option>
        ))}
      </select>

      {/* Status + refresh */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
        }}
      >
        {/* Refresh button */}
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          style={{
            background: "none",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            padding: "6px 10px",
            cursor: isRefreshing ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            color: isRefreshing ? "var(--text-muted)" : "var(--mint)",
            fontFamily: "var(--font-mono)",
            fontSize: "12px",
            transition: "border-color 0.2s, color 0.2s",
          }}
          title="Refresh all connectors"
        >
          <svg
            width="14"
            height="14"
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
          {isRefreshing ? "REFRESHING" : "REFRESH"}
        </button>

        {/* Status dot + last refresh time */}
        <span
          style={{
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            backgroundColor: "var(--mint)",
            boxShadow: "0 0 6px var(--mint), 0 0 12px color-mix(in srgb, var(--mint) 40%, transparent)",
            animation: "pulse-dot 2s ease-in-out infinite",
          }}
        />
        <span
          style={{
            fontFamily: "var(--font-inter)",
            fontSize: "13px",
            color: "var(--text-muted)",
          }}
        >
          {lastRefresh ? formatRelativeTime(lastRefresh) : "n/a"}
        </span>

        <style>{`
          @keyframes pulse-dot {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.6; transform: scale(1.3); }
          }
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </header>
  );
}
