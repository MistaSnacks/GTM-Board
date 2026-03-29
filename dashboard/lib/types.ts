export type Column = "backlog" | "preparing" | "live" | "measuring" | "done";
export type Channel = "meta" | "google" | "reddit" | "linkedin" | "seo" | "email" | "ugc" | "other";
export type CardType = "ad" | "post" | "outreach" | "seo" | "initiative" | "ugc";
export type StatusLevel = "active" | "critical" | "pending" | "stable";

export interface CardData {
  id: string;
  title: string;
  type: CardType;
  channel: Channel;
  column: Column;
  created: string;
  target_date?: string;
  description?: string;
  tags?: string[];
  source?: "research" | "manual";
  metrics?: Record<string, number | null>;
  paper_artboard?: string | null;
  body: string;
  // UGC-specific fields
  creator?: string;
  creator_handle?: string;
  deliverable_type?: string;
  approval_status?: "draft" | "submitted" | "approved" | "rejected";
  due_date?: string;
  asset_url?: string | null;
}

export interface BoardData {
  columns: Record<Column, CardData[]>;
}

export interface CadenceDay {
  day: string;
  type: string;
  done: boolean;
}

export interface CadenceData {
  linkedin: {
    posts: CadenceDay[];
    posts_done: number;
    posts_target: number;
    comments_done: number;
    comments_target: number;
  };
  reddit: {
    posts_done: number;
    posts_target: number;
    comments_done: number;
    comments_target: number;
  };
}

export interface ChannelMetricsData {
  channel: string;
  updated_at: string;
  metrics: Record<string, number | null>;
}

export interface MetricsData {
  channels: Record<string, ChannelMetricsData>;
}

export interface ProjectConfig {
  name: string;
  url?: string;
  description?: string;
  connectors: Record<string, { enabled: boolean; [key: string]: unknown }>;
  cadence: {
    linkedin: {
      posts_per_week: number;
      schedule: Record<string, string>;
      comments_per_week: { min: number; target: number };
    };
    reddit: {
      posts_per_week: { min: number; target: number };
      comments_per_week: { min: number; target: number };
      no_links_until?: string;
    };
  };
  targets: Record<string, Record<string, number>>;
  reference_docs?: string[];
  alerts?: Record<string, number>;
}

export interface KPIData {
  label: string;
  value: number;
  target: number;
  unit?: string;
  status: StatusLevel;
}

// --- New types for multi-page dashboard ---

export interface SnapshotSeries {
  channel: string;
  dates: string[];
  metrics: Record<string, number[]>;
}

export interface ResearchEntry {
  date: string;
  filename: string;
  content: string;
  findingsCount: number;
  cardsCreated: number;
}

export interface CardFilters {
  channel?: string | string[];
  type?: string | string[];
  source?: string;
  tags?: string[];
  excludeColumn?: string;
}

export interface FunnelData {
  stages: { name: string; value: number; conversionRate: number }[];
}

export interface WeeklyDelta {
  channel: string;
  metric: string;
  current: number;
  previous: number;
  delta: number;
  deltaPercent: number;
}

export interface Alert {
  channel: string;
  metric: string;
  value: number;
  threshold: number;
  direction: "above" | "below";
  severity: "critical" | "warning";
}

export interface CadenceWithStreak {
  cadence: CadenceData;
  streak: number;
  weeklyHistory: { week: string; met: boolean }[];
}

export interface ScheduledPost {
  platform: string;
  content: string;
  scheduledAt: string;
  status: string;
}

export interface UGCBrief {
  id: string;
  title: string;
  creator: string;
  type: "testimonial" | "tutorial" | "unboxing" | "reaction" | "custom";
  approvalStatus: "draft" | "submitted" | "approved" | "rejected";
  channel?: string;
  dueDate?: string;
  paperArtboard?: string;
  assetUrl?: string;
  column: string;
}

export interface UGCPipelineStats {
  draft: number;
  submitted: number;
  approved: number;
  rejected: number;
  total: number;
  byType: Record<string, number>;
  byCreator: Record<string, { total: number; approved: number }>;
}

export interface ContentPipelineStats {
  scheduled: number;
  preparing: number;
  liveThisWeek: number;
  doneThisMonth: number;
}
