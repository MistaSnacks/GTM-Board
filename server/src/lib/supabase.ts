import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";

const GTM_HOME = process.env.GTM_HOME || "/Users/admin/gtm-board";

// Load shared .env for GTM Board Supabase credentials
const sharedEnv = path.join(GTM_HOME, ".env");
if (fs.existsSync(sharedEnv)) {
  const parsed = dotenv.parse(fs.readFileSync(sharedEnv));
  // Only set if not already in environment
  for (const [key, value] of Object.entries(parsed)) {
    if (!process.env[key]) process.env[key] = value;
  }
}

const supabaseUrl = process.env.GTM_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.GTM_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "Missing Supabase credentials. Set GTM_SUPABASE_URL and GTM_SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY) in .env"
  );
}

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey);

/**
 * Resolve a project slug to its UUID from gtm_projects.
 */
export async function getProjectId(slug: string): Promise<string> {
  const { data, error } = await supabase
    .from("gtm_projects")
    .select("id")
    .eq("slug", slug)
    .single();

  if (error || !data) {
    throw new Error(`Project not found: ${slug}`);
  }
  return data.id;
}
