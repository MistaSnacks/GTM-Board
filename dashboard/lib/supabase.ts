import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.GTM_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.GTM_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "Missing Supabase credentials. Set GTM_SUPABASE_URL/SUPABASE_URL and GTM_SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SERVICE_ROLE_KEY in environment."
  );
}

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey);
