export interface GeoConfig {
  target_domain: string;
  track_platforms: string[];
}

export interface AlertConfig {
  [key: string]: number;
}

export interface UgcCreator {
  name: string;
  handle: string;
  platforms: string[];
}

export interface UgcConfig {
  creators: UgcCreator[];
  default_deliverable_types: string[];
}

export interface BriefsConfig {
  auto_create_cards: boolean;
  retention_days: number;
}

export interface ProjectConfig {
  name: string;
  dataDir: string;
  envPath: string;
  connectors: Record<string, ConnectorConfig>;
  targets: Record<string, Record<string, number>>;
  cadence: CadenceConfig;
  reference_docs?: string[];
  geo?: GeoConfig;
  alerts?: AlertConfig;
  ugc?: UgcConfig;
  briefs?: BriefsConfig;
  env: Record<string, string>;
}

export interface ConnectorConfig {
  enabled: boolean;
  [key: string]: unknown;
}

export interface CadenceConfig {
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
}

export interface ChannelMetrics {
  channel: string;
  updated_at: string;
  metrics: Record<string, number | null>;
  raw?: unknown;
}

export interface Connector {
  name: string;
  enabled: boolean;
  refresh(project: ProjectConfig): Promise<ChannelMetrics>;
}

export interface CardFrontmatter {
  id: string;
  title: string;
  type: "ad" | "post" | "outreach" | "seo" | "initiative" | "ugc";
  channel: "meta" | "google" | "reddit" | "linkedin" | "seo" | "email" | "ugc" | "other";
  column: "backlog" | "preparing" | "live" | "measuring" | "done";
  created: string;
  target_date?: string;
  tags?: string[];
  source?: "research" | "manual";
  metrics?: Record<string, number | null>;
  paper_artboard?: string | null;
  creator?: string;
  creator_handle?: string;
  deliverable_type?: string;
  asset_url?: string | null;
  approval_status?: "draft" | "submitted" | "approved" | "rejected";
  due_date?: string;
  creative_formats?: string[];
  creative_status?: "draft" | "approved" | "distributed";
  copy?: string;
}
